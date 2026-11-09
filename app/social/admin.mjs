// Arvela Social — platform yönetimi (yalnız SOCIAL_ADMIN_EMAILS): çalışma alanları, paket ve ödeme durumu, fiyatlar.
import { route, send, redirect, audit } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, opts, badge } from './ui.mjs';
import { esc, int, clip, nn, HttpError, fmtDate } from './lib.mjs';
import { PLANS, EXTRAS, WS_ST } from './plans.mjs';

const needAdmin = (ctx) => { if (!ctx.admin) throw new HttpError(404, 'Sayfa bulunamadı.'); };

export function register() {
  route('GET', '/yonetim', async (ctx, res) => {
    needAdmin(ctx); const f = csrf(ctx);
    const rows = await all(`SELECT w.*, (SELECT count(*) FROM users u WHERE u.workspace_id=w.id AND u.active)::int users, (SELECT count(*) FROM brands b WHERE b.workspace_id=w.id)::int brands,
      (SELECT count(*) FROM posts p WHERE p.workspace_id=w.id AND p.created_at >= date_trunc('month', now()))::int posts, (SELECT max(last_login) FROM users u WHERE u.workspace_id=w.id) seen,
      (SELECT email FROM users u WHERE u.workspace_id=w.id AND u.role='owner' ORDER BY id LIMIT 1) owner FROM workspaces w ORDER BY (w.status='odeme') DESC, w.id DESC LIMIT 500`);
    const prices = Object.fromEntries((await all(`SELECT key, value FROM settings WHERE key LIKE 'price.%'`)).map(r => [r.key.slice(6), r.value]));
    const codes = [...Object.values(PLANS).map(p => [p.code, p.name]), ...Object.values(EXTRAS).map(e => [e.code, e.name])];
    send(res, 200, layout(ctx, 'Yönetim', `<div class="page-head"><div><h1>Yönetim</h1><p>${rows.length} çalışma alanı · ${rows.filter(r => r.status === 'odeme').length} ödeme bekliyor</p></div></div>
<div class="tbl"><table><tr><th>Çalışma alanı</th><th>Sahip</th><th>Durum</th><th>Kullanım</th><th>Son giriş</th><th></th></tr>${rows.map(w => `<tr><td><strong>${esc(w.name)}</strong><br><span class="muted">#${w.id} · ${fmtDate(w.created_at)}</span></td><td>${esc(w.owner || '—')}</td>
<td>${badge(WS_ST[w.status], w.status === 'aktif' ? 'ok' : w.status === 'odeme' ? 'warn' : w.status === 'askida' ? 'bad' : '')} ${w.plan ? esc(PLANS[w.plan].name) : ''}${w.requested_plan && w.requested_plan !== w.plan ? `<br>İstek: <strong>${esc(PLANS[w.requested_plan].name)}</strong>` : ''}${w.paid_until ? `<br><span class="muted">Ödendi: ${fmtDate(w.paid_until)}</span>` : w.trial_ends ? `<br><span class="muted">Deneme: ${fmtDate(w.trial_ends)}</span>` : ''}</td>
<td>${w.users} kişi · ${w.brands} marka · ${w.posts} gönderi/ay</td><td>${fmtDate(w.seen)}</td><td><a class="btn ghost" href="/yonetim/${w.id}">Yönet</a></td></tr>`).join('')}</table></div>
<form class="card stack" method="post" action="/yonetim/fiyat">${f}<h2>Paket sayfasında görünen fiyatlar</h2><p class="muted">Boş bırakılırsa "Fiyat için bize ulaşın" yazar. Örnek: "1.490 TL / ay + KDV".</p>
<div class="grid3">${codes.map(([c, n]) => `<label>${esc(c)} · ${esc(n)}<input name="${esc(c)}" maxlength="60" value="${esc(prices[c] || '')}"></label>`).join('')}</div><div><button>Kaydet</button></div></form>`, '/yonetim'));
  });
  route('GET', '/yonetim/:id', async (ctx, res, p) => {
    needAdmin(ctx); const w = await one('SELECT * FROM workspaces WHERE id=$1', [int(p.id)]); if (!w) throw new HttpError(404, 'Bulunamadı.'); const b = w.billing || {};
    const users = await all('SELECT name, email, role, active, last_login FROM users WHERE workspace_id=$1 ORDER BY id', [w.id]);
    const iso = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    send(res, 200, layout(ctx, w.name, `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/yonetim">Yönetim</a></p><h1>${esc(w.name)}</h1></div></div>
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
    if (!w) throw new HttpError(404, 'Bulunamadı.'); await audit(ctx, 'admin.workspace', { id: w.id, status: b.status, plan: b.plan }); redirect(res, `/yonetim/${w.id}`);
  });
  route('POST', '/yonetim/fiyat', async (ctx, res) => {
    needAdmin(ctx);
    for (const c of [...Object.values(PLANS).map(p => p.code), ...Object.values(EXTRAS).map(e => e.code)]) {
      const v = clip(nn(ctx.body[c]), 60); if (v) await q(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['price.' + c, v]); else await q('DELETE FROM settings WHERE key=$1', ['price.' + c]);
    }
    await audit(ctx, 'admin.prices', {}); redirect(res, '/yonetim');
  });
}
