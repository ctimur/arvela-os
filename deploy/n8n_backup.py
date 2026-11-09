"""n8n veritabanı yedeğini kurar ya da kaldırır (GitHub Actions → "n8n yedek").

install: Hostinger'daki 'n8n' projesine "n8nyedek" servisini ekler. Servis, betiği (deploy/n8n_backup.sh) bu iş akışının
         commit'inden indirir; her gece 02:45'te n8n veritabanını şifreleyip Arvela yedek deposuna "n8n-" sürümü olarak yükler.
         BACKUP_PASSPHRASE, BACKUP_GITHUB_TOKEN, BACKUP_REPO n8n projesinin ortamına yazılır (Arvela OS ile aynı değerler).
remove : servisi kaldırır; ortamdaki BACKUP_* satırları silinir. Var olan yedeklere dokunulmaz.

Ortam değişkenleri okunduğu gibi geri gönderilir ve loga yazılmaz. Ortam: HOSTINGER_API_TOKEN, MODE, SHA, BACKUP_*.
"""
import json, os, re, sys, urllib.error, urllib.request

VM = os.environ.get('VPS_ID', '1249062')
HAPI = 'https://developers.hostinger.com/api/vps/v1'
KEYS = ('BACKUP_PASSPHRASE', 'BACKUP_GITHUB_TOKEN', 'BACKUP_REPO')


def service(sha, db_host):
    url = f'https://raw.githubusercontent.com/ctimur/arvela-os/{sha}/deploy/n8n_backup.sh'
    return ('  n8nyedek:\n'
            '    image: postgres:17-alpine\n'
            '    restart: unless-stopped\n'
            '    environment:\n'
            '      PGPASSWORD: ${N8N_DB_PASSWORD}\n'
            f'      N8N_DB_HOST: {db_host}\n'
            '      BACKUP_PASSPHRASE: ${BACKUP_PASSPHRASE}\n'
            '      BACKUP_GITHUB_TOKEN: ${BACKUP_GITHUB_TOKEN}\n'
            '      BACKUP_REPO: ${BACKUP_REPO}\n'
            '    entrypoint: ["sh", "-c"]\n'
            f'    command: ["sleep 60; until wget -qO /tmp/b.sh {url}; do sleep 300; done; exec sh /tmp/b.sh"]\n'
            '    depends_on:\n'
            f'      {db_host}:\n'
            '        condition: service_healthy\n')


def hostinger(method, path, body=None):
    req = urllib.request.Request(HAPI + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Authorization': 'Bearer ' + os.environ['HOSTINGER_API_TOKEN'], 'Accept': 'application/json',
                                          'Content-Type': 'application/json', 'User-Agent': 'arvela-os-n8n-backup/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} → HTTP {e.code}: {e.read().decode("utf-8", "replace")[:600]}')


def strip(compose):
    return re.sub(r'(?m)^  n8nyedek:\n(?:    .*\n|      .*\n|        .*\n|\n)*?(?=  [a-z0-9_-]+:\n|volumes:\n|\Z)', '', compose)


def set_env(env, values):
    lines = [l for l in env.splitlines() if l.split('=', 1)[0] not in KEYS]
    return '\n'.join(lines + [f'{k}={v}' for k, v in values.items() if v]) + '\n'


def plan(compose, env, mode, sha, values):
    """Saf işlev: yeni compose ve ortam (test edilir)."""
    compose = strip(compose)
    if mode == 'remove':
        return compose, set_env(env, {})
    m = re.search(r'(?m)^      DB_POSTGRESDB_HOST: ([a-z0-9_-]+)\n', compose)
    db_host = m.group(1) if m else 'db'
    svc = service(sha, db_host)
    compose = compose.replace('\nvolumes:\n', '\n' + svc + 'volumes:\n', 1) if '\nvolumes:\n' in compose else compose.rstrip('\n') + '\n' + svc
    return compose, set_env(env, values)


def main():
    mode = os.environ.get('MODE', 'install')
    if mode not in ('install', 'remove'):
        sys.exit('MODE install ya da remove olmalı')
    sha = os.environ.get('SHA', '')
    if mode == 'install' and not re.fullmatch(r'[0-9a-f]{40}', sha):
        sys.exit('SHA (commit) gerekli')
    values = {k: os.environ.get(k, '').strip() for k in KEYS}
    if mode == 'install' and not (values['BACKUP_PASSPHRASE'] and values['BACKUP_GITHUB_TOKEN']):
        sys.exit('BACKUP_PASSPHRASE ve BACKUP_GITHUB_TOKEN gizli değerleri tanımlı değil')
    values['BACKUP_REPO'] = values['BACKUP_REPO'] or 'ctimur/arvela-os-yedek'
    proj = hostinger('GET', f'/virtual-machines/{VM}/docker/n8n')
    compose, env = proj['content'], proj.get('environment') or ''
    if 'N8N_ENCRYPTION_KEY=' not in env or 'N8N_DB_PASSWORD=' not in env:
        sys.exit('n8n ortamı okunamadı; değişiklik yapılmadı')
    new, new_env = plan(compose, env, mode, sha, values)
    if len(new) > 8192:
        sys.exit(f'compose çok uzun ({len(new)})')
    if new == compose and new_env == env:
        print('Değişiklik yok'); return
    hostinger('POST', f'/virtual-machines/{VM}/docker', {'project_name': 'n8n', 'content': new, 'environment': new_env})
    print('n8n projesi güncellendi:', 'yedek servisi kuruldu (her gece 02:45)' if mode == 'install' else 'yedek servisi kaldırıldı')


if __name__ == '__main__':
    main()
