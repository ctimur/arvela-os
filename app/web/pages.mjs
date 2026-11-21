// arveladigital.com — sayfa şablonları (sunucuda üretilir; JavaScript yalnız etkileşimi zenginleştirir).
import { T, SOLUTIONS } from './content.mjs';
import { LEGAL } from './legal.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const EN_SLUG = { web: 'websites', sosyal: 'social-media', reklam: 'digital-marketing', surec: 'consulting', 'yapay-zeka': 'ai', emlak: 'real-estate' };
export const slugFromEn = Object.fromEntries(Object.entries(EN_SLUG).map(([k, v]) => [v, k]));
const PATHS = {
  tr: { home: '/', sol: (s) => `/cozum/${s}`, match: '/eslestir', book: '/randevu', about: '/hakkimizda', kvkk: '/kvkk', cookies: '/cerez', cancel: '/randevu/iptal' },
  en: { home: '/en', sol: (s) => `/en/solutions/${EN_SLUG[s]}`, match: '/en/match', book: '/en/book', about: '/en/about', kvkk: '/en/privacy', cookies: '/en/cookies', cancel: '/en/randevu/iptal' } };
export const P = PATHS;
export const SITE = String(process.env.WEB_URL || 'https://arveladigital.com').replace(/\/$/, '');

const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M50 12 46 30H33z" fill="#E2BE7A"/><path d="M15 20l12 30 12-38" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Rota çizgisi: üç şamandıradan geçen yelken rotası (hero, çözüm sayfası, sonuç)
export const COURSE = '<svg viewBox="0 0 64 300" preserveAspectRatio="none" aria-hidden="true"><path class="sail" d="M32 10 C 6 60, 58 90, 32 150 S 8 240, 32 290"/><circle class="buoy" cx="32" cy="10" r="7"/><circle class="buoy" cx="32" cy="150" r="7"/><circle class="buoy end" cx="32" cy="290" r="7"/></svg>';

function head(t, { title, desc, path, alt }) {
  const full = title ? `${title} — Arvela` : t.meta.title;
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full)}</title><meta name="description" content="${esc(desc || t.meta.desc)}"><link rel="canonical" href="${SITE}${path}">
${alt ? `<link rel="alternate" hreflang="${t.lang}" href="${SITE}${path}"><link rel="alternate" hreflang="${t.other}" href="${SITE}${alt}"><link rel="alternate" hreflang="x-default" href="${SITE}${t.lang === 'tr' ? path : alt}">` : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(desc || t.meta.desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:locale" content="${t.lang === 'tr' ? 'tr_TR' : 'en_GB'}">
<meta name="theme-color" content="#0B0D12"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/poppins-500.woff" as="font" type="font/woff" crossorigin><link rel="stylesheet" href="/site.css?v=${VER}"></head>`;
}
let VER = '1'; export const setVersion = (v) => { VER = v; };

function topbar(t, { dark, alt }) {
  const p = PATHS[t.lang];
  return `<header class="top${dark ? '' : ' paper'}"><div class="wrap"><a class="logo" href="${p.home}" aria-label="Arvela">${MARK}Arvela</a>
<button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${t.lang === 'tr' ? 'Menü' : 'Menu'}"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
<nav class="menu" id="menu"><a href="${p.home}#cozumler">${t.nav.solutions}</a><a href="${p.home}#nasil">${t.nav.how}</a><a href="${p.home}#urunler">${t.nav.products}</a><a href="${p.about}">${t.nav.about}</a>
<a class="lang" href="${alt || PATHS[t.other].home}" hreflang="${t.other}" lang="${t.other}">${t.otherLabel}</a><a class="btn btn-gold" href="${p.book}">${t.nav.book}</a></nav></div></header>`;
}

function foot(t) {
  const p = PATHS[t.lang];
  return `<footer class="foot"><div class="wrap"><div><a class="logo" href="${p.home}">${MARK}Arvela</a><p class="sl">${t.slogan.join(' ')}</p></div>
<nav aria-label="footer"><a href="${p.match}">${t.nav.match}</a><a href="${p.about}">${t.nav.about}</a><a href="${p.kvkk}">${t.footer.kvkk}</a><a href="${p.cookies}">${t.footer.cookies}</a><a href="mailto:${t.footer.email}">${t.footer.email}</a></nav>
<p style="width:100%;margin:12px 0 0">© ${new Date().getUTCFullYear()} ${t.footer.rights}</p></div></footer>`;
}

export function page(t, { title, desc, path, alt, dark = true, body, data }) {
  const notice = { text: t.lang === 'tr' ? `Bu site takip çerezi kullanmaz; yalnız gezinmeniz için gerekli tarayıcı depolamasını kullanır. <a href="${PATHS.tr.cookies}">Ayrıntılar</a>` : `This site uses no tracking cookies, only the browser storage it needs to work. <a href="${PATHS.en.cookies}">Details</a>`, ok: t.lang === 'tr' ? 'Tamam' : 'OK' };
  return `${head(t, { title, desc, path, alt })}<body><a class="skip" href="#main">${t.lang === 'tr' ? 'İçeriğe geç' : 'Skip to content'}</a>${topbar(t, { dark, alt })}<main id="main">${body}</main>${foot(t)}
<script type="application/json" id="data">${JSON.stringify({ lang: t.lang, notice, ...data }).replace(/</g, '\\u003c')}</script><script src="/site.js?v=${VER}" defer></script></body></html>`;
}

const solLink = (t, s) => PATHS[t.lang].sol(s);

export function home(t) {
  const p = PATHS[t.lang];
  const chips = SOLUTIONS.map(s => `<li><a class="chip" href="${solLink(t, s)}" data-sol="${s}" aria-pressed="false"><span>${esc(t.sol[s].title)}</span><span class="k"></span></a></li>`).join('');
  const rows = SOLUTIONS.map(s => { const x = t.sol[s]; return `<a class="row" href="${solLink(t, s)}"><div><p class="svc">${esc(x.short)}</p><h3>${esc(x.title)}</h3></div><ul>${x.signs.slice(0, 3).map(g => `<li>${esc(g)}</li>`).join('')}</ul><span class="go">${ARROW}</span></a>`; }).join('');
  const sols = Object.fromEntries(SOLUTIONS.map(s => [s, { title: t.sol[s].title, short: t.sol[s].short, route: t.sol[s].route, href: solLink(t, s) }]));
  const body = `<section class="hero"><div class="wrap"><div><h1>${esc(t.hero.q)}</h1><p class="hint">${esc(t.hero.hint)}</p><ul class="chips" role="list">${chips}</ul></div>
<div class="route" id="route" aria-live="polite"><p class="idle">${t.slogan.map(w => `<span>${esc(w)}</span>`).join('')}</p></div></div></section>
<section class="sec" id="cozumler"><div class="wrap"><div class="sec-head"><h2>${esc(t.solutionsTitle)}</h2><p>${esc(t.solutionsLead)}</p></div><div class="rows">${rows}</div>
<p style="margin-top:32px"><a class="link" href="${p.match}">${esc(t.solPage.match)}</a></p></div></section>
<section class="sec dark" id="nasil"><div class="wrap"><div class="sec-head"><h2>${esc(t.howTitle)}</h2><p></p></div><ol class="steps">${t.how.map(([h, d]) => `<li><h3>${esc(h)}</h3><p>${esc(d)}</p></li>`).join('')}</ol></div></section>
<section class="sec" id="urunler" style="background:var(--night);color:var(--paper);padding-top:0"><div class="wrap"><div class="sec-head"><h2>${esc(t.productsTitle)}</h2><p style="color:var(--mist)">${esc(t.productsLead)}</p></div>
<div class="prods">${t.products.map((x, i) => `<article class="prod${i === 0 ? ' main' : ''}"><h3>${esc(x.name)}</h3><p>${esc(x.text)}</p>${x.url ? `<p class="mock"><a class="btn ${i === 0 ? 'btn-ink' : 'btn-gold'}" href="${x.url}">${esc(x.cta)}</a></p>` : ''}</article>`).join('')}</div></div></section>
<section class="sec"><div class="wrap"><div class="sec-head"><h2>${esc(t.sectorsTitle)}</h2><p></p></div><div class="sectors">${t.sectors.map(([h, d]) => `<div><h3>${esc(h)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><div class="sec-head"><h2>${esc(t.faqTitle)}</h2><p></p></div><div class="faq">${t.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>
${ctaBand(t)}`;
  return page(t, { path: p.home, alt: PATHS[t.other].home, body, data: { view: 'home', sols, labels: { routeTitle: t.hero.routeTitle, more: t.hero.more, book: t.hero.book, stages: t.stages }, bookPath: p.book } });
}

const ctaBand = (t) => `<section class="sec dark"><div class="wrap cta"><div><h2>${esc(t.ctaTitle)}</h2><p>${esc(t.ctaText)}</p></div><a class="btn btn-gold" href="${PATHS[t.lang].book}">${esc(t.ctaBtn)}</a></div></section>`;

const bookingBox = (t, id = 'book') => `<div class="panel book" id="${id}" data-book><h2>${esc(t.book.title)}</h2><p class="muted" style="margin:0">${esc(t.book.lead)}</p><p class="tz">${esc(t.book.tz)}</p><div data-slots><p class="muted">${esc(t.book.loading)}</p></div>
<noscript><p>${esc(t.book.none)}</p></noscript></div>`;

export function bookingTexts(t) { return { ...t.book, error: t.errors.generic, kvkkPath: PATHS[t.lang].kvkk }; }

export function solution(t, s) {
  const x = t.sol[s]; const p = PATHS[t.lang];
  const body = `<section class="page-hero"><div class="wrap"><p class="crumbs"><a href="${p.home}#cozumler">${esc(t.nav.solutions)}</a> / ${esc(x.short)}</p><p class="svc">${esc(x.short)}</p><h1>${esc(x.title)}</h1><p class="lead">${esc(x.lead)}</p>
<p style="margin-top:30px"><a class="btn btn-gold" href="#gorusme">${esc(t.solPage.book)}</a></p></div></section>
<section class="sec"><div class="wrap two"><div><h2 style="font-size:30px;margin-bottom:18px">${esc(t.solPage.signs)}</h2><ul class="signs">${x.signs.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>
<div><h2 style="font-size:30px;margin-bottom:18px">${esc(t.solPage.route)}</h2><ol class="plan">${x.route.map((r, i) => `<li><b>${esc(t.stages[i])}</b><p>${esc(r)}</p></li>`).join('')}</ol></div></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><h2 style="font-size:30px;margin-bottom:18px">${esc(t.solPage.deliver)}</h2><ul class="ticks">${x.deliver.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div></section>
<section class="sec" id="gorusme" style="padding-top:0"><div class="wrap">${bookingBox(t)}<p style="text-align:center;margin-top:24px"><a class="link" href="${p.match}">${esc(t.solPage.match)}</a></p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><h2 style="font-size:24px">${esc(t.solPage.others)}</h2><div class="others">${SOLUTIONS.filter(o => o !== s).map(o => `<a href="${solLink(t, o)}">${esc(t.sol[o].short)}</a>`).join('')}</div></div></section>`;
  return page(t, { title: x.short, desc: x.lead, path: p.sol(s), alt: PATHS[t.other].sol(s), body, data: { view: 'solution', sol: s, solTitle: x.title, book: bookingTexts(t) } });
}

export function matchPage(t) {
  const p = PATHS[t.lang];
  const qs = t.match.qs.map(q => ({ ...q, a: q.a ? q.a.map(v => ({ v, l: v })) : SOLUTIONS.map(s => ({ v: s, l: t.sol[s].title })) }));
  const sols = Object.fromEntries(SOLUTIONS.map(s => [s, { title: t.sol[s].title, short: t.sol[s].short, lead: t.sol[s].lead, route: t.sol[s].route, href: solLink(t, s) }]));
  const body = `<section class="page-hero" style="padding-bottom:40px"><div class="wrap"><h1>${esc(t.match.title)}</h1><p class="lead">${esc(t.match.lead)}</p></div></section>
<section class="sec" style="padding-top:48px"><div class="wrap"><div class="panel match" id="match"><noscript><p>${esc(t.solPage.others)}:</p><div class="others">${SOLUTIONS.map(o => `<a href="${solLink(t, o)}">${esc(t.sol[o].title)}</a>`).join('')}</div></noscript></div>
<div id="after" hidden style="margin-top:28px">${bookingBox(t)}<div class="panel" style="max-width:860px;margin:20px auto 0" id="lead"></div></div></div></section>`;
  return page(t, { title: t.match.title, desc: t.match.lead, path: p.match, alt: PATHS[t.other].match, body, data: { view: 'match', qs, sols, m: t.match, stages: t.stages, book: bookingTexts(t) } });
}

export function bookPage(t) {
  const p = PATHS[t.lang];
  const body = `<section class="page-hero" style="padding-bottom:40px"><div class="wrap"><h1>${esc(t.ctaTitle)}</h1><p class="lead">${esc(t.ctaText)}</p></div></section><section class="sec" style="padding-top:48px"><div class="wrap">${bookingBox(t)}
<p style="text-align:center;margin-top:24px"><a class="link" href="${p.match}">${esc(t.solPage.match)}</a></p></div></section>`;
  return page(t, { title: t.book.title, path: p.book, alt: PATHS[t.other].book, body, data: { view: 'book', book: bookingTexts(t), solTitles: Object.fromEntries(SOLUTIONS.map(s => [s, t.sol[s].short])) } });
}

export function about(t) {
  const p = PATHS[t.lang];
  const body = `<section class="page-hero"><div class="wrap"><h1>${esc(t.about.title)}</h1><p class="lead">${esc(t.about.paras[0])}</p></div></section>
<section class="sec"><div class="wrap two"><div class="prose">${t.about.paras.slice(1).map(x => `<p style="font-size:19px">${esc(x)}</p>`).join('')}</div>
<div><h2 style="font-size:28px;margin-bottom:14px">${esc(t.about.contact)}</h2><p><a class="link" href="mailto:${t.footer.email}">${t.footer.email}</a></p><p style="margin-top:24px"><a class="btn btn-ink" href="${p.book}">${esc(t.nav.book)}</a></p></div></div></section>`;
  return page(t, { title: t.about.title, path: p.about, alt: PATHS[t.other].about, body, data: { view: 'about' } });
}

export function legal(t, kind) {
  const L = LEGAL[t.lang][kind]; const p = PATHS[t.lang]; const path = kind === 'kvkk' ? p.kvkk : p.cookies; const alt = kind === 'kvkk' ? PATHS[t.other].kvkk : PATHS[t.other].cookies;
  const html = L.body.map(([k, v]) => k === 'h' ? `<h2>${esc(v)}</h2>` : k === 'ul' ? `<ul>${v.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(v)}</p>`).join('');
  return page(t, { title: L.title, path, alt, dark: false, body: `<section class="sec"><div class="wrap prose"><h1>${esc(L.title)}</h1>${html}</div></section>`, data: { view: 'legal' } });
}

export function cancelPage(t, tok) {
  const p = PATHS[t.lang];
  const body = `<section class="sec"><div class="wrap"><div class="panel" style="max-width:620px;margin:0 auto" id="cancel"><h1 style="font-size:32px;margin-bottom:12px">${esc(t.cancel.title)}</h1>
<p class="muted">${esc(t.cancel.text)}</p><form method="post" action="${p.cancel}" data-cancel><input type="hidden" name="t" value="${esc(tok)}"><button class="btn btn-ink" type="submit">${esc(t.cancel.btn)}</button></form></div></div></section>`;
  return page(t, { title: t.cancel.title, path: p.cancel, dark: false, body, data: { view: 'cancel', c: t.cancel, err: t.errors.generic } });
}

export function message(t, title, text, dark = false) {
  const body = `<section class="sec"><div class="wrap"><div class="panel ok" style="max-width:620px;margin:0 auto"><h1 style="font-size:32px;margin-bottom:12px">${esc(title)}</h1><p class="muted">${esc(text)}</p><p><a class="link" href="${PATHS[t.lang].home}">${esc(t.nf.home)}</a></p></div></div></section>`;
  return page(t, { title, path: PATHS[t.lang].home, dark, body, data: { view: 'msg' } });
}

export function sitemap() {
  const urls = [];
  for (const l of ['tr', 'en']) { const p = PATHS[l]; urls.push(p.home, p.match, p.book, p.about, p.kvkk, p.cookies, ...SOLUTIONS.map(s => p.sol(s))); }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${SITE}${u}</loc></url>`).join('')}</urlset>`;
}

export const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0D12"/><path d="M50 12 46 30H33z" fill="#E2BE7A"/><path d="M15 20l12 30 12-38" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export { T };
