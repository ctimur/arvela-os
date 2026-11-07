import { normalize, syncKey, registerSync } from '../app/ext-sync.js';
import { siteHealth, latestWp } from '../app/ext-sites.js';
import assert from 'node:assert';
import crypto from 'node:crypto';

// Anahtar, GitHub betiğindeki Python hesabıyla aynı olmalı.
assert.equal(syncKey('abc'), crypto.createHmac('sha256', 'abc').update('arvela-site-sync').digest('hex'));
assert.equal(syncKey(''), '');
assert.equal(normalize({ domain: 'bad domain' }), null);
const n = normalize({ domain: 'Tuzla.org', platform: 'WordPress', wp_version: '5.1.19', wp_vulns: 80, ssl_status: 'active', ssl_expires: '2027-01-01T00:00:00Z', wp_valid: false, wp_error: 'Fatal error:  curly braces' });
assert.equal(n.domain, 'tuzla.org'); assert.ok(n.issue.startsWith('WordPress çalışmıyor: Fatal error: curly'));
assert.equal(normalize({ domain: 'a.com', ssl_status: 'weird' }).ssl_status, null);
assert.equal(normalize({ domain: 'a.com', enabled: false }).issue, "Site Hostinger'da askıya alınmış.");
assert.equal(normalize({ domain: 'a.com', enabled: true }).issue, null);
// sağlık
const now = Date.parse('2026-11-07');
assert.equal(siteHealth({ platform: 'WordPress', ssl_status: 'active', wp_version: latestWp(), wp_vulns: 0, ssl_expires: '2026-11-10' }, now).label, 'SSL bitiyor');
assert.equal(siteHealth({ platform: 'WordPress', ssl_status: 'active', wp_version: latestWp(), wp_vulns: 2 }, now).label, 'Güncelleme');
assert.equal(siteHealth({ platform: 'WordPress', ssl_status: 'active', wp_version: latestWp(), wp_vulns: 0, ssl_expires: '2027-03-01' }, now).label, 'Sağlıklı');
// rota: anahtarsız istek reddedilir, doğru anahtarla yazılır
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const routes = {}; const writes = [];
registerSync({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, HttpError, SETUP_TOKEN: 'tok',
  safeEqual: (a, b) => a === b,
  one: async (sql) => sql.includes('FROM agencies') ? { id: 1 } : sql.startsWith('UPDATE sites') ? (writes.push(sql), { id: 5 }) : null,
  q: async (sql, args) => { writes.push(sql); return {}; } });
const fn = routes['POST /api/site-sync'];
const res = { body: '', writeHead() {}, end(b) { this.body = b; } };
await assert.rejects(fn({ req: { headers: {} }, body: {} }, res), /Yetkisiz/);
await fn({ req: { headers: { authorization: 'Bearer ' + syncKey('tok') } }, body: { payload: JSON.stringify({ sites: [{ domain: 'a.com', ssl_status: 'active' }, { domain: '-' }], wp_latest: '7.1.5' }) } }, res);
assert.deepEqual(JSON.parse(res.body), { ok: true, total: 1, updated: 1, added: 0 });
assert.equal(latestWp(), '7.1.5');
console.log('sync: ok');
