import { clientBody, flowState, reworkStage, lateEnd, stageHelp, stageTasks } from '../app/ext-flow.js';
import { planTasks } from '../app/ext-playbooks.js';
import assert from 'node:assert';

const T = (id, no, role, status = 'yapilacak', extra = {}) => ({ id, stage_no: no, stage_role: role, status, title: 'A' + no, due_date: '2026-11-' + String(10 + no).padStart(2, '0'), ...extra });
const list = [T(3, 3, 'musteri'), T(1, 1, 'ekip', 'bitti'), T(2, 2, 'ai'), T(4, 4, 'ekip'), { id: 9, stage_no: null, status: 'yapilacak' }];

// sıra numarasına göre, aşama olmayan görev hariç
assert.deepEqual(stageTasks(list).map(x => x.id), [1, 2, 3, 4]);
const st = flowState(list);
assert.equal(st.total, 4); assert.equal(st.done, 1); assert.equal(st.cur.id, 2); assert.equal(st.no, 2); assert.equal(st.next.id, 3);
// hepsi bitince şu anki aşama yok
const all = flowState(list.map(x => ({ ...x, status: 'bitti' })));
assert.equal(all.cur, null); assert.equal(all.no, 4); assert.equal(all.next, null);
assert.equal(flowState([]).total, 0);

// düzeltme: karar aşamasından önceki son insan/yapay zekâ aşaması
assert.equal(reworkStage(list, T(3, 3, 'musteri')).id, 2);
assert.equal(reworkStage([T(1, 1, 'musteri'), T(2, 2, 'musteri')], T(2, 2, 'musteri')), null);

// teslim tarihi son aşamadan önceyse uyarı
assert.equal(lateEnd('2026-11-10', list), '2026-11-14');
assert.equal(lateEnd('2026-12-01', list), null);
assert.equal(lateEnd(null, list), null);

// açıklamalar her rolde bir sonraki adımı söyler
for (const r of ['ekip', 'ai', 'musteri', 'freelancer']) { const x = stageHelp(T(5, 5, r), T(6, 6, 'ekip')); assert.ok(x.what && x.after.includes('A6'), r); }
assert.ok(stageHelp(T(5, 5, 'musteri', 'incelemede', { approval_id: 7 }), null).what.includes('karar'));
assert.ok(stageHelp(null, null).after.includes('Tamamlandı'));

// görev planı: sıra numarası ve çift önek yok
const plan = planTasks({ asamalar: [{ ad: 'Brif', rol: 'ekip', gun: 2 }, { ad: 'Müşteri onayı: metin', rol: 'musteri', gun: 1, karar: 'onay' }, { ad: 'Taslak', rol: 'ai', gun: 1 }, { ad: 'Kapsam', rol: 'musteri', gun: 1 }] }, '2026-11-01');
assert.deepEqual(plan.map(x => x.stage_no), [1, 2, 3, 4]);
assert.equal(plan[1].title, 'Müşteri onayı: metin');
assert.equal(plan[2].title, 'Yapay zekâ: Taslak');
assert.equal(plan[3].title, 'Müşteri kararı: Kapsam');
assert.equal(plan.at(-1).due_date, '2026-11-06');
// müşteriye giden metinde iç bilgi yok
const cb = clientBody('Rol: Müşteri · İnsan (yapay zekâ destekli) · Karar: Onay / revizyon · n8n: Karar hatırlatma\nÇıktı: Yayın onayı\nKabul: Karar kaydı', 'Test');
assert.ok(!/Rol:|n8n|yapay/.test(cb)); assert.ok(cb.includes('Onayınıza sunulan: Yayın onayı') && cb.includes('Tamamlanan önceki adım: Test'));
assert.equal(clientBody('', null), null);
console.log('flow: ok');
