// Arvela OS ↔ Arvela Social köprüsü (0.32). Social servisi aynı Docker ağındadır; isteklerini SETUP_TOKEN'dan türetilen
// anahtarla imzalar (deploy.py aynı anahtarı Social'a SOCIAL_BRIDGE_KEY olarak verir). İçerik kayda yazılmaz.
import crypto from 'node:crypto';

export const bridgeKey = (setupToken) => setupToken ? crypto.createHmac('sha256', setupToken).update('arvela-social-bridge').digest('hex') : '';
export const MAIL_KINDS = ['onay', 'duzeltme', 'karar', 'hatirlatma', 'davet', 'genel'];
const PER_HOUR = 400;
export const PLAN_CODES = { solo: 'SAAS-01', business: 'SAAS-02', agency: 'SAAS-03' };
export const PLAN_NAMES = { solo: 'Solo', business: 'Business', agency: 'Agency' };

export async function migrateSocial({ q }) {
  await q('ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_ws_id INT');
  await q('CREATE UNIQUE INDEX IF NOT EXISTS clients_social_ws ON clients(agency_id, social_ws_id) WHERE social_ws_id IS NOT NULL');
}

const clip = (v, n) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
// Social'dan gelen hesap bilgisini doğrular. action: talep (paket istendi) | aktif (ödeme alındı) | askida
export function validAccount(b) {
  const ws = Number.parseInt(b?.workspace_id, 10); if (!Number.isInteger(ws) || ws < 1) return { error: 'Hesap numarası geçersiz.' };
  if (!['talep', 'aktif', 'askida'].includes(b.action)) return { error: 'İşlem geçersiz.' };
  const plan = PLAN_CODES[b.plan] ? b.plan : null; if (b.action !== 'askida' && !plan) return { error: 'Paket geçersiz.' };
  const bill = b.billing && typeof b.billing === 'object' ? b.billing : {};
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email || '')) ? String(b.email).trim().toLowerCase().slice(0, 200) : null;
  return { ws, action: b.action, plan, name: clip(bill.title || b.name, 160) || `Arvela Social #${ws}`, contact: clip(b.contact_name, 120), email: clip(bill.email, 200) || email, phone: clip(bill.phone || b.phone, 40),
    extraBrands: Math.max(0, Math.min(50, Number.parseInt(b.extra_brands, 10) || 0)), editor: b.editor_service === true,
    note: [bill.tax_office && `Vergi dairesi: ${clip(bill.tax_office, 80)}`, bill.tax_no && `Vergi/TC no: ${clip(bill.tax_no, 20)}`, bill.address && `Adres: ${clip(bill.address, 400)}`, bill.note && `Not: ${clip(bill.note, 600)}`].filter(Boolean).join('\n') };
}

export function validMail(b) {
  const to = String(b?.to || '').trim().toLowerCase();
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(to)) return { error: 'Alıcı geçersiz.' };
  const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const html = String(b.html || ''); if (!subject || !html) return { error: 'Konu ve içerik gerekli.' };
  if (html.length > 100_000) return { error: 'İçerik çok uzun.' };
  return { to, subject, html, kind: MAIL_KINDS.includes(b.kind) ? b.kind : 'genel' };
}

export function registerSocial({ route, one, all, q, HttpError, safeEqual, SETUP_TOKEN, sendMail, send }) {
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
  // Social → müşteri kaydı: paket isteği satış hattına "yeni" olarak düşer; etkinleştirmede aylık hizmetler (SAAS-0x) açılır, askıda durdurulur.
  route('POST', '/api/social/client', async (ctx, res) => {
    auth(ctx); const v = validAccount(ctx.body); if (v.error) throw new HttpError(400, v.error);
    const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']); if (!agency) throw new HttpError(503, 'Ajans bulunamadı.'); const a = agency.id;
    let c = await one('SELECT id, status FROM clients WHERE agency_id=$1 AND social_ws_id=$2', [a, v.ws]);
    const interest = v.plan ? `Arvela Social ${PLAN_NAMES[v.plan]} (${PLAN_CODES[v.plan]})` : null;
    if (!c) {
      if (v.action === 'askida') return json(res, 200, { ok: true, client_id: null });
      c = await one(`INSERT INTO clients (agency_id, name, sector, contact_name, phone, email, notes, status, stage, lead_source, interest, next_action, next_action_at, social_ws_id)
        VALUES ($1,$2,'Arvela Social',$3,$4,$5,$6,$7,$8,'web',$9,$10, now(), $11) RETURNING id, status`,
        [a, v.name, v.contact, v.phone, v.email, v.note || null, v.action === 'aktif' ? 'active' : 'lead', v.action === 'aktif' ? 'kazanildi' : 'yeni', interest, v.action === 'aktif' ? null : 'Arvela Social paket isteği: fatura ve havale bilgisini gönder', v.ws]);
    } else {
      await q(`UPDATE clients SET name=$1, contact_name=COALESCE($2, contact_name), phone=COALESCE($3, phone), email=COALESCE($4, email), notes=COALESCE($5, notes), interest=COALESCE($6, interest) WHERE id=$7`,
        [v.name, v.contact, v.phone, v.email, v.note || null, interest, c.id]);
      if (v.action === 'talep' && c.status === 'lead') await q(`UPDATE clients SET stage=CASE WHEN stage IN ('kaybedildi') THEN 'yeni' ELSE stage END, next_action=$1, next_action_at=now() WHERE id=$2`, ['Arvela Social paket isteği: fatura ve havale bilgisini gönder', c.id]);
    }
    if (v.action === 'aktif') {
      await q(`UPDATE clients SET status='active', stage='kazanildi', won_at=COALESCE(won_at, now()), next_action=NULL, next_action_at=NULL WHERE id=$1`, [c.id]);
      const want = { [PLAN_CODES[v.plan]]: 1, ...(v.extraBrands ? { 'SAAS-04': v.extraBrands } : {}), ...(v.editor ? { 'SAAS-06': 1 } : {}) };
      const svcs = await all(`SELECT id, code FROM services WHERE agency_id=$1 AND code LIKE 'SAAS-%'`, [a]); const byCode = Object.fromEntries(svcs.map(x => [x.code, x.id]));
      const cur = await all(`SELECT cs.id, s.code, cs.status FROM client_services cs JOIN services s ON s.id=cs.service_id WHERE cs.client_id=$1 AND s.code LIKE 'SAAS-%' AND s.code<>'SAAS-05'`, [c.id]);
      for (const r of cur) if (!want[r.code] && r.status !== 'durduruldu') await q(`UPDATE client_services SET status='durduruldu', end_date=CURRENT_DATE WHERE id=$1`, [r.id]);
      for (const [code, qty] of Object.entries(want)) {
        if (!byCode[code]) continue; const ex = cur.find(r => r.code === code);
        if (ex) await q(`UPDATE client_services SET status='aktif', qty=$1, end_date=NULL WHERE id=$2`, [qty, ex.id]);
        else await q(`INSERT INTO client_services (agency_id, client_id, service_id, status, start_date, qty, notes) VALUES ($1,$2,$3,'aktif',CURRENT_DATE,$4,'Arvela Social')`, [a, c.id, byCode[code], qty]);
      }
    }
    if (v.action === 'askida') {
      await q(`UPDATE client_services cs SET status='durduruldu', end_date=CURRENT_DATE FROM services s WHERE s.id=cs.service_id AND cs.client_id=$1 AND s.code LIKE 'SAAS-%' AND cs.status='aktif'`, [c.id]);
      await q(`UPDATE clients SET status='paused' WHERE id=$1 AND status='active'`, [c.id]);
    }
    json(res, 200, { ok: true, client_id: c.id });
  });
  route('GET', '/api/social/ping', async (ctx, res) => { auth(ctx); json(res, 200, { ok: true }); });
}
