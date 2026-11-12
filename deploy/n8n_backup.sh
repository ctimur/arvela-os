#!/bin/sh
# n8n veritabanı yedeği — Hostinger'daki 'n8n' projesinin "n8nyedek" servisinde çalışır (postgres:17-alpine).
# Her gece 02:45 (İstanbul): pg_dump (db17) → openssl AES-256-CBC + PBKDF2 → özel yedek deposuna "n8n-" sürümü → 30 günden eskiler silinir.
# Yedek alındıktan sonra çözülüp pg_restore --list ile arşivin okunabildiği denenir. Arvela OS sonucu GitHub'dan okur (Ayarlar → Yedek ve izleme).
# Gerekli ortam: PGPASSWORD (n8n veritabanı), BACKUP_PASSPHRASE, BACKUP_GITHUB_TOKEN, BACKUP_REPO. Gizli değerler ekrana yazılmaz.
set -u
REPO="${BACKUP_REPO:-}"; [ -n "$REPO" ] || REPO=ctimur/arvela-os-yedek
API=https://api.github.com; KEEP_DAYS=30; RUN_AT=85500 # UTC 23:45 = İstanbul 02:45
DBH="${N8N_DB_HOST:-db17}"
log() { echo "$(date -u +%FT%TZ) $*"; }
gh() { curl -sS -f -H "Authorization: Bearer $BACKUP_GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }
apk add --no-cache curl openssl jq >/dev/null 2>&1 || log "paketler kurulamadı"

ready() {
  [ -n "${BACKUP_PASSPHRASE:-}" ] && [ -n "${BACKUP_GITHUB_TOKEN:-}" ] || { log "yedek ayarları eksik"; return 1; }
  [ "$(gh "$API/repos/$REPO" | jq -r .private)" = "true" ] || { log "yedek deposu yok, erişilemiyor ya da herkese açık: gönderilmedi"; return 1; }
}
last_age() { # son n8n yedeğinin yaşı (sn); yoksa çok büyük
  t=$(gh "$API/repos/$REPO/releases?per_page=50" | jq -r '[.[] | select(.tag_name|startswith("n8n-"))][0] | (.published_at // .created_at) // empty')
  [ -n "$t" ] && echo $(( $(date -u +%s) - $(date -u -d "$(echo "$t" | sed 's/T/ /; s/Z//')" +%s 2>/dev/null || echo 0) )) || echo 999999999
}
backup_once() {
  tag="n8n-$(date -u +%Y%m%d-%H%M)"; f=/tmp/n8n.dump; rm -f "$f" "$f.enc" /tmp/chk.dump
  pg_dump -h "$DBH" -U n8n -d n8n -Fc -Z 6 -f "$f" 2>/tmp/err || { log "pg_dump başarısız: $(head -c 300 /tmp/err)"; return 1; }
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$f" -out "$f.enc" -pass env:BACKUP_PASSPHRASE || { log "şifreleme başarısız"; return 1; }
  rm -f "$f"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$f.enc" -out /tmp/chk.dump -pass env:BACKUP_PASSPHRASE && pg_restore --list /tmp/chk.dump >/dev/null 2>&1 || { log "denetim başarısız: arşiv okunamadı"; rm -f /tmp/chk.dump "$f.enc"; return 1; }
  wf=$(pg_restore --list /tmp/chk.dump 2>/dev/null | grep -c 'TABLE DATA'); rm -f /tmp/chk.dump
  sha=$(sha256sum "$f.enc" | cut -d' ' -f1); size=$(stat -c %s "$f.enc")
  body=$(jq -n --arg t "$tag" --arg b "n8n veritabanı yedeği (AES-256-CBC, PBKDF2 200000). sha256: $sha · $wf tablo verisi" '{tag_name:$t,name:$t,body:$b,prerelease:true}')
  id=$(gh -X POST "$API/repos/$REPO/releases" -d "$body" | jq -r .id) || id=
  [ -n "$id" ] && [ "$id" != null ] || { log "GitHub sürümü oluşturulamadı"; rm -f "$f.enc"; return 1; }
  gh -X POST -H "Content-Type: application/octet-stream" --data-binary @"$f.enc" "https://uploads.github.com/repos/$REPO/releases/$id/assets?name=n8n.dump.enc" -o /dev/null || { log "dosya yüklenemedi"; rm -f "$f.enc"; return 1; }
  rm -f "$f.enc"; log "n8n yedeği tamam: $tag · $((size / 1024)) KB"
  cutoff=$(( $(date -u +%s) - KEEP_DAYS * 86400 ))
  gh "$API/repos/$REPO/releases?per_page=100" | jq -r --argjson c "$cutoff" '.[] | select(.tag_name|startswith("n8n-")) | select(((.published_at // .created_at)|fromdateiso8601) < $c) | "\(.id) \(.tag_name)"' |
  while read -r rid rtag; do gh -X DELETE "$API/repos/$REPO/releases/$rid" -o /dev/null && gh -X DELETE "$API/repos/$REPO/git/refs/tags/$rtag" -o /dev/null; done
}

log "n8n yedek servisi başladı · depo $REPO"
while true; do
  if ready; then
    [ "$(last_age)" -gt 72000 ] && backup_once
    now=$(( $(date -u +%s) % 86400 )); wait=$(( (RUN_AT - now + 86400) % 86400 )); [ "$wait" -lt 600 ] && wait=$((wait + 86400))
  else wait=21600; fi
  log "sonraki deneme $((wait / 60)) dk sonra"; sleep "$wait"
done
