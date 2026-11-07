import { registerWork, likeArg, isLate, dateVal } from '../app/ext-work.js';
import assert from 'node:assert';

assert.equal(likeArg('50%_a\\'), '%50\\%\\_a\\\\%');
assert.equal(isLate({ due_date: '2026-11-01', status: 'yapilacak' }, new Date('2026-11-07')), true);
assert.equal(isLate({ due_date: '2026-11-01', status: 'bitti' }, new Date('2026-11-07')), false);
assert.equal(dateVal(null), '');

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const routes = {}; const writes = []; let out = null;
const task = { id: 5, agency_id: 1, project_id: 2, client_id: 3, title: 'Banner', status: 'yapilacak', assignee_id: 7, project: 'Kasım', client: 'Century21', assignee: 'Ali', priority: 'normal', due_date: '2026-11-01', description: 'Ayrıntı' };
const project = { id: 2, agency_id: 1, client_id: 3, client: 'Century21', name: 'Kasım', status: 'surecte', due_date: null, description: 'Kapsam' };
const all = async (sql) => {
  if (sql.includes('FROM task_comments')) return [{ author: 'Ali', body: 'Taslak hazır', created_at: '2026-11-06T10:00:00Z' }];
  if (sql.includes('FROM users')) return [{ id: 7, name: 'Ali', role: 'staff' }, { id: 9, name: 'Eda', role: 'freelancer' }];
  if (sql.includes('FROM tasks t')) return [task, { ...task, id: 6, title: 'Video', status: 'bitti', assignee: null }];
  if (sql.includes('FROM approvals')) return [{ id: 4, title: 'Takvim', status: 'bekliyor', client_id: 3, client: 'Century21', created_at: '2026-11-05' }];
  if (sql.includes('FROM projects')) return [{ ...project, total: 2, done: 1, late: 1 }];
  if (sql.includes('FROM clients')) return [{ id: 3, name: 'Century21' }];
  return [];
};
const one = async (sql) => {
  if (sql.includes('FROM tasks t JOIN projects')) return task;
  if (sql.includes('FROM projects p JOIN clients')) return project;
  if (sql.includes('count(*)')) return { n: 2 };
  if (sql.includes('FROM approvals ap')) return { id: 4, agency_id: 1, client_id: 3, client: 'Century21', title: 'Takvim', status: 'bekliyor', project_id: 2, project: 'Kasım' };
  if (sql.includes('FROM users')) return { ok: 1 };
  if (sql.includes('INSERT')) return { id: 99 };
  return null;
};
const q = async (sql, args) => { writes.push([sql, args]); return { rows: [] }; };
const h = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = (o) => o;
registerWork({
  route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all, one, q, h, HttpError,
  need: (ctx, ...r) => { if (!r.includes(ctx.user.role)) throw new HttpError(403, 'yetki'); },
  layout: (ctx, t, body) => body, badge: (t) => `<b>${h(t)}</b>`, fmtDate: (d) => d ? String(d).slice(0, 10) : '—', csrfField: () => '<i></i>',
  audit: async () => {}, int: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }, nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(),
  opts: (m, sel) => Object.entries(m).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join(''),
  ROLE: { admin: 'Yönetici', staff: 'Çalışan', freelancer: 'Freelancer' }, PR_ST: ST({ planlandi: 'Planlandı', surecte: 'Süreçte', onayda: 'Onayda', tamamlandi: 'Tamamlandı' }),
  TK_ST: { yapilacak: 'Yapılacak', yapiliyor: 'Yapılıyor', incelemede: 'İncelemede', bitti: 'Bitti' }, AP_ST: { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Düzeltme istendi' },
  CS_ST: { teklif: 'Teklifte', aktif: 'Aktif' }, STAFF: ['admin', 'staff'],
  redirect: (res, to) => { out = { redirect: to }; }, send: (res, s, html) => { out = { html }; },
});
const ctx = (role, id = 1, extra = {}) => ({ user: { id, agency_id: 1, role, name: 'X' }, url: new URL('http://x/?' + (extra.qs || '')), body: extra.body || {} });
const run = async (key, c, p = {}) => { out = null; await routes[key](c, {}, p); return out; };

for (const [k, p] of [['GET /projeler', {}], ['GET /projeler/:id', { id: '2' }], ['GET /gorev/:id', { id: '5' }], ['GET /gorevler', {}], ['GET /onaylar', {}], ['GET /onaylar/:id', { id: '4' }]]) {
  const r = await run(k, ctx('admin'), p); assert.ok(r.html.length > 200, k); console.log('ok', k);
}
let r = await run('GET /projeler/:id', ctx('admin'), { id: '2' });
assert.ok(r.html.includes('Projeyi sil') && r.html.includes('class="kanban"'));
r = await run('GET /projeler/:id', ctx('staff'), { id: '2' }); assert.ok(!r.html.includes('Projeyi sil'), 'çalışan projeyi silemez');
r = await run('GET /gorev/:id', ctx('admin'), { id: '5' }); assert.ok(r.html.includes('name="assignee_id"') && r.html.includes('Taslak hazır') && r.html.includes('gecikti'));
r = await run('GET /gorev/:id', ctx('freelancer', 7), { id: '5' }); assert.ok(!r.html.includes('name="assignee_id"') && r.html.includes('/not'), 'freelancer yalnız durum + not');
await assert.rejects(run('GET /gorev/:id', ctx('freelancer', 9), { id: '5' }), /atanmamış/);
await assert.rejects(run('POST /gorev/:id', ctx('freelancer', 7, { body: { title: 'x' } }), { id: '5' }), /yetki/);
await assert.rejects(run('POST /projeler/:id/sil', ctx('staff'), { id: '2' }), /yetki/);
r = await run('GET /gorevler', ctx('admin', 1, { qs: 'kim=hepsi&durum=gecikti&q=ban' })); assert.ok(r.html.includes('Tüm ekip'));
r = await run('POST /gorev/:id', ctx('staff', 1, { body: { title: 'Yeni ad', status: 'yapiliyor', assignee_id: '9', due_date: '2026-11-20', priority: 'yuksek', description: 'd' } }), { id: '5' });
assert.equal(r.redirect, '/gorev/5'); const upd = writes.find(w => w[0].startsWith('UPDATE tasks SET title'));
assert.deepEqual(upd[1], ['Yeni ad', 'yapiliyor', 9, '2026-11-20', 'd', 'yuksek', 5]);
r = await run('POST /gorev/:id/durum', ctx('freelancer', 7, { body: { status: 'bitti' } }), { id: '5' }); assert.equal(r.redirect, '/gorev/5');
r = await run('POST /onaylar/:id/karar', ctx('staff', 1, { body: { decision: 'onaylandi', comment: 'WhatsApp' } }), { id: '4' }); assert.equal(r.redirect, '/onaylar/4');
r = await run('GET /ara', ctx('admin', 1, { qs: 'q=ce' })); assert.ok(r.html.includes('Müşteriler'));
console.log('work: ok');
