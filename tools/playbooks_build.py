# Tüm hizmet kitaplarını üretir: Web (playbooks_web) + diğer 7 kategori (pb_*.py). Çıktı: app/playbooks.json
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import playbooks_web as W
import pb_sos, pb_dij, pb_ai, pb_saas, pb_eml, pb_dan, pb_pm  # noqa: F401  (her biri W.P'ye ekler)

ROLES = {'ai', 'ekip', 'freelancer', 'musteri'}; AUTO = {'tam', 'ai_taslak', 'insan'}; DEC = {None, 'onay', 'secim', 'butce', 'bilgi'}


def check(code, pb):
    a = pb['asamalar']; assert 3 <= len(a) <= 12, (code, 'aşama sayısı', len(a))
    for s in a:
        assert s['rol'] in ROLES and s['otomasyon'] in AUTO and s['karar'] in DEC, (code, s)
        assert 0 < s['gun'] <= 60 and s['ad'] and s['cikti'], (code, s['ad'])
    assert any(s['rol'] == 'musteri' and s['karar'] for s in a), (code, 'müşteri karar noktası yok')
    for k in ('ozet', 'kapsam', 'kapsam_disi', 'teslimatlar', 'girdiler', 'kpi', 'riskler'): assert pb[k], (code, k)
    assert 0 <= pb['ai']['otomasyon_orani'] <= 100


def main():
    cat = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'app', 'seed-catalog.json')))
    codes = [m['code'] for m in cat['modules']]
    missing = [c for c in codes if c not in W.P]; extra = [c for c in W.P if c not in codes]
    assert not extra, ('katalogda olmayan kitap', extra)
    for c, pb in W.P.items(): check(c, pb)
    out = {code: {**W.P[code], 'v': 1} for code in codes if code in W.P}
    dst = os.path.join(os.path.dirname(__file__), '..', 'app', 'playbooks.json')
    json.dump(out, open(dst, 'w'), ensure_ascii=False, indent=1)
    open(dst, 'a').write('\n')
    print(len(out), 'hizmet kitabı', os.path.getsize(dst), 'bayt', '· eksik:', missing or 'yok')


if __name__ == '__main__':
    main()
