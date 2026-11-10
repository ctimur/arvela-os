// Arvela Social — kanallar: Instagram/Facebook (Meta) ve LinkedIn hesaplarını bağlama, seçme, yenileme; herkese açık imzalı görsel adresi.
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, badge } from './ui.mjs';
import { esc, int, token, sha, HttpError, fmtDateTime } from './lib.mjs';
import { PLATFORMS } from './plans.mjs';
import { PROVIDERS, KIND_PLATFORM, meta, linkedin } from './providers.mjs';
import { seal, sealJson, openJson, vaultReady, checkMediaSig } from './vault.mjs';

export const KIND_NAME = { fb_page: 'Facebook sayfası', ig_business: 'Instagram işletme', li_person: 'LinkedIn profili', li_org: 'LinkedIn sayfası' };
const P = { meta, linkedin };
export const accountLabel = (a) => `${PLATFORMS[a.platform]?.name || a.platform} · ${a.name || a.handle}`;
const accStatus = (a) => !a.kind ? badge('Elle paylaşım', 'muted') : a.status === 'bagli' ? (a.token_expires && new Date(a.token_expires) < new Date(Date.now() + 7 * 86400e3) ? badge('Yakında yenilenmeli', 'warn') : badge('Bağlı', 'ok')) : badge('Yeniden bağlanmalı', 'bad');
export const avatar = (a, size = 36) => a.avatar ? `<img class="av" src="${esc(a.avatar)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer">` : `<span class="av av-${esc(a.platform)}" style="width:${size}px;height:${size}px">${esc((PLATFORMS[a.platform]?.name || a.platform).slice(0, 2))}</span>`;

// Platform profil fotoğrafının adresi süreli ve sayfa CSP'si dış görsele izin vermiyor: bağlanırken indirip küçük veri adresi olarak saklarız
async function avatarData(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' }); const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return null;
    const b = Buffer.from(await r.arrayBuffer()); return b.length && b.length <= 200_000 ? `data:${type.split(';')[0]};base64,${b.toString('base64')}` : null;
  } catch { return null; }
}
async function brandOf(ctx, id) { const b = await one('SELECT * FROM brands WHERE id=$1 AND workspace_id=$2', [int(id), ctx.ws.id]); if (!b) throw new HttpError(404, 'Marka bulunamadı.'); return b; }
const accCount = async (ws) => (await one('SELECT count(*)::int n FROM accounts a JOIN brands b ON b.id=a.brand_id WHERE b.workspace_id=$1', [ws])).n;

export function register() {
  // ---------- Kanallar sayfası ----------
  route('GET', '/kanallar', async (ctx, res) => {
    const b = ctx.brand; if (!b) return redirect(res, '/baslangic');
    const rows = await all('SELECT * FROM accounts WHERE brand_id=$1 ORDER BY (kind IS NULL), platform, id', [b.id]);
    const owner = ctx.user.role !== 'approver'; const f = csrf(ctx); const used = await accCount(ctx.ws.id);
    const err = ctx.url.searchParams.get('hata'); const ok = ctx.url.searchParams.get('eklendi');
    const btn = (k) => PROVIDERS[k].ready() && vaultReady() ? `<form method="post" action="/kanallar/${k}/baglan">${f}<button class="gold">${esc(PROVIDERS[k].name)} bağla</button></form>` : `<button class="ghost" disabled title="Yönetici uygulama anahtarlarını ekleyince açılır">${esc(PROVIDERS[k].name)} (yakında)</button>`;
    send(res, 200, layout(ctx, 'Kanallar', `<div class="page-head"><div><h1>Kanallar</h1><p>${esc(b.name)} · ${used} / ${ctx.lim.accounts} hesap kullanılıyor</p></div>${owner && ctx.lim.usable ? `<div class="row">${btn('meta')}${btn('linkedin')}</div>` : ''}</div>
${err ? `<div class="err">${esc(err)}</div>` : ''}${ok ? `<div class="flash">${int(ok)} hesap bağlandı. Gönderilerde bu hesapları seçip "Zamanı gelince otomatik paylaş" diyebilirsiniz.</div>` : ''}
<div class="note">Bağlı hesaplara gönderiler zamanı gelince otomatik paylaşılır. Instagram için hesabın <strong>işletme ya da içerik üretici</strong> hesabı olması ve bir Facebook sayfasına bağlı olması gerekir. Bağlantıyı yalnız sayfa yöneticisi kurabilir.</div>
<div class="chan-grid">${rows.map(a => `<section class="card chan">${avatar(a, 44)}<div class="chan-b"><strong>${esc(a.name || a.handle)}</strong><span class="muted">${esc(a.kind ? KIND_NAME[a.kind] : PLATFORMS[a.platform]?.name || a.platform)}${a.handle && a.name && a.handle !== a.name ? ' · ' + esc(a.handle) : ''}</span>
${accStatus(a)}${a.followers != null ? `<span class="muted">${a.followers.toLocaleString('tr-TR')} takipçi</span>` : ''}${a.last_error ? `<span class="muted" title="${esc(a.last_error)}">Son hata: ${esc(a.last_error.slice(0, 80))}</span>` : ''}
${a.token_expires ? `<span class="muted">Bağlantı ${fmtDateTime(a.token_expires)} tarihine kadar geçerli</span>` : ''}</div>
${owner ? `<div class="row">${a.kind && PROVIDERS[a.kind.startsWith('li') ? 'linkedin' : 'meta'].ready() ? `<form method="post" action="/kanallar/${a.kind.startsWith('li') ? 'linkedin' : 'meta'}/baglan">${f}<button class="ghost">Yenile</button></form>` : ''}<form method="post" action="/hesaplar/${a.id}/sil" data-confirm="Kanal kaldırılsın mı? Planlanmış gönderiler bu kanala paylaşılmaz.">${f}<button class="danger">Kaldır</button></form></div>` : ''}</section>`).join('')
  || '<section class="card"><p class="muted">Henüz kanal yok. Yukarıdan bir hesap bağlayın ya da marka sayfasından elle paylaşım için hesap ekleyin.</p></section>'}</div>
<p class="muted">Elle paylaşım için hesap eklemek (TikTok, X, YouTube…) <a href="/markalar/${b.id}">marka sayfasında</a>.</p>`, '/kanallar'));
  });

  // ---------- Bağlantı başlat ----------
  route('POST', '/kanallar/:prov/baglan', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); if (!ctx.brand) throw new HttpError(400, 'Önce bir marka oluşturun.');
    if (!PROVIDERS[p.prov].ready() || !vaultReady()) throw new HttpError(503, 'Bu kanal henüz etkin değil.');
    const t = token(24); await q('INSERT INTO oauth_states (token_hash, workspace_id, brand_id, user_id, provider) VALUES ($1,$2,$3,$4,$5)', [sha(t), ctx.ws.id, ctx.brand.id, ctx.user.id, p.prov]);
    redirect(res, P[p.prov].authUrl(t));
  });

  // ---------- Dönüş ----------
  route('GET', '/kanallar/:prov/donus', async (ctx, res, p) => {
    const sp = ctx.url.searchParams; const t = sp.get('state') || '';
    const st = t ? await one(`SELECT * FROM oauth_states WHERE token_hash=$1 AND provider=$2 AND used_at IS NULL AND created_at > now() - interval '30 minutes'`, [sha(t), p.prov]) : null;
    if (!st || st.user_id !== ctx.user.id || st.workspace_id !== ctx.ws.id) throw new HttpError(400, 'Bağlantı isteği geçersiz ya da süresi dolmuş. Kanallar sayfasından tekrar deneyin.');
    await q('UPDATE oauth_states SET used_at=now() WHERE id=$1', [st.id]);
    if (sp.get('error')) return redirect(res, '/kanallar?hata=' + encodeURIComponent(sp.get('error') === 'access_denied' || sp.get('error') === 'user_cancelled_authorize' ? 'Bağlantı iptal edildi.' : 'Platform bağlantıyı reddetti.'));
    let found; try { found = await P[p.prov].connect(sp.get('code') || ''); } catch (e) { console.error('kanal bağlama', p.prov, e.message); return redirect(res, '/kanallar?hata=' + encodeURIComponent('Bağlanamadı: ' + e.message.slice(0, 160))); }
    if (!found.length) return redirect(res, '/kanallar?hata=' + encodeURIComponent(p.prov === 'meta' ? 'Yönettiğiniz bir Facebook sayfası bulunamadı. Instagram hesabınızın bir sayfaya bağlı olduğundan ve izinleri onayladığınızdan emin olun.' : 'Hesap bulunamadı.'));
    const fresh = await one('INSERT INTO oauth_states (token_hash, workspace_id, brand_id, user_id, provider, payload_enc) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [sha(token(24)), st.workspace_id, st.brand_id, st.user_id, p.prov, sealJson(found)]);
    redirect(res, `/kanallar/sec/${fresh.id}`);
  });

  // ---------- Hesap seçimi ----------
  route('GET', '/kanallar/sec/:id', async (ctx, res, p) => {
    const st = await one(`SELECT * FROM oauth_states WHERE id=$1 AND user_id=$2 AND used_at IS NULL AND created_at > now() - interval '30 minutes' AND payload_enc IS NOT NULL`, [int(p.id), ctx.user.id]);
    if (!st) throw new HttpError(404, 'Seçim süresi doldu; tekrar bağlanın.');
    const found = openJson(st.payload_enc) || []; const b = await brandOf(ctx, st.brand_id);
    const have = new Set((await all('SELECT kind, external_id FROM accounts WHERE brand_id=$1 AND external_id IS NOT NULL', [b.id])).map(a => a.kind + ':' + a.external_id));
    const left = ctx.lim.accounts - await accCount(ctx.ws.id);
    send(res, 200, layout(ctx, 'Hesap seç', `<div class="page-head"><div><h1>Hangi hesaplar bağlansın?</h1><p>${esc(b.name)} markasına eklenecek. Kalan hesap hakkı: ${Math.max(0, left)}</p></div></div>
<form class="card stack" method="post" action="/kanallar/sec/${st.id}">${csrf(ctx)}${found.map((a, i) => { const k = a.kind + ':' + a.external_id; const pf = KIND_PLATFORM[a.kind];
  return `<label class="chk chan-pick">${have.has(k) ? '<input type="checkbox" checked disabled>' : `<input type="checkbox" name="sec" value="${i}"${i < left ? ' checked' : ''}>`} ${avatar({ ...a, avatar: null, platform: pf }, 32)} <span><strong>${esc(a.name)}</strong><br><span class="muted">${esc(KIND_NAME[a.kind])}${a.handle && a.handle !== a.name ? ' · ' + esc(a.handle) : ''}${have.has(k) ? ' · zaten bağlı (anahtar yenilenecek)' : ''}</span></span></label>`; }).join('')}
<div class="row"><button class="gold">Bağla</button><a class="btn ghost" href="/kanallar">Vazgeç</a></div></form>`, '/kanallar'));
  });
  route('POST', '/kanallar/sec/:id', async (ctx, res, p) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx);
    const st = await one(`SELECT * FROM oauth_states WHERE id=$1 AND user_id=$2 AND used_at IS NULL AND created_at > now() - interval '30 minutes' AND payload_enc IS NOT NULL`, [int(p.id), ctx.user.id]);
    if (!st) throw new HttpError(404, 'Seçim süresi doldu; tekrar bağlanın.');
    await q('UPDATE oauth_states SET used_at=now(), payload_enc=NULL WHERE id=$1', [st.id]);
    const found = openJson(st.payload_enc) || []; const pick = new Set([].concat(ctx.body.sec || []).map(Number));
    let added = 0; let left = ctx.lim.accounts - await accCount(ctx.ws.id);
    for (const [i, a] of found.entries()) {
      const ex = await one('SELECT id FROM accounts WHERE brand_id=$1 AND kind=$2 AND external_id=$3', [st.brand_id, a.kind, a.external_id]);
      const av = await avatarData(a.avatar);
      const vals = [a.name, a.handle, av, seal(a.token), a.expires, a.followers, ctx.user.id, a.page_id || null];
      if (ex) { await q(`UPDATE accounts SET name=$1, handle=$2, avatar=$3, token_enc=$4, token_expires=$5, followers=COALESCE($6, followers), connected_by=$7, page_id=$8, status='bagli', last_error=NULL, connected_at=now() WHERE id=$9`, [...vals, ex.id]); continue; }
      if (!pick.has(i)) continue; if (left <= 0) break;
      await q(`INSERT INTO accounts (brand_id, platform, kind, external_id, name, handle, avatar, token_enc, token_expires, followers, connected_by, page_id, status, connected_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'bagli',now())`, [st.brand_id, KIND_PLATFORM[a.kind], a.kind, a.external_id, a.name, a.handle, av, seal(a.token), a.expires, a.followers, ctx.user.id, a.page_id || null]);
      added++; left--;
    }
    await audit(ctx, 'channel.connect', { provider: st.provider, added }); redirect(res, `/kanallar?eklendi=${added}`);
  });

  // ---------- Herkese açık, süreli görsel adresi (Instagram/Facebook görseli buradan çeker) ----------
  route('GET', '/m/:id/:exp/:sig', async (ctx, res, p) => {
    if (!checkMediaSig(p.id, p.exp, p.sig)) throw new HttpError(404, 'Bulunamadı.');
    const m = await one('SELECT mime, bytes FROM media WHERE id=$1', [int(p.id)]); if (!m) throw new HttpError(404, 'Bulunamadı.');
    send(res, 200, m.bytes, m.mime, { 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'", 'X-Robots-Tag': 'noindex' });
  }, { open: true });
}
