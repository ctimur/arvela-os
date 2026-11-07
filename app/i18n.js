// Arvela OS — dil katmanı (Türkçe asıl, İngilizce çeviri).
// Kodun yazdığı arayüz metni çevrilir; kullanıcı verisi h() ile işaretlenir ve çeviriye girmez.
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

export const LANGS = { tr: 'Türkçe', en: 'English' };
const EN = JSON.parse(fs.readFileSync(new URL('./i18n-en.json', import.meta.url), 'utf8'));
export const als = new AsyncLocalStorage();
export const lang = () => als.getStore()?.lang || 'tr';

// Kullanıcı verisi işaretleri: çeviri bu aralığa dokunmaz, sonra silinir.
export const M1 = '\u0001', M2 = '\u0002';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keys = Object.keys(EN).sort((a, b) => b.length - a.length);
const PHRASE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(k => esc(k).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const norm = (s) => s.replace(/\s+/g, ' ');

// Bir metin parçasındaki bilinen ifadeleri çevirir (işaretli aralıklar hariç).
function phrases(text) {
  let out = '', depth = 0, buf = '';
  const flush = () => { if (buf) out += buf.replace(PHRASE, (m) => EN[norm(m)] ?? m); buf = ''; };
  for (const ch of text) {
    if (ch === M1) { if (depth === 0) flush(); depth++; out += ch; continue; }
    if (ch === M2) { depth = Math.max(0, depth - 1); out += ch; continue; }
    if (depth === 0) buf += ch; else out += ch;
  }
  flush();
  return out;
}

// Tam eşleşen sabit etiketleri çevirir (durum adları, rozetler, hata iletileri).
export function exact(s) {
  if (lang() !== 'en') return s;
  const k = norm(String(s)).trim();
  return Object.hasOwn(EN, k) ? EN[k] : s;
}

// Kod içinde birleştirilen cümleler için: t`${alan} için müdahale gerekiyor`
export function t(strings, ...vals) {
  if (lang() !== 'en') return strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
  return strings.reduce((a, s, i) => a + phrases(s) + (i < vals.length ? exact(vals[i]) : ''), '');
}

const ATTR = /\b(placeholder|aria-label|title|data-confirm|alt)="([^"]*)"/g;
// Sayfanın tamamını çevirir: etiket dışı metin ve okunan öznitelikler; style/script dokunulmaz.
export function translateHtml(html) {
  if (lang() !== 'en') return strip(html);
  let out = '', i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += phrases(html.slice(i)); break; }
    out += phrases(html.slice(i, lt));
    const gt = html.indexOf('>', lt); if (gt < 0) { out += html.slice(lt); break; }
    let tag = html.slice(lt, gt + 1);
    const name = (tag.match(/^<\s*([a-zA-Z0-9]+)/) || [])[1]?.toLowerCase();
    if (name === 'html') tag = tag.replace(/lang="tr"/, 'lang="en"');
    out += tag.replace(ATTR, (m, a, v) => `${a}="${phrases(v)}"`);
    i = gt + 1;
    if (name === 'style' || name === 'script') {
      const end = html.indexOf(`</${name}`, i); const j = end < 0 ? html.length : end;
      out += html.slice(i, j); i = j;
    }
  }
  return strip(out);
}
export const strip = (s) => s.replace(/[\u0001\u0002]/g, '');

// İstek dili: kullanıcı tercihi > çerez > tarayıcı.
export function pickLang(user, cookies, acceptLanguage) {
  if (user?.lang && LANGS[user.lang]) return user.lang;
  if (LANGS[cookies?.lang]) return cookies.lang;
  return /^\s*en\b/i.test(acceptLanguage || '') ? 'en' : 'tr';
}
export const locale = () => lang() === 'en' ? 'en-GB' : 'tr-TR';
