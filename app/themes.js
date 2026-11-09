// Arvela OS — temalar. Her tema temel CSS'in üstüne eklenen bir katmandır; ayarları Yönetici seçer.
// Yeni tema eklemek: THEMES'e bir kayıt ekleyin (ad, açıklama, örnek renkler, ayarlar, css(ayarlar)).
// Ayar türleri: 'select' (seçenekler) ve 'color' (seçenekler + renk değeri). Değerler kayıtlı seçeneklerin dışına çıkamaz.

const ACCENTS = {
  altin: { label: 'Altın', fill: '#B08433', text: '#7A5A1E', soft: '#FBF6EA', line: '#E9D9B4' },
  murekkep: { label: 'Mürekkep', fill: '#141A22', text: '#141A22', soft: '#F1F2F4', line: '#D5D9DF' },
  lacivert: { label: 'Lacivert', fill: '#2F4A6B', text: '#2F4A6B', soft: '#EEF3F8', line: '#C9D7E6' },
  zeytin: { label: 'Zeytin', fill: '#4F6B3A', text: '#3F5A2E', soft: '#F1F5EC', line: '#CFDCC3' },
  bordo: { label: 'Bordo', fill: '#8A2F3B', text: '#7A2633', soft: '#F8EEF0', line: '#E6C7CC' },
  turkuaz: { label: 'Turkuaz', fill: '#1F6F72', text: '#185C5F', soft: '#ECF5F5', line: '#C2DDDE' },
  mor: { label: 'Mor', fill: '#5B4B8A', text: '#4C3E78', soft: '#F2F0F8', line: '#D3CDE6' },
};
// Yalnız açık modda geçerli kurallar (koyu modda değişkenler ve koyu menü korunur)
const lightOnly = (css) => { const rules = css.trim().split('}').filter(r => r.includes('{')).map(r => { const [sel, body] = r.split('{'); return [sel.split(',').map(x => x.trim()), body]; });
  const w = (pre) => rules.map(([sels, body]) => sels.map(x => `${pre} ${x}`).join(',') + '{' + body + '}').join('');
  return w('html[data-mode=acik]') + `@media (prefers-color-scheme:light){${w('html[data-mode=sistem]')}}`; };
const sel = (label, values, def) => ({ label, type: 'select', values, default: def });

export const THEMES = {
  atlas: {
    name: 'Atlas',
    desc: 'Varsayılan: sakin açık zemin, koyu ve gruplu (akordiyon) menü, üstte arama çubuğu. Açık ve koyu mod; mobilde soldan açılan menü.',
    swatch: ['#F6F5F2', '#0B0D12', '#E2BE7A', '#FFFFFF'], dark: true,
    options: {
      vurgu: { label: 'Vurgu rengi (bağlantılar, başlık üstleri)', type: 'color', values: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.label])), colors: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.fill])), default: 'altin' },
      buton: sel('Ana düğme rengi', { murekkep: 'Mürekkep (koyu)', vurgu: 'Vurgu rengi' }, 'murekkep'),
      zemin: sel('Zemin tonu', { sicak: 'Sıcak (kâğıt)', notr: 'Nötr (gri)', beyaz: 'Beyaz' }, 'sicak'),
      menu: sel('Menü görünümü', { koyu: 'Koyu', acik: 'Açık', serit: 'İnce ikon şeridi' }, 'koyu'),
      menuGrup: sel('Menü grupları', { akordiyon: 'Açılır kapanır (akordiyon)', acik: 'Hep açık' }, 'akordiyon'),
      kose: sel('Köşeler', { keskin: 'Keskin', yumusak: 'Yumuşak', yuvarlak: 'Yuvarlak' }, 'yumusak'),
      kart: sel('Kart stili', { cizgi: 'İnce çizgili', golge: 'Gölgeli', duz: 'Düz (çizgisiz)' }, 'cizgi'),
      yogunluk: sel('Yoğunluk', { rahat: 'Rahat', sik: 'Sıkı' }, 'rahat'),
      yazi: sel('Yazı boyutu', { kucuk: 'Küçük', normal: 'Normal', buyuk: 'Büyük' }, 'normal'),
      baslik: sel('Başlık yazı tipi', { poppins: 'Poppins (yuvarlak)', inter: 'Inter (sade)', serif: 'Serif (klasik)' }, 'poppins'),
      tablo: sel('Tablolar', { cizgi: 'Satır çizgili', zebra: 'Zebra (açık-koyu satır)' }, 'cizgi'),
      panel: sel('Sağ bilgi paneli', { sag: 'Sağda sabit', alt: 'İçeriğin altında' }, 'sag'),
      panelGen: sel('Sağ panel genişliği', { dar: 'Dar', normal: 'Normal', genis: 'Geniş' }, 'normal'),
      ustcubuk: sel('Üst çubuk', { sabit: 'Kaydırırken sabit', kayan: 'Sayfayla kayar' }, 'sabit'),
      hareket: sel('Animasyonlar', { normal: 'Normal', azalt: 'Azaltılmış' }, 'normal'),
      bugun: sel('Bugün sayfası', { liste: 'Tek liste (önerilen)', kartlar: 'Öne çıkan kartlar' }, 'liste'),
      kpi: sel('Bugün: rakam şeridi', { goster: 'Göster', gizle: 'Gizle' }, 'goster'),
      ozet: sel('Bugün: günün özeti satırı', { goster: 'Göster', gizle: 'Gizle' }, 'gizle'),
      proje: sel('Proje sayfası varsayılan görünüm', { liste: 'Liste', pano: 'Pano', tablo: 'Tablo' }, 'liste'),
    },
    css: (o) => {
      const a = ACCENTS[o.vurgu] || ACCENTS.altin;
      const Z = { sicak: ['#F6F5F2', '#F0EEE9', '#E7E3DA', '#EFECE6', '#FAF9F6'], notr: ['#F4F5F7', '#ECEEF1', '#E2E5EA', '#ECEEF1', '#F8F9FA'], beyaz: ['#FFFFFF', '#F3F2EF', '#E7E3DA', '#EFECE6', '#FAF9F6'] }[o.zemin] || [];
      const R = { keskin: [6, 6], yumusak: [14, 10], yuvarlak: [20, 14] }[o.kose] || [14, 10];
      let css = `:root{--paper:${Z[0]};--sand:${Z[1]};--line:${Z[2]};--line2:${Z[3]};--soft:${Z[4]};--acc-t:${a.text};--r-card:${R[0]}px;--insp-w:${{ dar: 320, genis: 420 }[o.panelGen] || 360}px${o.buton === 'vurgu' ? `;--btn:${a.fill};--btn-h:${a.text}` : ''}}
a{color:var(--acc-t)}.card,.rows,.kpi,.stepper,table,.tbl,.kcol,.flowbar,.brief,.summary,.callout,.act{border-radius:${R[0]}px}.later-row,.pulse{border-radius:${R[0]}px}
button,.btn,input,select,textarea,.tb-search,.info-btn,.seg,.viewseg,.fseg{border-radius:${R[1]}px}.act{box-shadow:0 1px 0 var(--line)}
th{text-transform:none;letter-spacing:0;font-size:12.5px}.badge{text-transform:none;letter-spacing:0;font-size:12px}
:focus-visible{outline-color:${a.fill}}`;
      if (o.zemin === 'beyaz') css += `.insp{background:var(--soft)}`;
      if (o.kart === 'golge') css += `.card,.rows,.kpi,.stepper,.tbl table,.act,.kcard,.later-row{border-color:transparent;box-shadow:0 1px 2px rgba(20,26,34,.06),0 8px 24px rgba(20,26,34,.06)}`;
      if (o.kart === 'duz') css += `.card,.rows,.kpi,.stepper,.tbl table,.act,.kcard{border-color:transparent;box-shadow:none}`;
      if (o.yogunluk === 'sik') css += `.page-main{gap:16px}.card{padding:16px;gap:8px}th,td{padding:8px 12px}.act{padding:18px;gap:8px}.r{padding:10px 16px;min-height:52px}.kpi>div{padding:12px 16px}.insp{gap:16px;padding:18px}`;
      if (o.yazi === 'kucuk') css += `body{font-size:14px}`; if (o.yazi === 'buyuk') css += `body{font-size:16.5px}.r .rs,.muted{font-size:14px}`;
      if (o.baslik === 'inter') css += `h1,h2,h3,.kpi b,.stat{font-family:Inter,sans-serif;font-weight:600;letter-spacing:-.3px}`;
      if (o.baslik === 'serif') css += `h1,h2,h3,.kpi b,.stat{font-family:Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:0}`;
      if (o.tablo === 'zebra') css += `tr:nth-child(even) td{background:var(--soft)}`;
      if (o.panel === 'alt') css += `main.has-insp{display:block}.insp{position:static;max-height:none;min-height:0;border-left:0;border-top:1px solid var(--line);margin:0 auto;max-width:1240px;padding:24px 40px 56px;background:transparent}.has-insp .page-main{margin:0 auto}`;
      if (o.ustcubuk === 'kayan') css += `.topbar{position:static}.insp{top:0}`;
      if (o.hareket === 'azalt') css += `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`;
      if (o.menuGrup === 'acik') css += `.ng-h{pointer-events:none}.ng-h svg{display:none}.ng.shut .ng-b{grid-template-rows:1fr;opacity:1}.ng.shut .ng-i a{visibility:visible}`;
      if (o.menu === 'acik') css += lightOnly(`.side{background:#FBFAF7;color:var(--ink);border-right:1px solid var(--line)}.side .brand{color:var(--ink)}.side .brand span{color:${a.text}}
.side .side-nav a{color:#3C3A33}.side .side-nav a:hover{background:#F1EEE7;color:var(--ink)}.side .side-nav a.on{background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--line),inset 3px 0 0 ${a.fill}}.side .side-nav a.on svg{color:${a.fill}}
.ng-h{color:#5E5849}.ng-h:hover{background:#F1EEE7;color:var(--ink)}.side .who{border-top-color:var(--line);color:var(--stone)}.side .who strong{color:var(--ink)}
.side .btn-out{color:var(--ink);border-color:var(--line)}.side .lang.dark{border-color:var(--line)}.side .lang.dark button{color:#5E5849}.side .lang.dark button.on{color:#0B0D12}.side .side-x{border-color:var(--line);color:var(--ink)}.side .side-nav{scrollbar-color:#D8D1C3 transparent}`);
      if (o.menu === 'serit') css += `@media (min-width:901px){.side{width:76px;padding:16px 10px}.shell{margin-left:76px}.side .brand{font-size:0;padding:0;display:grid;place-items:center;height:40px}
.side .brand::before{content:"A";font:600 18px Poppins,sans-serif;width:40px;height:40px;border-radius:10px;background:var(--champ);color:#0B0D12;display:grid;place-items:center}.side .brand span{display:none}
.ng-h{display:none}.side .side-nav{margin-right:0;padding-right:0;gap:6px}.ng{border-top:1px solid #1F242C;padding-top:6px}.ng:first-child{border-top:0;padding-top:0}.ng.shut .ng-b{grid-template-rows:1fr;opacity:1}.ng.shut .ng-i a{visibility:visible}
.side .side-nav a{justify-content:center;padding:0;min-height:44px}.side .side-nav a span{display:none}.side .side-nav a svg{width:20px;height:20px}.side .who{flex-direction:column;align-items:center;padding:10px 0 0}.side .who>span,.side .who .lang{display:none}.side .btn-out{font-size:11px;padding:6px 8px}}`;
      return css;
    },
  },
  klasik: {
    name: 'Klasik',
    desc: 'İlk tasarım: koyu kenar çubuğu, sıcak kâğıt zemin, yumuşak gölgeli kartlar.',
    swatch: ['#0B0D12', '#F7F4EE', '#E2BE7A', '#FFFFFF'], dark: true,
    options: {},
    css: () => '',
  },
  defter: {
    name: 'Defter',
    desc: 'Yalnız açık mod. İlişki öncelikli, sade: beyaz zemin, açık kenar çubuğu, ince çizgili kartlar, tablolar ve kayıt sayfaları ön planda.',
    swatch: ['#FFFFFF', '#FAF8F3', '#B08433', '#141A22'], dark: false,
    options: {
      kenar: { label: 'Kenar çubuğu', type: 'select', values: { acik: 'Açık renkli', koyu: 'Koyu renkli' }, default: 'acik' },
      zemin: { label: 'Zemin', type: 'select', values: { beyaz: 'Beyaz', kagit: 'Kâğıt' }, default: 'beyaz' },
      vurgu: { label: 'Vurgu rengi', type: 'color', values: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.label])), colors: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.fill])), default: 'altin' },
      kose: { label: 'Köşeler', type: 'select', values: { yumusak: 'Yumuşak', keskin: 'Keskin' }, default: 'yumusak' },
      yogunluk: { label: 'Yoğunluk', type: 'select', values: { rahat: 'Rahat', sik: 'Sıkı' }, default: 'rahat' },
      kayit: { label: 'Müşteri ve aday sayfası', type: 'select', values: { yan: 'Yan yana (bilgiler solda, akış sağda)', klasik: 'Klasik (alt alta)' }, default: 'yan' },
    },
    css: (o) => {
      const a = ACCENTS[o.vurgu] || ACCENTS.altin; const r = o.kose === 'keskin' ? 6 : 12; const rb = o.kose === 'keskin' ? 6 : 8;
      const bg = o.zemin === 'kagit' ? '#F7F4EE' : '#FFFFFF'; const sideBg = o.zemin === 'kagit' ? '#F2EEE5' : '#FAF8F3';
      const light = o.kenar !== 'koyu';
      let css = `:root{--paper:${bg};--sand:#FAF8F3;--line:#ECE6DA;--line2:#F1ECE2;--acc:${a.fill};--acc-t:${a.text}}
body{background:var(--paper)}a{color:${a.text}}.eyebrow{color:${a.text}}
.card{border-radius:${r}px;box-shadow:none}table{border-radius:${r}px}.tbl{border-radius:${r}px}
th{background:#FAF8F3;text-transform:none;letter-spacing:0;font-size:12px}
button,.btn{border-radius:${rb}px}input,select,textarea{border-radius:${rb}px;border-color:#E2DCCF}
input:focus,select:focus,textarea:focus{border-color:${a.fill};box-shadow:0 0 0 3px ${a.soft}}
.badge{text-transform:none;letter-spacing:0;font-size:12px;font-weight:600}
.act{border-radius:${r + 2}px;box-shadow:none;border:1px solid var(--line)}.act.hero{border:0}
.brief{border-radius:${r}px;background:${a.soft};border-color:${a.line}}.brief b{color:${a.text}}
.summary{border-radius:${r}px;background:${a.soft};border-color:${a.line}}.summary h2{color:${a.text}}
.kcol{border-radius:${r}px;background:#FAF8F3;border:1px solid var(--line)}
.flash{border-radius:${r}px}.err{border-radius:${r}px}
.side .side-nav a.on{box-shadow:inset 3px 0 0 ${a.fill}}
:focus-visible{outline-color:${a.fill}}input[type=radio],input[type=checkbox]{accent-color:${a.fill}}`;
      if (light) css += `
.side{background:${sideBg};color:var(--ink);border-right:1px solid var(--line)}.side .brand{color:var(--ink)}.side .brand span{color:${a.text}}
.side .side-nav a{color:#3C3A33;font-size:14px;font-weight:500;border-radius:8px}.side .side-nav a:hover{background:#fff;color:var(--ink)}
.side .side-nav a.on{background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--line),inset 3px 0 0 ${a.fill}}
.side .who{border-top-color:var(--line);color:var(--stone)}.who strong{color:var(--ink)}.side .btn-out{color:var(--ink);border-color:var(--line)}
.ng-h{color:#5E5849}.ng-h:hover{background:#fff;color:var(--ink)}.side .side-x{border-color:var(--line);color:var(--ink)}.side .side-nav{scrollbar-color:#D8D1C3 transparent}.side .lang.dark{border-color:var(--line)}.side .lang.dark button{color:#5E5849}.side .lang.dark button.on{color:#0B0D12}`;
      if (o.yogunluk === 'sik') css += `
.page-main{gap:16px;padding-top:24px}.card{padding:16px;gap:8px}th,td{padding:8px 12px}.act{padding:18px;gap:8px}.side .side-nav a{padding:8px 12px}`;
      return css;
    },
  },
};

export const DEFAULT_THEME = 'atlas';

// Kayıtlı değerleri doğrular; bilinmeyen tema ya da seçenek varsayılana döner.
export function resolveTheme(id, raw = {}) {
  const key = THEMES[id] ? id : DEFAULT_THEME; const th = THEMES[key]; const opts = {};
  for (const [k, def] of Object.entries(th.options)) opts[k] = Object.hasOwn(def.values, raw?.[k]) ? raw[k] : def.default;
  return { id: key, theme: th, opts };
}
export const themeCss = (id, raw) => { const r = resolveTheme(id, raw); return r.theme.css(r.opts); };
