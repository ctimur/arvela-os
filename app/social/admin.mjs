// Arvela Social — platform yönetimi (yalnız SOCIAL_ADMIN_EMAILS): çalışma alanları, paket ve ödeme durumu, fiyatlar.
import { route, send, redirect, audit } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, opts, badge } from './ui.mjs';
import { esc, int, clip, nn, HttpError, fmtDate, fmtDateTime } from './lib.mjs';
import { PLANS, EXTRAS, WS_ST, PRICE_DEFAULTS } from './plans.mjs';
import { syncAccount, osClientUrl, recipients, sendMail, mailHtml } from './notify.mjs';
import { PLATFORMS, POST_ST, POST_TONE } from './plans.mjs';

const needAdmin = (ctx) => { if (!ctx.admin) throw new HttpError(404, 'Sayfa bulunamadı.'); };

export function register() {
  route('GET', '/yonetim', async (ctx, res) => {
    needAdmin(ctx); const f = csrf(ctx);
    const rows = await all(`SELECT w.*, (SELECT count(*) FROM users u WHERE u.workspace_id=w.id AND u.active)::int users, (SELECT count(*) FROM brands b WHERE b.workspace_id=w.id)::int brands,
      (SELECT count(*) FROM posts p WHERE p.workspace_id=w.id AND p.created_at >= date_trunc('month', now()))::int posts, (SELECT max(last_login) FROM users u WHERE u.workspace_id=w.id) seen,
      (SELECT email FROM users u WHERE u.workspace_id=w.id AND u.role='owner' ORDER BY id LIMIT 1) owner FROM workspaces w ORDER BY (w.status='odeme') DESC, w.id DESC LIMIT 500`);
    const prices = Object.fromEntries((await all(`SELECT key, value FROM settings WHERE key LIKE 'price.%'`)).map(r => [r.key.slice(6), r.value]));
    const codes = [...Object.values(PLANS).map(p => [p.code, p.name]), ...Object.values(EXTRAS).map(e => [e.code, e.name])];
    send(res, 200, layout(ctx, 'Yönetim', `<div class="page-head"><div><h1>Yönetim</h1><p>${rows.length} çalışma alanı · ${rows.filter(r => r.status === 'odeme').length} ödeme bekliyor</p></div><a class="btn gold" href="/yonetim/editor">Editör kuyruğu (${(await one(`SELECT count(*)::int n FROM posts WHERE editor_status='bekliyor'`)).n})</a></div>
<div class="tbl"><table><tr><th>Çalışma alanı</th><th>Sahip</th><th>Durum</th><th>Kullanım</th><th>Son giriş</th><th></th></tr>${rows.map(w => `<tr><td><strong>${esc(w.name)}</strong><br><span class="muted">#${w.id} · ${fmtDate(w.created_at)}</span></td><td>${esc(w.owner || '—')}</td>
<td>${badge(WS_ST[w.status], w.status === 'aktif' ? 'ok' : w.status === 'odeme' ? 'warn' : w.status === 'askida' ? 'bad' : '')} ${w.plan ? esc(PLANS[w.plan].name) : ''}${w.requested_plan && w.requested_plan !== w.plan ? `<br>İstek: <strong>${esc(PLANS[w.requested_plan].name)}</strong>` : ''}${w.paid_until ? `<br><span class="muted">Ödendi: ${fmtDate(w.paid_until)}</span>` : w.trial_ends ? `<br><span class="muted">Deneme: ${fmtDate(w.trial_ends)}</span>` : ''}</td>
<td>${w.users} kişi · ${w.brands} marka · ${w.posts} gönderi/ay</td><td>${fmtDate(w.seen)}</td><td><a class="btn ghost" href="/yonetim/${w.id}">Yönet</a></td></tr>`).join('')}</table></div>
<form class="card stack" method="post" action="/yonetim/fiyat">${f}<h2>Paket sayfasında görünen fiyatlar</h2><p class="muted">Boş bırakılırsa katalog fiyatı görünür (ör. "${esc(PRICE_DEFAULTS['SAAS-02'])}").</p>
<div class="grid3">${codes.map(([c, n]) => `<label>${esc(c)} · ${esc(n)}<input name="${esc(c)}" maxlength="60" value="${esc(prices[c] || '')}"></label>`).join('')}</div><div><button>Kaydet</button></div></form>`, '/yonetim'));
  });
  route('GET', '/yonetim/:id', async (ctx, res, p) => {
    needAdmin(ctx); const w = await one('SELECT * FROM workspaces WHERE id=$1', [int(p.id)]); if (!w) throw new HttpError(404, 'Bulunamadı.'); const b = w.billing || {};
    const users = await all('SELECT name, email, role, active, last_login FROM users WHERE workspace_id=$1 ORDER BY id', [w.id]);
    const iso = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    send(res, 200, layout(ctx, w.name, `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/yonetim">Yönetim</a></p><h1>${esc(w.name)}</h1>${w.arvela_client_id ? `<p><a href="${esc(osClientUrl(w.arvela_client_id))}" target="_blank" rel="noopener">Arvela OS'te müşteri #${w.arvela_client_id}</a></p>` : '<p class="muted">Henüz Arvela OS\'e aktarılmadı.</p>'}</div>
<form method="post" action="/yonetim/${w.id}/aktar">${csrf(ctx)}<button class="ghost">Arvela OS'e aktar</button></form></div>
${ctx.url.searchParams.get('aktarim') === '0' ? '<div class="err">Arvela OS\'e aktarılamadı. Köprü ayarını kontrol edin.</div>' : ctx.url.searchParams.get('aktarim') === '1' ? '<div class="flash">Arvela OS güncellendi.</div>' : ''}
<div class="grid2" style="align-items:start"><form class="card stack" method="post" action="/yonetim/${w.id}">${csrf(ctx)}<h2>Paket ve durum</h2>
<div class="row"><label>Durum<select name="status">${opts(WS_ST, w.status)}</select></label><label>Paket<select name="plan"><option value="">— (deneme)</option>${opts(Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, v.name])), w.plan || '')}</select></label></div>
<div class="row"><label>Deneme bitişi<input type="date" name="trial_ends" value="${iso(w.trial_ends)}"></label><label>Ödendiği tarih (dahil)<input type="date" name="paid_until" value="${iso(w.paid_until)}"></label></div>
<div class="row"><label>Ek marka<input type="number" name="extra_brands" min="0" max="50" value="${w.extra_brands}"></label><label class="chk"><input type="checkbox" name="editor_service" value="1"${w.editor_service ? ' checked' : ''}> İnsan editör kontrolü</label></div>
<label>İç not<textarea name="note" rows="2" maxlength="1000">${esc(w.note || '')}</textarea></label><div><button class="gold">Kaydet</button></div></form>
<div class="stack"><section class="card"><h2>Fatura bilgileri</h2>${b.title ? `<p style="margin:0">${esc(b.title)}<br>${esc(b.tax_office || '')} ${esc(b.tax_no || '')}<br>${esc(b.address || '')}<br>${esc(b.email || '')} · ${esc(b.phone || '')}</p>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}` : '<p class="muted">Girilmedi.</p>'}</section>
<section class="card"><h2>Kullanıcılar</h2>${users.map(u => `<p style="margin:0">${esc(u.name)} · ${esc(u.email)} · ${esc(u.role)}${u.active ? '' : ' (kapalı)'}<br><span class="muted">Son giriş ${fmtDate(u.last_login)}</span></p>`).join('')}</section></div></div>`, '/yonetim'));
  });
  route('POST', '/yonetim/:id', async (ctx, res, p) => {
    needAdmin(ctx); const b = ctx.body; const d = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
    const w = await one(`UPDATE workspaces SET status=$1, plan=$2, trial_ends=$3, paid_until=$4, extra_brands=$5, editor_service=$6, note=$7,
      requested_plan=CASE WHEN $2::text IS NOT NULL AND requested_plan=$2 THEN NULL ELSE requested_plan END WHERE id=$8 RETURNING id`,
      [WS_ST[b.status] ? b.status : 'deneme', PLANS[b.plan] ? b.plan : null, d(b.trial_ends), d(b.paid_until), Math.max(0, Math.min(50, int(b.extra_brands) || 0)), b.editor_service === '1', clip(nn(b.note), 1000), int(p.id)]);
    if (!w) throw new HttpError(404, 'Bulunamadı.'); await audit(ctx, 'admin.workspace', { id: w.id, status: b.status, plan: b.plan });
    const ws = await one('SELECT * FROM workspaces WHERE id=$1', [w.id]); let ok = null;
    if (ws.status === 'aktif' && ws.plan) ok = await syncAccount(ws, 'aktif'); else if (ws.status === 'askida') ok = await syncAccount(ws, 'askida');
    redirect(res, `/yonetim/${w.id}${ok === null ? '' : '?aktarim=1'}`);
  });
  route('POST', '/yonetim/:id/aktar', async (ctx, res, p) => {
    needAdmin(ctx); const ws = await one('SELECT * FROM workspaces WHERE id=$1', [int(p.id)]); if (!ws) throw new HttpError(404, 'Bulunamadı.');
    const action = ws.status === 'aktif' && ws.plan ? 'aktif' : ws.status === 'askida' ? 'askida' : (ws.requested_plan || ws.plan) ? 'talep' : null;
    if (!action) throw new HttpError(400, 'Aktarmak için önce bir paket isteği ya da etkin paket gerekli.');
    const id = await syncAccount(ws, action); redirect(res, `/yonetim/${ws.id}?aktarim=${id ? 1 : 0}`);
  });
  route('POST', '/yonetim/fiyat', async (ctx, res) => {
    needAdmin(ctx);
    for (const c of [...Object.values(PLANS).map(p => p.code), ...Object.values(EXTRAS).map(e => e.code)]) {
      const v = clip(nn(ctx.body[c]), 60); if (v) await q(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['price.' + c, v]); else await q('DELETE FROM settings WHERE key=$1', ['price.' + c]);
    }
    await audit(ctx, 'admin.prices', {}); redirect(res, '/yonetim');
  });

  // ---------- İnsan editör kontrolü (SAAS-06): Arvela editörü, eklentiyi alan hesapların gönderilerini kontrol eder ----------
  route('GET', '/yonetim/editor', async (ctx, res) => {
    needAdmin(ctx);
    const rows = await all(`SELECT p.id, p.title, p.caption, p.scheduled_at, p.status, p.platforms, b.name brand, w.name ws FROM posts p JOIN brands b ON b.id=p.brand_id JOIN workspaces w ON w.id=p.workspace_id
      WHERE p.editor_status='bekliyor' AND w.editor_service ORDER BY p.scheduled_at NULLS LAST LIMIT 200`);
    send(res, 200, layout(ctx, 'Editör kuyruğu', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/yonetim">Yönetim</a></p><h1>Editör kuyruğu</h1><p>${rows.length} gönderi kontrol bekliyor. Paylaşım zamanı yakın olanlar üstte.</p></div></div>
<div class="tbl"><table><tr><th>Gönderi</th><th>Marka</th><th>Zaman</th><th>Durum</th></tr>${rows.map(r => `<tr><td><a href="/yonetim/editor/${r.id}">${esc(r.title || String(r.caption || 'Başlıksız').slice(0, 70))}</a></td><td>${esc(r.brand)}<br><span class="muted">${esc(r.ws)}</span></td>
<td>${r.scheduled_at ? fmtDateTime(r.scheduled_at) : 'Tarihsiz'}</td><td>${badge(POST_ST[r.status], POST_TONE[r.status])}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Kuyruk boş.</td></tr>'}</table></div>`, '/yonetim'));
  });
  route('GET', '/yonetim/editor/:id', async (ctx, res, pr) => {
    needAdmin(ctx);
    const p = await one(`SELECT p.*, w.editor_service FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1`, [int(pr.id)]); if (!p || !p.editor_service) throw new HttpError(404, 'Bulunamadı.');
    const b = await one('SELECT * FROM brands WHERE id=$1', [p.brand_id]); const notes = await all('SELECT author, kind, body, created_at FROM post_notes WHERE post_id=$1 ORDER BY id DESC LIMIT 20', [p.id]);
    const max = Math.min(...(p.platforms?.length ? p.platforms : ['instagram']).map(k => PLATFORMS[k]?.max || 2200));
    const L = (k, v) => v ? `<p style="margin:0 0 6px"><strong>${k}:</strong> ${esc(Array.isArray(v) ? v.join(', ') : v)}</p>` : '';
    send(res, 200, layout(ctx, 'Editör kontrolü', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/yonetim/editor">Editör kuyruğu</a></p><h1>${esc(p.title || 'Gönderi')}</h1>
<p>${esc(b.name)} · ${p.scheduled_at ? fmtDateTime(p.scheduled_at) : 'Tarihsiz'} · ${(p.platforms || []).map(k => esc(PLATFORMS[k]?.name || k)).join(', ')} ${badge(POST_ST[p.status], POST_TONE[p.status])}</p></div></div>
<div class="grid2" style="align-items:start"><form class="card stack" method="post" action="/yonetim/editor/${p.id}">${csrf(ctx)}
<label>Metin <span class="count" id="cap-count"></span><textarea id="caption" name="caption" rows="10" data-count="#cap-count" data-max="${max}">${esc(p.caption || '')}</textarea></label>
<label>Etiketler<input name="hashtags" maxlength="600" value="${esc(p.hashtags || '')}"></label>
<label>Müşteriye not (yaptığınız düzeltmeler, öneriler)<textarea name="note" rows="3" maxlength="1500" placeholder="Yazım hataları düzeltildi; çağrı cümlesi netleştirildi."></textarea></label>
<div class="row"><button class="gold" name="sonuc" value="ok">Kontrol edildi</button><button class="ghost" name="sonuc" value="bekle">Yalnız kaydet</button></div>
<p class="muted" style="margin:0">Onaylanmış bir gönderinin metnini değiştirirseniz gönderi yeniden müşteri onayına düşer.</p></form>
<div class="stack"><section class="card"><h2>Marka</h2>${L('Ne sunuyor', b.offer)}${L('Hedef kitle', b.audience)}${L('Ses tonu', b.tone)}${L('Üslup', b.voice_notes)}${L('Kullanılmayacaklar', b.banned)}${L('Sütunlar', b.pillars)}</section>
${p.media_ids?.length ? `<section class="card"><h2>Görseller</h2><div class="thumbs">${p.media_ids.map(id => `<a href="/yonetim/medya/${id}" target="_blank"><img src="/yonetim/medya/${id}" alt=""></a>`).join('')}</div></section>` : ''}
<section class="card"><h2>Notlar</h2>${notes.map(n => `<p style="margin:0 0 8px"><strong>${esc(n.author || '')}</strong> <span class="muted">${fmtDateTime(n.created_at)}</span><br>${esc(n.body)}</p>`).join('') || '<p class="muted">Not yok.</p>'}</section></div></div>`, '/yonetim'));
  });
  route('GET', '/yonetim/medya/:id', async (ctx, res, pr) => {
    needAdmin(ctx); const m = await one(`SELECT m.mime, m.bytes FROM media m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=$1 AND w.editor_service`, [int(pr.id)]); if (!m) throw new HttpError(404, 'Bulunamadı.');
    send(res, 200, m.bytes, m.mime, { 'Cache-Control': 'private, max-age=300', 'Content-Security-Policy': "default-src 'none'; img-src 'self'" });
  });
  route('POST', '/yonetim/editor/:id', async (ctx, res, pr) => {
    needAdmin(ctx); const b = ctx.body;
    const p = await one(`SELECT p.*, w.editor_service, w.plan, w.status ws_status FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1`, [int(pr.id)]); if (!p || !p.editor_service) throw new HttpError(404, 'Bulunamadı.');
    const max = Math.min(...(p.platforms?.length ? p.platforms : ['instagram']).map(k => PLATFORMS[k]?.max || 2200));
    const caption = String(b.caption ?? '').slice(0, max); const changed = caption !== (p.caption || '') || (nn(b.hashtags) || null) !== (p.hashtags || null);
    const done = b.sonuc === 'ok'; const note = clip(nn(b.note), 1500);
    const st = changed && p.status === 'onaylandi' && p.plan !== 'solo' ? 'onay' : p.status;
    await q(`UPDATE posts SET caption=$1, hashtags=$2, status=$3, editor_status=$4, editor_checked_at=CASE WHEN $5 THEN now() ELSE editor_checked_at END, updated_at=now() WHERE id=$6`,
      [caption, clip(nn(b.hashtags), 600), st, done ? 'kontrol_edildi' : 'bekliyor', done, p.id]);
    if (note || done) await q(`INSERT INTO post_notes (post_id, author, kind, body) VALUES ($1,'Arvela editör','editor',$2)`, [p.id, [done ? 'Kontrol edildi.' : 'Editör kaydetti.', changed ? 'Metin düzenlendi.' : '', note || ''].filter(Boolean).join(' ')]);
    await audit(ctx, 'editor.check', { post: p.id, done, changed });
    if (done) for (const u of await recipients(p.workspace_id, ['owner', 'editor'])) await sendMail(u.email, `Editör kontrol etti: ${p.title || 'gönderi'}`, mailHtml('Arvela editörü gönderinizi kontrol etti', [changed ? 'Metinde düzenleme yapıldı.' : 'Metin olduğu gibi uygun bulundu.', note ? `Not: ${note}` : '', st !== p.status ? 'Metin değiştiği için gönderi yeniden onaya düştü.' : ''], ['Gönderiyi aç', `/gonderi/${p.id}`]), 'genel');
    redirect(res, done ? '/yonetim/editor' : `/yonetim/editor/${p.id}`);
  });
}
