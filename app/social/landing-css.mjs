// Tanıtım sayfası stilleri (app.css'e eklenir)
export const LANDING_CSS = `
.lp{background:var(--paper)}.lp-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 5vw;background:var(--night);position:sticky;top:0;z-index:5}
.lp-logo{color:#fff;text-decoration:none;font-family:Poppins,sans-serif;font-size:22px}.lp-logo span{font-size:11px;letter-spacing:2px;color:var(--champ)}
.lp-nav nav{display:flex;align-items:center;gap:18px}.lp-nav nav a:not(.btn){color:#D8DCE3;text-decoration:none;font-weight:500}
.lp-hero{background:var(--night);color:#fff;padding:72px 5vw 88px;display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
.lp-hero h1{font-size:54px;line-height:1.08;margin:0 0 18px;color:#fff}.lp-hero h1 span{color:var(--champ)}.lp-kicker{color:var(--champ);letter-spacing:2px;text-transform:uppercase;font-size:13px;font-weight:600}
.lp-lead{color:var(--muted-d);font-size:19px;line-height:1.6;max-width:620px}.lp-small{color:var(--muted-d);font-size:13px;margin-top:14px}.lp-big{padding:14px 22px;font-size:16px}
.lp-cal{background:var(--paper);color:var(--ink);border-radius:20px;padding:20px;box-shadow:0 30px 60px #0006}.lp-cal-h{font-family:Poppins,sans-serif;font-size:20px;margin-bottom:12px}
.lp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.lp-day{background:#fff;border:1px solid var(--line);border-radius:10px;min-height:74px;padding:8px;display:flex;flex-direction:column;gap:4px}.lp-day span{font-size:12px;color:var(--stone)}
.lp-day i{font-style:normal;font-size:12px;border-radius:6px;padding:4px 6px;border-left:3px solid}.lp-day i.ok{background:#EEF6EC;border-color:#3E7B4F}.lp-day i.warn{background:#FBF3E3;border-color:#B08433}.lp-day i.gold{background:#F7EFDD;border-color:#E2BE7A}
.lp-note{margin-top:12px;background:var(--night);color:#fff;border-radius:10px;padding:10px 12px;font-size:14px}.lp-note b{color:var(--champ)}
.lp-hero .btn.ghost{background:transparent;color:#fff;border-color:#ffffff59}.lp-hero .btn.ghost:hover{background:#ffffff14}.lp-sec .lp-lead{color:var(--stone)}
.lp-sec{padding:72px 5vw}.lp-sec h2{text-align:center;font-size:34px;margin:0 0 32px}.lp-alt{background:#EFE9DD}
.lp-steps,.lp-feat,.lp-price{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:1120px;margin:0 auto}.lp-steps>div,.lp-feat>div,.lp-price>div{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px}
.lp-steps b{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--night);color:var(--champ);font-family:Poppins,sans-serif}.lp-steps h3,.lp-feat h3{margin:12px 0 8px}.lp-steps p,.lp-feat p{color:var(--stone);margin:0;line-height:1.6}
.lp-price>div{position:relative;display:flex;flex-direction:column;gap:10px}.lp-price .pick{border:2px solid var(--gold)}.lp-tag{position:absolute;top:-12px;left:24px;background:var(--gold);color:#fff;font-size:12px;border-radius:999px;padding:3px 10px}
.lp-amount{font-family:Poppins,sans-serif;font-size:24px;margin:0}.lp-price ul{margin:0;padding-left:18px;line-height:1.8;flex:1}.lp-extras{max-width:1120px;margin:24px auto 0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 24px}.lp-extras h3{margin:0 0 8px}.lp-extras p{margin:4px 0}
.lp-faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px}.lp-faq details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px}.lp-faq summary{cursor:pointer;font-weight:600}.lp-faq p{color:var(--stone);line-height:1.6;margin:10px 0 0}
.lp-cta{background:var(--night);color:#fff;text-align:center;padding:64px 5vw}.lp-cta h2{color:#fff;font-size:34px;margin:0 0 20px}
.lp-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:24px 5vw;color:var(--stone);font-size:14px}
@media (max-width:900px){.lp-hero{grid-template-columns:1fr;padding:44px 6vw}.lp-hero h1{font-size:36px}.lp-steps,.lp-feat,.lp-price{grid-template-columns:1fr}.lp-nav nav a:not(.btn):not([href="/giris"]){display:none}.lp-sec{padding:48px 6vw}.lp-sec h2{font-size:28px}}
`;
