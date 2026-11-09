// Arvela Social — kayıt, giriş, çıkış, ekip daveti kabulü.
import { route, send, redirect, startSession, endSession, audit } from './server.mjs';
import { one, q, withTx } from './db.mjs';
import { authPage } from './ui.mjs';
import { esc, nn, clip, hashPassword, checkPassword, validPassword, validEmail, clientIp, sha } from './lib.mjs';
import { TRIAL_DAYS } from './plans.mjs';

const hits = new Map();
const failCount = (k) => { const now = Date.now(); const l = (hits.get(k) || []).filter(t => now - t < 15 * 60e3); hits.set(k, l); return l.length; };
const failHit = (k) => { failCount(k); hits.get(k).push(Date.now()); };

const loginForm = (msg = '', email = '') => authPage('Giriş', `<h1>Giriş</h1>${msg}
<form class="stack" method="post" action="/giris"><label>E-posta<input type="email" name="email" required autocomplete="username" value="${esc(email)}"></label>
<label>Şifre<input type="password" name="password" required autocomplete="current-password"></label><button class="gold">Giriş yap</button></form>
<p class="muted">Hesabınız yok mu? <a href="/kayit">14 gün ücretsiz deneyin</a></p>`);
const signupForm = (msg = '', b = {}) => authPage('Ücretsiz dene', `<h1>14 gün ücretsiz deneyin</h1><p class="muted">Kart bilgisi istemiyoruz. Deneme süresinde Business paketinin tüm özellikleri açık.</p>${msg}
<form class="stack" method="post" action="/kayit"><label>Adınız soyadınız<input name="name" required maxlength="80" value="${esc(b.name || '')}" autocomplete="name"></label>
<label>İşletme ya da marka adı<input name="company" required maxlength="80" value="${esc(b.company || '')}" autocomplete="organization"></label>
<label>E-posta<input type="email" name="email" required value="${esc(b.email || '')}" autocomplete="email"></label>
<label>Şifre (en az 10 karakter)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label class="chk"><input type="checkbox" name="kvkk" value="1" required> <span><a href="/gizlilik" target="_blank">Aydınlatma metnini</a> okudum; hesabımın oluşturulmasını kabul ediyorum.</span></label>
<button class="gold">Hesabımı oluştur</button></form><p class="muted">Zaten hesabınız var mı? <a href="/giris">Giriş yapın</a></p>`);

export function register() {
  route('GET', '/giris', async (ctx, res) => ctx.user ? redirect(res, '/') : send(res, 200, loginForm()), { open: true });
  route('POST', '/giris', async (ctx, res) => {
    const ip = clientIp(ctx.req); const em = String(ctx.body.email || '').trim().toLowerCase().slice(0, 200);
    if (failCount('ip:' + ip) >= 20 || failCount('em:' + em) >= 8) return send(res, 429, loginForm('<div class="err">Çok fazla deneme. 15 dakika sonra tekrar deneyin.</div>', em));
    const u = await one('SELECT id, pass_hash FROM users WHERE lower(email)=$1 AND active', [em]);
    if (!u || !checkPassword(ctx.body.password || '', u.pass_hash)) { failHit('ip:' + ip); failHit('em:' + em); return send(res, 401, loginForm('<div class="err">E-posta ya da şifre hatalı.</div>', em)); }
    await startSession(res, u.id, '/');
  }, { open: true });
  route('POST', '/cikis', async (ctx, res) => endSession(ctx, res));

  route('GET', '/kayit', async (ctx, res) => ctx.user ? redirect(res, '/') : send(res, 200, signupForm()), { open: true });
  route('POST', '/kayit', async (ctx, res) => {
    const b = ctx.body; const ip = clientIp(ctx.req);
    if (failCount('signup:' + ip) >= 10) return send(res, 429, signupForm('<div class="err">Bu ağdan çok fazla kayıt denendi. Bir süre sonra tekrar deneyin.</div>', b));
    const email = String(b.email || '').trim().toLowerCase(); const name = clip(nn(b.name), 80); const company = clip(nn(b.company), 80);
    const err = !name || !company ? 'Ad ve işletme adı gerekli.' : !validEmail(email) ? 'Geçerli bir e-posta girin.' : !validPassword(b.password) ? 'Şifre en az 10 karakter olmalı.' : b.kvkk !== '1' ? 'Aydınlatma metnini onaylayın.' : '';
    if (err) return send(res, 400, signupForm(`<div class="err">${esc(err)}</div>`, b));
    if (await one('SELECT 1 FROM users WHERE lower(email)=$1', [email])) return send(res, 400, signupForm('<div class="err">Bu e-posta zaten kayıtlı. <a href="/giris">Giriş yapın</a>.</div>', b));
    failHit('signup:' + ip);
    const uid = await withTx(async (tq) => {
      const ws = (await tq(`INSERT INTO workspaces (name, status, trial_ends) VALUES ($1,'deneme', CURRENT_DATE + ${TRIAL_DAYS - 1}) RETURNING id`, [company])).rows[0];
      const u = (await tq(`INSERT INTO users (workspace_id, email, name, role, pass_hash) VALUES ($1,$2,$3,'owner',$4) RETURNING id`, [ws.id, email, name, hashPassword(b.password)])).rows[0];
      await tq('INSERT INTO brands (workspace_id, name) VALUES ($1,$2)', [ws.id, company]);
      await tq(`INSERT INTO audit (workspace_id, user_id, action, detail) VALUES ($1,$2,'workspace.create',$3)`, [ws.id, u.id, { company }]);
      return u.id;
    });
    await startSession(res, uid, '/baslangic');
  }, { open: true });

  // Ekip daveti: bağlantıyla şifre belirleme
  const pending = (tok) => one(`SELECT u.id, u.name, u.email, w.name ws FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE u.invite_hash=$1 AND u.invite_expires > now() AND u.active`, [sha(tok)]);
  const inviteForm = (u, tok, err = '') => authPage('Davet', `<h1>Hoş geldiniz, ${esc(u.name)}</h1><p class="muted">${esc(u.ws)} sizi Arvela Social'a davet etti. Giriş e-postanız: <strong>${esc(u.email)}</strong></p>${err ? `<div class="err">${esc(err)}</div>` : ''}
<form class="stack" method="post" action="/davet/${esc(tok)}"><label>Şifre (en az 10 karakter)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label>Şifre (tekrar)<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label><button class="gold">Şifremi kaydet ve gir</button></form>`);
  const gone = () => authPage('Davet', '<h1>Bağlantı geçersiz</h1><p>Davetin süresi dolmuş ya da kullanılmış. Ekibinizden yeni bir davet isteyin.</p><a class="btn ghost" href="/giris">Giriş</a>');
  route('GET', '/davet/:token', async (ctx, res, p) => { const u = await pending(p.token); send(res, u ? 200 : 404, u ? inviteForm(u, p.token) : gone()); }, { open: true });
  route('POST', '/davet/:token', async (ctx, res, p) => {
    const u = await pending(p.token); if (!u) return send(res, 404, gone());
    if (!validPassword(ctx.body.password)) return send(res, 400, inviteForm(u, p.token, 'Şifre en az 10 karakter olmalı.'));
    if (ctx.body.password !== ctx.body.password2) return send(res, 400, inviteForm(u, p.token, 'İki şifre aynı değil.'));
    await q('UPDATE users SET pass_hash=$1, invite_hash=NULL, invite_expires=NULL WHERE id=$2', [hashPassword(ctx.body.password), u.id]);
    await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await audit({ ws: { id: (await one('SELECT workspace_id FROM users WHERE id=$1', [u.id])).workspace_id }, user: { id: u.id } }, 'user.invite_accept', {});
    await startSession(res, u.id, '/');
  }, { open: true });

  route('GET', '/gizlilik', async (ctx, res) => send(res, 200, authPage('Aydınlatma metni', `<h1>Aydınlatma metni</h1>
<p>Arvela Social'ı Arvela Digital &amp; AI işletir. Hesabınız için adınızı, e-posta adresinizi ve işletme adınızı; hizmetin sunulması için marka bilgilerinizi, gönderi metinlerinizi ve yüklediğiniz görselleri işleriz.</p>
<p>Yapay zekâ özellikleri yalnız hesap sahibinin açık rızasıyla açılır. Açıldığında marka bilgileriniz ve gönderi içeriği metin üretimi için Anthropic PBC'ye (ABD), Agency paketinde görsel üretimi için OpenAI'ye (ABD) iletilir; e-posta adresleri ve telefon numaraları gönderilmeden gizlenir. Rıza, Yapay zekâ sayfasından her zaman geri çekilebilir.</p>
<p>Onay istekleri, düzeltmeler ve paylaşım hatırlatmaları için e-posta adresinize bildirim gönderilir; Hesabım sayfasından kapatabilirsiniz. Müşteri onay bağlantısıyla karar veren kişilerin yalnız yazdıkları ad ve not saklanır.</p>
<p>Verileriniz sunucularımızda tutulur ve her gece şifreli olarak yedeklenir.</p>
<p>Hesabınızı kapattığınızda verileriniz 30 gün içinde silinir. Haklarınız (KVKK m.11) için bize yazabilirsiniz.</p><p class="muted">Bu metin taslaktır; hukuki gözden geçirme sonrası güncellenecektir.</p><a class="btn ghost" href="/kayit">Geri</a>`)), { open: true });
}
