// Arvela Social — aylık rapor: plan ve paylaşım sayıları, zamanında paylaşım, onay turları, platform ve sütun dağılımı.
// Her ayın 1'inde hesap sahiplerine önceki ayın özeti e-postayla gider.
import { route, send, redirect } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, badge } from './ui.mjs';
import { esc, fmtDateTime } from './lib.mjs';
import { PLATFORMS, POST_ST, POST_TONE } from './plans.mjs';
import { sendMail, mailHtml, recipients } from './notify.mjs';

import { monthRange, monthLabel, prevMonth, summarize } from './report-core.mjs';
export { monthRange, monthLabel, prevMonth, summarize };

export async function brandMonth(brandId, month) {
  const [a, b] = monthRange(month);
  const posts = await all(`SELECT id, title, caption, status, platforms, pillar, ai, scheduled_at, published_at FROM posts WHERE brand_id=$1 AND scheduled_at >= $2 AND scheduled_at < $3 ORDER BY scheduled_at`, [brandId, a, b]);
  const notes = posts.length ? await all(`SELECT kind, body FROM post_notes WHERE post_id = ANY($1::int[]) AND kind IN ('duzeltme','musteri')`, [posts.map(p => p.id)]) : [];
  return { posts, s: summarize(posts, notes) };
}

const bars = (obj, label = (k) => k) => { const max = Math.max(1, ...Object.values(obj)); return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
  `<div style="display:grid;grid-template-columns:140px 1fr 36px;gap:10px;align-items:center;margin:6px 0"><span>${esc(label(k))}</span><span style="background:#EFE9DD;border-radius:6px;height:12px"><span style="display:block;height:12px;border-radius:6px;background:var(--gold);width:${Math.round(v * 100 / max)}%"></span></span><strong>${v}</strong></div>`).join('') || '<p class="muted">Veri yok.</p>'; };

export async function sendMonthlyReports(now = new Date()) {
  const month = prevMonth(now); let n = 0;
  const brands = await all(`SELECT b.id, b.name, b.workspace_id FROM brands b JOIN workspaces w ON w.id=b.workspace_id WHERE w.status IN ('aktif','deneme','odeme')`);
  for (const b of brands) {
    const key = `report.${b.id}.${month}`; const done = await one(`INSERT INTO settings (key, value) VALUES ($1, 'gonderildi') ON CONFLICT (key) DO NOTHING RETURNING key`, [key]); if (!done) continue;
    const { s } = await brandMonth(b.id, month); if (!s.planned) continue;
    for (const u of await recipients(b.workspace_id, ['owner'])) {
      await sendMail(u.email, `${b.name} · ${monthLabel(month)} sosyal medya raporu`, mailHtml(`${monthLabel(month)} özeti`, [`${b.name} için ${s.planned} gönderi planlandı, ${s.published} gönderi paylaşıldı.`,
        s.published ? `Zamanında paylaşım: %${s.onTimePct} (${s.onTime}/${s.published}).` : '', s.missed ? `Paylaşılmayan: ${s.missed}.` : '', s.revisions ? `Düzeltme turu: ${s.revisions}.` : ''], ['Raporu aç', `/rapor?ay=${month}&marka=${b.id}`]), 'genel'); n++;
    }
  }
  return n;
}

export function register() {
  route('GET', '/rapor', async (ctx, res) => {
    const want = Number(ctx.url.searchParams.get('marka')); const brand = ctx.brands.find(b => b.id === want) || ctx.brand; if (!brand) return redirect(res, '/baslangic');
    const now = new Date(Date.now() + 3 * 3600e3); const cur = now.toISOString().slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(ctx.url.searchParams.get('ay') || '') ? ctx.url.searchParams.get('ay') : cur;
    const { posts, s } = await brandMonth(brand.id, month);
    const [y, m] = month.split('-').map(Number); const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    send(res, 200, layout(ctx, 'Aylık rapor', `<div class="page-head"><div><h1>${esc(brand.name)} · ${monthLabel(month)}</h1><p>Aylık sosyal medya raporu</p></div>
<div class="row no-print"><a class="btn ghost" href="/rapor?ay=${prev}&marka=${brand.id}">← Önceki</a>${next <= cur ? `<a class="btn ghost" href="/rapor?ay=${next}&marka=${brand.id}">Sonraki →</a>` : ''}<button class="ghost" data-print>Yazdır / PDF</button></div></div>
<div class="kpi"><div><b>${s.planned}</b><span>planlanan gönderi</span></div><div><b>${s.published}</b><span>paylaşıldı</span></div><div><b>${s.published ? '%' + s.onTimePct : '—'}</b><span>zamanında paylaşım</span></div><div><b>${s.revisions}</b><span>düzeltme turu</span></div></div>
<div class="grid2" style="align-items:start"><section class="card"><h2>Platformlara göre paylaşım</h2>${bars(s.byPlat, k => PLATFORMS[k]?.name || k)}</section><section class="card"><h2>İçerik sütunları</h2>${bars(s.byPillar)}</section></div>
<section class="card"><h2>Gönderiler</h2><div class="tbl"><table><tr><th>Zaman</th><th>Gönderi</th><th>Platform</th><th>Durum</th></tr>${posts.map(p => `<tr><td>${fmtDateTime(p.scheduled_at)}</td><td><a href="/gonderi/${p.id}">${esc(p.title || String(p.caption || 'Başlıksız').slice(0, 70))}</a>${p.ai ? ' <span class="muted">· YZ</span>' : ''}</td>
<td>${(p.platforms || []).map(k => esc(PLATFORMS[k]?.name || k)).join(', ')}</td><td>${badge(POST_ST[p.status], POST_TONE[p.status])}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Bu ay planlanmış gönderi yok.</td></tr>'}</table></div>
${s.missed ? `<p class="muted">Zamanı geçtiği hâlde paylaşıldı olarak işaretlenmeyen ${s.missed} gönderi var.</p>` : ''}</section>`, '/rapor'));
  });
}
