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

// --- Faz 2: yapay zekâ yardımcıları ---
const { maskPII, extractJson, normalizePlan, normalizeOptions, planPrompt, textPrompt, brandBrief } = await import('../app/social/ai-core.mjs');
const { formObject } = await import('../app/social/lib.mjs');
assert.equal(maskPII('Yaz: deniz@kuzey.com, 0532 111 22 33 ya da +90 532 111 2233'), 'Yaz: [e-posta], [telefon] ya da [telefon]');
assert.deepEqual(extractJson('Elbette:\n```json\n{"a":[1]}\n```'), { a: [1] }); assert.equal(extractJson('yok'), null); assert.equal(extractJson('{bozuk'), null);
const items = [
  { tarih: '2026-12-05', saat: '09:30', platformlar: ['instagram', 'x'], metin: 'A', sutun: 'Ürün', sablon: { tur: 'liste', baslik: 'B' } },
  { tarih: '2026-12-05', saat: '25:00', platformlar: ['linkedin'], metin: 'B' }, // aynı gün → kaydırılır; geçersiz saat ve platform düzeltilir
  { tarih: '2027-01-02', metin: 'C' }, // ay dışı
  { tarih: '2026-12-10', metin: '' }, // boş metin atlanır
  { tarih: '2026-12-11', metin: 'x'.repeat(5000), platformlar: ['instagram'] }];
const plan = normalizePlan(items, { month: '2026-12', platforms: ['instagram', 'tiktok'], pillars: ['Ürün'], now: new Date('2026-11-09T10:00:00Z') });
assert.equal(plan.length, 4); assert.equal(new Set(plan.map(x => x.day)).size, 4, 'her gün bir gönderi');
assert.ok(plan.every(x => x.day.startsWith('2026-12-')));
assert.deepEqual(plan.find(x => x.caption === 'A').platforms, ['instagram']); assert.equal(plan.find(x => x.caption === 'A').template, 'liste');
assert.equal(plan.find(x => x.caption === 'B').time, '19:00'); assert.deepEqual(plan.find(x => x.caption === 'B').platforms, ['instagram']);
assert.equal(plan.find(x => x.caption.startsWith('xxx')).caption.length, 2200, 'platform sınırına kırpılır');
const cur = normalizePlan([{ metin: 'D' }], { month: '2026-11', platforms: ['instagram'], now: new Date('2026-11-29T10:00:00Z') });
assert.equal(cur[0].day, '2026-11-30', 'bu ayda yalnız yarından sonrası');
assert.equal(normalizePlan([{ metin: 'E' }], { month: '2026-11', platforms: ['instagram'], now: new Date('2026-11-30T12:00:00Z') }).length, 0, 'ayda gün kalmadı');
assert.equal(normalizeOptions({ secenekler: [{ metin: 'a' }, { metin: '' }, { metin: 'b', etiketler: '#x' }, { metin: 'c' }, { metin: 'd' }] }, 280).length, 3);
assert.equal(normalizeOptions(null, 280).length, 0);
const br = { name: 'Kuzey', offer: 'Kahve, sipariş: 0532 111 22 33', pillars: ['Ürün'], emoji: true, language: 'tr' };
const pp = planPrompt({ brand: br, accounts: [{ platform: 'instagram' }], month: '2026-12', count: 5, platforms: ['instagram'], focus: 'mail: a@b.co', today: '2026-11-09' });
assert.ok(pp.prompt.includes('Aralık 2026') && pp.prompt.includes('5 gönderilik') && !pp.prompt.includes('0532') && !pp.prompt.includes('a@b.co'));
assert.ok(textPrompt({ brand: br, accounts: [], post: { caption: 'Bize yazın: x@y.com', platforms: ['x'] }, op: 'kisalt', max: 280 }).prompt.includes('[e-posta]'));
assert.ok(brandBrief(br).includes('[telefon]'));
assert.deepEqual(formObject(new URLSearchParams('p=a&p=b&t=1&__proto__=x')), { p: ['a', 'b'], t: '1' });
assert.deepEqual(parseMultipart(Buffer.from('--B\r\nContent-Disposition: form-data; name="p"\r\n\r\na\r\n--B\r\nContent-Disposition: form-data; name="p"\r\n\r\nb\r\n--B--\r\n'), 'multipart/form-data; boundary=B').p, ['a', 'b']);
const { limits: lim2 } = await import('../app/social/plans.mjs');
assert.equal(lim2({ status: 'deneme', trial_ends: '2030-01-01' }).aiPerMonth, 40, 'deneme YZ sınırı');
assert.equal(lim2({ status: 'aktif', plan: 'agency' }).aiImagesPerMonth, 60);
assert.equal(lim2({ status: 'aktif', plan: 'business' }).aiImagesPerMonth, 0);
console.log('social faz 2 testleri tamam');

// --- Faz 3: rapor ---
const { summarize, monthRange, prevMonth, monthLabel } = await import('../app/social/report-core.mjs');
assert.deepEqual(monthRange('2026-12'), ['2026-11-30T21:00:00.000Z', '2026-12-31T21:00:00.000Z']);
assert.equal(prevMonth(new Date('2026-12-01T06:00:00Z')), '2026-11'); assert.equal(prevMonth(new Date('2026-01-01T06:00:00Z')), '2025-12');
assert.equal(monthLabel('2026-12'), 'Aralık 2026');
const sp = summarize([
  { status: 'paylasildi', platforms: ['instagram', 'tiktok'], pillar: 'Ürün', scheduled_at: '2026-11-02T16:00:00Z', published_at: '2026-11-02T16:30:00Z', ai: true },
  { status: 'paylasildi', platforms: ['instagram'], pillar: 'Ürün', scheduled_at: '2026-11-03T16:00:00Z', published_at: '2026-11-04T09:00:00Z' },
  { status: 'onaylandi', platforms: ['instagram'], scheduled_at: '2020-01-01T00:00:00Z' },
  { status: 'iptal', platforms: ['x'] }], [{ kind: 'duzeltme', body: 'x' }, { kind: 'musteri', body: 'Düzeltme istedi: y' }, { kind: 'musteri', body: 'Onayladı' }]);
assert.deepEqual([sp.planned, sp.published, sp.onTime, sp.onTimePct, sp.missed, sp.cancelled, sp.revisions, sp.ai], [3, 2, 1, 50, 1, 1, 2, 1]);
assert.deepEqual(sp.byPlat, { instagram: 2, tiktok: 1 }); assert.deepEqual(sp.byPillar, { 'Ürün': 2, 'Sütunsuz': 1 });
console.log('social faz 3 testleri tamam');
