// Arvela Social — marka şablonları: markanın renkleri, yazı tipi ve logosuyla SVG paylaşım görseli.
// Sunucu SVG'yi üretir (fotoğraf ve logo gömülü); tarayıcı bunu PNG'ye çevirip medyaya kaydeder (ek kütüphane yok).
import { esc } from './lib.mjs';
import { FORMATS } from './plans.mjs';

export const TEMPLATES = {
  kapak: { name: 'Fotoğraf + başlık', needsPhoto: true, fields: ['baslik', 'alt'] },
  alinti: { name: 'Alıntı / söz', needsPhoto: false, fields: ['baslik', 'alt'] },
  kampanya: { name: 'Kampanya', needsPhoto: true, fields: ['baslik', 'alt', 'cta'] },
  liste: { name: 'Liste / ipuçları', needsPhoto: false, fields: ['baslik', 'maddeler'] },
  duyuru: { name: 'Duyuru', needsPhoto: false, fields: ['ust', 'baslik', 'alt'] },
};
export const FONTS = { modern: { name: 'Modern', css: 'Arial, Helvetica, sans-serif' }, klasik: { name: 'Klasik', css: 'Georgia, "Times New Roman", serif' }, yuvarlak: { name: 'Yumuşak', css: 'Verdana, Tahoma, sans-serif' }, guclu: { name: 'Güçlü', css: '"Arial Black", Impact, sans-serif' } };
export const DEFAULT_COLORS = { primary: '#0B0D12', accent: '#E2BE7A', bg: '#F7F4EE', text: '#141A22' };
const HEX = /^#[0-9a-fA-F]{6}$/;
export const brandColors = (b) => { const c = b?.colors || {}; return Object.fromEntries(Object.entries(DEFAULT_COLORS).map(([k, v]) => [k, HEX.test(c[k] || '') ? c[k] : v])); };

// Okunur metin rengi (zemin açıksa koyu, koyuysa açık)
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const L = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b) > 0.35 ? '#141A22' : '#FFFFFF';
}

// Sözcük kaydırma: yaklaşık karakter genişliğiyle; sığmazsa boyut küçülür.
export function fit(text, width, maxLines, sizes, k = 0.56) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  for (const size of sizes) {
    const max = Math.max(4, Math.floor(width / (size * k))); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (t.length <= max) cur = t; else { if (cur) lines.push(cur); cur = w.length > max ? w.slice(0, max - 1) + '…' : w; } }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines) return { size, lines };
    if (size === sizes.at(-1)) { const l = lines.slice(0, maxLines); l[maxLines - 1] = l[maxLines - 1].replace(/.?$/, '…'); return { size, lines: l }; }
  }
  return { size: sizes.at(-1), lines: [] };
}
const tspans = (f, x, y, lh, anchor = 'start') => f.lines.map((l, i) => `<tspan x="${x}" y="${y + i * f.size * lh}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(l)}</tspan>`).join('');

export function renderSvg({ template, format, data = {}, brand, photo, logo }) {
  const F = FORMATS[format] || FORMATS.kare; const W = F.w, H = F.h; const c = brandColors(brand); const font = (FONTS[brand?.font] || FONTS.modern).css;
  const t = TEMPLATES[template] ? template : 'alinti'; const M = 80; const name = esc(brand?.name || '');
  const img = (x, y, w, h) => photo ? `<image href="${photo}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.primary}" opacity=".85"/>`;
  const mark = (x, y, color, anchor = 'start') => logo ? `<image href="${logo}" x="${anchor === 'end' ? x - 220 : x}" y="${y - 52}" width="220" height="64" preserveAspectRatio="${anchor === 'end' ? 'xMaxYMid' : 'xMinYMid'} meet"/>`
    : `<text x="${x}" y="${y}" font-size="30" font-weight="700" fill="${color}"${anchor === 'end' ? ' text-anchor="end"' : ''}>${name}</text>`;
  let body = '';
  if (t === 'kapak') {
    const f = fit(data.baslik, W - 2 * M, 4, [84, 72, 62, 54]); const s = fit(data.alt, W - 2 * M, 3, [36, 32, 28]);
    const block = f.lines.length * f.size * 1.12 + (s.lines.length ? s.lines.length * s.size * 1.35 + 28 : 0); const top = H - M - 70 - block;
    body = `${img(0, 0, W, H)}<rect x="0" y="${top - 70}" width="${W}" height="${H - top + 70}" fill="${c.primary}" opacity=".82"/>
<rect x="${M}" y="${top - 30}" width="120" height="8" fill="${c.accent}"/>
<text font-size="${f.size}" font-weight="700" fill="${onColor(c.primary)}">${tspans(f, M, top + f.size, 1.12)}</text>
<text font-size="${s.size}" fill="${onColor(c.primary)}" opacity=".85">${tspans(s, M, top + f.lines.length * f.size * 1.12 + 28 + s.size, 1.35)}</text>${mark(W - M, H - M + 10, onColor(c.primary), 'end')}`;
  } else if (t === 'kampanya') {
    const ph = Math.round(H * 0.55); const f = fit(data.baslik, W - 2 * M, 3, [80, 68, 58, 50]); const s = fit(data.alt, W - 2 * M, 2, [34, 30, 26]); const cta = esc(String(data.cta || '').slice(0, 32));
    body = `${img(0, 0, W, ph)}<rect x="0" y="${ph}" width="${W}" height="${H - ph}" fill="${c.primary}"/>
<text font-size="${f.size}" font-weight="700" fill="${onColor(c.primary)}">${tspans(f, M, ph + 60 + f.size, 1.1)}</text>
<text font-size="${s.size}" fill="${onColor(c.primary)}" opacity=".85">${tspans(s, M, ph + 60 + f.lines.length * f.size * 1.1 + 20 + s.size, 1.3)}</text>
${cta ? `<rect x="${M}" y="${H - M - 84}" rx="42" width="${Math.max(260, cta.length * 20 + 80)}" height="84" fill="${c.accent}"/><text x="${M + 40}" y="${H - M - 30}" font-size="34" font-weight="700" fill="${onColor(c.accent)}">${cta}</text>` : ''}
${mark(W - M, H - M - 20, onColor(c.primary), 'end')}`;
  } else if (t === 'liste') {
    const f = fit(data.baslik, W - 2 * M, 3, [72, 62, 54]); const items = String(data.maddeler || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    let y = M + 60 + f.lines.length * f.size * 1.1 + 60; const avail = H - y - M - 90; const per = items.length ? avail / items.length : 0; let list = '';
    items.forEach((it, i) => { const g = fit(it, W - 2 * M - 110, 2, [40, 34, 30]); list += `<circle cx="${M + 34}" cy="${y + g.size * 0.15}" r="34" fill="${c.accent}"/><text x="${M + 34}" y="${y + g.size * 0.15 + 13}" font-size="36" font-weight="700" text-anchor="middle" fill="${onColor(c.accent)}">${i + 1}</text>
<text font-size="${g.size}" fill="${c.text}">${tspans(g, M + 100, y + g.size * 0.35, 1.25)}</text>`; y += Math.min(per, 200); });
    body = `<rect width="${W}" height="${H}" fill="${c.bg}"/><rect x="${M}" y="${M}" width="120" height="8" fill="${c.accent}"/>
<text font-size="${f.size}" font-weight="700" fill="${c.text}">${tspans(f, M, M + 40 + f.size, 1.1)}</text>${list}${mark(M, H - M + 6, c.text)}`;
  } else if (t === 'duyuru') {
    const u = esc(String(data.ust || '').slice(0, 40).toLocaleUpperCase('tr-TR')); const f = fit(data.baslik, W - 2 * M, 5, [110, 96, 84, 72, 62]); const s = fit(data.alt, W - 2 * M, 3, [38, 34, 30]);
    const block = f.lines.length * f.size * 1.08; const top = H / 2 - block / 2;
    body = `<rect width="${W}" height="${H}" fill="${c.primary}"/>${u ? `<text x="${W / 2}" y="${top - 60}" font-size="30" font-weight="700" letter-spacing="6" text-anchor="middle" fill="${c.accent}">${u}</text>` : ''}
<text font-size="${f.size}" font-weight="700" fill="${onColor(c.primary)}">${tspans(f, W / 2, top + f.size * 0.85, 1.08, 'middle')}</text>
<text font-size="${s.size}" fill="${onColor(c.primary)}" opacity=".8">${tspans(s, W / 2, top + block + 50 + s.size, 1.3, 'middle')}</text>${logo ? `<image href="${logo}" x="${W / 2 - 110}" y="${H - M - 58}" width="220" height="64" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${W / 2}" y="${H - M + 6}" font-size="30" font-weight="700" text-anchor="middle" fill="${onColor(c.primary)}">${name}</text>`}`;
  } else {
    const f = fit(data.baslik, W - 2 * M - 40, 6, [76, 66, 58, 50, 44], 0.52); const s = fit(data.alt, W - 2 * M, 2, [32, 28]);
    const block = f.lines.length * f.size * 1.2; const top = (H - block) / 2;
    body = `<rect width="${W}" height="${H}" fill="${c.bg}"/><text x="${M - 8}" y="${top - 10}" font-size="220" font-family="Georgia, serif" fill="${c.accent}">“</text>
<text font-size="${f.size}" font-weight="700" fill="${c.text}">${tspans(f, M, top + f.size + 40, 1.2)}</text>
<rect x="${M}" y="${top + block + 80}" width="80" height="6" fill="${c.accent}"/><text font-size="${s.size}" fill="${c.text}" opacity=".75">${tspans(s, M, top + block + 120 + s.size * 0.6, 1.3)}</text>${mark(W - M, H - M + 6, c.text, 'end')}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${font}'>${body}</svg>`;
}
