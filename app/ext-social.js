// Arvela OS ↔ Arvela Social köprüsü (0.32). Social servisi aynı Docker ağındadır; isteklerini SETUP_TOKEN'dan türetilen
// anahtarla imzalar (deploy.py aynı anahtarı Social'a SOCIAL_BRIDGE_KEY olarak verir). İçerik kayda yazılmaz.
import crypto from 'node:crypto';

export const bridgeKey = (setupToken) => setupToken ? crypto.createHmac('sha256', setupToken).update('arvela-social-bridge').digest('hex') : '';
export const MAIL_KINDS = ['onay', 'duzeltme', 'karar', 'hatirlatma', 'davet', 'genel'];
const PER_HOUR = 400;

export function validMail(b) {
  const to = String(b?.to || '').trim().toLowerCase();
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(to)) return { error: 'Alıcı geçersiz.' };
  const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const html = String(b.html || ''); if (!subject || !html) return { error: 'Konu ve içerik gerekli.' };
  if (html.length > 100_000) return { error: 'İçerik çok uzun.' };
  return { to, subject, html, kind: MAIL_KINDS.includes(b.kind) ? b.kind : 'genel' };
}

export function registerSocial({ route, one, HttpError, safeEqual, SETUP_TOKEN, sendMail, send }) {
  const key = bridgeKey(SETUP_TOKEN); const sent = [];
  const json = (res, st, o) => send(res, st, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8' });
  const auth = (ctx) => { const a = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!key || !safeEqual(a, key)) throw new HttpError(403, 'Yetkisiz.'); };

  // Social → işlem e-postası (onay isteği, düzeltme, hatırlatma). n8n "E-posta gönderici" akışı üzerinden.
  route('POST', '/api/social/mail', async (ctx, res) => {
    auth(ctx);
    const now = Date.now(); while (sent.length && sent[0] < now - 3600e3) sent.shift();
    if (sent.length >= PER_HOUR) throw new HttpError(429, 'Saatlik e-posta sınırı doldu.');
    const m = validMail(ctx.body); if (m.error) throw new HttpError(400, m.error);
    const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']); if (!agency) throw new HttpError(503, 'Ajans bulunamadı.');
    const ok = await sendMail(agency.id, { to: m.to, subject: m.subject, html: m.html, kind: `social-${m.kind}` }).catch(() => false);
    sent.push(now); json(res, ok ? 200 : 502, { ok });
  });
  route('GET', '/api/social/ping', async (ctx, res) => { auth(ctx); json(res, 200, { ok: true }); });
}
