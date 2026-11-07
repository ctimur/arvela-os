import { leadScore, crmActions, dtParse, waLink, registerCrm, STAGES } from '../app/ext-crm.js';
import assert from 'node:assert';

assert.equal(dtParse('2026-11-10T14:30'), '2026-11-10T11:30:00.000Z', 'İstanbul saati UTC+3');
assert.equal(dtParse('bad'), null);
assert.equal(waLink('0532 111 22 33'), 'https://wa.me/905321112233');
assert.ok(leadScore({ lead_source: 'referans', phone: '1', call_at: 'x' }) > leadScore({ lead_source: 'diger' }));
assert.ok(leadScore({ lead_source: 'referans', phone: 1, email: 1, sector: 1, call_at: 1, stage: 'teklif', value_estimate: 50000 }) <= 100);

const now = Date.parse('2026-11-07T10:00:00Z');
const acts = crmActions([
  { id: 1, name: 'Yeni A.Ş.', phone: '05321112233', stage: 'yeni', lead_source: 'web', created_at: '2026-11-07T09:55:00Z' },
  { id: 2, name: 'Görüşme Ltd', contact_name: 'Ayşe', stage: 'gorusme', call_at: '2026-11-07T10:20:00Z', created_at: '2026-11-01' },
  { id: 3, name: 'Takip', stage: 'teklif', next_action: 'Teklifi ara', next_action_at: '2026-11-06T09:00:00Z', created_at: '2026-10-01' },
  { id: 4, name: 'Sessiz', stage: 'ulasildi', created_at: '2026-10-01' }], now);
assert.equal(acts.length, 3);
assert.equal(acts.find(a => a.tag === 'Sıcak aday').score, 93, '15 dk içindeki sıcak aday en üstte');
assert.equal(acts.find(a => a.tag === 'Sıcak aday').actions[0][1], 'tel:05321112233');
assert.equal(acts.find(a => a.tag === 'Ön görüşme').score, 95, '30 dk içindeki görüşme');
assert.equal(acts.find(a => a.tag === 'Satış').title, 'Teklifi ara');

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const lead = { id: 9, agency_id: 1, name: 'Aday', stage: 'yeni', status: 'lead', lead_score: 40 };
const writes = [], audits = [];
const one = async (sql, args) => sql.includes('FROM clients c LEFT JOIN users') ? { ...lead } : sql.startsWith('INSERT INTO clients') ? (writes.push([sql, args]), { id: 9 }) : sql.includes('FROM users') ? { ok: 1 } : null;
const q = async (sql, args) => { writes.push([sql, args]); return {}; };
const routes = {}; let to = null;
registerCrm({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all: async () => [], one, q, need: () => {}, layout: (c, t, b) => b, h: String, badge: String, fmtMoney: String, csrfField: () => '', HttpError,
  int: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }, nn: (v) => v == null || String(v).trim() === '' ? null : String(v).trim(), redirect: (r, u) => { to = u; }, send: () => {}, STAFF: [], audit: async (c, a, d) => audits.push([a, d]), opts: () => '' });
const ctx = (body, role = 'staff') => ({ user: { id: 1, agency_id: 1, role }, body, url: new URL('http://x/satis') });
await routes['POST /satis'](ctx({ name: 'Yeni Firma', phone: '0532', lead_source: 'web', call_at: '2026-11-10T14:30', value_estimate: '20000' }), {});
const ins = writes.find(w => w[0].startsWith('INSERT INTO clients'));
assert.equal(ins[1][6], 'gorusme', 'ön görüşme saati varsa aşama ön görüşme'); assert.equal(ins[1][12], null, 'çalışan değer giremez');
assert.equal(audits.at(-1)[0], 'lead.create'); assert.equal(to, '/satis/9');
await routes['POST /satis/:id/not'](ctx({ kind: 'arama', body: 'Aradım, perşembe görüşelim', next_action: 'Görüşme', next_action_at: '2026-11-12T11:00' }), {}, { id: '9' });
const upd = writes.find(w => w[0].startsWith('UPDATE clients SET next_action'));
assert.equal(upd[1][2], 'ulasildi', 'ilk iletişimle Yeni → Ulaşıldı');
assert.ok(audits.some(a => a[0] === 'lead.stage' && a[1].to === 'ulasildi'));
await routes['POST /satis/:id/kazanildi'](ctx({}), {}, { id: '9' });
assert.ok(writes.some(w => w[0].includes("status='active', stage='kazanildi'")));
assert.deepEqual(audits.slice(-2).map(a => a[0]), ['lead.won', 'client.create'], 'kazanılınca karşılama akışı için yeni müşteri olayı');
assert.equal(to, '/musteriler/9');
await assert.rejects(routes['POST /satis/:id/not'](ctx({ body: ' ' }), {}, { id: '9' }), /boş/);
assert.equal(Object.keys(STAGES).length, 6);
console.log('crm: ok');

// pazarlama onayı: işaretlenince tarih yazılır, kaldırılınca silinir
writes.length = 0;
await routes['POST /satis/:id'](ctx({ name: 'Aday', stage: 'yeni', marketing_consent: 'on' }), {}, { id: '9' });
const cw = writes.find(w => w[0].includes('marketing_consent_at=$1'));
assert.ok(cw && cw[1][0] && cw[1][2] === 9, 'onay tarihi yazılır');
console.log('crm onay: ok');
