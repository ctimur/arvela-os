// Arvela Social — tanıtım sayfası (giriş yapmamış ziyaretçiye "/" adresinde). Fiyatlar Yönetim'deki ayarlardan.
import { setAnonHome } from './server.mjs';
import { esc } from './lib.mjs';
import { PLANS, EXTRAS, TRIAL_DAYS } from './plans.mjs';
import { priceOf } from './billing.mjs';

const FEATURES = [
  ['Aylık plan, tek tıkla', 'Markanızı bir kez anlatın; Claude ayın takvimini, gönderi metinlerini ve etiketleri sizin sesinizle hazırlasın. Hepsi taslak gelir, son söz sizde.'],
  ['Marka şablonlarıyla görsel', 'Renkleriniz, yazı stiliniz ve logonuzla kapak, kampanya, alıntı ve liste görselleri. Kare, dikey ve hikâye boyutlarında.'],
  ['Onay akışı', 'Editör yazar, yönetici onaylar. Düzeltme notları gönderinin üstünde durur; kimse e-posta zincirinde kaybolmaz.'],
  ['Müşteri onay bağlantısı', 'Ajanslar için: müşteriniz hesap açmadan bağlantıdan gönderileri görür, onaylar ya da düzeltme ister.'],
  ['Zamanında hatırlatma', 'Paylaşım saatinden önce e-posta gelir. Telefondan açın: görseli indirin, metni kopyalayın, paylaşın.'],
  ['Aylık rapor', 'Planlanan, paylaşılan, zamanında paylaşım oranı, platform ve içerik dağılımı. Her ayın başında e-postanızda.'],
];
const FAQ = [
  ['Gönderileri benim yerime paylaşıyor mu?', 'Şimdilik hayır. Arvela Social planlar, yazar, görseli hazırlar ve paylaşım saatinde hatırlatır; paylaşımı siz telefonunuzdan tek dokunuşla yaparsınız. Hesaplarınıza erişim izni istemeyiz.'],
  ['Deneme için kart gerekiyor mu?', `Hayır. ${TRIAL_DAYS} gün boyunca Business paketinin özelliklerini ücretsiz kullanırsınız; süre bitince paket seçmezseniz hesabınız salt okunur olur, verileriniz silinmez.`],
  ['Ödeme nasıl yapılıyor?', 'Paket seçtiğinizde size fatura ve havale bilgisi gönderiyoruz. Ödeme ulaşınca hesabınız etkinleşir.'],
  ['Hangi yapay zekâyı kullanıyorsunuz?', 'Metinler Anthropic\'in Claude modeliyle yazılır. Yapay zekâ özellikleri ancak hesap sahibinin onayıyla açılır; e-posta ve telefon numaraları gönderilmeden gizlenir.'],
  ['Ajansım için uygun mu?', 'Agency paketinde 5 marka, 10 kullanıcı ve müşteri onay bağlantısı var. Ek marka ve insan editör kontrolü eklenti olarak alınabilir.'],
];

export async function landing() {
  const prices = Object.fromEntries(await Promise.all([...Object.values(PLANS).map(p => p.code), ...Object.values(EXTRAS).map(e => e.code)].map(async c => [c, await priceOf(c)])));
  const feat = (p) => [`${p.brands} marka`, `${p.users} kullanıcı`, `${p.accounts} sosyal hesap`, `Ayda ${p.postsPerMonth} gönderi`, `Ayda ${p.aiPerMonth} yapay zekâ isteği`, p.approvals ? 'Ekip içi onay akışı' : 'Tek kişilik kullanım', p.clientLinks ? 'Müşteri onay bağlantısı' : null, p.aiImages ? `Ayda ${p.aiImagesPerMonth} yapay zekâ görseli` : null].filter(Boolean);
  const day = (n, items) => `<div class="lp-day"><span>${n}</span>${items.map(([c, t]) => `<i class="${c}">${t}</i>`).join('')}</div>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arvela Social · Yapay zekâ destekli sosyal medya planlama</title><meta name="description" content="Markanızın sesiyle aylık sosyal medya planı, metinler ve şablon görseller. Onay akışı, müşteri onay bağlantısı, paylaşım hatırlatması ve aylık rapor. ${TRIAL_DAYS} gün ücretsiz.">
<meta property="og:title" content="Arvela Social"><meta property="og:description" content="Sosyal medyanız, markanızın sesiyle planlansın."><meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head><body class="lp">
<header class="lp-nav"><a class="lp-logo" href="/">Arvela <span>SOCIAL</span></a><nav><a href="#nasil">Nasıl çalışır</a><a href="#fiyat">Fiyatlar</a><a href="#sss">Sorular</a><a href="/giris">Giriş</a><a class="btn gold" href="/kayit">Ücretsiz dene</a></nav></header>
<section class="lp-hero"><div><p class="lp-kicker">Yapay zekâ destekli sosyal medya planlama</p><h1>Sosyal medyanız, <span>markanızın sesiyle</span> planlansın.</h1>
<p class="lp-lead">Claude ayın takvimini ve metinlerini yazar, marka şablonlarınız görselleri hazırlar. Siz onaylar, zamanı gelince tek dokunuşla paylaşırsınız.</p>
<div class="row"><a class="btn gold lp-big" href="/kayit">${TRIAL_DAYS} gün ücretsiz dene</a><a class="btn ghost lp-big" href="#nasil">Nasıl çalışır?</a></div><p class="lp-small">Kart gerekmez · Türkçe · KVKK uyumlu veri işleme</p></div>
<div class="lp-cal" aria-hidden="true"><div class="lp-cal-h">Aralık</div><div class="lp-grid">${day(2, [['ok', 'Demleme rehberi']])}${day(4, [['warn', 'Kış harmanı']])}${day(6, [])}${day(9, [['ok', 'Barista hikâyesi']])}${day(11, [['gold', 'Kampanya']])}${day(13, [])}${day(16, [['warn', 'Yeni çekirdek']])}${day(18, [['ok', 'Müşteri yorumu']])}${day(20, [])}</div>
<div class="lp-note"><b>Claude</b> 12 gönderilik Aralık planını hazırladı. 3'ü onay bekliyor.</div></div></section>
<section class="lp-sec" id="nasil"><h2>Üç adımda bir aylık içerik</h2><div class="lp-steps">
<div><b>1</b><h3>Markanızı tanıtın</h3><p>Ne sattığınızı, kime sattığınızı ve nasıl konuştuğunuzu yazın. Logonuzu, renklerinizi ve fotoğraflarınızı yükleyin.</p></div>
<div><b>2</b><h3>Ayı Claude planlasın</h3><p>Ayın öne çıkacak konularını söyleyin; takvim, metinler, etiketler ve şablon görseller dakikalar içinde taslak olarak gelir.</p></div>
<div><b>3</b><h3>Onaylayın, paylaşın</h3><p>Ekibiniz ya da müşteriniz onaylar. Paylaşım saatinde hatırlatma gelir; görseli indirip metni kopyalayarak paylaşırsınız.</p></div></div></section>
<section class="lp-sec lp-alt"><h2>Ajansların ve markaların ihtiyacı olan her şey</h2><div class="lp-feat">${FEATURES.map(([t, d]) => `<div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></section>
<section class="lp-sec" id="fiyat"><h2>Fiyatlar</h2><p class="lp-lead" style="text-align:center;margin:0 auto 24px">Her pakette ${TRIAL_DAYS} gün ücretsiz deneme. Ödeme havale ile, faturalı.</p><div class="lp-price">${Object.entries(PLANS).map(([k, p]) => `<div class="${k === 'business' ? 'pick' : ''}">${k === 'business' ? '<span class="lp-tag">En çok tercih edilen</span>' : ''}<h3>${esc(p.name)}</h3>
<p class="lp-amount">${esc(prices[p.code] || 'Fiyat için yazın')}</p><ul>${feat(p).map(x => `<li>${esc(x)}</li>`).join('')}</ul><a class="btn ${k === 'business' ? 'gold' : 'ghost'}" href="/kayit">Ücretsiz başla</a></div>`).join('')}</div>
<div class="lp-extras"><h3>Eklentiler</h3>${Object.values(EXTRAS).map(e => `<p><strong>${esc(e.name)}</strong> · ${esc(prices[e.code] || '')}</p>`).join('')}</div></section>
<section class="lp-sec lp-alt" id="sss"><h2>Sık sorulanlar</h2><div class="lp-faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>
<section class="lp-cta"><h2>İlk ayınızı bugün planlayın.</h2><a class="btn gold lp-big" href="/kayit">${TRIAL_DAYS} gün ücretsiz dene</a></section>
<footer class="lp-foot"><span>Arvela Digital &amp; AI · Ek. Büyüt. Yelken aç.</span><span><a href="/gizlilik">Aydınlatma metni</a> · <a href="mailto:hello@arveladigital.com">hello@arveladigital.com</a></span></footer></body></html>`;
}


export function register() { setAnonHome(landing); }
