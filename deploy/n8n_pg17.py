"""n8n veritabanını Postgres 16'dan 17'ye taşır (GitHub Actions → "n8n Postgres 17").

migrate : Hostinger'daki 'n8n' projesine yeni bir Postgres 17 servisi (db17, birim n8n_pg17) ve tek seferlik
          'pgmove' servisi ekler. pgmove eski veritabanının (db, Postgres 16) dökümünü alıp db17'ye yükler ve
          işaret tablosu bırakır; n8n yalnız taşıma başarıyla bitince db17 ile açılır.
          Eski veritabanı ve birimi (n8n_pg) olduğu gibi kalır.
rollback: n8n'i yeniden eski veritabanına (db) bağlar; db17 ve pgmove kaldırılır, birimleri silinmez.
tidy    : işini bitirmiş pgmove servisini kaldırır (n8n yalnız db17'ye bağlı kalır). Geri dönüş yolu açık kalır.
finalize: eski veritabanı servisini (db) ve pgmove'u kaldırır. Eski birim (n8n_pg) silinmez; gerekirse elle geri eklenebilir.

Ortam değişkenleri (gizli değerler) okunduğu gibi geri gönderilir; loga yazılmaz. Ortam: HOSTINGER_API_TOKEN, MODE.
"""
import json, os, re, sys, urllib.error, urllib.request

VM = os.environ.get('VPS_ID', '1249062')
HAPI = 'https://developers.hostinger.com/api/vps/v1'

DB17 = '''  db17:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${N8N_DB_PASSWORD}
    volumes:
      - n8n_pg17:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 10s
      timeout: 5s
      retries: 10
  pgmove:
    image: postgres:17-alpine
    restart: "no"
    environment:
      PGPASSWORD: ${N8N_DB_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
      db17:
        condition: service_healthy
    entrypoint: ["sh", "-c"]
    command:
      - |
        set -e
        if psql -h db17 -U n8n -d n8n -tAc "SELECT 1 FROM pg_tables WHERE tablename='arvela_pg17_moved'" | grep -q 1; then
          echo "Postgres 17: veri zaten taşınmış"; exit 0
        fi
        echo "Postgres 17: veri taşınıyor"
        psql -h db17 -U n8n -d n8n -q -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
        pg_dump -h db -U n8n -d n8n --no-owner --no-privileges -f /tmp/n8n.sql
        psql -h db17 -U n8n -d n8n -v ON_ERROR_STOP=1 -q -f /tmp/n8n.sql
        psql -h db17 -U n8n -d n8n -q -c "CREATE TABLE arvela_pg17_moved (at timestamptz DEFAULT now()); INSERT INTO arvela_pg17_moved DEFAULT VALUES;"
        echo "Postgres 17: taşındı, akış sayısı $$(psql -h db17 -U n8n -d n8n -tAc 'SELECT count(*) FROM workflow_entity')"
'''


def hostinger(method, path, body=None):
    req = urllib.request.Request(HAPI + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Authorization': 'Bearer ' + os.environ['HOSTINGER_API_TOKEN'], 'Accept': 'application/json',
                                          'Content-Type': 'application/json', 'User-Agent': 'arvela-os-n8n-pg17/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} → HTTP {e.code}: {e.read().decode("utf-8", "replace")[:600]}')


def strip_services(compose):
    return re.sub(r'(?m)^  (?:db17|pgmove):\n(?:    .*\n|      .*\n|        .*\n|\n)*?(?=  [a-z0-9_-]+:\n|volumes:\n)', '', compose)


def n8n_depends(compose, block):
    out, n = re.subn(r'(?m)(^  n8n:\n(?:    .*\n|      .*\n|        .*\n|\n)*?)    depends_on:\n(?:      .*\n|        .*\n)*', lambda m: m.group(1) + block, compose, count=1)
    if n != 1:
        sys.exit('n8n servisinde depends_on bulunamadı')
    return out


def migrate(compose):
    compose = strip_services(compose)
    compose = re.sub(r'(?m)^  n8n:\n', lambda m: DB17 + '  n8n:\n', compose, count=1)
    compose = n8n_depends(compose, '    depends_on:\n      db17:\n        condition: service_healthy\n      pgmove:\n        condition: service_completed_successfully\n')
    compose, n = re.subn(r'      DB_POSTGRESDB_HOST: db\n', '      DB_POSTGRESDB_HOST: db17\n', compose)
    if n != 1 and 'DB_POSTGRESDB_HOST: db17\n' not in compose:
        sys.exit('DB_POSTGRESDB_HOST bulunamadı')
    if '  n8n_pg17:\n' not in compose:
        compose = compose.replace('volumes:\n  n8n_pg:\n', 'volumes:\n  n8n_pg:\n  n8n_pg17:\n', 1)
    # kullanım dışı ayar: N8N_WEBHOOK_URL varken WEBHOOK_URL gereksiz
    if '      N8N_WEBHOOK_URL:' in compose:
        compose = compose.replace('      WEBHOOK_URL: https://n8n.arveladigital.com/\n', '')
    return compose


def drop(compose, names):
    return re.sub(r'(?m)^  (?:' + '|'.join(names) + r'):\n(?:    .*\n|      .*\n|        .*\n|\n)*?(?=  [a-z0-9_-]+:\n|volumes:\n)', '', compose)


def tidy(compose):
    if 'DB_POSTGRESDB_HOST: db17\n' not in compose:
        sys.exit('n8n henüz db17 kullanmıyor; temizlik yapılmadı')
    compose = drop(compose, ['pgmove'])
    return n8n_depends(compose, '    depends_on:\n      db17:\n        condition: service_healthy\n')


def finalize(compose):
    return drop(tidy(compose), ['db'])


def rollback(compose):
    compose = strip_services(compose)
    compose = n8n_depends(compose, '    depends_on:\n      db:\n        condition: service_healthy\n')
    compose = compose.replace('      DB_POSTGRESDB_HOST: db17\n', '      DB_POSTGRESDB_HOST: db\n')
    if '  n8n_pg17:\n' not in compose:
        compose = compose.replace('volumes:\n  n8n_pg:\n', 'volumes:\n  n8n_pg:\n  n8n_pg17:\n', 1)
    return compose


def check(compose):
    for svc in re.findall(r'^  ([a-z0-9_-]+):\n', compose.split('\nvolumes:\n')[0], re.M):
        if compose.count(f'\n  {svc}:\n') > 1:
            sys.exit('yinelenen servis: ' + svc)
    if len(compose) > 8192:
        sys.exit(f'compose çok uzun ({len(compose)})')


def main():
    mode = os.environ.get('MODE', 'migrate')
    if mode not in ('migrate', 'rollback', 'tidy', 'finalize'):
        sys.exit('MODE migrate, rollback, tidy ya da finalize olmalı')
    proj = hostinger('GET', f'/virtual-machines/{VM}/docker/n8n')
    compose, env = proj['content'], proj.get('environment') or ''
    if 'N8N_ENCRYPTION_KEY=' not in env or 'N8N_DB_PASSWORD=' not in env:
        sys.exit('n8n ortamı okunamadı; değişiklik yapılmadı')
    new = {'migrate': migrate, 'rollback': rollback, 'tidy': tidy, 'finalize': finalize}[mode](compose)
    check(new)
    if new == compose:
        print('Değişiklik yok'); return
    hostinger('POST', f'/virtual-machines/{VM}/docker', {'project_name': 'n8n', 'content': new, 'environment': env})
    print('n8n yeniden kuruluyor:', {'migrate': 'Postgres 17 (db17), eski veritabanı korunuyor', 'rollback': 'eski veritabanı (db)', 'tidy': 'pgmove kaldırıldı', 'finalize': 'eski veritabanı servisi kaldırıldı, birimi duruyor'}[mode])


if __name__ == '__main__':
    main()
