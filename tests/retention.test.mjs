import { readSettings, clampMonths, due, registerRetention } from '../app/ext-retention.js';
import assert from 'node:assert';

assert.deepEqual(readSettings([]), { lead_months: 24, audit_months: 24, auto: false, last_run: null, last_result: null }, 'varsayılan: kapalı');
assert.equal(clampMonths('2', 24), 6, 'en az 6 ay'); assert.equal(clampMonths('999', 24), 120); assert.equal(clampMonths('x', 24), 24);
const s = readSettings([{ key: 'retention.auto', value: '1' }, { key: 'retention.lead_months', value: '12' }]);
assert.equal(s.lead_months, 12); assert.ok(due(s), 'hiç çalışmadıysa zamanı gelmiş');
assert.ok(!due({ ...s, last_run: new Date().toISOString() }), 'bugün çalıştıysa bekler');
assert.ok(!due({ ...s, auto: false }), 'kapalıyken çalışmaz');

// çalıştırma: yalnız süresi dolan adaylar anonimleşir, kişisel veri alanları boşalır
const calls = [];
const settingsRows = [{ key: 'retention.lead_months', value: '12' }, { key: 'retention.audit_months', value: '24' }];
const all = async (sql, args) => { calls.push([sql, args]); if (sql.includes("key LIKE 'retention.%'")) return settingsRows; if (sql.startsWith('SELECT c.id')) return [{ id: 4 }, { id: 9 }]; return []; };
const q = async (sql, args) => { calls.push([sql, args]); return { rowCount: sql.startsWith('DELETE FROM audit') ? 17 : 1 }; };
const routes = {};
const r = registerRetention({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all, one: async () => ({ n: 0 }), q, need: (ctx, ...roles) => { if (!roles.includes(ctx.user.role)) throw Object.assign(new Error('yetki'), { status: 403 }); },
  layout: (c, t, b) => b, h: String, csrfField: () => '', HttpError: Error, redirect: () => {}, send: () => {}, audit: async () => {}, fmtDate: String, noTimer: true });
const out = await r.run(1, 5);
assert.deepEqual([out.leads, out.logs], [2, 17]);
const anon = calls.filter(c => c[0].startsWith('UPDATE clients SET name=$2'));
assert.equal(anon.length, 2); assert.ok(anon[0][0].includes('phone=NULL') && anon[0][0].includes('email=NULL') && anon[0][1][1] === 'Anonim aday #4');
assert.ok(calls.some(c => c[0].startsWith('SELECT c.id') && c[1][1] === 12), 'ayarlanan süre kullanılır');
assert.ok(calls.at(-1)[0].startsWith('INSERT INTO audit') && !JSON.stringify(calls.at(-1)[1]).includes('Anonim'), 'kayıt kişisel veri içermez');
await assert.rejects(routes['POST /veri-saklama/uygula']({ user: { role: 'staff', agency_id: 1 } }, {}, {}), (e) => e.status === 403, 'yalnız Yönetici');
console.log('retention: ok');
