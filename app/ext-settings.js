// Arvela OS — Ayarlar: tema seçimi ve tema ayarları (yalnız Yönetici). Seçim ajans genelinde geçerlidir.
import { THEMES, resolveTheme, themeCss } from './themes.js';

const cache = new Map(); // ajans → { id, opts, css }
export const currentThemeCss = (agencyId) => cache.get(agencyId || 1)?.css ?? themeCss(null, {});
export const currentTheme = (agencyId) => cache.get(agencyId || 1) || resolveTheme(null);

// Sayfaların okuduğu tema ayarları (Yönetici önizlemesi dahil).
export function themeOpts(ctx) {
  const a = ctx.user?.agency_id; const cur = currentTheme(a); const pv = ctx.user?.role === 'admin' ? ctx.url?.searchParams?.get('onizle') : null;
  if (pv && THEMES[pv]) return { id: pv, ...resolveTheme(pv, pv === cur.id ? cur.opts : {}).opts };
  return { id: cur.id, ...cur.opts };
}
export const splitRecord = (ctx) => { const o = themeOpts(ctx); return o.id === 'atlas' || o.kayit === 'yan'; };
export async function loadThemes(all) {
  const rows = await all(`SELECT agency_id, key, value FROM settings WHERE key IN ('theme.id','theme.opts')`);
  const by = new Map();
  for (const r of rows) { const o = by.get(r.agency_id) || {}; o[r.key] = r.value; by.set(r.agency_id, o); }
  for (const [a, o] of by) { let raw = {}; try { raw = JSON.parse(o['theme.opts'] || '{}'); } catch { /* bozuk kayıt: varsayılan */ }
    const r = resolveTheme(o['theme.id'], raw); cache.set(a, { id: r.id, opts: r.opts, css: r.theme.css(r.opts) }); }
}

export function registerSettings(d) {
  const { route, all, q, need, layout, h, csrfField, redirect, send, audit } = d;
  const put = (a, k, v) => q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [a, k, v]);

  route('GET', '/ayarlar', async (ctx, res) => {
    need(ctx, 'admin');
    const items = [['/ayarlar/tema', 'Tema', 'Arvela OS’in görünümünü ve tema ayarlarını seçin.'], ['/ekip', 'Ekip', 'Kullanıcılar, roller ve davetler.'], ['/otomasyonlar', 'Otomasyonlar', 'n8n bağlantıları, API anahtarları, olaylar.'],
      ['/ayarlar/demo', 'Demo verisi', 'Sistemi canlı göstermek için örnek firmalar, projeler ve akışlar; tek tuşla yüklenir ve kaldırılır.'], ['/ayarlar/yapay-zeka', 'Yapay zekâ', 'Claude, Arvela\'nın hizmet kitaplarına göre taslak hazırlar; kişisel veri kuralları.'], ['/ayarlar/yedek', 'Yedek ve izleme', 'Günlük şifreli veritabanı yedeği, haftalık geri yükleme testi, kesinti uyarısı.'], ['/ayarlar/kararlar', 'Müşteri kararları', 'Karar bağlantısı e-postası ve doğrulama.'], ['/veri-saklama', 'Veri saklama (KVKK)', 'Saklama süreleri ve anonimleştirme.'], ['/forge', 'Forge', 'Değişiklik onayları ve sürümler.'], ['/kayitlar', 'İşlem kayıtları', 'Kim, ne zaman, ne yaptı.']];
    send(res, 200, layout(ctx, 'Ayarlar', `<div class="page-head"><div><h1>Ayarlar</h1></div></div><div class="grid">${items.map(([href, t, x]) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit"><h2>${t}</h2><span class="muted">${x}</span></a>`).join('')}</div>`, '/ayarlar'));
  });

  route('GET', '/ayarlar/tema', async (ctx, res) => {
    need(ctx, 'admin'); const cur = currentTheme(ctx.user.agency_id); const f = csrfField(ctx);
    const sel = THEMES[ctx.url.searchParams.get('tema')] ? ctx.url.searchParams.get('tema') : cur.id; const st = resolveTheme(sel, sel === cur.id ? cur.opts : {});
    const cards = Object.entries(THEMES).map(([id, th]) => `<article class="card theme-card${id === sel ? ' is-sel' : ''}"><div class="swatch" aria-hidden="true">${th.swatch.map(c => `<span style="background:${c}"></span>`).join('')}</div>
<h2>${h(th.name)} ${id === cur.id ? '<span class="badge ok">Etkin</span>' : ''}</h2><p class="muted" style="margin:0">${h(th.desc)}</p>
<div class="act-btns">${id === sel ? '' : `<a class="btn ghost" href="/ayarlar/tema?tema=${id}">Ayarlarını gör</a>`}<a class="btn ghost" href="/panel?onizle=${id}" target="_blank" rel="noopener">Önizle</a>
${id === cur.id ? '' : `<form class="inline" method="post" action="/ayarlar/tema">${f}<input type="hidden" name="tema" value="${id}"><button class="gold">Etkinleştir</button></form>`}</div></article>`).join('');
    const opts = Object.entries(st.theme.options);
    const form = `<section class="card"><h2>${h(st.theme.name)} ayarları</h2>${opts.length ? `<form class="stack" method="post" action="/ayarlar/tema">${f}<input type="hidden" name="tema" value="${st.id}">
<div class="theme-opts">${opts.map(([k, def]) => `<fieldset><legend>${h(def.label)}</legend>${Object.entries(def.values).map(([v, l]) => `<label class="opt"><input type="radio" name="o_${k}" value="${v}"${st.opts[k] === v ? ' checked' : ''}>${def.type === 'color' ? `<span class="sw" style="background:${def.colors[v]}" aria-hidden="true"></span>` : ''}${h(l)}</label>`).join('')}</fieldset>`).join('')}</div>
<div class="act-btns"><button class="gold">${st.id === cur.id ? 'Kaydet' : 'Kaydet ve etkinleştir'}</button><a class="btn ghost" href="/panel?onizle=${st.id}" target="_blank" rel="noopener">Önizle (kaydedilmiş ayarlarla)</a></div></form>` : '<p class="muted" style="margin:0">Bu temanın ayarı yok.</p>'}</section>`;
    send(res, 200, layout(ctx, 'Tema', `<nav class="crumb"><a href="/ayarlar">Ayarlar</a></nav><div class="page-head"><div><h1>Tema</h1><p class="muted lead">Seçtiğiniz tema tüm ekip ve müşteri portalı için geçerli olur. Önizle, kaydetmeden yalnız size gösterir.</p></div></div>
<div class="grid">${cards}</div>${form}<p class="muted">Yeni bir tasarım eklendiğinde burada listelenir; etkinleştirmek için seçmeniz yeterli.</p>`, '/ayarlar'));
  });

  route('POST', '/ayarlar/tema', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const b = ctx.body;
    const raw = {}; for (const [k, v] of Object.entries(b)) if (k.startsWith('o_')) raw[k.slice(2)] = String(v);
    const prev = currentTheme(a); const keepOpts = !Object.keys(raw).length && b.tema === prev.id;
    const r = resolveTheme(b.tema, keepOpts ? prev.opts : raw);
    await put(a, 'theme.id', r.id); await put(a, 'theme.opts', JSON.stringify(r.opts));
    cache.set(a, { id: r.id, opts: r.opts, css: r.theme.css(r.opts) });
    await audit(ctx, 'theme.update', { theme: r.id, opts: r.opts });
    redirect(res, `/ayarlar/tema?tema=${r.id}`);
  });

  return { previewCss: (id, agencyId) => { if (!THEMES[id]) return null; const c = currentTheme(agencyId); return themeCss(id, id === c.id ? c.opts : {}); } };
}
