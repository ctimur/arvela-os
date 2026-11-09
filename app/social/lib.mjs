// Arvela Social — ortak yardımcılar: güvenlik, biçimlendirme, gövde okuma, çerez.
import crypto from 'node:crypto';

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'); const b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function safeEqual(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
export const validPassword = (pw) => typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;
export const validEmail = (e) => /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(String(e || '').trim());

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nn = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
export const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
export const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
const TZ = 'Europe/Istanbul';
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
// İstanbul saatiyle "YYYY-MM-DDTHH:MM" ↔ Date (Türkiye yaz saati uygulamıyor: +03:00 sabit)
export const toLocalInput = (d) => d ? new Date(new Date(d).getTime() + 3 * 3600e3).toISOString().slice(0, 16) : '';
export const fromLocalInput = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(s || '')) ? new Date(`${s}:00+03:00`) : null;
export const dayKey = (d) => new Date(new Date(d).getTime() + 3 * 3600e3).toISOString().slice(0, 10);

export function parseCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
export const cookie = (name, val, maxAge, secure) => `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
export const clientIp = (req) => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); return x.at(-1) || req.socket.remoteAddress; };

// Gövde: urlencoded, JSON ya da multipart (dosyalar ctx.files). Sınır 12 MB.
export function readBody(req, max = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > max) { reject(new HttpError(413, 'Dosya çok büyük (en çok 10 MB).')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const buf = Buffer.concat(chunks); const ct = String(req.headers['content-type'] || '');
      try {
        if (ct.startsWith('application/json')) return resolve(buf.length ? JSON.parse(buf.toString('utf8')) : {});
        if (ct.startsWith('multipart/form-data')) return resolve(parseMultipart(buf, ct));
        resolve(Object.fromEntries(new URLSearchParams(buf.toString('utf8'))));
      } catch { reject(new HttpError(400, 'İstek okunamadı.')); }
    });
    req.on('error', reject);
  });
}
export function parseMultipart(buf, ct) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct); if (!m) return {};
  const b = Buffer.from('--' + (m[1] || m[2])); const out = { __files: [] }; let pos = buf.indexOf(b);
  while (pos !== -1) {
    const start = pos + b.length; if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(b, start); if (next === -1) break;
    const part = buf.slice(start + 2, next - 2); const he = part.indexOf('\r\n\r\n');
    const head = part.slice(0, he).toString('utf8'); const body = part.slice(he + 4);
    const name = /name="([^"]*)"/.exec(head)?.[1]; const fn = /filename="([^"]*)"/.exec(head)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() || 'application/octet-stream';
    if (name != null) { if (fn != null) { if (body.length) out.__files.push({ field: name, name: fn, type, data: body }); } else out[name] = body.toString('utf8'); }
    pos = next;
  }
  return out;
}

// Görsel türü: içerikten (uzantıya güvenilmez)
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}
