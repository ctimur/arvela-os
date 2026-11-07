// Arvela OS — site durumu eşitleme: GitHub Actions her sabah Hostinger'dan SSL ve WordPress durumunu okuyup buraya gönderir.
// Uygulama Hostinger anahtarını görmez; istek, kurulum anahtarından türetilen bir anahtarla imzalanır.
import crypto from 'node:crypto';
import { setLatestWp } from './ext-sites.js';

export const syncKey = (setupToken) => setupToken ? crypto.createHmac('sha256', setupToken).update('arvela-site-sync').digest('hex') : '';
const clean = (s, n = 200) => s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n) || null;
const SSL_OK = new Set(['active', 'failed', 'expired', 'not_installed', 'installing']);

// Gelen kaydı tabloya yazılacak alanlara çevirir. Saf fonksiyon: test edilebilir.
export function normalize(x) {
  const domain = String(x.domain || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  const wpBroken = x.wp_valid === false;
  return {
    domain,
    platform: clean(x.platform, 40),
    wp_version: clean(x.wp_version, 20),
    wp_vulns: Number.isInteger(x.wp_vulns) ? x.wp_vulns : null,
    ssl_status: SSL_OK.has(x.ssl_status) ? x.ssl_status : null,
    ssl_expires: x.ssl_expires && !Number.isNaN(Date.parse(x.ssl_expires)) ? new Date(x.ssl_expires).toISOString() : null,
    enabled: x.enabled !== false,
    issue: wpBroken ? `WordPress çalışmıyor: ${clean(x.wp_error, 160) || 'kurulum doğrulanamadı'}` : !x.enabled && x.enabled !== undefined ? 'Site Hostinger\'da askıya alınmış.' : null,
  };
}

export async function migrateSync({ q, one }) {
  await q(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS ssl_expires TIMESTAMPTZ`);
  await q(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_vulns INT`);
  await q(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ`);
  await q(`CREATE TABLE IF NOT EXISTS site_sync_runs (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), at TIMESTAMPTZ DEFAULT now(),
    total INT, updated INT, added INT, wp_latest TEXT, note TEXT)`);
  const last = await one(`SELECT wp_latest FROM site_sync_runs WHERE wp_latest IS NOT NULL ORDER BY at DESC LIMIT 1`);
  if (last?.wp_latest) setLatestWp(last.wp_latest);
}

export function registerSync({ route, one, q, HttpError, safeEqual, SETUP_TOKEN }) {
  const key = syncKey(SETUP_TOKEN);
  route('POST', '/api/site-sync', async (ctx, res) => {
    const auth = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!key || !safeEqual(auth, key)) throw new HttpError(403, 'Yetkisiz.');
    let body; try { body = JSON.parse(ctx.body.payload || '{}'); } catch { throw new HttpError(400, 'Geçersiz veri.'); }
    const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']);
    const list = (Array.isArray(body.sites) ? body.sites : []).map(normalize).filter(Boolean);
    let updated = 0, added = 0;
    for (const s of list) {
      const r = await one(`UPDATE sites SET platform=COALESCE($3, platform), wp_version=$4, wp_vulns=$5, ssl_status=$6, ssl_expires=$7, issue=$8, synced_at=now(), checked_at=now()
        WHERE agency_id=$1 AND domain=$2 RETURNING id`, [agency.id, s.domain, s.platform, s.wp_version, s.wp_vulns, s.ssl_status, s.ssl_expires, s.issue]);
      if (r) { updated++; continue; }
      await q(`INSERT INTO sites (agency_id, domain, platform, hosting, wp_version, wp_vulns, ssl_status, ssl_expires, issue, synced_at, checked_at)
        VALUES ($1,$2,$3,'Hostinger',$4,$5,$6,$7,$8,now(),now()) ON CONFLICT (agency_id, domain) DO NOTHING`,
        [agency.id, s.domain, s.platform, s.wp_version, s.wp_vulns, s.ssl_status, s.ssl_expires, s.issue]);
      added++;
    }
    const latest = /^\d+\.\d+(\.\d+)?$/.test(body.wp_latest || '') ? body.wp_latest : null;
    if (latest) setLatestWp(latest);
    await q('INSERT INTO site_sync_runs (agency_id, total, updated, added, wp_latest, note) VALUES ($1,$2,$3,$4,$5,$6)', [agency.id, list.length, updated, added, latest, clean(body.note, 500)]);
    await q('INSERT INTO audit (agency_id, user_id, action, detail) VALUES ($1,NULL,$2,$3)', [agency.id, 'site.sync', { total: list.length, updated, added }]);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, total: list.length, updated, added }));
  });
}
