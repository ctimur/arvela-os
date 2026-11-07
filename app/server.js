// Arvela OS v0.1 — temel: çoklu ajans, roller, müşteriler, hizmetler, projeler, görevler, onaylar.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const VERSION = '0.2.0';
const PORT = Number(process.env.PORT || 3000);
const SETUP_TOKEN = process.env.SETUP_TOKEN || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE !== '0';
const SESSION_DAYS = 14;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = (text, params = []) => pool.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0] || null;
const all = async (text, params) => (await q(text, params)).rows;

// ---------- veritabanı ----------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS agencies (id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), name TEXT NOT NULL, sector TEXT, contact_name TEXT, phone TEXT, email TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','active','paused','churned')), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), email TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff','freelancer','client')), client_id INT REFERENCES clients(id), pass_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), last_login TIMESTAMPTZ, UNIQUE (agency_id, email));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS service_categories (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), code TEXT NOT NULL, name TEXT NOT NULL, summary TEXT, sort INT DEFAULT 0, UNIQUE (agency_id, code));
CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), category_id INT NOT NULL REFERENCES service_categories(id), code TEXT NOT NULL,
  sub TEXT, name TEXT NOT NULL, billing TEXT, unit TEXT, price_try INT, price_eur INT, availability TEXT, active BOOLEAN DEFAULT true, UNIQUE (agency_id, code));
CREATE TABLE IF NOT EXISTS client_services (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id), service_id INT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL DEFAULT 'teklif' CHECK (status IN ('teklif','kurulum','aktif','durduruldu')), start_date DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id), name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planlandi' CHECK (status IN ('planlandi','surecte','onayda','tamamlandi')), due_date DATE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), project_id INT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
  assignee_id INT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'yapilacak' CHECK (status IN ('yapilacak','yapiliyor','incelemede','bitti')), due_date DATE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS approvals (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id), project_id INT REFERENCES projects(id),
  title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor','onaylandi','reddedildi')), requested_by INT REFERENCES users(id),
  decided_by INT REFERENCES users(id), decided_at TIMESTAMPTZ, comment TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audit (id BIGSERIAL PRIMARY KEY, agency_id INT NOT NULL, user_id INT, action TEXT NOT NULL, detail JSONB, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_approvals_client ON approvals(client_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_agency ON audit(agency_id, created_at DESC);
`;

async function migrate() {
  for (let i = 0; i < 30; i++) {
    try { await q('SELECT 1'); break; } catch { await new Promise(r => setTimeout(r, 2000)); }
  }
  await q(SCHEMA);
  let agency = await one('SELECT * FROM agencies WHERE slug=$1', ['arvela']);
  if (!agency) agency = await one('INSERT INTO agencies (name, slug) VALUES ($1,$2) RETURNING *', ['Arvela', 'arvela']);
  const count = await one('SELECT count(*)::int AS n FROM services WHERE agency_id=$1', [agency.id]);
  if (count.n === 0 && fs.existsSync(new URL('./seed-catalog.json', import.meta.url))) {
    const cat = JSON.parse(fs.readFileSync(new URL('./seed-catalog.json', import.meta.url), 'utf8'));
    const ids = {};
    for (const [i, c] of cat.categories.entries()) {
      const r = await one('INSERT INTO service_categories (agency_id, code, name, summary, sort) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (agency_id, code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [agency.id, c.code, c.name, c.summary, i]);
      ids[c.code] = r.id;
    }
    for (const m of cat.modules) {
      if (!ids[m.category]) continue;
      await q('INSERT INTO services (agency_id, category_id, code, sub, name, billing, unit, price_try, price_eur, availability) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
        [agency.id, ids[m.category], m.code, m.sub, m.name, m.billing, m.unit, m.try, m.eur, m.status]);
    }
    console.log(`katalog yüklendi: ${cat.modules.length} modül`);
  }
}

// ---------- güvenlik yardımcıları ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const loginHits = new Map();
function rateLimited(ip) {
  const now = Date.now(); const win = 15 * 60 * 1000;
  const list = (loginHits.get(ip) || []).filter(t => now - t < win);
  list.push(now); loginHits.set(ip, list);
  return list.length > 10;
}
function validPassword(pw) { return typeof pw === 'string' && pw.length >= 10; }

// ---------- HTML ----------
const h = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';
const fmtMoney = (n) => n == null ? '—' : new Intl.NumberFormat('tr-TR').format(n);
const ROLE = { admin: 'Yönetici', staff: 'Çalışan', freelancer: 'Freelancer', client: 'Müşteri' };
const CLIENT_ST = { lead: 'Aday', active: 'Aktif', paused: 'Duraklatıldı', churned: 'Ayrıldı' };
const CS_ST = { teklif: 'Teklifte', kurulum: 'Kurulumda', aktif: 'Aktif', durduruldu: 'Durduruldu' };
const PR_ST = { planlandi: 'Planlandı', surecte: 'Süreçte', onayda: 'Onayda', tamamlandi: 'Tamamlandı' };
const TK_ST = { yapilacak: 'Yapılacak', yapiliyor: 'Yapılıyor', incelemede: 'İncelemede', bitti: 'Bitti' };
const AP_ST = { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Düzeltme istendi' };
const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${h(v)}</option>`).join('');
const badge = (txt, tone = '') => `<span class="badge ${tone}">${h(txt)}</span>`;

const CSS = `
:root{--night:#0B0D12;--ink:#141A22;--graphite:#2A2F38;--gold:#B08433;--champ:#E2BE7A;--champ-l:#F3E6CC;--stone:#6B6558;--paper:#F7F4EE;--line:#E3DDD0}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.5}
a{color:#7A5A1E}a:hover{color:var(--ink)}h1,h2,h3{font-family:Poppins,Inter,sans-serif;font-weight:500;margin:0}
h1{font-size:28px}h2{font-size:20px}h3{font-size:16px}
.top{background:var(--night);color:#fff}.top .in{max-width:1200px;margin:0 auto;padding:14px 24px;display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between}
.brand{font-family:Poppins,sans-serif;font-size:20px;font-weight:500;color:#fff;text-decoration:none;letter-spacing:.5px}.brand span{color:var(--champ);font-size:12px;letter-spacing:3px;margin-left:8px}
.nav{display:flex;flex-wrap:wrap;gap:4px 18px}.nav a{color:#D5DAE2;text-decoration:none;font-size:14px;padding:6px 0}.nav a:hover,.nav a.on{color:var(--champ)}
.who{display:flex;gap:12px;align-items:center;font-size:13px;color:#A3ABB8}
main{max-width:1200px;margin:0 auto;padding:28px 24px 64px;display:flex;flex-direction:column;gap:24px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px}
.stat{font-family:Poppins,sans-serif;font-size:34px;font-weight:500}.muted{color:var(--stone);font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:var(--stone);background:#FBF9F5}
.tbl{overflow-x:auto}
form.inline{display:inline}form.stack{display:flex;flex-direction:column;gap:10px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}
input,select,textarea{font:inherit;padding:9px 11px;border:1px solid #CFC8BA;border-radius:9px;background:#fff;min-height:40px}
button,.btn{font:inherit;font-weight:600;border:0;border-radius:9px;padding:10px 16px;background:var(--ink);color:#fff;cursor:pointer;text-decoration:none;display:inline-block;min-height:40px}
button.gold,.btn.gold{background:var(--champ);color:var(--night)}button.ghost{background:transparent;color:var(--ink);border:1px solid #CFC8BA}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:#EEE9DF;color:#4A4538}
.badge.ok{background:#E3EFE4;color:#24502B}.badge.warn{background:#F7E9CF;color:#6B4A0F}.badge.bad{background:#F6E1DE;color:#7A2418}
.flash{background:var(--champ-l);border:1px solid var(--champ);padding:12px 16px;border-radius:10px}
.err{background:#F6E1DE;border:1px solid #E2B1A9;padding:12px 16px;border-radius:10px;color:#7A2418}
.auth{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--night);padding:24px}
.auth .card{width:100%;max-width:400px}
details summary{cursor:pointer;font-weight:600}
`;

function layout(ctx, title, body, active = '') {
  const u = ctx.user;
  const links = !u ? [] :
    u.role === 'client' ? [['/portal', 'Portalım'], ['/portal/siteler', 'Sitelerim']] :
    u.role === 'freelancer' ? [['/gorevler', 'Görevlerim']] :
    [['/panel', 'Panel'], ['/musteriler', 'Müşteriler'], ['/siteler', 'Siteler'], ['/projeler', 'Projeler'], ['/gorevler', 'Görevlerim'], ['/onaylar', 'Onaylar'], ['/katalog', 'Katalog'], ...(u.role === 'admin' ? [['/ekip', 'Ekip'], ['/kayitlar', 'Kayıtlar']] : [])];
  const nav = links.map(([href, t]) => `<a href="${href}"${active === href ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('');
  const flash = ctx.flash ? `<div class="flash" role="status">${h(ctx.flash)}</div>` : '';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(title)} · Arvela OS</title><link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Poppins:wght@500&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="/">Arvela<span>OS</span></a><nav class="nav" aria-label="Ana menü">${nav}</nav>
${u ? `<div class="who">${h(u.name)} · ${ROLE[u.role]}<form class="inline" method="post" action="/cikis">${csrfField(ctx)}<button class="ghost" style="color:#fff;border-color:#2A2F38;padding:6px 12px;min-height:32px">Çıkış</button></form></div>` : ''}
</div></header><main>${flash}${body}</main></body></html>`;
}
const csrfField = (ctx) => ctx.session ? `<input type="hidden" name="csrf" value="${h(ctx.session.csrf)}">` : '';

function authPage(title, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)} · Arvela OS</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Poppins:wght@500&display=swap" rel="stylesheet"><style>${CSS}</style></head>
<body><div class="auth"><div class="card"><p class="brand" style="color:var(--ink);margin:0">Arvela<span>OS</span></p>${body}</div></div></body></html>`;
}

// ---------- istek altyapısı ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.setEncoding('utf8');
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
    req.on('error', reject);
  });
}
function send(res, status, html, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'",
    ...headers,
  });
  res.end(html);
}
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };
const cookie = (name, val, maxAgeSec) => `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${COOKIE_SECURE ? '; Secure' : ''}`;

async function loadSession(req) {
  const sid = parseCookies(req).sid; if (!sid) return {};
  const row = await one(`SELECT s.id sid, s.csrf, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active`, [sid]);
  if (!row) return {};
  const { sid: id, csrf, pass_hash, ...user } = row;
  return { session: { id, csrf }, user };
}
async function audit(ctx, action, detail = {}) {
  await q('INSERT INTO audit (agency_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [ctx.user.agency_id, ctx.user.id, action, detail]);
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const need = (ctx, ...roles) => { if (!ctx.user) throw new HttpError(401); if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'Bu sayfaya erişim yetkiniz yok.'); };
const STAFF = ['admin', 'staff'];
const int = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const nn = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// ---------- rotalar ----------
const routes = [];
const route = (method, pattern, fn) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, fn });
};

route('GET', '/healthz', async (ctx, res) => { await q('SELECT 1'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, version: VERSION })); });

route('GET', '/', async (ctx, res) => {
  if (!ctx.user) return redirect(res, (await usersExist()) ? '/giris' : '/kurulum');
  redirect(res, ctx.user.role === 'client' ? '/portal' : ctx.user.role === 'freelancer' ? '/gorevler' : '/panel');
});

const usersExist = async () => (await one('SELECT count(*)::int n FROM users')).n > 0;

route('GET', '/kurulum', async (ctx, res) => {
  if (await usersExist()) return redirect(res, '/giris');
  send(res, 200, authPage('Kurulum', `<h1>İlk kurulum</h1><p class="muted">Yönetici hesabını oluşturun. Kurulum anahtarı sunucu ayarlarındadır; bir kez kullanılır.</p>
<form class="stack" method="post" action="/kurulum"><label>Kurulum anahtarı<input name="token" required autocomplete="off"></label>
<label>Ad soyad<input name="name" required></label><label>E-posta<input type="email" name="email" required></label>
<label>Şifre (en az 10 karakter)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label><button class="gold">Hesabı oluştur</button></form>`));
});
route('POST', '/kurulum', async (ctx, res) => {
  if (await usersExist()) return redirect(res, '/giris');
  const b = ctx.body;
  if (!SETUP_TOKEN || !safeEqual(b.token || '', SETUP_TOKEN)) return send(res, 403, authPage('Kurulum', `<div class="err">Kurulum anahtarı hatalı.</div><a href="/kurulum">Geri dön</a>`));
  if (!validPassword(b.password) || !nn(b.email) || !nn(b.name)) return send(res, 400, authPage('Kurulum', `<div class="err">Bilgiler eksik ya da şifre çok kısa.</div><a href="/kurulum">Geri dön</a>`));
  const ag = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']);
  await q('INSERT INTO users (agency_id, email, name, role, pass_hash) VALUES ($1,lower($2),$3,$4,$5)', [ag.id, b.email.trim(), b.name.trim(), 'admin', hashPassword(b.password)]);
  redirect(res, '/giris?ok=1');
});

route('GET', '/giris', async (ctx, res) => {
  if (ctx.user) return redirect(res, '/');
  const ok = ctx.url.searchParams.get('ok') ? '<div class="flash">Hesap oluşturuldu. Giriş yapabilirsiniz.</div>' : '';
  send(res, 200, authPage('Giriş', `<h1>Giriş</h1>${ok}<form class="stack" method="post" action="/giris">
<label>E-posta<input type="email" name="email" required autocomplete="username"></label><label>Şifre<input type="password" name="password" required autocomplete="current-password"></label>
<button class="gold">Giriş yap</button></form>`));
});
route('POST', '/giris', async (ctx, res) => {
  const ip = ctx.req.headers['x-forwarded-for']?.split(',')[0].trim() || ctx.req.socket.remoteAddress;
  if (rateLimited(ip)) return send(res, 429, authPage('Giriş', `<div class="err">Çok fazla deneme. 15 dakika sonra tekrar deneyin.</div>`));
  const u = await one('SELECT * FROM users WHERE lower(email)=lower($1) AND active', [ctx.body.email || '']);
  if (!u || !checkPassword(ctx.body.password || '', u.pass_hash)) return send(res, 401, authPage('Giriş', `<div class="err">E-posta ya da şifre hatalı.</div><a href="/giris">Tekrar dene</a>`));
  const sid = token(); const csrf = token(16);
  await q(`INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES ($1,$2,$3, now() + interval '${SESSION_DAYS} days')`, [sid, u.id, csrf]);
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  await q('DELETE FROM sessions WHERE expires_at < now()');
  redirect(res, '/', { 'Set-Cookie': cookie('sid', sid, SESSION_DAYS * 86400) });
});
route('POST', '/cikis', async (ctx, res) => {
  if (ctx.session) await q('DELETE FROM sessions WHERE id=$1', [ctx.session.id]);
  redirect(res, '/giris', { 'Set-Cookie': cookie('sid', '', 0) });
});

// ----- panel -----
route('GET', '/panel', async (ctx, res) => {
  need(ctx, ...STAFF); const a = ctx.user.agency_id;
  const s = await one(`SELECT
    (SELECT count(*) FROM clients WHERE agency_id=$1 AND status='active')::int clients,
    (SELECT count(*) FROM clients WHERE agency_id=$1 AND status='lead')::int leads,
    (SELECT count(*) FROM tasks WHERE agency_id=$1 AND status<>'bitti')::int tasks,
    (SELECT count(*) FROM approvals WHERE agency_id=$1 AND status='bekliyor')::int approvals,
    (SELECT count(*) FROM client_services WHERE agency_id=$1 AND status='aktif')::int services`, [a]);
  const mine = await all(`SELECT t.*, p.name project, c.name client FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id
    WHERE t.agency_id=$1 AND t.assignee_id=$2 AND t.status<>'bitti' ORDER BY t.due_date NULLS LAST LIMIT 8`, [a, ctx.user.id]);
  const pend = await all(`SELECT ap.*, c.name client FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 AND ap.status='bekliyor' ORDER BY ap.created_at LIMIT 8`, [a]);
  const stat = (n, t, href) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit"><span class="muted">${t}</span><span class="stat">${n}</span></a>`;
  send(res, 200, layout(ctx, 'Panel', `<h1>Günaydın, ${h(ctx.user.name.split(' ')[0])}</h1>
<div class="grid">${stat(s.clients, 'Aktif müşteri', '/musteriler')}${stat(s.leads, 'Aday', '/musteriler')}${stat(s.services, 'Aktif hizmet', '/musteriler')}${stat(s.tasks, 'Açık görev', '/projeler')}${stat(s.approvals, 'Onay bekleyen', '/onaylar')}</div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
<section class="card"><h2>Bana atanan görevler</h2>${mine.length ? `<div class="tbl"><table><tr><th>Görev</th><th>Müşteri</th><th>Teslim</th></tr>${mine.map(t => `<tr><td><a href="/projeler/${t.project_id}">${h(t.title)}</a></td><td>${h(t.client)}</td><td>${fmtDate(t.due_date)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Açık görev yok.</p>'}</section>
<section class="card"><h2>Müşteri onayı bekleyenler</h2>${pend.length ? `<div class="tbl"><table><tr><th>Konu</th><th>Müşteri</th><th>Gönderildi</th></tr>${pend.map(p => `<tr><td>${h(p.title)}</td><td><a href="/musteriler/${p.client_id}">${h(p.client)}</a></td><td>${fmtDate(p.created_at)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Bekleyen onay yok.</p>'}</section>
</div>`, '/panel'));
});

// ----- müşteriler -----
route('GET', '/musteriler', async (ctx, res) => {
  need(ctx, ...STAFF);
  const rows = await all(`SELECT c.*, (SELECT count(*) FROM client_services cs WHERE cs.client_id=c.id AND cs.status='aktif')::int svc,
    (SELECT count(*) FROM projects p WHERE p.client_id=c.id AND p.status<>'tamamlandi')::int prj FROM clients c WHERE c.agency_id=$1 ORDER BY c.status, c.name`, [ctx.user.agency_id]);
  const tone = { active: 'ok', lead: 'warn', paused: '', churned: 'bad' };
  send(res, 200, layout(ctx, 'Müşteriler', `<div class="row" style="justify-content:space-between"><h1>Müşteriler</h1></div>
<details class="card"><summary>Yeni müşteri ekle</summary><form class="stack" method="post" action="/musteriler">${csrfField(ctx)}
<div class="row"><label>Firma adı<input name="name" required></label><label>Sektör<input name="sector" placeholder="Emlak, e-ticaret…"></label><label>Durum<select name="status">${opts(CLIENT_ST, 'lead')}</select></label></div>
<div class="row"><label>Yetkili<input name="contact_name"></label><label>Telefon<input name="phone"></label><label>E-posta<input type="email" name="email"></label></div>
<label>Not<textarea name="notes" rows="2"></textarea></label><div><button class="gold">Kaydet</button></div></form></details>
<div class="tbl"><table><tr><th>Firma</th><th>Sektör</th><th>Durum</th><th>Aktif hizmet</th><th>Açık proje</th><th>Yetkili</th></tr>
${rows.map(c => `<tr><td><a href="/musteriler/${c.id}">${h(c.name)}</a></td><td>${h(c.sector || '—')}</td><td>${badge(CLIENT_ST[c.status], tone[c.status])}</td><td>${c.svc}</td><td>${c.prj}</td><td>${h(c.contact_name || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Henüz müşteri yok.</td></tr>'}
</table></div>`, '/musteriler'));
});
route('POST', '/musteriler', async (ctx, res) => {
  need(ctx, ...STAFF); const b = ctx.body;
  if (!nn(b.name)) throw new HttpError(400, 'Firma adı gerekli.');
  const r = await one(`INSERT INTO clients (agency_id, name, sector, contact_name, phone, email, notes, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ctx.user.agency_id, nn(b.name), nn(b.sector), nn(b.contact_name), nn(b.phone), nn(b.email), nn(b.notes), CLIENT_ST[b.status] ? b.status : 'lead']);
  await audit(ctx, 'client.create', { id: r.id, name: b.name });
  redirect(res, `/musteriler/${r.id}`);
});
async function clientFor(ctx, id) {
  const c = await one('SELECT * FROM clients WHERE id=$1 AND agency_id=$2', [id, ctx.user.agency_id]);
  if (!c) throw new HttpError(404, 'Müşteri bulunamadı.'); return c;
}
route('GET', '/musteriler/:id', async (ctx, res, p) => {
  need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id)); const a = ctx.user.agency_id;
  const svcs = await all(`SELECT cs.*, s.code, s.name, s.billing FROM client_services cs JOIN services s ON s.id=cs.service_id WHERE cs.client_id=$1 ORDER BY cs.created_at`, [c.id]);
  const prjs = await all(`SELECT p.*, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int total, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done FROM projects p WHERE p.client_id=$1 ORDER BY p.created_at DESC`, [c.id]);
  const aps = await all('SELECT * FROM approvals WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20', [c.id]);
  const cu = await all(`SELECT id, name, email, last_login, active FROM users WHERE client_id=$1 AND role='client'`, [c.id]);
  const catalog = await all(`SELECT s.id, s.code, s.name, sc.name cat FROM services s JOIN service_categories sc ON sc.id=s.category_id WHERE s.agency_id=$1 AND s.active ORDER BY sc.sort, s.code`, [a]);
  const f = csrfField(ctx);
  send(res, 200, layout(ctx, c.name, `<div><a href="/musteriler">← Müşteriler</a></div>
<div class="row" style="justify-content:space-between"><h1>${h(c.name)}</h1>${badge(CLIENT_ST[c.status])}</div>
<details class="card"><summary>Firma bilgileri</summary><form class="stack" method="post" action="/musteriler/${c.id}">${f}
<div class="row"><label>Firma adı<input name="name" value="${h(c.name)}" required></label><label>Sektör<input name="sector" value="${h(c.sector)}"></label><label>Durum<select name="status">${opts(CLIENT_ST, c.status)}</select></label></div>
<div class="row"><label>Yetkili<input name="contact_name" value="${h(c.contact_name)}"></label><label>Telefon<input name="phone" value="${h(c.phone)}"></label><label>E-posta<input type="email" name="email" value="${h(c.email)}"></label></div>
<label>Not<textarea name="notes" rows="3">${h(c.notes)}</textarea></label><div><button>Güncelle</button></div></form></details>

<section class="card"><h2>Hizmetler</h2>
${svcs.length ? `<div class="tbl"><table><tr><th>Modül</th><th>Faturalama</th><th>Durum</th><th>Başlangıç</th><th></th></tr>${svcs.map(s => `<tr><td>${h(s.code)} · ${h(s.name)}</td><td>${h(s.billing)}</td>
<td><form class="row" method="post" action="/hizmet/${s.id}">${f}<select name="status" aria-label="Durum">${opts(CS_ST, s.status)}</select><button class="ghost">Kaydet</button></form></td><td>${fmtDate(s.start_date)}</td><td></td></tr>`).join('')}</table></div>` : '<p class="muted">Bu müşteriye henüz hizmet eklenmedi.</p>'}
<form class="row" method="post" action="/musteriler/${c.id}/hizmet">${f}<label style="flex:1;min-width:260px">Katalogdan modül<select name="service_id" required>${catalog.map(s => `<option value="${s.id}">${h(s.cat)} — ${h(s.code)} ${h(s.name)}</option>`).join('')}</select></label>
<label>Durum<select name="status">${opts(CS_ST, 'teklif')}</select></label><label>Başlangıç<input type="date" name="start_date"></label><button class="gold">Ekle</button></form></section>

<section class="card"><h2>Projeler</h2>
${prjs.length ? `<div class="tbl"><table><tr><th>Proje</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>${prjs.map(p => `<tr><td><a href="/projeler/${p.id}">${h(p.name)}</a></td><td>${badge(PR_ST[p.status])}</td><td>${p.done}/${p.total}</td><td>${fmtDate(p.due_date)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Proje yok.</p>'}
<form class="row" method="post" action="/musteriler/${c.id}/proje">${f}<label style="flex:1;min-width:240px">Proje adı<input name="name" required></label><label>Teslim<input type="date" name="due_date"></label><button class="gold">Proje aç</button></form></section>

<section class="card"><h2>Onaylar</h2>
${aps.length ? `<div class="tbl"><table><tr><th>Konu</th><th>Durum</th><th>Müşteri notu</th><th>Tarih</th></tr>${aps.map(x => `<tr><td>${h(x.title)}</td><td>${badge(AP_ST[x.status], x.status === 'onaylandi' ? 'ok' : x.status === 'reddedildi' ? 'bad' : 'warn')}</td><td>${h(x.comment || '—')}</td><td>${fmtDate(x.decided_at || x.created_at)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz onay istenmedi.</p>'}
<form class="stack" method="post" action="/musteriler/${c.id}/onay">${f}<div class="row"><label style="flex:1;min-width:240px">Konu<input name="title" required placeholder="Kasım gönderi takvimi"></label>
<label>Proje<select name="project_id"><option value="">—</option>${prjs.map(p => `<option value="${p.id}">${h(p.name)}</option>`).join('')}</select></label></div>
<label>Açıklama ya da bağlantı<textarea name="body" rows="2"></textarea></label><div><button class="gold">Onaya gönder</button></div></form></section>

<section class="card"><h2>Portal kullanıcıları</h2>
${cu.length ? `<div class="tbl"><table><tr><th>Ad</th><th>E-posta</th><th>Son giriş</th></tr>${cu.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.email)}</td><td>${fmtDate(x.last_login)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Müşteri henüz portala davet edilmedi.</p>'}
${ctx.user.role === 'admin' ? `<form class="row" method="post" action="/ekip">${f}<input type="hidden" name="role" value="client"><input type="hidden" name="client_id" value="${c.id}">
<label>Ad soyad<input name="name" required></label><label>E-posta<input type="email" name="email" required></label><label>İlk şifre<input name="password" required minlength="10" autocomplete="off"></label><button class="gold">Portal hesabı aç</button></form>` : ''}</section>`, '/musteriler'));
});
route('POST', '/musteriler/:id', async (ctx, res, p) => {
  need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id)); const b = ctx.body;
  await q('UPDATE clients SET name=$1, sector=$2, contact_name=$3, phone=$4, email=$5, notes=$6, status=$7 WHERE id=$8',
    [nn(b.name) || c.name, nn(b.sector), nn(b.contact_name), nn(b.phone), nn(b.email), nn(b.notes), CLIENT_ST[b.status] ? b.status : c.status, c.id]);
  await audit(ctx, 'client.update', { id: c.id }); redirect(res, `/musteriler/${c.id}`);
});
route('POST', '/musteriler/:id/hizmet', async (ctx, res, p) => {
  need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id));
  const s = await one('SELECT id, code FROM services WHERE id=$1 AND agency_id=$2', [int(ctx.body.service_id), ctx.user.agency_id]);
  if (!s) throw new HttpError(400, 'Modül bulunamadı.');
  await q('INSERT INTO client_services (agency_id, client_id, service_id, status, start_date) VALUES ($1,$2,$3,$4,$5)',
    [ctx.user.agency_id, c.id, s.id, CS_ST[ctx.body.status] ? ctx.body.status : 'teklif', nn(ctx.body.start_date)]);
  await audit(ctx, 'client_service.add', { client: c.id, service: s.code }); redirect(res, `/musteriler/${c.id}`);
});
route('POST', '/hizmet/:id', async (ctx, res, p) => {
  need(ctx, ...STAFF);
  const cs = await one('SELECT * FROM client_services WHERE id=$1 AND agency_id=$2', [int(p.id), ctx.user.agency_id]);
  if (!cs) throw new HttpError(404, 'Kayıt bulunamadı.');
  const st = CS_ST[ctx.body.status] ? ctx.body.status : cs.status;
  await q(`UPDATE client_services SET status=$1, start_date=COALESCE(start_date, CASE WHEN $1='aktif' THEN CURRENT_DATE END) WHERE id=$2`, [st, cs.id]);
  await audit(ctx, 'client_service.status', { id: cs.id, status: st }); redirect(res, `/musteriler/${cs.client_id}`);
});
route('POST', '/musteriler/:id/proje', async (ctx, res, p) => {
  need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id));
  if (!nn(ctx.body.name)) throw new HttpError(400, 'Proje adı gerekli.');
  const r = await one('INSERT INTO projects (agency_id, client_id, name, due_date) VALUES ($1,$2,$3,$4) RETURNING id', [ctx.user.agency_id, c.id, nn(ctx.body.name), nn(ctx.body.due_date)]);
  await audit(ctx, 'project.create', { id: r.id, client: c.id }); redirect(res, `/projeler/${r.id}`);
});
route('POST', '/musteriler/:id/onay', async (ctx, res, p) => {
  need(ctx, ...STAFF); const c = await clientFor(ctx, int(p.id)); const b = ctx.body;
  if (!nn(b.title)) throw new HttpError(400, 'Konu gerekli.');
  let pid = int(b.project_id);
  if (pid && !(await one('SELECT 1 FROM projects WHERE id=$1 AND client_id=$2', [pid, c.id]))) pid = null;
  const r = await one('INSERT INTO approvals (agency_id, client_id, project_id, title, body, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [ctx.user.agency_id, c.id, pid, nn(b.title), nn(b.body), ctx.user.id]);
  await audit(ctx, 'approval.request', { id: r.id, client: c.id }); redirect(res, `/musteriler/${c.id}`);
});

// ----- projeler ve görevler -----
route('GET', '/projeler', async (ctx, res) => {
  need(ctx, ...STAFF);
  const rows = await all(`SELECT p.*, c.name client, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int total, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.agency_id=$1 ORDER BY (p.status='tamamlandi'), p.due_date NULLS LAST`, [ctx.user.agency_id]);
  send(res, 200, layout(ctx, 'Projeler', `<h1>Projeler</h1><p class="muted">Yeni proje müşteri sayfasından açılır.</p>
<div class="tbl"><table><tr><th>Proje</th><th>Müşteri</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>
${rows.map(p => `<tr><td><a href="/projeler/${p.id}">${h(p.name)}</a></td><td>${h(p.client)}</td><td>${badge(PR_ST[p.status])}</td><td>${p.done}/${p.total}</td><td>${fmtDate(p.due_date)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Proje yok.</td></tr>'}</table></div>`, '/projeler'));
});
async function projectFor(ctx, id) {
  const p = await one('SELECT p.*, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND p.agency_id=$2', [id, ctx.user.agency_id]);
  if (!p) throw new HttpError(404, 'Proje bulunamadı.'); return p;
}
route('GET', '/projeler/:id', async (ctx, res, prm) => {
  need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id));
  const tasks = await all('SELECT t.*, u.name assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=$1 ORDER BY (t.status=\'bitti\'), t.due_date NULLS LAST, t.id', [p.id]);
  const people = await all(`SELECT id, name, role FROM users WHERE agency_id=$1 AND active AND role IN ('admin','staff','freelancer') ORDER BY name`, [ctx.user.agency_id]);
  const f = csrfField(ctx);
  send(res, 200, layout(ctx, p.name, `<div><a href="/musteriler/${p.client_id}">← ${h(p.client)}</a></div>
<div class="row" style="justify-content:space-between"><h1>${h(p.name)}</h1>
<form class="row" method="post" action="/projeler/${p.id}">${f}<select name="status" aria-label="Proje durumu">${opts(PR_ST, p.status)}</select><input type="date" name="due_date" value="${p.due_date ? new Date(p.due_date).toISOString().slice(0, 10) : ''}" aria-label="Teslim tarihi"><button class="ghost">Kaydet</button></form></div>
<section class="card"><h2>Görevler</h2>
${tasks.length ? `<div class="tbl"><table><tr><th>Görev</th><th>Sorumlu</th><th>Teslim</th><th>Durum</th></tr>${tasks.map(t => `<tr><td>${h(t.title)}</td><td>${h(t.assignee || '—')}</td><td>${fmtDate(t.due_date)}</td>
<td><form class="row" method="post" action="/gorev/${t.id}">${f}<select name="status" aria-label="Görev durumu">${opts(TK_ST, t.status)}</select><button class="ghost">Kaydet</button></form></td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz görev yok.</p>'}
<form class="row" method="post" action="/projeler/${p.id}/gorev">${f}<label style="flex:1;min-width:240px">Görev<input name="title" required></label>
<label>Sorumlu<select name="assignee_id"><option value="">—</option>${people.map(u => `<option value="${u.id}">${h(u.name)} (${ROLE[u.role]})</option>`).join('')}</select></label>
<label>Teslim<input type="date" name="due_date"></label><button class="gold">Ekle</button></form></section>`, '/projeler'));
});
route('POST', '/projeler/:id', async (ctx, res, prm) => {
  need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id));
  await q('UPDATE projects SET status=$1, due_date=$2 WHERE id=$3', [PR_ST[ctx.body.status] ? ctx.body.status : p.status, nn(ctx.body.due_date), p.id]);
  await audit(ctx, 'project.update', { id: p.id }); redirect(res, `/projeler/${p.id}`);
});
route('POST', '/projeler/:id/gorev', async (ctx, res, prm) => {
  need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id));
  if (!nn(ctx.body.title)) throw new HttpError(400, 'Görev adı gerekli.');
  let aid = int(ctx.body.assignee_id);
  if (aid && !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role<>'client'`, [aid, ctx.user.agency_id]))) aid = null;
  const r = await one('INSERT INTO tasks (agency_id, project_id, title, assignee_id, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id', [ctx.user.agency_id, p.id, nn(ctx.body.title), aid, nn(ctx.body.due_date)]);
  await audit(ctx, 'task.create', { id: r.id, project: p.id }); redirect(res, `/projeler/${p.id}`);
});
route('POST', '/gorev/:id', async (ctx, res, prm) => {
  need(ctx, 'admin', 'staff', 'freelancer');
  const t = await one('SELECT * FROM tasks WHERE id=$1 AND agency_id=$2', [int(prm.id), ctx.user.agency_id]);
  if (!t) throw new HttpError(404, 'Görev bulunamadı.');
  if (ctx.user.role === 'freelancer' && t.assignee_id !== ctx.user.id) throw new HttpError(403, 'Bu görev size atanmamış.');
  const st = TK_ST[ctx.body.status] ? ctx.body.status : t.status;
  await q('UPDATE tasks SET status=$1 WHERE id=$2', [st, t.id]);
  await audit(ctx, 'task.status', { id: t.id, status: st });
  redirect(res, ctx.user.role === 'freelancer' || ctx.body.back === 'mine' ? '/gorevler' : `/projeler/${t.project_id}`);
});
route('GET', '/gorevler', async (ctx, res) => {
  need(ctx, 'admin', 'staff', 'freelancer');
  const fl = ctx.user.role === 'freelancer';
  const rows = await all(`SELECT t.*, p.name project${fl ? '' : ', c.name client'} FROM tasks t JOIN projects p ON p.id=t.project_id ${fl ? '' : 'JOIN clients c ON c.id=p.client_id'}
    WHERE t.agency_id=$1 AND t.assignee_id=$2 ORDER BY (t.status='bitti'), t.due_date NULLS LAST`, [ctx.user.agency_id, ctx.user.id]);
  const f = csrfField(ctx);
  send(res, 200, layout(ctx, 'Görevlerim', `<h1>Görevlerim</h1>
<div class="tbl"><table><tr><th>Görev</th><th>Proje</th>${fl ? '' : '<th>Müşteri</th>'}<th>Teslim</th><th>Durum</th></tr>
${rows.map(t => `<tr><td>${h(t.title)}</td><td>${fl ? h(t.project) : `<a href="/projeler/${t.project_id}">${h(t.project)}</a>`}</td>${fl ? '' : `<td>${h(t.client)}</td>`}<td>${fmtDate(t.due_date)}</td>
<td><form class="row" method="post" action="/gorev/${t.id}">${f}<input type="hidden" name="back" value="mine"><select name="status" aria-label="Görev durumu">${opts(TK_ST, t.status)}</select><button class="ghost">Kaydet</button></form></td></tr>`).join('') || `<tr><td colspan="${fl ? 4 : 5}" class="muted">Size atanmış görev yok.</td></tr>`}</table></div>`, '/gorevler'));
});

// ----- onaylar (ajans) -----
route('GET', '/onaylar', async (ctx, res) => {
  need(ctx, ...STAFF);
  const rows = await all(`SELECT ap.*, c.name client FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 ORDER BY (ap.status<>'bekliyor'), ap.created_at DESC LIMIT 200`, [ctx.user.agency_id]);
  send(res, 200, layout(ctx, 'Onaylar', `<h1>Onaylar</h1><p class="muted">Müşteriye onay isteği müşteri sayfasından gönderilir; müşteri portalından onaylar ya da düzeltme ister.</p>
<div class="tbl"><table><tr><th>Konu</th><th>Müşteri</th><th>Durum</th><th>Müşteri notu</th><th>Tarih</th></tr>
${rows.map(x => `<tr><td>${h(x.title)}</td><td><a href="/musteriler/${x.client_id}">${h(x.client)}</a></td><td>${badge(AP_ST[x.status], x.status === 'onaylandi' ? 'ok' : x.status === 'reddedildi' ? 'bad' : 'warn')}</td><td>${h(x.comment || '—')}</td><td>${fmtDate(x.decided_at || x.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Onay kaydı yok.</td></tr>'}</table></div>`, '/onaylar'));
});

// ----- katalog -----
route('GET', '/katalog', async (ctx, res) => {
  need(ctx, ...STAFF);
  const cats = await all('SELECT * FROM service_categories WHERE agency_id=$1 ORDER BY sort', [ctx.user.agency_id]);
  const svcs = await all('SELECT * FROM services WHERE agency_id=$1 ORDER BY code', [ctx.user.agency_id]);
  const showPrice = ctx.user.role === 'admin';
  send(res, 200, layout(ctx, 'Katalog', `<h1>Hizmet kataloğu</h1><p class="muted">${svcs.length} modül · ${cats.length} kategori${showPrice ? ' · fiyatlar KDV hariç, yalnızca yöneticiye görünür' : ''}</p>
${cats.map(c => `<details class="card"><summary>${h(c.name)} <span class="muted">(${svcs.filter(s => s.category_id === c.id).length})</span></summary><p class="muted">${h(c.summary)}</p>
<div class="tbl"><table><tr><th>Kod</th><th>Modül</th><th>Alt grup</th><th>Faturalama</th>${showPrice ? '<th>TL</th><th>EUR</th>' : ''}<th>Durum</th></tr>
${svcs.filter(s => s.category_id === c.id).map(s => `<tr><td>${h(s.code)}</td><td>${h(s.name)}</td><td>${h(s.sub)}</td><td>${h(s.billing)}</td>${showPrice ? `<td>${fmtMoney(s.price_try)}</td><td>${fmtMoney(s.price_eur)}</td>` : ''}<td>${h(s.availability)}</td></tr>`).join('')}</table></div></details>`).join('')}`, '/katalog'));
});

// ----- ekip -----
route('GET', '/ekip', async (ctx, res) => {
  need(ctx, 'admin');
  const rows = await all(`SELECT u.*, c.name client FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.agency_id=$1 ORDER BY u.role, u.name`, [ctx.user.agency_id]);
  const f = csrfField(ctx);
  send(res, 200, layout(ctx, 'Ekip', `<h1>Ekip ve erişim</h1>
<div class="grid"><div class="card"><h3>Yönetici</h3><p class="muted">Her şeyi görür; fiyatları, ekibi ve kayıtları yönetir.</p></div><div class="card"><h3>Çalışan</h3><p class="muted">Müşteri, proje, görev ve onayları yönetir; fiyatları ve ekibi göremez.</p></div>
<div class="card"><h3>Freelancer</h3><p class="muted">Yalnızca kendisine atanan görevleri görür ve günceller.</p></div><div class="card"><h3>Müşteri</h3><p class="muted">Yalnızca kendi hizmetlerini, projelerini ve onaylarını görür.</p></div></div>
<details class="card"><summary>Ekip üyesi ekle</summary><form class="row" method="post" action="/ekip">${f}<label>Ad soyad<input name="name" required></label><label>E-posta<input type="email" name="email" required></label>
<label>Rol<select name="role"><option value="staff">Çalışan</option><option value="freelancer">Freelancer</option><option value="admin">Yönetici</option></select></label>
<label>İlk şifre<input name="password" required minlength="10" autocomplete="off"></label><button class="gold">Ekle</button></form><p class="muted">Müşteri hesapları müşteri sayfasından açılır.</p></details>
<div class="tbl"><table><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Firma</th><th>Son giriş</th><th></th></tr>
${rows.map(u => `<tr><td>${h(u.name)}</td><td>${h(u.email)}</td><td>${ROLE[u.role]}</td><td>${h(u.client || '—')}</td><td>${fmtDate(u.last_login)}</td>
<td>${u.id === ctx.user.id ? '<span class="muted">Siz</span>' : `<form class="inline" method="post" action="/ekip/${u.id}/durum">${f}<button class="ghost">${u.active ? 'Erişimi kapat' : 'Erişimi aç'}</button></form>`}</td></tr>`).join('')}</table></div>`, '/ekip'));
});
route('POST', '/ekip', async (ctx, res) => {
  need(ctx, 'admin'); const b = ctx.body;
  if (!ROLE[b.role]) throw new HttpError(400, 'Rol geçersiz.');
  if (!nn(b.name) || !nn(b.email) || !validPassword(b.password)) throw new HttpError(400, 'Ad, e-posta ve en az 10 karakterlik şifre gerekli.');
  let clientId = null;
  if (b.role === 'client') { clientId = (await clientFor(ctx, int(b.client_id))).id; }
  try {
    await q('INSERT INTO users (agency_id, email, name, role, client_id, pass_hash) VALUES ($1,lower($2),$3,$4,$5,$6)', [ctx.user.agency_id, b.email.trim(), b.name.trim(), b.role, clientId, hashPassword(b.password)]);
  } catch (e) { if (e.code === '23505') throw new HttpError(400, 'Bu e-posta zaten kayıtlı.'); throw e; }
  await audit(ctx, 'user.create', { email: b.email, role: b.role });
  redirect(res, clientId ? `/musteriler/${clientId}` : '/ekip');
});
route('POST', '/ekip/:id/durum', async (ctx, res, p) => {
  need(ctx, 'admin'); const id = int(p.id);
  if (id === ctx.user.id) throw new HttpError(400, 'Kendi erişiminizi kapatamazsınız.');
  const u = await one('UPDATE users SET active = NOT active WHERE id=$1 AND agency_id=$2 RETURNING id, active', [id, ctx.user.agency_id]);
  if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı.');
  if (!u.active) await q('DELETE FROM sessions WHERE user_id=$1', [id]);
  await audit(ctx, 'user.toggle', { id, active: u.active }); redirect(res, '/ekip');
});
route('GET', '/kayitlar', async (ctx, res) => {
  need(ctx, 'admin');
  const rows = await all('SELECT a.*, u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.agency_id=$1 ORDER BY a.created_at DESC LIMIT 200', [ctx.user.agency_id]);
  send(res, 200, layout(ctx, 'Kayıtlar', `<h1>İşlem kayıtları</h1><div class="tbl"><table><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th><th>Ayrıntı</th></tr>
${rows.map(r => `<tr><td>${new Date(r.created_at).toLocaleString('tr-TR')}</td><td>${h(r.name || '—')}</td><td>${h(r.action)}</td><td><code>${h(JSON.stringify(r.detail))}</code></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Kayıt yok.</td></tr>'}</table></div>`, '/kayitlar'));
});

// ----- müşteri portalı -----
route('GET', '/portal', async (ctx, res) => {
  need(ctx, 'client'); const cid = ctx.user.client_id;
  const c = await one('SELECT * FROM clients WHERE id=$1', [cid]);
  const svcs = await all(`SELECT cs.*, s.name, sc.name cat FROM client_services cs JOIN services s ON s.id=cs.service_id JOIN service_categories sc ON sc.id=s.category_id WHERE cs.client_id=$1 AND cs.status<>'durduruldu' ORDER BY cs.created_at`, [cid]);
  const aps = await all(`SELECT * FROM approvals WHERE client_id=$1 ORDER BY (status<>'bekliyor'), created_at DESC LIMIT 30`, [cid]);
  const prjs = await all(`SELECT p.*, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int total, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done FROM projects p WHERE p.client_id=$1 ORDER BY (p.status='tamamlandi'), p.created_at DESC`, [cid]);
  const f = csrfField(ctx); const pending = aps.filter(a => a.status === 'bekliyor');
  send(res, 200, layout(ctx, 'Portalım', `<h1>${h(c?.name || 'Portal')}</h1>
${pending.length ? `<section class="card" style="border-color:var(--champ)"><h2>Onayınızı bekleyenler (${pending.length})</h2>${pending.map(a => `<div class="card" style="background:#FBF9F5"><h3>${h(a.title)}</h3>${a.body ? `<p style="white-space:pre-wrap;margin:0">${h(a.body)}</p>` : ''}
<form class="stack" method="post" action="/portal/onay/${a.id}">${f}<label>Notunuz (isteğe bağlı)<textarea name="comment" rows="2"></textarea></label>
<div class="row"><button class="gold" name="decision" value="onaylandi">Onayla</button><button class="ghost" name="decision" value="reddedildi">Düzeltme iste</button></div></form></div>`).join('')}</section>` : ''}
<section><h2 style="margin-bottom:12px">Hizmetleriniz</h2><div class="grid">${svcs.map(s => `<div class="card"><span class="muted">${h(s.cat)}</span><h3>${h(s.name)}</h3><div>${badge(CS_ST[s.status], s.status === 'aktif' ? 'ok' : 'warn')}</div></div>`).join('') || '<p class="muted">Hizmet kaydı yok.</p>'}</div></section>
<section class="card"><h2>Projeleriniz</h2>${prjs.length ? `<div class="tbl"><table><tr><th>Proje</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>${prjs.map(p => `<tr><td>${h(p.name)}</td><td>${badge(PR_ST[p.status])}</td><td>${p.total ? Math.round(100 * p.done / p.total) : 0}%</td><td>${fmtDate(p.due_date)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Proje yok.</p>'}</section>
<section class="card"><h2>Geçmiş onaylar</h2>${aps.filter(a => a.status !== 'bekliyor').map(a => `<p style="margin:0">${badge(AP_ST[a.status], a.status === 'onaylandi' ? 'ok' : 'bad')} ${h(a.title)} <span class="muted">· ${fmtDate(a.decided_at)}</span></p>`).join('') || '<p class="muted">Henüz yok.</p>'}</section>`, '/portal'));
});
route('POST', '/portal/onay/:id', async (ctx, res, p) => {
  need(ctx, 'client');
  const d = ['onaylandi', 'reddedildi'].includes(ctx.body.decision) ? ctx.body.decision : null;
  if (!d) throw new HttpError(400, 'Karar geçersiz.');
  const r = await one(`UPDATE approvals SET status=$1, comment=$2, decided_by=$3, decided_at=now() WHERE id=$4 AND client_id=$5 AND status='bekliyor' RETURNING id`,
    [d, nn(ctx.body.comment), ctx.user.id, int(p.id), ctx.user.client_id]);
  if (!r) throw new HttpError(404, 'Onay bulunamadı ya da zaten karar verildi.');
  await audit(ctx, 'approval.decide', { id: r.id, decision: d });
  redirect(res, '/portal');
});

// ---------- sunucu ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ctx = { req, url };
  try {
    Object.assign(ctx, await loadSession(req));
    if (req.method === 'POST') {
      ctx.body = await readBody(req);
      const open = ['/giris', '/kurulum'].includes(url.pathname);
      if (!open && (!ctx.session || !safeEqual(ctx.body.csrf || '', ctx.session.csrf))) throw new HttpError(403, 'Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.');
      if (open) {
        const origin = req.headers.origin; const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Geçersiz istek kaynağı.');
      }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re); if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      return await r.fn(ctx, res, params);
    }
    throw new HttpError(404, 'Sayfa bulunamadı.');
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return redirect(res, '/giris');
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    const msg = status === 500 ? 'Beklenmeyen bir hata oluştu.' : (e.message || 'Hata');
    const body = `<h1>${status === 404 ? 'Bulunamadı' : 'Olmadı'}</h1><div class="err">${h(msg)}</div><p><a href="/">Ana sayfaya dön</a></p>`;
    if (!res.headersSent) send(res, status, ctx.user ? layout(ctx, 'Hata', body) : authPage('Hata', body));
  }
});

import { registerSites, migrateSites } from './ext-sites.js';
registerSites({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, audit, HttpError, int, STAFF });

migrate().then(() => migrateSites({ q, one })).then(() => server.listen(PORT, () => console.log(`Arvela OS ${VERSION} :${PORT}`))).catch(e => { console.error('başlatılamadı', e); process.exit(1); });
