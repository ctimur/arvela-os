import { parsePlaybook, planTasks, stats, ROLES, AUTO, DECISIONS, ENGINES } from '../app/ext-playbooks.js';
import fs from 'node:fs';
import assert from 'node:assert';

// hazır kitaplar geçerli
const books = JSON.parse(fs.readFileSync(new URL('../app/playbooks.json', import.meta.url), 'utf8'));
const cat = JSON.parse(fs.readFileSync(new URL('../app/seed-catalog.json', import.meta.url), 'utf8'));
const web = cat.modules.filter(m => m.category === 'WEB').map(m => m.code);
assert.deepEqual(Object.keys(books).filter(k => k.startsWith('WEB')).sort(), web.sort(), 'Web & E-Ticaret kategorisinin tamamı hazır');
for (const [code, pb] of Object.entries(books)) {
  assert.ok(pb.ozet && pb.kapsam.length && pb.teslimatlar.length && pb.asamalar.length >= 3, code + ' temel alanlar');
  assert.ok(pb.ai.yontem.length >= 6 && pb.ai.teknik.length >= 4, code + ' yapay zekâ yöntemi ve teknik ayrıntı');
  for (const s of pb.asamalar) { assert.ok(ROLES[s.rol] && AUTO[s.otomasyon] && (s.karar === null || DECISIONS[s.karar]), code + ' aşama: ' + s.ad); }
  assert.ok(pb.asamalar.some(s => s.rol === 'musteri' && s.karar), code + ' en az bir müşteri karar noktası');
  for (const m of pb.ai.ek_motorlar) assert.ok(ENGINES[m.motor], code + ' motor');
}

// formdan okuma ve geri yazma (düzenleyicinin ürettiği alan adlarıyla)
const pb = parsePlaybook({ ozet: ' Özet ', kapsam: 'A\n\nB\n', teslimatlar: 'Site | hızlı\nRapor', girdiler: 'Logo | musteri | isteğe bağlı | portal\nDNS | arvela | zorunlu',
  s_ad_0: 'Keşif', s_rol_0: 'ai', s_oto_0: 'tam', s_gun_0: '2', s_karar_0: '', s_ad_1: '', s_ad_2: 'Onay', s_rol_2: 'musteri', s_oto_2: 'kotu', s_gun_2: 'x', s_karar_2: 'onay',
  riskler: 'Gecikme | hatırlat', ai_motor: 'claude', ai_ek: 'gemini | görsel\nbilinmeyen | x', ai_oran: '150', kpi: 'Süre' });
assert.equal(pb.ozet, 'Özet'); assert.deepEqual(pb.kapsam, ['A', 'B']);
assert.deepEqual(pb.teslimatlar, [{ ad: 'Site', kabul: 'hızlı' }, { ad: 'Rapor', kabul: '' }]);
assert.deepEqual(pb.girdiler.map(g => [g.kimden, g.zorunlu]), [['musteri', false], ['arvela', true]]);
assert.equal(pb.asamalar.length, 2, 'boş satır silinir');
assert.deepEqual([pb.asamalar[1].otomasyon, pb.asamalar[1].gun, pb.asamalar[1].karar], ['insan', 0, 'onay'], 'geçersiz değer güvenli varsayılana döner');
assert.equal(pb.ai.otomasyon_orani, 100); assert.deepEqual(pb.ai.ek_motorlar, [{ motor: 'gemini', amac: 'görsel' }], 'bilinmeyen motor atılır');

// görev planı
const plan = planTasks(books['WEB-04'], '2026-11-09', { ekip: 5, freelancer: 9 });
assert.equal(plan.length, books['WEB-04'].asamalar.length);
assert.equal(plan[0].due_date, '2026-11-10'); assert.ok(plan.at(-1).due_date > plan[0].due_date, 'tarihler birikimli');
assert.ok(plan.some(x => x.title.startsWith('Müşteri kararı: ') && x.decision === 'onay'));
assert.ok(plan.every(x => x.assignee_id === 5), 'ekip ve yapay zekâ adımları ekip sorumlusunda');
const pf = planTasks({ asamalar: [{ ad: 'Çeviri', rol: 'freelancer', otomasyon: 'insan', gun: 3 }] }, '2026-11-09', { ekip: 5, freelancer: 9 });
assert.equal(pf[0].assignee_id, 9, 'freelancer adımı freelancera');
const st = stats(books['WEB-05']); assert.ok(st.gun > 20 && st.karar >= 2);
console.log('playbooks: ok');
