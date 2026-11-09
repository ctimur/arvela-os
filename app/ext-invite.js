// Arvela OS — müşteri portalı daveti: yönetici şifre belirlemez; müşteri bağlantıdan kendi şifresini koyar.
// Bağlantı 7 gün geçerli, tek kullanımlık; veritabanında yalnız özeti (sha256) tutulur.
import crypto from 'node:crypto';
import { mailHtml } from './ext-decisions.js';

export const INVITE_DAYS = 7;
export const inviteHash = (tok) => crypto.createHash('sha256').update(String(tok)).digest('hex');

export async function migrateInvite({ q }) {
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_hash TEXT');
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires TIMESTAMPTZ');
}

export function registerInvite({ route, one, q, need, layout, authPage, h, csrfField, HttpError, int, nn, send, audit, sendMail, APP_URL, hashPassword, validPassword, token, startSession }) {
  const base = () => String(APP_URL || 'https://os.arveladigital.com').replace(/\/$/, '');

  // Yönetici: müşteri için portal daveti oluştur (yeni hesap ya da henüz giriş yapmamış hesaba yeniden davet)
  route('POST', '/musteriler/:id/davet', async (ctx, res, p) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const b = ctx.body;
    const c = await one('SELECT id, name, contact_name, phone, email, is_demo FROM clients WHERE id=$1 AND agency_id=$2', [int(p.id), a]);
    if (!c) throw new HttpError(404, 'Müşteri bulunamadı.');
    const email = String(b.email || '').trim().toLowerCase(); const name = nn(b.name);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Ad ve geçerli bir e-posta gerekli.');
    const tok = token(24); const hsh = inviteHash(tok);
    let u = await one('SELECT id, role, client_id, last_login FROM users WHERE lower(email)=$1', [email]);
    if (u && (u.role !== 'client' || u.client_id !== c.id)) throw new HttpError(400, 'Bu e-posta başka bir hesapta kayıtlı.');
    if (u) await q(`UPDATE users SET name=$1, invite_hash=$2, invite_expires=now() + interval '${INVITE_DAYS} days', active=true WHERE id=$3`, [name, hsh, u.id]);
    else u = await one(`INSERT INTO users (agency_id, email, name, role, client_id, pass_hash, invite_hash, invite_expires) VALUES ($1,$2,$3,'client',$4,$5,$6, now() + interval '${INVITE_DAYS} days') RETURNING id`,
      [a, email, name, c.id, hashPassword(token(24)), hsh]); // rastgele şifre: davet tamamlanana kadar girilemez
    const url = `${base()}/davet/${tok}`;
    let mailed = false;
    if (b.mail === '1' && !c.is_demo) {
      mailed = await sendMail(a, { to: email, subject: 'Arvela müşteri portalınız hazır', kind: 'davet',
        html: mailHtml(`Merhaba ${name},`, [`${c.name} için Arvela müşteri portalınız açıldı. Projelerinizin durumunu, onayınızı bekleyen işleri, tekliflerinizi ve faturalarınızı buradan takip edebilirsiniz.`,
          `Aşağıdaki bağlantıdan şifrenizi belirleyin. Bağlantı ${INVITE_DAYS} gün geçerlidir ve bir kez kullanılabilir.`], ['Şifremi belirle', url]) }).catch(() => false);
    }
    await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,$2,$3,$4)', [c.id, ctx.user.id, mailed ? 'eposta' : 'not', `Portal daveti oluşturuldu (${email})${mailed ? ' ve e-postayla gönderildi' : ''}.`]);
    await audit(ctx, 'user.invite', { id: u.id, client: c.id, mailed });
    const wa = c.phone ? `https://wa.me/${String(c.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Merhaba ${name}, Arvela müşteri portalınız hazır. Şifrenizi bu bağlantıdan belirleyebilirsiniz (${INVITE_DAYS} gün geçerli): ${url}`)}` : '';
    send(res, 200, layout(ctx, 'Portal daveti', `<nav class="crumb"><a href="/musteriler/${c.id}">${h(c.name)}</a></nav><div class="page-head"><div><h1>Portal daveti hazır</h1></div></div>
<section class="card stack"><p>${mailed ? `Davet e-postası <strong>${h(email)}</strong> adresine gönderildi.` : b.mail === '1' ? '<span class="err">E-posta gönderilemedi (n8n e-posta bağlantısını kontrol edin). Bağlantıyı aşağıdan kopyalayıp iletin.</span>' : 'Bağlantıyı kopyalayıp müşteriye iletin.'}</p>
<label>Davet bağlantısı (yalnız şimdi gösteriliyor, ${INVITE_DAYS} gün geçerli)<input readonly value="${h(url)}"></label>
<div class="row">${wa ? `<a class="btn gold" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp'tan gönder</a>` : ''}<a class="btn ghost" href="/musteriler/${c.id}">Müşteriye dön</a></div>
<p class="muted">Müşteri bağlantıyı açınca kendi şifresini belirler ve doğrudan portalına girer. Bağlantı kaybolursa aynı formdan yeniden davet oluşturun; eskisi geçersiz olur.</p></section>`, '/musteriler'));
  });

  const pending = (tok) => one(`SELECT u.id, u.name, u.email, c.name client FROM users u LEFT JOIN clients c ON c.id=u.client_id
    WHERE u.invite_hash=$1 AND u.invite_expires > now() AND u.active`, [inviteHash(tok)]);
  const form = (u, tok, err = '') => authPage('Şifrenizi belirleyin', `<h1>Hoş geldiniz${u.name ? ', ' + h(u.name) : ''}</h1>
<p class="muted">${h(u.client || 'Arvela')} müşteri portalı için şifrenizi belirleyin. Giriş e-postanız: <strong>${h(u.email)}</strong></p>${err ? `<div class="err">${h(err)}</div>` : ''}
<form class="stack" method="post" action="/davet/${h(tok)}"><label>Yeni şifre<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label>Yeni şifre (tekrar)<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label><button class="gold">Şifremi kaydet ve gir</button></form>`);
  const gone = () => authPage('Davet', '<h1>Bağlantı geçersiz</h1><p>Bu davet bağlantısının süresi dolmuş ya da zaten kullanılmış. Yeni bir davet için ajansınızla iletişime geçin.</p><a href="/giris">Giriş sayfası</a>');

  route('GET', '/davet/:token', async (ctx, res, p) => {
    const u = await pending(p.token); send(res, u ? 200 : 404, u ? form(u, p.token) : gone());
  });
  route('POST', '/davet/:token', async (ctx, res, p) => {
    const u = await pending(p.token); if (!u) return send(res, 404, gone());
    const pw = String(ctx.body.password || '');
    if (!validPassword(pw)) return send(res, 400, form(u, p.token, 'Şifre en az 10 karakter olmalı.'));
    if (pw !== String(ctx.body.password2 || '')) return send(res, 400, form(u, p.token, 'İki şifre aynı değil.'));
    const done = await one('UPDATE users SET pass_hash=$1, invite_hash=NULL, invite_expires=NULL WHERE id=$2 AND invite_hash=$3 RETURNING id', [hashPassword(pw), u.id, inviteHash(p.token)]);
    if (!done) return send(res, 404, gone());
    await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await audit({ user: { id: u.id, agency_id: (await one('SELECT agency_id FROM users WHERE id=$1', [u.id])).agency_id } }, 'user.invite_accept', { id: u.id });
    await startSession(res, u.id, '/');
  });
}
