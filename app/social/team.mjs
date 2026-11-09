// Arvela Social — ekip: davet bağlantısı, rol, erişim. Kullanıcı sayısı paket sınırına bağlı.
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, opts, badge } from './ui.mjs';
import { esc, nn, int, clip, HttpError, token, sha, validEmail, hashPassword, fmtDate } from './lib.mjs';
import { ROLES } from './plans.mjs';

const ROLE_HELP = { owner: 'Her şey: marka, ekip, paket', editor: 'Gönderi ve marka hazırlar, onaya gönderir', approver: 'Gönderileri okur, onaylar ya da düzeltme ister' };
const shown = new Map(); // davet bağlantısı yalnız bir kez gösterilir (adres çubuğuna yazılmaz)
const base = () => String(process.env.SOCIAL_URL || 'https://social.arveladigital.com').replace(/\/$/, '');

export function register() {
  route('GET', '/ekip', async (ctx, res) => {
    need(ctx, 'owner'); const rows = await all('SELECT * FROM users WHERE workspace_id=$1 ORDER BY id', [ctx.ws.id]); const f = csrf(ctx);
    const active = rows.filter(u => u.active).length; const k = ctx.url.searchParams.get('davet'); const slot = k && shown.get(k); if (k) shown.delete(k);
    const fresh = slot && slot.user === ctx.user.id && Date.now() - slot.at < 300e3 ? slot.tok : null;
    send(res, 200, layout(ctx, 'Ekip', `<div class="page-head"><div><h1>Ekip</h1><p>${active} / ${ctx.lim.users} kullanıcı</p></div></div>
${fresh ? `<section class="card"><h2>Davet bağlantısı hazır</h2><p class="muted">Bağlantı 7 gün geçerli ve tek kullanımlık. Kopyalayıp e-posta ya da WhatsApp'tan iletin.</p><input id="inv" readonly value="${esc(base() + '/davet/' + fresh)}"><div><button class="gold" data-copy="#inv">Bağlantıyı kopyala</button></div></section>` : ''}
<div class="tbl"><table><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th></th></tr>${rows.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
<td>${u.id === ctx.user.id ? esc(ROLES[u.role]) : `<form class="row" method="post" action="/ekip/${u.id}/rol">${f}<select name="role" data-autosubmit aria-label="Rol">${opts(ROLES, u.role)}</select></form>`}</td>
<td>${!u.active ? badge('Kapalı') : u.invite_hash ? badge('Davet bekliyor', 'warn') : `<span class="muted">Son giriş ${fmtDate(u.last_login)}</span>`}</td>
<td>${u.id === ctx.user.id ? '<span class="muted">Siz</span>' : `<form method="post" action="/ekip/${u.id}/erisim">${f}<button class="ghost">${u.active ? 'Erişimi kapat' : 'Erişimi aç'}</button></form>`}</td></tr>`).join('')}</table></div>
${active < ctx.lim.users ? `<form class="card row" method="post" action="/ekip">${f}<label>Ad soyad<input name="name" required maxlength="80"></label><label>E-posta<input type="email" name="email" required></label>
<label>Rol<select name="role">${opts({ editor: ROLES.editor, approver: ROLES.approver, owner: ROLES.owner }, 'editor')}</select></label><button class="gold">Davet bağlantısı oluştur</button></form>
<p class="muted">${Object.entries(ROLE_HELP).map(([k, v]) => `<strong>${ROLES[k]}:</strong> ${v}`).join(' · ')}</p>` : `<div class="note">Paketinizdeki kullanıcı sınırına ulaştınız. <a href="/paket">Paketi yükseltin</a>.</div>`}`, '/ekip'));
  });
  route('POST', '/ekip', async (ctx, res) => {
    need(ctx, 'owner'); needUsable(ctx); const b = ctx.body; const email = String(b.email || '').trim().toLowerCase();
    if (!nn(b.name) || !validEmail(email)) throw new HttpError(400, 'Ad ve geçerli e-posta gerekli.');
    const n = (await one('SELECT count(*)::int n FROM users WHERE workspace_id=$1 AND active', [ctx.ws.id])).n;
    if (n >= ctx.lim.users) throw new HttpError(402, `Paketiniz ${ctx.lim.users} kullanıcı içeriyor.`);
    const ex = await one('SELECT id, workspace_id, last_login FROM users WHERE lower(email)=$1', [email]);
    if (ex && (ex.workspace_id !== ctx.ws.id || ex.last_login)) throw new HttpError(400, 'Bu e-posta başka bir hesapta kayıtlı ya da zaten ekipte.');
    const tok = token(24); const role = ROLES[b.role] ? b.role : 'editor';
    if (ex) await q(`UPDATE users SET name=$1, role=$2, invite_hash=$3, invite_expires=now() + interval '7 days', active=true WHERE id=$4`, [clip(nn(b.name), 80), role, sha(tok), ex.id]);
    else await q(`INSERT INTO users (workspace_id, email, name, role, pass_hash, invite_hash, invite_expires) VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days')`, [ctx.ws.id, email, clip(nn(b.name), 80), role, hashPassword(token(24)), sha(tok)]);
    await audit(ctx, 'user.invite', { email, role }); const key = token(9); shown.set(key, { tok, user: ctx.user.id, at: Date.now() }); redirect(res, `/ekip?davet=${key}`);
  });
  route('POST', '/ekip/:id/rol', async (ctx, res, p) => {
    need(ctx, 'owner'); const u = await one('SELECT id FROM users WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]);
    if (!u || u.id === ctx.user.id || !ROLES[ctx.body.role]) throw new HttpError(400, 'Rol değiştirilemedi.');
    await q('UPDATE users SET role=$1 WHERE id=$2', [ctx.body.role, u.id]); await audit(ctx, 'user.role', { id: u.id, role: ctx.body.role }); redirect(res, '/ekip');
  });
  route('POST', '/ekip/:id/erisim', async (ctx, res, p) => {
    need(ctx, 'owner'); const u = await one('SELECT id, active FROM users WHERE id=$1 AND workspace_id=$2', [int(p.id), ctx.ws.id]);
    if (!u || u.id === ctx.user.id) throw new HttpError(400, 'İşlem yapılamadı.');
    if (!u.active) { const n = (await one('SELECT count(*)::int n FROM users WHERE workspace_id=$1 AND active', [ctx.ws.id])).n; if (n >= ctx.lim.users) throw new HttpError(402, 'Kullanıcı sınırı dolu.'); }
    await q('UPDATE users SET active=NOT active WHERE id=$1', [u.id]); if (u.active) await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await audit(ctx, 'user.access', { id: u.id, active: !u.active }); redirect(res, '/ekip');
  });
}
