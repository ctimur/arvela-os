// Arvela Social — otomasyon: imzalar, etiketler, tıklama takipli kısa link, webhook, herkese açık API, RSS'ten otomatik fikir.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, badge } from './ui.mjs';
import { esc, nn, int, clip, token, sha, HttpError, fmtDateTime, clientIp, fromLocalInput, imageType } from './lib.mjs';
import { PLATFORMS, POST_ST, canUse, limits } from './plans.mjs';
import { seal, open as unseal } from './vault.mjs';
import { base } from './notify.mjs';
import { saveImage } from './media.mjs';

// ---------- Güvenli dış istek (SSRF koruması): yalnız https, özel/yerel adreslere gidilmez, yönlendirme izlenmez ----------
export function privateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && privateIp(x.slice(7));
}
export async function safeUrl(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && !(process.env.SOCIAL_ALLOW_HTTP === '1' && u.protocol === 'http:')) return null;
  if (u.username || u.password) return null;
  if (process.env.SOCIAL_ALLOW_PRIVATE === '1') return u; // yalnız yerel testlerde
  const host = u.hostname.replace(/^\[|\]$/g, ''); if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return null;
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map(r => r.address);
  if (!ips.length || ips.some(privateIp)) return null; return u;
}
async function safeFetch(raw, opts = {}) {
  const u = await safeUrl(raw); if (!u) throw new Error('Adres geçersiz ya da izin verilmeyen bir ağda.');
  const r = await fetch(u, { ...opts, redirect: 'manual', signal: AbortSignal.timeout(opts.timeout || 10_000) });
  return r;
}

// ---------- Kısa link ----------
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const CODE_ABC = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(7), b => CODE_ABC[b % CODE_ABC.length]).join('');
export async function shortenText(wsId, postId, text) {
  const b = base(); const urls = [...new Set(String(text || '').match(URL_RE) || [])].filter(x => !x.startsWith(b + '/l/'));
  let out = String(text || ''); let n = 0;
  for (const raw of urls.slice(0, 20)) {
    const clean = raw.replace(/[.,;:!?]+$/, ''); if (!(await safeUrl(clean))) continue;
    let row = await one('SELECT code FROM shortlinks WHERE workspace_id=$1 AND url=$2 AND post_id IS NOT DISTINCT FROM $3', [wsId, clean, postId]);
    if (!row) row = await one('INSERT INTO shortlinks (workspace_id, post_id, code, url) VALUES ($1,$2,$3,$4) RETURNING code', [wsId, postId, newCode(), clean]);
    out = out.split(clean).join(`${b}/l/${row.code}`); n++;
  }
  return { text: out, count: n };
}

// ---------- Webhook ----------
export async function fireWebhooks(wsId, event, payload) {
  const hooks = await all('SELECT * FROM webhooks WHERE workspace_id=$1 AND active AND $2 = ANY(events)', [wsId, event]);
  for (const h of hooks) {
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload }); const secret = unseal(h.secret_enc) || '';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex'); let st = 0;
    try { const r = await safeFetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'arvela-social-webhook/1.0', 'x-arvela-event': event, 'x-arvela-signature': 'sha256=' + sig }, body }); st = r.status; }
    catch { st = 0; }
    await q('UPDATE webhooks SET last_status=$1, last_at=now() WHERE id=$2', [st, h.id]);
  }
  return hooks.length;
}
export const postPayload = async (p) => {
  const t = await all('SELECT a.platform, a.name, t.status, t.url, t.error FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.post_id=$1', [p.id]);
  return { id: p.id, brand_id: p.brand_id, title: p.title, scheduled_at: p.scheduled_at, status: p.status, targets: t };
};

// ---------- API ----------
const apiHits = new Map();
async function apiAuth(ctx) {
  const raw = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^as_[A-Za-z0-9_-]{30,60}$/.test(raw)) throw new HttpError(401, 'API anahtarı eksik ya da geçersiz.');
  const k = await one('SELECT k.id, k.workspace_id, w.* FROM api_keys k JOIN workspaces w ON w.id=k.workspace_id WHERE k.key_hash=$1 AND k.revoked_at IS NULL', [sha(raw)]);
  if (!k) throw new HttpError(401, 'API anahtarı eksik ya da geçersiz.');
  const now = Date.now(); const h = (apiHits.get(k.id) || []).filter(t => t > now - 60_000); h.push(now); apiHits.set(k.id, h);
  if (h.length > 120) throw new HttpError(429, 'Dakikada en çok 120 istek.');
  const lim = limits(k); if (!lim.usable) throw new HttpError(402, 'Hesap etkin değil.'); if (!lim.automation) throw new HttpError(402, 'API Business ve Agency paketlerinde.');
  await q('UPDATE api_keys SET last_used_at=now() WHERE id=$1', [k.id]);
  return { wsId: k.workspace_id, lim, keyId: k.id };
}
const json = (res, st, o) => send(res, st, JSON.stringify(o), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
const apiRoute = (method, pattern, fn) => route(method, pattern, async (ctx, res, p) => {
  try { const a = await apiAuth(ctx); await fn(ctx, res, p, a); }
  catch (e) { json(res, e.status || 500, { error: e.status ? e.message : 'Sunucu hatası.' }); if (!e.status) console.error('api', e); }
}, { open: true });

// ---------- RSS ----------
const tagText = (xml, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(xml); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : ''; };
export function parseFeed(xml) {
  const items = []; const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi; let m;
  while ((m = re.exec(String(xml))) && items.length < 30) {
    const x = m[0]; const link = tagText(x, 'link') || (/<link[^>]*href="([^"]+)"/i.exec(x) || [])[1] || '';
    const title = tagText(x, 'title'); const guid = tagText(x, 'guid') || tagText(x, 'id') || link || title;
    if (title || link) items.push({ title: title.slice(0, 200), link: link.slice(0, 500), guid: guid.slice(0, 300) });
  }
  return items;
}
export async function pollFeeds() {
  const feeds = await all(`SELECT f.*, w.status ws_status, w.plan, w.trial_ends, w.paid_until FROM feeds f JOIN workspaces w ON w.id=f.workspace_id WHERE f.active AND (f.last_checked IS NULL OR f.last_checked < now() - interval '55 minutes') LIMIT 30`);
  let made = 0;
  for (const f of feeds) {
    if (!canUse({ status: f.ws_status, plan: f.plan, trial_ends: f.trial_ends, paid_until: f.paid_until })) continue;
    try {
      const r = await safeFetch(f.url, { headers: { 'user-agent': 'arvela-social-rss/1.0', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (!r.ok) throw new Error(`Akış okunamadı (${r.status}).`);
      const items = parseFeed((await r.text()).slice(0, 2_000_000)); const seen = new Set(f.seen || []);
      const fresh = f.last_checked ? items.filter(i => !seen.has(i.guid)).slice(0, 5) : []; // ilk okumada yalnız mevcutları işaretle
      for (const it of fresh.reverse()) {
        await q(`INSERT INTO posts (workspace_id, brand_id, status, title, caption, visual_brief) VALUES ($1,$2,'fikir',$3,$4,$5)`, [f.workspace_id, f.brand_id, clip(`RSS: ${it.title}`, 120), [it.title, it.link].filter(Boolean).join('\n\n'), 'RSS akışından']);
        made++;
      }
      await q('UPDATE feeds SET seen=$1, last_checked=now(), error=NULL WHERE id=$2', [[...new Set([...items.map(i => i.guid), ...seen])].slice(0, 100), f.id]);
    } catch (e) { await q('UPDATE feeds SET last_checked=now(), error=$1 WHERE id=$2', [String(e.message).slice(0, 200), f.id]); }
  }
  return made;
}
let feedTimer = null;
export function startFeeds() { if (feedTimer) return; const t = () => pollFeeds().catch(e => console.error('rss:', e.message)); feedTimer = setInterval(t, 15 * 60_000); feedTimer.unref?.(); }

export function register() {
  if (process.env.SOCIAL_PUBLISHER !== '0') startFeeds();

  // ---------- Kısa link yönlendirme ----------
  route('GET', '/l/:code', async (ctx, res, p) => {
    const l = await one('SELECT id, url FROM shortlinks WHERE code=$1', [p.code]); if (!l) throw new HttpError(404, 'Bağlantı bulunamadı.');
    if (!/bot|crawl|spider|preview|facebookexternalhit|linkedinbot|slurp/i.test(ctx.req.headers['user-agent'] || '')) await q('UPDATE shortlinks SET clicks=clicks+1 WHERE id=$1', [l.id]);
    res.writeHead(302, { Location: l.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' }); res.end();
  }, { open: true });
  route('POST', '/gonderi/:id/kisalt', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx);
    const post = await one('SELECT * FROM posts WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); if (!post) throw new HttpError(404, 'Gönderi bulunamadı.');
    if (post.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi değiştirilemez.');
    const src = typeof ctx.body.caption === 'string' ? ctx.body.caption : post.caption; // kaydedilmemiş metin de kısaltılır
    const r = await shortenText(ctx.ws.id, post.id, src); await q('UPDATE posts SET caption=$1, updated_at=now() WHERE id=$2', [r.text, post.id]);
    redirect(res, `/gonderi/${post.id}`);
  });

  // ---------- İmzalar ve etiketler ----------
  route('POST', '/markalar/:id/imza', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); const b = await one('SELECT id FROM brands WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); if (!b) throw new HttpError(404, 'Marka bulunamadı.');
    const name = clip(nn(ctx.body.name), 60); const body = clip(nn(ctx.body.body), 600); if (!name || !body) throw new HttpError(400, 'Ad ve metin gerekli.');
    if ((await one('SELECT count(*)::int n FROM signatures WHERE brand_id=$1', [b.id])).n >= 10) throw new HttpError(400, 'Bir markada en çok 10 imza olabilir.');
    if (ctx.body.default === '1') await q('UPDATE signatures SET is_default=false WHERE brand_id=$1', [b.id]);
    await q('INSERT INTO signatures (brand_id, name, body, is_default) VALUES ($1,$2,$3,$4)', [b.id, name, body, ctx.body.default === '1']); redirect(res, `/markalar/${b.id}#imzalar`);
  });
  route('POST', '/imzalar/:id/sil', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); const s = await one('DELETE FROM signatures g USING brands b WHERE g.id=$1 AND b.id=g.brand_id AND b.workspace_id=$2 RETURNING g.brand_id', [int(p.id), ctx.ws.id]);
    if (!s) throw new HttpError(404, 'İmza bulunamadı.'); redirect(res, `/markalar/${s.brand_id}#imzalar`);
  });
  route('POST', '/etiketler', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); const name = clip(nn(ctx.body.name), 30); const color = /^#[0-9a-f]{6}$/i.test(ctx.body.color || '') ? ctx.body.color : '#B08433';
    if (!name) throw new HttpError(400, 'Etiket adı gerekli.');
    if (ctx.body.sil === '1') { await q('DELETE FROM tags WHERE workspace_id=$1 AND name=$2', [ctx.ws.id, name]); await q('UPDATE posts SET tags=array_remove(tags, $2) WHERE workspace_id=$1', [ctx.ws.id, name]); }
    else await q('INSERT INTO tags (workspace_id, name, color) VALUES ($1,$2,$3) ON CONFLICT (workspace_id, name) DO UPDATE SET color=EXCLUDED.color', [ctx.ws.id, name, color]);
    redirect(res, '/entegrasyonlar#etiketler');
  });

  // ---------- Entegrasyonlar sayfası ----------
  const shown = new Map();
  route('GET', '/entegrasyonlar', async (ctx, res) => {
    const f = csrf(ctx); const owner = ctx.user.role === 'owner'; const auto = ctx.lim.automation;
    const keys = await all('SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE workspace_id=$1 AND revoked_at IS NULL ORDER BY id DESC', [ctx.ws.id]);
    const hooks = await all('SELECT id, url, events, active, last_status, last_at FROM webhooks WHERE workspace_id=$1 ORDER BY id DESC', [ctx.ws.id]);
    const feeds = await all('SELECT f.*, b.name brand FROM feeds f JOIN brands b ON b.id=f.brand_id WHERE f.workspace_id=$1 ORDER BY f.id DESC', [ctx.ws.id]);
    const tags = await all('SELECT t.name, t.color, (SELECT count(*) FROM posts p WHERE p.workspace_id=t.workspace_id AND t.name = ANY(p.tags))::int n FROM tags t WHERE t.workspace_id=$1 ORDER BY t.name', [ctx.ws.id]);
    const k = ctx.url.searchParams.get('yeni'); const s = k && shown.get(k); if (s) shown.delete(k);
    const lock = auto ? '' : `<p class="muted">Bu özellik Business ve Agency paketlerinde. <a href="/paket">Paketleri gör</a></p>`;
    send(res, 200, layout(ctx, 'Entegrasyonlar', `<div class="page-head"><div><h1>Entegrasyonlar</h1><p>Etiketler, RSS, webhook ve API</p></div><a class="btn ghost" href="/gelistirici">API belgeleri</a></div>
${s ? `<div class="flash"><strong>${esc(s.label)}</strong> Şimdi kopyalayın; bir daha gösterilmez.<input id="secret-new" readonly value="${esc(s.value)}" style="margin-top:8px"><button class="ghost" data-copy="#secret-new" style="margin-top:8px">Kopyala</button></div>` : ''}
<section class="card" id="etiketler"><h2>Etiketler</h2><p class="muted">Gönderileri gruplamak için; takvimde renkli görünür ve filtrelenebilir.</p><div class="row">${tags.map(t => `<form method="post" action="/etiketler" class="row" style="gap:6px;align-items:center">${f}<input type="hidden" name="name" value="${esc(t.name)}"><input type="color" name="color" value="${esc(t.color)}" style="width:42px;padding:2px" data-autosubmit><span class="tagp" style="border-color:${esc(t.color)}">${esc(t.name)} · ${t.n}</span><button class="ghost" name="sil" value="1" data-confirm="Etiket kaldırılsın mı?" style="padding:2px 8px">×</button></form>`).join('') || '<span class="muted">Henüz etiket yok. Gönderi düzenlerken etiket yazdığınızda burada görünür.</span>'}</div>
<form class="row" method="post" action="/etiketler" style="margin-top:10px">${f}<label>Yeni etiket<input name="name" maxlength="30" required></label><label>Renk<input type="color" name="color" value="#B08433"></label><button class="ghost">Ekle</button></form></section>
<section class="card" id="rss"><h2>RSS'ten otomatik fikir</h2><p class="muted">Blogunuza ya da haber kaynağınıza yeni yazı düştüğünde, seçilen markaya başlık ve bağlantısıyla bir fikir gönderisi eklenir. Saatte bir kontrol edilir.</p>${lock}
${feeds.map(x => `<div class="row" style="justify-content:space-between;border-top:1px solid #ECE6DA;padding-top:8px"><span><strong>${esc(x.brand)}</strong> · ${esc(x.url)}<br><span class="muted">${x.last_checked ? 'Son kontrol ' + fmtDateTime(x.last_checked) : 'Henüz kontrol edilmedi'}${x.error ? ' · ' + esc(x.error) : ''}</span></span>${owner ? `<form method="post" action="/rss/${x.id}/sil">${f}<button class="danger" data-confirm="Akış kaldırılsın mı?">Kaldır</button></form>` : ''}</div>`).join('')}
${auto && owner ? `<form class="row" method="post" action="/rss" style="margin-top:10px">${f}<label>Marka<select name="brand_id">${ctx.brands.map(b => `<option value="${b.id}"${b.id === ctx.brand?.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label><label style="flex:1">Akış adresi (https)<input type="url" name="url" required placeholder="https://blog.ornek.com/feed"></label><button class="ghost">Ekle</button></form>` : ''}</section>
<section class="card" id="webhook"><h2>Webhook</h2><p class="muted">Gönderi paylaşıldığında ya da paylaşılamadığında adresinize imzalı bir JSON gönderilir (başlık: <code>X-Arvela-Signature: sha256=…</code>). n8n, Make ve Zapier ile kullanılabilir.</p>${lock}
${hooks.map(h => `<div class="row" style="justify-content:space-between;border-top:1px solid #ECE6DA;padding-top:8px"><span>${esc(h.url)}<br><span class="muted">${h.events.join(', ')}${h.last_at ? ` · son gönderim ${fmtDateTime(h.last_at)} (${h.last_status || 'ulaşılamadı'})` : ''}</span></span>${owner ? `<span class="row"><form method="post" action="/webhook/${h.id}/dene">${f}<button class="ghost">Dene</button></form><form method="post" action="/webhook/${h.id}/sil">${f}<button class="danger" data-confirm="Webhook kaldırılsın mı?">Kaldır</button></form></span>` : ''}</div>`).join('')}
${auto && owner ? `<form class="row" method="post" action="/webhook" style="margin-top:10px">${f}<label style="flex:1">Adres (https)<input type="url" name="url" required placeholder="https://n8n.ornek.com/webhook/..."></label><label class="chk"><input type="checkbox" name="events" value="paylasildi" checked> Paylaşıldı</label><label class="chk"><input type="checkbox" name="events" value="hata" checked> Hata</label><button class="ghost">Ekle</button></form>` : ''}</section>
<section class="card" id="api"><h2>API anahtarları</h2><p class="muted">Kendi sisteminizden gönderi oluşturmak, kanal ve gönderi listelemek için. <a href="/gelistirici">Belgeler</a></p>${lock}
${keys.map(x => `<div class="row" style="justify-content:space-between;border-top:1px solid #ECE6DA;padding-top:8px"><span><strong>${esc(x.name)}</strong> · <code>${esc(x.prefix)}…</code><br><span class="muted">Oluşturuldu ${fmtDateTime(x.created_at)}${x.last_used_at ? ' · son kullanım ' + fmtDateTime(x.last_used_at) : ''}</span></span>${owner ? `<form method="post" action="/api-anahtar/${x.id}/sil">${f}<button class="danger" data-confirm="Anahtar iptal edilsin mi? Onu kullanan entegrasyonlar durur.">İptal et</button></form>` : ''}</div>`).join('')}
${auto && owner ? `<form class="row" method="post" action="/api-anahtar" style="margin-top:10px">${f}<label>Ad<input name="name" maxlength="60" required placeholder="Web sitesi"></label><button class="ghost">Anahtar oluştur</button></form>` : ''}</section>`, '/entegrasyonlar'));
  });
  const ownerAuto = (ctx) => { need(ctx, 'owner'); needUsable(ctx); if (!ctx.lim.automation) throw new HttpError(402, 'Bu özellik Business ve Agency paketlerinde.'); };
  const keep = (label, value) => { const key = token(9); shown.set(key, { label, value, at: Date.now() }); for (const [kk, v] of shown) if (v.at < Date.now() - 600_000) shown.delete(kk); return key; };
  route('POST', '/api-anahtar', async (ctx, res) => {
    ownerAuto(ctx); const name = clip(nn(ctx.body.name), 60); if (!name) throw new HttpError(400, 'Ad gerekli.');
    if ((await one('SELECT count(*)::int n FROM api_keys WHERE workspace_id=$1 AND revoked_at IS NULL', [ctx.ws.id])).n >= 10) throw new HttpError(400, 'En çok 10 etkin anahtar.');
    const raw = 'as_' + token(30); await q('INSERT INTO api_keys (workspace_id, name, key_hash, prefix, created_by) VALUES ($1,$2,$3,$4,$5)', [ctx.ws.id, name, sha(raw), raw.slice(0, 8), ctx.user.id]);
    await audit(ctx, 'api.key', { name }); redirect(res, `/entegrasyonlar?yeni=${keep('API anahtarı hazır.', raw)}#api`);
  });
  route('POST', '/api-anahtar/:id/sil', async (ctx, res, p) => { need(ctx, 'owner'); await q('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); await audit(ctx, 'api.revoke', { id: int(p.id) }); redirect(res, '/entegrasyonlar#api'); });
  route('POST', '/webhook', async (ctx, res) => {
    ownerAuto(ctx); const u = await safeUrl(ctx.body.url); if (!u) throw new HttpError(400, 'Adres https ile başlamalı ve herkese açık bir sunucuyu göstermeli.');
    if ((await one('SELECT count(*)::int n FROM webhooks WHERE workspace_id=$1', [ctx.ws.id])).n >= 10) throw new HttpError(400, 'En çok 10 webhook.');
    const ev = [].concat(ctx.body.events || []).filter(e => ['paylasildi', 'hata'].includes(e)); const secret = 'whsec_' + token(24);
    await q('INSERT INTO webhooks (workspace_id, url, secret_enc, events) VALUES ($1,$2,$3,$4)', [ctx.ws.id, u.toString(), seal(secret), ev.length ? ev : ['paylasildi', 'hata']]);
    await audit(ctx, 'webhook.create', {}); redirect(res, `/entegrasyonlar?yeni=${keep('Webhook imza anahtarı (doğrulama için):', secret)}#webhook`);
  });
  route('POST', '/webhook/:id/sil', async (ctx, res, p) => { need(ctx, 'owner'); await q('DELETE FROM webhooks WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); redirect(res, '/entegrasyonlar#webhook'); });
  route('POST', '/webhook/:id/dene', async (ctx, res, p) => {
    ownerAuto(ctx); const h = await one('SELECT id FROM webhooks WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); if (!h) throw new HttpError(404, 'Bulunamadı.');
    await q("UPDATE webhooks SET events = CASE WHEN 'deneme' = ANY(events) THEN events ELSE array_append(events, 'deneme') END WHERE id=$1", [h.id]);
    await fireWebhooks(ctx.ws.id, 'deneme', { message: 'Arvela Social deneme bildirimi' });
    await q("UPDATE webhooks SET events = array_remove(events, 'deneme') WHERE id=$1", [h.id]); redirect(res, '/entegrasyonlar#webhook');
  });
  route('POST', '/rss', async (ctx, res) => {
    ownerAuto(ctx); const b = ctx.brands.find(x => x.id === int(ctx.body.brand_id)); if (!b) throw new HttpError(400, 'Marka seçin.');
    const u = await safeUrl(ctx.body.url); if (!u) throw new HttpError(400, 'Akış adresi https ile başlamalı ve herkese açık olmalı.');
    if ((await one('SELECT count(*)::int n FROM feeds WHERE workspace_id=$1', [ctx.ws.id])).n >= 10) throw new HttpError(400, 'En çok 10 akış.');
    await q('INSERT INTO feeds (workspace_id, brand_id, url) VALUES ($1,$2,$3)', [ctx.ws.id, b.id, u.toString()]); redirect(res, '/entegrasyonlar#rss');
  });
  route('POST', '/rss/:id/sil', async (ctx, res, p) => { need(ctx, 'owner'); await q('DELETE FROM feeds WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]); redirect(res, '/entegrasyonlar#rss'); });

  // ---------- Herkese açık API (v1) ----------
  apiRoute('GET', '/api/v1/kanallar', async (ctx, res, p, a) => {
    const rows = await all('SELECT a.id, a.brand_id, b.name brand, a.platform, a.kind, a.name, a.handle, a.status FROM accounts a JOIN brands b ON b.id=a.brand_id WHERE b.workspace_id=$1 ORDER BY a.id', [a.wsId]);
    json(res, 200, { kanallar: rows.map(r => ({ ...r, otomatik: !!r.kind && r.status === 'bagli' })) });
  });
  apiRoute('GET', '/api/v1/gonderiler', async (ctx, res, p, a) => {
    const sp = ctx.url.searchParams; const from = sp.get('baslangic') ? new Date(sp.get('baslangic')) : new Date(Date.now() - 30 * 864e5); const to = sp.get('bitis') ? new Date(sp.get('bitis')) : new Date(Date.now() + 90 * 864e5);
    if (isNaN(from) || isNaN(to)) throw new HttpError(400, 'Tarih geçersiz (ISO 8601).');
    const rows = await all(`SELECT id, brand_id, status, title, caption, hashtags, scheduled_at, published_at, account_ids, publish_mode, tags FROM posts WHERE workspace_id=$1 AND scheduled_at BETWEEN $2 AND $3 ORDER BY scheduled_at LIMIT 500`, [a.wsId, from.toISOString(), to.toISOString()]);
    json(res, 200, { gonderiler: rows });
  });
  apiRoute('POST', '/api/v1/gonderiler', async (ctx, res, p, a) => {
    const b = ctx.body || {}; const brand = await one('SELECT id FROM brands WHERE id=$1 AND workspace_id=$2', [int(b.brand_id), a.wsId]); if (!brand) throw new HttpError(400, 'brand_id geçersiz.');
    const n = (await one(`SELECT count(*)::int n FROM posts WHERE workspace_id=$1 AND created_at >= date_trunc('month', now()) AND status<>'iptal'`, [a.wsId])).n; if (n >= a.lim.postsPerMonth) throw new HttpError(402, 'Aylık gönderi sınırı doldu.');
    const accs = await all('SELECT id, platform, kind FROM accounts WHERE brand_id=$1', [brand.id]);
    const ids = [...new Set([].concat(b.account_ids || []).map(Number))].filter(id => accs.some(x => x.id === id)); if (!ids.length) throw new HttpError(400, 'account_ids en az bir kanal içermeli.');
    const when = b.scheduled_at ? new Date(b.scheduled_at) : null; if (b.scheduled_at && isNaN(when)) throw new HttpError(400, 'scheduled_at geçersiz (ISO 8601).');
    const media = [].concat(b.media_ids || []).map(Number).filter(Boolean); const okMedia = media.length ? (await all('SELECT id FROM media WHERE workspace_id=$1 AND id = ANY($2::int[])', [a.wsId, media])).map(r => r.id) : [];
    const status = b.status === 'onay' && a.lim.approvals ? 'onay' : b.status === 'onaylandi' && !a.lim.approvals ? 'onaylandi' : 'taslak';
    const mode = b.mode === 'elle' ? 'elle' : ids.some(id => accs.find(x => x.id === id).kind) ? 'otomatik' : 'elle';
    const post = await one(`INSERT INTO posts (workspace_id, brand_id, platforms, account_ids, publish_mode, scheduled_at, status, title, caption, hashtags, first_comment, media_ids, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, status`,
      [a.wsId, brand.id, [...new Set(ids.map(id => accs.find(x => x.id === id).platform))], ids, mode, when ? when.toISOString() : null, status, clip(nn(b.title), 120), clip(String(b.caption || ''), 63206), clip(nn(b.hashtags), 600), clip(nn(b.first_comment), 2200), okMedia, [].concat(b.tags || []).map(t => clip(String(t), 30)).filter(Boolean).slice(0, 8)]);
    await q(`INSERT INTO audit (workspace_id, action, detail) VALUES ($1,'api.post',$2)`, [a.wsId, { id: post.id, key: a.keyId }]);
    json(res, 201, { id: post.id, status: post.status, url: `${base()}/gonderi/${post.id}` });
  });
  apiRoute('DELETE', '/api/v1/gonderiler/:id', async (ctx, res, p, a) => {
    const r = await one(`UPDATE posts SET status='iptal', updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status<>'paylasildi' RETURNING id`, [int(p.id), a.wsId]);
    if (!r) throw new HttpError(404, 'Gönderi bulunamadı ya da paylaşılmış.'); json(res, 200, { id: r.id, status: 'iptal' });
  });
  apiRoute('POST', '/api/v1/medya', async (ctx, res, p, a) => {
    const b = ctx.body || {}; const buf = Buffer.from(String(b.data_base64 || ''), 'base64'); if (!buf.length) throw new HttpError(400, 'data_base64 gerekli.');
    const m = await saveImage({ ws: { id: a.wsId }, user: { id: null } }, buf, clip(nn(b.name), 120) || 'api.jpg', 'upload', int(b.brand_id) || null);
    json(res, 201, { id: m.id });
  });

  route('GET', '/gelistirici', async (ctx, res) => {
    const B = base(); const code = (s) => `<pre style="background:#0B0D12;color:#E9E4D8;padding:14px;border-radius:12px;overflow:auto;font-size:13px">${esc(s)}</pre>`;
    send(res, 200, layout(ctx, 'API belgeleri', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/entegrasyonlar">Entegrasyonlar</a></p><h1>API belgeleri (v1)</h1><p>Tüm istekler <code>Authorization: Bearer as_…</code> başlığı ister. Dakikada 120 istek. Yanıtlar JSON.</p></div></div>
<section class="card"><h2>Kanalları listele</h2>${code(`curl ${B}/api/v1/kanallar -H "Authorization: Bearer as_..."`)}</section>
<section class="card"><h2>Görsel yükle</h2><p class="muted">JPEG önerilir (Instagram yalnız JPEG kabul eder). En çok 8 MB.</p>${code(`curl -X POST ${B}/api/v1/medya -H "Authorization: Bearer as_..." -H "Content-Type: application/json" \\\n  -d '{"name":"kampanya.jpg","brand_id":1,"data_base64":"<base64>"}'`)}</section>
<section class="card"><h2>Gönderi oluştur</h2><p class="muted"><code>status</code>: taslak (varsayılan), onay (onay akışı olan paketlerde) ya da onaylandi (onay akışı olmayan pakette doğrudan zamanlanır). <code>mode</code>: otomatik ya da elle.</p>${code(`curl -X POST ${B}/api/v1/gonderiler -H "Authorization: Bearer as_..." -H "Content-Type: application/json" \\\n  -d '{"brand_id":1,"account_ids":[3,4],"scheduled_at":"2026-12-01T19:00:00+03:00",\n       "caption":"Kış harmanı geldi","hashtags":"#kahve","media_ids":[12],"status":"onay","tags":["kampanya"]}'`)}</section>
<section class="card"><h2>Gönderileri listele</h2>${code(`curl "${B}/api/v1/gonderiler?baslangic=2026-12-01&bitis=2026-12-31" -H "Authorization: Bearer as_..."`)}</section>
<section class="card"><h2>Gönderiyi iptal et</h2>${code(`curl -X DELETE ${B}/api/v1/gonderiler/42 -H "Authorization: Bearer as_..."`)}</section>
<section class="card"><h2>Webhook imzasını doğrula</h2>${code(`imza = HMAC_SHA256(webhook_anahtari, istek_govdesi)  →  "sha256=" + hex(imza) === X-Arvela-Signature`)}</section>`, '/entegrasyonlar'));
  });
}
