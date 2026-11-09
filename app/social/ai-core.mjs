// Arvela Social — yapay zekâ istemleri ve cevap doğrulama (veritabanı gerektirmez; testli).
import { clip, nn } from './lib.mjs';
import { PLATFORMS } from './plans.mjs';
import { TEMPLATES } from './templates.mjs';

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const OPS = { yaz: 'Metni yaz', iyilestir: 'İyileştir', kisalt: 'Kısalt', samimi: 'Daha samimi', resmi: 'Daha resmî', cta: 'Harekete geçirici yap', etiket: 'Etiket öner' };
const OP_TEXT = {
  yaz: 'Görsel fikri, başlık ve içerik sütununa göre bu gönderinin metnini sıfırdan yaz.',
  iyilestir: 'Mevcut metni marka sesine daha uygun, daha akıcı ve ilgi çekici hâle getir; anlamını koru.',
  kisalt: 'Mevcut metni yaklaşık yarısına indir; ana mesajı ve çağrıyı koru.',
  samimi: 'Mevcut metni daha samimi, sıcak ve konuşur gibi yeniden yaz.',
  resmi: 'Mevcut metni daha kurumsal ve resmî bir dille yeniden yaz.',
  cta: 'Mevcut metni koru ama sonunu daha net bir harekete geçirici çağrıyla güçlendir.',
  etiket: 'Metni değiştirme; yalnızca bu gönderi için uygun etiketler (hashtag) öner. "metin" alanına mevcut metni aynen yaz.',
};

export const maskPII = (s) => String(s ?? '')
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-posta]')
  .replace(/(?:\+?90[\s-]?)?\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, '[telefon]')
  .replace(/\b(?:\d[ -]?){10,}\b/g, '[numara]');

// Modelin cevabından ilk JSON nesnesini çıkarır (```json bloklarını da kabul eder)
export function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

export function brandBrief(b, accounts = []) {
  const L = (k, v) => v ? `${k}: ${maskPII(v)}` : '';
  return [L('Marka', b.name), L('Sektör', b.sector), L('Web sitesi', b.website), L('Ne sunuyor', b.offer), L('Hedef kitle', b.audience), L('Ses tonu', b.tone),
    L('Üslup notları', b.voice_notes), L('Kullanılmayacak ifadeler/konular', b.banned), (b.pillars || []).length ? `İçerik sütunları: ${b.pillars.join(', ')}` : '',
    `Emoji: ${b.emoji ? 'ölçülü kullanılabilir' : 'kullanma'}`, `Dil: ${b.language === 'en' ? 'İngilizce' : 'Türkçe'}`,
    accounts.length ? `Hesaplar: ${accounts.map(a => PLATFORMS[a.platform]?.name || a.platform).join(', ')}` : ''].filter(Boolean).join('\n');
}
const RULES = `Kurallar:
- Fiyat, indirim oranı, tarih, adres, ödül ya da istatistik UYDURMA; markanın verdiği bilgilerde yoksa yazma.
- Gerçek kişilerin adını, müşteri bilgisini ya da kişisel veriyi yazma.
- Sağlık, finans ve hukuk konularında kesin vaat verme.
- Platformların karakter ve etiket sınırlarına uy.
- Yalnız istenen JSON'u döndür; açıklama ekleme.`;

export function planPrompt({ brand, accounts, month, count, platforms, focus, today }) {
  const [y, m] = month.split('-').map(Number);
  const lims = platforms.map(k => `${PLATFORMS[k].name}: en çok ${PLATFORMS[k].max} karakter, ${PLATFORMS[k].tags} etiket`).join('; ');
  const tpl = Object.entries(TEMPLATES).map(([k, v]) => `${k} (${v.name})`).join(', ');
  return { system: `Sen Arvela Social'ın içerik stratejisti ve metin yazarısın. Türkiye'deki markalar için sosyal medya planı hazırlarsın. ${RULES}`,
    prompt: `${brandBrief(brand, accounts)}

Görev: ${MONTHS[m - 1]} ${y} için ${count} gönderilik içerik planı hazırla.
- Platformlar: ${platforms.map(k => PLATFORMS[k].name).join(', ')} (${lims}). Her gönderiye bu listeden bir ya da birkaç platform ver (anahtarlar: ${platforms.join(', ')}).
- Tarihler ${month} ayında, ${today} tarihinden sonra olsun; haftaya dengeli yay; aynı güne iki gönderi koyma.
- İçerik sütunlarını dengeli dağıt. Türkiye'deki önemli günleri yalnız tarihinden eminsen ve markaya uygunsa kullan.
${focus ? `- Bu ay öne çıkarılacaklar: ${maskPII(focus)}\n` : ''}- Her gönderi için şablon görsel önerisi ver. Şablonlar: ${tpl}.

JSON biçimi:
{"gonderiler":[{"tarih":"YYYY-MM-DD","saat":"HH:MM","platformlar":["instagram"],"sutun":"...","baslik":"kısa iç başlık","metin":"paylaşım metni","etiketler":"#a #b","ilk_yorum":"","gorsel_fikri":"çekim ya da görsel notu","sablon":{"tur":"kapak","ust":"","baslik":"görsel üzerindeki kısa başlık","alt":"","cta":"","maddeler":""}}]}` };
}

export function textPrompt({ brand, accounts, post, op, note, max }) {
  return { system: `Sen Arvela Social'ın metin yazarısın. ${RULES}`,
    prompt: `${brandBrief(brand, accounts)}

Gönderi:
- Platformlar: ${(post.platforms || []).map(k => PLATFORMS[k]?.name || k).join(', ') || 'Instagram'} (en çok ${max} karakter)
- İçerik sütunu: ${maskPII(post.pillar || '-')}
- İç başlık: ${maskPII(post.title || '-')}
- Görsel fikri: ${maskPII(post.visual_brief || '-')}
- Mevcut metin: ${maskPII(post.caption || '(yok)')}
- Mevcut etiketler: ${maskPII(post.hashtags || '(yok)')}

Görev: ${OP_TEXT[op]}${note ? `\nEk istek: ${maskPII(note)}` : ''}
Birbirinden belirgin biçimde farklı 3 seçenek ver.
JSON biçimi: {"secenekler":[{"metin":"...","etiketler":"#a #b"}]}` };
}

// Plan maddelerini doğrular, ay dışı/geçmiş tarihleri düzeltir, aynı güne çakışanı kaydırır.
export function normalizePlan(items, { month, platforms, pillars = [], now = new Date(), defaultTime = '19:00' }) {
  const [y, m] = month.split('-').map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayK = new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
  const first = `${month}-01` > todayK ? 1 : Number(todayK.slice(8)) + (todayK.startsWith(month) ? 1 : 0);
  const free = []; for (let d = Math.max(1, first); d <= days; d++) free.push(`${month}-${String(d).padStart(2, '0')}`);
  const used = new Set(); const out = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, 62)) {
    if (!it || typeof it !== 'object' || !String(it.metin || '').trim()) continue;
    let day = /^\d{4}-\d{2}-\d{2}$/.test(it.tarih || '') && free.includes(it.tarih) && !used.has(it.tarih) ? it.tarih : null;
    if (!day) day = free.find(d => !used.has(d)) || null; if (!day) break; used.add(day);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(it.saat || '') ? it.saat : defaultTime;
    const plats = [...new Set([].concat(it.platformlar || []).filter(k => platforms.includes(k)))]; if (!plats.length) plats.push(platforms[0]);
    const max = Math.min(...plats.map(k => PLATFORMS[k].max));
    const s = it.sablon && typeof it.sablon === 'object' ? it.sablon : {};
    out.push({ day, time, platforms: plats, pillar: pillars.includes(it.sutun) ? it.sutun : (clip(nn(it.sutun), 60) || null), title: clip(nn(it.baslik), 120),
      caption: String(it.metin).trim().slice(0, max), hashtags: clip(nn(it.etiketler), 600), first_comment: clip(nn(it.ilk_yorum), 2200), visual_brief: clip(nn(it.gorsel_fikri), 1000),
      template: TEMPLATES[s.tur] ? s.tur : 'kapak', template_data: { baslik: clip(s.baslik, 200) || '', alt: clip(s.alt, 200) || '', cta: clip(s.cta, 32) || '', maddeler: clip(s.maddeler, 600) || '', ust: clip(s.ust, 40) || '' } });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export function normalizeOptions(j, max) {
  return (Array.isArray(j?.secenekler) ? j.secenekler : []).filter(o => o && String(o.metin || '').trim()).slice(0, 3)
    .map(o => ({ metin: String(o.metin).trim().slice(0, max), etiketler: clip(nn(o.etiketler), 600) || '' }));
}
