import { mask, buildPrompt, suggestPrompt, ENGINES, DEFAULTS } from '../app/ext-ai.js';
import assert from 'node:assert';

// kişisel veri maskeleme
const m = mask('Can Yılmaz (can.yilmaz@firma.com, +90 532 123 45 67) Firma A.Ş. için; IBAN TR12 0006 1005 1978 6457 8413 26, TC 12345678901. Fiyat 15000 TL, tarih 2026-11-20.', ['Firma A.Ş.', 'Can Yılmaz']);
assert.ok(!/can\.yilmaz|532|Firma A\.Ş|Can Yılmaz|12345678901|TR12/.test(m), m);
assert.ok(m.includes('[e-posta]') && m.includes('[telefon]') && m.includes('[IBAN]') && m.includes('[kimlik no]') && m.includes('[Müşteri]'));
assert.ok(m.includes('15000 TL') && m.includes('2026-11-20'), 'tutar ve tarih bozulmaz');
assert.equal(mask('ab', ['ab']), 'ab', 'çok kısa ad maskelenmez');
assert.equal(mask(null), '');

// istem: SS-2 yokken maskeli, varken açık
const ctx = { task: { title: 'Yapay zekâ: Brif ve metin', description: 'Çıktı: Metin taslağı\nKabul: Can Yılmaz onayı' }, project: { name: 'Firma A.Ş. landing', description: 'İletişim: can@firma.com' }, service: 'WEB-04 Landing',
  playbook: { ozet: 'Tek sayfa', kapsam: ['Başlık', 'Form'], teslimatlar: [{ ad: 'Site', kabul: 'Lighthouse 90+' }], ai: { yontem: ['Claude taslak yazar'] } }, client: { name: 'Firma A.Ş.', contact_name: 'Can Yılmaz' } };
const p1 = buildPrompt({ ...ctx, piiOk: false });
assert.equal(p1.masked, true); assert.ok(!/Firma A\.Ş|Can Yılmaz|can@firma/.test(p1.prompt), p1.prompt);
assert.ok(p1.prompt.includes('Aşama: Brif ve metin') && p1.prompt.includes('Lighthouse 90+') && p1.prompt.includes('- Form') && p1.prompt.includes('Claude taslak yazar'));
assert.ok(p1.system.includes('uydurma') && p1.system.includes('Kontrol listesi'));
const p2 = buildPrompt({ ...ctx, piiOk: true }); assert.equal(p2.masked, false); assert.ok(p2.prompt.includes('Firma A.Ş.'));
assert.ok(buildPrompt({ task: { title: 'x' } }).prompt.length > 10);

// motor önerisi: müşteri bilgisi yok
const s = suggestPrompt({ service: 'WEB-04', stages: [{ title: 'Yapay zekâ: Görsel', stage_role: 'ai' }, { title: 'Müşteri kararı: Onay', stage_role: 'musteri' }] });
assert.ok(s.prompt.includes('1. Görsel (ai)') && s.prompt.includes('2. Onay (musteri)') && s.masked);

assert.ok(ENGINES.claude.ready && !ENGINES.openai.ready && ENGINES.claude.models[DEFAULTS['ai.model']]);
assert.equal(DEFAULTS['ai.enabled'], '0', 'varsayılan kapalı'); assert.equal(DEFAULTS['ai.pii_ok'], '0', 'varsayılan maskeli');
console.log('ai: ok');
