import { applyGuide, findPage, sectionKey, PAGES, SECTIONS } from '../app/ext-guide.js';
import assert from 'node:assert';

// her sayfa rehberi iki dilde, "ne işe yarar" ve "sonra ne olur" ile
for (const g of PAGES) { for (const k of ['ne', 'sonra']) { assert.equal(g[k].length, 2); assert.ok(g[k][0].length > 10 && g[k][1].length > 10, String(g.m)); } }
for (const [k, v] of Object.entries(SECTIONS)) assert.ok(v.length === 2 && v[0] && v[1], k);
// ana sayfalar kapsanıyor
for (const p of ['/panel', '/satis', '/satis/3', '/musteriler', '/musteriler/2', '/projeler', '/projeler/5', '/gorev/9', '/gorevler', '/onaylar', '/onaylar/4', '/siteler', '/paketler', '/paketler/1', '/odemeler', '/katalog', '/katalog/7', '/teklifler', '/teklifler/2', '/faturalar', '/faturalar/2', '/otomasyonlar', '/ekip', '/forge', '/kayitlar', '/veri-saklama', '/ayarlar', '/ayarlar/tema', '/portal', '/portal/teklifler/3', '/portal/faturalar'])
  assert.ok(findPage(p), 'rehber yok: ' + p);
assert.equal(findPage('/healthz'), null);

assert.equal(sectionKey('Onayınızı bekleyenler (2'), 'Onayınızı bekleyenler');
assert.equal(sectionKey('Hizmet kitabı · \u0001WEB 04\u0002'), 'Hizmet kitabı');

const body = '<nav class="crumb">x</nav><div class="page-head"><div><h1>P</h1><div class="chips">c</div></div><a>+</a></div><section class="card"><h2>Yeni görev</h2></section><details><summary>Müşteriye onaya gönder</summary></details><h2>Bilinmeyen</h2>';
const out = applyGuide(body, { path: '/projeler/5' });
// düğme page-head içinde, rehber page-head'den hemen sonra
const ph = out.indexOf('<div class="page-head">'), btn = out.indexOf('class="info-btn"'), box = out.indexOf('<section class="guide"');
assert.ok(ph < btn && btn < box && box < out.indexOf('<section class="card">'));
assert.ok(out.slice(btn, box).includes('</div>'), 'düğme page-head kapanmadan önce');
assert.ok(out.includes('Sonra ne olur') && out.includes('Ayrıntılar'));
assert.equal((out.match(/class="g-hint"/g) || []).length, 2, 'bilinen iki bölüm açıklandı');
const en = applyGuide(body, { path: '/projeler/5', lang: 'en' });
assert.ok(en.includes('What happens next') && en.includes('Details') && !en.includes('Sonra ne olur'));
// page-head yoksa üstte bilgi çubuğu
const nohead = applyGuide('<h1>x</h1><h2>Yeni görev</h2>', { path: '/panel' }); assert.ok(nohead.startsWith('<div class="info-bar">'));
assert.equal(applyGuide(body, { path: '/yok' }), body);
assert.ok(!applyGuide('<h1>x</h1>', { path: '/rehber"><script>' }).includes('<script>'));
console.log('guide: ok');
