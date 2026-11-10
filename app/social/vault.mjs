// Arvela Social — kanal anahtarlarının şifrelenmesi (AES-256-GCM) ve herkese açık görsel adreslerinin imzalanması.
// Anahtar SOCIAL_TOKEN_KEY'den gelir (deploy.py, SETUP_TOKEN'dan türetir). Anahtar yoksa kanal bağlanamaz.
import crypto from 'node:crypto';

const key = () => { const k = process.env.SOCIAL_TOKEN_KEY || ''; return /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : null; };
export const vaultReady = () => !!key();

export function seal(text) {
  const k = key(); if (!k) throw new Error('Sunucu şifreleme anahtarı tanımlı değil.');
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function open(sealed) {
  const k = key(); if (!k || !sealed || !String(sealed).startsWith('v1:')) return null;
  try {
    const b = Buffer.from(String(sealed).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
export const sealJson = (o) => seal(JSON.stringify(o));
export const openJson = (s) => { const t = open(s); try { return t ? JSON.parse(t) : null; } catch { return null; } };

// Instagram ve Facebook görseli bizim sunucumuzdan çeker: süreli, imzalı adres (/m/<id>/<son>/<imza>.jpg)
const mac = (id, exp) => crypto.createHmac('sha256', key() || Buffer.alloc(32)).update(`media:${id}:${exp}`).digest('base64url').slice(0, 32);
export function signedMediaPath(id, ttlSec = 6 * 3600, now = Date.now()) { const exp = Math.floor(now / 1000) + ttlSec; return `/m/${id}/${exp}/${mac(id, exp)}`; }
export function checkMediaSig(id, exp, sig, now = Date.now()) {
  if (!key() || !/^\d+$/.test(String(exp)) || Number(exp) * 1000 < now) return false;
  const a = Buffer.from(String(sig)); const b = Buffer.from(mac(id, Number(exp))); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
