// Arvela Social — markalar: marka sesi, içerik sütunları, renk/yazı/logo, sosyal hesaplar (planlama).
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, opts, badge } from './ui.mjs';
import { esc, nn, int, clip, HttpError, imageType } from './lib.mjs';
import { PLATFORMS } from './plans.mjs';
import { FONTS, brandColors } from './templates.mjs';
import { linksSection } from './approve.mjs';

export const brandFor = async (ctx, id) => { const b = await one('SELECT * FROM brands WHERE id=$1 AND workspace_id=$2', [int(id), ctx.ws.id]); if (!b) throw new HttpError(404, 'Marka bulunamadı.'); return b; };
const TONES = { samimi: 'Samimi ve sıcak', profesyonel: 'Profesyonel ve güven veren', eglenceli: 'Eğlenceli ve enerjik', sade: 'Sade ve bilgilendirici', premium: 'Premium ve zarif' };
const HEX = /^#[0-9a-fA-F]{6}$/;

function brandForm(ctx, b, action) {
  const c = brandColors(b); const pillars = (b.pillars || []).join('\n');
  return `<form class="stack" method="post" action="${action}" enctype="multipart/form-data">${csrf(ctx)}
<section class="card"><h2>Temel bilgiler</h2><div class="row"><label>Marka adı<input name="name" required maxlength="80" value="${esc(b.name)}"></label><label>Sektör<input name="sector" maxlength="80" value="${esc(b.sector || '')}" placeholder="Kafe, emlak, klinik…"></label></div>
<div class="row"><label>Web sitesi<input name="website" maxlength="200" value="${esc(b.website || '')}" placeholder="https://"></label><label>Dil<select name="language">${opts({ tr: 'Türkçe', en: 'İngilizce', de: 'Almanca' }, b.language)}</select></label></div>
<label>Ne satıyorsunuz? (ürün, hizmet, öne çıkan teklif)<textarea name="offer" rows="2" maxlength="1000">${esc(b.offer || '')}</textarea></label>
<label>Hedef kitle<textarea name="audience" rows="2" maxlength="1000" placeholder="Kimler, nerede, neye önem veriyorlar?">${esc(b.audience || '')}</textarea></label></section>
<section class="card"><h2>Marka sesi</h2><p class="muted">Yapay zekâ metinleri bu ayarlara göre yazar.</p>
<div class="row"><label>Ton<select name="tone">${opts(TONES, b.tone || 'samimi')}</select></label><label class="chk" style="flex:0 0 auto"><input type="checkbox" name="emoji" value="1"${b.emoji ? ' checked' : ''}> Emoji kullanılabilir</label></div>
<label>Ses notları (nasıl konuşuruz, örnek cümleler)<textarea name="voice_notes" rows="3" maxlength="2000" placeholder="“Siz” diye hitap ederiz; kısa cümleler; mahalle kahvecisi sıcaklığı…">${esc(b.voice_notes || '')}</textarea></label>
<label>Kullanılmayacak ifadeler (her satıra bir)<textarea name="banned" rows="2" maxlength="1000" placeholder="en ucuz&#10;garantili">${esc(b.banned || '')}</textarea></label>
<label>İçerik sütunları (her satıra bir; örn. Ürün tanıtımı, Ekibimiz, İpuçları)<textarea name="pillars" rows="4" maxlength="1000">${esc(pillars)}</textarea></label></section>
<section class="card"><h2>Görsel kimlik</h2><p class="muted">Şablon görseller bu renk, yazı ve logoyla üretilir.</p>
<div class="row">${[['primary', 'Ana renk'], ['accent', 'Vurgu rengi'], ['bg', 'Açık zemin'], ['text', 'Metin rengi']].map(([k, l]) => `<label>${l}<input type="color" name="c_${k}" value="${c[k]}"></label>`).join('')}</div>
<div class="row"><label>Yazı stili<select name="font">${opts(Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.name])), b.font)}</select></label>
<label>Logo (PNG/JPG, şeffaf PNG önerilir)<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>${b.logo_id ? `<img src="/medya/${b.logo_id}" alt="Logo" style="height:56px;max-width:180px;object-fit:contain;background:#E9E4D8;border-radius:8px;padding:6px">` : ''}</div></section>
<div><button class="gold">Kaydet</button></div></form>`;
}
async function saveBrand(ctx, id, b) {
  const pillars = String(b.pillars || '').split(/\r?\n/).map(s => clip(s.trim(), 60)).filter(Boolean).slice(0, 8);
  const colors = Object.fromEntries(['primary', 'accent', 'bg', 'text'].map(k => [k, HEX.test(b['c_' + k] || '') ? b['c_' + k] : null]).filter(([, v]) => v));
  await q(`UPDATE brands SET name=$1, sector=$2, website=$3, language=$4, offer=$5, audience=$6, tone=$7, emoji=$8, voice_notes=$9, banned=$10, pillars=$11, colors=$12, font=$13 WHERE id=$14 AND workspace_id=$15`,
    [clip(nn(b.name), 80) || 'Marka', clip(nn(b.sector), 80), clip(nn(b.website), 200), ['tr', 'en', 'de'].includes(b.language) ? b.language : 'tr', clip(nn(b.offer), 1000), clip(nn(b.audience), 1000),
     TONES[b.tone] ? b.tone : 'samimi', b.emoji === '1', clip(nn(b.voice_notes), 2000), clip(nn(b.banned), 1000), JSON.stringify(pillars), JSON.stringify(colors), FONTS[b.font] ? b.font : 'modern', id, ctx.ws.id]);
  const f = ctx.files.find(x => x.field === 'logo');
  if (f) {
    const mime = imageType(f.data); if (!mime || mime === 'image/gif') throw new HttpError(400, 'Logo PNG, JPG ya da WEBP olmalı.');
    if (f.data.length > 2 * 1024 * 1024) throw new HttpError(400, 'Logo en çok 2 MB olabilir.');
    const m = await one(`INSERT INTO media (workspace_id, brand_id, kind, mime, bytes, name, size, created_by) VALUES ($1,$2,'logo',$3,$4,$5,$6,$7) RETURNING id`, [ctx.ws.id, id, mime, f.data, clip(f.name, 120), f.data.length, ctx.user.id]);
    await q('UPDATE brands SET logo_id=$1 WHERE id=$2', [m.id, id]);
  }
}

export function register() {
  route('POST', '/marka-sec', async (ctx, res) => {
    const b = await brandFor(ctx, ctx.body.brand_id);
    const back = String(ctx.req.headers.referer || '/'); const to = (() => { try { const u = new URL(back); return u.pathname + u.search; } catch { return '/'; } })();
    redirect(res, to.startsWith('/') && !to.startsWith('//') ? to : '/', { 'Set-Cookie': `sb=${b.id}; Path=/; SameSite=Lax; Max-Age=31536000` });
  });

  route('GET', '/markalar', async (ctx, res) => {
    const rows = await all(`SELECT b.*, (SELECT count(*) FROM accounts a WHERE a.brand_id=b.id)::int acc, (SELECT count(*) FROM posts p WHERE p.brand_id=b.id AND p.status<>'iptal')::int posts FROM brands b WHERE b.workspace_id=$1 ORDER BY b.id`, [ctx.ws.id]);
    const can = rows.length < ctx.lim.brands;
    send(res, 200, layout(ctx, 'Markalar', `<div class="page-head"><div><h1>Markalar</h1><p>${rows.length} / ${ctx.lim.brands} marka kullanılıyor</p></div>
${ctx.user.role === 'owner' ? (can ? `<form method="post" action="/markalar">${csrf(ctx)}<button class="gold">+ Yeni marka</button></form>` : `<a class="btn ghost" href="/paket">Daha fazla marka için paketi yükselt</a>`) : ''}</div>
<div class="grid3">${rows.map(b => { const c = brandColors(b); return `<a class="card" href="/markalar/${b.id}" style="text-decoration:none;color:inherit">
<div class="row" style="align-items:center;justify-content:space-between"><h2>${esc(b.name)}</h2><span>${['primary', 'accent', 'bg'].map(k => `<span class="swatch" style="background:${c[k]}"></span>`).join(' ')}</span></div>
<p class="muted" style="margin:0">${esc(b.sector || 'Sektör girilmedi')} · ${b.acc} hesap · ${b.posts} gönderi</p>${!b.audience || !b.offer ? badge('Marka sesi eksik', 'warn') : badge('Hazır', 'ok')}</a>`; }).join('')}</div>`, '/markalar'));
  });
  route('POST', '/markalar', async (ctx, res) => {
    need(ctx, 'owner'); needUsable(ctx);
    const n = (await one('SELECT count(*)::int n FROM brands WHERE workspace_id=$1', [ctx.ws.id])).n;
    if (n >= ctx.lim.brands) throw new HttpError(402, `Paketiniz ${ctx.lim.brands} marka içeriyor. Ek marka için Paket sayfasına bakın.`);
    const b = await one('INSERT INTO brands (workspace_id, name) VALUES ($1,$2) RETURNING id', [ctx.ws.id, `Yeni marka ${n + 1}`]);
    await audit(ctx, 'brand.create', { id: b.id });
    redirect(res, `/markalar/${b.id}`, { 'Set-Cookie': `sb=${b.id}; Path=/; SameSite=Lax; Max-Age=31536000` });
  });
  route('GET', '/markalar/:id', async (ctx, res, p) => {
    const b = await brandFor(ctx, p.id); const acc = await all('SELECT * FROM accounts WHERE brand_id=$1 ORDER BY id', [b.id]);
    const accCount = (await one('SELECT count(*)::int n FROM accounts a JOIN brands b ON b.id=a.brand_id WHERE b.workspace_id=$1', [ctx.ws.id])).n;
    const editable = ctx.user.role !== 'approver';
    send(res, 200, layout(ctx, b.name, `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/markalar">Markalar</a></p><h1>${esc(b.name)}</h1></div></div>
${editable ? brandForm(ctx, b, `/markalar/${b.id}`) : `<div class="note">Marka ayarlarını yalnız sahip ve editörler değiştirebilir.</div>`}
<section class="card"><h2>Sosyal hesaplar</h2><p class="muted">Şimdilik planlama içindir: paylaşım zamanı geldiğinde hangi hesaba paylaşacağınızı hatırlatırız. Otomatik yayın bağlantısı yakında. (${accCount} / ${ctx.lim.accounts} hesap)</p>
${acc.length ? `<div class="tbl"><table><tr><th>Platform</th><th>Hesap</th><th>Tercih edilen saatler</th><th></th></tr>${acc.map(a => `<tr><td>${esc(PLATFORMS[a.platform]?.name || a.platform)}</td><td>${esc(a.handle)}</td><td>${esc(a.best_times || '—')}</td>
<td>${editable ? `<form method="post" action="/hesaplar/${a.id}/sil" data-confirm="Hesap kaldırılsın mı?">${csrf(ctx)}<button class="danger">Kaldır</button></form>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz hesap eklenmedi.</p>'}
${editable && accCount < ctx.lim.accounts ? `<form class="row" method="post" action="/markalar/${b.id}/hesap">${csrf(ctx)}<label>Platform<select name="platform">${opts(Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, v.name])), 'instagram')}</select></label>
<label>Kullanıcı adı<input name="handle" required maxlength="80" placeholder="@markaniz"></label><label>Tercih edilen saatler<input name="best_times" maxlength="80" placeholder="09:00, 19:30"></label><button>Ekle</button></form>` : ''}</section>${await linksSection(ctx, b.id)}`, '/markalar'));
  });
  route('POST', '/markalar/:id', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const b = await brandFor(ctx, p.id);
    await saveBrand(ctx, b.id, ctx.body); await audit(ctx, 'brand.update', { id: b.id }); redirect(res, `/markalar/${b.id}`);
  });
  route('POST', '/markalar/:id/hesap', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const b = await brandFor(ctx, p.id);
    const n = (await one('SELECT count(*)::int n FROM accounts a JOIN brands b ON b.id=a.brand_id WHERE b.workspace_id=$1', [ctx.ws.id])).n;
    if (n >= ctx.lim.accounts) throw new HttpError(402, `Paketiniz ${ctx.lim.accounts} sosyal hesap içeriyor.`);
    if (!PLATFORMS[ctx.body.platform] || !nn(ctx.body.handle)) throw new HttpError(400, 'Platform ve kullanıcı adı gerekli.');
    await q('INSERT INTO accounts (brand_id, platform, handle, best_times) VALUES ($1,$2,$3,$4)', [b.id, ctx.body.platform, clip(nn(ctx.body.handle), 80), clip(nn(ctx.body.best_times), 80)]);
    redirect(res, `/markalar/${b.id}`);
  });
  route('POST', '/hesaplar/:id/sil', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor');
    const a = await one('SELECT a.id, a.brand_id FROM accounts a JOIN brands b ON b.id=a.brand_id WHERE a.id=$1 AND b.workspace_id=$2', [int(p.id), ctx.ws.id]);
    if (!a) throw new HttpError(404, 'Hesap bulunamadı.'); await q('DELETE FROM accounts WHERE id=$1', [a.id]); redirect(res, `/markalar/${a.brand_id}`);
  });
}
