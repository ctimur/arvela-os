"""n8n'i Arvela OS'e anahtar teslim bağlar (GitHub Actions → "n8n bağla").

1. Arvela OS'ten (POST /api/n8n/provision) n8n için yeni bir sistem API anahtarı ve webhook anahtarı alır;
   Arvela tarafında hazır akışların bağlantılarını açar.
2. Hostinger'daki 'n8n' Docker projesini okur; ortamına bu anahtarları ve SMTP ayarlarını ekler,
   açılış komutunu günceller ve projeyi yeniden başlatır.
3. n8n açılışta: kimlik bilgilerini (Arvela OS API, Arvela webhook, SMTP) içe aktarır, hazır akışları
   (seed sürümü değiştiyse) içe aktarır ve olay yönlendirici dışındakileri yayınlar.

Anahtarlar loglara yazılmaz. Ortam: HOSTINGER_API_TOKEN, SETUP_TOKEN, (isteğe bağlı) N8N_SMTP_PASSWORD, ANTHROPIC_API_KEY.
"""
import hashlib, hmac, json, os, re, sys, urllib.error, urllib.parse, urllib.request

APP = os.environ.get('APP_URL', 'https://os.arveladigital.com')
VM = os.environ.get('VPS_ID', '1249062')
HAPI = 'https://developers.hostinger.com/api/vps/v1'
UA = {'User-Agent': 'arvela-os-n8n-connect/1.0', 'Accept': 'application/json'}
SMTP = {'N8N_SMTP_USER': 'hello@arveladigital.com', 'N8N_SMTP_HOST': 'smtp.hostinger.com', 'N8N_SMTP_PORT': '465'}


def http(method, url, body=None, headers=None, form=False):
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={**UA, **(headers or {}), 'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:600]
        for k in ('ARVELA_API_KEY', 'ARVELA_HOOK_TOKEN', 'N8N_SMTP_PASSWORD'):
            if os.environ.get(k): detail = detail.replace(os.environ[k], '***')
        sys.exit(f'{method} {url.split("?")[0]} → HTTP {e.code}: {detail}')


def hostinger(method, path, body=None):
    return http(method, HAPI + path, body, {'Authorization': 'Bearer ' + os.environ['HOSTINGER_API_TOKEN']})


START = r'''    command:
      - |
        set -u
        # Arvela kimlik bilgileri: her açılışta Arvela'dan gelen anahtarlarla eşitlenir.
        node -e '
          const e = process.env, list = [
            { id: "arvelaApiCred01", name: "Arvela OS API", type: "httpHeaderAuth", data: { name: "Authorization", value: "Bearer " + e.ARVELA_API_KEY } },
            { id: "arvelaHookCred1", name: "Arvela webhook", type: "httpHeaderAuth", data: { name: "X-Arvela-Token", value: e.ARVELA_HOOK_TOKEN } } ];
          if (e.ANTHROPIC_API_KEY) list.push({ id: "arvelaClaudeCr1", name: "Anthropic (Claude)", type: "httpHeaderAuth", data: { name: "x-api-key", value: e.ANTHROPIC_API_KEY } });
          require("fs").writeFileSync("/tmp/arvela-creds.json", JSON.stringify(list));
          if (e.N8N_SMTP_PASSWORD) require("fs").writeFileSync("/tmp/arvela-smtp.json", JSON.stringify([{ id: "arvelaSmtpCred1", name: "SMTP", type: "smtp",
            data: { user: e.N8N_SMTP_USER, password: e.N8N_SMTP_PASSWORD, host: e.N8N_SMTP_HOST, port: Number(e.N8N_SMTP_PORT), secure: true } }]));
          else require("fs").writeFileSync("/tmp/arvela-smtp.json", JSON.stringify([{ id: "arvelaSmtpCred1", name: "SMTP", type: "smtp",
            data: { user: e.N8N_SMTP_USER, password: "", host: e.N8N_SMTP_HOST, port: Number(e.N8N_SMTP_PORT), secure: true } }]));
        '
        n8n import:credentials --input=/tmp/arvela-creds.json && echo "Arvela kimlik bilgileri eşitlendi"
        # SMTP: şifre ortamda varsa her açılışta, yoksa yalnız ilk kez (n8n'de elle girilen şifre korunur)
        if [ -n "$${N8N_SMTP_PASSWORD:-}" ] || [ ! -f /home/node/.n8n/.arvela-smtp ]; then
          n8n import:credentials --input=/tmp/arvela-smtp.json && touch /home/node/.n8n/.arvela-smtp && echo "SMTP kimlik bilgisi yazıldı"
        fi
        rm -f /tmp/arvela-creds.json /tmp/arvela-smtp.json
        SEED=__SEED__
        MARK=/home/node/.n8n/.arvela-seed-$$SEED
        if [ ! -f "$$MARK" ]; then
          if wget -qO /tmp/arvela-seed.json https://os.arveladigital.com/api/n8n-seed; then
            n8n import:workflow --input=/tmp/arvela-seed.json && touch "$$MARK" && echo "Arvela akışları içe aktarıldı (sürüm $$SEED)"
            for id in __PUBLISH__; do
              n8n publish:workflow --id=$$id >/dev/null 2>&1 || n8n update:workflow --id=$$id --active=true >/dev/null 2>&1 || echo "Yayınlanamadı: $$id"
            done
            echo "Arvela akışları yayınlandı"
          else
            echo "Arvela akışları alınamadı; bir sonraki açılışta yeniden denenecek"
          fi
        fi
        exec n8n start
'''


def build_compose(compose, version, publish):
    block = START.replace('__SEED__', str(version)).replace('__PUBLISH__', publish)
    compose, n = re.subn(r'    command:\n(?:      .*\n|        .*\n|\n)*?(?=    environment:\n)', lambda m: block, compose, count=1)
    if n != 1:
        sys.exit('n8n compose içinde komut bölümü bulunamadı')
    # eski uyarılar: WEBHOOK_URL yerine N8N_WEBHOOK_URL (bir kez), N8N_RUNNERS_ENABLED gereksiz
    while compose.count('      N8N_WEBHOOK_URL:') > 1:
        compose = compose.replace('      N8N_WEBHOOK_URL: https://n8n.arveladigital.com/\n', '', 1)
    if '      N8N_WEBHOOK_URL:' not in compose:
        compose = compose.replace('      WEBHOOK_URL: https://n8n.arveladigital.com/\n', '      N8N_WEBHOOK_URL: https://n8n.arveladigital.com/\n      WEBHOOK_URL: https://n8n.arveladigital.com/\n')
    compose = compose.replace('      N8N_RUNNERS_ENABLED: "true"\n', '')
    for k in ['ARVELA_API_KEY', 'ARVELA_HOOK_TOKEN', 'N8N_SMTP_USER', 'N8N_SMTP_HOST', 'N8N_SMTP_PORT', 'N8N_SMTP_PASSWORD', 'ANTHROPIC_API_KEY']:
        if f'      {k}:' not in compose:
            compose = compose.replace('      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}\n', f'      N8N_ENCRYPTION_KEY: ${{N8N_ENCRYPTION_KEY}}\n      {k}: ${{{k}:-}}\n', 1)
    svc = re.search(r'(?ms)^  n8n:\n(.*?)(?=^  [a-z0-9_-]+:\n|^volumes:\n|\Z)', compose)
    keys = re.findall(r'^      ([A-Z0-9_]+):', svc.group(1) if svc else compose, re.M)
    dup = sorted({k for k in keys if keys.count(k) > 1})
    if dup:
        sys.exit('n8n compose içinde yinelenen ayar: ' + ', '.join(dup))
    if len(compose) > 8192:
        sys.exit(f'n8n compose çok uzun ({len(compose)})')
    return compose


def main():
    for k in ('HOSTINGER_API_TOKEN', 'SETUP_TOKEN'):
        if not os.environ.get(k):
            sys.exit(k + ' gerekli')
    # 1 · Hostinger'daki n8n projesi: önce oku ve yeni compose'u hazırla (hata olursa Arvela'daki anahtar değişmez)
    seed = http('GET', APP + '/api/n8n-seed-info')
    publish = ' '.join(i for n, i in seed['ids'].items() if 'yönlendirici' not in n)
    proj = hostinger('GET', f'/virtual-machines/{VM}/docker/n8n')
    compose, env = proj['content'], proj.get('environment') or ''
    if 'N8N_ENCRYPTION_KEY=' not in env:
        sys.exit('n8n ortamı okunamadı; değişiklik yapılmadı')
    compose = build_compose(compose, seed['version'], publish)
    # 2 · Arvela OS: yeni anahtarlar
    pkey = hmac.new(os.environ['SETUP_TOKEN'].encode(), b'arvela-n8n-provision', hashlib.sha256).hexdigest()
    prov = http('POST', APP + '/api/n8n/provision', {}, {'Authorization': 'Bearer ' + pkey}, form=True)
    print(f"Arvela OS: yeni n8n anahtarı alındı, {prov['hooks']} bağlantı açıldı")
    vals = {'ARVELA_API_KEY': prov['api_key'], 'ARVELA_HOOK_TOKEN': prov['webhook_token'], **SMTP}
    if os.environ.get('N8N_SMTP_PASSWORD'):
        vals['N8N_SMTP_PASSWORD'] = os.environ['N8N_SMTP_PASSWORD']
    if os.environ.get('ANTHROPIC_API_KEY'):  # Claude: n8n'deki "Anthropic (Claude)" kimlik bilgisi bundan oluşur
        vals['ANTHROPIC_API_KEY'] = os.environ['ANTHROPIC_API_KEY']
    lines = [l for l in env.splitlines() if l and l.split('=', 1)[0] not in vals]
    env = '\n'.join(lines + [f'{k}={v}' for k, v in vals.items()]) + '\n'
    if len(compose) > 8192:
        sys.exit(f'n8n compose çok uzun ({len(compose)})')
    hostinger('POST', f'/virtual-machines/{VM}/docker', {'project_name': 'n8n', 'content': compose, 'environment': env})
    print('n8n yeniden başlatılıyor: kimlik bilgileri, akışlar (sürüm %s) ve yayın' % seed['version'])


if __name__ == '__main__':
    main()
