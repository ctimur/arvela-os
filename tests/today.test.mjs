import { buildActions, buildPulse, waNumber } from '../app/ext-today.js';
import assert from 'node:assert';

assert.equal(waNumber('0532 123 45 67'), '905321234567');
assert.equal(waNumber('+90 532 123 45 67'), '905321234567');
assert.equal(waNumber('532 123 45 67'), '905321234567');
assert.equal(waNumber('12'), null);
assert.equal(waNumber(null), null);

const now = new Date('2026-11-07T09:00:00Z').getTime();
const d = {
  sites: [{ client_id: 1, client: 'Tuzla Yelken', domain: 'tuzla.org', issue: 'PHP uyumsuz', ssl_status: 'active', checked_at: '2026-11-04' },
    { client_id: 2, client: 'Lotus', domain: 'lotus.com', platform: 'WordPress', ssl_status: 'active', wp_version: '7.1.4' }],
  overdue: [{ id: 5, client_id: 3, client: 'Türev Store', number: 'ARV-2026-0002', due_date: '2026-11-01', phone: '05321234567' }],
  notified: [{ id: 6, client: 'Redstone', number: 'ARV-2026-0003', client_notified_at: '2026-11-06' }],
  approvals: [{ client_id: 4, client: 'Century21', title: 'Kasım takvimi', created_at: '2026-11-04', phone: '' }],
  tasks: [], draftQuotes: [{ id: 7, client: 'Türev Store', title: 'Site', created_at: '2026-11-07' }], draftInvoices: [],
  clients: [{ id: 1, name: 'Tuzla Yelken' }, { id: 2, name: 'Lotus' }, { id: 3, name: 'Türev Store' }, { id: 4, name: 'Century21' }],
  monthlyDue: 2, period: '2026-11',
};
const a = buildActions(d, { admin: true, now });
assert.equal(a[0].tag, 'Acil · Site');
assert.equal(a[1].tag, 'Havale');
assert.ok(a.find(x => x.tag === 'Gecikmiş fatura').actions[0][1].startsWith('https://wa.me/905321234567?text='));
assert.equal(a.find(x => x.tag === 'Onay').actions[0][0], 'Müşteriyi aç'); // telefonsuz: WhatsApp yok
assert.ok(a.some(x => x.title.includes('aylık faturaları')));
const s = buildActions(d, { admin: false, now });
assert.ok(!s.some(x => ['Havale', 'Gecikmiş fatura', 'Teklif · taslak', 'Fatura'].includes(x.tag)), 'çalışan para işlerini görmez');
const p = buildPulse(d);
assert.deepEqual(p.map(x => x.label), ['Site sorunu', 'Ödeme gecikti', 'Onay bekliyor', 'Sağlıklı']);
console.log('today: ok');
