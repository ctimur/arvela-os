// Arvela OS ↔ Social köprüsü (0.32): anahtar, doğrulama, e-posta iletimi.
import assert from 'node:assert';
import crypto from 'node:crypto';
import { bridgeKey, validMail, registerSocial } from '../app/ext-social.js';

assert.equal(bridgeKey(''), '');
assert.equal(bridgeKey('s'), crypto.createHmac('sha256', 's').update('arvela-social-bridge').digest('hex'));
assert.ok(validMail({ to: 'a@b.co', subject: 'x', html: '<p>y</p>' }).to);
assert.ok(validMail({ to: 'kotu', subject: 'x', html: 'y' }).error);
assert.ok(validMail({ to: 'a@b.co', subject: '', html: 'y' }).error);
assert.ok(validMail({ to: 'a@b.co', subject: 'x', html: 'y'.repeat(100_001) }).error);
assert.equal(validMail({ to: 'a@b.co', subject: 'a\r\nBcc: x@y.z', html: 'y' }).subject, 'a Bcc: x@y.z', 'başlık enjeksiyonu yok');
assert.equal(validMail({ to: 'A@B.co', subject: 'x', html: 'y', kind: 'zzz' }).kind, 'genel');

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const routes = {}; const sent = [];
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
registerSocial({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, one: async () => ({ id: 7 }), HttpError, safeEqual, SETUP_TOKEN: 'gizli',
  send: (res, st, body) => { res.st = st; res.body = body; }, sendMail: async (a, m) => { sent.push([a, m]); return true; } });
const call = async (auth, body) => { const res = {}; try { await routes['POST /api/social/mail']({ req: { headers: { authorization: auth } }, body }, res); return res; } catch (e) { return { st: e.status }; } };
assert.equal((await call('', { to: 'a@b.co', subject: 's', html: 'h' })).st, 403);
assert.equal((await call('Bearer yanlis', { to: 'a@b.co', subject: 's', html: 'h' })).st, 403);
assert.equal((await call('Bearer ' + bridgeKey('gizli'), { to: 'kotu', subject: 's', html: 'h' })).st, 400);
const ok = await call('Bearer ' + bridgeKey('gizli'), { to: 'a@b.co', subject: 's', html: 'h', kind: 'onay' });
assert.equal(ok.st, 200); assert.deepEqual(sent[0], [7, { to: 'a@b.co', subject: 's', html: 'h', kind: 'social-onay' }]);
const fs = await import('node:fs');
assert.ok(fs.readFileSync('deploy/deploy.py', 'utf8').includes("b'arvela-social-bridge'"), 'deploy.py aynı etiketle türetir');
const compose = fs.readFileSync('deploy/docker-compose.yml', 'utf8');
for (const k of ['SOCIAL_BRIDGE_KEY: ${SOCIAL_BRIDGE_KEY}', 'ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}', 'SOCIAL_BRIDGE_URL: http://app:3000']) assert.ok(compose.includes(k), k);
assert.ok(!/SOCIAL_AI_MOCK/.test(compose), 'canlıda sahte yapay zekâ kapalı');
console.log('social köprü testleri tamam');
const { validAccount, PLAN_CODES } = await import('../app/ext-social.js');
assert.ok(validAccount({ workspace_id: 'x', action: 'talep', plan: 'solo' }).error);
assert.ok(validAccount({ workspace_id: 3, action: 'sil', plan: 'solo' }).error);
assert.ok(validAccount({ workspace_id: 3, action: 'talep', plan: 'mega' }).error);
assert.ok(!validAccount({ workspace_id: 3, action: 'askida' }).error, 'askıda paket gerekmez');
const va = validAccount({ workspace_id: 3, action: 'aktif', plan: 'agency', name: 'Mavi', email: 'E@x.co', extra_brands: 99, editor_service: true, billing: { title: 'Mavi Ltd', tax_no: '123', note: 'n' } });
assert.deepEqual([va.ws, va.plan, va.name, va.email, va.extraBrands, va.editor], [3, 'agency', 'Mavi Ltd', 'e@x.co', 50, true]);
assert.ok(va.note.includes('Vergi/TC no: 123')); assert.equal(PLAN_CODES.business, 'SAAS-02');
console.log('social hesap aktarımı testleri tamam');
