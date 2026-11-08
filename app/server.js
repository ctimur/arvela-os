// Arvela OS v0.1 — temel: çoklu ajans, roller, müşteriler, hizmetler, projeler, görevler, onaylar.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { t, als, lang, M1, M2, exact, translateHtml, pickLang, locale, LANGS } from './i18n.js';
import { registerCrm, migrateCrm, crmActions } from './ext-crm.js';
import { registerFreelance, migrateFreelance, packageActions } from './ext-freelance.js';
import { registerRetention, migrateRetention } from './ext-retention.js';
import { registerSettings, loadThemes, currentThemeCss } from './ext-settings.js';
import { splitRecord } from './ext-settings.js';
import { registerPlaybooks, migratePlaybooks } from './ext-playbooks.js';
import { registerFlow, migrateFlow } from './ext-flow.js';
import { applyGuide } from './ext-guide.js';
import { registerIcons, ICON_LINKS } from './ext-icons.js';
import { registerAi, migrateAi } from './ext-ai.js';
import { registerSuggest, migrateSuggest } from './ext-suggest.js';
import { registerDecisions, migrateDecisions, parseMultipart, decisionForm, parseRequest, BODY_MAX } from './ext-decisions.js';
import { THEMES } from './themes.js';

const VERSION = '0.22.0';
let settingsApi = null;
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
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// İngilizcede kullanıcı verisi işaretlenir (çeviriye girmez); sabit etiketler tam eşleşmeyle çevrilir.
const h = (v) => lang() === 'en' ? M1 + escHtml(exact(v ?? '')) + M2 : escHtml(v);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(locale()) : '—';
const fmtMoney = (n) => n == null ? '—' : new Intl.NumberFormat(locale()).format(n);
const ROLE = { admin: 'Yönetici', staff: 'Çalışan', freelancer: 'Freelancer', client: 'Müşteri' };
const CLIENT_ST = { lead: 'Aday', active: 'Aktif', paused: 'Duraklatıldı', churned: 'Ayrıldı' };
const CS_ST = { teklif: 'Teklifte', kurulum: 'Kurulumda', aktif: 'Aktif', durduruldu: 'Durduruldu' };
const PR_ST = { planlandi: 'Planlandı', surecte: 'Süreçte', onayda: 'Onayda', tamamlandi: 'Tamamlandı' };
const TK_ST = { yapilacak: 'Yapılacak', yapiliyor: 'Yapılıyor', incelemede: 'İncelemede', bitti: 'Bitti' };
const AP_ST = { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Düzeltme istendi' };
const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${h(v)}</option>`).join('');
const badge = (txt, tone = '') => `<span class="badge ${tone}">${h(txt)}</span>`;

const CSS = `
:root{--night:#0B0D12;--ink:#141A22;--graphite:#2A2F38;--gold:#B08433;--champ:#E2BE7A;--champ-l:#F3E6CC;--stone:#5E5849;--paper:#F7F4EE;--sand:#F2EEE5;--line:#E6E0D3;--line2:#ECE6DA;--ok:#5E9E6A;--bad:#D9663A}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.5}
a{color:#7A5A1E}a:hover{color:var(--ink)}h1,h2,h3{font-family:Poppins,Inter,sans-serif;font-weight:500;margin:0;letter-spacing:-.2px}
h1{font-size:34px;line-height:1.15}h2{font-size:21px}h3{font-size:17px}
:focus-visible{outline:3px solid var(--champ);outline-offset:2px}
.side{position:fixed;inset:0 auto 0 0;width:248px;background:var(--night);color:#fff;display:flex;flex-direction:column;padding:20px 16px 14px;gap:14px;z-index:20}
.brand{font-family:Poppins,sans-serif;font-size:21px;font-weight:500;color:#fff;text-decoration:none;letter-spacing:.4px;padding:0 10px}.brand span{color:var(--champ);font-size:11px;letter-spacing:3px;margin-left:8px}
.side nav{display:flex;flex-direction:column;gap:1px;overflow-y:auto;flex:1;min-height:0;margin-right:-8px;padding-right:8px}
.side nav a{display:flex;align-items:center;gap:10px;padding:7px 14px;border-radius:10px;color:#C9CED6;text-decoration:none;font-size:15px}
.side nav a:hover{background:#1A1F27;color:#fff}.side nav a.on{background:var(--graphite);color:#fff;box-shadow:inset 3px 0 0 var(--champ)}
.side .who{margin-top:auto;border-top:1px solid #1F242C;padding:10px 6px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;color:#A3ABB8}.side .who>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who strong{color:#fff;font-weight:600;font-size:14px}
.btn-out{font:inherit;font-size:13px;background:transparent;color:#C9CED6;border:1px solid var(--graphite);border-radius:10px;padding:8px 12px;cursor:pointer;min-height:36px;align-self:flex-start}
.shell{margin-left:248px;min-height:100vh}
.mtop,.tabs{display:none}.shell.bare{margin-left:0}
main{max-width:1240px;margin:0 auto;padding:36px 40px 72px;display:flex;flex-direction:column;gap:24px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:12px}
a.card:hover{border-color:var(--champ)}
.stat{font-family:Poppins,sans-serif;font-size:34px;font-weight:500;line-height:1.1}.muted{color:var(--stone);font-size:13px}
.eyebrow{margin:0;font-size:12px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#7A5A1E}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line2);vertical-align:top}tr:last-child td{border-bottom:0}
th{font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--stone);background:#FBF9F5;font-weight:600}
.tbl{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px}
.card .tbl table,.card>table{border:0;border-radius:0}
form.inline{display:inline}form.stack{display:flex;flex-direction:column;gap:12px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600}
input,select,textarea{font:inherit;padding:10px 12px;border:1px solid #D6CFC0;border-radius:12px;background:#fff;min-height:44px;color:var(--ink)}
input:focus,select:focus,textarea:focus{border-color:var(--gold);outline:0;box-shadow:0 0 0 3px rgba(226,190,122,.35)}
button,.btn{font:inherit;font-weight:600;border:0;border-radius:14px;padding:11px 18px;background:var(--ink);color:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}
button:hover,.btn:hover{background:var(--graphite);color:#fff}button:disabled{opacity:.45;cursor:not-allowed}
button.gold,.btn.gold{background:var(--champ);color:var(--night)}button.gold:hover,.btn.gold:hover{background:#D8B06A;color:var(--night)}
button.ghost,.btn.ghost,.btn.sec{background:#fff;color:var(--ink);border:1px solid #DDD6C7}button.ghost:hover,.btn.sec:hover{background:var(--sand);color:var(--ink)}
.btn.pri{background:var(--ink);color:#fff}
.badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.4px;padding:4px 10px;border-radius:999px;background:#EEE9DF;color:#4A4538;text-transform:uppercase}
.badge.ok{background:#E3EFE4;color:#24502B}.badge.warn{background:#F7E9CF;color:#6B4A0F}.badge.bad{background:#F6E1DE;color:#7A2418}
.flash{background:var(--champ-l);border:1px solid var(--champ);padding:12px 16px;border-radius:14px}
.err{background:#F6E1DE;border:1px solid #E2B1A9;padding:12px 16px;border-radius:14px;color:#7A2418}
.auth{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--night);padding:24px}
.auth .card{width:100%;max-width:420px;border-radius:24px;padding:32px}
details summary{cursor:pointer;font-weight:600}
.dot{width:10px;height:10px;border-radius:50%;background:#C9C1B0;flex:none}.dot.bad{background:var(--bad)}.dot.warn{background:var(--gold)}.dot.ok{background:var(--ok)}
.grow{flex:1;min-width:0;display:flex;flex-direction:column}
.today{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;align-items:start}
.today-main{display:flex;flex-direction:column;gap:20px;min-width:0}
.today-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.today-head h1{font-size:40px;letter-spacing:-.5px}.lead{font-size:16px;margin:6px 0 0}
.today-count{display:flex;flex-direction:column;align-items:flex-end}
.act{background:#fff;border-radius:24px;padding:24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 0 var(--line),0 10px 30px rgba(20,26,34,.06)}
.act.hero{background:var(--night);color:#fff;box-shadow:none}.act.hero h2{color:#fff}.act.hero p{color:#C9CDD4}.act.hero .muted{color:#A3ABB8}.act.hero .btn.pri{background:var(--champ);color:var(--night)}.act.hero .btn.sec{background:transparent;color:#fff;border:1px solid #3A404B}.act.hero .btn.sec:hover{background:#1A1F27;color:#fff}
.seg{display:inline-flex;gap:0;margin-left:auto}.seg .btn{border-radius:0;min-height:40px}.seg .btn:first-child{border-radius:12px 0 0 12px}.seg .btn:last-child{border-radius:0 12px 12px 0}
.brief{background:#FBF6EA;border:1px solid #E9D9B4;border-radius:18px;padding:14px 18px;margin:0;line-height:1.6}.brief b{color:#7A5A1E}
.cmdk{border:0;border-radius:18px;padding:0;width:min(560px,calc(100vw - 24px));max-height:70vh;box-shadow:0 30px 80px rgba(11,13,18,.35)}.cmdk::backdrop{background:rgba(11,13,18,.45)}.cmdk form{padding:12px;border-bottom:1px solid var(--line)}.cmdk input{width:100%;min-height:48px;font-size:16px;border:0;outline:0;padding:0 8px}.cmdk nav{padding:8px;overflow:auto;max-height:50vh;display:flex;flex-direction:column}.cmdk nav a{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:10px;color:var(--ink);text-decoration:none}.cmdk nav a:hover,.cmdk nav a.on{background:var(--sand)}.cmdk nav a span{margin-left:auto;color:var(--stone);font-size:12px}.cmdk .hint{padding:8px 14px 12px;font-size:12px;color:var(--stone);margin:0}
input[type=radio],input[type=checkbox]{accent-color:var(--gold)}
.rec{display:grid;grid-template-columns:340px minmax(0,1fr);gap:24px;align-items:start}.rec-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:20px}.rec-main{display:flex;flex-direction:column;gap:20px;min-width:0}
.rec-side .page-head{flex-direction:column;align-items:flex-start}.rec-side h1{font-size:26px}.rec-side .act-btns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%}.rec-side .act-btns .btn{padding:10px 8px}
.kv.rec-kv{grid-template-columns:120px minmax(0,1fr);gap:0}.rec-kv dt,.rec-kv dd{padding:9px 0;border-top:1px solid var(--line2);overflow-wrap:anywhere}
.summary{background:#FBF6EA;border:1px solid #E9D9B4;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:6px}.summary h2{font-size:15px;font-family:Inter,sans-serif;font-weight:600;color:#7A5A1E}.summary p{margin:0;line-height:1.6}
@media (max-width:1000px){.rec{grid-template-columns:1fr}.rec-side{display:contents}.rec-side>.page-head{order:1}.rec-main{order:2}.rec-side>.rec-kv{order:3}.rec-side>details{order:4}}
.pb .lead{font-size:17px;max-width:900px;margin:0}.pb{display:flex;flex-direction:column;gap:20px}.pb ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}.pb h3{margin-top:8px}.pb-stats .stat{font-size:28px}
.pb-edit textarea{font-size:14px}.pb-stages{border:1px solid var(--line);border-radius:14px;padding:10px;margin:0}.pb-stages input,.pb-stages select{min-height:38px;padding:6px 8px;font-size:13px;min-width:90px}.pb-stages td{padding:6px}.pb-stages td:first-child input{min-width:200px}
.preview-bar{position:sticky;top:0;z-index:50;background:var(--night);color:#fff;padding:10px 16px;font-size:13px;text-align:center}.preview-bar a{color:var(--champ);margin-left:10px}
.theme-card.is-sel{border-color:var(--gold)}.swatch{display:flex;height:56px;border-radius:12px;overflow:hidden;border:1px solid var(--line)}.swatch span{flex:1}
.theme-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.theme-opts fieldset{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0;display:flex;flex-direction:column;gap:4px}.theme-opts legend{font-weight:600;font-size:13px;padding:0 4px}
label.opt{flex-direction:row;align-items:center;gap:10px;font-weight:500;min-height:40px}label.opt input{min-height:0;width:18px;height:18px}.sw{width:18px;height:18px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.1)}
.kbd{font-size:11px;border:1px solid #3A404B;border-radius:5px;padding:1px 6px;color:#A3ABB8}.act.hero h2{font-size:28px;line-height:1.2}.act p{margin:0;color:#4A4538;font-size:16px;line-height:1.55;max-width:720px}
.act-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.act-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}.act-btns .btn{min-height:48px}
.act-pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.act.mid h3{font-size:20px}
.later{display:flex;flex-direction:column;gap:10px}
.later-row,.pulse-row{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--ink)}
.later-row{background:#fff;border-radius:18px;padding:14px 16px;border:1px solid transparent}.later-row:hover{border-color:var(--champ);color:var(--ink)}
.later-row strong{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chev{font-size:22px;color:#6B6558;line-height:1}
.pulse{position:sticky;top:24px;border:0;border-radius:24px;gap:0}.pulse h2{margin-bottom:8px}
.pulse-row{padding:12px 0;border-top:1px solid var(--line2);font-size:14px}.pulse-row:first-of-type{border-top:0}.pulse-row:hover .grow{color:#7A5A1E}
.pulse-all{margin-top:12px;font-size:14px}
.lang{display:inline-flex;border:1px solid #DDD6C7;border-radius:10px;overflow:hidden}.lang button{min-height:34px;padding:4px 10px;font-size:12px;border-radius:0;background:transparent;color:var(--stone);font-weight:600}.lang button.on{background:var(--ink);color:#fff}.lang button:hover{background:var(--sand);color:var(--ink)}
.lang.dark{border-color:var(--graphite)}.lang.dark button{color:#A3ABB8}.lang.dark button.on{background:var(--champ);color:var(--night)}.lang.dark button:hover{background:#1A1F27;color:#fff}
.who-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chk{flex-direction:row;align-items:center;gap:8px;font-weight:500}.chk input{min-height:auto;width:18px;height:18px}
.evgrp{border:1px solid var(--line2);border-radius:12px;padding:8px 12px;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 16px}.evgrp legend{font-weight:600;font-size:13px;padding:0 6px}.evgrp code{color:var(--stone);font-size:11px}
.files{margin:8px 0 0;padding-left:18px;font-size:13px;display:flex;flex-direction:column;gap:2px;max-height:260px;overflow:auto}
.steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px}.steps li{line-height:1.6}
.keybox{display:inline-block;margin:6px 0;padding:8px 10px;background:#fff;border:1px solid var(--champ);border-radius:10px;word-break:break-all;font-size:13px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px 16px;flex-wrap:wrap}
.chips{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:8px;font-size:14px}
.crumb{font-size:14px;color:var(--stone);display:flex;flex-wrap:wrap;gap:6px}.crumb a{text-decoration:none}
.jump{display:flex;gap:6px;flex-wrap:wrap}.jump a{padding:8px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);text-decoration:none;color:var(--ink);font-size:14px}.jump a:hover{border-color:var(--champ)}
button.textbtn{background:none;border:0;padding:0;min-height:0;color:var(--stone);font-size:13px;text-decoration:underline;cursor:pointer}.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 12px}.kv dt{color:var(--stone);font-size:13px}.kv dd{margin:0}div.stack{display:flex;flex-direction:column;gap:20px}
.desc{margin:0;white-space:pre-wrap;color:#4A4538;max-width:860px}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.filters input[type=search]{flex:1 1 260px}
.prog{height:6px;border-radius:999px;background:#E3DCCD;overflow:hidden;min-width:80px}.prog span{display:block;height:100%;background:var(--gold);border-radius:999px}.prog.big{height:8px}
.late{color:#A33A1F;font-weight:600}
.kanban{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:start}
.kcol{background:var(--sand);border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:120px}.kcol h3{font-size:14px;font-family:Inter,sans-serif;font-weight:600;padding:4px 4px 0}
.kcard{background:#fff;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;border:1px solid transparent}.kcard:hover{border-color:var(--champ)}.kcard.is-late{border-left:3px solid var(--bad)}
.kt{color:var(--ink);text-decoration:none;font-weight:600;line-height:1.35}.kmeta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;color:var(--stone)}.kempty{padding:4px}
.inline-status{display:flex;gap:6px;align-items:center}.inline-status select{min-height:36px;padding:6px 10px;font-size:13px;border-radius:10px}.inline-status button{min-height:36px;padding:6px 12px;font-size:13px}
.auto-hide{display:none}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.two.wide-first{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}
.line{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line2);text-decoration:none;color:var(--ink)}.line:first-of-type{border-top:0}.line:hover strong{color:#7A5A1E}
.note{border-top:1px solid var(--line2);padding-top:10px}.note:first-of-type{border-top:0;padding-top:0}.note-h{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}.note p{margin:4px 0 0;white-space:pre-wrap}
.svc{border-top:1px solid var(--line2);padding-top:12px}.svc:first-of-type{border-top:0;padding-top:0}.svc-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.svc details{margin-top:6px}.svc details summary{font-size:13px;color:#7A5A1E}.svc details form{margin-top:10px}
details.danger summary{color:#7A2418;font-size:14px}details.danger form{margin-top:10px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
button.danger{background:#fff;color:#7A2418;border:1px solid #E2B1A9}button.danger:hover{background:#F6E1DE;color:#7A2418}
label.wide{flex:2 1 260px}
.side-search{display:flex;padding:0 4px}.side-search input{width:100%;background:#1A1F27;border:1px solid #262B34;color:#fff;min-height:40px;border-radius:10px;font-size:14px}.side-search input::placeholder{color:#7C8492}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;border:1px solid #DDD6C7;background:#fff;color:var(--ink)}.icon-btn svg{width:20px;height:20px}
tr.is-late td:first-child{box-shadow:inset 3px 0 0 var(--bad)}
details.add>summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:40px;font-weight:600;color:var(--ink,#141A22)}details.add>summary::-webkit-details-marker{display:none}
details.add>summary::before{content:"+";display:inline-grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--sand,#EFE9DD);font-weight:600;flex:none}details.add[open]>summary::before{content:"−"}
details.card.add{padding-top:12px;padding-bottom:12px}details.card.add[open]{padding-bottom:20px}details.add[open]>summary{margin-bottom:10px}
.seg{display:inline-flex;flex-wrap:wrap;gap:4px;background:var(--sand,#EFE9DD);padding:4px;border-radius:12px;margin:0}.seg button{min-height:36px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:#4A4A44;font-weight:500;font-size:14px}
.seg button.on{background:#fff;color:var(--ink,#141A22);box-shadow:0 1px 3px rgba(20,26,34,.12);font-weight:600}
.stack-col{display:flex;flex-direction:column;gap:16px;min-width:0}.note.sys{background:#FBF9F5;border-radius:10px;padding:10px 12px}.note.sys .note-h strong{color:#7A5A1E}details.more>summary{font-size:13px;color:#7A5A1E}
dl.kv dt{color:#6B6558;font-size:13px}dl.kv dd{margin:0}
.info-btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line,#E2DACB);background:#fff;color:var(--ink,#141A22);font-size:14px;font-weight:600;cursor:pointer}
.info-btn span{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--sand,#EFE9DD);font:600 12px/1 Georgia,serif;font-style:italic}
.info-on .info-btn{background:var(--ink,#141A22);color:#fff;border-color:var(--ink,#141A22)}.info-on .info-btn span{background:var(--gold);color:var(--ink,#141A22)}
.info-bar{display:flex;justify-content:flex-end;margin-bottom:-8px}
.guide{display:none;grid-template-columns:1fr 1fr;gap:16px 28px;background:var(--sand,#EFE9DD);border-radius:16px;padding:16px 20px;font-size:14px;line-height:1.55}.guide p{margin:0}.guide .eyebrow{margin-bottom:4px}
.info-on .guide{display:grid}.g-hint{display:none}.info-on .g-hint{display:block}.more-info{display:none}.info-on .more-info{display:revert}
@media (max-width:700px){.guide{grid-template-columns:1fr}}
.nav-group{margin:10px 14px 2px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6E7682}.side nav .nav-group:first-child{margin-top:0}
.g-hint{margin:2px 0 8px;color:#6B6558;font-size:13px;line-height:1.5}
.flowbar{background:#fff;border:1px solid var(--champ);border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:8px}.flowbar h2{margin:0;font-size:20px}.flowbar p{margin:0}.flowbar.small{padding:14px 18px}
.flowbar .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.flowbar form{margin:0}
.decision{background:#FBF9F5;display:flex;flex-direction:column;gap:8px}.decision h3{margin:0}.choices{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}.choices legend{font-weight:600;margin-bottom:6px}
.choices .opt{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid var(--line,#E6DFD2);border-radius:10px;padding:10px 12px;min-height:44px;cursor:pointer}
.budget{background:#fff;border:1px solid var(--champ);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column}.budget strong{font-size:20px}.files{margin:4px 0 0;padding-left:18px}[hidden]{display:none!important}
.sug-list{display:flex;flex-direction:column;gap:8px}.sug{display:flex;flex-direction:row;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line,#E6DFD2);border-radius:12px;padding:10px 12px;cursor:pointer}
.sug input[type=checkbox]{width:20px;height:20px;margin-top:4px;flex:none}.sug .grow{display:flex;flex-direction:column;gap:6px;min-width:0;font-weight:400}.sug .badge{align-self:flex-start}.sug input[name^=b_]{font-weight:600}
.check-row{display:flex;gap:10px;align-items:center;margin:0 0 6px}.chkbox{width:28px;height:28px;min-height:28px;padding:0;border-radius:8px;border:1px solid var(--line,#D8D0C2);background:#fff;font-weight:700}.chkbox.on{background:var(--gold);border-color:var(--gold)}.check-row .done{text-decoration:line-through;color:#8a8478}
.ai-out{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55;background:#FBF9F5;border-radius:10px;padding:12px 14px;margin:0;max-height:70vh;overflow:auto}
.flow-warn{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#FBF3E4;border-radius:10px;padding:8px 12px;font-size:14px}
.stages{margin:8px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:6px}.stages li{display:list-item}.stages .dot{display:inline-block;margin-right:6px;vertical-align:middle}
@media (max-width:1100px){.kanban{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.two,.two.wide-first{grid-template-columns:1fr}}
@media (max-width:700px){
.kanban{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -20px;padding:0 20px 6px;gap:12px}.kcol{flex:0 0 82%;scroll-snap-align:start}
table.rs,table.rs tbody,table.rs tr,table.rs td{display:block;width:100%}table.rs{border:0;background:transparent}
table.rs tr:first-child{display:none}table.rs tr{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:10px}
table.rs td{border:0;padding:4px 0;display:flex;gap:12px;justify-content:space-between;align-items:center;text-align:right}
table.rs td[data-label]::before{content:attr(data-label);font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--stone);text-align:left;flex:none}
table.rs td:first-child{display:block;text-align:left;font-size:16px;padding-bottom:8px}table.rs td:first-child::before{display:none}
table.rs td[colspan]{display:block;text-align:left}table.rs td[colspan]::before{display:none}
table.rs tr.is-late{border-left:3px solid var(--bad)}tr.is-late td:first-child{box-shadow:none}
.tbl{overflow:visible}.filters select,.filters button{flex:1 1 auto}
.svc-h .inline-status{width:100%}.svc-h .inline-status select{flex:1}
}
@media (max-width:1100px){.today{grid-template-columns:1fr}.pulse{position:static}}
@media (max-width:900px){
.side{display:none}.shell{margin-left:0;padding-bottom:84px}
.mtop{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 4px;position:sticky;top:0;background:var(--paper);z-index:15}
.mtop .brand{color:var(--ink);padding:0;font-size:19px}.mtop .who{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--stone)}
.mtop .btn-out{color:var(--ink);border-color:#DDD6C7}
.tabs{display:flex;position:fixed;left:0;right:0;bottom:0;height:72px;padding:6px 6px calc(6px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line);justify-content:space-around;align-items:stretch;z-index:30;box-sizing:content-box}
.tabs a,.tabs summary{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;font-weight:500;color:#6B6558;text-decoration:none;border-radius:14px;list-style:none;min-width:56px}
.tabs summary::-webkit-details-marker{display:none}
.tabs a.on{color:var(--ink);font-weight:600}.tabs a.on .ti{background:var(--champ-l)}
.ti{width:44px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center}.ti svg{width:20px;height:20px}
.tabs details{flex:1;display:flex}.tabs details summary{height:100%}
.more{position:fixed;left:12px;right:12px;bottom:calc(92px + env(safe-area-inset-bottom));background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(11,13,18,.25);padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px}
.more a{flex:none;flex-direction:row;justify-content:flex-start;font-size:15px;padding:14px;color:var(--ink);border-radius:12px}.more a:hover,.more a.on{background:var(--sand)}
main{padding:12px 20px 32px;gap:18px}
h1{font-size:28px}.today-head h1{font-size:30px}.today-count{display:none}
.act{padding:20px;border-radius:22px}.act.hero h2{font-size:22px}.act p{font-size:15px}
.act-pair{grid-template-columns:1fr}.act-btns .btn{flex:1 1 140px;min-height:52px}.act.hero .act-btns .btn:first-child{flex-basis:100%}
.card{padding:18px;border-radius:18px}
th,td{padding:10px 12px}
.row>label,.row>input,.row>select{flex:1 1 160px}
}
`;

const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.2 2.6 3.5 5.5"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.5l3 3 5-6"/>',
  doc: '<path d="M6 2.5h8l4.5 4.5V21a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z"/><path d="M14 2.5V7h4.5M9 12h6M9 16h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};
const icon = (k) => `<span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg></span>`;

const GROUP_OF = (u, href) => { if (!u || u.role === 'client' || u.role === 'freelancer') return ''; const g = { '/panel': 'Günlük', '/satis': 'Satış ve müşteri', '/projeler': 'Teslimat', '/otomasyonlar': 'Yönetim' }[href]; return g ? `<p class="nav-group">${g}</p>` : ''; };
// Ekip/Forge/Kayıtlar kenar çubuğunda değil Ayarlar'da; o sayfalarda Ayarlar seçili görünür
const ACTIVE_ALIAS = { '/ekip': '/ayarlar', '/forge': '/ayarlar', '/kayitlar': '/ayarlar' };
function layout(ctx, title, body, active = '') {
  active = ACTIVE_ALIAS[active] || active;
  const u = ctx.user;
  const links = !u ? [] :
    u.role === 'client' ? [['/portal', 'Portalım'], ['/portal/siteler', 'Sitelerim'], ['/portal/teklifler', 'Tekliflerim'], ['/portal/faturalar', 'Faturalarım']] :
    u.role === 'freelancer' ? [['/paketler', 'İş paketlerim'], ['/gorevler', 'Görevlerim']] :
    [['/panel', 'Bugün'], ['/gorevler', 'Görevlerim'], ['/onaylar', 'Onaylar'], ['/satis', 'Satış hattı'], ['/musteriler', 'Müşteriler'], ...(u.role === 'admin' ? [['/teklifler', 'Teklifler'], ['/faturalar', 'Faturalar']] : []),
      ['/projeler', 'Projeler'], ['/paketler', 'İş paketleri'], ['/siteler', 'Siteler'], ['/katalog', 'Katalog'], ['/otomasyonlar', 'Otomasyonlar'], ...(u.role === 'admin' ? [['/odemeler', 'Freelancer ödemeleri'], ['/ayarlar', 'Ayarlar']] : [])];

  const staffish = u && (u.role === 'admin' || u.role === 'staff');
  const isOn = (href) => active === href;
  const cur = (href) => isOn(href) ? ' class="on" aria-current="page"' : '';
  const side = links.map(([href, t]) => `${GROUP_OF(u, href)}<a href="${href}"${cur(href)}>${t}</a>`).join('');
  // mobil alt sekmeler: rol başına en sık kullanılan dördü, gerisi "Menü"de
  const TAB = u?.role === 'client' ? [['/portal', 'home'], ['/portal/siteler', 'globe'], ['/portal/teklifler', 'doc'], ['/portal/faturalar', 'check']]
    : u?.role === 'freelancer' ? [['/paketler', 'doc'], ['/gorevler', 'check']]
    : [['/panel', 'home'], ['/musteriler', 'users'], ['/gorevler', 'check'], [u?.role === 'admin' ? '/faturalar' : '/onaylar', 'doc']];
  const tabSet = new Set(TAB.map(t => t[0]));
  const label = Object.fromEntries(links);
  const rest = links.filter(([href]) => !tabSet.has(href));
  const tabs = u ? `<nav class="tabs" aria-label="Alt menü">${TAB.map(([href, ic]) => `<a href="${href}"${cur(href)}>${icon(ic)}${label[href]}</a>`).join('')}${rest.length ? `<details><summary>${icon('menu')}Menü</summary><div class="more">${rest.map(([href, t]) => `<a href="${href}"${cur(href)}>${t}</a>`).join('')}</div></details>` : ''}</nav>` : '';
  const out = u ? `<form class="inline" method="post" action="/cikis">${csrfField(ctx)}<button class="btn-out">Çıkış</button></form>` : '';
  const flash = ctx.flash ? `<div class="flash" role="status">${h(ctx.flash)}</div>` : '';
  const pv = u?.role === 'admin' ? ctx.url?.searchParams?.get('onizle') : null; const pvCss = pv && settingsApi ? settingsApi.previewCss(pv, u.agency_id) : null;
  const pageTheme = pvCss !== null && pvCss !== undefined ? { css: pvCss, banner: `<div class="preview-bar" role="status">Önizleme: ${escHtml(THEMES[pv].name)} · yalnız size görünür <a href="/ayarlar/tema?tema=${escHtml(pv)}">Ayarlara dön</a></div>` } : { css: currentThemeCss(u?.agency_id), banner: '' };
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#F7F4EE">
<title>${h(title)} · Arvela OS</title>${ICON_LINKS}<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@500&display=swap" rel="stylesheet"><style>${CSS}${pageTheme.css}</style></head><body${parseCookies(ctx.req || { headers: {} }).ayrinti === '1' ? ' class="info-on"' : ''}>${pageTheme.banner}
${u ? `<aside class="side"><a class="brand" href="/">Arvela<span>OS</span></a>${staffish ? `<form class="side-search" method="get" action="/ara" role="search"><input type="search" name="q" data-cmdk placeholder="Ara…" aria-label="Ara"></form>` : ''}<nav aria-label="Ana menü">${side}</nav><div class="who"><span><strong>${h(u.name)}</strong><br>${h(ROLE[u.role])}</span><div class="who-row">${out}${langSwitch(ctx, 'dark')}</div></div></aside>` : ''}
<div class="shell${u ? '' : ' bare'}">${u ? `<header class="mtop"><a class="brand" href="/">Arvela<span>OS</span></a><div class="who">${langSwitch(ctx)}${staffish ? `<a class="icon-btn" href="/ara" data-cmdk aria-label="Ara">${icon('search').replace('class="ti"', 'class="ti" style="width:auto;height:auto"')}</a>` : ''}${out}</div></header>` : ''}
<main>${flash}${u ? applyGuide(body, { path: ctx.url?.pathname || '', lang: lang(), M1: lang() === 'en' ? M1 : '', M2: lang() === 'en' ? M2 : '' }) : body}</main></div>${tabs}${staffish ? cmdk(u) : ''}<script src="/app.js" defer></script></body></html>`;
}
const cmdk = (u) => {
  const items = [['/satis#yeni-aday', 'Yeni aday', 'A'], ['/paketler#yeni-paket', 'Yeni iş paketi', ''], ...(u.role === 'admin' ? [['/teklifler#yeni', 'Yeni teklif', 'T']] : []),
    ['/panel', 'Bugün', 'G B'], ['/satis', 'Satış hattı', 'G S'], ['/musteriler', 'Müşteriler', 'G M'], ['/gorevler', 'Görevlerim', 'G G'], ['/onaylar', 'Onaylar', ''], ['/projeler', 'Projeler', ''],
    ['/paketler', 'İş paketleri', ''], ['/siteler', 'Siteler', ''], ...(u.role === 'admin' ? [['/faturalar', 'Faturalar', ''], ['/odemeler', 'Freelancer ödemeleri', ''], ['/forge', 'Forge', '']] : [])];
  return `<dialog class="cmdk" id="cmdk" aria-label="Komut paleti"><form method="get" action="/ara" role="search"><input type="search" name="q" placeholder="Ara ya da komut seç…" aria-label="Ara ya da komut seç" autocomplete="off"></form><nav>${items.map(([href, t, k]) => `<a href="${href}">${t}${k ? `<span>${k}</span>` : ''}</a>`).join('')}</nav><p class="hint">Enter: aç ya da ara · Esc: kapat · ⌘K / Ctrl+K: her yerden aç</p></dialog>`;
};
const langSwitch = (ctx, cls = '') => {
  const cur = lang(); const back = ctx.url ? ctx.url.pathname + ctx.url.search : '/';
  return `<form class="lang ${cls}" method="post" action="/dil"><input type="hidden" name="back" value="${escHtml(back)}">${Object.keys(LANGS).map(k => `<button name="lang" value="${k}"${k === cur ? ' aria-pressed="true" class="on"' : ''} title="${LANGS[k]}">${k.toUpperCase()}</button>`).join('')}</form>`;
};
const csrfField = (ctx) => ctx.session ? `<input type="hidden" name="csrf" value="${h(ctx.session.csrf)}">` : '';

function authPage(title, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0D12"><title>${h(title)} · Arvela OS</title>${ICON_LINKS}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Poppins:wght@500&display=swap" rel="stylesheet"><style>${CSS}${currentThemeCss(1)}</style></head>
<body><div class="auth"><div class="card"><div class="row" style="justify-content:space-between;align-items:center"><p class="brand" style="color:var(--ink);margin:0">Arvela<span>OS</span></p>${langSwitch({ url: { pathname: '/giris', search: '' } })}</div>${body}</div></div></body></html>`;
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
// Dosya yüklemesi yalnız karar formlarında kabul edilir (multipart/form-data, en çok ~26 MB).
const MULTIPART_PATHS = /^\/(karar\/[^/]+\/onay|portal\/onay|onaylar)\/\d+(\/karar)?$/;
function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > BODY_MAX) { reject(new HttpError(413, 'Dosyalar çok büyük (en çok 5 dosya, her biri 8 MB).')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const { fields, files } = parseMultipart(Buffer.concat(chunks), req.headers['content-type']); resolve({ ...fields, __files: files }); });
    req.on('error', reject);
  });
}
function readBody(req, path = '') {
  if (/^multipart\/form-data/i.test(req.headers['content-type'] || '')) {
    if (!MULTIPART_PATHS.test(path)) return Promise.reject(new HttpError(415, 'Bu adreste dosya yüklenemez.'));
    return readMultipart(req);
  }
  return new Promise((resolve, reject) => {
    let data = ''; req.setEncoding('utf8');
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => {
      if (/application\/json/i.test(req.headers['content-type'] || '')) { try { const j = JSON.parse(data || '{}'); return resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch { return reject(new HttpError(400, 'Geçersiz JSON.')); } }
      resolve(Object.fromEntries(new URLSearchParams(data)));
    });
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
  res.end(translateHtml(html));
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
let hooks = null; // otomasyon kancaları (ext-automation.js)
let flow = null; // aşama akışı (ext-flow.js)
let decisions = null; // müşteri kararları (ext-decisions.js)
let ai = null; // yapay zekâ işleri (ext-ai.js)
let suggest = null; // yapay zekâ önerileri, alt görev, kontrol listesi, hatırlatma (ext-suggest.js)
async function audit(ctx, action, detail = {}) {
  await q('INSERT INTO audit (agency_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [ctx.user.agency_id, ctx.user.id, action, detail]);
  if (flow) await flow.onAudit(ctx, action, detail).catch((e) => console.error('akış:', e.message)); // sıradaki aşamayı aç, onayları bağla
  if (decisions) decisions.onAudit(ctx, action, detail).catch((e) => console.error('karar e-postası:', e.message));
  if (ai) ai.onAudit(ctx, action, detail).catch((e) => console.error('yapay zekâ:', e.message)); // beklemez: n8n'e gönderim isteği yavaşlatmasın
  if (hooks) hooks.onAudit(ctx, action, detail).catch((e) => console.error('otomasyon:', e.message));
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const need = (ctx, ...roles) => { if (!ctx.user) throw new HttpError(401); if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'Bu sayfaya erişim yetkiniz yok.'); };
const STAFF = ['admin', 'staff'];
const int = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const nn = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// ---------- rotalar ----------
const routes = [];
const route = (method, pattern, fn) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return k === 'token' ? '([A-Za-z0-9_-]{20,80})' : '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, fn });
};

route('GET', '/healthz', async (ctx, res) => { await q('SELECT 1'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, version: VERSION })); });

route('GET', '/', async (ctx, res) => {
  if (!ctx.user) return redirect(res, (await usersExist()) ? '/giris' : '/kurulum');
  redirect(res, ctx.user.role === 'client' ? '/portal' : ctx.user.role === 'freelancer' ? '/paketler' : '/panel');
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
// Dil seçimi: giriş öncesi çerezde, giriş sonrası kullanıcı tercihinde tutulur.
route('POST', '/dil', async (ctx, res) => {
  const l = LANGS[ctx.body.lang] ? ctx.body.lang : 'tr';
  if (ctx.user) await q('UPDATE users SET lang=$1 WHERE id=$2', [l, ctx.user.id]);
  const back = String(ctx.body.back || '/');
  redirect(res, back.startsWith('/') && !back.startsWith('//') ? back : '/', { 'Set-Cookie': `lang=${l}; Path=/; SameSite=Lax; Max-Age=31536000${COOKIE_SECURE ? '; Secure' : ''}` });
});
route('POST', '/cikis', async (ctx, res) => {
  if (ctx.session) await q('DELETE FROM sessions WHERE id=$1', [ctx.session.id]);
  redirect(res, '/giris', { 'Set-Cookie': cookie('sid', '', 0) });
});

// ----- panel -----
route('GET', '/panel', async (ctx, res) => { // müşteri ve freelancer kendi ana sayfasına gider (403 yerine)
  if (ctx.user?.role === 'client') return redirect(res, '/portal'); if (ctx.user?.role === 'freelancer') return redirect(res, '/paketler');
  return todayPage(ctx, res, send);
});

// ----- müşteriler -----
route('GET', '/musteriler', async (ctx, res) => {
  need(ctx, ...STAFF);
  const rows = await all(`SELECT c.*, (SELECT count(*) FROM client_services cs WHERE cs.client_id=c.id AND cs.status='aktif')::int svc,
    (SELECT count(*) FROM projects p WHERE p.client_id=c.id AND p.status<>'tamamlandi')::int prj FROM clients c WHERE c.agency_id=$1
    AND ($2 = '' OR c.status = $2) AND ($3 = '' OR c.name ILIKE $4 OR c.contact_name ILIKE $4 OR c.sector ILIKE $4 OR c.phone ILIKE $4) ORDER BY c.status, c.name`,
    [ctx.user.agency_id, CLIENT_ST[ctx.url.searchParams.get('durum')] ? ctx.url.searchParams.get('durum') : '', (ctx.url.searchParams.get('q') || '').trim(), '%' + (ctx.url.searchParams.get('q') || '').trim().slice(0, 80).replace(/[\\%_]/g, (x) => '\\' + x) + '%']);
  const sq = ctx.url.searchParams.get('q') || ''; const sd = ctx.url.searchParams.get('durum') || '';
  const tone = { active: 'ok', lead: 'warn', paused: '', churned: 'bad' };
  send(res, 200, layout(ctx, 'Müşteriler', `<div class="page-head"><h1>Müşteriler</h1></div>
<details class="card"><summary>Yeni müşteri ekle</summary><form class="stack" method="post" action="/musteriler">${csrfField(ctx)}
<div class="row"><label>Firma adı<input name="name" required></label><label>Sektör<input name="sector" placeholder="Emlak, e-ticaret…"></label><label>Durum<select name="status">${opts(CLIENT_ST, 'lead')}</select></label></div>
<div class="row"><label>Yetkili<input name="contact_name"></label><label>Telefon<input name="phone"></label><label>E-posta<input type="email" name="email"></label></div>
<label>Not<textarea name="notes" rows="2"></textarea></label><div><button class="gold">Kaydet</button></div></form></details>
<form class="filters" method="get" action="/musteriler"><input type="search" name="q" value="${h(sq)}" placeholder="Firma, yetkili, sektör ya da telefon" aria-label="Ara"><select name="durum" aria-label="Durum" data-auto><option value="">Tüm durumlar</option>${opts(CLIENT_ST, sd)}</select><button class="ghost">Filtrele</button></form>
<div class="tbl"><table><tr><th>Firma</th><th>Sektör</th><th>Durum</th><th>Aktif hizmet</th><th>Açık proje</th><th>Yetkili</th></tr>
${rows.map(c => `<tr><td><a href="/musteriler/${c.id}"><strong>${h(c.name)}</strong></a></td><td>${h(c.sector || '—')}</td><td>${badge(CLIENT_ST[c.status], tone[c.status])}</td><td>${c.svc}</td><td>${c.prj}</td><td>${h(c.contact_name || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Bu filtreye uyan müşteri yok.</td></tr>'}
</table></div>`, '/musteriler'));
});
route('POST', '/musteriler', async (ctx, res) => {
  need(ctx, ...STAFF); const b = ctx.body;
  if (!nn(b.name)) throw new HttpError(400, 'Firma adı gerekli.');
  const st = CLIENT_ST[b.status] ? b.status : 'lead';
  const r = await one(`INSERT INTO clients (agency_id, name, sector, contact_name, phone, email, notes, status, stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.user.agency_id, nn(b.name), nn(b.sector), nn(b.contact_name), nn(b.phone), nn(b.email), nn(b.notes), st, st === 'lead' ? 'yeni' : null]);
  await audit(ctx, st === 'lead' ? 'lead.create' : 'client.create', { id: r.id, name: b.name });
  redirect(res, st === 'lead' ? `/satis/${r.id}` : `/musteriler/${r.id}`);
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
  const HEAD = `
<div class="page-head"><div><h1>${h(c.name)}</h1><div class="chips">${badge(CLIENT_ST[c.status])}${c.contact_name ? `<span class="muted">${h(c.contact_name)}</span>` : ''}${c.phone ? `<a href="tel:${h(c.phone.replace(/[^+\d]/g, ''))}">${h(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${h(c.email)}">${h(c.email)}</a>` : ''}</div></div>
<nav class="jump" aria-label="Sayfa içi"><a href="#hizmetler">Hizmetler</a><a href="#projeler">Projeler</a><a href="#onaylar">Onaylar</a><a href="/musteriler/${c.id}/siteler">Siteler</a><a href="/satis/${c.id}">Satış geçmişi</a><a href="/musteriler/${c.id}/karar">Karar bağlantısı</a></nav></div>
`;
  const DET = `<details class="card"><summary>Firma bilgileri</summary><form class="stack" method="post" action="/musteriler/${c.id}">${f}
<div class="row"><label>Firma adı<input name="name" value="${h(c.name)}" required></label><label>Sektör<input name="sector" value="${h(c.sector)}"></label><label>Durum<select name="status">${opts(CLIENT_ST, c.status)}</select></label></div>
<div class="row"><label>Yetkili<input name="contact_name" value="${h(c.contact_name)}"></label><label>Telefon<input name="phone" value="${h(c.phone)}"></label><label>E-posta<input type="email" name="email" value="${h(c.email)}"></label></div>
<label>Not<textarea name="notes" rows="3">${h(c.notes)}</textarea></label><div><button>Güncelle</button></div></form></details>

`;
  const REST = `<section class="card" id="hizmetler"><h2>Hizmetler</h2>
${svcs.length ? svcs.map(s => `<div class="svc"><div class="svc-h"><span class="grow"><strong><a href="/hizmet/${s.id}/kitap">${h(s.code)} · ${h(s.name)}</a>${s.playbook ? ' ' + badge('Özel kitap', 'warn') : ''}</strong><span class="muted">${h(s.billing || '')}${s.start_date ? ' · başlangıç ' + fmtDate(s.start_date) : ''}${s.end_date ? ' · bitiş ' + fmtDate(s.end_date) : ''}${s.notes ? ' · ' + h(s.notes) : ''}</span></span>
<form class="inline-status" method="post" action="/hizmet/${s.id}">${f}<select name="status" data-auto aria-label="Durum">${opts(CS_ST, s.status)}</select><button class="ghost">Kaydet</button></form></div>
<details><summary>Düzenle</summary><form class="stack" method="post" action="/hizmet/${s.id}">${f}<div class="row"><label>Durum<select name="status">${opts(CS_ST, s.status)}</select></label><label>Başlangıç<input type="date" name="start_date" value="${s.start_date ? new Date(s.start_date).toISOString().slice(0, 10) : ''}"></label><label>Bitiş<input type="date" name="end_date" value="${s.end_date ? new Date(s.end_date).toISOString().slice(0, 10) : ''}"></label></div>
<label>Not<input name="notes" value="${h(s.notes)}" placeholder="Paket ayrıntısı, özel fiyat, kapsam"></label><div class="row"><button>Kaydet</button></div></form>
${ctx.user.role === 'admin' ? `<form method="post" action="/hizmet/${s.id}/sil" data-confirm="Bu hizmet kaydı silinsin mi?">${f}<button class="danger">Kaydı sil</button></form>` : ''}</details></div>`).join('') : '<p class="muted">Bu müşteriye henüz hizmet eklenmedi.</p>'}
<details class="add"><summary>Hizmet ekle</summary><form class="row" method="post" action="/musteriler/${c.id}/hizmet">${f}<label style="flex:1;min-width:260px">Katalogdan modül<select name="service_id" required>${catalog.map(s => `<option value="${s.id}">${h(s.cat)} — ${h(s.code)} ${h(s.name)}</option>`).join('')}</select></label>
<label>Durum<select name="status">${opts(CS_ST, 'teklif')}</select></label><label>Başlangıç<input type="date" name="start_date"></label><button class="gold">Ekle</button></form></details></section>

<section class="card" id="projeler"><h2>Projeler</h2>
${prjs.length ? `<div class="tbl"><table><tr><th>Proje</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>${prjs.map(p => `<tr><td><a href="/projeler/${p.id}">${h(p.name)}</a></td><td>${badge(PR_ST[p.status])}</td><td>${p.done}/${p.total}</td><td>${fmtDate(p.due_date)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Proje yok.</p>'}
<details class="add"><summary>Yeni proje</summary><form class="row" method="post" action="/musteriler/${c.id}/proje">${f}<label style="flex:1;min-width:240px">Proje adı<input name="name" required></label><label>Teslim<input type="date" name="due_date"></label><button class="gold">Proje aç</button></form></details></section>

<section class="card" id="onaylar"><h2>Onaylar</h2>
${aps.length ? `<div class="tbl"><table><tr><th>Konu</th><th>Durum</th><th>Müşteri notu</th><th>Tarih</th></tr>${aps.map(x => `<tr><td><a href="/onaylar/${x.id}">${h(x.title)}</a></td><td>${badge(AP_ST[x.status], x.status === 'onaylandi' ? 'ok' : x.status === 'reddedildi' ? 'bad' : 'warn')}</td><td>${h([x.choice, x.comment].filter(Boolean).join(' · ') || '—')}</td><td>${fmtDate(x.decided_at || x.created_at)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz onay istenmedi.</p>'}
<details class="add"><summary>Onaya gönder</summary><form class="stack" method="post" action="/musteriler/${c.id}/onay">${f}<div class="row"><label style="flex:1;min-width:240px">Konu<input name="title" required placeholder="Kasım gönderi takvimi"></label>
<label>Proje<select name="project_id"><option value="">—</option>${prjs.map(p => `<option value="${p.id}">${h(p.name)}</option>`).join('')}</select></label></div>
<label>Açıklama ya da bağlantı<textarea name="body" rows="2"></textarea></label>${decisions.requestFields()}<div><button class="gold">Onaya gönder</button></div></form></details>
<p class="muted">Müşteri portala girmek zorunda değil: <a href="/musteriler/${c.id}/karar">karar bağlantısı</a> gönderin, e-postasını doğrulayıp giriş yapmadan karar versin.</p></section>

<section class="card"><h2>Portal kullanıcıları</h2>
${cu.length ? `<div class="tbl"><table><tr><th>Ad</th><th>E-posta</th><th>Son giriş</th></tr>${cu.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.email)}</td><td>${fmtDate(x.last_login)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Müşteri henüz portala davet edilmedi.</p>'}
${ctx.user.role === 'admin' ? `<details class="add"><summary>Portal hesabı aç</summary><form class="row" method="post" action="/ekip">${f}<input type="hidden" name="role" value="client"><input type="hidden" name="client_id" value="${c.id}">
<label>Ad soyad<input name="name" required></label><label>E-posta<input type="email" name="email" required></label><label>İlk şifre<input name="password" required minlength="10" autocomplete="off"></label><button class="gold">Portal hesabı aç</button></form></details>` : ''}</section>`;
  if (!splitRecord(ctx)) return send(res, 200, layout(ctx, c.name, `<nav class="crumb"><a href="/musteriler">Müşteriler</a></nav>${HEAD}${DET}${REST}`, '/musteriler'));
  const lastNote = await one('SELECT n.kind, n.body, n.created_at FROM client_notes n WHERE n.client_id=$1 ORDER BY n.created_at DESC LIMIT 1', [c.id]).catch(() => null);
  const activeSvc = svcs.filter(x => x.status === 'aktif').length; const openPrj = prjs.filter(x => x.status !== 'tamamlandi').length; const waitAp = aps.filter(x => x.status === 'bekliyor').length;
  const sum = [t`${activeSvc} aktif hizmet · ${openPrj} açık proje · ${waitAp} bekleyen onay`, lastNote ? t`Son temas: ${fmtDate(lastNote.created_at)} — ${String(lastNote.body || '').slice(0, 140)}` : 'Henüz temas kaydı yok.', ...(cu.length ? [] : ['Müşteri portalı hesabı yok.'])];
  const kv = [['Durum', badge(CLIENT_ST[c.status])], ['Yetkili', h(c.contact_name || '—')], ['Telefon', c.phone ? `<a href="tel:${h(c.phone.replace(/[^+\d]/g, ''))}">${h(c.phone)}</a>` : '—'],
    ['E-posta', c.email ? `<a href="mailto:${h(c.email)}">${h(c.email)}</a>` : '—'], ['Sektör', h(c.sector || '—')], ['Portal', h(t`${cu.length} hesap`)]];
  const SIDE = `<div class="page-head"><div><h1>${h(c.name)}</h1></div><nav class="jump" aria-label="Sayfa içi"><a href="#hizmetler">Hizmetler</a><a href="#projeler">Projeler</a><a href="#onaylar">Onaylar</a><a href="/musteriler/${c.id}/siteler">Siteler</a><a href="/satis/${c.id}">Satış geçmişi</a><a href="/musteriler/${c.id}/karar">Karar bağlantısı</a></nav></div>
<dl class="kv rec-kv">${kv.map(([k, v]) => `<dt class="muted">${k}</dt><dd>${v}</dd>`).join('')}</dl>${DET}`;
  send(res, 200, layout(ctx, c.name, `<nav class="crumb"><a href="/musteriler">Müşteriler</a></nav><div class="rec"><aside class="rec-side">${SIDE}</aside><div class="rec-main"><section class="summary"><h2>Özet</h2>${sum.map(x => `<p>${h(x)}</p>`).join('')}</section>${REST}</div></div>`, '/musteriler'));
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
  const rq = parseRequest(b); if (rq.error) throw new HttpError(400, rq.error);
  const r = await one('INSERT INTO approvals (agency_id, client_id, project_id, title, body, requested_by, kind, options) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [ctx.user.agency_id, c.id, pid, nn(b.title), nn(b.body), ctx.user.id, rq.kind, rq.options ? JSON.stringify(rq.options) : null]);
  await audit(ctx, 'approval.request', { id: r.id, client: c.id }); redirect(res, `/musteriler/${c.id}`);
});

// projeler, görevler ve onaylar: ext-work.js

// ----- katalog -----
route('GET', '/katalog', async (ctx, res) => {
  need(ctx, ...STAFF);
  const cats = await all('SELECT * FROM service_categories WHERE agency_id=$1 ORDER BY sort', [ctx.user.agency_id]);
  const svcs = await all('SELECT * FROM services WHERE agency_id=$1 ORDER BY code', [ctx.user.agency_id]);
  const showPrice = ctx.user.role === 'admin';
  send(res, 200, layout(ctx, 'Katalog', `<h1>Hizmet kataloğu</h1><p class="muted">${svcs.length} modül · ${cats.length} kategori${showPrice ? ' · fiyatlar KDV hariç, yalnızca yöneticiye görünür' : ''}</p>
${cats.map(c => `<details class="card"><summary>${h(c.name)} <span class="muted">(${svcs.filter(s => s.category_id === c.id).length})</span></summary><p class="muted">${h(c.summary)}</p>
<div class="tbl"><table><tr><th>Kod</th><th>Modül</th><th>Alt grup</th><th>Faturalama</th>${showPrice ? '<th>TL</th><th>EUR</th>' : ''}<th>Durum</th></tr>
${svcs.filter(s => s.category_id === c.id).map(s => `<tr><td>${h(s.code)}</td><td><a href="/katalog/${s.id}">${h(s.name)}</a>${s.playbook ? ' ' + badge('Kitap', 'ok') : ''}</td><td>${h(s.sub)}</td><td>${h(s.billing)}</td>${showPrice ? `<td>${fmtMoney(s.price_try)}</td><td>${fmtMoney(s.price_eur)}</td>` : ''}<td>${h(s.availability)}</td></tr>`).join('')}</table></div></details>`).join('')}`, '/katalog'));
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
// Bugün: acil site uyarılarını 30 gün ertele (bakım kararı sonraya bırakıldıysa)
route('POST', '/bugun/site-ertele', async (ctx, res) => {
  need(ctx, 'admin'); const until = new Date(Date.now() + 30 * 864e5).toISOString();
  await q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,'today.sites_snooze',$2) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [ctx.user.agency_id, until]);
  await audit(ctx, 'settings.update', { key: 'today.sites_snooze', until }); redirect(res, '/panel');
});
// sayfa rehberini kişi başına gizle/göster (çerez, 1 yıl)
route('POST', '/rehber', async (ctx, res) => {
  if (!ctx.user) throw new HttpError(401);
  const back = /^\/[A-Za-z0-9/_-]*$/.test(ctx.body.back || '') ? ctx.body.back : '/';
  redirect(res, back, { 'Set-Cookie': cookie('rehber', ctx.body.rehber === 'kapali' ? 'kapali' : 'acik', 31536000) });
});
route('GET', '/kayitlar', async (ctx, res) => {
  need(ctx, 'admin');
  const rows = await all('SELECT a.*, u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.agency_id=$1 ORDER BY a.created_at DESC LIMIT 200', [ctx.user.agency_id]);
  send(res, 200, layout(ctx, 'Kayıtlar', `<div class="page-head"><h1>İşlem kayıtları</h1><a class="btn ghost" href="/veri-saklama">Veri saklama (KVKK)</a></div><div class="tbl"><table><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th><th>Ayrıntı</th></tr>
${rows.map(r => `<tr><td>${new Date(r.created_at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</td><td>${h(r.name || (r.detail?.via === 'api' ? 'API (n8n)' : 'Sistem'))}</td><td>${h(EVENT_LABEL[r.action] || r.action)}<br><code class="muted">${h(r.action)}</code></td><td><code>${h(JSON.stringify(r.detail))}</code></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Kayıt yok.</td></tr>'}</table></div>`, '/kayitlar'));
});

// ----- müşteri portalı -----
route('GET', '/portal', async (ctx, res) => {
  need(ctx, 'client'); const cid = ctx.user.client_id;
  const c = await one('SELECT * FROM clients WHERE id=$1', [cid]);
  const svcs = await all(`SELECT cs.*, s.name, sc.name cat FROM client_services cs JOIN services s ON s.id=cs.service_id JOIN service_categories sc ON sc.id=s.category_id WHERE cs.client_id=$1 AND cs.status<>'durduruldu' ORDER BY cs.created_at`, [cid]);
  const aps = await all(`SELECT * FROM approvals WHERE client_id=$1 ORDER BY (status<>'bekliyor'), created_at DESC LIMIT 30`, [cid]);
  const prjs = await all(`SELECT p.*, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int total, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done FROM projects p WHERE p.client_id=$1 ORDER BY (p.status='tamamlandi'), p.created_at DESC`, [cid]);
  const f = csrfField(ctx); const pending = aps.filter(a => a.status === 'bekliyor');
  const todo = await portalActions({ all, cid, h, fmtMoney }) + (flow ? await flow.portalFlow(cid).catch(() => '') : '');
  send(res, 200, layout(ctx, 'Portalım', `<div><p class="eyebrow">Müşteri portalı</p><h1>${h(c?.name || 'Portal')}</h1></div>
${todo}
${pending.length ? `<section class="card" style="border-color:var(--champ)"><h2>Onayınızı bekleyenler (${pending.length})</h2>${pending.map(a => decisionForm(a, `/portal/onay/${a.id}`, f, h)).join('')}</section>` : ''}
<section><h2 style="margin-bottom:12px">Hizmetleriniz</h2><div class="grid">${svcs.map(s => `<div class="card"><span class="muted">${h(s.cat)}</span><h3>${h(s.name)}</h3><div>${badge(CS_ST[s.status], s.status === 'aktif' ? 'ok' : 'warn')}</div></div>`).join('') || '<p class="muted">Hizmet kaydı yok.</p>'}</div></section>
<section class="card"><h2>Projeleriniz</h2>${prjs.length ? `<div class="tbl"><table><tr><th>Proje</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>${prjs.map(p => `<tr><td>${h(p.name)}</td><td>${badge(PR_ST[p.status])}</td><td>${p.total ? Math.round(100 * p.done / p.total) : 0}%</td><td>${fmtDate(p.due_date)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Proje yok.</p>'}</section>
<section class="card"><h2>Geçmiş onaylar</h2>${aps.filter(a => a.status !== 'bekliyor').map(a => `<p style="margin:0">${badge(AP_ST[a.status], a.status === 'onaylandi' ? 'ok' : 'bad')} ${h(a.title)}${a.choice ? ` · ${h(a.choice)}` : ''} <span class="muted">· ${fmtDate(a.decided_at)}</span></p>`).join('') || '<p class="muted">Henüz yok.</p>'}</section>`, '/portal'));
});
route('POST', '/portal/onay/:id', async (ctx, res, p) => {
  need(ctx, 'client');
  const ap = await one(`SELECT * FROM approvals WHERE id=$1 AND client_id=$2`, [int(p.id), ctx.user.client_id]);
  if (!ap || ap.status !== 'bekliyor') throw new HttpError(404, 'Onay bulunamadı ya da zaten karar verildi.');
  await decisions.decide(ctx, ap, ctx.body, ctx.files, 'portal', ctx.user.name);
  redirect(res, '/portal');
});

// ---------- sunucu ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ctx = { req, url }; const store = { lang: 'tr' };
  return als.run(store, async () => { try {
    Object.assign(ctx, await loadSession(req));
    store.lang = ctx.lang = pickLang(ctx.user, parseCookies(req), req.headers['accept-language']);
    if (req.method === 'POST') {
      ctx.body = await readBody(req, url.pathname); ctx.files = ctx.body.__files || []; delete ctx.body.__files;
      const isApi = url.pathname.startsWith('/api/');
      // karar bağlantısı sayfaları oturumsuzdur: köken denetlenir, karar için doğrulanmış karar çerezi gerekir (SameSite=Lax)
      const open = isApi || ['/giris', '/kurulum', '/dil'].includes(url.pathname) || url.pathname.startsWith('/karar/');
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
    if (url.pathname.startsWith('/api/')) {
      const st = e instanceof HttpError ? e.status : 500; if (st === 500) console.error(e);
      if (!res.headersSent) { res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: st === 500 ? 'Beklenmeyen bir hata oluştu.' : (e.message || 'Hata') })); }
      return;
    }
    if (e instanceof HttpError && e.status === 401) return redirect(res, '/giris');
    if (e instanceof HttpError && e.status === 403 && req.method === 'GET' && ctx.user?.role === 'client' && !url.pathname.startsWith('/portal')) return redirect(res, '/portal');
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    const msg = status === 500 ? 'Beklenmeyen bir hata oluştu.' : (e.message || 'Hata');
    const body = `<h1>${status === 404 ? 'Bulunamadı' : 'Olmadı'}</h1><div class="err">${h(msg)}</div><p><a href="/">Ana sayfaya dön</a></p>`;
    if (!res.headersSent) send(res, status, ctx.user ? layout(ctx, 'Hata', body) : authPage('Hata', body));
  } });
});

import { registerSites, migrateSites } from './ext-sites.js';
import { registerQuotes, migrateQuotes } from './ext-quotes.js';
import { registerInvoices, migrateInvoices } from './ext-invoices.js';
import { registerToday, portalActions } from './ext-today.js';
import { registerWork, migrateWork } from './ext-work.js';
import { registerSync, migrateSync } from './ext-sync.js';
import { registerAutomation, migrateAutomation, EVENT_LABEL } from './ext-automation.js';
import { registerForge, migrateForge } from './ext-forge.js';
registerSites({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, audit, HttpError, int, STAFF });
registerQuotes({ route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, audit, HttpError, int, nn });
registerInvoices({ route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, audit, HttpError, int, nn });
hooks = registerAutomation({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, TK_ST, PR_ST, audit, safeEqual, SETUP_TOKEN, APP_URL: process.env.APP_URL });
const forge = registerForge({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, safeEqual, audit, SETUP_TOKEN, VERSION });
const crm = registerCrm({ route, all, one, q, need, layout, h, badge, fmtMoney, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, opts });
const freelance = registerFreelance({ route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, opts });
registerRetention({ route, all, one, q, need, layout, h, csrfField, HttpError, redirect, send, audit, fmtDate });
settingsApi = registerSettings({ route, all, q, need, layout, h, csrfField, redirect, send, audit });
const todayPage = registerToday({ all, one, h, layout, need, STAFF, csrfField, forgePending: forge.pendingCount, extraActions: async (a) => [...crmActions(await crm.openLeads(a)), ...packageActions(await freelance.awaitingReview(a)), ...(await flow.todayActions(a))] });
registerSync({ route, one, all, q, HttpError, safeEqual, SETUP_TOKEN, onSynced: (a, before) => hooks?.onSiteSync(a, before) });
decisions = registerDecisions({ route, all, one, q, need, layout, authPage, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, AP_ST, APP_URL: process.env.APP_URL, cookie, parseCookies,
  sendMail: (a, m) => hooks ? hooks.sendMail(a, m) : Promise.resolve(false) });
ai = registerAi({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, postHook: hooks.postHook, api: hooks.api, apiBody: hooks.body, onResult: (...a) => suggest.onResult(...a) });
suggest = registerSuggest({ route, all, one, q, need, h, badge, fmtDate, csrfField, HttpError, int, redirect, STAFF, audit, aiDraft: (...a) => ai.draft(...a) });
flow = registerFlow({ route, all, one, q, need, h, badge, fmtDate, csrfField, HttpError, int, redirect, STAFF, audit, TK_ST });
registerIcons({ route });
const playbooks = registerPlaybooks({ route, all, one, q, need, layout, h, badge, csrfField, HttpError, int, redirect, send, STAFF, audit, fmtDate });
registerWork({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, audit, HttpError, int, nn, opts, ROLE, PR_ST, TK_ST, AP_ST, CS_ST, STAFF, redirect, send, projectExtra: async (ctx, pr) => (await playbooks.projectCard(ctx, pr)) + (await ai.projectCard(ctx, pr)), flowBanner: (ctx, pr, tasks) => flow.projectBanner(ctx, pr, tasks),
  taskExtra: async (ctx, tk) => (await flow.taskCard(ctx, tk)) + (await ai.taskCard(ctx, tk)) + (await suggest.taskCards(ctx, tk)), decisions });

migrate().then(() => migrateSites({ q, one })).then(() => migrateQuotes({ q })).then(() => migrateInvoices({ q })).then(() => migrateWork({ q })).then(() => migrateSync({ q, one })).then(() => migrateAutomation({ q })).then(() => migrateForge({ q })).then(() => migrateCrm({ q })).then(() => migrateFreelance({ q })).then(() => migrateRetention({ q })).then(() => migratePlaybooks({ q, all })).then((n) => n && console.log(`hizmet kitabı yazıldı: ${n}`)).then(() => migrateDecisions({ q })).then(() => migrateFlow({ q })).then(() => migrateAi({ q })).then(() => migrateSuggest({ q })).then(() => loadThemes(all)).then(() => server.listen(PORT, () => console.log(`Arvela OS ${VERSION} :${PORT}`))).catch(e => { console.error('başlatılamadı', e); process.exit(1); });
