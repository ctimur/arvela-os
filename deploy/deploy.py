"""Arvela OS'i Hostinger KVM 1'e yayınlar (GitHub Actions ya da elle).

1. deploy/rechunk.py ile kaynak dosyaları 8.192 karakterlik parçalara böler.
2. Her parçayı kalıcı adlı bir projeye yazar (yalnızca değişenleri): arvela-src-<dosya>-NN.
   Ad dosyaya bağlıdır; bir dosyanın parça sayısı değişince diğer dosyaların projeleri yeniden yazılmaz.
   server.js'in ilk parçası paylaşılan arvela_src birimini oluşturduğu için adı arvela-src-00 olarak kalır.
3. deploy/docker-compose.yml'deki SHA-256 özetlerini günceller ve arvela-os projesini yeniden yayınlar.
4. /healthz'in sağlıklı dönmesini bekler.

Ortam değişkenleri: HOSTINGER_API_TOKEN, VPS_ID, DB_PASSWORD, SETUP_TOKEN
"""
import functools, hashlib, json, os, pathlib, re, sys, time, urllib.request, urllib.error

print = functools.partial(print, flush=True)  # noqa: A001 — iş akışı kesilse de kayıt görünsün

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'deploy'))
import rechunk  # noqa: E402

API = 'https://developers.hostinger.com/api/vps/v1'
TOKEN = os.environ.get('HOSTINGER_API_TOKEN', '').strip()
LIMIT = 8192  # Hostinger Docker API: compose içeriği en fazla 8.192 karakter
VM = os.environ.get('VPS_ID', '1249062')
# Projeler arvela-src-NN olarak sıralı numaralanır; sıra deploy/boundaries.json ile birlikte sabittir.
ORDER = [(n, None) for n in rechunk.FILES]  # dosya listesi tek yerde: deploy/rechunk.py


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


def project_name(chunk):
    """chunks/<dosya>.<NN>.yml → kalıcı Hostinger proje adı."""
    m = re.match(r'^(.+)\.(\d\d)\.yml$', chunk)
    name, idx = m.group(1), int(m.group(2))
    if name == ORDER[0][0] and idx == 0:
        return 'arvela-src-00'  # paylaşılan birimi (arvela_src) oluşturan proje
    return f"arvela-src-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}-{idx:02d}"


def remote_content(project):
    try:
        return call('GET', f'/virtual-machines/{VM}/docker/{project}').get('content')
    except SystemExit:
        return None


def build_compose(parts):
    """arvela-os compose'u: birleştirme listesi (dosya, parça sayısı, SHA-256). 8.192 sınırını aşarsa durur."""
    compose = (ROOT / 'deploy' / 'docker-compose.yml').read_text()
    lines = '\n'.join(f"        {n} {c} {hashlib.sha256((ROOT / 'app' / n).read_bytes()).hexdigest()}" for n, c in parts.items())
    if compose.count('        __LISTE__\n') != 1:
        raise SystemExit('docker-compose.yml içinde __LISTE__ satırı bulunamadı')
    compose = compose.replace('        __LISTE__\n', lines + '\n')
    if len(compose) > LIMIT:
        raise SystemExit(f'arvela-os compose {len(compose)} karakter > {LIMIT}: docker-compose.yml kısaltılmalı')
    return compose


def part_counts():
    return {name: len(sorted((ROOT / 'chunks').glob(f'{name}.[0-9][0-9].yml'))) for name, _ in ORDER}


def main():
    if not TOKEN:
        raise SystemExit('HOSTINGER_API_TOKEN boş: GitHub → Settings → Secrets and variables → Actions')
    rechunk.main()
    build_compose(part_counts())  # sınırı yazmaya başlamadan önce denetle
    print('API kontrolü:', type(call('GET', f'/virtual-machines/{VM}')).__name__)
    names = []
    parts = {}
    for name, _ in ORDER:
        files = sorted((ROOT / 'chunks').glob(f'{name}.[0-9][0-9].yml'))
        if not files:
            raise SystemExit(f'{name}: parça yok; önce deploy/rechunk.py çalıştırın')
        parts[name] = len(files)
        names += files
    changed = 0
    for f in names:
        project = project_name(f.name)
        content = f.read_text()
        if remote_content(project) == content:
            continue
        call('POST', f'/virtual-machines/{VM}/docker', {'project_name': project, 'content': content})
        changed += 1
        print('yazıldı', project, f.name)
        time.sleep(4)
    print(f'{changed} parça güncellendi')

    compose = build_compose(parts)
    env = f"DB_PASSWORD={os.environ['DB_PASSWORD']}\nSETUP_TOKEN={os.environ['SETUP_TOKEN']}\n"
    if os.environ.get('FORGE_GITHUB_TOKEN'):  # isteğe bağlı: Forge onayından hemen sonra yayın
        env += f"FORGE_GITHUB_TOKEN={os.environ['FORGE_GITHUB_TOKEN']}\n"
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
