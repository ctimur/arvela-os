// Aylık rapor hesapları (veritabanı gerektirmez; testli)
import { MONTHS } from './ai-core.mjs';

// Ay sınırları İstanbul saatine göre: [başlangıç, bitiş)
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return [new Date(Date.UTC(y, m - 1, 1) - 3 * 3600e3).toISOString(), new Date(Date.UTC(y, m, 1) - 3 * 3600e3).toISOString()];
}
export const monthLabel = (month) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
export const prevMonth = (now = new Date()) => { const d = new Date(now.getTime() + 3 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); };
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;

// Saf hesap (testli): gönderi listesinden özet
export function summarize(posts, notes = []) {
  const live = posts.filter(p => p.status !== 'iptal');
  const pub = live.filter(p => p.status === 'paylasildi');
  const onTime = pub.filter(p => p.published_at && p.scheduled_at && Math.abs(new Date(p.published_at) - new Date(p.scheduled_at)) <= 2 * 3600e3).length;
  const byPlat = {}; for (const p of pub) for (const k of p.platforms || []) byPlat[k] = (byPlat[k] || 0) + 1;
  const byPillar = {}; for (const p of live) { const k = p.pillar || 'Sütunsuz'; byPillar[k] = (byPillar[k] || 0) + 1; }
  const revisions = notes.filter(n => n.kind === 'duzeltme' || (n.kind === 'musteri' && /^Düzeltme/.test(n.body))).length;
  return { planned: live.length, published: pub.length, onTime, onTimePct: pct(onTime, pub.length), missed: live.filter(p => p.status !== 'paylasildi' && p.scheduled_at && new Date(p.scheduled_at) < new Date()).length,
    ai: live.filter(p => p.ai).length, revisions, byPlat, byPillar, cancelled: posts.length - live.length };
}
