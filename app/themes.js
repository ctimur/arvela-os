// Arvela OS — temalar. Her tema temel CSS'in üstüne eklenen bir katmandır; ayarları Yönetici seçer.
// Yeni tema eklemek: THEMES'e bir kayıt ekleyin (ad, açıklama, örnek renkler, ayarlar, css(ayarlar)).
// Ayar türleri: 'select' (seçenekler) ve 'color' (seçenekler + renk değeri). Değerler kayıtlı seçeneklerin dışına çıkamaz.

const ACCENTS = {
  altin: { label: 'Altın', fill: '#B08433', text: '#7A5A1E', soft: '#FBF6EA', line: '#E9D9B4' },
  murekkep: { label: 'Mürekkep', fill: '#141A22', text: '#141A22', soft: '#F1F2F4', line: '#D5D9DF' },
  lacivert: { label: 'Lacivert', fill: '#2F4A6B', text: '#2F4A6B', soft: '#EEF3F8', line: '#C9D7E6' },
  zeytin: { label: 'Zeytin', fill: '#4F6B3A', text: '#3F5A2E', soft: '#F1F5EC', line: '#CFDCC3' },
};

export const THEMES = {
  klasik: {
    name: 'Klasik',
    desc: 'İlk tasarım: koyu kenar çubuğu, sıcak kâğıt zemin, yumuşak gölgeli kartlar.',
    swatch: ['#0B0D12', '#F7F4EE', '#E2BE7A', '#FFFFFF'],
    options: {},
    css: () => '',
  },
  defter: {
    name: 'Defter',
    desc: 'İlişki öncelikli, sade: beyaz zemin, açık kenar çubuğu, ince çizgili kartlar, tablolar ve kayıt sayfaları ön planda.',
    swatch: ['#FFFFFF', '#FAF8F3', '#B08433', '#141A22'],
    options: {
      kenar: { label: 'Kenar çubuğu', type: 'select', values: { acik: 'Açık renkli', koyu: 'Koyu renkli' }, default: 'acik' },
      zemin: { label: 'Zemin', type: 'select', values: { beyaz: 'Beyaz', kagit: 'Kâğıt' }, default: 'beyaz' },
      vurgu: { label: 'Vurgu rengi', type: 'color', values: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.label])), colors: Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.fill])), default: 'altin' },
      kose: { label: 'Köşeler', type: 'select', values: { yumusak: 'Yumuşak', keskin: 'Keskin' }, default: 'yumusak' },
      yogunluk: { label: 'Yoğunluk', type: 'select', values: { rahat: 'Rahat', sik: 'Sıkı' }, default: 'rahat' },
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
.kcol{border-radius:${r}px;background:#FAF8F3;border:1px solid var(--line)}
.flash{border-radius:${r}px}.err{border-radius:${r}px}
.side nav a.on{box-shadow:inset 3px 0 0 ${a.fill}}
:focus-visible{outline-color:${a.fill}}input[type=radio],input[type=checkbox]{accent-color:${a.fill}}`;
      if (light) css += `
.side{background:${sideBg};color:var(--ink);border-right:1px solid var(--line)}.side .brand{color:var(--ink)}.side .brand span{color:${a.text}}
.side nav a{color:#3C3A33;font-size:14px;font-weight:500;border-radius:8px}.side nav a:hover{background:#fff;color:var(--ink)}
.side nav a.on{background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--line),inset 3px 0 0 ${a.fill}}
.side .who{border-top-color:var(--line);color:var(--stone)}.who strong{color:var(--ink)}.side .btn-out{color:var(--ink);border-color:var(--line)}
.side-search input{background:#fff;border-color:var(--line);color:var(--ink)}.side-search input::placeholder{color:#8A8475}`;
      if (o.yogunluk === 'sik') css += `
main{gap:16px;padding-top:24px}.card{padding:16px;gap:8px}th,td{padding:8px 12px}.act{padding:18px;gap:8px}.side nav a{padding:8px 12px}`;
      return css;
    },
  },
};

export const DEFAULT_THEME = 'klasik';

// Kayıtlı değerleri doğrular; bilinmeyen tema ya da seçenek varsayılana döner.
export function resolveTheme(id, raw = {}) {
  const key = THEMES[id] ? id : DEFAULT_THEME; const th = THEMES[key]; const opts = {};
  for (const [k, def] of Object.entries(th.options)) opts[k] = Object.hasOwn(def.values, raw?.[k]) ? raw[k] : def.default;
  return { id: key, theme: th, opts };
}
export const themeCss = (id, raw) => { const r = resolveTheme(id, raw); return r.theme.css(r.opts); };
