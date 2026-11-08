"""Forge: Arvela OS ile GitHub arasındaki köprü.

  python3 deploy/forge.py report   açık ve yakında kapanan PR'ları, son yayınları Arvela OS'e bildirir
  python3 deploy/forge.py apply    onaylanan PR'ları birleştirip yayınlar, geri alma isteklerini uygular

Ortam: GITHUB_TOKEN, GITHUB_REPOSITORY, SETUP_TOKEN; apply için ayrıca HOSTINGER_API_TOKEN, DB_PASSWORD (deploy.py).
Onay belirli bir commit'e verilir: PR'ın başı onaylanan commit değilse birleştirilmez.
"""
import hashlib, hmac, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

REPO = os.environ.get('GITHUB_REPOSITORY', 'ctimur/arvela-os')
APP = os.environ.get('APP_URL', 'https://os.arveladigital.com')
GH = 'https://api.github.com/repos/' + REPO
UA = 'arvela-os-forge/1.0'


def gh(method, path, body=None, raw=False):
    req = urllib.request.Request(GH + path if path.startswith('/') else path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json', 'User-Agent': UA, 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        return data if raw else (json.loads(data) if data else None)


def app(method, path, payload=None):
    key = hmac.new(os.environ['SETUP_TOKEN'].encode(), b'arvela-forge', hashlib.sha256).hexdigest()
    data = urllib.parse.urlencode({'payload': json.dumps(payload)}).encode() if payload is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method, headers={'Authorization': 'Bearer ' + key, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    # Arvela OS yayın sırasında kısa süre yanıt vermeyebilir: ağ hatası ve 5xx'te 3 kez yeniden dene (10, 30, 60 sn)
    for i, wait in enumerate([10, 30, 60, None]):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code < 500 or wait is None:
                raise
            print(f'Arvela OS {e.code}; {wait} sn sonra yeniden deneniyor ({i + 1}/3)')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if wait is None:
                raise
            print(f'Arvela OS erişilemedi ({e}); {wait} sn sonra yeniden deneniyor ({i + 1}/3)')
        time.sleep(wait)


def ci_state(sha):
    """PR kontrolü (PR kontrol iş akışındaki 'check' işi) sonucunu döndürür: success / failure / pending."""
    runs = gh('GET', f'/commits/{sha}/check-runs?per_page=100').get('check_runs', [])
    mine = [r for r in runs if r.get('name') == 'check']
    if not mine:
        return 'pending'
    last = sorted(mine, key=lambda r: r.get('started_at') or '')[-1]
    if last.get('status') != 'completed':
        return 'pending'
    return 'success' if last.get('conclusion') == 'success' else 'failure'


def pr_record(p):
    files = gh('GET', f"/pulls/{p['number']}/files?per_page=100") or []
    return {'number': p['number'], 'title': p['title'], 'body': p.get('body') or '', 'author': (p.get('user') or {}).get('login'), 'branch': p['head']['ref'],
            'head_sha': p['head']['sha'], 'url': p['html_url'], 'state': p['state'], 'merged': bool(p.get('merged_at')), 'merge_sha': p.get('merge_commit_sha') if p.get('merged_at') else None,
            'additions': sum(f.get('additions', 0) for f in files), 'deletions': sum(f.get('deletions', 0) for f in files),
            'files': [{'name': f['filename'], 'status': f['status'], 'add': f.get('additions', 0), 'del': f.get('deletions', 0)} for f in files],
            'ci': ci_state(p['head']['sha'])}


def report():
    open_prs = gh('GET', '/pulls?state=open&base=main&per_page=50') or []
    closed = [p for p in (gh('GET', '/pulls?state=closed&base=main&per_page=15&sort=updated&direction=desc') or [])]
    changes = [pr_record(p) for p in open_prs + closed]
    runs = (gh('GET', '/actions/workflows/deploy.yml/runs?status=success&per_page=15') or {}).get('workflow_runs', [])
    releases = [{'sha': r['head_sha'], 'title': r.get('display_title') or (r.get('head_commit') or {}).get('message', '').split('\n')[0], 'source': 'push', 'at': r.get('updated_at')} for r in runs]
    app('POST', '/api/forge/report', {'changes': changes, 'releases': releases, 'note': f'{len(open_prs)} açık PR'})
    print(f'{len(open_prs)} açık, {len(closed)} kapalı PR ve {len(releases)} yayın bildirildi')


def sh(*cmd):
    print('$', ' '.join(cmd)); r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError((r.stdout + r.stderr).strip()[-800:] or f'{cmd[0]} başarısız')
    return r.stdout.strip()


def verify_and_deploy():
    """main'in en son halini doğrular ve yayınlar (Yayına al ile aynı kontroller)."""
    sh('git', 'fetch', 'origin', 'main'); sh('git', 'checkout', '-q', '-B', 'main', 'origin/main')
    for f in sorted(os.listdir('app')):
        if f.endswith('.js'):
            sh('node', '--check', 'app/' + f)
        if f.endswith('.json'):
            json.loads(open('app/' + f, encoding='utf-8').read())
    for t in sorted(os.listdir('tests')):
        if t.endswith('.test.mjs'):
            sh('node', 'tests/' + t)
    sh(sys.executable, 'deploy/rechunk.py'); sh(sys.executable, 'deploy/verify_chunks.py')
    sh(sys.executable, 'deploy/deploy.py')
    return sh('git', 'rev-parse', 'HEAD')


def apply():
    queue = app('GET', '/api/forge/queue')
    if not queue.get('merge') and not queue.get('rollback'):
        print('Sırada iş yok'); return
    sh('git', 'config', 'user.name', 'Arvela Forge'); sh('git', 'config', 'user.email', 'forge@arveladigital.com')
    for item in queue.get('merge', []):
        n, want = item['pr'], item['sha']
        try:
            p = gh('GET', f'/pulls/{n}')
            if p.get('merged_at') and p['head']['sha'] == want:
                # onaylı PR başka bir onaylı değişiklikle birlikte zaten birleşti ve yayına girdi
                app('POST', '/api/forge/result', {'pr': n, 'ok': True, 'sha': p.get('merge_commit_sha'), 'title': f"{p['title']} (#{n})"})
                print(f'#{n} zaten birleşmiş, yayında'); continue
            if p['state'] != 'open':
                raise RuntimeError('PR açık değil')
            if p['head']['sha'] != want:
                raise RuntimeError('PR onaydan sonra değişti; yeniden onay gerekli')
            for _ in range(6):
                if p.get('mergeable') is not None:
                    break
                time.sleep(5); p = gh('GET', f'/pulls/{n}')
            if p.get('mergeable') is False:
                raise RuntimeError('PR main ile çakışıyor; önce çakışma giderilmeli')
            if ci_state(want) != 'success':
                raise RuntimeError('Testler başarılı değil')
            m = gh('PUT', f'/pulls/{n}/merge', {'sha': want, 'merge_method': 'merge', 'commit_title': f"{p['title']} (#{n})", 'commit_message': 'Forge: Yönetici onayıyla birleştirildi.'})
            if not m.get('merged'):
                raise RuntimeError(m.get('message') or 'birleştirilemedi')
            sha = verify_and_deploy()
            app('POST', '/api/forge/result', {'pr': n, 'ok': True, 'sha': sha, 'title': f"{p['title']} (#{n})"})
            print(f'#{n} yayında: {sha}')
        except Exception as e:  # noqa: BLE001
            msg = e.read().decode()[:500] if isinstance(e, urllib.error.HTTPError) else str(e)
            app('POST', '/api/forge/result', {'pr': n, 'ok': False, 'error': msg}); print(f'#{n} uygulanamadı: {msg}')
    for item in queue.get('rollback', []):
        rid, target = item['id'], item['sha']
        try:
            sh('git', 'fetch', 'origin', 'main'); sh('git', 'checkout', '-q', '-B', 'main', 'origin/main')
            parents = sh('git', 'rev-list', '--parents', '-n', '1', target).split()[1:]
            sh('git', 'revert', '--no-edit', *(['-m', '1'] if len(parents) > 1 else []), target)
            sh('git', 'push', 'origin', 'HEAD:main')
            sha = verify_and_deploy()
            app('POST', '/api/forge/result', {'rollback': rid, 'ok': True, 'sha': sha, 'title': f"Geri alındı: {item.get('title') or target[:7]}"})
            print(f'{target[:7]} geri alındı: {sha}')
        except Exception as e:  # noqa: BLE001
            subprocess.run(['git', 'revert', '--abort'], capture_output=True)
            app('POST', '/api/forge/result', {'rollback': rid, 'ok': False, 'error': str(e)[:500]}); print(f'{target[:7]} geri alınamadı: {e}')
    report()


if __name__ == '__main__':
    {'report': report, 'apply': apply}[sys.argv[1] if len(sys.argv) > 1 else 'report']()
