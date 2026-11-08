import { THEMES, resolveTheme, themeCss, DEFAULT_THEME } from '../app/themes.js';
import { registerSettings, loadThemes, currentThemeCss, currentTheme } from '../app/ext-settings.js';
import assert from 'node:assert';

assert.ok(THEMES.klasik && THEMES.defter && THEMES.atlas, 'üç tema kayıtlı');
assert.equal(DEFAULT_THEME, 'atlas', 'Atlas varsayılan');
assert.ok(themeCss('atlas', { vurgu: 'lacivert' }).includes('#2F4A6B') && themeCss('atlas', {}).includes('--paper:#F6F5F2'), 'Atlas vurgu rengi');
assert.equal(THEMES.defter.dark, false, 'Defter yalnız açık mod'); assert.ok(THEMES.atlas.dark && THEMES.klasik.dark);
assert.equal(themeCss('klasik'), '', 'klasik temel CSS ile aynı');
assert.equal(resolveTheme('yok').id, DEFAULT_THEME, 'bilinmeyen tema varsayılana döner');
const r = resolveTheme('defter', { vurgu: 'lacivert', kenar: '<script>', yogunluk: 'sik' });
assert.deepEqual(r.opts, { kenar: 'acik', zemin: 'beyaz', vurgu: 'lacivert', kose: 'yumusak', yogunluk: 'sik', kayit: 'yan' }, 'geçersiz değer varsayılana döner');
const css = themeCss('defter', r.opts);
assert.ok(css.includes('#2F4A6B') && css.includes('padding:8px 12px') && !css.includes('<'), 'ayarlar CSS\'e yansır');
assert.ok(!themeCss('defter', { kenar: 'koyu' }).includes('.side{background'), 'koyu kenar çubuğunda kenar rengi değişmez');
for (const [id, th] of Object.entries(THEMES)) { assert.ok(th.name && th.desc && th.swatch?.length, id + ' tanımı eksiksiz'); for (const d of Object.values(th.options)) assert.ok(Object.hasOwn(d.values, d.default), id + ' varsayılanı geçerli'); }

// kaydetme ve önbellek
const rows = []; const routes = {}; let to = '';
const q = async (sql, args) => { rows.push(args); };
const api = registerSettings({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; }, all: async () => [], q, need: (ctx, ...roles) => { if (!roles.includes(ctx.user.role)) throw Object.assign(new Error('yetki'), { status: 403 }); },
  layout: (c, t, b) => b, h: String, csrfField: () => '', redirect: (r, u) => { to = u; }, send: () => {}, audit: async () => {} });
await routes['POST /ayarlar/tema']({ user: { role: 'admin', agency_id: 7 }, body: { tema: 'defter', o_vurgu: 'zeytin' } }, {}, {});
assert.equal(currentTheme(7).id, 'defter'); assert.ok(currentThemeCss(7).includes('#4F6B3A'), 'etkin tema hemen uygulanır'); assert.equal(to, '/ayarlar/tema?tema=defter');
assert.deepEqual(rows.map(x => x[1]), ['theme.id', 'theme.opts']);
await routes['POST /ayarlar/tema']({ user: { role: 'admin', agency_id: 7 }, body: { tema: 'defter' } }, {}, {});
assert.equal(currentTheme(7).opts.vurgu, 'zeytin', 'yalnız tema seçilirse ayarlar korunur');
await assert.rejects(routes['POST /ayarlar/tema']({ user: { role: 'staff', agency_id: 7 }, body: { tema: 'klasik' } }, {}, {}), (e) => e.status === 403, 'yalnız Yönetici');
assert.ok(api.previewCss('defter', 7).includes('#4F6B3A')); assert.equal(api.previewCss('yok', 7), null);
await loadThemes(async () => [{ agency_id: 3, key: 'theme.id', value: 'defter' }, { agency_id: 3, key: 'theme.opts', value: 'bozuk' }]);
assert.equal(currentTheme(3).id, 'defter', 'bozuk ayar kaydı varsayılan ayarlarla açılır');
console.log('themes: ok');
import { themeOpts, splitRecord } from '../app/ext-settings.js';
{ const c = { user: { role: 'admin', agency_id: 7 }, url: new URL('http://x/') };
  assert.equal(splitRecord(c), true, 'Defter: varsayılan yan yana');
  assert.equal(splitRecord({ ...c, url: new URL('http://x/?onizle=klasik') }), false, 'önizleme ayarı uygulanır');
  assert.equal(splitRecord({ user: { role: 'staff', agency_id: 7 }, url: new URL('http://x/?onizle=klasik') }), true, 'önizleme yalnız Yönetici');
  assert.equal(themeOpts({ user: { role: 'admin', agency_id: 99 }, url: new URL('http://x/') }).id, 'atlas'); console.log('tema düzeni: ok'); }
