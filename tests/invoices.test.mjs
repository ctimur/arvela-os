import { registerInvoices, invoiceTotals, isOverdue } from '../app/ext-invoices.js';
import assert from 'node:assert';

const routes = {};
const inv = { id: 3, agency_id: 1, client_id: 4, client: 'Türev Store', number: 'ARV-2026-0001', period: '2026-11', currency: 'TRY', vat_pct: '20.00',
  issue_date: new Date('2026-11-07'), due_date: new Date('2026-11-14'), status: 'taslak', official_no: null, notes: null, client_notified_at: null, paid_at: null, paid_amount: null, payment_ref: null };
const items = [{ id: 1, invoice_id: 3, name: 'WEB-20 · Bakım (2026-11)', qty: 1, unit_price: 3500 }, { id: 2, invoice_id: 3, name: 'WEB-21 · Hosting (2026-11)', qty: 2, unit_price: 1500 }];
let calls = []; let invoiceSeq = 0;
const monthly = [{ client_id: 4, service_id: 20, code: 'WEB-20', name: 'Bakım', price_try: 3500 }, { client_id: 4, service_id: 21, code: 'WEB-21', name: 'Hosting', price_try: 1500 }, { client_id: 9, service_id: 21, code: 'WEB-21', name: 'Hosting', price_try: 1500 }];
const d = {
  route: (m, p, fn) => { routes[m + ' ' + p] = fn; },
  all: async (sql) => {
    calls.push(sql);
    if (sql.includes('FROM settings')) return [{ key: 'iban', value: 'TR00 0000 0000 0000 0000 0000 00' }, { key: 'banka', value: 'Örnek Bank' }];
    if (sql.includes('FROM client_services')) return monthly;
    if (sql.includes('FROM invoice_items WHERE invoice_id=$1 ORDER')) return items;
    if (sql.includes('FROM quote_items')) return [{ service_id: 5, name: 'WEB-05 · Site', billing: 'Tek seferlik', qty: 1, unit_price: 55000 }, { service_id: 20, name: 'WEB-20 · Bakım', billing: 'Aylık', qty: 1, unit_price: 3500 }];
    if (sql.includes('FROM invoices i JOIN clients')) return [{ ...inv, sub: '6500' }, { ...inv, id: 4, status: 'gonderildi', due_date: new Date('2020-01-01'), sub: '1000' }];
    if (sql.includes('FROM invoices i WHERE i.client_id')) return [{ ...inv, status: 'gonderildi', sub: '6500' }];
    if (sql.includes('FROM quotes')) return [];
    if (sql.includes('FROM clients')) return [{ id: 4, name: 'Türev Store' }];
    return [];
  },
  one: async (sql, params) => {
    calls.push(sql);
    if (sql.includes('count(*)')) return { n: 0 };
    if (sql.includes('INSERT INTO invoices')) return { id: 100 + (invoiceSeq++) };
    if (sql.includes('FROM quotes')) return { id: 7, client_id: 4, currency: 'TRY', discount_pct: '10.00' };
    if (sql.includes('UPDATE invoices SET client_notified_at')) return { id: 3 };
    if (sql.includes('FROM invoices i JOIN clients')) return inv;
    if (sql.includes('FROM invoices WHERE')) return { ...inv, status: 'gonderildi' };
    if (sql.includes('FROM clients')) return { id: 4 };
    return null;
  },
  q: async (sql, params) => { calls.push([sql, params]); return { rows: [] }; },
  need: () => {}, layout: (ctx, t, b) => `<title>${t}</title>${b}`, h: (v) => String(v ?? '').replace(/</g, '&lt;'), badge: (t) => `[${t}]`,
  fmtDate: (x) => x ? 'TARIH' : '—', fmtMoney: (n) => new Intl.NumberFormat('tr-TR').format(n), csrfField: () => '<csrf>', audit: async () => {},
  HttpError: class extends Error { constructor(s, m) { super(m); this.status = s; } }, int: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; },
  nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(),
};
registerInvoices(d);

assert.deepStrictEqual(invoiceTotals(inv, items), { sub: 6500, vat: 1300, total: 7800 });
assert.equal(isOverdue({ status: 'gonderildi', due_date: '2020-01-01' }), true);
assert.equal(isOverdue({ status: 'odendi', due_date: '2020-01-01' }), false);

const res = () => { const r = { out: '', status: 0 }; r.writeHead = (s) => { r.status = s; }; r.end = (b) => { r.out = b || ''; }; return r; };
const ctx = (body = {}, qs = '') => ({ user: { id: 1, agency_id: 1, client_id: 4, role: 'admin' }, body, url: new URL('http://x/faturalar' + qs) });
for (const [k, p] of [['GET /faturalar', {}], ['GET /faturalar/:id', { id: '3' }], ['GET /faturalar/ayarlar', {}], ['GET /portal/faturalar', {}], ['GET /portal/faturalar/:id', { id: '3' }]]) {
  const r = res(); await routes[k](ctx(), r, p); assert.equal(r.status, 200, k);
  assert(!/undefined|NaN|\[object/.test(r.out), k + ': undefined/NaN'); console.log('ok', k);
}
let r = res(); await routes['GET /faturalar/:id'](ctx(), r, { id: '3' });
assert(r.out.includes('7.800 TL') && r.out.includes('KDV %20'), 'toplam + KDV');
r = res(); await routes['GET /faturalar'](ctx({}, '?durum=gecikti'), r, {});
assert(r.out.includes('[Gecikti]'), 'gecikmiş filtre');
r = res(); await routes['GET /portal/faturalar/:id'](ctx(), r, { id: '3' });
assert(r.out.includes('TR00 0000') && r.out.includes('Ödemeyi yaptım') && r.out.includes('ARV-2026-0001'), 'portal havale bilgisi');

calls = []; invoiceSeq = 0; r = res(); await routes['POST /faturalar/aylik'](ctx({ period: '2026-11' }), r, {});
assert.equal(calls.filter(c => typeof c === 'string' && c.includes('INSERT INTO invoices')).length, 2, 'iki müşteri için iki taslak');
assert.equal(calls.filter(c => Array.isArray(c) && c[0].includes('INSERT INTO invoice_items')).length, 3, 'üç kalem');
console.log('ok aylık faturalar');

calls = []; r = res(); await routes['POST /faturalar/tekliften'](ctx({ quote_id: '7' }), r, {});
const lines = calls.filter(c => Array.isArray(c) && c[0].includes('INSERT INTO invoice_items')).map(c => c[1]);
assert.equal(lines[0][4], 49500, '%10 indirimli tek seferlik'); assert.equal(lines[1][4], 3150, '%10 indirimli ilk ay'); assert(lines[1][2].includes('(ilk ay)'));
console.log('ok tekliften fatura');

await routes['POST /faturalar/aylik'](ctx({ period: '2026/11' }), res(), {}).then(() => assert.fail('hatalı dönem kabul edildi'), e => assert.equal(e.status, 400));
await routes['POST /faturalar/ayarlar'](ctx({ iban: 'DE123' }), res(), {}).then(() => assert.fail('hatalı IBAN kabul edildi'), e => assert.equal(e.status, 400));
calls = []; await routes['POST /faturalar/ayarlar'](ctx({ iban: 'tr330006100519786457841326', banka: 'X' }), res(), {});
assert(calls.some(c => Array.isArray(c) && c[1][2] === 'TR33 0006 1005 1978 6457 8413 26'), 'IBAN biçimlendirme');
console.log('ok doğrulamalar');
console.log('TÜM TESTLER GEÇTİ');
