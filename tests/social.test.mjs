// Arvela Social (0.31): paket sınırları, durum geçişleri, şablon çizimi ve yardımcılar. Veritabanı gerektirmez.
import assert from 'node:assert';
import { PLANS, limits, canUse, transition, FORMATS, PLATFORMS } from '../app/social/plans.mjs';
import { TEMPLATES, renderSvg, fit, onColor, brandColors } from '../app/social/templates.mjs';
import { esc, validEmail, validPassword, hashPassword, checkPassword, fromLocalInput, toLocalInput, dayKey, imageType, parseMultipart } from '../app/social/lib.mjs';

// --- Paketler (katalog SAAS-01…03) ---
assert.deepEqual([PLANS.solo.brands, PLANS.solo.users, PLANS.solo.accounts], [1, 1, 2]);
assert.deepEqual([PLANS.business.brands, PLANS.business.users, PLANS.business.accounts, PLANS.business.approvals], [1, 3, 5, true]);
assert.deepEqual([PLANS.agency.brands, PLANS.agency.users, PLANS.agency.clientLinks, PLANS.agency.aiImages], [5, 10, true, true]);
assert.equal(PLANS.solo.aiImages, false);

const now = new Date('2026-11-09T12:00:00Z');
const trial = { status: 'deneme', plan: null, trial_ends: '2026-11-20' };
assert.equal(canUse(trial, now), true);
assert.equal(limits(trial, now).approvals, true, 'deneme Business özellikleriyle');
assert.equal(canUse({ ...trial, trial_ends: '2026-11-01' }, now), false, 'süresi biten deneme');
assert.equal(canUse({ status: 'askida', plan: 'solo' }, now), false);
assert.equal(canUse({ status: 'aktif', plan: 'solo', paid_until: '2026-11-05' }, now), true, '7 gün tolerans');
assert.equal(canUse({ status: 'aktif', plan: 'solo', paid_until: '2026-10-20' }, now), false);
assert.equal(limits({ status: 'aktif', plan: 'solo', extra_brands: 2 }, now).brands, 3, 'ek marka');

// --- Durum geçişleri ---
const biz = PLANS.business, solo = PLANS.solo;
assert.equal(transition('onaya', { status: 'taslak' }, 'editor', biz).to, 'onay');
assert.ok(transition('onaya', { status: 'taslak' }, 'editor', solo).error, 'Solo’da onay akışı yok');
assert.ok(transition('onayla', { status: 'onay' }, 'editor', biz).error, 'editör kendi gönderisini onaylayamaz');
assert.equal(transition('onayla', { status: 'onay' }, 'approver', biz).to, 'onaylandi');
assert.equal(transition('onayla', { status: 'taslak' }, 'owner', solo).to, 'onaylandi', 'Solo’da doğrudan onay');
assert.equal(transition('duzeltme', { status: 'onay' }, 'approver', biz).to, 'duzeltme');
assert.ok(transition('paylasildi', { status: 'taslak' }, 'owner', biz).error, 'onaysız paylaşılamaz');
assert.equal(transition('paylasildi', { status: 'taslak' }, 'owner', solo).to, 'paylasildi');
assert.ok(transition('paylasildi', { status: 'onaylandi' }, 'approver', biz).error, 'onaylayıcı paylaşım işaretlemez');
assert.ok(transition('yok', { status: 'taslak' }, 'owner', biz).error);
assert.ok(transition('iptal', { status: 'paylasildi' }, 'owner', biz).error);

// --- Şablonlar: her şablon × biçim geçerli SVG üretir, metin kaçışlanır ---
const brand = { name: 'Kuzey <Kahve>', colors: { primary: '#1F3A2E', accent: '#E2BE7A' }, font: 'modern' };
for (const t of Object.keys(TEMPLATES)) for (const f of Object.keys(FORMATS)) {
  const svg = renderSvg({ template: t, format: f, brand, data: { title: 'Kış <harmanı> & "yeni"', sub: 'Tüm şubelerde', items: 'Bir\nİki\nÜç', cta: 'Hemen', label: 'Yeni' } });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${t}/${f}`);
  assert.ok(svg.includes(`viewBox="0 0 ${FORMATS[f].w} ${FORMATS[f].h}"`), `${t}/${f} boyut`);
  assert.ok(!svg.includes('<harmanı>') && !svg.includes('<Kahve>'), `${t}/${f} kaçış`);
  assert.ok(!/<script|on\w+=/i.test(svg), `${t}/${f} betik yok`);
}
const lines = fit('Bu çok uzun bir başlık ve satırlara bölünmeli ki görsele sığsın', 600, 3, [80, 64, 52]);
assert.ok(lines.lines.length <= 3 && lines.size <= 80);
assert.notEqual(onColor('#000000').toLowerCase(), onColor('#FFFFFF').toLowerCase());
assert.equal(brandColors({ colors: { primary: 'javascript:x' } }).primary.startsWith('#'), true, 'geçersiz renk varsayılana döner');

// --- Yardımcılar ---
assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
assert.ok(validEmail('a@b.co') && !validEmail('a@b') && !validEmail('a b@c.com'));
assert.ok(validPassword('1234567890') && !validPassword('kisa'));
const h = hashPassword('Uzun-parola-123'); assert.ok(checkPassword('Uzun-parola-123', h) && !checkPassword('yanlis-parola', h));
assert.equal(fromLocalInput('2026-11-18T09:00').toISOString(), '2026-11-18T06:00:00.000Z', 'İstanbul +03:00');
assert.equal(toLocalInput('2026-11-18T06:00:00Z'), '2026-11-18T09:00');
assert.equal(dayKey('2026-11-18T22:30:00Z'), '2026-11-19', 'gece yarısından sonra İstanbul günü');
assert.equal(fromLocalInput('bozuk'), null);
assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])), 'image/png');
assert.equal(imageType(Buffer.from('<svg onload=alert(1)>')), null, 'SVG yükleme kabul edilmez');
assert.ok(Object.values(PLATFORMS).every(p => p.max > 0));

const body = Buffer.from('--B\r\nContent-Disposition: form-data; name="ad"\r\n\r\nDeniz\r\n--B\r\nContent-Disposition: form-data; name="f"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nPNG\r\n--B--\r\n');
const mp = parseMultipart(body, 'multipart/form-data; boundary=B');
assert.equal(mp.ad, 'Deniz'); assert.deepEqual([mp.__files[0].field, mp.__files[0].name, mp.__files[0].data.toString()], ['f', 'a.png', 'PNG']);

console.log('social testleri tamam');
