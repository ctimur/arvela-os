// Arvela OS — 15 dakikalık tanışma görüşmesi (arveladigital.com). Uygunluk ayarları Ayarlar › Randevu'dan düzenlenir.
// Site, aynı Docker ağından imzalı anahtarla (SETUP_TOKEN'dan türetilir) uygun saatleri okur ve randevu oluşturur;
// randevu Satış hattına "yeni" müşteri olarak düşer, ziyaretçinin cevapları ve gezdiği bölümler not olarak eklenir.
import crypto from 'node:crypto';

export const webKey = (setupToken) => setupToken ? crypto.createHmac('sha256', setupToken).update('arvela-web-bridge').digest('hex') : '';
export const DEFAULT_CFG = { days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00', minutes: 15, buffer: 5, leadHours: 3, horizonDays: 21, perDay: 16,
  breaks: [], closed: [], meetUrl: '', title: 'Arvela ile 15 dakika', notify: true };
const TZ = 3 * 3600e3; // İstanbul, yaz saati yok
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const localDate = (d) => new Date(new Date(d).getTime() + TZ).toISOString().slice(0, 10);
export const toUtc = (date, time) => new Date(`${date}T${time}:00+03:00`);

// Ayarları doğrular; hatalı alanlar varsayılana döner
export function normalizeCfg(raw = {}) {
  const c = { ...DEFAULT_CFG };
  if (Array.isArray(raw.days)) c.days = [...new Set(raw.days.map(Number).filter(d => d >= 0 && d <= 6))].sort();
  if (HM.test(raw.start || '')) c.start = raw.start; if (HM.test(raw.end || '')) c.end = raw.end; if (mins(c.end) <= mins(c.start)) { c.start = DEFAULT_CFG.start; c.end = DEFAULT_CFG.end; }
  const n = (v, lo, hi, d) => { const x = Number.parseInt(v, 10); return Number.isInteger(x) && x >= lo && x <= hi ? x : d; };
  c.minutes = n(raw.minutes, 10, 120, c.minutes); c.buffer = n(raw.buffer, 0, 60, c.buffer); c.leadHours = n(raw.leadHours, 0, 168, c.leadHours);
  c.horizonDays = n(raw.horizonDays, 1, 90, c.horizonDays); c.perDay = n(raw.perDay, 1, 60, c.perDay);
  c.breaks = (Array.isArray(raw.breaks) ? raw.breaks : []).filter(b => b && HM.test(b.start) && HM.test(b.end) && mins(b.end) > mins(b.start)).slice(0, 5);
  c.closed = [...new Set((Array.isArray(raw.closed) ? raw.closed : []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 200);
  c.meetUrl = /^https:\/\/[^\s"<>]{4,300}$/.test(raw.meetUrl || '') ? raw.meetUrl : '';
  c.title = String(raw.title || c.title).replace(/[\r\n<>]/g, ' ').slice(0, 80) || DEFAULT_CFG.title; c.notify = raw.notify !== false;
  return c;
}

// Saf hesap (testli): verilen günler için boş saatler. booked: [{starts_at, ends_at}] (onaylı randevular)
export function freeSlots(cfg, booked, now = new Date(), fromDate = localDate(now), days = cfg.horizonDays) {
  const out = []; const earliest = now.getTime() + cfg.leadHours * 3600e3; const last = new Date(`${localDate(now)}T00:00:00Z`).getTime() + cfg.horizonDays * 864e5;
  const busy = booked.map(b => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  for (let i = 0; i < days; i++) {
    const day = new Date(new Date(`${fromDate}T00:00:00Z`).getTime() + i * 864e5); const date = day.toISOString().slice(0, 10);
    if (day.getTime() > last) break; if (!cfg.days.includes(day.getUTCDay()) || cfg.closed.includes(date)) continue;
    const taken = busy.filter(([s]) => localDate(s) === date).length; if (taken >= cfg.perDay) { out.push({ date, slots: [] }); continue; }
    const slots = [];
    for (let m = mins(cfg.start); m + cfg.minutes <= mins(cfg.end); m += cfg.minutes + cfg.buffer) {
      const s = toUtc(date, hm(m)).getTime(); const e = s + cfg.minutes * 60e3;
      if (s < earliest) continue;
      if (cfg.breaks.some(b => m < mins(b.end) && m + cfg.minutes > mins(b.start))) continue;
      if (busy.some(([bs, be]) => s < be + cfg.buffer * 60e3 && e + cfg.buffer * 60e3 > bs)) continue;
      slots.push(hm(m));
    }
    out.push({ date, slots });
  }
  return out;
}

const clip = (v, n) => (v == null || String(v).trim() === '' ? null : String(v).trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, n));
export function validBooking(b) {
  const name = clip(b?.name, 120); const email = String(b?.email || '').trim().toLowerCase();
  if (!name) return { error: 'Adınızı yazın.' };
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(email)) return { error: 'Geçerli bir e-posta adresi yazın.' };
  if (b?.kvkk !== true) return { error: 'Aydınlatma metnini onaylayın.' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b?.date || '') ? b.date : null; const time = HM.test(b?.time || '') ? b.time : null;
  if (!date || !time) return { error: 'Bir saat seçin.' };
  const answers = b?.answers && typeof b.answers === 'object' && !Array.isArray(b.answers) ? Object.fromEntries(Object.entries(b.answers).slice(0, 12).map(([k, v]) => [clip(k, 40), clip(Array.isArray(v) ? v.join(', ') : v, 300)]).filter(([k, v]) => k && v)) : {};
  const pages = (Array.isArray(b?.pages) ? b.pages : []).map(p => clip(p, 80)).filter(Boolean).slice(0, 30);
  return { name, email, phone: clip(b.phone, 40), company: clip(b.company, 160), website: clip(b.website, 200), note: clip(b.note, 1000), date, time, answers, pages,
    lang: b.lang === 'en' ? 'en' : 'tr', iys: b.iys === true, source: clip(b.source, 120) };
}

export async function migrateBooking({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, company TEXT, website TEXT, note TEXT, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'onayli' CHECK (status IN ('onayli','iptal','tamamlandi','gelmedi')), answers JSONB NOT NULL DEFAULT '{}', pages TEXT[] NOT NULL DEFAULT '{}',
    lang TEXT NOT NULL DEFAULT 'tr', iys BOOLEAN NOT NULL DEFAULT false, source TEXT, cancel_hash TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(agency_id, starts_at) WHERE status='onayli'`);
  await q(`CREATE TABLE IF NOT EXISTS web_leads (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    email TEXT NOT NULL, name TEXT, answers JSONB NOT NULL DEFAULT '{}', pages TEXT[] NOT NULL DEFAULT '{}', lang TEXT, iys BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

const ANSWER_LABELS = { sektor: 'Sektör', sorun: 'Öncelikli sorun', hedef: 'Hedef', zaman: 'Zamanlama', butce: 'Bütçe', cozum: 'Önerilen çözüm' };
const answerText = (a) => Object.entries(a || {}).map(([k, v]) => `${ANSWER_LABELS[k] || k}: ${v}`).join('\n');
const gcalLink = (title, s, e, details) => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${s.toISOString().replace(/[-:]|\.\d{3}/g, '')}/${e.toISOString().replace(/[-:]|\.\d{3}/g, '')}&details=${encodeURIComponent(details)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function mailBody(lines, link) {
  return `<div style="background:#F7F4EE;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #E8E1D3;font:15px/1.6 Arial,sans-serif;color:#141A22">
<p style="margin:0 0 16px;font-weight:600;letter-spacing:2px;color:#B08433">ARVELA</p>${lines.filter(Boolean).map(l => `<p style="margin:0 0 12px">${esc(l).replace(/\n/g, '<br>')}</p>`).join('')}
${link ? `<p style="margin:20px 0"><a href="${esc(link[1])}" style="background:#E2BE7A;color:#0B0D12;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(link[0])}</a></p>` : ''}</div></div>`;
}

export function registerBooking({ route, one, all, q, HttpError, safeEqual, SETUP_TOKEN, send, sendMail, need, layout, h, csrfField, redirect, audit }) {
  const key = webKey(SETUP_TOKEN);
  const json = (res, st, o) => send(res, st, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  const auth = (ctx) => { const a = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!key || !safeEqual(a, key)) throw new HttpError(403, 'Yetkisiz.'); };
  const agencyId = async () => (await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']))?.id;
  const cfgOf = async (a) => { const r = await one(`SELECT value FROM settings WHERE agency_id=$1 AND key='booking.cfg'`, [a]); let raw = {}; try { raw = JSON.parse(r?.value || '{}'); } catch { /* varsayılan */ } return normalizeCfg(raw); };
  const booked = (a, from, to) => all(`SELECT starts_at, ends_at FROM bookings WHERE agency_id=$1 AND status='onayli' AND starts_at >= $2 AND starts_at < $3`, [a, from, to]);
  const admins = (a) => all(`SELECT id, email FROM users WHERE agency_id=$1 AND active AND role='admin'`, [a]);
  const hits = []; const limit = (n) => { const now = Date.now(); while (hits.length && hits[0] < now - 3600e3) hits.shift(); if (hits.length >= n) throw new HttpError(429, 'Çok fazla istek; biraz sonra tekrar deneyin.'); hits.push(now); };

  // Site, uygun saatleri okur
  route('GET', '/api/web/musait', async (ctx, res) => {
    auth(ctx); const a = await agencyId(); if (!a) throw new HttpError(503, 'Ajans bulunamadı.'); const cfg = await cfgOf(a); const now = new Date();
    const days = freeSlots(cfg, await booked(a, now.toISOString(), new Date(now.getTime() + (cfg.horizonDays + 1) * 864e5).toISOString()), now);
    json(res, 200, { minutes: cfg.minutes, title: cfg.title, days: days.filter(d => d.slots.length) });
  });

  // Site, randevu oluşturur → müşteri (satış hattında yeni) + randevu + bildirim + e-postalar
  route('POST', '/api/web/randevu', async (ctx, res) => {
    auth(ctx); limit(60); const v = validBooking(ctx.body); if (v.error) throw new HttpError(400, v.error);
    const a = await agencyId(); const cfg = await cfgOf(a); const start = toUtc(v.date, v.time); const end = new Date(start.getTime() + cfg.minutes * 60e3);
    const free = freeSlots(cfg, await booked(a, new Date(start.getTime() - 864e5).toISOString(), new Date(start.getTime() + 864e5).toISOString()), new Date(), v.date, 1);
    if (!free[0]?.slots.includes(v.time)) throw new HttpError(409, v.lang === 'en' ? 'This time is no longer available. Please pick another.' : 'Bu saat artık dolu. Lütfen başka bir saat seçin.');
    const notes = ['Kaynak: arveladigital.com 15 dk görüşme', answerText(v.answers), v.pages.length ? `Gezdiği bölümler: ${v.pages.join(', ')}` : '', v.website ? `Web sitesi: ${v.website}` : '', v.note ? `Not: ${v.note}` : '', `İletişim izni (İYS): ${v.iys ? 'var' : 'yok'}`].filter(Boolean).join('\n');
    let c = await one(`SELECT id FROM clients WHERE agency_id=$1 AND lower(email)=$2 ORDER BY id DESC LIMIT 1`, [a, v.email]);
    const interest = v.answers.cozum || v.answers.sorun || null; const when = `${v.date} ${v.time}`;
    if (!c) c = await one(`INSERT INTO clients (agency_id, name, sector, contact_name, phone, email, notes, status, stage, lead_source, interest, next_action, next_action_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'lead','yeni','web',$8,$9,$10) RETURNING id`, [a, v.company || v.name, clip(v.answers.sektor, 80), v.name, v.phone, v.email, notes, interest, `15 dk görüşme: ${when}`, start.toISOString()]);
    else await q(`UPDATE clients SET next_action=$1, next_action_at=$2, interest=COALESCE($3, interest), notes=concat_ws(E'\\n\\n', notes, $4::text) WHERE id=$5`, [`15 dk görüşme: ${when}`, start.toISOString(), interest, notes, c.id]);
    const tok = crypto.randomBytes(18).toString('base64url');
    let b; try {
      b = await one(`INSERT INTO bookings (agency_id, client_id, name, email, phone, company, website, note, starts_at, ends_at, answers, pages, lang, iys, source, cancel_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, [a, c.id, v.name, v.email, v.phone, v.company, v.website, v.note, start.toISOString(), end.toISOString(), JSON.stringify(v.answers), v.pages, v.lang, v.iys, v.source,
        crypto.createHash('sha256').update(tok).digest('hex')]);
    } catch (e) { if (String(e.message).includes('bookings_slot') || e.code === '23505') throw new HttpError(409, v.lang === 'en' ? 'This time was just taken. Please pick another.' : 'Bu saat az önce doldu. Lütfen başka bir saat seçin.'); throw e; }
    for (const u of await admins(a)) await q(`INSERT INTO notifications (agency_id, user_id, kind, title, body, href, ref) VALUES ($1,$2,'satis',$3,$4,$5,$6)`, [a, u.id, `Yeni 15 dk görüşme: ${v.name}`, `${when} · ${interest || 'ihtiyaç belirtilmedi'}`, `/musteriler/${c.id}`, `booking:${b.id}`]).catch(() => {});
    const site = String(process.env.WEB_URL || 'https://arveladigital.com').replace(/\/$/, '');
    const en = v.lang === 'en'; const dayName = en ? new Date(`${v.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : `${new Date(`${v.date}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${DAY_NAMES[new Date(`${v.date}T12:00:00Z`).getUTCDay()]}`;
    const cancel = `${site}/${en ? 'en/' : ''}randevu/iptal?t=${tok}`;
    const visitor = en
      ? [`Hello ${v.name},`, `Your ${cfg.minutes}-minute call with Arvela is confirmed for ${dayName} at ${v.time} (Istanbul time).`, cfg.meetUrl ? `Join here: ${cfg.meetUrl}` : 'We will email you the meeting link before the call.', `Add it to your calendar: ${gcalLink(cfg.title, start, end, cfg.meetUrl || site)}`, `Need to cancel? ${cancel}`]
      : [`Merhaba ${v.name},`, `Arvela ile ${cfg.minutes} dakikalık görüşmeniz ${dayName} saat ${v.time}'da (İstanbul saati).`, cfg.meetUrl ? `Görüşme bağlantısı: ${cfg.meetUrl}` : 'Görüşme bağlantısını görüşmeden önce e-postayla göndereceğiz.', `Takviminize ekleyin: ${gcalLink(cfg.title, start, end, cfg.meetUrl || site)}`, `Katılamayacaksanız iptal edin: ${cancel}`];
    await sendMail(a, { to: v.email, subject: en ? `Confirmed: ${cfg.title} · ${dayName} ${v.time}` : `Görüşmeniz onaylandı: ${dayName} ${v.time}`, html: mailBody(visitor, cfg.meetUrl ? [en ? 'Join the call' : 'Görüşmeye katıl', cfg.meetUrl] : null), kind: 'booking' }).catch(() => false);
    if (cfg.notify) for (const u of await admins(a)) await sendMail(a, { to: u.email, subject: `Yeni 15 dk görüşme: ${v.name} · ${when}`, html: mailBody([`${v.name}${v.company ? ` (${v.company})` : ''} · ${v.email}${v.phone ? ` · ${v.phone}` : ''}`, `Zaman: ${dayName} ${v.time}`, answerText(v.answers), v.pages.length ? `Gezdiği bölümler: ${v.pages.join(', ')}` : '', v.note ? `Not: ${v.note}` : ''], ['Müşteriyi aç', `${String(process.env.BASE_URL || 'https://os.arveladigital.com').replace(/\/$/, '')}/musteriler/${c.id}`]), kind: 'booking' }).catch(() => false);
    json(res, 201, { ok: true, id: b.id, starts_at: start.toISOString(), minutes: cfg.minutes, meet_url: cfg.meetUrl || null, day: dayName, time: v.time });
  });

  // Site: görüşme almadan cevaplarını bırakan ziyaretçi (yalnız e-posta) → satış hattında yeni
  route('POST', '/api/web/talep', async (ctx, res) => {
    auth(ctx); limit(60); const b = ctx.body || {}; const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(email)) throw new HttpError(400, 'Geçerli bir e-posta adresi yazın.'); if (b.kvkk !== true) throw new HttpError(400, 'Aydınlatma metnini onaylayın.');
    const v = validBooking({ ...b, name: b.name || email, date: '2000-01-01', time: '10:00' }); const a = await agencyId();
    let c = await one(`SELECT id FROM clients WHERE agency_id=$1 AND lower(email)=$2 ORDER BY id DESC LIMIT 1`, [a, email]);
    const notes = ['Kaynak: arveladigital.com ihtiyaç eşleştirici (görüşme almadı)', answerText(v.answers), v.pages.length ? `Gezdiği bölümler: ${v.pages.join(', ')}` : '', `İletişim izni (İYS): ${v.iys ? 'var' : 'yok'}`].filter(Boolean).join('\n');
    if (!c) c = await one(`INSERT INTO clients (agency_id, name, contact_name, email, notes, status, stage, lead_source, interest, next_action, next_action_at) VALUES ($1,$2,$3,$4,$5,'lead','yeni','web',$6,'Eşleştirici sonucu ile dönüş yap', now()) RETURNING id`,
      [a, clip(b.company, 160) || clip(b.name, 120) || email, clip(b.name, 120), email, notes, v.answers.cozum || v.answers.sorun || null]);
    await q('INSERT INTO web_leads (agency_id, client_id, email, name, answers, pages, lang, iys) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [a, c.id, email, clip(b.name, 120), JSON.stringify(v.answers), v.pages, v.lang, v.iys]);
    json(res, 201, { ok: true });
  });

  route('POST', '/api/web/iptal', async (ctx, res) => {
    auth(ctx); const t = String(ctx.body?.token || ''); if (!/^[A-Za-z0-9_-]{20,40}$/.test(t)) throw new HttpError(400, 'Bağlantı geçersiz.');
    const b = await one(`UPDATE bookings SET status='iptal' WHERE cancel_hash=$1 AND status='onayli' AND starts_at > now() RETURNING id, agency_id, name, starts_at, client_id`, [crypto.createHash('sha256').update(t).digest('hex')]);
    if (!b) throw new HttpError(404, 'Randevu bulunamadı ya da zaten iptal edilmiş.');
    for (const u of await admins(b.agency_id)) await q(`INSERT INTO notifications (agency_id, user_id, kind, title, body, href, ref) VALUES ($1,$2,'satis',$3,$4,$5,$6)`, [b.agency_id, u.id, `Görüşme iptal edildi: ${b.name}`, localDate(b.starts_at), b.client_id ? `/musteriler/${b.client_id}` : '/randevular', `booking:${b.id}:iptal`]).catch(() => {});
    if (b.client_id) await q(`UPDATE clients SET next_action='Görüşmeyi iptal etti; yeniden ulaş', next_action_at=now() WHERE id=$1`, [b.client_id]);
    json(res, 200, { ok: true });
  });

  // ---------- Yönetim: randevu listesi ve ayarlar ----------
  route('GET', '/randevular', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const cfg = await cfgOf(a); const past = ctx.url.searchParams.get('gecmis') === '1';
    const rows = await all(`SELECT * FROM bookings WHERE agency_id=$1 AND ${past ? 'starts_at < now()' : "starts_at >= now() - interval '1 hour'"} ORDER BY starts_at ${past ? 'DESC' : 'ASC'} LIMIT 100`, [a]);
    const st = { onayli: 'Onaylı', iptal: 'İptal', tamamlandi: 'Yapıldı', gelmedi: 'Gelmedi' };
    send(res, 200, layout(ctx, 'Randevular', `<div class="page-head"><div><h1>15 dk görüşmeler</h1><p>${cfg.days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ')} · ${cfg.start}–${cfg.end} · ${cfg.minutes} dk</p></div>
<div class="row"><a class="btn ghost" href="/randevular${past ? '' : '?gecmis=1'}">${past ? 'Yaklaşanlar' : 'Geçmiş görüşmeler'}</a><a class="btn gold" href="/ayarlar/randevu">Uygunluk ayarları</a></div></div>
${rows.map(b => `<section class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${h(b.name)}${b.company ? ` · ${h(b.company)}` : ''}</h2>
<p class="muted" style="margin:4px 0">${new Date(b.starts_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${h(b.email)}${b.phone ? ` · ${h(b.phone)}` : ''} · ${b.lang === 'en' ? 'İngilizce' : 'Türkçe'}</p></div>
<span class="badge">${st[b.status]}</span></div>${Object.keys(b.answers || {}).length ? `<p style="white-space:pre-wrap;margin:8px 0">${h(answerText(b.answers))}</p>` : ''}${b.pages?.length ? `<p class="muted">Gezdiği bölümler: ${h(b.pages.join(', '))}</p>` : ''}${b.note ? `<p>Not: ${h(b.note)}</p>` : ''}
<div class="row">${b.client_id ? `<a class="btn ghost" href="/musteriler/${b.client_id}">Müşteri kartı</a>` : ''}${b.status === 'onayli' ? ['tamamlandi', 'gelmedi', 'iptal'].map(s => `<form method="post" action="/randevular/${b.id}/durum">${csrfField(ctx)}<input type="hidden" name="status" value="${s}"><button class="ghost">${st[s]}</button></form>`).join('') : ''}</div></section>`).join('') || `<section class="card"><p class="muted">${past ? 'Geçmiş görüşme yok.' : 'Yaklaşan görüşme yok. Site yayına girdiğinde talepler burada görünür.'}</p></section>`}`, '/randevular'));
  });
  route('POST', '/randevular/:id/durum', async (ctx, res, p) => {
    need(ctx, 'admin'); const s = ['tamamlandi', 'gelmedi', 'iptal'].includes(ctx.body.status) ? ctx.body.status : null; if (!s) throw new HttpError(400, 'Durum geçersiz.');
    await q('UPDATE bookings SET status=$1 WHERE id=$2 AND agency_id=$3', [s, Number(p.id), ctx.user.agency_id]); await audit(ctx, 'booking.status', { id: Number(p.id), status: s }); redirect(res, '/randevular');
  });
  route('GET', '/ayarlar/randevu', async (ctx, res) => {
    need(ctx, 'admin'); const c = await cfgOf(ctx.user.agency_id); const f = csrfField(ctx); const ok = ctx.url.searchParams.get('ok');
    const now = new Date(); const prev = freeSlots(c, await booked(ctx.user.agency_id, now.toISOString(), new Date(now.getTime() + 8 * 864e5).toISOString()), now, localDate(now), 7).filter(d => d.slots.length);
    send(res, 200, layout(ctx, 'Randevu ayarları', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/ayarlar">Ayarlar</a></p><h1>15 dk görüşme ayarları</h1><p>arveladigital.com'daki randevu takvimi bu ayarlarla çalışır.</p></div><a class="btn ghost" href="/randevular">Görüşmeler</a></div>
${ok ? '<div class="flash">Kaydedildi.</div>' : ''}<form class="card stack" method="post" action="/ayarlar/randevu">${f}
<fieldset style="border:0;padding:0;margin:0"><legend class="muted">Görüşme günleri</legend><div class="row">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="chk"><input type="checkbox" name="days" value="${d}"${c.days.includes(d) ? ' checked' : ''}> ${DAY_NAMES[d]}</label>`).join('')}</div></fieldset>
<div class="row"><label>Başlangıç<input type="time" name="start" value="${c.start}" required></label><label>Bitiş<input type="time" name="end" value="${c.end}" required></label>
<label>Öğle arası (isteğe bağlı)<input type="time" name="break_start" value="${c.breaks[0]?.start || ''}"></label><label>–<input type="time" name="break_end" value="${c.breaks[0]?.end || ''}"></label></div>
<div class="row"><label>Görüşme süresi (dk)<input type="number" name="minutes" min="10" max="120" value="${c.minutes}"></label><label>Görüşmeler arası (dk)<input type="number" name="buffer" min="0" max="60" value="${c.buffer}"></label>
<label>En erken (saat sonra)<input type="number" name="leadHours" min="0" max="168" value="${c.leadHours}"></label><label>Kaç gün ileri<input type="number" name="horizonDays" min="1" max="90" value="${c.horizonDays}"></label><label>Günde en fazla<input type="number" name="perDay" min="1" max="60" value="${c.perDay}"></label></div>
<label>Kapalı günler (tatil, izin; her satıra YYYY-AA-GG)<textarea name="closed" rows="3" placeholder="2026-12-31&#10;2027-01-01">${h(c.closed.join('\n'))}</textarea></label>
<div class="row"><label style="flex:2">Görüşme bağlantısı (Google Meet, Zoom; https)<input type="url" name="meetUrl" value="${h(c.meetUrl)}" placeholder="https://meet.google.com/abc-defg-hij"></label><label style="flex:1">Başlık<input name="title" maxlength="80" value="${h(c.title)}"></label></div>
<label class="chk"><input type="checkbox" name="notify" value="1"${c.notify ? ' checked' : ''}> Yeni görüşmede yöneticilere e-posta gönder</label><div><button class="gold">Kaydet</button></div></form>
<section class="card"><h2>Önümüzdeki 7 gün: ziyaretçinin göreceği saatler</h2>${prev.map(d => `<p style="margin:6px 0"><strong>${new Date(d.date + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> <span class="muted">${d.slots.length} saat · ${d.slots.slice(0, 8).join(', ')}${d.slots.length > 8 ? '…' : ''}</span></p>`).join('') || '<p class="muted">Bu ayarlarla önümüzdeki 7 günde boş saat yok.</p>'}</section>`, '/ayarlar'));
  });
  route('POST', '/ayarlar/randevu', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body;
    const cfg = normalizeCfg({ days: [].concat(b.days || []), start: b.start, end: b.end, minutes: b.minutes, buffer: b.buffer, leadHours: b.leadHours, horizonDays: b.horizonDays, perDay: b.perDay,
      breaks: b.break_start && b.break_end ? [{ start: b.break_start, end: b.break_end }] : [], closed: String(b.closed || '').split(/\s+/).filter(Boolean), meetUrl: String(b.meetUrl || '').trim(), title: b.title, notify: b.notify === '1' });
    if (!cfg.days.length) throw new HttpError(400, 'En az bir gün seçin.');
    await q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,'booking.cfg',$2) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [ctx.user.agency_id, JSON.stringify(cfg)]);
    await audit(ctx, 'booking.settings', {}); redirect(res, '/ayarlar/randevu?ok=1');
  });
}
