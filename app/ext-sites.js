// Arvela OS — siteler modülü: müşteri siteleri, hosting/SSL/WordPress durumu, Hostinger içe aktarımı.
import { translateHtml } from './i18n.js';
import fs from 'node:fs';

const LATEST_WP = '7.1.4';
const SSL = { active: 'Aktif', failed: 'Kurulamadı', expired: 'Süresi dolmuş', not_installed: 'Yok' };

function wpBehind(v) {
  if (!v) return false;
  const a = v.split('.').map(Number); const b = LATEST_WP.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); }
  return false;
}
export function siteHealth(s) {
  if (s.issue || ['failed', 'expired'].includes(s.ssl_status)) return { tone: 'bad', label: 'Acil' };
  if (wpBehind(s.wp_version)) return { tone: 'warn', label: 'Güncelleme' };
  if (s.platform === 'WordPress' && s.ssl_status === 'active') return { tone: 'ok', label: 'Sağlıklı' };
  return { tone: '', label: 'Kontrol edilmedi' };
}

export async function migrateSites({ q, one }) {
  await q(`CREATE TABLE IF NOT EXISTS sites (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT REFERENCES clients(id),
    domain TEXT NOT NULL, platform TEXT, hosting TEXT, wp_version TEXT, ssl_status TEXT, issue TEXT, checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (agency_id, domain))`);
  const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']);
  const has = await one('SELECT count(*)::int n FROM sites WHERE agency_id=$1', [agency.id]);
  const file = new URL('./import-sites.json', import.meta.url);
  if (has.n > 0 || !fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const svc = async (code) => one('SELECT id FROM services WHERE agency_id=$1 AND code=$2', [agency.id, code]);
  const hostingSvc = await svc('WEB-21'); const careSvc = await svc('WEB-20');
  let nClients = 0, nSites = 0;
  for (const c of data.clients) {
    let client = await one('SELECT id FROM clients WHERE agency_id=$1 AND lower(name)=lower($2)', [agency.id, c.name]);
    if (!client) {
      client = await one(`INSERT INTO clients (agency_id, name, sector, status, notes) VALUES ($1,$2,$3,'active',$4) RETURNING id`,
        [agency.id, c.name, c.sector || null, 'Hostinger hesabından aktarıldı (7 Kasım 2026).']);
      nClients++;
      if (hostingSvc) await q(`INSERT INTO client_services (agency_id, client_id, service_id, status, notes) VALUES ($1,$2,$3,'aktif',$4)`, [agency.id, client.id, hostingSvc.id, 'Mevcut barındırma']);
      if (careSvc) await q(`INSERT INTO client_services (agency_id, client_id, service_id, status, notes) VALUES ($1,$2,$3,'teklif',$4)`, [agency.id, client.id, careSvc.id, 'Bakım aboneliği teklif edilecek']);
    }
    for (const s of c.sites) {
      await q(`INSERT INTO sites (agency_id, client_id, domain, platform, hosting, wp_version, ssl_status, issue, checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (agency_id, domain) DO NOTHING`,
        [agency.id, client.id, s.domain, s.platform || null, 'Hostinger Cloud Startup', s.wp || null, s.ssl || null, s.issue || null, '2026-11-07T00:00:00Z']);
      nSites++;
    }
  }
  console.log(`siteler aktarıldı: ${nClients} müşteri, ${nSites} site`);
}

export function registerSites({ route, all, one, q, need, layout, h, badge, fmtDate, csrfField, audit, HttpError, int, STAFF }) {
  const row = (s, withClient) => {
    const hl = siteHealth(s);
    return `<tr><td><a href="https://${h(s.domain)}" rel="noopener" target="_blank">${h(s.domain)}</a></td>${withClient ? `<td>${s.client_id ? `<a href="/musteriler/${s.client_id}">${h(s.client)}</a>` : '—'}</td>` : ''}
<td>${h(s.platform || '—')}</td><td>${h(s.wp_version || '—')}</td><td>${h(SSL[s.ssl_status] || '—')}</td><td>${badge(hl.label, hl.tone)}</td><td>${h(s.issue || '')}</td></tr>`;
  };
  const head = (withClient) => `<tr><th>Alan adı</th>${withClient ? '<th>Müşteri</th>' : ''}<th>Platform</th><th>WordPress</th><th>SSL</th><th>Durum</th><th>Not</th></tr>`;

  route('GET', '/siteler', async (ctx, res) => {
    need(ctx, ...STAFF);
    const rows = await all(`SELECT s.*, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1 ORDER BY c.name, s.domain`, [ctx.user.agency_id]);
    const counts = { bad: 0, warn: 0, ok: 0, '': 0 };
    rows.forEach(s => { counts[siteHealth(s).tone]++; });
    const order = { bad: 0, warn: 1, '': 2, ok: 3 };
    rows.sort((a, b) => order[siteHealth(a).tone] - order[siteHealth(b).tone]);
    const stat = (n, t) => `<div class="card"><span class="muted">${t}</span><span class="stat">${n}</span></div>`;
    send(ctx, res, layout(ctx, 'Siteler', `<h1>Siteler</h1><p class="muted">${rows.length} site · son kontrol: 7 Kasım 2026 Hostinger denetimi. Güncel WordPress: ${LATEST_WP}.</p>
<div class="grid">${stat(counts.bad, 'Acil')}${stat(counts.warn, 'Güncelleme bekliyor')}${stat(counts.ok, 'Sağlıklı')}${stat(counts[''], 'Kontrol edilmedi')}</div>
<div class="tbl"><table>${head(true)}${rows.map(s => row(s, true)).join('') || '<tr><td colspan="7" class="muted">Site yok.</td></tr>'}</table></div>
<details class="card"><summary>Site ekle</summary><form class="row" method="post" action="/siteler">${csrfField(ctx)}
<label>Alan adı<input name="domain" required placeholder="ornek.com"></label><label>Platform<input name="platform" placeholder="WordPress"></label>
<label>Müşteri<select name="client_id"><option value="">—</option>${(await all('SELECT id, name FROM clients WHERE agency_id=$1 ORDER BY name', [ctx.user.agency_id])).map(c => `<option value="${c.id}">${h(c.name)}</option>`).join('')}</select></label>
<button class="gold">Ekle</button></form></details>`, '/siteler'));
  });
  route('POST', '/siteler', async (ctx, res) => {
    need(ctx, ...STAFF);
    const domain = String(ctx.body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new HttpError(400, 'Alan adı geçersiz.');
    let cid = int(ctx.body.client_id);
    if (cid && !(await one('SELECT 1 FROM clients WHERE id=$1 AND agency_id=$2', [cid, ctx.user.agency_id]))) cid = null;
    try {
      await q('INSERT INTO sites (agency_id, client_id, domain, platform) VALUES ($1,$2,$3,$4)', [ctx.user.agency_id, cid, domain, String(ctx.body.platform || '').trim() || null]);
    } catch (e) { if (e.code === '23505') throw new HttpError(400, 'Bu alan adı zaten kayıtlı.'); throw e; }
    await audit(ctx, 'site.create', { domain });
    res.writeHead(303, { Location: '/siteler' }); res.end();
  });
  route('GET', '/musteriler/:id/siteler', async (ctx, res, p) => {
    need(ctx, ...STAFF);
    const c = await one('SELECT id, name FROM clients WHERE id=$1 AND agency_id=$2', [int(p.id), ctx.user.agency_id]);
    if (!c) throw new HttpError(404, 'Müşteri bulunamadı.');
    const rows = await all('SELECT * FROM sites WHERE client_id=$1 ORDER BY domain', [c.id]);
    send(ctx, res, layout(ctx, `${c.name} · Siteler`, `<div><a href="/musteriler/${c.id}">← ${h(c.name)}</a></div><h1>Siteler</h1>
<div class="tbl"><table>${head(false)}${rows.map(s => row(s, false)).join('') || '<tr><td colspan="6" class="muted">Site yok.</td></tr>'}</table></div>`, '/siteler'));
  });
  route('GET', '/portal/siteler', async (ctx, res) => {
    need(ctx, 'client');
    const rows = await all('SELECT * FROM sites WHERE client_id=$1 ORDER BY domain', [ctx.user.client_id]);
    send(ctx, res, layout(ctx, 'Sitelerim', `<div><a href="/portal">← Portalım</a></div><h1>Siteleriniz</h1>
<div class="tbl"><table>${head(false)}${rows.map(s => row(s, false)).join('') || '<tr><td colspan="6" class="muted">Site kaydı yok.</td></tr>'}</table></div>`, '/portal'));
  });

  function send(ctx, res, html) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'",
    });
    res.end(translateHtml(html));
  }
}
