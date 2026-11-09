// Arvela Social — e-posta bildirimleri ve paylaşım hatırlatmaları. E-posta Arvela OS köprüsü üzerinden (n8n "E-posta gönderici") gider.
// SOCIAL_BRIDGE_KEY yoksa (yerel geliştirme) e-posta atlanır; uygulama içi akış etkilenmez.
import { route, send, redirect, audit } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf } from './ui.mjs';
import { esc, nn, clip, HttpError, fmtDateTime, hashPassword, checkPassword, validPassword } from './lib.mjs';
import { PLATFORMS } from './plans.mjs';

const BRIDGE = () => String(process.env.SOCIAL_BRIDGE_URL || 'http://app:3000').replace(/\/$/, '');
const KEY = () => process.env.SOCIAL_BRIDGE_KEY || '';
export const base = () => String(process.env.SOCIAL_URL || 'https://social.arveladigital.com').replace(/\/$/, '');
export const outbox = []; // test ve yerel geliştirme için son e-postalar (içerik değil, özet)

// Markalı, sade e-posta gövdesi. lines: düz metin satırları; link: [etiket, yol]
export function mailHtml(title, lines, link) {
  const p = lines.filter(Boolean).map(l => `<p style="margin:0 0 12px;font:15px/1.6 Arial,sans-serif;color:#141A22">${esc(l).replace(/\n/g, '<br>')}</p>`).join('');
  const btn = link ? `<p style="margin:20px 0"><a href="${esc(base() + link[1])}" style="background:#E2BE7A;color:#0B0D12;text-decoration:none;padding:12px 20px;border-radius:10px;font:600 15px Arial,sans-serif;display:inline-block">${esc(link[0])}</a></p>` : '';
  return `<div style="background:#F7F4EE;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #E8E1D3">
<p style="margin:0 0 18px;font:600 13px Arial,sans-serif;letter-spacing:2px;color:#B08433">ARVELA SOCIAL</p><h1 style="margin:0 0 14px;font:600 21px Arial,sans-serif;color:#0B0D12">${esc(title)}</h1>${p}${btn}
<p style="margin:22px 0 0;font:12px Arial,sans-serif;color:#6B6558">Bu e-postaları almak istemiyorsanız Arvela Social → Hesabım sayfasından kapatabilirsiniz.</p></div></div>`;
}

export async function sendMail(to, subject, html, kind = 'genel') {
  outbox.push({ to, subject, kind, at: Date.now() }); if (outbox.length > 50) outbox.shift();
  if (!KEY()) return false;
  try {
    const r = await fetch(BRIDGE() + '/api/social/mail', { method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY(), 'User-Agent': 'arvela-social/1.0' }, body: JSON.stringify({ to, subject, html, kind }) });
    return r.ok;
  } catch (e) { console.error('e-posta gönderilemedi:', e.message); return false; }
}

// Çalışma alanında belirli rollerdeki, e-postası açık kullanıcılar (işlemi yapan hariç)
export const recipients = (wsId, roles, exceptId = 0) => all(`SELECT id, email, name FROM users WHERE workspace_id=$1 AND active AND NOT mail_off AND role = ANY($2::text[]) AND id<>$3`, [wsId, roles, exceptId || 0]);
const label = (p) => p.title || String(p.caption || 'Başlıksız gönderi').slice(0, 60);
const when = (p) => p.scheduled_at ? fmtDateTime(p.scheduled_at) : 'tarihsiz';

// Durum değişikliğinden sonra ilgili kişilere e-posta. Hata uygulamayı durdurmaz.
export async function onStatus(ws, post, to, { actorId, actorName, comment, client } = {}) {
  try {
    const lim = ws.lim; let list = [], subject, title, lines;
    if (to === 'onay') {
      list = await recipients(ws.id, ['owner', 'approver'], actorId);
      subject = `Onayınız bekleniyor: ${label(post)}`; title = 'Bir gönderi onayınızı bekliyor';
      lines = [`${actorName || 'Ekip'} "${label(post)}" gönderisini onaya gönderdi.`, `Paylaşım zamanı: ${when(post)}`];
    } else if (to === 'duzeltme') {
      list = await recipients(ws.id, ['owner', 'editor'], actorId);
      subject = `Düzeltme istendi: ${label(post)}`; title = 'Bir gönderi için düzeltme istendi';
      lines = [`${actorName || 'Onaylayıcı'}${client ? ' (müşteri)' : ''} düzeltme istedi.`, comment ? `Not: ${comment}` : '', `Paylaşım zamanı: ${when(post)}`];
    } else if (to === 'onaylandi' && (client || lim?.approvals)) {
      list = await recipients(ws.id, ['owner', 'editor'], actorId);
      subject = `Onaylandı: ${label(post)}`; title = 'Gönderi onaylandı';
      lines = [`${actorName || 'Onaylayıcı'}${client ? ' (müşteri)' : ''} "${label(post)}" gönderisini onayladı.`, `Paylaşım zamanı: ${when(post)}. Zamanı gelince hatırlatacağız.`];
    } else return 0;
    for (const u of list) await sendMail(u.email, subject, mailHtml(title, lines, ['Gönderiyi aç', `/gonderi/${post.id}`]), to === 'onay' ? 'onay' : to === 'duzeltme' ? 'duzeltme' : 'karar');
    return list.length;
  } catch (e) { console.error('bildirim hatası:', e.message); return 0; }
}

// Paylaşım zamanı yaklaşan (30 dk) ve paylaşıma hazır gönderiler için hatırlatma. Her gönderi bir kez.
export async function remindDue(now = new Date()) {
  const due = await all(`SELECT p.*, b.name brand, w.id ws, w.plan, w.status ws_status FROM posts p JOIN brands b ON b.id=p.brand_id JOIN workspaces w ON w.id=p.workspace_id
    WHERE p.reminded_at IS NULL AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= $1::timestamptz + interval '30 minutes' AND p.scheduled_at > $1::timestamptz - interval '2 hours'
      AND (p.status='onaylandi' OR (p.status='taslak' AND w.plan='solo')) AND w.status<>'askida' ORDER BY p.scheduled_at LIMIT 200`, [now.toISOString()]);
  let n = 0;
  for (const p of due) {
    const upd = await one('UPDATE posts SET reminded_at=now() WHERE id=$1 AND reminded_at IS NULL RETURNING id', [p.id]); if (!upd) continue; // aynı anda iki çalışmaya karşı
    const list = await recipients(p.ws, ['owner', 'editor']);
    const plats = (p.platforms || []).map(k => PLATFORMS[k]?.name || k).join(', ') || 'platform seçilmedi';
    for (const u of list) { await sendMail(u.email, `Paylaşım zamanı: ${label(p)} (${p.brand})`, mailHtml('Paylaşım zamanı geldi', [`${p.brand} · ${label(p)}`, `Zaman: ${when(p)} · ${plats}`, 'Telefonunuzdan paylaşım sayfasını açın: görseli indirin, metni kopyalayın, paylaşın ve "Paylaştım" deyin.'], ['Paylaşım sayfasını aç', `/gonderi/${p.id}/paylas`]), 'hatirlatma'); n++; }
  }
  return n;
}

let timer = null;
export function startReminders(everyMs = 5 * 60_000) {
  if (timer) return; const tick = () => remindDue().catch(e => console.error('hatırlatma:', e.message));
  timer = setInterval(tick, everyMs); timer.unref?.(); setTimeout(tick, 30_000).unref?.();
}

export function register() {
  // ---------- Hesabım: ad, şifre, e-posta tercihi ----------
  route('GET', '/hesabim', async (ctx, res) => {
    const u = await one('SELECT name, email, mail_off FROM users WHERE id=$1', [ctx.user.id]); const f = csrf(ctx); const ok = ctx.url.searchParams.get('ok');
    send(res, 200, layout(ctx, 'Hesabım', `<div class="page-head"><div><h1>Hesabım</h1><p>${esc(u.email)}</p></div></div>${ok ? '<div class="flash">Kaydedildi.</div>' : ''}
<div class="grid2" style="align-items:start"><form class="card stack" method="post" action="/hesabim">${f}<h2>Bilgiler ve bildirimler</h2><label>Adınız<input name="name" maxlength="80" required value="${esc(u.name)}"></label>
<label class="chk"><input type="checkbox" name="mail" value="1"${u.mail_off ? '' : ' checked'}> Onay istekleri, düzeltmeler ve paylaşım hatırlatmaları e-postayla gelsin</label><div><button class="gold">Kaydet</button></div></form>
<form class="card stack" method="post" action="/hesabim/sifre">${f}<h2>Şifre değiştir</h2><label>Şu anki şifre<input type="password" name="current" required autocomplete="current-password"></label>
<label>Yeni şifre (en az 10 karakter)<input type="password" name="password" minlength="10" required autocomplete="new-password"></label><div><button class="ghost">Şifreyi değiştir</button></div></form></div>`, '/hesabim'));
  });
  route('POST', '/hesabim', async (ctx, res) => {
    const name = clip(nn(ctx.body.name), 80); if (!name) throw new HttpError(400, 'Ad gerekli.');
    await q('UPDATE users SET name=$1, mail_off=$2 WHERE id=$3', [name, ctx.body.mail !== '1', ctx.user.id]); redirect(res, '/hesabim?ok=1');
  });
  route('POST', '/hesabim/sifre', async (ctx, res) => {
    const u = await one('SELECT pass_hash FROM users WHERE id=$1', [ctx.user.id]);
    if (!checkPassword(String(ctx.body.current || ''), u.pass_hash)) throw new HttpError(400, 'Şu anki şifre hatalı.');
    if (!validPassword(ctx.body.password)) throw new HttpError(400, 'Yeni şifre en az 10 karakter olmalı.');
    await q('UPDATE users SET pass_hash=$1 WHERE id=$2', [hashPassword(ctx.body.password), ctx.user.id]);
    await q('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [ctx.user.id, ctx.session.id]); // diğer cihazlardan çıkış
    await audit(ctx, 'user.password'); redirect(res, '/hesabim?ok=1');
  });
}
