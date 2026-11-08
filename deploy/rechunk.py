"""app/ dosyalarını Hostinger'ın 8.192 karakterlik compose sınırına sığan parçalara böler.

Sınırlar deploy/boundaries.json'da sabittir (her parçanın ilk satırı); böylece bir değişiklik
yalnızca ilgili parçayı değiştirir ve sunucuya yalnızca o parça yeniden yazılır.
Bir parça sınırı aşarsa o parçayı ikiye bölecek yeni bir sınır satırı boundaries.json'a eklenir.

Kullanım: python3 deploy/rechunk.py   (depo kökünden)
Çıktı: chunks/<dosya>.<NN>.yml (git dışı) ve her dosyanın SHA-256 özeti.
"""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP, OUT = ROOT / 'app', ROOT / 'chunks'
FILES = ['server.js', 'package.json', 'seed-catalog.json', 'ext-sites.js', 'import-sites.json', 'ext-quotes.js', 'ext-invoices.js', 'ext-today.js', 'ext-work.js', 'i18n.js', 'i18n-en.json', 'ext-sync.js', 'ext-automation.js', 'n8n-seed.json', 'ext-forge.js', 'ext-crm.js', 'ext-freelance.js', 'ext-retention.js', 'themes.js', 'ext-settings.js']
LIMIT = 8192


def wrap(name, idx, body, first=False):
    pad = '      '
    content = '\n'.join(pad + l if l else '' for l in body.replace('$', '$$').split('\n'))
    return ('services:\n  w:\n    image: busybox:1.36\n    restart: "no"\n'
            f'    command: ["sh", "-c", "cp /part /src/{name}.{idx:02d}"]\n'
            '    configs:\n      - source: part\n        target: /part\n'
            '    volumes:\n      - src:/src\n'
            'configs:\n  part:\n    content: |2\n' + content + '\n'
            'volumes:\n  src:\n    name: arvela_src\n' + ('' if first else '    external: true\n'))


def main():
    bounds = json.loads((ROOT / 'deploy' / 'boundaries.json').read_text())
    OUT.mkdir(exist_ok=True)
    for name in FILES:
        text = (APP / name).read_text()
        if not text.endswith('\n') or text.endswith('\n\n'):
            raise SystemExit(f'{name}: dosya tek bir satır sonuyla bitmeli (YAML parçası bunu korumaz)')
        parts, start = [], 0
        for m in bounds.get(name, []):
            if text.count('\n' + m + '\n') != 1:
                raise SystemExit(f'{name}: sınır satırı dosyada tam bir kez geçmeli: {m[:60]!r}')
            i = text.index('\n' + m + '\n', start) + 1
            if text[:i].endswith('\n\n'):
                raise SystemExit(f'{name}: sınır satırından önce boş satır olamaz (YAML parçanın sondaki boş satırını siler): {m[:60]!r}')
            parts.append(text[start:i]); start = i
        parts.append(text[start:])
        assert ''.join(parts) == text
        for i, p in enumerate(parts):
            y = wrap(name, i, p, first=(name == FILES[0] and i == 0))
            if len(y) > LIMIT:
                raise SystemExit(f'{name} parça {i}: {len(y)} > {LIMIT} karakter; boundaries.json\'a sınır ekleyin')
            f = OUT / f'{name}.{i:02d}.yml'
            old = f.read_text() if f.exists() else None
            f.write_text(y)
            print(f'{"DEĞİŞTİ" if old != y else "aynı   "} {f.name} ({len(y)})')
        print(hashlib.sha256(text.encode()).hexdigest(), name)


if __name__ == '__main__':
    main()
