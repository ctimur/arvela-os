import { NAV_CSS, DARK_CSS, LOOK_JS, navGroups, NAV_ICON } from '../app/ext-look.js';
import assert from 'node:assert';

// menü grupları rol bazında
const admin = navGroups({ role: 'admin' }); const staff = navGroups({ role: 'staff' });
assert.deepEqual(admin.map(g => g.key), ['gunluk', 'satis', 'teslimat', 'yonetim']);
const hrefs = (gs) => gs.flatMap(g => g.items.map(i => i[0]));
assert.ok(hrefs(admin).includes('/faturalar') && hrefs(admin).includes('/ayarlar'));
assert.ok(!hrefs(staff).includes('/faturalar') && !hrefs(staff).includes('/ayarlar') && !hrefs(staff).includes('/teklifler'), 'Ekip üyesi yalnız yetkili sayfaları görür');
assert.ok(staff.every(g => g.items.length), 'boş grup yok');
assert.deepEqual(hrefs(navGroups({ role: 'freelancer' })), ['/paketler', '/gorevler']);
assert.equal(navGroups({ role: 'client' })[0].key, '', 'müşteri menüsü düz');
assert.deepEqual(navGroups(null), []);
for (const h of hrefs(admin)) assert.ok(NAV_ICON[h], 'ikon: ' + h);
assert.equal(new Set(hrefs(admin)).size, hrefs(admin).length, 'tekrar eden bağlantı yok');

// koyu mod: her kural mod koşulu altında, açık modu etkilemez
const rules = DARK_CSS.replace(/@media[^{]*\{/g, '').split('}').map(r => r.trim()).filter(r => r.includes('{'));
for (const r of rules) for (const sel of r.split('{')[0].split(',')) assert.ok(/^html\[data-mode=(koyu|sistem)\]/.test(sel.trim()), 'kapsamsız koyu kural: ' + sel);
assert.ok(DARK_CSS.includes('prefers-color-scheme:dark') && DARK_CSS.includes('color-scheme:dark'));
assert.equal((DARK_CSS.match(/\{/g) || []).length, (DARK_CSS.match(/\}/g) || []).length, 'parantez dengesi');
assert.equal((NAV_CSS.match(/\{/g) || []).length, (NAV_CSS.match(/\}/g) || []).length);
assert.ok(NAV_CSS.includes('prefers-reduced-motion'), 'hareket azaltma tercihi');

// istemci betiği sözdizimi ve tarayıcı dışı güvenli çalışma
new Function(LOOK_JS);
assert.ok(!/innerHTML/.test(LOOK_JS), 'DOM metinle kurulmaz');
console.log('look: ok');
