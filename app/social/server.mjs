// Arvela Social — yapay zekâ destekli sosyal medya planlama (SaaS). Arvela OS'ten ayrı servis, ayrı veritabanı.
// Çalıştırma: node social/server.mjs (PORT, SOCIAL_DATABASE_URL). Bağımlılık yalnız "pg".
import http from 'node:http';
import { HttpError, token, safeEqual, parseCookies, cookie, readBody, esc } from './lib.mjs';
import { ensureDatabase, migrate, one, all, q } from './db.mjs';
import { CSS, authPage } from './ui.mjs';
import { CLIENT_JS } from './client.mjs';
import { limits } from './plans.mjs';

export const VERSION = '0.2.0';
const PORT = Number(process.env.PORT || 3100);
const SECURE = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 14;
const ADMINS = String(process.env.SOCIAL_ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

const routes = [];
export const route = (method, pattern, fn, { open = false } = {}) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return k === 'token' ? '([A-Za-z0-9_-]{20,80})' : '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, fn, open });
};
export const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };
export const send = (res, status, html, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { 'Content-Type': type, ...extra }); res.end(html); };
export async function audit(ctx, action, detail = {}) { await q('INSERT INTO audit (workspace_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [ctx.ws?.id || null, ctx.user?.id || null, action, detail]).catch(() => {}); }
export async function startSession(res, uid, to = '/') {
  const sid = token(); const csrfT = token(16);
  await q(`INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES ($1,$2,$3, now() + interval '${SESSION_DAYS} days')`, [sid, uid, csrfT]);
  await q('UPDATE users SET last_login=now() WHERE id=$1', [uid]);
  redirect(res, to, { 'Set-Cookie': cookie('ss', sid, SESSION_DAYS * 86400, SECURE) });
}
export const endSession = async (ctx, res) => { if (ctx.session) await q('DELETE FROM sessions WHERE id=$1', [ctx.session.id]); redirect(res, '/giris', { 'Set-Cookie': cookie('ss', '', 0, SECURE) }); };
export function need(ctx, ...roles) {
  if (!ctx.user) throw new HttpError(401, 'Giriş gerekli.');
  if (roles.length && !roles.includes(ctx.user.role)) throw new HttpError(403, 'Bu işlem için yetkiniz yok.');
}
// Yazma işlemleri: hesap kullanılabilir olmalı (deneme sürüyor ya da aktif)
export function needUsable(ctx) { if (!ctx.lim?.usable) throw new HttpError(402, 'Hesabınız salt okunur. Devam etmek için Paket sayfasından paket seçin.'); }

async function loadSession(req, ctx) {
  const sid = parseCookies(req).ss; if (!sid) return;
  const s = await one(`SELECT s.id, s.csrf, u.id uid FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at > now() AND u.active`, [sid]);
  if (!s) return;
  ctx.session = s; ctx.user = await one('SELECT id, workspace_id, email, name, role FROM users WHERE id=$1', [s.uid]);
  ctx.ws = await one('SELECT * FROM workspaces WHERE id=$1', [ctx.user.workspace_id]);
  ctx.lim = limits(ctx.ws); ctx.admin = ADMINS.includes(ctx.user.email.toLowerCase());
  ctx.brands = await all('SELECT id, name, colors, font, logo_id FROM brands WHERE workspace_id=$1 ORDER BY id', [ctx.ws.id]);
  const pick = Number(parseCookies(req).sb);
  ctx.brand = ctx.brands.find(b => b.id === pick) || ctx.brands[0] || null;
}

const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0D12"/><path d="M50 12 46 30H33z" fill="#E2BE7A"/><path d="M15 20l12 30 12-38" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SECURITY = { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };

export const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://x'); const ctx = { req, url };
  try {
    if (url.pathname === '/healthz') return send(res, 200, JSON.stringify({ ok: true, version: VERSION }), 'application/json');
    if (url.pathname === '/app.css') return send(res, 200, CSS, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
    if (url.pathname === '/app.js') return send(res, 200, CLIENT_JS, 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
    if (url.pathname === '/favicon.svg') return send(res, 200, FAVICON, 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
    await loadSession(req, ctx);
    if (req.method === 'POST') {
      ctx.body = await readBody(req); ctx.files = ctx.body.__files || []; delete ctx.body.__files;
      const r = routes.find(x => x.method === 'POST' && x.re.test(url.pathname));
      if (r?.open) { const o = req.headers.origin; const host = req.headers['x-forwarded-host'] || req.headers.host; if (o && host && new URL(o).host !== host) throw new HttpError(403, 'Geçersiz istek kaynağı.'); }
      else if (!ctx.session || !safeEqual(ctx.body.csrf || req.headers['x-csrf'] || '', ctx.session.csrf)) throw new HttpError(403, 'Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.');
    }
    for (const r of routes) {
      if (r.method !== req.method) continue; const m = url.pathname.match(r.re); if (!m) continue;
      if (!r.open && !ctx.user) return redirect(res, '/giris');
      return await r.fn(ctx, res, Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])));
    }
    throw new HttpError(404, 'Sayfa bulunamadı.');
  } catch (e) {
    const st = e instanceof HttpError ? e.status : 500; if (st === 500) console.error(e);
    if (res.headersSent) return res.end();
    if (req.headers.accept?.includes('application/json')) return send(res, st, JSON.stringify({ error: st === 500 ? 'Beklenmeyen bir hata oluştu.' : e.message }), 'application/json');
    send(res, st, authPage('Hata', `<h1>${st === 404 ? 'Bulunamadı' : 'Bir sorun var'}</h1><div class="err">${esc(st === 500 ? 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' : e.message)}</div><a class="btn ghost" href="/">Ana sayfa</a>`));
  }
});

// Rotaları yükle ve başlat
const mods = ['./auth.mjs', './brands.mjs', './posts.mjs', './media.mjs', './team.mjs', './billing.mjs', './admin.mjs', './ai.mjs', './approve.mjs', './notify.mjs'];
export async function start() {
  await ensureDatabase(); await migrate();
  for (const m of mods) (await import(m)).register();
  if (process.env.SOCIAL_REMINDERS !== '0') (await import('./notify.mjs')).startReminders();
  server.listen(PORT, () => console.log(`Arvela Social ${VERSION} :${PORT}`));
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) start().catch(e => { console.error('başlatılamadı', e); process.exit(1); });
