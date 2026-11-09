"""Kesinti izleme: adresleri kontrol eder; iki deneme üst üste başarısızsa "Kesinti" kaydı (issue) açar, düzelince kapatır.
GitHub, depoda açılan kayıtları sahibine e-postayla bildirir. Ortam: GITHUB_TOKEN, GITHUB_REPOSITORY."""
import json, os, time, urllib.error, urllib.request

TARGETS = [('Arvela OS', 'https://os.arveladigital.com/healthz'), ('n8n', 'https://n8n.arveladigital.com/healthz'), ('arveladigital.com', 'https://arveladigital.com/')]
REPO = os.environ.get('GITHUB_REPOSITORY', 'ctimur/arvela-os'); TOKEN = os.environ.get('GITHUB_TOKEN', '')
LABEL = 'kesinti'


def probe(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'arvela-uptime/1.0'})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status < 400, f'HTTP {r.status}'
    except urllib.error.HTTPError as e:
        return e.code < 400, f'HTTP {e.code}'
    except Exception as e:  # zaman aşımı, DNS, TLS
        return False, type(e).__name__ + ': ' + str(e)[:120]


def gh(method, path, body=None):
    req = urllib.request.Request('https://api.github.com' + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'arvela-uptime/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b'null')


def check(url):
    ok, why = probe(url)
    if ok: return True, why
    time.sleep(30)  # tek seferlik ağ dalgalanmasına kayıt açılmaz
    return probe(url)


def main():
    open_issues = {i['title']: i for i in gh('GET', f'/repos/{REPO}/issues?state=open&labels={LABEL}&per_page=50') or []}
    now = time.strftime('%d.%m.%Y %H:%M', time.gmtime(time.time() + 3 * 3600))
    for name, url in TARGETS:
        ok, why = check(url); title = f'Kesinti: {name} erişilemiyor'
        print(('OK   ' if ok else 'HATA ') + f'{url} · {why}')
        if not ok and title not in open_issues:
            gh('POST', f'/repos/{REPO}/issues', {'title': title, 'labels': [LABEL], 'body': f'{now} (İstanbul) itibarıyla {url} yanıt vermiyor: {why}.\n\nİki deneme 30 sn arayla başarısız oldu. Site geri gelince bu kayıt kendiliğinden kapanır.\n\nİlk bakılacaklar: Hostinger VPS durumu, Docker projeleri (arvela-os, n8n), alan adı ve SSL.'})
        elif ok and title in open_issues:
            n = open_issues[title]['number']
            gh('POST', f'/repos/{REPO}/issues/{n}/comments', {'body': f'{now} (İstanbul): {url} yeniden yanıt veriyor ({why}).'})
            gh('PATCH', f'/repos/{REPO}/issues/{n}', {'state': 'closed', 'state_reason': 'completed'})


if __name__ == '__main__':
    main()
