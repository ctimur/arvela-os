// Arvela Social — medya kütüphanesi: yükleme, gösterme, silme. Dosyalar veritabanında (yedeğe dahil).
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, badge } from './ui.mjs';
import { esc, int, clip, HttpError, imageType } from './lib.mjs';

export const MAX_IMAGE = 8 * 1024 * 1024;
export async function saveImage(ctx, buf, name, kind = 'upload', brandId = ctx.brand?.id) {
  const mime = imageType(buf); if (!mime) throw new HttpError(400, 'Yalnız PNG, JPG, WEBP ya da GIF yüklenebilir.');
  if (buf.length > MAX_IMAGE) throw new HttpError(400, 'Görsel en çok 8 MB olabilir.');
  const used = (await one('SELECT COALESCE(sum(size),0)::bigint n FROM media WHERE workspace_id=$1', [ctx.ws.id])).n;
  if (Number(used) + buf.length > 2 * 1024 ** 3) throw new HttpError(402, 'Medya alanınız doldu (2 GB). Kullanmadığınız görselleri silin.');
  return one(`INSERT INTO media (workspace_id, brand_id, kind, mime, bytes, name, size, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [ctx.ws.id, brandId || null, kind, mime, buf, clip(name, 120), buf.length, ctx.user.id]);
}
export const mediaDataUri = async (wsId, id) => { if (!id) return null; const m = await one('SELECT mime, bytes FROM media WHERE id=$1 AND workspace_id=$2', [int(id), wsId]); return m ? `data:${m.mime};base64,${m.bytes.toString('base64')}` : null; };
const KIND = { upload: 'Yüklenen', render: 'Şablon', ai: 'Yapay zekâ', logo: 'Logo' };

export function register() {
  route('GET', '/medya/:id', async (ctx, res, p) => {
    const m = await one('SELECT mime, bytes FROM media WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); if (!m) throw new HttpError(404, 'Görsel bulunamadı.');
    const dl = ctx.url.searchParams.get('indir'); const ext = m.mime.split('/')[1].replace('jpeg', 'jpg');
    res.writeHead(200, { 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=86400', 'Content-Length': m.bytes.length, ...(dl ? { 'Content-Disposition': `attachment; filename="arvela-${int(p.id)}.${ext}"` } : {}) }); res.end(m.bytes);
  });
  route('GET', '/medya', async (ctx, res) => {
    const rows = await all(`SELECT id, kind, name, size, created_at, (SELECT count(*) FROM posts p WHERE m.id = ANY(p.media_ids))::int used FROM media m WHERE workspace_id=$1 AND (brand_id=$2 OR brand_id IS NULL) AND kind<>'logo' ORDER BY id DESC LIMIT 300`, [ctx.ws.id, ctx.brand?.id || 0]);
    send(res, 200, layout(ctx, 'Medya', `<div class="page-head"><div><h1>Medya</h1><p>${esc(ctx.brand?.name || '')} için fotoğraflar ve üretilen görseller</p></div></div>
${ctx.user.role !== 'approver' ? `<form class="card row" method="post" action="/medya" enctype="multipart/form-data" data-jpeg>${csrf(ctx)}<label>Fotoğraf yükle (birden çok seçebilirsiniz; PNG/JPG/WEBP, en çok 8 MB)<input type="file" name="files" accept="image/*" multiple required></label><button class="gold">Yükle</button></form>` : ''}
${rows.length ? `<div class="media-grid">${rows.map(m => `<figure><a href="/medya/${m.id}" target="_blank"><img src="/medya/${m.id}" alt="${esc(m.name || 'görsel')}" loading="lazy"></a>
<figcaption><span>${badge(KIND[m.kind] || m.kind)} ${m.used ? badge(m.used + ' gönderi', 'ok') : ''}</span>${ctx.user.role !== 'approver' && !m.used ? `<form method="post" action="/medya/${m.id}/sil" data-confirm="Görsel silinsin mi?">${csrf(ctx)}<button class="ghost" style="padding:2px 8px">Sil</button></form>` : ''}</figcaption></figure>`).join('')}</div>` : '<div class="card"><p class="muted">Henüz görsel yok. Ürün, mekân ve ekip fotoğraflarınızı yükleyin; şablonlar bunlarla görsel üretir.</p></div>'}`, '/medya'));
  });
  route('POST', '/medya', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); if (!ctx.brand) throw new HttpError(400, 'Önce bir marka oluşturun.');
    const files = ctx.files.filter(f => f.field === 'files' || f.field === 'file').slice(0, 20); if (!files.length) throw new HttpError(400, 'Dosya seçin.');
    const ids = []; for (const f of files) ids.push((await saveImage(ctx, f.data, f.name)).id);
    await audit(ctx, 'media.upload', { n: ids.length });
    const back = ctx.body.back && /^\/gonderi\/\d+$/.test(ctx.body.back) ? ctx.body.back : null;
    if (back) { await q(`UPDATE posts SET media_ids = media_ids || $1::int[], updated_at=now() WHERE id=$2 AND workspace_id=$3`, [ids, int(back.split('/').pop()), ctx.ws.id]); return redirect(res, back); }
    redirect(res, '/medya');
  });
  route('POST', '/medya/:id/sil', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor');
    const m = await one(`SELECT id FROM media m WHERE id=$1 AND workspace_id=$2 AND NOT EXISTS (SELECT 1 FROM posts p WHERE m.id = ANY(p.media_ids)) AND NOT EXISTS (SELECT 1 FROM brands b WHERE b.logo_id=m.id)`, [int(p.id), ctx.ws.id]);
    if (!m) throw new HttpError(400, 'Görsel bir gönderide kullanılıyor ya da bulunamadı.'); await q('DELETE FROM media WHERE id=$1', [m.id]); redirect(res, '/medya');
  });
}
