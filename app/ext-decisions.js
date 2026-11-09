// Arvela OS — müşteri kararları: onay, seçenek seçimi, bütçe/kapsam ve bilgi/dosya.
// Müşteri portaldan ya da giriş yapmadan e-posta doğrulamalı karar bağlantısından karar verir.
// Her karar onay kaydında (kim, hangi yoldan, ne seçti), müşterinin iletişim geçmişinde ve bağlı aşama görevinde kalır.
import crypto from 'node:crypto';

export const KINDS = { onay: 'Onay / düzeltme', secim: 'Seçenek seçimi', butce: 'Bütçe / kapsam kararı', bilgi: 'Bilgi / dosya' };
export const VIA = { portal: 'Portal', baglanti: 'Karar bağlantısı (e-posta doğrulamalı)', ekip: 'Ekip işledi', api: 'API' };
export const FILE_MAX = 8 * 1024 * 1024, FILES_PER = 5, BODY_MAX = 26 * 1024 * 1024;
const TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export const LINK_DAYS = 14, CODE_MIN = 10, SESSION_MIN = 120, CODE_TRIES = 5, CODE_SENDS = 5;

export async function migrateDecisions({ q }) {
  await q(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'onay'`);
  await q('ALTER TABLE approvals ADD COLUMN IF NOT EXISTS options JSONB');
  await q('ALTER TABLE approvals ADD COLUMN IF NOT EXISTS choice TEXT');
  await q('ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decided_via TEXT');
  await q('ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decided_name TEXT');
  await q(`CREATE TABLE IF NOT EXISTS approval_files (id SERIAL PRIMARY KEY, approval_id INT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE, agency_id INT NOT NULL,
    name TEXT NOT NULL, mime TEXT NOT NULL, size INT NOT NULL, data BYTEA NOT NULL, via TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS approval_files_ap ON approval_files(approval_id)');
  await q(`CREATE TABLE IF NOT EXISTS decision_links (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, email TEXT NOT NULL, created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ, sent_via TEXT, code_hash TEXT, code_expires TIMESTAMPTZ, code_tries INT NOT NULL DEFAULT 0, code_sends INT NOT NULL DEFAULT 0, code_window TIMESTAMPTZ,
    sess_hash TEXT, sess_expires TIMESTAMPTZ, verified_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ)`);
  await q('CREATE INDEX IF NOT EXISTS decision_links_client ON decision_links(client_id)');
  await q(`DELETE FROM decision_links WHERE expires_at < now() - interval '90 days'`);
}

// ---------- saf yardımcılar (test edilir) ----------
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
export const validEmail = (e) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(String(e || '').trim());
export function maskEmail(e) {
  const [u, d] = String(e || '').split('@'); if (!d) return '';
  const [host, ...rest] = d.split('.');
  return `${u.slice(0, 1)}${'*'.repeat(Math.max(2, u.length - 1))}@${host.slice(0, 1)}${'*'.repeat(Math.max(2, host.length - 1))}.${rest.join('.')}`;
}
const clip = (s, n) => { const v = String(s ?? '').trim(); return v ? v.slice(0, n) : null; };

// Ekibin onay isteği formu → tür ve seçenekler.
export function parseRequest(b = {}) {
  const kind = KINDS[b.kind] ? b.kind : 'onay';
  if (kind === 'secim') {
    const list = String(b.options || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 200));
    if (list.length < 2) return { error: 'Seçenek seçimi için en az iki seçenek yazın (her satıra bir seçenek).' };
    return { kind, options: list };
  }
  if (kind === 'butce') {
    const amount = Number(String(b.amount || '').replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!(amount > 0)) return { error: 'Bütçe kararı için tutar girin.' };
    return { kind, options: { amount: Math.round(amount * 100) / 100, currency: ['TRY', 'EUR', 'USD'].includes(b.currency) ? b.currency : 'TRY', scope: clip(b.scope, 2000) } };
  }
  return { kind, options: null };
}

// Müşterinin kararı → { status, comment, choice } ya da { error }.
export function parseDecision(ap, b = {}, files = []) {
  const comment = clip(b.comment, 2000);
  const want = b.decision === 'reddedildi' ? 'reddedildi' : 'onaylandi';
  if (ap.kind === 'bilgi') {
    const text = clip(b.answer, 4000);
    if (!text && !files.length) return { error: 'Bilgiyi yazın ya da dosya ekleyin.' };
    return { status: 'onaylandi', comment, choice: text || 'Dosya gönderildi' };
  }
  if (want === 'reddedildi') return comment ? { status: 'reddedildi', comment, choice: null } : { error: 'Düzeltme isterken ne değişmesi gerektiğini yazın.' };
  if (ap.kind === 'secim') {
    const opts = Array.isArray(ap.options) ? ap.options : [];
    if (opts.length) { const i = Number(b.choice); return Number.isInteger(i) && opts[i] != null ? { status: 'onaylandi', comment, choice: opts[i] } : { error: 'Bir seçenek seçin.' }; }
    const free = clip(b.choice_text, 500); return free ? { status: 'onaylandi', comment, choice: free } : { error: 'Tercihinizi yazın.' };
  }
  if (ap.kind === 'butce') { const o = ap.options || {}; return { status: 'onaylandi', comment, choice: `Kabul: ${o.amount} ${o.currency || 'TRY'}` }; }
  return { status: 'onaylandi', comment, choice: null };
}

// Dosya: uzantı izin listesi, boyut sınırı, türü uzantıdan belirle (gönderilen türe güvenme).
export function checkFile(f) {
  const name = String(f?.filename || '').replace(/[\\/\0\r\n"]/g, '_').slice(-120);
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i) || [])[1]?.toLowerCase();
  if (!name || !f?.data?.length) return null;
  if (!ext || !TYPES[ext]) return { error: `${name}: bu dosya türü kabul edilmiyor (PDF, görsel, Word, Excel, PowerPoint, ZIP, TXT, CSV).` };
  if (f.data.length > FILE_MAX) return { error: `${name}: dosya 8 MB'tan büyük.` };
  return { name, mime: TYPES[ext], size: f.data.length, data: f.data };
}

// multipart/form-data çözücü (alanlar + dosyalar). Sınır ve boyut çağıran tarafta denetlenir.
export function parseMultipart(buf, ctype) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype || ''); if (!m) return { fields: {}, files: [] };
  const sep = Buffer.from('--' + (m[1] || m[2]).trim()); const fields = {}; const files = [];
  let pos = buf.indexOf(sep); if (pos < 0) return { fields, files };
  while (true) {
    pos += sep.length; if (buf.slice(pos, pos + 2).toString() === '--') break;
    pos += 2; const he = buf.indexOf('\r\n\r\n', pos); if (he < 0) break;
    const head = buf.slice(pos, he).toString('utf8'); const next = buf.indexOf(sep, he + 4); if (next < 0) break;
    const data = buf.slice(he + 4, next - 2);
    const name = (/name="([^"]*)"/i.exec(head) || [])[1]; const fn = /filename="([^"]*)"/i.exec(head);
    if (name != null) { if (fn) { if (fn[1]) files.push({ field: name, filename: fn[1], data }); } else if (!(name in fields)) fields[name] = data.toString('utf8'); }
    pos = next;
  }
  return { fields, files };
}

const moneyTxt = (o) => o ? `${new Intl.NumberFormat('tr-TR').format(o.amount)} ${o.currency || 'TRY'}` : '';
// Müşteriye gösterilen karar formu (portal ve karar bağlantısı ortak).
export function decisionForm(ap, action, hidden, h) {
  const multipart = ap.kind === 'bilgi' ? ' enctype="multipart/form-data"' : '';
  const body = ap.body ? `<p style="white-space:pre-wrap;margin:0">${h(ap.body)}</p>` : '';
  let fields = '', btns = '';
  if (ap.kind === 'secim') {
    const o = Array.isArray(ap.options) ? ap.options : [];
    fields = o.length ? `<fieldset class="choices"><legend>Seçiminiz</legend>${o.map((x, i) => `<label class="opt"><input type="radio" name="choice" value="${i}"${i === 0 ? ' required' : ''}> ${h(x)}</label>`).join('')}</fieldset>`
      : '<label>Tercihiniz<input name="choice_text" maxlength="500"></label>';
    btns = '<button class="gold" name="decision" value="onaylandi">Seçimimi gönder</button><button class="ghost" name="decision" value="reddedildi" formnovalidate>Hiçbiri uygun değil</button>';
  } else if (ap.kind === 'butce') {
    const o = ap.options || {};
    fields = `<div class="budget"><span class="muted">Önerilen bütçe</span><strong>${h(moneyTxt(o))}</strong>${o.scope ? `<p style="white-space:pre-wrap;margin:6px 0 0">${h(o.scope)}</p>` : ''}</div>`;
    btns = '<button class="gold" name="decision" value="onaylandi">Bütçeyi ve kapsamı onaylıyorum</button><button class="ghost" name="decision" value="reddedildi">Değişiklik istiyorum</button>';
  } else if (ap.kind === 'bilgi') {
    fields = `<label>Yanıtınız<textarea name="answer" rows="4" maxlength="4000"></textarea></label><label>Dosyalar (en çok ${FILES_PER}, her biri 8 MB'a kadar)<input type="file" name="files" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.pptx,.zip,.txt,.csv"></label>`;
    btns = '<button class="gold" name="decision" value="onaylandi">Gönder</button>';
  } else {
    btns = '<button class="gold" name="decision" value="onaylandi">Onayla</button><button class="ghost" name="decision" value="reddedildi">Düzeltme iste</button>';
  }
  const note = ap.kind === 'bilgi' ? '' : `<label>Notunuz${ap.kind === 'onay' ? ' (düzeltme istiyorsanız ne değişmeli?)' : ' (isteğe bağlı)'}<textarea name="comment" rows="2" maxlength="2000"></textarea></label>`;
  return `<div class="card decision"><p class="eyebrow">${h(KINDS[ap.kind] || KINDS.onay)}</p><h3>${h(ap.title)}</h3>${body}
<form class="stack" method="post" action="${action}"${multipart}>${hidden}${fields}${note}<div class="row">${btns}</div></form></div>`;
}

// Ekip için karar özeti.
export function decisionSummary(ap, files, h, fileUrl) {
  const rows = [];
  if (ap.kind === 'secim' && Array.isArray(ap.options)) rows.push(`<p class="muted" style="margin:0">Seçenekler: ${ap.options.map(h).join(' · ')}</p>`);
  if (ap.kind === 'butce' && ap.options) rows.push(`<p class="muted" style="margin:0">Önerilen: ${h(moneyTxt(ap.options))}</p>`);
  if (ap.choice) rows.push(`<p style="margin:0"><strong>${ap.kind === 'bilgi' ? 'Yanıt' : 'Karar'}:</strong> ${h(ap.choice)}</p>`);
  if (ap.decided_via) rows.push(`<p class="muted" style="margin:0">${h(VIA[ap.decided_via] || ap.decided_via)}${ap.decided_name ? ' · ' + h(ap.decided_name) : ''}</p>`);
  if (files?.length) rows.push(`<ul class="files">${files.map(f => `<li><a href="${fileUrl(f)}">${h(f.name)}</a> <span class="muted">${Math.max(1, Math.round(f.size / 1024))} KB</span></li>`).join('')}</ul>`);
  return rows.join('');
}

export function mailHtml(title, lines, cta) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#141A22"><p style="font-size:20px;margin:0 0 16px"><strong>Arvela</strong> <span style="color:#B08433">Digital &amp; AI</span></p>
<h2 style="font-size:18px">${esc(title)}</h2>${lines.map(l => `<p style="line-height:1.5">${esc(l)}</p>`).join('')}${cta ? `<p><a href="${esc(cta[1])}" style="display:inline-block;background:#E2BE7A;color:#0B0D12;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${esc(cta[0])}</a></p>` : ''}
<p style="color:#6B6558;font-size:12px">Bu e-posta, Arvela ile yürüttüğünüz iş hakkında bilgilendirme amacıyla gönderildi.</p></div>`;
}

export function registerDecisions(d) {
  const { route, all, one, q, need, layout, authPage, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, AP_ST, sendMail, APP_URL, cookie, parseCookies } = d;
  const BASE = (APP_URL || 'https://os.arveladigital.com').replace(/\/$/, '');
  const setting = async (a, k) => (await one('SELECT value FROM settings WHERE agency_id=$1 AND key=$2', [a, k]))?.value;
  const shown = new Map();
  const page = (res, title, body, st = 200) => send(res, st, authPage(title, body), { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });

  // Ortak karar işleme: durum, dosyalar, müşteri iletişim geçmişi, işlem kaydı (akış buradan ilerler).
  async function decide(ctx, ap, b, rawFiles, via, who) {
    if (ap.status !== 'bekliyor') throw new HttpError(400, 'Bu istek için karar zaten verilmiş.');
    const files = []; for (const f of (rawFiles || []).slice(0, FILES_PER)) { const c = checkFile(f); if (c?.error) throw new HttpError(400, c.error); if (c) files.push(c); }
    if ((rawFiles || []).length > FILES_PER) throw new HttpError(400, `En çok ${FILES_PER} dosya gönderebilirsiniz.`);
    const dec = parseDecision(ap, b, files); if (dec.error) throw new HttpError(400, dec.error);
    const r = await one(`UPDATE approvals SET status=$1, comment=$2, choice=$3, decided_by=$4, decided_at=now(), decided_via=$5, decided_name=$6 WHERE id=$7 AND status='bekliyor' RETURNING id`,
      [dec.status, dec.comment, dec.choice, ctx.user.id || null, via, who || null, ap.id]);
    if (!r) throw new HttpError(409, 'Bu istek için karar zaten verilmiş.');
    for (const f of files) await q('INSERT INTO approval_files (approval_id, agency_id, name, mime, size, data, via) VALUES ($1,$2,$3,$4,$5,$6,$7)', [ap.id, ap.agency_id, f.name, f.mime, f.size, f.data, via]);
    const word = dec.status === 'reddedildi' ? 'düzeltme istedi' : ap.kind === 'bilgi' ? 'bilgi gönderdi' : 'onayladı';
    const line = `Karar · ${ap.title}: ${word}${dec.choice ? ` — ${dec.choice}` : ''}${dec.comment ? ` · Not: ${dec.comment}` : ''}${files.length ? ` · ${files.length} dosya` : ''} (${VIA[via] || via}${who ? ', ' + who : ''})`;
    await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,$2,$3,$4)', [ap.client_id, ctx.user.role === 'client' ? null : ctx.user.id || null, 'karar', line.slice(0, 4000)]);
    await audit(ctx, via === 'ekip' ? 'approval.decide_for_client' : 'approval.decide', { id: ap.id, decision: dec.status, kind: ap.kind, via, files: files.length || undefined });
    return dec;
  }

  // ---------- karar bağlantısı (giriş gerekmez) ----------
  async function linkFor(token) {
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(token || '')) return null;
    return one(`SELECT l.*, c.name client, c.contact_name FROM decision_links l JOIN clients c ON c.id=l.client_id WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND l.expires_at > now()`, [sha(token)]);
  }
  const sessOk = (ctx, l) => { const s = parseCookies(ctx.req).karar; return !!(s && l.sess_hash && l.sess_expires && new Date(l.sess_expires) > new Date() && sha(s) === l.sess_hash); };
  const gone = (res) => page(res, 'Bağlantı geçersiz', '<h1>Bağlantı geçersiz</h1><p class="muted">Bu karar bağlantısının süresi dolmuş ya da iptal edilmiş. Yeni bağlantı için Arvela ekibinize yazın.</p>', 404);
  const linkCtx = (l) => ({ user: { id: null, agency_id: l.agency_id, role: 'client', client_id: l.client_id, name: l.contact_name || l.client } });

  route('GET', '/karar/:token', async (ctx, res, p) => {
    const l = await linkFor(p.token); if (!l) return gone(res);
    const base = `/karar/${p.token}`; const msg = { gonderildi: 'Kod e-postanıza gönderildi. 10 dakika geçerlidir.', hata: 'Kod yanlış ya da süresi dolmuş. Yeniden deneyin.', cok: 'Çok fazla deneme yapıldı. Bir saat sonra yeniden deneyin.', gonderilemedi: 'Kod şu an gönderilemedi. Arvela ekibinize yazın.', tamam: 'Kararınız kaydedildi. Teşekkürler.' }[ctx.url.searchParams.get('m')];
    const flash = msg ? `<div class="${/hata|cok|gonderilemedi/.test(ctx.url.searchParams.get('m')) ? 'err' : 'flash'}">${h(msg)}</div>` : '';
    if (!sessOk(ctx, l)) {
      const sent = l.code_hash && new Date(l.code_expires) > new Date();
      return page(res, 'Kararlarınız', `<p class="eyebrow">${h(l.client)}</p><h1>Kararlarınız</h1>${flash}<p>Arvela ile yürüttüğünüz işlerde sizden beklenen kararları görmek için e-posta adresinizi doğrulayalım.</p>
<form class="stack" method="post" action="${base}/kod"><p class="muted" style="margin:0">Kod şu adrese gönderilecek: <strong>${h(maskEmail(l.email))}</strong></p><div><button class="${sent ? 'ghost' : 'gold'}">${sent ? 'Kodu yeniden gönder' : 'Doğrulama kodu gönder'}</button></div></form>
${sent ? `<form class="stack" method="post" action="${base}/dogrula"><label>6 haneli kod<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><div><button class="gold">Doğrula ve devam et</button></div></form>` : ''}
<p class="muted">Giriş yapmanız ya da hesap açmanız gerekmez. Doğrulama 2 saat geçerlidir.</p>`);
    }
    const aps = await all(`SELECT * FROM approvals WHERE client_id=$1 AND agency_id=$2 ORDER BY (status<>'bekliyor'), created_at DESC LIMIT 30`, [l.client_id, l.agency_id]);
    const pending = aps.filter(a => a.status === 'bekliyor'); const done = aps.filter(a => a.status !== 'bekliyor').slice(0, 10);
    await q('UPDATE decision_links SET last_used_at=now() WHERE id=$1', [l.id]);
    page(res, 'Kararlarınız', `<p class="eyebrow">${h(l.client)}</p><h1>Kararlarınız</h1>${flash}
${pending.length ? `<p class="muted">Kararınız kaydedildiğinde ekibimiz bir sonraki aşamaya geçer ve size haber verir. Düzeltme isterseniz notunuz ilgili ekibe gider; düzeltme bitince yeniden onayınıza gelir.</p>${pending.map(a => decisionForm(a, `${base}/onay/${a.id}`, '', h)).join('')}` : '<p>Şu an sizden beklenen bir karar yok.</p>'}
${done.length ? `<h2>Verdiğiniz son kararlar</h2>${done.map(a => `<p style="margin:0">${badge(AP_ST[a.status], a.status === 'onaylandi' ? 'ok' : 'bad')} ${h(a.title)}${a.choice ? ` · ${h(a.choice)}` : ''} <span class="muted">· ${fmtDate(a.decided_at)}</span></p>`).join('')}` : ''}`);
  });

  route('POST', '/karar/:token/kod', async (ctx, res, p) => {
    const l = await linkFor(p.token); if (!l) return gone(res);
    const fresh = !l.code_window || Date.now() - new Date(l.code_window).getTime() > 3600e3;
    if (!fresh && l.code_sends >= CODE_SENDS) return redirect(res, `/karar/${p.token}?m=cok`);
    const code = newCode();
    await q(`UPDATE decision_links SET code_hash=$1, code_expires=now() + interval '${CODE_MIN} minutes', code_tries=0, code_sends=CASE WHEN $2 THEN 1 ELSE code_sends+1 END, code_window=CASE WHEN $2 THEN now() ELSE code_window END WHERE id=$3`, [sha(l.id + ':' + code), fresh, l.id]);
    const ok = await sendMail(l.agency_id, { to: l.email, subject: `Arvela doğrulama kodunuz: ${code}`, html: mailHtml('Doğrulama kodunuz', [`Kod: ${code}`, `Kod ${CODE_MIN} dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.`]), kind: 'kod' }).catch(() => false);
    redirect(res, `/karar/${p.token}?m=${ok ? 'gonderildi' : 'gonderilemedi'}`);
  });

  route('POST', '/karar/:token/dogrula', async (ctx, res, p) => {
    const l = await linkFor(p.token); if (!l) return gone(res);
    if (l.code_tries >= CODE_TRIES) return redirect(res, `/karar/${p.token}?m=cok`);
    const code = String(ctx.body.code || '').replace(/\D/g, '');
    const ok = l.code_hash && new Date(l.code_expires) > new Date() && code.length === 6 && crypto.timingSafeEqual(Buffer.from(sha(l.id + ':' + code)), Buffer.from(l.code_hash));
    if (!ok) { await q('UPDATE decision_links SET code_tries=code_tries+1 WHERE id=$1', [l.id]); return redirect(res, `/karar/${p.token}?m=hata`); }
    const s = newToken();
    await q(`UPDATE decision_links SET code_hash=NULL, code_expires=NULL, code_tries=0, sess_hash=$1, sess_expires=now() + interval '${SESSION_MIN} minutes', verified_at=COALESCE(verified_at, now()) WHERE id=$2`, [sha(s), l.id]);
    await audit(linkCtx(l), 'decision.verify', { link: l.id, client: l.client_id });
    redirect(res, `/karar/${p.token}`, { 'Set-Cookie': cookie('karar', s, SESSION_MIN * 60).replace('Path=/', `Path=/karar/${p.token}`) });
  });

  route('POST', '/karar/:token/onay/:id', async (ctx, res, p) => {
    const l = await linkFor(p.token); if (!l) return gone(res);
    if (!sessOk(ctx, l)) return redirect(res, `/karar/${p.token}`);
    const ap = await one('SELECT * FROM approvals WHERE id=$1 AND client_id=$2 AND agency_id=$3', [int(p.id), l.client_id, l.agency_id]); if (!ap) throw new HttpError(404, 'İstek bulunamadı.');
    await decide(linkCtx(l), ap, ctx.body, ctx.files, 'baglanti', `${l.contact_name || l.client} <${l.email}>`);
    redirect(res, `/karar/${p.token}?m=tamam`);
  });

  // ---------- ekip: bağlantı oluştur, gönder, iptal ----------
  async function clientFor(ctx, id) { const c = await one('SELECT * FROM clients WHERE id=$1 AND agency_id=$2', [id, ctx.user.agency_id]); if (!c) throw new HttpError(404, 'Müşteri bulunamadı.'); return c; }
  async function createLink(ctx, c, email, via) {
    const token = newToken();
    await q(`INSERT INTO decision_links (agency_id, client_id, token_hash, email, created_by, expires_at, sent_via) VALUES ($1,$2,$3,$4,$5, now() + interval '${LINK_DAYS} days', $6)`, [c.agency_id, c.id, sha(token), email, ctx.user.id || null, via]);
    return `${BASE}/karar/${token}`;
  }
  async function mailLink(agencyId, c, email, url, count) {
    return sendMail(agencyId, { to: email, subject: `Arvela · kararınız bekleniyor${count ? ` (${count})` : ''}`, kind: 'baglanti',
      html: mailHtml(`Merhaba ${c.contact_name || c.name},`, [`Arvela ile yürüttüğünüz işlerde sizden ${count || 'bazı'} karar bekleniyor. Aşağıdaki bağlantıdan e-posta adresinizi doğrulayıp giriş yapmadan karar verebilirsiniz.`, `Bağlantı ${LINK_DAYS} gün geçerlidir ve yalnız size özeldir; lütfen başkasıyla paylaşmayın.`], ['Kararlarımı gör', url]) }).catch(() => false);
  }

  route('GET', '/musteriler/:id/karar', async (ctx, res, p) => {
    need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id)); const f = csrfField(ctx);
    const [links, pend] = await Promise.all([all(`SELECT l.*, u.name creator FROM decision_links l LEFT JOIN users u ON u.id=l.created_by WHERE l.client_id=$1 ORDER BY l.created_at DESC LIMIT 20`, [c.id]),
      one(`SELECT count(*)::int n FROM approvals WHERE client_id=$1 AND status='bekliyor'`, [c.id])]);
    const tok = ctx.url.searchParams.get('yeni'); const slot = tok && shown.get(tok); if (tok) shown.delete(tok);
    const fresh = slot && slot.user === ctx.user.id && Date.now() - slot.at < 120_000 ? slot : null;
    const st = (l) => l.revoked_at ? badge('İptal', 'bad') : new Date(l.expires_at) < new Date() ? badge('Süresi doldu') : l.verified_at ? badge('Doğrulandı', 'ok') : badge('Açık', 'warn');
    const wa = fresh ? `https://wa.me/${String(c.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Merhaba, Arvela'dan sizden beklenen kararları bu bağlantıdan görebilirsiniz (e-posta doğrulamalı): ${fresh.url}`)}` : '';
    send(res, 200, layout(ctx, 'Karar bağlantısı', `<nav class="crumb"><a href="/musteriler/${c.id}">${h(c.name)}</a></nav><div class="page-head"><div><h1>Karar bağlantısı</h1><div class="chips"><span class="muted">Bekleyen karar: ${pend.n}</span></div></div></div>
${fresh ? `<section class="card" style="border-color:var(--champ)"><h2>Bağlantı hazır</h2><p class="muted">Bu bağlantı yalnız şimdi gösteriliyor. Müşteri açınca ${h(maskEmail(fresh.email))} adresine doğrulama kodu gider.</p><input readonly value="${h(fresh.url)}" aria-label="Bağlantı">${c.phone ? `<div class="row"><a class="btn gold" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp'ta paylaş</a></div>` : ''}</section>` : ''}
<section class="card"><h2>Yeni bağlantı</h2><p class="muted">Müşteri giriş yapmadan, e-posta adresine gelen kodla doğrulayıp bekleyen kararlarını görür ve karar verir. Kararlar onay, müşteri kaydı ve bağlı görevde saklanır.</p>
<form class="stack" method="post" action="/musteriler/${c.id}/karar">${f}<label>Doğrulama e-postası<input type="email" name="email" value="${h(c.email || '')}" required></label>
<div class="row"><button class="gold" name="via" value="eposta">E-postayla gönder</button><button class="ghost" name="via" value="kopya">Bağlantıyı oluştur (WhatsApp için)</button></div></form></section>
<section class="card"><h2>Bağlantılar</h2>${links.length ? `<div class="tbl"><table><tr><th>Oluşturma</th><th>E-posta</th><th>Durum</th><th>Son kullanım</th><th></th></tr>${links.map(l => `<tr><td>${fmtDate(l.created_at)} · ${h(l.creator || '—')}</td><td>${h(maskEmail(l.email))}</td><td>${st(l)}</td><td>${l.last_used_at ? fmtDate(l.last_used_at) : '—'}</td><td>${!l.revoked_at && new Date(l.expires_at) > new Date() ? `<form method="post" action="/karar-baglantisi/${l.id}/iptal">${f}<button class="ghost">İptal et</button></form>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz bağlantı yok.</p>'}</section>`, '/musteriler'));
  });

  route('POST', '/musteriler/:id/karar', async (ctx, res, p) => {
    need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id)); const email = String(ctx.body.email || '').trim().toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'Geçerli bir e-posta adresi girin.');
    const via = ctx.body.via === 'eposta' ? 'eposta' : 'kopya';
    const url = await createLink(ctx, c, email, via);
    await audit(ctx, 'decision.link', { client: c.id, via });
    if (via === 'eposta') {
      const n = (await one(`SELECT count(*)::int n FROM approvals WHERE client_id=$1 AND status='bekliyor'`, [c.id])).n;
      const ok = await mailLink(c.agency_id, c, email, url, n);
      if (ok) return redirect(res, `/musteriler/${c.id}/karar?gonderildi=1`);
    }
    const k = crypto.randomBytes(12).toString('hex'); shown.set(k, { user: ctx.user.id, at: Date.now(), url, email });
    redirect(res, `/musteriler/${c.id}/karar?yeni=${k}${via === 'eposta' ? '&eposta=hata' : ''}`);
  });

  route('POST', '/karar-baglantisi/:id/iptal', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await one('UPDATE decision_links SET revoked_at=now(), sess_hash=NULL WHERE id=$1 AND agency_id=$2 RETURNING client_id', [int(p.id), ctx.user.agency_id]);
    if (!l) throw new HttpError(404, 'Bağlantı bulunamadı.');
    await audit(ctx, 'decision.link_revoke', { id: int(p.id), client: l.client_id }); redirect(res, `/musteriler/${l.client_id}/karar`);
  });

  // Onay isteği oluşunca (ayar açıksa) müşteriye karar bağlantısı e-postası.
  async function onAudit(ctx, action, detail = {}) {
    if (action !== 'approval.request' || !ctx.user?.agency_id) return;
    if ((await setting(ctx.user.agency_id, 'decisions.auto_mail')) !== '1') return;
    const ap = await one('SELECT a.client_id, c.* FROM approvals a JOIN clients c ON c.id=a.client_id WHERE a.id=$1', [int(detail.id)]);
    if (!ap || ap.is_demo || !validEmail(ap.email)) return;
    const c = { ...ap, id: ap.client_id };
    const url = await createLink({ user: { id: null } }, c, ap.email.toLowerCase(), 'otomatik');
    const n = (await one(`SELECT count(*)::int n FROM approvals WHERE client_id=$1 AND status='bekliyor'`, [c.id])).n;
    if (await mailLink(c.agency_id, c, ap.email, url, n)) await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,NULL,$2,$3)', [c.id, 'eposta', `Karar bağlantısı e-postayla gönderildi (${maskEmail(ap.email)}).`]);
  }

  route('GET', '/ayarlar/kararlar', async (ctx, res) => {
    need(ctx, 'admin'); const f = csrfField(ctx); const on = (await setting(ctx.user.agency_id, 'decisions.auto_mail')) === '1';
    send(res, 200, layout(ctx, 'Müşteri kararları', `<nav class="crumb"><a href="/ayarlar">Ayarlar</a></nav><div class="page-head"><div><h1>Müşteri kararları</h1></div></div>
<section class="card"><h2>Otomatik karar e-postası</h2><p class="muted">Açıksa, yeni bir onay isteği oluştuğunda (akışın müşteri kararı aşaması dahil) müşterinin kayıtlı e-postasına karar bağlantısı gider. E-posta n8n "E-posta gönderici" akışıyla gönderilir. Kapalıysa bağlantıyı müşteri sayfasından elle gönderirsiniz.</p>
<form method="post" action="/ayarlar/kararlar">${f}<label class="chk"><input type="checkbox" name="auto_mail" value="1"${on ? ' checked' : ''}> Onay isteklerinde müşteriye karar bağlantısı e-postası gönder</label><div><button class="gold">Kaydet</button></div></form></section>`, '/ayarlar'));
  });
  route('POST', '/ayarlar/kararlar', async (ctx, res) => {
    need(ctx, 'admin'); const v = ctx.body.auto_mail === '1' ? '1' : '0';
    await q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,'decisions.auto_mail',$2) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [ctx.user.agency_id, v]);
    await audit(ctx, 'settings.update', { key: 'decisions.auto_mail', value: v }); redirect(res, '/ayarlar/kararlar');
  });

  // ---------- dosya indirme ----------
  const download = (res, f) => { res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.size, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }); res.end(f.data); };
  const toBuf = (v) => Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ''), 'hex');
  route('GET', '/onay-dosya/:id', async (ctx, res, p) => {
    if (!ctx.user) throw new HttpError(401);
    const f = await one(`SELECT f.*, a.client_id FROM approval_files f JOIN approvals a ON a.id=f.approval_id WHERE f.id=$1 AND f.agency_id=$2`, [int(p.id), ctx.user.agency_id]);
    if (!f || (ctx.user.role === 'client' ? f.client_id !== ctx.user.client_id : !STAFF.includes(ctx.user.role))) throw new HttpError(404, 'Dosya bulunamadı.');
    download(res, { ...f, data: toBuf(f.data) });
  });
  const filesOf = (apId) => all('SELECT id, name, size, mime FROM approval_files WHERE approval_id=$1 ORDER BY id', [apId]);
  const summary = async (ap) => decisionSummary(ap, await filesOf(ap.id), h, (f) => `/onay-dosya/${f.id}`);

  // Ekibin onay isteği formundaki tür alanları.
  const requestFields = (ap = {}) => `<label>Karar türü<select name="kind" data-kind>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${(ap.kind || 'onay') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
<label data-for="secim">Seçenekler (her satıra bir; seçenek seçimi için)<textarea name="options" rows="3">${h(Array.isArray(ap.options) ? ap.options.join('\n') : '')}</textarea></label>
<div class="row" data-for="butce"><label>Tutar (bütçe için)<input name="amount" inputmode="decimal" value="${h(ap.kind === 'butce' ? ap.options?.amount : '')}"></label><label>Para birimi<select name="currency">${['TRY', 'EUR', 'USD'].map(x => `<option${ap.options?.currency === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
<label data-for="butce">Kapsam (bütçe için)<textarea name="scope" rows="2">${h(ap.kind === 'butce' ? ap.options?.scope : '')}</textarea></label>`;

  return { decide, summary, requestFields, onAudit, filesOf };
}
