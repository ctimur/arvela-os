// Arvela Social — müşteri onay bağlantıları (Agency). Ajans, markası için bir bağlantı üretir; müşteri hesap açmadan
// onay bekleyen gönderileri görür, onaylar ya da düzeltme ister. Bağlantının yalnız özeti (sha256) saklanır; geri alınabilir.
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { csrf, publicPage, badge } from './ui.mjs';
import { esc, nn, int, clip, sha, token, HttpError, fmtDateTime, clientIp } from './lib.mjs';
import { PLATFORMS, POST_ST, POST_TONE, limits, transition } from './plans.mjs';
import { onStatus, base } from './notify.mjs';

const shown = new Map(); // bağlantı bir kez gösterilir: anahtar → { url, at }
const hits = new Map(); // ip+bağlantı başına dakikalık sınır
function rate(key, max = 30) { const now = Date.now(); const h = (hits.get(key) || []).filter(t => t > now - 60_000); h.push(now); hits.set(key, h); if (hits.size > 5000) hits.clear(); return h.length <= max; }

async function linkFor(tok) {
  const l = await one(`SELECT l.*, b.name brand, b.logo_id, w.plan, w.status ws_status, w.trial_ends, w.paid_until, w.extra_brands FROM approval_links l JOIN brands b ON b.id=l.brand_id JOIN workspaces w ON w.id=l.workspace_id
    WHERE l.token_hash=$1 AND l.revoked_at IS NULL`, [sha(tok)]);
  if (!l) throw new HttpError(404, 'Bu onay bağlantısı geçersiz ya da kaldırılmış.');
  const lim = limits({ plan: l.plan, status: l.ws_status, trial_ends: l.trial_ends, paid_until: l.paid_until, extra_brands: l.extra_brands });
  if (!lim.clientLinks || !lim.usable) throw new HttpError(403, 'Bu onay bağlantısı şu an kullanılamıyor.');
  return { ...l, lim };
}
const VISIBLE = ['onay', 'duzeltme', 'onaylandi', 'paylasildi'];

// Marka sayfasında gösterilen bölüm
export async function linksSection(ctx, brandId) {
  if (ctx.user.role !== 'owner') return '';
  const f = csrf(ctx);
  if (!ctx.lim.clientLinks) return `<section class="card"><h2>Müşteri onay bağlantısı</h2><p class="muted">Müşterilerinizin hesap açmadan gönderileri onaylaması Agency paketinde. <a href="/paket">Paketleri gör</a></p></section>`;
  const rows = await all('SELECT id, label, email, created_at, last_used_at FROM approval_links WHERE brand_id=$1 AND workspace_id=$2 AND revoked_at IS NULL ORDER BY id DESC', [brandId, ctx.ws.id]);
  const k = ctx.url.searchParams.get('baglanti'); const s = k && shown.get(k); if (s) shown.delete(k);
  return `<section class="card" id="onay-baglantisi"><h2>Müşteri onay bağlantısı</h2><p class="muted">Müşteriniz bu bağlantıdan onay bekleyen gönderileri görür; onaylar ya da düzeltme ister. Hesap açması gerekmez.</p>
${s ? `<div class="flash"><strong>Bağlantı hazır.</strong> Şimdi kopyalayın; güvenlik için bir daha gösterilmez.<input id="link-new" readonly value="${esc(s.url)}" style="margin-top:8px"><button class="ghost" data-copy="#link-new" style="margin-top:8px">Kopyala</button></div>` : ''}
${rows.map(r => `<div class="row" style="align-items:center;border-top:1px solid #ECE6DA;padding-top:8px"><div style="flex:1;min-width:200px"><strong>${esc(r.label)}</strong>${r.email ? ` · ${esc(r.email)}` : ''}<br><span class="muted">Oluşturuldu ${fmtDateTime(r.created_at)}${r.last_used_at ? ` · son kullanım ${fmtDateTime(r.last_used_at)}` : ' · henüz açılmadı'}</span></div>
<form method="post" action="/onay-baglantisi/${r.id}/kaldir">${f}<button class="danger" data-confirm="Bağlantı kaldırılsın mı? Müşteri artık bu adresle onay veremez.">Kaldır</button></form></div>`).join('')}
<form class="row" method="post" action="/markalar/${brandId}/onay-baglantisi" style="margin-top:10px">${f}<label>Kimin için<input name="label" maxlength="80" required placeholder="Kuzey Kahve · Deniz Hanım"></label><label>E-postası (isteğe bağlı)<input type="email" name="email" maxlength="200"></label><button class="gold">Bağlantı oluştur</button></form></section>`;
}

export function register() {
  route('POST', '/markalar/:id/onay-baglantisi', async (ctx, res, p) => {
    need(ctx, 'owner'); needUsable(ctx); if (!ctx.lim.clientLinks) throw new HttpError(402, 'Müşteri onay bağlantıları Agency paketinde.');
    const b = await one('SELECT id FROM brands WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); if (!b) throw new HttpError(404, 'Marka bulunamadı.');
    const label = clip(nn(ctx.body.label), 80); if (!label) throw new HttpError(400, 'Kimin için olduğunu yazın.');
    const n = (await one('SELECT count(*)::int n FROM approval_links WHERE brand_id=$1 AND revoked_at IS NULL', [b.id])).n; if (n >= 10) throw new HttpError(400, 'Bir marka için en çok 10 bağlantı olabilir.');
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ctx.body.email || '') ? clip(ctx.body.email.trim().toLowerCase(), 200) : null;
    const tok = token(24); await q('INSERT INTO approval_links (workspace_id, brand_id, token_hash, label, email, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [ctx.ws.id, b.id, sha(tok), label, email, ctx.user.id]);
    const key = token(9); shown.set(key, { url: `${base()}/onay/${tok}`, at: Date.now() }); for (const [k, v] of shown) if (v.at < Date.now() - 600_000) shown.delete(k);
    await audit(ctx, 'link.create', { brand: b.id }); redirect(res, `/markalar/${b.id}?baglanti=${key}#onay-baglantisi`);
  });
  route('POST', '/onay-baglantisi/:id/kaldir', async (ctx, res, p) => {
    need(ctx, 'owner');
    const l = await one('UPDATE approval_links SET revoked_at=now() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL RETURNING brand_id', [int(p.id), ctx.ws.id]); if (!l) throw new HttpError(404, 'Bağlantı bulunamadı.');
    await audit(ctx, 'link.revoke', { id: int(p.id) }); redirect(res, `/markalar/${l.brand_id}#onay-baglantisi`);
  });

  // ---------- Müşteri sayfası (oturumsuz) ----------
  route('GET', '/onay/:token', async (ctx, res, p) => {
    if (!rate(clientIp(ctx.req) + p.token, 60)) throw new HttpError(429, 'Çok fazla istek. Bir dakika sonra tekrar deneyin.');
    const l = await linkFor(p.token); await q('UPDATE approval_links SET last_used_at=now() WHERE id=$1', [l.id]);
    const posts = await all(`SELECT * FROM posts WHERE brand_id=$1 AND status = ANY($2::text[]) AND (status='onay' OR updated_at > now() - interval '30 days') ORDER BY (status='onay') DESC, scheduled_at NULLS LAST LIMIT 60`, [l.brand_id, VISIBLE]);
    const notes = posts.length ? await all(`SELECT post_id, author, kind, body, created_at FROM post_notes WHERE post_id = ANY($1::int[]) AND kind IN ('musteri','duzeltme') ORDER BY id DESC`, [posts.map(x => x.id)]) : [];
    const ok = ctx.url.searchParams.get('ok'); const waiting = posts.filter(x => x.status === 'onay');
    const card = (x) => `<section class="card" id="g${x.id}"><div class="row" style="justify-content:space-between;align-items:center"><div><strong>${esc(x.title || 'Gönderi')}</strong><br><span class="muted">${x.scheduled_at ? fmtDateTime(x.scheduled_at) : 'Tarihsiz'} · ${(x.platforms || []).map(k => esc(PLATFORMS[k]?.name || k)).join(', ')}</span></div>${badge(POST_ST[x.status], POST_TONE[x.status])}</div>
${x.media_ids?.length ? `<div class="thumbs" style="margin-top:10px">${x.media_ids.slice(0, 4).map(id => `<a href="/onay/${p.token}/medya/${id}" target="_blank"><img src="/onay/${p.token}/medya/${id}" alt=""></a>`).join('')}</div>` : ''}
<p style="white-space:pre-wrap;margin:12px 0 4px">${esc(x.caption || '')}</p>${x.hashtags ? `<p class="muted" style="margin:0">${esc(x.hashtags)}</p>` : ''}
${notes.filter(n => n.post_id === x.id).slice(0, 3).map(n => `<p class="muted" style="margin:8px 0 0"><strong>${esc(n.author || '')}</strong> · ${fmtDateTime(n.created_at)}: ${esc(n.body)}</p>`).join('')}
${x.status === 'onay' ? `<form class="stack" method="post" action="/onay/${p.token}/${x.id}" style="margin-top:12px;border-top:1px solid #ECE6DA;padding-top:12px"><label>Adınız<input name="ad" maxlength="80" required autocomplete="name"></label>
<label>Not (düzeltme isterseniz zorunlu)<textarea name="not" rows="2" maxlength="1000"></textarea></label><div class="row"><button class="gold" name="karar" value="onayla">Onayla</button><button class="ghost" name="karar" value="duzeltme">Düzeltme iste</button></div></form>` : ''}</section>`;
    send(res, 200, publicPage(`${l.brand} · Onay`, `<p class="muted" style="margin:0">Arvela Social · ${esc(l.label)}</p><h1>${esc(l.brand)} gönderileri</h1>
${ok ? `<div class="flash">${ok === 'onay' ? 'Teşekkürler, gönderi onaylandı.' : 'Teşekkürler, düzeltme isteğiniz ekibe iletildi.'}</div>` : ''}
<p>${waiting.length ? `Onayınızı bekleyen <strong>${waiting.length}</strong> gönderi var.` : 'Şu an onayınızı bekleyen gönderi yok.'}</p>${posts.map(card).join('') || ''}`));
  }, { open: true });

  route('GET', '/onay/:token/medya/:id', async (ctx, res, p) => {
    const l = await linkFor(p.token); const id = int(p.id);
    const m = await one(`SELECT m.mime, m.bytes FROM media m WHERE m.id=$1 AND m.workspace_id=$2 AND EXISTS (SELECT 1 FROM posts x WHERE x.brand_id=$3 AND $1 = ANY(x.media_ids) AND x.status = ANY($4::text[]))`, [id, l.workspace_id, l.brand_id, VISIBLE]);
    if (!m) throw new HttpError(404, 'Görsel bulunamadı.');
    send(res, 200, m.bytes, m.mime, { 'Cache-Control': 'private, max-age=300', 'Content-Security-Policy': "default-src 'none'; img-src 'self'" });
  }, { open: true });

  route('POST', '/onay/:token/:id', async (ctx, res, p) => {
    if (!rate('post:' + clientIp(ctx.req) + p.token, 20)) throw new HttpError(429, 'Çok fazla istek. Bir dakika sonra tekrar deneyin.');
    const l = await linkFor(p.token); const post = await one('SELECT * FROM posts WHERE id=$1 AND brand_id=$2', [int(p.id), l.brand_id]); if (!post) throw new HttpError(404, 'Gönderi bulunamadı.');
    const name = clip(nn(ctx.body.ad), 80); const note = clip(nn(ctx.body.not), 1000); const action = ctx.body.karar === 'onayla' ? 'onayla' : 'duzeltme';
    if (!name) throw new HttpError(400, 'Adınızı yazın.'); if (action === 'duzeltme' && !note) throw new HttpError(400, 'Neyin düzeltilmesini istediğinizi yazın.');
    const t = transition(action, post, 'approver', l.lim); if (t.error) throw new HttpError(400, post.status === 'onay' ? t.error : 'Bu gönderi için karar zaten verilmiş.');
    const upd = await one(`UPDATE posts SET status=$1, updated_at=now() WHERE id=$2 AND status='onay' RETURNING id`, [t.to, post.id]); if (!upd) throw new HttpError(409, 'Bu gönderi için karar zaten verilmiş.');
    const author = `${name} (müşteri · ${l.label})`;
    await q(`INSERT INTO post_notes (post_id, author, kind, body) VALUES ($1,$2,'musteri',$3)`, [post.id, author, `${action === 'onayla' ? 'Onayladı' : 'Düzeltme istedi'}${note ? ': ' + note : ''}`]);
    await q('INSERT INTO audit (workspace_id, action, detail) VALUES ($1,$2,$3)', [l.workspace_id, 'post.client', { id: post.id, to: t.to, link: l.id }]);
    const ws = await one('SELECT * FROM workspaces WHERE id=$1', [l.workspace_id]);
    await onStatus({ ...ws, lim: l.lim }, post, t.to, { actorName: name, comment: note, client: true });
    redirect(res, `/onay/${p.token}?ok=${action === 'onayla' ? 'onay' : 'duzeltme'}`);
  }, { open: true });
}
