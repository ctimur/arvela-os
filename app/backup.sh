#!/bin/sh
# Arvela OS — günlük şifreli veritabanı yedeği ve haftalık geri yükleme testi.
# Çalıştığı yer: arvela-os projesindeki "backup" servisi (postgres:16-alpine). Kaynak, uygulamanın kalıcı biriminden okunur.
# Akış: pg_dump (özel biçim) → openssl AES-256-CBC + PBKDF2 (BACKUP_PASSPHRASE) → özel GitHub deposuna sürüm eki → 30 günden eskiler silinir.
# Geri yükleme testi: son yedek indirilir, çözülür, geçici bir PostgreSQL'e yüklenir ve tablo/satır sayıları canlıyla karşılaştırılır.
# Sonuçlar canlı veritabanındaki ops_events tablosuna yazılır (Ayarlar → Yedek ve izleme). Gizli değerler ekrana yazılmaz.
set -u
REPO="${BACKUP_REPO:-ctimur/arvela-os-yedek}"
[ -n "$REPO" ] || REPO=ctimur/arvela-os-yedek
API=https://api.github.com
KEEP_DAYS=30
RUN_AT=84600 # UTC 23:30 = İstanbul 02:30 (gün içindeki saniye)
export PGPASSWORD="${DB_PASSWORD:-}"
log() { echo "$(date -u +%FT%TZ) $*"; }
psqlp() { psql -h db -U arvela -d arvela -v ON_ERROR_STOP=1 -Atq "$@"; }
event() { # tür, true/false, ayrıntı
  d=$(printf '%s' "$3" | tr -d '\000' | sed "s/'/''/g" | cut -c1-900)
  psqlp -c "INSERT INTO ops_events (kind, ok, detail) VALUES ('$1', $2, '$d')" >/dev/null 2>&1 || log "olay yazılamadı: $1"
  log "$1 $2 $d"
}
gh() { curl -sS -f -H "Authorization: Bearer $BACKUP_GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }

apk add --no-cache curl openssl jq >/dev/null 2>&1 || log "paketler kurulamadı"

ready() {
  if [ -z "${BACKUP_PASSPHRASE:-}" ] || [ -z "${BACKUP_GITHUB_TOKEN:-}" ]; then
    event yedek false "Yedek ayarları eksik: GitHub'da BACKUP_PASSPHRASE ve BACKUP_GITHUB_TOKEN gizli değerleri tanımlanmalı, sonra yeniden yayınlanmalı."
    return 1
  fi
  if ! gh "$API/repos/$REPO" -o /dev/null; then
    event yedek false "Yedek deposuna erişilemedi ($REPO): depo yok ya da anahtarın bu depoya yazma izni yok."
    return 1
  fi
  [ "$(gh "$API/repos/$REPO" | jq -r .private)" = "true" ] || { event yedek false "Yedek deposu ($REPO) herkese açık; yedek gönderilmedi. Depoyu özel yapın."; return 1; }
  return 0
}

backup_once() {
  tag="yedek-$(date -u +%Y%m%d-%H%M)"; f=/tmp/arvela.dump
  rm -f "$f" "$f.enc"
  pg_dump -h db -U arvela -d arvela -Fc -Z 6 -f "$f" 2>/tmp/err || { event yedek false "pg_dump başarısız: $(head -c 300 /tmp/err)"; return 1; }
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$f" -out "$f.enc" -pass env:BACKUP_PASSPHRASE || { event yedek false "Şifreleme başarısız"; rm -f "$f"; return 1; }
  rm -f "$f"
  sha=$(sha256sum "$f.enc" | cut -d' ' -f1); size=$(stat -c %s "$f.enc")
  body=$(jq -n --arg t "$tag" --arg b "Arvela OS veritabanı yedeği (AES-256-CBC, PBKDF2 200000). sha256: $sha" '{tag_name:$t,name:$t,body:$b,prerelease:true}')
  id=$(gh -X POST "$API/repos/$REPO/releases" -d "$body" | jq -r .id) || id=
  [ -n "$id" ] && [ "$id" != null ] || { event yedek false "GitHub sürümü oluşturulamadı ($REPO)"; rm -f "$f.enc"; return 1; }
  gh -X POST -H "Content-Type: application/octet-stream" --data-binary @"$f.enc" "https://uploads.github.com/repos/$REPO/releases/$id/assets?name=arvela.dump.enc" -o /dev/null \
    || { event yedek false "Yedek dosyası yüklenemedi ($tag)"; rm -f "$f.enc"; return 1; }
  rm -f "$f.enc"
  event yedek true "$tag · $((size / 1024)) KB · sha256 $sha"
  prune
}

prune() { # 30 günden eski yedekleri (sürüm + etiket) siler
  cutoff=$(( $(date -u +%s) - KEEP_DAYS * 86400 )); n=0
  gh "$API/repos/$REPO/releases?per_page=100" | jq -r --argjson c "$cutoff" '.[] | select(.tag_name|startswith("yedek-")) | select((.created_at|fromdateiso8601) < $c) | "\(.id) \(.tag_name)"' |
  while read -r rid rtag; do
    gh -X DELETE "$API/repos/$REPO/releases/$rid" -o /dev/null && gh -X DELETE "$API/repos/$REPO/git/refs/tags/$rtag" -o /dev/null; n=$((n + 1))
  done
}

restore_test() {
  rel=$(gh "$API/repos/$REPO/releases?per_page=20" | jq -c '[.[] | select(.tag_name|startswith("yedek-"))][0]')
  url=$(echo "$rel" | jq -r '.assets[0].url // empty'); tag=$(echo "$rel" | jq -r '.tag_name // empty')
  [ -n "$url" ] || { event geri_yukleme false "Test edilecek yedek bulunamadı"; return 1; }
  rm -rf /tmp/r /tmp/pgt && mkdir -p /tmp/r
  curl -sS -f -L -H "Authorization: Bearer $BACKUP_GITHUB_TOKEN" -H "Accept: application/octet-stream" "$url" -o /tmp/r/a.enc || { event geri_yukleme false "$tag indirilemedi"; return 1; }
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in /tmp/r/a.enc -out /tmp/r/a.dump -pass env:BACKUP_PASSPHRASE || { event geri_yukleme false "$tag çözülemedi (parola farklı olabilir)"; rm -rf /tmp/r; return 1; }
  mkdir -p /tmp/pgt && chown postgres /tmp/pgt /tmp/r
  su postgres -c "initdb -D /tmp/pgt -A trust -U arvela >/dev/null && pg_ctl -D /tmp/pgt -o '-p 5433 -k /tmp -c listen_addresses=' -w -l /tmp/pgt.log start >/dev/null" || { event geri_yukleme false "Geçici PostgreSQL açılamadı"; return 1; }
  ok=true; why=""
  PGPASSWORD= createdb -h /tmp -p 5433 -U arvela arvela_test && PGPASSWORD= pg_restore -h /tmp -p 5433 -U arvela -d arvela_test --no-owner --no-privileges /tmp/r/a.dump 2>/tmp/err || { ok=false; why="pg_restore: $(head -c 200 /tmp/err)"; }
  tq="SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
  t1=$(PGPASSWORD= psql -h /tmp -p 5433 -U arvela -d arvela_test -Atc "$tq" 2>/dev/null); t0=$(psqlp -c "$tq" 2>/dev/null)
  u1=$(PGPASSWORD= psql -h /tmp -p 5433 -U arvela -d arvela_test -Atc "SELECT count(*) FROM users" 2>/dev/null); c1=$(PGPASSWORD= psql -h /tmp -p 5433 -U arvela -d arvela_test -Atc "SELECT count(*) FROM clients" 2>/dev/null)
  [ -n "$u1" ] && [ "${u1:-0}" -gt 0 ] || { ok=false; why="$why kullanıcı tablosu boş ya da yok"; }
  [ "$ok" = true ] && [ "${t1:-0}" -lt "${t0:-0}" ] && { ok=false; why="tablo sayısı eksik ($t1/$t0)"; }
  su postgres -c "pg_ctl -D /tmp/pgt -m fast stop >/dev/null" ; rm -rf /tmp/pgt /tmp/r
  if [ "$ok" = true ]; then event geri_yukleme true "$tag geri yüklendi: $t1 tablo, $u1 kullanıcı, $c1 müşteri"; else event geri_yukleme false "$tag: $why"; fi
}

since() { psqlp -c "SELECT COALESCE(EXTRACT(EPOCH FROM now() - max(at))::int, 999999999) FROM ops_events WHERE kind='$1' AND ok" 2>/dev/null || echo 999999999; }

log "yedek servisi başladı · depo $REPO"
while true; do
  if ready; then
    [ "$(since yedek)" -gt 72000 ] && backup_once           # son başarılı yedek 20 saatten eskiyse
    [ "$(since geri_yukleme)" -gt 600000 ] && restore_test  # haftada bir (≈7 gün)
    now=$(( $(date -u +%s) % 86400 )); wait=$(( (RUN_AT - now + 86400) % 86400 )); [ "$wait" -lt 600 ] && wait=$((wait + 86400))
  else
    wait=21600 # ayarlar eksikse 6 saatte bir yeniden dener
  fi
  log "sonraki deneme $((wait / 60)) dk sonra"; sleep "$wait"
done
