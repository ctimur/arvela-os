"""Hostinger'daki sitelerin SSL ve WordPress durumunu okuyup Arvela OS'e gönderir.

GitHub Actions'ta her sabah çalışır (.github/workflows/site-sync.yml). Yalnız okuma yapar; sitelerde
hiçbir şeyi değiştirmez. Uygulamaya gönderirken kurulum anahtarından türetilen anahtarı kullanır,
Hostinger anahtarı uygulamaya hiç gitmez.

Ortam: HOSTINGER_API_TOKEN, SETUP_TOKEN, (isteğe bağlı) APP_URL.
"""
import hashlib, hmac, json, os, sys, time, urllib.error, urllib.parse, urllib.request

API = 'https://developers.hostinger.com/api/hosting/v1'
APP = os.environ.get('APP_URL', 'https://os.arveladigital.com')
UA = {'User-Agent': 'arvela-os-site-sync/1.0', 'Accept': 'application/json'}
PLATFORM = {'wordpress': 'WordPress', 'builder': 'Builder', 'horizons': 'Horizons', 'nodejs': 'Node.js'}


def get(path, params=None):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, headers={**UA, 'Authorization': 'Bearer ' + os.environ['HOSTINGER_API_TOKEN']})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b'null')
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1)); continue
            raise
    raise RuntimeError(f'{path}: yanıt alınamadı')


def websites():
    out, page = [], 1
    while True:
        r = get('/websites', {'page': page, 'per_page': 100})
        out += r.get('data', [])
        meta = r.get('meta') or {}
        if len(out) >= meta.get('total', 0) or not r.get('data'):
            return out
        page += 1


def latest_wp():
    try:
        req = urllib.request.Request('https://api.wordpress.org/core/version-check/1.7/', headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())['offers'][0]['current']
    except Exception as e:  # noqa: BLE001
        print('WordPress güncel sürümü alınamadı:', e)
        return None


def ssl_of(username, domain):
    r = get(f'/accounts/{username}/websites/{urllib.parse.quote(domain)}/ssl/status')
    r = r.get('data', r) if isinstance(r, dict) else {}
    r = r.get('ssl', r)
    return r.get('status'), r.get('expires_at')


def main():
    if not os.environ.get('HOSTINGER_API_TOKEN') or not os.environ.get('SETUP_TOKEN'):
        sys.exit('HOSTINGER_API_TOKEN ve SETUP_TOKEN gerekli')
    sites = websites()
    installs = get('/wordpress/installations', {'ownership': 'all'}) or []
    if isinstance(installs, dict):
        installs = installs.get('data', [])
    wp = {}
    for i in installs:
        if not i.get('directory') and i.get('domain') not in wp:
            wp[i['domain']] = i
    out, failed = [], []
    for w in sites:
        d, user = w.get('domain'), w.get('username')
        if not d or not user:
            continue
        try:
            status, expires = ssl_of(user, d)
            rec = {'domain': d, 'platform': PLATFORM.get(w.get('website_type')), 'enabled': w.get('is_enabled', True),
                   'ssl_status': status, 'ssl_expires': expires}
            inst = wp.get(d)
            if inst:
                rec['wp_valid'] = inst.get('is_valid', True)
                rec['wp_error'] = inst.get('validation_error')
                v = get(f"/accounts/{user}/wordpress/{inst['id']}/version")
                v = v.get('data', v) if isinstance(v, dict) else {}
                rec['wp_version'] = v.get('version')
                rec['wp_vulns'] = len(v.get('vulnerabilities') or [])
            out.append(rec)
        except Exception as e:  # noqa: BLE001
            failed.append(d); print('atlandı:', d, e)
        time.sleep(0.4)
    payload = {'sites': out, 'wp_latest': latest_wp(), 'note': f"{len(out)} site okundu" + (f"; okunamayan: {', '.join(failed)}" if failed else '')}
    key = hmac.new(os.environ['SETUP_TOKEN'].encode(), b'arvela-site-sync', hashlib.sha256).hexdigest()
    body = urllib.parse.urlencode({'payload': json.dumps(payload)}).encode()
    req = urllib.request.Request(APP + '/api/site-sync', data=body, method='POST',
                                 headers={**UA, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=60) as r:
        print('Arvela OS:', r.read().decode())
    print(payload['note'])
    if failed and len(failed) > len(out):
        sys.exit('sitelerin çoğu okunamadı')


if __name__ == '__main__':
    main()
