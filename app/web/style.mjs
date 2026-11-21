// arveladigital.com — stil. Marka kılavuzu renkleri ve yazı tipleri (Poppins başlık, Inter metin; dosyalar sitede barınır, dışarıya istek yok).
export const CSS = String.raw`
@font-face{font-family:Poppins;font-weight:500;font-display:swap;src:url(/assets/poppins-500.woff) format('woff')}
@font-face{font-family:Poppins;font-weight:700;font-display:swap;src:url(/assets/poppins-700.woff) format('woff')}
@font-face{font-family:Inter;font-weight:400;font-display:swap;src:url(/assets/inter-400.woff) format('woff')}
@font-face{font-family:Inter;font-weight:600;font-display:swap;src:url(/assets/inter-600.woff) format('woff')}
:root{--night:#0B0D12;--paper:#F7F4EE;--ink:#141A22;--stone:#6B6558;--gold:#B08433;--champ:#E2BE7A;--graphite:#2A2F38;--mist:#B9B3A8;--line:rgba(20,26,34,.14);--line-d:rgba(247,244,238,.14);
--f-h:Poppins,'Segoe UI',system-ui,sans-serif;--f-b:Inter,'Segoe UI',system-ui,sans-serif;--wrap:1180px;--pad:clamp(20px,4vw,40px)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.6 var(--f-b);font-feature-settings:'kern','calt'}
img,svg{display:block;max-width:100%}a{color:inherit}
h1,h2,h3{font-family:var(--f-h);font-weight:500;letter-spacing:-.02em;line-height:1.12;margin:0}
h2{font-size:clamp(30px,3.6vw,46px)}h3{font-size:22px;line-height:1.25}
p{margin:0 0 1em}.wrap{max-width:var(--wrap);margin:0 auto;padding:0 var(--pad)}
:focus-visible{outline:2px solid var(--champ);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:-999px;top:8px;background:var(--champ);color:var(--night);padding:8px 14px;border-radius:8px;z-index:20}.skip:focus{left:12px}
.btn{display:inline-flex;align-items:center;gap:10px;font:600 16px/1 var(--f-b);padding:15px 22px;border-radius:12px;border:0;cursor:pointer;text-decoration:none;transition:background .15s,transform .15s}
.btn-gold{background:var(--champ);color:var(--night)}.btn-gold:hover{background:#ECCB8C}
.btn-ink{background:var(--ink);color:var(--paper)}.btn-ink:hover{background:var(--graphite)}
.btn-line{background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px currentColor}
.btn:active{transform:translateY(1px)}.btn[disabled]{opacity:.55;cursor:wait}
.link{font-weight:600;text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:5px}
.muted{color:var(--stone)}
/* üst çubuk */
.top{position:absolute;inset:0 0 auto;z-index:5;color:var(--paper)}.top.paper{position:static;color:var(--ink);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:28px;height:76px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 21px/1 var(--f-h);letter-spacing:-.01em}.logo svg{width:30px;height:30px}
.menu{display:flex;gap:24px;margin-left:auto;align-items:center}.menu a{text-decoration:none;font-size:15px;opacity:.86}.menu a:hover{opacity:1}
.menu .lang{font-size:14px;opacity:.7}.menu .btn{padding:11px 16px;font-size:15px;opacity:1}
.burger{display:none;margin-left:auto;background:none;border:0;color:inherit;padding:8px;cursor:pointer}
@media (max-width:900px){.menu{display:none;position:absolute;top:70px;left:12px;right:12px;flex-direction:column;align-items:stretch;gap:0;background:var(--night);color:var(--paper);border-radius:16px;padding:10px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.menu a{padding:14px 12px;opacity:1}.menu .btn{margin-top:8px;justify-content:center}.top.open .menu{display:flex}.burger{display:block}}
/* hero: eşleştirici */
.hero{background:var(--night);color:var(--paper);padding:130px 0 72px;position:relative;overflow:hidden}
.hero .wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(32px,5vw,72px);align-items:start}
.hero h1{font-size:clamp(36px,5.2vw,68px);max-width:12ch}
.hero .hint{color:var(--mist);margin:22px 0 28px;font-size:18px}
.chips{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;max-width:560px}
.chips li{border-top:1px solid var(--line-d)}.chips li:last-child{border-bottom:1px solid var(--line-d)}
.chip{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;text-align:left;background:transparent;border:0;color:var(--paper);font:400 19px/1.35 var(--f-b);padding:17px 4px;cursor:pointer;text-decoration:none}
.chip .k{width:12px;height:12px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--mist);flex:none;transition:background .2s,box-shadow .2s}
.chip:hover .k{box-shadow:inset 0 0 0 1.5px var(--champ)}
.chip[aria-pressed=true]{color:var(--champ)}.chip[aria-pressed=true] .k{background:var(--champ);box-shadow:none}
.route{position:relative;background:linear-gradient(180deg,#121620,#0E1118);border:1px solid var(--line-d);border-radius:22px;padding:30px 30px 28px;min-height:520px;display:flex;flex-direction:column}
.route .idle{margin:auto 0;font:500 clamp(40px,4.6vw,64px)/1.05 var(--f-h);letter-spacing:-.02em;color:var(--paper)}
.route .idle span{display:block}.route .idle span:nth-child(2){color:var(--mist)}.route .idle span:nth-child(3){color:var(--champ)}
.route .rt{font-size:14px;font-weight:600;color:var(--champ);margin:0 0 6px}.route h2{font-size:clamp(24px,2.4vw,30px);margin-bottom:22px;color:var(--paper)}
.course{display:grid;grid-template-columns:64px 1fr;column-gap:18px;flex:1}
.course svg{grid-row:1/4;width:64px;height:100%;min-height:300px;overflow:visible}
.course .stop{padding:0 0 22px}.course .stop b{display:block;font:500 18px/1.3 var(--f-h);color:var(--champ);margin-bottom:4px}
.course .stop p{margin:0;color:#DCD7CD;font-size:16px}
.route .acts{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px}.route .acts .link{color:var(--paper)}
.sail{stroke:var(--champ);stroke-width:2;fill:none;stroke-linecap:round}
.sail.draw{stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:draw 1.1s cubic-bezier(.6,.1,.2,1) forwards}
.buoy{fill:var(--night);stroke:var(--champ);stroke-width:2}.buoy.end{fill:var(--champ)}
@keyframes draw{to{stroke-dashoffset:0}}
.fade{animation:fade .5s ease both}@keyframes fade{from{opacity:0}to{opacity:1}}
@media (max-width:900px){.hero{padding:112px 0 56px}.hero .wrap{grid-template-columns:1fr}.route{min-height:0}.route .idle{font-size:44px;margin:12px 0}}
@media (prefers-reduced-motion:reduce){.sail.draw{animation:none;stroke-dashoffset:0}.fade{animation:none}html{scroll-behavior:auto}}
/* bölümler */
.sec{padding:clamp(72px,9vw,120px) 0}.sec-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:end;margin-bottom:48px}
.sec-head p{color:var(--stone);max-width:52ch;margin:0;font-size:18px}
@media (max-width:800px){.sec-head{grid-template-columns:1fr;gap:16px}}
.rows{border-top:1px solid var(--line)}
.row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) 40px;gap:32px;align-items:start;padding:30px 0;border-bottom:1px solid var(--line);text-decoration:none}
.row h3{font-size:clamp(22px,2.2vw,28px);transition:color .15s}.row .svc{font-size:14px;color:var(--gold);font-weight:600;margin-bottom:8px}
.row ul{margin:0;padding:0;list-style:none;color:var(--stone)}.row li{padding-left:18px;position:relative;margin-bottom:4px}.row li::before{content:'';position:absolute;left:0;top:.7em;width:8px;height:1.5px;background:var(--gold)}
.row .go{width:40px;height:40px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--line);display:grid;place-items:center;transition:background .15s,box-shadow .15s}
.row:hover h3{color:var(--gold)}.row:hover .go{background:var(--ink);box-shadow:none;color:var(--paper)}
@media (max-width:800px){.row{grid-template-columns:1fr 32px;gap:12px}.row ul{grid-column:1}.row .go{grid-row:1;grid-column:2;width:32px;height:32px}}
.steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:28px;margin:0;padding:0;list-style:none;counter-reset:s}
.steps li{counter-increment:s;border-top:2px solid var(--ink);padding-top:18px}.steps li::before{content:counter(s);font:500 15px/1 var(--f-h);color:var(--gold);display:block;margin-bottom:14px}
.steps h3{font-size:19px;margin-bottom:8px}.steps p{color:var(--stone);font-size:15.5px;margin:0}
@media (max-width:980px){.steps{grid-template-columns:1fr 1fr}}@media (max-width:560px){.steps{grid-template-columns:1fr}}
.dark{background:var(--night);color:var(--paper)}.dark .steps li{border-top-color:var(--champ)}.dark .steps p{color:var(--mist)}.dark .sec-head p,.dark .muted{color:var(--mist)}
.prods{display:grid;grid-template-columns:1.2fr 1fr;gap:24px}
.prod{border-radius:22px;padding:34px;border:1px solid var(--line-d);display:flex;flex-direction:column;gap:14px}
.prod.main{background:var(--paper);color:var(--ink);border:0}.prod h3{font-size:28px}.prod p{margin:0;max-width:52ch}.prod.main p{color:var(--graphite)}
.prod .mock{margin-top:auto;padding-top:18px}
@media (max-width:860px){.prods{grid-template-columns:1fr}}
.sectors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px}.sectors h3{font-size:20px;margin-bottom:8px}.sectors p{color:var(--stone);font-size:15.5px;margin:0}
@media (max-width:900px){.sectors{grid-template-columns:1fr 1fr}}@media (max-width:520px){.sectors{grid-template-columns:1fr}}
.faq{max-width:820px}.faq details{border-bottom:1px solid var(--line)}.faq summary{cursor:pointer;list-style:none;padding:22px 40px 22px 0;font:500 19px/1.35 var(--f-h);position:relative}
.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:'';position:absolute;right:6px;top:50%;width:12px;height:12px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:translateY(-70%) rotate(45deg);transition:transform .2s}
.faq details[open] summary::after{transform:translateY(-30%) rotate(225deg)}.faq details p{color:var(--stone);margin:0 0 22px;max-width:68ch}
.cta{display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:space-between}.cta h2{max-width:18ch}.cta p{color:var(--mist);margin:12px 0 0}
/* çözüm sayfası */
.page-hero{background:var(--night);color:var(--paper);padding:136px 0 64px}.page-hero .svc{color:var(--champ);font-weight:600;font-size:15px;margin-bottom:14px}
.page-hero h1{font-size:clamp(34px,4.6vw,58px);max-width:20ch}.page-hero .lead{color:#DCD7CD;font-size:20px;max-width:60ch;margin:22px 0 0}
.crumbs{font-size:14px;color:var(--mist);margin-bottom:22px}.crumbs a{text-decoration:none}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(32px,6vw,80px)}@media (max-width:860px){.two{grid-template-columns:1fr}}
.signs{margin:0;padding:0;list-style:none}.signs li{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--line);font-size:18px}
.signs li::before{content:'';flex:none;width:18px;height:18px;margin-top:4px;border-radius:5px;box-shadow:inset 0 0 0 1.5px var(--gold)}
.plan{list-style:none;margin:0;padding:0}.plan li{display:grid;grid-template-columns:110px 1fr;gap:18px;padding:18px 0;border-bottom:1px solid var(--line)}
.plan b{font:500 17px/1.4 var(--f-h);color:var(--gold)}.plan p{margin:0}
.ticks{margin:0;padding:0;list-style:none;columns:2;column-gap:40px}.ticks li{break-inside:avoid;padding:10px 0 10px 28px;position:relative}
.ticks li::before{content:'';position:absolute;left:2px;top:17px;width:12px;height:7px;border-left:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(-45deg)}
@media (max-width:640px){.ticks{columns:1}}
.others{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.others a{text-decoration:none;padding:10px 16px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--line);font-size:15px}.others a:hover{box-shadow:inset 0 0 0 1.5px var(--gold)}
/* eşleştirici ve randevu */
.panel{background:#fff;border:1px solid #E8E1D3;border-radius:22px;padding:clamp(22px,4vw,40px)}
.match{max-width:760px;margin:0 auto}.match .prog{display:flex;gap:6px;margin-bottom:26px}.match .prog i{flex:1;height:4px;border-radius:4px;background:#E8E1D3}.match .prog i.on{background:var(--gold)}
.match .qn{font-size:14px;color:var(--stone);margin-bottom:8px}.match h2{font-size:clamp(26px,3vw,34px);margin-bottom:24px}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:600px){.opts{grid-template-columns:1fr}}
.opt{display:flex;gap:12px;align-items:center;text-align:left;background:var(--paper);border:1.5px solid transparent;border-radius:14px;padding:16px 18px;font:400 16.5px/1.35 var(--f-b);color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s}
.opt:hover{border-color:var(--gold)}.opt[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.match .nav{display:flex;justify-content:space-between;margin-top:24px}.match .nav button{background:none;border:0;color:var(--stone);font:600 15px var(--f-b);cursor:pointer;padding:8px 0}
.result h2{margin-bottom:10px}.result .first{background:var(--night);color:var(--paper);border-radius:18px;padding:28px;margin:20px 0}
.result .first .svc{color:var(--champ);font-size:14px;font-weight:600;margin-bottom:8px}.result .first h3{font-size:26px;margin-bottom:12px}.result .first p{color:#DCD7CD}
.result .first ol{margin:16px 0 0;padding-left:22px;color:#DCD7CD}.result .first li{margin-bottom:6px}.result .first li::marker{color:var(--champ);font-weight:600}
.book{max-width:860px;margin:0 auto}.book h2{margin-bottom:8px}.book .tz{font-size:14px;color:var(--stone)}
.days{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 12px;margin:20px 0 6px;scroll-snap-type:x mandatory}
.day{flex:none;scroll-snap-align:start;min-width:84px;text-align:center;background:var(--paper);border:1.5px solid transparent;border-radius:14px;padding:12px 10px;cursor:pointer;font:400 14px/1.3 var(--f-b);color:var(--ink)}
.day b{display:block;font:500 22px/1.2 var(--f-h)}.day:hover{border-color:var(--gold)}.day[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.times{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin:10px 0 4px}
.time{background:#fff;border:1.5px solid #E8E1D3;border-radius:12px;padding:12px 0;font:600 15.5px var(--f-b);cursor:pointer;color:var(--ink);font-variant-numeric:tabular-nums}
.time:hover{border-color:var(--gold)}.time[aria-pressed=true]{background:var(--champ);border-color:var(--champ)}
.form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.form .full{grid-column:1/-1}@media (max-width:600px){.form{grid-template-columns:1fr}}
.form label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--graphite)}
.form input,.form textarea{font:400 16px/1.4 var(--f-b);padding:13px 14px;border:1.5px solid #DDD5C6;border-radius:12px;background:#fff;color:var(--ink)}
.form input:focus,.form textarea:focus{outline:none;border-color:var(--gold)}.form textarea{min-height:90px;resize:vertical}
.form .check{flex-direction:row;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45}.form .check input{width:18px;height:18px;margin-top:2px;accent-color:var(--ink);flex:none}
.chosen{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--paper);border-radius:14px;padding:14px 18px;margin-top:18px}
.chosen button{background:none;border:0;color:var(--gold);font:600 14px var(--f-b);cursor:pointer}
.err{color:#9B2C1F;font-size:15px;margin:12px 0 0}.ok{text-align:center;padding:20px 0}.ok h2{margin-bottom:10px}
.hp{position:absolute;left:-5000px;width:1px;height:1px;overflow:hidden}
.prose{max-width:760px}.prose h1{font-size:clamp(32px,4vw,46px);margin-bottom:24px}.prose h2{font-size:24px;margin:34px 0 12px}.prose p,.prose li{color:var(--graphite)}.prose .note{background:#fff;border-left:3px solid var(--gold);padding:14px 18px;border-radius:0 12px 12px 0;font-size:15px}
/* alt bilgi ve bildirim */
.foot{background:var(--night);color:var(--mist);padding:56px 0 40px;font-size:15px}.foot .wrap{display:flex;flex-wrap:wrap;gap:28px;justify-content:space-between;align-items:flex-start}
.foot .logo{color:var(--paper)}.foot nav{display:flex;flex-wrap:wrap;gap:20px}.foot a{text-decoration:none}.foot a:hover{color:var(--paper)}.foot .sl{color:var(--champ);margin-top:12px}
.notice{position:fixed;left:16px;right:16px;bottom:16px;max-width:520px;background:var(--ink);color:var(--paper);border-radius:16px;padding:16px 18px;display:flex;gap:16px;align-items:center;font-size:14.5px;z-index:30;box-shadow:0 18px 40px rgba(0,0,0,.3)}
.notice p{margin:0}.notice a{color:var(--champ)}.notice button{flex:none;background:var(--champ);color:var(--night);border:0;border-radius:10px;padding:10px 14px;font:600 14px var(--f-b);cursor:pointer}
`;
