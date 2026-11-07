import { als, translateHtml, exact, t, pickLang, M1, M2 } from '../app/i18n.js';
import assert from 'node:assert';

const html = `<html lang="tr"><body><h1>Projeler</h1><input placeholder="Proje ya da müşteri ara"><option value="gecikti">Geciken</option>
<p>Teslim 30.11.2026 · ${M1}Müşteriler toplantısı${M2}</p><a href="/projeler">Yeni proje</a><style>.Projeler{}</style><td data-label="x">Görevlerim</td></body></html>`;
// Türkçe: değişmez, işaretler silinir
const tr = als.run({ lang: 'tr' }, () => translateHtml(html));
assert.ok(tr.includes('<h1>Projeler</h1>') && !tr.includes(M1));
const en = als.run({ lang: 'en' }, () => translateHtml(html));
assert.ok(en.includes('<html lang="en">'));
assert.ok(en.includes('<h1>Projects</h1>'));
assert.ok(en.includes('placeholder="Search projects or clients"'));
assert.ok(en.includes('value="gecikti">Overdue<'), 'değer korunur, metin çevrilir');
assert.ok(en.includes('Due 30.11.2026 · Müşteriler toplantısı'), 'kullanıcı verisi çevrilmez');
assert.ok(en.includes('href="/projeler">New project'), 'adres korunur');
assert.ok(en.includes('.Projeler{}'), 'stil dokunulmaz');
assert.ok(en.includes('>My tasks<'));
als.run({ lang: 'en' }, () => {
  assert.equal(exact('Onay bekliyor'), 'Awaiting approval');
  assert.equal(exact('Banner çalışması'), 'Banner çalışması');
  assert.equal(t`${'site.com'} için müdahale gerekiyor`, 'site.com needs attention');
  assert.equal(t`${'ARV-1'} ödenmedi`, 'ARV-1 unpaid');
});
assert.equal(t`${'a'} için müdahale gerekiyor`, 'a için müdahale gerekiyor');
assert.equal(pickLang({ lang: 'en' }, { lang: 'tr' }, ''), 'en');
assert.equal(pickLang(null, { lang: 'en' }, ''), 'en');
assert.equal(pickLang(null, {}, 'en-US,en;q=0.9'), 'en');
assert.equal(pickLang(null, {}, 'tr-TR'), 'tr');
console.log('i18n: ok');
