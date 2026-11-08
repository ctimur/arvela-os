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
main{padding-top:28px}
@media (max-width:900px){
.shell{margin-left:0}
.topbar{padding:0 12px 0 10px;padding-top:env(safe-area-inset-top);height:calc(60px + env(safe-area-inset-top))}
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
main{padding-top:16px}
}
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
})();`;
