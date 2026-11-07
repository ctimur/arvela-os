"""Bir dosya için parça sınırlarını otomatik seçer ve deploy/boundaries.json'a yazar.

Kural: her parça 7.400 karakterin altında kalır (sonradan küçük değişikliklere pay), sınır satırı
dosyada tekildir ve önünde boş satır yoktur. Kullanım: python3 deploy/autobound.py app/ext-work.js
"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from rechunk import wrap, ROOT

CAP = 7400


def pick(text):
    lines = text.split('\n'); offs, o = [], 0
    for l in lines:
        offs.append(o); o += len(l) + 1
    ok = lambda j: lines[j] and lines[j - 1] != '' and text.count('\n' + lines[j] + '\n') == 1
    size = lambda a, b: len(wrap('x', 0, text[a:b]))
    bounds, s0, i = [], 0, 1
    while size(s0, len(text)) > CAP:
        best = None
        for j in range(i, len(lines)):
            if size(s0, offs[j]) > CAP:
                break
            if ok(j):
                best = j
        if best is None:
            raise SystemExit('uygun sınır bulunamadı')
        bounds.append(lines[best]); s0 = offs[best]; i = best + 1
    return bounds


if __name__ == '__main__':
    path = pathlib.Path(sys.argv[1]); bf = ROOT / 'deploy' / 'boundaries.json'
    b = json.loads(bf.read_text()); b[path.name] = pick(path.read_text())
    bf.write_text(json.dumps(b, ensure_ascii=False, indent=1))
    print(path.name, len(b[path.name]) + 1, 'parça')
