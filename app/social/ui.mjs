// Arvela Social — sayfa iskeleti ve stiller (Arvela marka kılavuzu: Night/Paper, şampanya altını, Poppins/Inter).
import { esc } from './lib.mjs';
import { LANDING_CSS } from './landing-css.mjs';

export const badge = (t, tone = '') => `<span class="badge ${tone}">${esc(t)}</span>`;
export const csrf = (ctx) => `<input type="hidden" name="csrf" value="${esc(ctx.session?.csrf || '')}">`;
export const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.name)}</option>`).join('');

const ICON = {
  takvim: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  gonderi: '<path d="M4 5h16v11H8l-4 4z"/>',
  marka: '<path d="M12 3l9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
  medya: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-9 9"/>',
  ekip: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 15c3 0 6 1.5 6 4"/>',
  paket: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>',
  yonetim: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  bugun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  rapor: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  yz: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

export const CSS = `
:root{--night:#0B0D12;--ink:#141A22;--graphite:#2A2F38;--gold:#B08433;--champ:#E2BE7A;--champ-l:#F3E6CC;--stone:#6B6558;--paper:#F7F4EE;--line:#DDD7CA;--surf:#fff;--soft:#FBF9F5;--muted-d:#A3ABB8;--ok:#24502B;--ok-bg:#E3EFE4;--warn:#6B4A0F;--warn-bg:#F7E9CF;--bad:#7A2418;--bad-bg:#F6E1DE}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.5}
a{color:#7A5A1E}h1,h2,h3{font-family:Poppins,Inter,sans-serif;font-weight:500;margin:0;letter-spacing:-.2px}h1{font-size:30px;line-height:1.15}h2{font-size:20px}h3{font-size:16px}
.ic{width:20px;height:20px;flex:none}
.app{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
.side{background:var(--night);color:#fff;padding:20px 14px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh}
.side .logo{display:flex;align-items:baseline;gap:8px;padding:6px 10px 18px;color:#fff;text-decoration:none;font-family:Poppins,sans-serif;font-size:21px;font-weight:500}
.side .logo span{font-size:11px;letter-spacing:2px;color:var(--champ)}
.side a.nav{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;color:#D8DCE3;text-decoration:none;font-weight:500}
.side a.nav:hover{background:#1A1E26;color:#fff}.side a.nav.on{background:var(--graphite);color:#fff;box-shadow:inset 3px 0 0 var(--champ)}
.side .grow{flex:1}.side .me{font-size:13px;color:var(--muted-d);padding:10px 12px;border-top:1px solid #20242C}
.side .me form{display:inline}.side .me button{background:none;border:0;color:var(--champ);padding:0;cursor:pointer;font:inherit}
.main{min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:12px;padding:14px 28px;border-bottom:1px solid var(--line);background:var(--paper);position:sticky;top:0;z-index:5}
.top .grow{flex:1}.top select{min-width:200px}
.menu-btn{display:none;background:none;border:0;padding:6px;color:var(--ink)}
.wrap{padding:28px;max-width:1280px;width:100%;display:flex;flex-direction:column;gap:20px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.page-head p{margin:4px 0 0;color:var(--stone)}
.card{background:var(--surf);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.row>label{flex:1;min-width:180px}
.stack{display:flex;flex-direction:column;gap:12px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--stone)}
label.chk{flex-direction:row;align-items:center;gap:8px;font-weight:500;color:var(--ink);font-size:14px}
input,select,textarea{font:inherit;font-size:15px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 12px;width:100%}
input[type=checkbox],input[type=radio]{width:auto}textarea{resize:vertical}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
button,.btn{font:inherit;font-weight:600;font-size:14px;border-radius:8px;padding:10px 16px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;justify-content:center}
button.ghost,.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}button.gold,.btn.gold{background:var(--champ);border-color:var(--champ);color:var(--night)}
button.danger{background:transparent;color:var(--bad);border-color:#E2B1A9}button:disabled{opacity:.5;cursor:not-allowed}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;background:#EEE9DF;color:#4A4538;white-space:nowrap}
.badge.ok{background:var(--ok-bg);color:var(--ok)}.badge.warn{background:var(--warn-bg);color:var(--warn)}.badge.bad{background:var(--bad-bg);color:var(--bad)}.badge.gold{background:var(--champ-l);color:#6B4A0F}
.muted{color:var(--stone)}.err{background:var(--bad-bg);color:var(--bad);padding:12px 14px;border-radius:10px}.flash{background:var(--ok-bg);color:var(--ok);padding:12px 14px;border-radius:10px}
.note{background:var(--champ-l);padding:12px 14px;border-radius:10px;color:#4A3A16}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #ECE6DA;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--stone);font-weight:600}
.tbl{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:16px}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi>div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}
.kpi b{display:block;font-family:Poppins,sans-serif;font-size:26px;font-weight:500}.kpi span{font-size:13px;color:var(--stone)}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff}
.cal .dow{padding:8px 10px;font-size:12px;font-weight:600;color:var(--stone);background:var(--soft);border-bottom:1px solid var(--line)}
.cal .day{min-height:128px;padding:8px;border-right:1px solid #ECE6DA;border-bottom:1px solid #ECE6DA;display:flex;flex-direction:column;gap:6px}
.cal .day:nth-child(7n){border-right:0}.cal .day.out{background:#FAF8F3;color:#B5AE9F}.cal .day.today .n{background:var(--ink);color:#fff;border-radius:999px;padding:0 7px}
.cal .n{font-size:13px;font-weight:600;align-self:flex-start}.cal .add{font-size:12px;color:var(--stone);text-decoration:none;margin-top:auto;opacity:.6}.cal .day:hover .add{opacity:1}
.chipp{display:block;font-size:12.5px;line-height:1.35;padding:6px 8px;border-radius:8px;background:var(--soft);border:1px solid #ECE6DA;color:var(--ink);text-decoration:none;border-left:3px solid #C9C1B0;overflow:hidden}
.chipp.onay{border-left-color:#D69A2D}.chipp.onaylandi{border-left-color:#5E9E6A}.chipp.paylasildi{border-left-color:#2F6B3A;background:#F1F7F1}.chipp.duzeltme{border-left-color:#D9663A}.chipp.fikir{border-style:dashed}
.chipp small{display:block;color:var(--stone)}
.plat{display:inline-block;font-size:11px;font-weight:600;padding:1px 6px;border-radius:6px;background:#EEE9DF;color:#4A4538;margin-right:3px}
.thumbs{display:flex;gap:8px;flex-wrap:wrap}.thumbs img{width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.media-grid figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.media-grid img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.media-grid figcaption{padding:6px 8px;font-size:12px;color:var(--stone);display:flex;justify-content:space-between;gap:6px}
.tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.tpl-grid label{flex-direction:row;align-items:center;gap:8px;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;cursor:pointer;color:var(--ink);font-weight:500;font-size:14px}.tpl-grid input{margin:0}
.tpl-grid label:has(input:checked){border-color:var(--gold);box-shadow:0 0 0 2px var(--champ-l)}
.preview{background:#E9E4D8;border-radius:16px;padding:16px;display:flex;justify-content:center}.preview img{max-width:100%;max-height:560px}.preview svg{height:auto;max-width:100%}.preview img,.preview svg{border-radius:8px;box-shadow:0 1px 0 #0001}
.count{font-size:12px;color:var(--stone)}.count.over{color:var(--bad);font-weight:600}
.swatch{display:inline-block;width:18px;height:18px;border-radius:5px;border:1px solid #0002;vertical-align:middle}
@media print{.side,.top,.no-print,.menu-btn{display:none!important}.app{display:block}.wrap{padding:0}.card{break-inside:avoid;box-shadow:none}body{background:#fff}}
.pub-top{background:var(--night);color:#fff;padding:16px 24px;font-family:Poppins,sans-serif;font-size:20px}.pub-top small{font-size:11px;letter-spacing:2px;color:var(--champ)}.pub{max-width:760px;margin:0 auto;padding:28px 18px}
.auth{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}.auth .art{background:var(--night);color:#fff;padding:56px;display:flex;flex-direction:column;justify-content:space-between}
.auth .art h1{font-size:44px;line-height:1.1;max-width:520px}.auth .art p{color:var(--muted-d);font-size:17px;max-width:480px}.auth .art .gold{color:var(--champ)}
.auth .form{display:flex;align-items:center;justify-content:center;padding:40px}.auth .form>div{width:100%;max-width:400px;display:flex;flex-direction:column;gap:16px}
.steps{display:flex;flex-direction:column;gap:10px;counter-reset:s}.steps>div{display:flex;gap:12px;align-items:flex-start}
.steps>div::before{counter-increment:s;content:counter(s);flex:none;width:26px;height:26px;border-radius:999px;background:var(--champ-l);color:#6B4A0F;font-weight:700;font-size:13px;display:grid;place-items:center}
.steps>div.done::before{content:'✓';background:var(--ok-bg);color:var(--ok)}
@media (max-width:900px){.app{grid-template-columns:1fr}.side{position:fixed;inset:0 auto 0 0;width:270px;transform:translateX(-100%);transition:transform .2s;z-index:30}
.side.open{transform:none}.menu-btn{display:inline-flex}.wrap{padding:18px}.top{padding:12px 16px}.auth{grid-template-columns:1fr}.auth .art{padding:32px}.auth .art h1{font-size:32px}
.cal{display:flex;flex-direction:column}.cal .dow{display:none}.cal .day{min-height:0;border-right:0}.cal .day.out{display:none}.cal .day:not(:has(.chipp)) .add{display:none}.cal .day:not(:has(.chipp)):not(.today){display:none}}
${LANDING_CSS}`;

export function layout(ctx, title, body, active = '') {
  const u = ctx.user; const ws = ctx.ws;
  const nav = [['/', 'bugun', 'Bugün'], ['/takvim', 'takvim', 'Takvim'], ['/gonderiler', 'gonderi', 'Gönderiler'], ['/markalar', 'marka', 'Markalar'], ['/medya', 'medya', 'Medya'], ['/yapay-zeka', 'yz', 'Yapay zekâ'], ['/rapor', 'rapor', 'Rapor'],
    ...(u.role === 'owner' ? [['/ekip', 'ekip', 'Ekip'], ['/paket', 'paket', 'Paket']] : []), ...(ctx.admin ? [['/yonetim', 'yonetim', 'Yönetim']] : [])];
  const brands = ctx.brands || [];
  const sw = brands.length > 1 ? `<form method="post" action="/marka-sec" class="row" style="align-items:center">${csrf(ctx)}<select name="brand_id" aria-label="Marka" data-autosubmit>${brands.map(b => `<option value="${b.id}"${b.id === ctx.brand?.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select><noscript><button class="ghost">Seç</button></noscript></form>`
    : ctx.brand ? `<strong>${esc(ctx.brand.name)}</strong>` : '';
  const banner = ws && !ctx.lim?.usable ? `<div class="err">Hesabınız salt okunur durumda (${ws.status === 'askida' ? 'askıya alındı' : 'deneme süresi bitti'}). Devam etmek için <a href="/paket">paketinizi seçin</a>.</div>`
    : ws?.status === 'deneme' ? `<div class="note">Deneme sürümü: ${esc(String(Math.max(0, Math.ceil((new Date(ws.trial_ends) - new Date()) / 864e5) + 1)))} gün kaldı. <a href="/paket">Paket seç</a></div>` : '';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Arvela Social</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head><body>
<div class="app"><nav class="side" id="side" aria-label="Ana menü"><a class="logo" href="/">Arvela <span>SOCIAL</span></a>
${nav.map(([href, ic, label]) => `<a class="nav${active === href ? ' on' : ''}" href="${href}">${icon(ic)}${label}</a>`).join('')}
<div class="grow"></div><div class="me"><a href="/hesabim" style="color:inherit">${esc(u.name)}</a><br>${esc(ws?.name || '')} · <form method="post" action="/cikis">${csrf(ctx)}<button>Çıkış</button></form></div></nav>
<div class="main"><header class="top"><button class="menu-btn" data-menu aria-label="Menüyü aç">${icon('menu')}</button>${sw}<span class="grow"></span>
${u.role !== 'approver' ? '<a class="btn gold" href="/gonderi/yeni">+ Gönderi</a>' : ''}</header><main class="wrap">${banner}${body}</main></div></div></body></html>`;
}

// Oturumsuz geniş sayfa (müşteri onay bağlantısı)
export function publicPage(title, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Arvela Social</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head><body><header class="pub-top"><span>Arvela <small>SOCIAL</small></span></header><main class="pub stack">${body}</main>
<p class="muted" style="text-align:center;font-size:12px;padding:24px">Arvela Digital &amp; AI · Ek. Büyüt. Yelken aç.</p></body></html>`;
}
export function authPage(title, body, side = '') {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Arvela Social</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head><body><div class="auth">
<div class="art"><a href="/" style="color:#fff;text-decoration:none;font-family:Poppins,sans-serif;font-size:24px">Arvela <span style="font-size:12px;letter-spacing:2px;color:#E2BE7A">SOCIAL</span></a>
${side || `<div><h1>Sosyal medyanız, <span class="gold">markanızın sesiyle</span> kendiliğinden planlansın.</h1><p style="margin-top:16px">Yapay zekâ aylık takviminizi ve metinlerinizi hazırlar, marka şablonlarınızla görselleri üretir; siz onaylar, paylaşırsınız.</p></div>`}
<p style="font-size:13px">Arvela Digital &amp; AI · Ek. Büyüt. Yelken aç.</p></div><div class="form"><div>${body}</div></div></div></body></html>`;
}
