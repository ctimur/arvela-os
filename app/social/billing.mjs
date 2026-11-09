// Arvela Social — paket: durum, paket seçimi ve fatura bilgileri (havale/fatura). Etkinleştirme Arvela ekibinden.
import { route, send, redirect, audit, need } from './server.mjs';
import { one, q } from './db.mjs';
import { layout, csrf, badge } from './ui.mjs';
import { esc, nn, clip, HttpError, fmtDate } from './lib.mjs';
import { PLANS, EXTRAS, WS_ST, PRICE_DEFAULTS } from './plans.mjs';
import { syncAccount, sendMail, mailHtml } from './notify.mjs';
import { ADMINS } from './server.mjs';

export const priceOf = async (code) => { const r = await one('SELECT value FROM settings WHERE key=$1', ['price.' + code]); return r?.value || PRICE_DEFAULTS[code] || null; };
const FEAT = (p) => [`${p.brands} marka`, `${p.users} kullanıcı`, `${p.accounts} sosyal hesap`, `Ayda ${p.postsPerMonth} gönderi`, p.approvals ? 'Ekip içi onay' : null, p.clientLinks ? 'Müşteri onay bağlantısı' : null, p.aiImages ? 'Yapay zekâ görseli' : null, 'Marka şablonlarıyla görsel', 'Yapay zekâ metin ve takvim'].filter(Boolean);

export function register() {
  route('GET', '/paket', async (ctx, res) => {
    need(ctx, 'owner'); const ws = ctx.ws; const f = csrf(ctx); const bill = ws.billing || {};
    const prices = Object.fromEntries(await Promise.all(Object.values(PLANS).map(async p => [p.code, await priceOf(p.code)])));
    const status = `${badge(WS_ST[ws.status], ws.status === 'aktif' ? 'ok' : ws.status === 'askida' ? 'bad' : 'warn')} ${ws.plan ? 'Paket: <strong>' + esc(PLANS[ws.plan].name) + '</strong>' : 'Deneme (Business özellikleri)'}
${ws.status === 'deneme' ? ` · deneme ${fmtDate(ws.trial_ends)} tarihinde biter` : ''}${ws.paid_until ? ` · ${fmtDate(ws.paid_until)} tarihine kadar ödendi` : ''}${ws.requested_plan ? ` · istek: ${esc(PLANS[ws.requested_plan]?.name || '')}` : ''}`;
    send(res, 200, layout(ctx, 'Paket', `<div class="page-head"><div><h1>Paket</h1><p>${status}</p></div></div>
${ws.status === 'odeme' ? `<div class="note">Paket isteğiniz alındı. Arvela ekibi fatura ve havale bilgilerini e-postayla gönderecek; ödeme ulaşınca hesabınız etkinleşir. Bu sürede hesabınız ${ws.trial_ends && new Date(ws.trial_ends) >= new Date() ? 'deneme süresi boyunca açık kalır' : 'salt okunur'}.</div>` : ''}
<div class="grid3">${Object.entries(PLANS).map(([k, p]) => `<form class="card" method="post" action="/paket">${f}<input type="hidden" name="plan" value="${k}">
<div class="row" style="justify-content:space-between;align-items:center"><h2>${esc(p.name)}</h2>${ws.plan === k ? badge('Mevcut', 'ok') : ''}</div>
<p style="margin:0;font-family:Poppins,sans-serif;font-size:22px">${prices[p.code] ? esc(prices[p.code]) : '<span class="muted" style="font-size:15px;font-family:Inter">Fiyat için bize ulaşın</span>'}</p>
<ul style="margin:0;padding-left:18px">${FEAT(p).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${ws.plan !== k ? `<button class="${k === 'business' ? 'gold' : ''}">Bu paketi seç</button>` : ''}</form>`).join('')}</div>
<section class="card"><h2>Eklentiler</h2><ul style="margin:0;padding-left:18px">${Object.values(EXTRAS).map(e => `<li>${esc(e.name)}</li>`).join('')}</ul><p class="muted">Eklenti ve kurulum hizmeti için paket isteğinizin notuna yazın.</p></section>
<form class="card stack" method="post" action="/paket/fatura">${f}<h2>Fatura bilgileri</h2><div class="row"><label>Unvan / ad soyad<input name="title" required maxlength="160" value="${esc(bill.title || '')}"></label><label>Vergi dairesi<input name="tax_office" maxlength="80" value="${esc(bill.tax_office || '')}"></label><label>Vergi no / TCKN<input name="tax_no" maxlength="20" value="${esc(bill.tax_no || '')}"></label></div>
<label>Adres<textarea name="address" rows="2" maxlength="400">${esc(bill.address || '')}</textarea></label><div class="row"><label>Fatura e-postası<input type="email" name="email" maxlength="160" value="${esc(bill.email || ctx.user.email)}"></label><label>Telefon<input name="phone" maxlength="30" value="${esc(bill.phone || '')}"></label></div>
<label>Not (eklenti, kurulum isteği)<textarea name="note" rows="2" maxlength="600">${esc(bill.note || '')}</textarea></label><div><button>Kaydet</button></div></form>`, '/paket'));
  });
  route('POST', '/paket', async (ctx, res) => {
    need(ctx, 'owner'); const k = ctx.body.plan; if (!PLANS[k]) throw new HttpError(400, 'Paket geçersiz.');
    if (!ctx.ws.billing?.title) throw new HttpError(400, 'Önce aşağıdaki fatura bilgilerini doldurun.');
    await q(`UPDATE workspaces SET requested_plan=$1, status=CASE WHEN status='aktif' THEN status ELSE 'odeme' END WHERE id=$2`, [k, ctx.ws.id]);
    await audit(ctx, 'plan.request', { plan: k });
    const ws = await one('SELECT * FROM workspaces WHERE id=$1', [ctx.ws.id]); await syncAccount(ws, 'talep', ctx.user);
    for (const to of ADMINS) sendMail(to, `Arvela Social paket isteği: ${ws.name} · ${PLANS[k].name}`, mailHtml('Yeni paket isteği', [`${ws.name} (${ctx.user.name}, ${ctx.user.email}) ${PLANS[k].name} paketini istedi.`, 'Arvela OS satış hattına "yeni" olarak düştü. Fatura ve havale bilgisini gönderin; ödeme gelince Yönetim sayfasından etkinleştirin.'], ['Yönetimde aç', `/yonetim/${ws.id}`]), 'genel').catch(() => {});
    redirect(res, '/paket');
  });
  route('POST', '/paket/fatura', async (ctx, res) => {
    need(ctx, 'owner'); const b = ctx.body; if (!nn(b.title)) throw new HttpError(400, 'Unvan gerekli.');
    const bill = Object.fromEntries(['title', 'tax_office', 'tax_no', 'address', 'email', 'phone', 'note'].map(k => [k, clip(nn(b[k]), 600)]));
    await q('UPDATE workspaces SET billing=$1 WHERE id=$2', [JSON.stringify(bill), ctx.ws.id]); await audit(ctx, 'billing.update', {}); redirect(res, '/paket');
  });
}
