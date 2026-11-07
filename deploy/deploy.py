"""Arvela OS'i Hostinger KVM 1'e yayınlar (GitHub Actions ya da elle).

1. deploy/rechunk.py ile kaynak dosyaları 8.192 karakterlik parçalara böler.
2. Her parçayı arvela-src-NN projesi olarak Hostinger Docker API'sine yazar (yalnızca değişenleri).
3. deploy/docker-compose.yml'deki SHA-256 özetlerini günceller ve arvela-os projesini yeniden yayınlar.
4. /healthz'in sağlıklı dönmesini bekler.

Ortam değişkenleri: HOSTINGER_API_TOKEN, VPS_ID, DB_PASSWORD, SETUP_TOKEN
"""
import hashlib, json, os, pathlib, re, sys, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'deploy'))
import rechunk  # noqa: E402

API = 'https://developers.hostinger.com/api/vps/v1'
TOKEN = os.environ.get('HOSTINGER_API_TOKEN', '').strip()
if not TOKEN:
    raise SystemExit('HOSTINGER_API_TOKEN boş: GitHub → Settings → Secrets and variables → Actions')
VM = os.environ.get('VPS_ID', '1249062')
# Projeler arvela-src-NN olarak sıralı numaralanır; sıra deploy/boundaries.json ile birlikte sabittir.
ORDER = [('server.js', 9), ('package.json', 1), ('seed-catalog.json', 3), ('ext-sites.js', 2), ('import-sites.json', 1), ('ext-quotes.js', 3), ('ext-invoices.js', 4), ('ext-today.js', 3)]


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json', 'Accept': 'application/json',
                                          'User-Agent': 'arvela-os-deploy/1.0'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b'null')
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 502, 503) and attempt < 4:
                time.sleep(10 * (attempt + 1)); continue
            raise SystemExit(f'{method} {path}: HTTP {e.code} {e.read().decode()[:500]}')


def remote_content(project):
    try:
        return call('GET', f'/virtual-machines/{VM}/docker/{project}').get('content')
    except SystemExit:
        return None


def main():
    rechunk.main()
    print('API kontrolü:', type(call('GET', f'/virtual-machines/{VM}')).__name__)
    names = []
    for name, count in ORDER:
        files = sorted((ROOT / 'chunks').glob(f'{name}.[0-9][0-9].yml'))
        if len(files) != count:
            raise SystemExit(f'{name}: {len(files)} parça var, beklenen {count}. Yeni parça için ORDER ve sunucu projelerini birlikte güncelleyin.')
        names += files
    changed = 0
    for i, f in enumerate(names):
        project = f'arvela-src-{i:02d}'
        content = f.read_text()
        if remote_content(project) == content:
            continue
        call('POST', f'/virtual-machines/{VM}/docker', {'project_name': project, 'content': content})
        changed += 1
        print('yazıldı', project, f.name)
        time.sleep(8)
    print(f'{changed} parça güncellendi')

    compose = (ROOT / 'deploy' / 'docker-compose.yml').read_text()
    for name, _ in ORDER:
        sha = hashlib.sha256((ROOT / 'app' / name).read_bytes()).hexdigest()
        compose, n = re.subn(rf'[0-9a-f]{{64}}(  /app/{re.escape(name)})', rf'{sha}\1', compose)
        if n != 1:
            raise SystemExit(f'docker-compose.yml içinde {name} özeti bulunamadı')
    env = f"DB_PASSWORD={os.environ['DB_PASSWORD']}\nSETUP_TOKEN={os.environ['SETUP_TOKEN']}\n"
    call('POST', f'/virtual-machines/{VM}/docker', {'project_name': 'arvela-os', 'content': compose, 'environment': env})
    print('arvela-os yeniden yayınlandı; sağlık kontrolü bekleniyor')

    want = re.search(r"const VERSION = '([^']+)'", (ROOT / 'app' / 'server.js').read_text()).group(1)
    for _ in range(30):
        time.sleep(10)
        try:
            with urllib.request.urlopen(urllib.request.Request('https://os.arveladigital.com/healthz', headers={'User-Agent': 'arvela-os-deploy/1.0'}), timeout=10) as r:
                data = json.loads(r.read())
                if data.get('ok') and data.get('version') == want:
                    print('sağlıklı:', data); return
        except Exception as e:  # noqa: BLE001
            print('bekleniyor:', e)
    raise SystemExit('5 dakika içinde sağlıklı yanıt gelmedi; Hostinger panelinden arvela-os kayıtlarına bakın')


if __name__ == '__main__':
    main()
