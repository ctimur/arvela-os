import { packageValue, balances, canMove, parseDuration, hm, packageActions, registerFreelance } from '../app/ext-freelance.js';
import assert from 'node:assert';

// değer
assert.equal(packageValue({ pay_type: 'sabit', amount: 7500 }, 600), 7500, 'sabit ücret süreden bağımsız');
assert.equal(packageValue({ pay_type: 'saatlik', hourly_rate: 400 }, 90), 600);
assert.equal(packageValue({ pay_type: 'saatlik', hourly_rate: 400, hour_cap: 2 }, 300), 800, 'saat sınırında durur');
assert.equal(packageValue({ pay_type: 'saatlik' }, 60), 0);

// bakiye
const bal = balances([
  { freelancer_id: 1, freelancer: 'Ece', status: 'onaylandi', pay_type: 'sabit', amount: 5000 },
  { freelancer_id: 1, freelancer: 'Ece', status: 'onaylandi', pay_type: 'saatlik', hourly_rate: 300, minutes: 120 },
  { freelancer_id: 1, freelancer: 'Ece', status: 'surecte', pay_type: 'sabit', amount: 2000 },
  { freelancer_id: 1, freelancer: 'Ece', status: 'teklif', pay_type: 'sabit', amount: 9999 },
  { freelancer_id: 2, freelancer: 'Can', status: 'iptal', pay_type: 'sabit', amount: 3000 },
], [{ freelancer_id: 1, amount: 4000 }, { freelancer_id: 2, amount: 100 }]);
const ece = bal.find(r => r.id === 1), can = bal.find(r => r.id === 2);
assert.deepEqual([ece.earned, ece.pending, ece.paid, ece.owed], [5600, 2000, 4000, 1600], 'teklif ve iptal sayılmaz');
assert.equal(can.owed, -100, 'fazla ödeme eksi görünür');
assert.equal(bal[0].id, 1, 'borcu en yüksek önce');

// yetki
assert.ok(canMove('freelancer', true, 'teklif', 'kabul'));
assert.ok(canMove('freelancer', true, 'teklif', 'iptal'));
assert.ok(canMove('freelancer', true, 'surecte', 'teslim'));
assert.ok(!canMove('freelancer', true, 'teslim', 'onaylandi'), 'freelancer kendi işini onaylayamaz');
assert.ok(!canMove('freelancer', false, 'teklif', 'kabul'), 'başkasının paketi');
assert.ok(!canMove('freelancer', true, 'onaylandi', 'teslim'));
assert.ok(canMove('staff', false, 'teslim', 'onaylandi'));
assert.ok(!canMove('client', false, 'teklif', 'kabul'));
assert.ok(!canMove('admin', false, 'teklif', 'yok'));

// süre
assert.equal(parseDuration('1:30'), 90);
assert.equal(parseDuration('1,5'), 90);
assert.equal(parseDuration('2'), 120);
assert.equal(parseDuration('45 dk'), 45);
assert.equal(parseDuration('2 saat'), 120);
assert.equal(parseDuration('abc'), null);
assert.equal(parseDuration(''), null);
assert.equal(hm(95), '1 sa 35 dk');
assert.equal(packageActions([{ id: 3, title: 'Logo', freelancer: 'Ece' }])[0].actions[0][1], '/paketler/3');

// rotalar: yetki ve para görünürlüğü
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const pkg = { id: 5, agency_id: 1, freelancer_id: 7, freelancer: 'Ece', title: 'Banner seti', status: 'teklif', pay_type: 'sabit', amount: 12345, minutes: 0 };
let cur = { ...pkg }; const writes = [], audits = [];
const one = async (sql, args) => {
  if (sql.includes('FROM work_packages w JOIN users u')) return { ...cur };
  if (sql.startsWith('INSERT INTO work_packages')) { writes.push([sql, args]); return { id: 6 }; }
  if (sql.includes("role='freelancer'")) return args[0] === 7 ? { ok: 1 } : null;
  return null;
};
const q = async (sql, args) => { writes.push([sql, args]); return {}; };
const routes = {}; let to = null, html = '';
registerFreelance({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all: async () => [], one, q,
  need: (ctx, ...roles) => { if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'yetki'); }, layout: (c, t, b) => b, h: (v) => v == null ? '' : String(v), badge: String, fmtDate: String,
  fmtMoney: (n) => String(n), csrfField: () => '', HttpError, int: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; },
  nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(), redirect: (r, u) => { to = u; }, send: (r, s, b) => { html = b; }, STAFF: ['admin', 'staff'], audit: async (c, a, d) => audits.push([a, d]), opts: () => '' });
const ctx = (role, id = 1, body = {}) => ({ user: { id, agency_id: 1, role }, body, url: new URL('http://x/paketler/5') });

await routes['GET /paketler/:id'](ctx('staff'), {}, { id: '5' });
assert.ok(!html.includes('12345'), 'Çalışan tutarı görmez');
await routes['GET /paketler/:id'](ctx('admin'), {}, { id: '5' });
assert.ok(html.includes('12345'), 'Yönetici tutarı görür');
await routes['GET /paketler/:id'](ctx('freelancer', 7), {}, { id: '5' });
assert.ok(html.includes('12345') && html.includes('Kabul et'), 'freelancer kendi ücretini ve kabul düğmesini görür');
await assert.rejects(routes['GET /paketler/:id'](ctx('freelancer', 8), {}, { id: '5' }), (e) => e.status === 404, 'başka freelancer göremez');

await routes['POST /paketler/:id/durum'](ctx('freelancer', 7, { status: 'kabul' }), {}, { id: '5' });
assert.ok(writes.at(-1)[0].includes('accepted_at=now()') && writes.at(-1)[1][0] === 'kabul');
cur = { ...pkg, status: 'teslim' };
await assert.rejects(routes['POST /paketler/:id/durum'](ctx('freelancer', 7, { status: 'onaylandi' }), {}, { id: '5' }), (e) => e.status === 403);
await routes['POST /paketler/:id/durum'](ctx('staff', 1, { status: 'onaylandi' }), {}, { id: '5' });
assert.ok(writes.at(-1)[0].includes('approved_at=now()'));
assert.equal(audits.at(-1)[0], 'package.status');

cur = { ...pkg, status: 'kabul' };
await routes['POST /paketler/:id/sure'](ctx('freelancer', 7, { duration: '1:15', work_date: '2026-11-08', note: 'taslak' }), {}, { id: '5' });
assert.deepEqual(writes.at(-2)[1].slice(2, 4), ['2026-11-08', 75]);
assert.ok(writes.at(-1)[0].includes("status='surecte'"), 'ilk süre kaydı paketi "Sürüyor"a alır');
cur = { ...pkg, status: 'onaylandi' };
await assert.rejects(routes['POST /paketler/:id/sure'](ctx('freelancer', 7, { duration: '1' }), {}, { id: '5' }), (e) => e.status === 403, 'onaylanan pakete süre eklenmez');
await assert.rejects(routes['POST /paketler/:id/sure'](ctx('staff', 1, { duration: '1' }), {}, { id: '5' }), (e) => e.status === 403);

// oluşturma: Çalışanın girdiği ücret yok sayılır
await routes['POST /paketler'](ctx('staff', 1, { title: 'Yeni', freelancer_id: '7', pay_type: 'saatlik', hourly_rate: '999' }), {}, {});
const ins = writes.find(w => w[0].startsWith('INSERT INTO work_packages'))[1];
assert.deepEqual(ins.slice(5, 8), ['sabit', null, null], 'ücreti yalnız Yönetici belirler');
await assert.rejects(routes['POST /paketler'](ctx('staff', 1, { title: 'Yeni', freelancer_id: '8' }), {}, {}), (e) => e.status === 400);
await assert.rejects(routes['POST /odemeler'](ctx('staff', 1, { freelancer_id: '7', amount: '100' }), {}, {}), (e) => e.status === 403, 'ödemeyi yalnız Yönetici kaydeder');
await assert.rejects(routes['POST /paketler'](ctx('freelancer', 7, { title: 'x', freelancer_id: '7' }), {}, {}), (e) => e.status === 403);
console.log('freelance: ok');
