import { nextStatus, registerForge, forgeKey } from '../app/ext-forge.js';
import assert from 'node:assert';

const A = 'a'.repeat(40), B = 'b'.repeat(40);
assert.equal(nextStatus(null, { state: 'open', head_sha: A }), 'bekliyor');
assert.equal(nextStatus({ status: 'onaylandi', head_sha: A }, { state: 'open', head_sha: A }), 'onaylandi');
assert.equal(nextStatus({ status: 'onaylandi', head_sha: A }, { state: 'open', head_sha: B }), 'bekliyor', 'onaydan sonra kod değişirse onay düşer');
assert.equal(nextStatus({ status: 'reddedildi', head_sha: A }, { state: 'open', head_sha: B }), 'bekliyor', 'reddedilen PR güncellenince yeniden incelenir');
assert.equal(nextStatus({ status: 'yayinda', head_sha: A }, { state: 'closed', merged: true, head_sha: A }), 'yayinda');
assert.equal(nextStatus({ status: 'bekliyor', head_sha: A }, { state: 'closed', merged: true, head_sha: A }), 'yayinda', 'birleştirilen değişiklik yayındadır');
assert.equal(nextStatus({ status: 'bekliyor', head_sha: A }, { state: 'closed', head_sha: A }), 'kapandi');
assert.equal(forgeKey(''), '');

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const db = { changes: new Map(), releases: [] }; const audits = [];
const one = async (sql, args) => {
  if (sql.includes('FROM forge_changes WHERE pr=$1')) return db.changes.get(args[0]) || null;
  if (sql.includes('FROM agencies')) return { id: 1 };
  if (sql.includes('FROM forge_releases WHERE id')) return db.releases.find(r => r.id === args[0]) || null;
  return null;
};
const q = async (sql, args) => {
  if (sql.startsWith('INSERT INTO forge_changes')) db.changes.set(args[0], { pr: args[0], title: args[1], head_sha: args[5], ci: args[10], status: args[11] });
  if (sql.startsWith(`UPDATE forge_changes SET status='onaylandi'`)) Object.assign(db.changes.get(args[2]), { status: 'onaylandi', approved_sha: args[0] });
  return { rows: [] };
};
const all = async (sql) => sql.includes("status='onaylandi'") ? [...db.changes.values()].filter(c => c.status === 'onaylandi').map(c => ({ pr: c.pr, sha: c.approved_sha })) : [];
const routes = {};
registerForge({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all, one, q, HttpError, need: (ctx, r) => { if (ctx.user?.role !== r) throw new HttpError(403, 'yetki'); },
  layout: (c, t, b) => b, h: String, badge: String, fmtDate: String, csrfField: () => '', int: (v) => parseInt(v, 10) || null, nn: (v) => v || null,
  redirect: () => {}, send: () => {}, safeEqual: (a, b) => a === b, audit: async (c, a, d) => audits.push(a), SETUP_TOKEN: 'tok', VERSION: '0.10.0' });
const key = forgeKey('tok'); const res = { writeHead() {}, end(b) { this.b = b; } };
const gh = (body) => ({ req: { headers: { authorization: 'Bearer ' + key } }, body: { payload: JSON.stringify(body) } });
await assert.rejects(routes['POST /api/forge/report']({ req: { headers: {} }, body: {} }, res), /Yetkisiz/);
await routes['POST /api/forge/report'](gh({ changes: [{ number: 7, title: 'Yeni özellik', head_sha: A, state: 'open', ci: 'pending' }] }), res);
assert.equal(db.changes.get(7).status, 'bekliyor');
const admin = (body) => ({ user: { id: 1, role: 'admin' }, body });
await assert.rejects(routes['POST /forge/:id/onayla'](admin({ sha: A }), res, { id: '7' }), /Testler/, 'testler geçmeden onay yok');
await routes['POST /api/forge/report'](gh({ changes: [{ number: 7, title: 'Yeni özellik', head_sha: A, state: 'open', ci: 'success' }] }), res);
await assert.rejects(routes['POST /forge/:id/onayla'](admin({ sha: B }), res, { id: '7' }), /güncellendi/, 'eski sürüme onay verilemez');
await assert.rejects(routes['POST /forge/:id/onayla']({ user: { id: 2, role: 'staff' }, body: { sha: A } }, res, { id: '7' }), /yetki/);
await routes['POST /forge/:id/onayla'](admin({ sha: A }), res, { id: '7' });
assert.equal(db.changes.get(7).status, 'onaylandi'); assert.ok(audits.includes('forge.approve'));
await routes['GET /api/forge/queue'](gh({}), res);
assert.deepEqual(JSON.parse(res.b).merge, [{ pr: 7, sha: A }]);
console.log('forge: ok');
