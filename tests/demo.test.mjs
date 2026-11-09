import { rewriteHref, shift, fixture } from '../app/ext-demo.js';
import assert from 'node:assert';
const ids = { tasks: new Map([[12, 431]]), quotes: new Map([[3, 77]]), clients: new Map([[26, 900]]) };
assert.equal(rewriteHref('/gorev/12#oneriler', ids), '/gorev/431#oneriler');
assert.equal(rewriteHref('/portal/teklifler/3', ids), '/portal/teklifler/77');
assert.equal(rewriteHref('/satis/26', ids), '/satis/900');
assert.equal(rewriteHref('/gorev/99', ids), '/gorev/99', 'bilinmeyen kimlik olduğu gibi kalır');
assert.equal(shift('2026-11-09', 'date', 3 * 864e5), '2026-11-12');
assert.equal(shift('2026-11-09T10:00:00.000Z', 'timestamp with time zone', 3600e3), '2026-11-09T11:00:00.000Z');
const F = fixture();
const names = F.tables.map(t => t.name);
for (const t of F.tables) {
  for (const [c, ref] of Object.entries(F.fks[t.name] || {})) if (!['agencies', 'services', 'users'].includes(ref)) assert.ok(names.indexOf(ref) >= 0, `${t.name}.${c} → ${ref} yüklenen tablolarda`);
  for (const r of t.rows) assert.ok(!('pass_hash' in r), 'şifre dışa aktarılmaz');
}
for (const u of F.tables.find(t => t.name === 'users').rows) assert.match(u.email, /@demo\.arvela\.test$/, 'demo hesaplar gerçek adrese gitmez');
for (const i of F.tables.find(t => t.name === 'invoices').rows) assert.match(i.number, /^DEMO-/, 'demo fatura numarası');
assert.ok(F.tables.find(t => t.name === 'clients').rows.length >= 3);
