// Arvela Social — analitik: kanal takipçileri, paylaşılan gönderilerin etkileşimi, kısa link tıklamaları.
import { route, send, redirect } from './server.mjs';
import { all } from './db.mjs';
import { layout } from './ui.mjs';
import { esc, int, fmtDateTime } from './lib.mjs';
import { PLATFORMS } from './plans.mjs';
import { avatar } from './channels.mjs';

export const METRIC_NAMES = { views: 'Görüntülenme', reach: 'Erişim', likes: 'Beğeni', comments: 'Yorum', shares: 'Paylaşım', saved: 'Kaydetme', clicks: 'Tıklama' };
// Saf hesap (testli): hedef satırlarından toplamlar
export function sumMetrics(rows) {
  const t = {}; for (const r of rows) for (const [k, v] of Object.entries(r.metrics || {})) if (typeof v === 'number') t[k] = (t[k] || 0) + v;
  t.engagement = (t.likes || 0) + (t.comments || 0) + (t.shares || 0) + (t.saved || 0); return t;
}

export function register() {
  route('GET', '/analitik', async (ctx, res) => {
    const b = ctx.brand; if (!b) return redirect(res, '/baslangic');
    const days = [7, 30, 90].includes(int(ctx.url.searchParams.get('gun'))) ? int(ctx.url.searchParams.get('gun')) : 30;
    const accs = await all('SELECT * FROM accounts WHERE brand_id=$1 ORDER BY (kind IS NULL), platform, id', [b.id]);
    const rows = await all(`SELECT t.*, p.title, p.caption, a.name acc, a.platform FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN accounts a ON a.id=t.account_id
      WHERE p.brand_id=$1 AND t.status='paylasildi' AND t.published_at > now() - ($2 || ' days')::interval ORDER BY t.published_at DESC`, [b.id, String(days)]);
    const links = await all(`SELECT s.code, s.url, s.clicks, p.title FROM shortlinks s LEFT JOIN posts p ON p.id=s.post_id WHERE s.workspace_id=$1 AND (p.brand_id=$2 OR p.id IS NULL) AND s.created_at > now() - ($3 || ' days')::interval ORDER BY s.clicks DESC LIMIT 20`, [ctx.ws.id, b.id, String(days)]);
    const tot = sumMetrics(rows); const clicks = links.reduce((s, l) => s + l.clicks, 0);
    const manual = (await all(`SELECT count(*)::int n FROM posts WHERE brand_id=$1 AND status='paylasildi' AND published_at > now() - ($2 || ' days')::interval AND publish_mode<>'otomatik'`, [b.id, String(days)]))[0].n;
    const perAcc = accs.filter(a => a.kind).map(a => { const r = rows.filter(x => x.account_id === a.id); return { a, n: r.length, t: sumMetrics(r) }; });
    const top = [...rows].sort((x, y) => (sumMetrics([y]).engagement + (y.metrics?.views || y.metrics?.reach || 0) / 100) - (sumMetrics([x]).engagement + (x.metrics?.views || x.metrics?.reach || 0) / 100)).slice(0, 10);
    const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('tr-TR');
    send(res, 200, layout(ctx, 'Analitik', `<div class="page-head"><div><h1>Analitik</h1><p>${esc(b.name)} · son ${days} gün · metrikler 6 saatte bir güncellenir</p></div>
<div class="seg">${[7, 30, 90].map(d => `<a class="${d === days ? 'on' : ''}" href="/analitik?gun=${d}">${d} gün</a>`).join('')}</div></div>
${accs.some(a => a.kind) ? '' : '<div class="note">Analitik için <a href="/kanallar">bir kanal bağlayın</a>. Elle paylaşılan gönderilerin istatistikleri platformdan okunamaz.</div>'}
<div class="kpi"><div><b>${rows.length}</b><span>otomatik paylaşım${manual ? ` · ${manual} elle` : ''}</span></div><div><b>${fmt(tot.views ?? tot.reach ?? null)}</b><span>görüntülenme / erişim</span></div><div><b>${fmt(tot.engagement)}</b><span>etkileşim</span></div><div><b>${fmt(clicks)}</b><span>kısa link tıklaması</span></div></div>
<div class="chan-grid">${perAcc.map(({ a, n, t }) => `<section class="card chan">${avatar(a, 40)}<div class="chan-b"><strong>${esc(a.name || a.handle)}</strong><span class="muted">${esc(PLATFORMS[a.platform]?.name || a.platform)}</span>
<span>${a.followers != null ? `<strong>${fmt(a.followers)}</strong> takipçi` : '<span class="muted">Takipçi sayısı okunamıyor</span>'}</span><span class="muted">${n} gönderi · ${fmt(t.engagement)} etkileşim${t.views || t.reach ? ` · ${fmt(t.views || t.reach)} görüntülenme` : ''}</span></div></section>`).join('')}</div>
<section class="card"><h2>En iyi gönderiler</h2><div class="tbl"><table><tr><th>Gönderi</th><th>Kanal</th><th>Paylaşım</th>${['views', 'reach', 'likes', 'comments', 'shares', 'saved'].map(k => `<th>${METRIC_NAMES[k]}</th>`).join('')}</tr>
${top.map(r => `<tr><td><a href="/gonderi/${r.post_id}">${esc(r.title || String(r.caption || 'Başlıksız').slice(0, 50))}</a>${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">aç</a>` : ''}</td><td>${esc(r.acc)}</td><td>${fmtDateTime(r.published_at)}</td>${['views', 'reach', 'likes', 'comments', 'shares', 'saved'].map(k => `<td>${fmt(r.metrics?.[k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="9" class="muted">Bu dönemde otomatik paylaşılan gönderi yok.</td></tr>`}</table></div>
<p class="muted" style="font-size:12px">LinkedIn kişisel profil istatistiklerini dış uygulamalarla paylaşmıyor; LinkedIn için yalnız şirket sayfası istatistikleri görünür.</p></section>
${links.length ? `<section class="card"><h2>Kısa linkler</h2><div class="tbl"><table><tr><th>Bağlantı</th><th>Hedef</th><th>Gönderi</th><th>Tıklama</th></tr>${links.map(l => `<tr><td><code>/l/${esc(l.code)}</code></td><td>${esc(l.url.slice(0, 60))}</td><td>${esc(l.title || '')}</td><td><strong>${fmt(l.clicks)}</strong></td></tr>`).join('')}</table></div></section>` : ''}`, '/analitik'));
  });
}
