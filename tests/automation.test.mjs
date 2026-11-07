import { registerAutomation, sign, hashKey, newApiKey, matches, validUrl, EVENTS, EVENT_LABEL } from '../app/ext-automation.js';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';

for (const e of Object.values(EVENTS).flat()) assert.ok(EVENT_LABEL[e], 'etiket eksik: ' + e);
const { key, prefix } = newApiKey();
assert.match(key, /^arv_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}$/); assert.ok(key.includes(prefix));
assert.ok(matches({ active: true, events: ['*'] }, 'task.create'));
assert.ok(!matches({ active: true, events: ['task.status'] }, 'task.create'));
assert.ok(!matches({ active: false, events: ['*'] }, 'task.create'));
assert.ok(validUrl('https://n8n.arveladigital.com/webhook/x') && !validUrl('http://a.com') && !validUrl('javascript:alert(1)'));

// Webhook alıcı: imzayı doğrular
const got = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got.push({ h: req.headers, b }); res.end('ok'); }); });
await new Promise(r => srv.listen(0, r));
const url = `http://127.0.0.1:${srv.address().port}/hook`;
const hook = { id: 1, agency_id: 1, name: 'n8n', url, secret: 's3cret', events: ['*'], active: true };
const apiKey = { id: 9, agency_id: 1, name: 'n8n', prefix, key_hash: hashKey(key), scopes: ['is', 'yaz'] };
const writes = [];
const task = { id: 5, title: 'Banner', status: 'yapilacak', project: 'Kasım', client: 'C21', url: 'https://os.arveladigital.com/gorev/5' };
const all = async (sql) => sql.includes('FROM webhooks WHERE agency_id') ? [hook] : sql.includes('FROM tasks t JOIN projects') ? [task] : [];
const one = async (sql, args) => {
  if (sql.includes('FROM webhooks WHERE agency_id=$1 AND active LIMIT 1')) return { '?column?': 1 };
  if (sql.startsWith('INSERT INTO webhook_deliveries')) return { id: 77 };
  if (sql.includes('FROM api_keys WHERE prefix')) return args[0] === prefix ? apiKey : null;
  if (sql.includes('FROM tasks t JOIN projects')) return task;
  if (sql.includes('FROM projects WHERE id=$1 AND agency_id')) return { id: 2 };
  if (sql.includes('SELECT id FROM tasks WHERE id=$1 AND agency_id')) return { id: 5 };
  if (sql.startsWith('INSERT INTO tasks')) return { id: 6 };
  return null;
};
const q = async (sql, args) => { writes.push([sql, args]); return {}; };
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const routes = {}; const audits = [];
const hooks = registerAutomation({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all, one, q, HttpError, need: () => {}, layout: (c, t, b) => b, h: (x) => String(x ?? ''), badge: (t) => t, fmtDate: (x) => x,
  csrfField: () => '', int: (v) => parseInt(v, 10) || null, nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(), redirect: () => {}, send: () => {}, STAFF: [], TK_ST: { yapilacak: 1, yapiliyor: 1, incelemede: 1, bitti: 1 }, PR_ST: {},
  audit: async (ctx, action, detail) => { audits.push([action, detail]); await hooks.onAudit(ctx, action, detail); }, safeEqual: (a, b) => a === b });

await hooks.onAudit({ user: { id: 1, agency_id: 1, name: 'Can', role: 'admin' } }, 'task.status', { id: 5, status: 'yapiliyor' });
await new Promise(r => setTimeout(r, 300));
assert.equal(got.length, 1);
const g = got[0]; const body = JSON.parse(g.b);
assert.equal(g.h['x-arvela-signature'], 'sha256=' + crypto.createHmac('sha256', 's3cret').update(g.b).digest('hex'));
assert.equal(body.event, 'task.status'); assert.equal(body.data.title, 'Banner'); assert.equal(body.data.status, 'yapilacak'); assert.equal(body.actor.name, 'Can'); assert.equal(body.delivery, 77);
assert.ok(writes.some(w => w[0].startsWith('UPDATE webhook_deliveries') && w[1][1] === true), 'teslim başarılı kaydedilir');
// olay listesinde olmayan işlem gönderilmez
got.length = 0; await hooks.onAudit({ user: { id: 1, agency_id: 1 } }, 'user.create', {}); await new Promise(r => setTimeout(r, 100)); assert.equal(got.length, 0);

// API: anahtarsız 401, yanlış yetki 403, görev ekleme
const res = { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
const ctx = (auth, body) => ({ req: { headers: auth ? { authorization: 'Bearer ' + auth } : {} }, url: new URL('http://x/api/v1/tasks'), body });
await assert.rejects(routes['GET /api/v1/tasks'](ctx(null), res, {}), (e) => e.status === 401);
await assert.rejects(routes['GET /api/v1/tasks'](ctx('arv_00000000_' + 'x'.repeat(30)), res, {}), (e) => e.status === 401);
await assert.rejects(routes['GET /api/v1/invoices'](ctx(key), res, {}), (e) => e.status === 403);
await routes['POST /api/v1/tasks'](ctx(key, { project_id: 2, title: 'n8n görevi', priority: 'yuksek' }), res, {});
assert.equal(res.status, 200); assert.equal(JSON.parse(res.body).id, 6);
assert.deepEqual(audits.at(-1), ['task.create', { id: 6, project: 2, via: 'api' }]);
await new Promise(r => setTimeout(r, 200));
assert.equal(JSON.parse(got.at(-1).b).source, 'api');
await assert.rejects(routes['POST /api/v1/tasks/:id/status'](ctx(key, { status: 'uçuyor' }), res, { id: '5' }), /Durum/);
srv.close();
console.log('automation: ok');
