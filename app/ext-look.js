// Arvela OS — görünüm katmanı (0.23 Atlas): gruplu akordiyon menü, üst çubuk, mobil çekmece, açık/koyu mod.
// Renkler server.js'teki CSS değişkenleriyle tanımlı; koyu mod yalnız değişkenleri ve birkaç ters renkli bileşeni değiştirir.

export const NAV_ICON = { '/panel': 'home', '/gorevler': 'check', '/onaylar': 'bell', '/satis': 'flow', '/musteriler': 'users', '/teklifler': 'doc', '/faturalar': 'receipt', '/projeler': 'folder', '/paketler': 'box', '/siteler': 'globe', '/katalog': 'book', '/otomasyonlar': 'bolt', '/odemeler': 'wallet', '/ayarlar': 'gear', '/portal': 'home', '/portal/siteler': 'globe', '/portal/teklifler': 'doc', '/portal/faturalar': 'receipt' };
export function navGroups(u) {
  if (!u) return [];
  if (u.role === 'client') return [{ key: '', items: [['/portal', 'Portalım'], ['/portal/siteler', 'Sitelerim'], ['/portal/teklifler', 'Tekliflerim'], ['/portal/faturalar', 'Faturalarım']] }];
  if (u.role === 'freelancer') return [{ key: '', items: [['/paketler', 'İş paketlerim'], ['/gorevler', 'Görevlerim']] }];
  const admin = u.role === 'admin';
  return [
    { key: 'gunluk', label: 'Günlük', items: [['/panel', 'Bugün'], ['/gorevler', 'Görevlerim'], ['/onaylar', 'Onaylar']] },
    { key: 'satis', label: 'Satış ve müşteri', items: [['/satis', 'Satış hattı'], ['/musteriler', 'Müşteriler'], ...(admin ? [['/teklifler', 'Teklifler'], ['/faturalar', 'Faturalar']] : [])] },
    { key: 'teslimat', label: 'Teslimat', items: [['/projeler', 'Projeler'], ['/paketler', 'İş paketleri'], ['/siteler', 'Siteler'], ['/katalog', 'Katalog']] },
    { key: 'yonetim', label: 'Yönetim', items: [['/otomasyonlar', 'Otomasyonlar'], ...(admin ? [['/odemeler', 'Freelancer ödemeleri'], ['/ayarlar', 'Ayarlar']] : [])] },
  ];
}

export const NAV_CSS = `
.skip{position:absolute;left:-9999px;top:8px}.skip:focus{left:12px;z-index:100;background:var(--surf);color:var(--ink);padding:10px 14px;border-radius:10px}
.side-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.side-x{display:none}
.side .side-nav{display:flex;flex-direction:column;gap:8px;overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth;flex:1;min-height:0;margin-right:-8px;padding-right:8px;scrollbar-width:thin;scrollbar-color:#2A303A transparent}
.side .side-nav::-webkit-scrollbar{width:6px}.side .side-nav::-webkit-scrollbar-thumb{background:#2A303A;border-radius:6px}
.ng-h{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;padding:0 12px;background:transparent;border:0;border-radius:8px;color:#8B94A1;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.ng-h:hover{background:#151A21;color:#E6E8EC}.ng-h svg{width:16px;height:16px;flex:none;transition:transform .3s cubic-bezier(.2,.8,.2,1)}.ng.shut .ng-h svg{transform:rotate(-90deg)}
.ng-b{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows .32s cubic-bezier(.2,.8,.2,1),opacity .24s ease}.ng.shut .ng-b{grid-template-rows:0fr;opacity:0}
.ng-i{overflow:hidden;min-height:0;display:flex;flex-direction:column;gap:2px}
.ng-i a{transition:visibility 0s}.ng.shut .ng-i a{visibility:hidden;transition:visibility 0s .32s}
.ng.flat{display:flex;flex-direction:column;gap:2px}
.side .side-nav a{display:flex;align-items:center;gap:11px;min-height:38px;padding:0 12px;border-radius:10px;color:#C9CED6;text-decoration:none;font-size:14.5px;font-weight:500}
.side .side-nav a svg{width:18px;height:18px;flex:none;opacity:.8}
.side .side-nav a:hover{background:#171C24;color:#fff}.side .side-nav a.on{background:#1F252E;color:#fff;box-shadow:inset 3px 0 0 var(--champ)}.side .side-nav a.on svg{opacity:1;color:var(--champ)}
.topbar{position:sticky;top:0;z-index:15;display:flex;align-items:center;gap:10px;height:60px;padding:0 32px;background:var(--paper);border-bottom:1px solid var(--line)}
.menu-btn,.tb-brand,.tb-s2,.scrim{display:none}
.tb-search{display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--surf);color:var(--stone);text-decoration:none;font-size:14px;width:min(360px,40vw)}
.tb-search:hover{border-color:var(--champ);color:var(--ink)}.tb-search svg{width:16px;height:16px;flex:none}.tb-search kbd{margin-left:auto;font:12px Inter,sans-serif;border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--stone)}
.tb-sp{flex:1}.mode-f{margin:0;display:inline-flex}.icon-btn{padding:0;min-height:0;flex:none}.icon-btn:hover{background:var(--sand);color:var(--ink)}
.mode-btn svg+svg{display:none}
@media (max-width:900px){
.shell{margin-left:0}
.topbar{gap:6px;padding:0 10px 0 8px;padding-top:env(safe-area-inset-top);height:calc(60px + env(safe-area-inset-top))}
.menu-btn,.tb-s2{display:inline-flex}.tb-search{display:none}
.tb-brand{display:inline-block;color:var(--ink);font-size:19px;padding:0 4px}.tb-brand span{color:var(--acc-t)}
.icon-btn{width:44px;height:44px}
.side{width:min(86vw,320px);transform:translateX(-102%);visibility:hidden;z-index:40;padding-top:max(16px,env(safe-area-inset-top));transition:transform .34s cubic-bezier(.2,.8,.2,1),visibility 0s .34s}
body.menu-open .side{transform:none;visibility:visible;box-shadow:24px 0 60px rgba(0,0,0,.35);transition:transform .34s cubic-bezier(.2,.8,.2,1)}
body.menu-drag .side{transition:none}
.side-x{display:inline-flex;background:transparent;border-color:#2A303A;color:#C9CED6}.side-x:hover{background:#1A1F27;color:#fff}
.scrim{display:block;position:fixed;inset:0;background:rgba(11,13,18,.5);opacity:0;pointer-events:none;transition:opacity .3s;z-index:35}
body.menu-open .scrim{opacity:1;pointer-events:auto}body.menu-open{overflow:hidden}
.side .side-nav a{min-height:46px;font-size:15.5px}.ng-h{min-height:44px;font-size:12px}
}

.tb-crumb{display:flex;align-items:center;gap:8px;min-width:0;font-size:14px;color:var(--stone);white-space:nowrap;overflow:hidden;flex:0 1 auto}
.tb-path{display:flex;gap:6px;min-width:0;overflow:hidden}.tb-path a{color:var(--stone);text-decoration:none}.tb-path a:hover{color:var(--ink)}
.tb-title{color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis}.tb-sep{color:var(--stone)}
.topbar .info-btn{min-height:40px;border-radius:10px;flex:none}.topbar .tb-search{flex:0 1 320px;width:auto;min-width:180px}
.tb-new{position:relative;flex:none}.tb-new>summary{list-style:none;min-height:40px;padding:0 16px;border-radius:10px;font-size:14px}.tb-new>summary::-webkit-details-marker{display:none}
.tb-menu{position:absolute;right:0;top:46px;background:var(--surf);border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 40px rgba(11,13,18,.16);padding:6px;min-width:200px;display:flex;flex-direction:column;z-index:30}
.tb-menu a{display:flex;align-items:center;min-height:42px;padding:0 12px;border-radius:8px;color:var(--ink);text-decoration:none;font-size:14.5px}.tb-menu a:hover{background:var(--sand);color:var(--ink)}
main.has-insp{display:grid;grid-template-columns:minmax(0,1fr) var(--insp-w,360px);align-items:start}
.has-insp .page-main{max-width:1180px;margin:0;width:100%}
.insp{position:sticky;top:60px;max-height:calc(100vh - 60px);min-height:calc(100vh - 60px);overflow:auto;background:var(--surf);border-left:1px solid var(--line);padding:24px 22px 32px;display:flex;flex-direction:column;gap:22px;scrollbar-width:thin}
.insp>section{display:flex;flex-direction:column;gap:10px}
.insp h2{font:600 11.5px/1.2 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--stone);margin:0}
.insp .kv{grid-template-columns:110px minmax(0,1fr);gap:10px 12px;font-size:14px;margin:0}.insp .kv dd{overflow-wrap:anywhere}
.insp .flowbar{background:var(--gold-soft);border-color:var(--gold-line);border-radius:14px;padding:16px}.insp .flowbar h2{font:600 16px/1.35 Inter,sans-serif;letter-spacing:0;text-transform:none;color:var(--ink)}
.insp .flowbar .btn{min-height:40px;padding:0 14px;font-size:14px;border-radius:10px}.insp .line{padding:10px 0}
.guide.in-insp{display:none;grid-template-columns:1fr;background:transparent;padding:0;gap:12px}.info-on .guide.in-insp{display:grid}
.guide.in-insp>div{background:var(--gold-soft);border:1px solid var(--gold-line);border-radius:14px;padding:14px 16px}.guide.in-insp .eyebrow{text-transform:none;letter-spacing:0;font-size:14px}
.callout{background:var(--gold-soft);border:1px solid var(--gold-line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
@media (max-width:1200px){main.has-insp{display:block}.insp{position:static;max-height:none;min-height:0;border-left:0;border-top:1px solid var(--line);margin:0 auto;max-width:1240px;padding:24px 40px 56px;background:transparent}}
@media (max-width:900px){.insp{padding:20px 16px 40px}.tb-crumb,.topbar .info-btn b{display:none}.topbar .info-btn{width:44px;height:44px;padding:0;justify-content:center}.tb-new>summary span{display:none}.tb-new>summary{width:44px;padding:0}}
.grid:has(> .card > .stat){gap:0;background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card,14px);overflow:hidden}
.grid:has(> .card > .stat)>.card{border:0;border-radius:0;box-shadow:none;border-left:1px solid var(--line2);margin-left:-1px;padding:16px 18px;gap:2px;background:transparent}.grid:has(> .card > .stat) .stat{font-size:24px}
.ph-meta{color:var(--stone);font-size:15px;margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.page-head h1{font-size:30px}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card,14px);overflow:hidden}
.kpi>div{padding:16px 18px;display:flex;flex-direction:column;gap:3px;border-left:1px solid var(--line2);margin-left:-1px}
.kpi b{font:500 24px/1.2 Poppins,sans-serif;color:var(--ink)}.kpi span{font-size:13px;color:var(--stone)}
.rows{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card,14px);overflow:hidden}
.rows .rh{padding:10px 18px;font-size:13px;font-weight:600;color:var(--stone);background:var(--soft);border-top:1px solid var(--line2)}.rows>.rh:first-child{border-top:0}
.r{display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--line2);min-height:64px}.rows>.r:first-child{border-top:0}
.r.top{background:var(--gold-soft)}.r[hidden]{display:none}
.r .no{width:22px;color:var(--stone);font-size:14px;flex:none;text-align:center}
.r .rt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.r .rt b,.r .rt a.t{font-weight:600;color:var(--ink);text-decoration:none}.r .rt a.t:hover{color:var(--acc-t)}
.r .rs{font-size:13px;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r .ra{display:flex;gap:8px;flex:none;align-items:center;flex-wrap:wrap;justify-content:flex-end}.r .ra .btn{min-height:40px;padding:0 14px;font-size:14px;border-radius:10px}.r .ra form{margin:0}
.chipd{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--line);font-size:12.5px;color:var(--ink2);background:var(--surf);white-space:nowrap}.chipd.late{color:var(--bad-t);border-color:var(--bad-line)}
@media (max-width:700px){.r{flex-wrap:wrap;padding:14px}.r .ra{width:100%;justify-content:flex-start}.r .ra .btn{flex:1 1 auto}.r .rs{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
.fseg{display:inline-flex;gap:2px;background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:3px;flex-wrap:wrap}
.fseg button{min-height:34px;padding:0 12px;border-radius:9px;background:transparent;color:var(--stone);font-size:13.5px;font-weight:500;border:0}.fseg button:hover{background:var(--sand);color:var(--ink)}.fseg button[aria-pressed=true]{background:var(--sand);color:var(--ink);font-weight:600}
.sechead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:-12px}.sechead h2{font:600 12px Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--stone)}
.tl{display:flex;flex-direction:column}.tl-i{display:grid;grid-template-columns:56px 1fr;gap:10px;padding:6px 0;text-decoration:none;color:var(--ink)}.tl-i .tm{color:var(--stone);font-size:13px;padding-top:2px}
.tl-i .bd{border-left:2px solid var(--line);padding:0 0 4px 12px;display:flex;flex-direction:column}.tl-i.cur .bd{border-left-color:var(--champ)}.tl-i b{font-size:14px;font-weight:600}.tl-i span span,.tl-i .bd>span{font-size:13px;color:var(--stone)}.tl-i:hover b{color:var(--acc-t)}
.insp .pulse-row{padding:9px 0}
.stepper{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card,14px);padding:18px 18px 14px;overflow-x:auto}
.stepper ol{list-style:none;margin:0;padding:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(112px,1fr)}
.stepper li{position:relative;display:flex;flex-direction:column;gap:8px;padding-right:10px;font-size:12.5px;color:var(--stone);min-width:0}
.stepper li::before{content:"";position:absolute;left:24px;right:2px;top:11px;height:2px;background:var(--line)}.stepper li:last-child::before{display:none}.stepper li.done::before{background:var(--ok)}
.stepper i{width:24px;height:24px;border-radius:50%;border:2px solid var(--line3);background:var(--surf);position:relative;z-index:1;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;color:#fff}
.stepper li.done i{background:var(--ok);border-color:var(--ok);color:#0B0D12}.stepper li.cur i{border-color:var(--champ);box-shadow:0 0 0 4px var(--champ-l)}.stepper li.cur{color:var(--ink);font-weight:600}
.stepper a{color:inherit;text-decoration:none;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35}.stepper a:hover{color:var(--acc-t)}
.cols2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}@media (max-width:1100px){.cols2{grid-template-columns:1fr}}
.hint{display:none;gap:8px;align-items:flex-start;background:var(--gold-soft);border-radius:10px;padding:8px 12px;font-size:13.5px;color:var(--ink2);margin:0}.info-on .hint{display:flex}
.hint::before{content:"i";flex:none;width:18px;height:18px;border-radius:50%;background:var(--champ);color:#0B0D12;display:grid;place-items:center;font:italic 600 11px Georgia,serif;margin-top:1px}
@media (prefers-reduced-motion:reduce){.ng-b,.side,.scrim,.ng-h svg,.ng-i a{transition:none!important}}
.tbar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-bottom:10px}.tbar input[type=search]{flex:1 1 220px;min-height:40px}.tbar select{min-height:40px;padding:6px 10px;font-size:14px}.tbar .muted{margin-left:auto}
th button.sort{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px}th button.sort:focus-visible{outline:2px solid var(--champ);outline-offset:2px}th button.sort::after{content:"↕";opacity:.35;font-size:11px}th[aria-sort=ascending] button.sort::after{content:"↑";opacity:1}th[aria-sort=descending] button.sort::after{content:"↓";opacity:1}
.viewseg{display:inline-flex;gap:4px;background:var(--sand);padding:4px;border-radius:12px}.viewseg a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:9px;color:var(--ink2);text-decoration:none;font-size:14px;font-weight:500}.viewseg a.on{background:var(--surf);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(20,26,34,.12)}
.ptbl-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
`;

const VARS = '--paper:#0E1116;--surf:#161A21;--soft:#1B2029;--gold-soft:#231E14;--sand:#1D222B;--chip:#262C36;--line:#272D37;--line2:#20262F;--line3:#3A414D;--ink:#ECEEF1;--ink2:#C4C9D1;--stone:#9EA6B2;--stone2:#9EA6B2;--acc-t:#E2BE7A;--ok-bg:#1A2C20;--ok-t:#93CFA0;--warn-bg:#2D2514;--warn-t:#E9C886;--bad-bg:#34211C;--bad-t:#F4A48E;--bad-line:#5C3328;--gold-line:#4A3E22;--track:#2A303A;--dot:#4A5260;--champ-l:#2A2315;--btn:#E2BE7A;--btn-t:#0B0D12;--btn-h:#ECCB8E;--graphite:#2A2F38;--night:#0A0C10;--ok:#7FBF8E;--bad:#F08A62;color-scheme:dark';

const RULES = `
body{background:var(--paper);color:var(--ink)}
.side{border-right:1px solid #1C2129}
.topbar{border-bottom-color:#1F252E}
.act{box-shadow:none;border:1px solid var(--line)}
.act.hero{background:#1A1F28;border:1px solid #3A3426}
.act.hero .btn.sec{border-color:#3A414D}
button.gold,.btn.gold{background:var(--champ);color:#0B0D12}button.gold:hover,.btn.gold:hover{background:#ECCB8E;color:#0B0D12}
button.ghost,.btn.ghost,.btn.sec{background:var(--surf);color:var(--ink);border-color:var(--line3)}
button.ghost:hover,.btn.ghost:hover,.btn.sec:hover{background:var(--sand);color:var(--ink)}
button.danger{background:var(--surf);color:var(--bad-t);border-color:var(--bad-line)}button.danger:hover{background:var(--bad-bg);color:var(--bad-t)}
button.textbtn{color:var(--stone)}button.textbtn:hover{background:none;color:var(--ink)}
.chkbox{background:var(--surf);color:var(--ink)}.chkbox.on{color:#0B0D12}
.cmdk{background:var(--surf);color:var(--ink)}.cmdk input{background:transparent;color:var(--ink)}
input::placeholder,textarea::placeholder{color:#727A87}
.seg button{color:var(--ink2)}.seg button.on{background:var(--chip);color:var(--ink)}
.viewseg a.on{background:var(--chip)}
.prog span{background:var(--champ)}
.auth{background:#07090C}
.eyebrow{color:var(--acc-t)}
.kcard:hover,.later-row:hover,a.card:hover{border-color:#5A4B2C}
.mode-btn svg{display:none}.mode-btn svg+svg{display:block}
.info-btn span{background:var(--chip);color:var(--champ)}.info-on .info-btn span{background:#0B0D12;color:var(--champ)}
.flash{color:var(--ink)}
.preview-bar{background:#1A1F28}
[style*="#7A2418"]{color:var(--bad-t)!important}[style*="#24502B"]{color:var(--ok-t)!important}[style*="#A33A1F"]{color:var(--bad-t)!important}
`;

// Seçicilerin başına mod koşulunu ekler (iç içe blok yok).
const scope = (pre, css) => css.trim().split('}').filter(r => r.includes('{')).map(r => { const [sel, body] = r.split('{'); return sel.split(',').map(x => `${pre} ${x.trim()}`).join(',') + '{' + body + '}'; }).join('\n');
export const DARK_CSS = `
html[data-mode=koyu]{${VARS}}
${scope('html[data-mode=koyu]', RULES)}
@media (prefers-color-scheme:dark){html[data-mode=sistem]{${VARS}}
${scope('html[data-mode=sistem]', RULES)}
}
@media (prefers-color-scheme:dark){html[data-mode=sistem] .mode-btn svg{display:none}html[data-mode=sistem] .mode-btn svg+svg{display:block}}
`;

// İstemci tarafı: menü akordiyonu, mobil çekmece, mod düğmesi, tablo arama/filtre/sıralama.
export const LOOK_JS = `
(function(){
var root=document.documentElement,body=document.body;var EN=root.lang==='en';function L(a,b){return EN?b:a;}
function setCookie(k,v){document.cookie=k+'='+v+';path=/;max-age=31536000;samesite=lax';}
// akordiyon
document.querySelectorAll('.ng[data-g] > .ng-h').forEach(function(b){b.addEventListener('click',function(){var g=b.parentElement;var shut=g.classList.toggle('shut');b.setAttribute('aria-expanded',shut?'false':'true');
var keys=[].map.call(document.querySelectorAll('.ng.shut[data-g]'),function(x){return x.getAttribute('data-g');});setCookie('menu',keys.join('.'));});});
// mobil çekmece
var side=document.getElementById('menu'),opener=document.querySelector('[data-menu]');
function isMobile(){return window.matchMedia('(max-width:900px)').matches;}
function openMenu(){body.classList.add('menu-open');if(opener)opener.setAttribute('aria-expanded','true');var f=side&&side.querySelector('a.on')||side&&side.querySelector('a');if(f)setTimeout(function(){f.focus({preventScroll:false});},60);}
function closeMenu(back){body.classList.remove('menu-open');if(opener){opener.setAttribute('aria-expanded','false');if(back)opener.focus();}}
if(opener)opener.addEventListener('click',function(){body.classList.contains('menu-open')?closeMenu(true):openMenu();});
document.querySelectorAll('[data-menu-close]').forEach(function(x){x.addEventListener('click',function(){closeMenu(true);});});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&body.classList.contains('menu-open'))closeMenu(true);
if(e.key==='Tab'&&body.classList.contains('menu-open')&&side){var fs=[].filter.call(side.querySelectorAll('a,button,input,select'),function(x){return x.offsetParent!==null&&getComputedStyle(x).visibility!=='hidden';});if(!fs.length)return;var a=fs[0],z=fs[fs.length-1];
if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}});
window.addEventListener('resize',function(){if(!isMobile()&&body.classList.contains('menu-open'))closeMenu(false);});
if(side){var sx=null,dx=0;side.addEventListener('touchstart',function(e){if(!isMobile())return;sx=e.touches[0].clientX;dx=0;},{passive:true});
side.addEventListener('touchmove',function(e){if(sx===null)return;dx=Math.min(0,e.touches[0].clientX-sx);if(dx<-8){body.classList.add('menu-drag');side.style.transform='translateX('+dx+'px)';}},{passive:true});
side.addEventListener('touchend',function(){if(sx===null)return;body.classList.remove('menu-drag');side.style.transform='';if(dx<-70)closeMenu(true);sx=null;});}
// açık / koyu mod
document.querySelectorAll('[data-mode-btn]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();var cur=root.getAttribute('data-mode');
var dark=cur==='koyu'||(cur==='sistem'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var next=dark?'acik':'koyu';root.setAttribute('data-mode',next);setCookie('mod',next);
var inp=b.form&&b.form.querySelector('input[name=mod]');if(inp)inp.value=dark?'koyu':'acik';});});
// tablolar: arama, sütun filtresi, sıralama
function txt(c){return (c.getAttribute('data-sort')||c.textContent||'').trim();}
function num(v){var m=v.replace(/\\./g,'').replace(',','.').match(/-?\\d+(\\.\\d+)?/);return m?parseFloat(m[0]):NaN;}
function dateKey(v){var i=v.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);if(i)return i[1]+i[2]+i[3];var m=v.match(/(\\d{1,2})[.\\/](\\d{1,2})[.\\/](\\d{2,4})/);if(!m)return null;var y=m[3].length===2?'20'+m[3]:m[3];return y+('0'+m[2]).slice(-2)+('0'+m[1]).slice(-2);}
document.querySelectorAll('.tbl > table').forEach(function(t,ti){if(t.hasAttribute('data-plain'))return;var head=t.querySelector('tr');if(!head||!head.querySelector('th'))return;
var rows=[].slice.call(t.querySelectorAll('tr')).slice(1).filter(function(r){return !r.querySelector('td[colspan]');});if(rows.length<4)return;
var ths=[].slice.call(head.children),wrap=t.parentElement;var bar=document.createElement('div');bar.className='tbar';bar.setAttribute('role','search');
var prev=wrap.previousElementSibling;var hasSearch=prev&&prev.matches&&prev.matches('form.filters')&&prev.querySelector('input[type=search]');
var q=null;if(!hasSearch){q=document.createElement('input');q.type='search';q.placeholder=L('Tabloda ara…','Search table…');q.setAttribute('aria-label',L('Tabloda ara','Search table'));bar.appendChild(q);}
var sels=[];ths.forEach(function(th,i){var vals={};rows.forEach(function(r){var c=r.children[i];if(c){var v=txt(c);if(v&&v.length<40)vals[v]=(vals[v]||0)+1;}});var ks=Object.keys(vals);
if(ks.length>=2&&ks.length<=8&&ks.length<rows.length){var s=document.createElement('select');s.setAttribute('aria-label',th.textContent.trim()+L(' filtresi',' filter'));var o=document.createElement('option');o.value='';o.textContent=th.textContent.trim()+L(': hepsi',': all');s.appendChild(o);
ks.sort().forEach(function(k){var op=document.createElement('option');op.value=k;op.textContent=k+' ('+vals[k]+')';s.appendChild(op);});s.dataset.col=i;bar.appendChild(s);sels.push(s);}});
var sortSel=document.createElement('select');sortSel.setAttribute('aria-label',L('Sırala','Sort'));var so=document.createElement('option');so.value='';so.textContent=L('Sırala','Sort');sortSel.appendChild(so);
ths.forEach(function(th,i){var n=th.textContent.trim();if(!n)return;[['a','↑'],['d','↓']].forEach(function(d){var op=document.createElement('option');op.value=i+':'+d[0];op.textContent=n+' '+d[1];sortSel.appendChild(op);});});bar.appendChild(sortSel);
var cnt=document.createElement('span');cnt.className='muted';cnt.setAttribute('aria-live','polite');bar.appendChild(cnt);
function apply(){var qq=q?q.value.toLocaleLowerCase('tr').trim():'';var shown=0;rows.forEach(function(r){var ok=!qq||r.textContent.toLocaleLowerCase('tr').indexOf(qq)>-1;
sels.forEach(function(s){if(s.value&&r.children[s.dataset.col]&&txt(r.children[s.dataset.col])!==s.value)ok=false;});r.hidden=!ok;if(ok)shown++;});cnt.textContent=shown+' / '+rows.length+L(' satır',' rows');}
function sortBy(i,dir){var tb=rows[0].parentElement;var ks=rows.map(function(r){var v=r.children[i]?txt(r.children[i]):'';var d=dateKey(v),n=num(v);return {r:r,v:v,d:d,n:n};});
var allD=ks.every(function(k){return !k.v||k.v==='—'||k.d;}),allN=ks.every(function(k){return !k.v||k.v==='—'||!isNaN(k.n);});
ks.sort(function(a,b){var x,y;if(allD){x=a.d||'';y=b.d||'';}else if(allN){x=isNaN(a.n)?-Infinity:a.n;y=isNaN(b.n)?-Infinity:b.n;}else{return dir*a.v.localeCompare(b.v,'tr');}return dir*(x<y?-1:x>y?1:0);});
ks.forEach(function(k){tb.appendChild(k.r);});ths.forEach(function(h,j){if(h.querySelector('button.sort'))h.setAttribute('aria-sort',j===i?(dir>0?'ascending':'descending'):'none');});}
ths.forEach(function(th,i){var n=th.textContent.trim();if(!n)return;var b=document.createElement('button');b.type='button';b.className='sort';b.textContent=n;th.textContent='';th.appendChild(b);th.setAttribute('aria-sort','none');
b.addEventListener('click',function(){var d=th.getAttribute('aria-sort')==='ascending'?-1:1;sortBy(i,d);sortSel.value=i+':'+(d>0?'a':'d');});});
sortSel.addEventListener('change',function(){if(!sortSel.value)return;var p=sortSel.value.split(':');sortBy(+p[0],p[1]==='a'?1:-1);});
if(q)q.addEventListener('input',apply);sels.forEach(function(s){s.addEventListener('change',apply);});wrap.parentElement.insertBefore(bar,wrap);apply();});
document.querySelectorAll('.fseg[data-target]').forEach(function(g){var list=document.querySelector(g.getAttribute('data-target'));if(!list)return;[].forEach.call(g.querySelectorAll('button'),function(b){b.addEventListener('click',function(){[].forEach.call(g.querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});var f=b.getAttribute('data-f');[].forEach.call(list.querySelectorAll('[data-cat]'),function(r){r.hidden=!!f&&r.getAttribute('data-cat')!==f;});});});});
document.addEventListener('click',function(e){[].forEach.call(document.querySelectorAll('details.tb-new[open]'),function(d){if(!d.contains(e.target))d.open=false;});});
document.addEventListener('keydown',function(e){if(e.key==='Escape')[].forEach.call(document.querySelectorAll('details.tb-new[open]'),function(d){d.open=false;});});
})();`;
