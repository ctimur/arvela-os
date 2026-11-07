"""Parçaların YAML olarak okunup birleştirildiğinde app/ dosyalarını birebir verdiğini doğrular."""
import glob, pathlib, sys
import yaml
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from rechunk import FILES, ROOT

bad = 0
for name in FILES:
    parts = sorted(glob.glob(str(ROOT / 'chunks' / f'{name}.[0-9][0-9].yml')))
    txt = ''.join(yaml.safe_load(pathlib.Path(p).read_text())['configs']['part']['content'].replace('$$', '$') for p in parts)
    ok = txt == (ROOT / 'app' / name).read_text()
    bad += not ok
    print('OK ' if ok else 'BOZUK', name)
sys.exit(1 if bad else 0)
