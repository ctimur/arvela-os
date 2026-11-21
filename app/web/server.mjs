// arveladigital.com — ajans sitesi. Bağımlılıksız Node sunucusu; randevular Arvela OS'e (WEB_BRIDGE_URL, Bearer WEB_BRIDGE_KEY) iletilir.
// Çalıştırma: node web/server.mjs (PORT, WEB_BRIDGE_URL, WEB_BRIDGE_KEY, WEB_URL)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { T, SOLUTIONS, recommend } from './content.mjs';
import * as V from './pages.mjs';
import { CSS } from './style.mjs';
import { JS } from './client.mjs';

export const VERSION = '1.0.0';
const PORT = Number(process.env.PORT || 3200);
const BRIDGE = String(process.env.WEB_BRIDGE_URL || 'http://app:3000').replace(/\/$/, '');
const KEY = process.env.WEB_BRIDGE_KEY || '';
const DIR = path.dirname(fileURLToPath(import.meta.url));
V.setVersion(crypto.createHash('sha1').update(CSS + JS + VERSION).digest('hex').slice(0, 8));

const ASSETS = Object.fromEntries(fs.readdirSync(path.join(DIR, 'assets')).filter(f => /\.(woff|png)$/.test(f)).map(f => [f, fs.readFileSync(path.join(DIR, 'assets', f))]));
const SECURITY = { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { 'Content-Type': type, ...extra }); res.end(body); };
const json = (res, status, o) => send(res, status, JSON.stringify(o), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

// Basit IP başına sınır: dakikada 30 istek, 10 dakikada 8 form gönderimi
const buckets = new Map();
function limit(ip, kind, n, ms) { const k = kind + ip; const now = Date.now(); const a = (buckets.get(k) || []).filter(x => x > now - ms); if (a.length >= n) return false; a.push(now); buckets.set(k, a); return true; }
setInterval(() => { const now = Date.now(); for (const [k, a] of buckets) if (!a.some(x => x > now - 600e3)) buckets.delete(k); }, 300e3).unref();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 16384) throw new HttpError(413, 'Çok büyük.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Geçersiz istek.'); }
}
async function readForm(req) { const chunks = []; let size = 0; for await (const c of req) { size += c.length; if (size > 4096) throw new HttpError(413, 'Çok büyük.'); chunks.push(c); } return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))); }

// Arvela OS köprüsü
async function os(method, p, body) {
  if (!KEY) throw new HttpError(503, 'Randevu sistemi şu an kapalı.');
  const r = await fetch(BRIDGE + p, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'User-Agent': 'arvela-web/' + VERSION }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
    .catch(() => { throw new HttpError(502, 'Randevu sistemine ulaşılamadı.'); });
  let j = {}; try { j = await r.json(); } catch { /* boş */ }
  if (!r.ok) throw new HttpError(r.status === 403 ? 502 : r.status, j.error || 'Randevu sistemi hata verdi.');
  return j;
}
let slotCache = { at: 0, data: null };
async function slots() { if (slotCache.data && Date.now() - slotCache.at < 20e3) return slotCache.data; const d = await os('GET', '/api/web/musait'); slotCache = { at: Date.now(), data: d }; return d; }

const clip = (s, n) => String(s ?? '').trim().slice(0, n);
function bookingBody(b) {
  const answers = b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers) ? Object.fromEntries(Object.entries(b.answers).slice(0, 12).map(([k, v]) => [clip(k, 40), clip(v, 300)])) : {};
  return { name: clip(b.name, 120), email: clip(b.email, 200), phone: clip(b.phone, 40), company: clip(b.company, 160), website: clip(b.website, 200), note: clip(b.note, 1000), date: clip(b.date, 10), time: clip(b.time, 5),
    kvkk: b.kvkk === true, iys: b.iys === true, lang: b.lang === 'en' ? 'en' : 'tr', answers, pages: (Array.isArray(b.pages) ? b.pages : []).map(x => clip(x, 80)).filter(Boolean).slice(-30), source: clip(b.source, 120) };
}

function lookup(pathname) {
  const en = pathname === '/en' || pathname.startsWith('/en/'); const t = T[en ? 'en' : 'tr']; const P = V.P[t.lang];
  const rest = pathname.replace(/\/+$/, '') || '/';
  if (rest === P.home || (en && rest === '/en')) return () => V.home(t);
  const m = en ? rest.match(/^\/en\/solutions\/([a-z-]+)$/) : rest.match(/^\/cozum\/([a-z-]+)$/);
  if (m) { const s = en ? V.slugFromEn[m[1]] : m[1]; if (SOLUTIONS.includes(s)) return () => V.solution(t, s); return null; }
  const map = { [P.match]: () => V.matchPage(t), [P.book]: () => V.bookPage(t), [P.about]: () => V.about(t), [P.kvkk]: () => V.legal(t, 'kvkk'), [P.cookies]: () => V.legal(t, 'cerez') };
  return map[rest] || null;
}

export const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://x'); const ip = ipOf(req);
  const lang = url.pathname.startsWith('/en') ? 'en' : 'tr'; const t = T[lang];
  try {
    const host = String(req.headers.host || '');
    if (host.startsWith('www.')) { res.writeHead(301, { Location: 'https://' + host.slice(4) + req.url }); return res.end(); }
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, version: VERSION, bridge: !!KEY });
    if (!limit(ip, 'r', 120, 60e3)) throw new HttpError(429, lang === 'en' ? 'Too many requests. Please wait a minute.' : 'Çok fazla istek. Lütfen bir dakika bekleyin.');
    const longCache = { 'Cache-Control': 'public, max-age=31536000, immutable' };
    if (url.pathname === '/site.css') return send(res, 200, CSS, 'text/css; charset=utf-8', longCache);
    if (url.pathname === '/site.js') return send(res, 200, JS, 'text/javascript; charset=utf-8', longCache);
    if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') return send(res, 200, V.FAVICON, 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
    if (url.pathname === '/og.png' && ASSETS['og.png']) return send(res, 200, ASSETS['og.png'], 'image/png', { 'Cache-Control': 'public, max-age=86400' });
    const am = url.pathname.match(/^\/assets\/([a-z0-9-]+\.woff)$/); if (am && ASSETS[am[1]]) return send(res, 200, ASSETS[am[1]], 'font/woff', { ...longCache, 'Access-Control-Allow-Origin': '*' });
    if (url.pathname === '/robots.txt') return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /randevu/iptal\nDisallow: /en/randevu/iptal\nSitemap: ${V.SITE}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    if (url.pathname === '/sitemap.xml') return send(res, 200, V.sitemap(), 'application/xml; charset=utf-8');

    // ---- site API (aynı köken) ----
    if (url.pathname.startsWith('/api/')) {
      const post = req.method === 'POST';
      if (post && !String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON bekleniyor.');
      if (post && req.headers.origin && req.headers.origin !== V.SITE && !process.env.WEB_ALLOW_ORIGIN) throw new HttpError(403, 'Geçersiz kaynak.');
      if (req.method === 'GET' && url.pathname === '/api/slots') { const d = await slots(); return json(res, 200, d); }
      if (req.method === 'GET' && url.pathname === '/api/route') { const p = Object.fromEntries(url.searchParams); return json(res, 200, recommend(p, p.lang === 'en' ? 'en' : 'tr')); }
      if (post && ['/api/book', '/api/lead', '/api/cancel'].includes(url.pathname)) {
        if (!limit(ip, 'f', 8, 600e3)) throw new HttpError(429, lang === 'en' ? 'Too many attempts. Please try again in a few minutes.' : 'Çok fazla deneme. Birkaç dakika sonra tekrar deneyin.');
        const b = await readJson(req); const L = b.lang === 'en' ? 'en' : 'tr';
        if (b.fax) return json(res, 201, { ok: true, day: '', time: '' }); // bal küpü: botlara başarı gibi görünür, OS'e gitmez
        if (url.pathname === '/api/cancel') { await os('POST', '/api/web/iptal', { token: clip(b.token, 60) }); return json(res, 200, { ok: true }); }
        const v = bookingBody(b);
        if (!v.kvkk) throw new HttpError(400, L === 'en' ? 'Please confirm the privacy notice.' : 'Lütfen aydınlatma metnini onaylayın.');
        if (url.pathname === '/api/lead') { await os('POST', '/api/web/talep', v); return json(res, 201, { ok: true }); }
        const r = await os('POST', '/api/web/randevu', v); slotCache = { at: 0, data: null }; return json(res, 201, r);
      }
      throw new HttpError(404, 'Bulunamadı.');
    }

    // ---- iptal bağlantısı (e-postadan) ----
    const cm = url.pathname.match(/^\/(en\/)?randevu\/iptal\/?$/);
    if (cm) {
      if (req.method === 'POST') { // JavaScript kapalıysa form doğrudan buraya gelir
        if (!limit(ip, 'f', 8, 600e3)) throw new HttpError(429, 'Çok fazla deneme.');
        const f = await readForm(req); try { await os('POST', '/api/web/iptal', { token: clip(f.t, 60) }); return send(res, 200, V.message(t, t.cancel.title, t.cancel.done)); }
        catch (e) { return send(res, e.status === 404 ? 404 : 502, V.message(t, t.cancel.title, e.status === 404 ? t.cancel.bad : t.errors.generic)); }
      }
      const tok = url.searchParams.get('t') || ''; if (!/^[A-Za-z0-9_-]{20,40}$/.test(tok)) return send(res, 400, V.message(t, t.cancel.title, t.cancel.bad));
      return send(res, 200, V.cancelPage(t, tok), undefined, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'İzin verilmeyen yöntem.');
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname.replace(/\/+$/, '') + url.search }); return res.end(); }
    const fn = lookup(url.pathname);
    if (!fn) return send(res, 404, V.message(t, t.nf.title, t.nf.text, false));
    return send(res, 200, fn(), undefined, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    const st = e.status || 500; if (st >= 500 && st !== 502 && st !== 503) console.error(e);
    if (url.pathname.startsWith('/api/')) return json(res, st, { error: e.status ? e.message : t.errors.generic });
    return send(res, st, V.message(t, t.nf.title, e.status ? e.message : t.errors.generic));
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  server.listen(PORT, () => console.log(`arvela-web ${VERSION} :${PORT}${KEY ? '' : ' (WEB_BRIDGE_KEY yok: randevu kapalı)'}`));
}
