import { registerQuotes, totals } from '../app/ext-quotes.js';
import assert from 'node:assert';
const routes = {};
const quote = { id: 7, agency_id: 1, client_id: 3, client: 'Türev Store', title: 'Site & bakım', currency: 'TRY', discount_pct: '15.00', status: 'taslak', valid_until: '2099-01-01', notes: 'Not <b>', comment: null, sent_at: null, created_at: new Date() };
const items = [{ id: 1, quote_id: 7, service_id: 5, name: 'WEB-05 · Kurumsal site', billing: 'Tek seferlik', unit: 'site', qty: 1, unit_price: 55000 },
               { id: 2, quote_id: 7, service_id: 20, name: 'WEB-20 · Bakım', billing: 'Aylık', unit: 'site', qty: 2, unit_price: 3500 }];
const services = [{ id: 5, code: 'WEB-05', name: 'Kurumsal site', billing: 'Tek seferlik', price_try: 55000, price_eur: 3900, cat: 'Web' }];
let calls = [];
const d = {
  route: (m, p, fn) => { routes[m + ' ' + p] = fn; },
  all: async (sql) => { calls.push(sql); if (sql.includes('FROM quote_items')) return items; if (sql.includes('FROM services')) return services; if (sql.includes('FROM quotes')) return [quote]; if (sql.includes('FROM clients')) return [{ id: 3, name: 'Türev Store' }]; return []; },
  one: async (sql) => { calls.push(sql); if (sql.includes('UPDATE quotes')) return { ...quote, status: 'onaylandi' }; if (sql.includes('FROM quotes')) return quote; if (sql.includes('FROM services')) return { id: 5, code: 'WEB-05', name: 'Kurumsal site', billing: 'Tek seferlik', unit: 'site', price_try: 55000 }; if (sql.includes('INSERT INTO quotes')) return { id: 8 }; return { id: 3 }; },
  q: async (sql) => { calls.push(sql); return { rows: [] }; },
  need: () => {}, layout: (ctx, t, b) => `<title>${t}</title>${b}`, h: (v) => String(v ?? '').replace(/</g, '&lt;'), badge: (t) => `[${t}]`,
  fmtDate: (x) => x ? 'TARIH' : '—', fmtMoney: (n) => new Intl.NumberFormat('tr-TR').format(n), csrfField: () => '<csrf>', audit: async () => {},
  HttpError: class extends Error { constructor(s, m) { super(m); this.status = s; } }, int: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; },
  nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(),
};
registerQuotes(d);
const t = totals(quote, items);
assert.deepStrictEqual(t, { onceList: 55000, monthlyList: 7000, once: 46750, monthly: 5950, year: 118150, yearList: 139000 });
const res = () => { const r = { out: '', status: 0, headers: {} }; r.writeHead = (s, hd) => { r.status = s; r.headers = hd || {}; }; r.end = (b) => { r.out = b || ''; }; return r; };
const ctx = (body = {}) => ({ user: { id: 1, agency_id: 1, client_id: 3, role: 'admin' }, body });
for (const [k, p] of [['GET /teklifler', {}], ['GET /teklifler/:id', { id: '7' }], ['GET /portal/teklifler', {}], ['GET /portal/teklifler/:id', { id: '7' }]]) {
  const r = res(); await routes[k](ctx(), r, p); assert.equal(r.status, 200, k); assert(!/undefined|NaN|\[object/.test(r.out), k + ' içerikte undefined/NaN'); console.log('ok', k, r.out.length);
}
let r = res(); await routes['GET /teklifler/:id'](ctx(), r, { id: '7' });
assert(r.out.includes('46.750 TL') && r.out.includes('118.150 TL') && r.out.includes('%15 indirim') && r.out.includes('Not &lt;b>'), 'toplamlar');
quote.status = 'gonderildi'; r = res(); await routes['GET /portal/teklifler/:id'](ctx(), r, { id: '7' }); assert(r.out.includes('Teklifi onayla'), 'onay formu');
calls = []; r = res(); await routes['POST /portal/teklifler/:id/karar'](ctx({ decision: 'onaylandi' }), r, { id: '7' });
assert.equal(r.status, 303); assert.equal(calls.filter(c => c.includes('INSERT INTO client_services')).length, 2, 'onayda hizmet eklenmeli');
r = res(); await routes['POST /teklifler/:id/kalem'](ctx({ service_id: '5', qty: '2' }), r, { id: '7' }).catch(e => { assert.equal(e.status, 400); console.log('ok taslak değilken kalem eklenemez'); });
console.log('TÜM TESTLER GEÇTİ');
