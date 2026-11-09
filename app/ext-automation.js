// Arvela OS — otomasyon: n8n'e imzalı olay bildirimi (webhook) ve n8n'in kullanacağı anahtarlı REST API.
// Olaylar işlem kaydından (audit) doğar; her kayıt ilgili müşteri/proje/görev ayrıntısıyla zenginleştirilip gönderilir.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { siteHealth } from './ext-sites.js';
import { leadScore, OPEN_STAGES } from './ext-crm.js';

export const EVENTS = {
  'Satış': ['lead.create', 'lead.update', 'lead.stage', 'lead.note', 'lead.won', 'lead.assign'],
  'Müşteri': ['client.create', 'client.update', 'client_service.add', 'client_service.update', 'client_service.delete'],
  'Proje': ['project.create', 'project.update', 'project.delete'],
  'Görev': ['task.create', 'task.update', 'task.status', 'task.note', 'task.delete'],
  'Onay': ['approval.request', 'approval.update', 'approval.decide', 'approval.decide_for_client', 'approval.reopen', 'approval.withdraw'],
  'Teklif': ['quote.create', 'quote.send', 'quote.decide', 'quote.withdraw', 'quote.copy'],
  'Fatura': ['invoice.create', 'invoice.from_quote', 'invoice.monthly', 'invoice.send', 'invoice.client_notified', 'invoice.paid', 'invoice.cancel'],
  'Site': ['site.create', 'site.alert', 'site.sync'],
  'Freelancer': ['package.create', 'package.update', 'package.status', 'package.time', 'freelancer.payment'],
};
export const EVENT_LABEL = {
  'lead.create': 'Yeni aday', 'lead.update': 'Aday güncellendi', 'lead.stage': 'Aday aşaması değişti', 'lead.note': 'Adayla iletişim kaydı', 'lead.won': 'Aday kazanıldı', 'lead.assign': 'Aday bir kişiye atandı',
  'client.create': 'Yeni müşteri', 'client.update': 'Müşteri güncellendi', 'client_service.add': 'Hizmet eklendi', 'client_service.update': 'Hizmet güncellendi', 'client_service.delete': 'Hizmet silindi',
  'project.create': 'Yeni proje', 'project.update': 'Proje güncellendi', 'project.delete': 'Proje silindi',
  'task.create': 'Yeni görev', 'task.update': 'Görev güncellendi', 'task.status': 'Görev durumu değişti', 'task.note': 'Göreve not eklendi', 'task.delete': 'Görev silindi',
  'approval.request': 'Onaya gönderildi', 'approval.update': 'Onay isteği düzenlendi', 'approval.decide': 'Müşteri onay kararı verdi', 'approval.decide_for_client': 'Onay müşteri adına işlendi', 'approval.reopen': 'Onay yeniden açıldı', 'approval.withdraw': 'Onay isteği geri çekildi',
  'quote.create': 'Teklif oluşturuldu', 'quote.send': 'Teklif gönderildi', 'quote.decide': 'Müşteri teklife karar verdi', 'quote.withdraw': 'Teklif geri çekildi', 'quote.copy': 'Teklif kopyalandı',
  'invoice.create': 'Fatura oluşturuldu', 'invoice.from_quote': 'Tekliften fatura', 'invoice.monthly': 'Aylık faturalar oluşturuldu', 'invoice.send': 'Fatura gönderildi', 'invoice.client_notified': 'Müşteri ödediğini bildirdi', 'invoice.paid': 'Fatura ödendi', 'invoice.cancel': 'Fatura iptal edildi',
  'mail.send': 'İşlem e-postası', 'ai.request': 'Yapay zekâ işi gönderildi', 'ai.apply': 'Claude önerileri uygulandı', 'ai.reject': 'Claude önerileri reddedildi', 'reminder.create': 'Hatırlatma kuruldu', 'reminder.cancel': 'Hatırlatma iptal edildi', 'ai.result': 'Yapay zekâ sonucu geldi', 'decision.link': 'Karar bağlantısı oluşturuldu', 'decision.verify': 'Müşteri e-postasını doğruladı', 'decision.link_revoke': 'Karar bağlantısı iptal edildi', 'site.create': 'Site eklendi', 'site.alert': 'Site acil duruma düştü', 'site.sync': 'Site durumu eşitlendi', 'ping': 'Deneme',
  'package.create': 'İş paketi teklif edildi', 'package.update': 'İş paketi güncellendi', 'package.status': 'İş paketi durumu değişti', 'package.time': 'İş paketine süre kaydedildi', 'freelancer.payment': 'Freelancer ödemesi', 'retention.run': 'Veri saklama uygulandı', 'theme.update': 'Tema değişti', 'retention.settings': 'Veri saklama ayarları değişti',
};
const ALL_EVENTS = Object.values(EVENTS).flat();
const FINANCE = (e) => e.startsWith('quote.') || e.startsWith('invoice.') || e === 'freelancer.payment';
export const SCOPES = { is: 'İş verisi (okuma)', yaz: 'Yazma (görev, not, proje, müşteri, onay)', finans: 'Finans (teklif ve fatura okuma)' };

export const DEFAULT_HOOKS = [
  ['n8n · Olay yönlendirici', 'arvela-events', ['*']],
  ['n8n · Yeni müşteri karşılama', 'arvela-new-client', ['client.create']],
  ['n8n · Görev bildirimi', 'arvela-task-assigned', ['task.create', 'task.update']],
  ['n8n · Acil site uyarısı', 'arvela-site-alert', ['site.alert']],
  ['n8n · E-posta gönderici', 'arvela-mail', []], // olay değil: Arvela OS'in doğrudan gönderdiği işlem e-postaları (karar bağlantısı, doğrulama kodu)
  ['n8n · Yapay zekâ (Claude)', 'arvela-ai', []], // olay değil: yapay zekâ işleri (ext-ai.js), sonuç /api/v1/ai/result ile döner
];
export const sign = (secret, body) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
export const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');
export function newApiKey() { const prefix = crypto.randomBytes(4).toString('hex'); return { prefix, key: `arv_${prefix}_${crypto.randomBytes(24).toString('base64url')}` }; }
export const matches = (hook, event) => hook.active && (hook.events.includes('*') || hook.events.includes(event));
export const validUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !!x.hostname; } catch { return false; } };

export async function migrateAutomation({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), name TEXT NOT NULL, url TEXT NOT NULL,
    secret TEXT NOT NULL, events TEXT[] NOT NULL DEFAULT '{*}', active BOOLEAN NOT NULL DEFAULT true, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS webhook_deliveries (id BIGSERIAL PRIMARY KEY, webhook_id INT REFERENCES webhooks(id) ON DELETE CASCADE, agency_id INT NOT NULL,
    event TEXT NOT NULL, payload JSONB, status_code INT, ok BOOLEAN, error TEXT, attempts INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), delivered_at TIMESTAMPTZ)`);
  await q(`CREATE INDEX IF NOT EXISTS webhook_deliveries_recent ON webhook_deliveries (agency_id, created_at DESC)`);
  await q(`CREATE TABLE IF NOT EXISTS api_keys (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), name TEXT NOT NULL, prefix TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL, scopes TEXT[] NOT NULL DEFAULT '{is}', created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(), last_used TIMESTAMPTZ, revoked_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS settings (agency_id INT NOT NULL REFERENCES agencies(id), key TEXT NOT NULL, value TEXT, PRIMARY KEY (agency_id, key))`);
  for (const a of (await q('SELECT id FROM agencies')).rows) await q(`INSERT INTO settings (agency_id, key, value) VALUES ($1, 'webhook_token', $2) ON CONFLICT DO NOTHING`, [a.id, crypto.randomBytes(24).toString('hex')]);
  for (const a of (await q('SELECT id FROM agencies')).rows) {
    const has = await q('SELECT 1 FROM webhooks WHERE agency_id=$1 LIMIT 1', [a.id]);
    if (has.rows.length) continue;
    for (const [name, path, events] of DEFAULT_HOOKS) await q('INSERT INTO webhooks (agency_id, name, url, secret, events, active) VALUES ($1,$2,$3,$4,$5,false)', [a.id, name, `https://n8n.arveladigital.com/webhook/${path}`, crypto.randomBytes(24).toString('hex'), events]);
  }
  // sonradan eklenen hazır bağlantılar (pasif gelir; "n8n bağla" açar)
  for (const a of (await q('SELECT id FROM agencies')).rows) for (const [name, path, events] of DEFAULT_HOOKS)
    await q(`INSERT INTO webhooks (agency_id, name, url, secret, events, active) SELECT $1::int,$2::text,$3::text,$4::text,$5::text[],false WHERE EXISTS (SELECT 1 FROM webhooks WHERE agency_id=$1::int) AND NOT EXISTS (SELECT 1 FROM webhooks WHERE agency_id=$1::int AND url=$3::text)`,
      [a.id, name, `https://n8n.arveladigital.com/webhook/${path}`, crypto.randomBytes(24).toString('hex'), events]);
  // eski teslim kayıtlarını temizle (30 gün)
  await q(`DELETE FROM webhook_deliveries WHERE created_at < now() - interval '30 days'`);
}

export function registerAutomation(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, TK_ST, PR_ST, APP_URL, safeEqual } = d;
  const BASE = (APP_URL || 'https://os.arveladigital.com').replace(/\/$/, '');
  const N8N = 'https://n8n.arveladigital.com';
  const RETRY = [0, 30_000, 120_000];
  const shown = new Map(); // yeni anahtar bir kez gösterilir; adreste taşınmaz

  // ---------- olay zenginleştirme ----------
  async function entity(event, detail) {
    const id = int(detail?.id);
    const [kind] = event.split('.');
    if (!id || event.endsWith('.delete') || event === 'approval.withdraw') return { ...detail };
    if (kind === 'lead') return one(`SELECT c.id, c.name, c.contact_name, c.phone, c.email, c.sector, c.status, c.stage, c.lead_source, c.lead_score, c.interest, c.call_at, c.next_action, c.next_action_at, c.lost_reason, c.owner_id, u.name owner, u.email owner_email,
      (SELECT body FROM client_notes n WHERE n.client_id=c.id ORDER BY n.created_at DESC LIMIT 1) last_note, '${BASE}/satis/' || c.id url FROM clients c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=$1`, [id]);
    if (kind === 'client') return one(`SELECT id, name, sector, contact_name, phone, email, status, '${BASE}/musteriler/' || id url FROM clients WHERE id=$1`, [id]);
    if (kind === 'client_service') return one(`SELECT cs.id, cs.status, cs.start_date, cs.end_date, cs.notes, s.code, s.name service, s.billing, cs.client_id, c.name client FROM client_services cs JOIN services s ON s.id=cs.service_id JOIN clients c ON c.id=cs.client_id WHERE cs.id=$1`, [id]);
    if (kind === 'project') return one(`SELECT p.id, p.name, p.status, p.due_date, p.description, p.client_id, c.name client, '${BASE}/projeler/' || p.id url FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=$1`, [id]);
    if (kind === 'task') return one(`SELECT t.id, t.title, t.status, t.priority, t.due_date, t.description, t.project_id, p.name project, p.client_id, c.name client, t.assignee_id, u.name assignee, u.email assignee_email,
      (SELECT body FROM task_comments k WHERE k.task_id=t.id ORDER BY k.created_at DESC LIMIT 1) last_note, '${BASE}/gorev/' || t.id url
      FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=$1`, [id]);
    if (kind === 'approval') return one(`SELECT ap.id, ap.title, ap.body, ap.status, ap.kind, ap.choice, ap.decided_via, ap.comment, ap.decided_at, ap.client_id, c.name client, c.phone client_phone, c.email client_email, ap.project_id, p.name project, '${BASE}/onaylar/' || ap.id url
      FROM approvals ap JOIN clients c ON c.id=ap.client_id LEFT JOIN projects p ON p.id=ap.project_id WHERE ap.id=$1`, [id]);
    if (kind === 'quote') return one(`SELECT x.id, x.title, x.status, x.currency, x.discount_pct, x.valid_until, x.comment, x.client_id, c.name client, c.phone client_phone, c.email client_email, '${BASE}/teklifler/' || x.id url FROM quotes x JOIN clients c ON c.id=x.client_id WHERE x.id=$1`, [id]);
    if (kind === 'invoice') return one(`SELECT i.id, i.number, i.status, i.period, i.currency, i.issue_date, i.due_date, i.paid_at, i.paid_amount, i.client_id, c.name client, c.phone client_phone, c.email client_email,
      ROUND((SELECT COALESCE(sum(qty*unit_price),0) FROM invoice_items WHERE invoice_id=i.id) * (1 + i.vat_pct/100))::int total, '${BASE}/faturalar/' || i.id url FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=$1`, [id]);
    if (kind === 'package') return one(`SELECT w.id, w.title, w.status, w.pay_type, w.due_date, w.freelancer_id, u.name freelancer, u.email freelancer_email, w.project_id, p.name project,
      COALESCE((SELECT sum(minutes) FROM time_entries WHERE package_id=w.id),0)::int minutes, '${BASE}/paketler/' || w.id url FROM work_packages w JOIN users u ON u.id=w.freelancer_id LEFT JOIN projects p ON p.id=w.project_id WHERE w.id=$1`, [id]);
    return { ...detail };
  }

  const tokens = new Map();
  const tokenFor = async (agencyId) => { if (!tokens.has(agencyId)) tokens.set(agencyId, (await one(`SELECT value FROM settings WHERE agency_id=$1 AND key='webhook_token'`, [agencyId]))?.value || ''); return tokens.get(agencyId); };
  async function deliver(hook, deliveryId, body, attempt) {
    let code = null, ok = false, error = null;
    const token = await tokenFor(hook.agency_id).catch(() => '');
    try {
      const r = await fetch(hook.url, { method: 'POST', body, signal: AbortSignal.timeout(10_000), headers: {
        'Content-Type': 'application/json', 'User-Agent': 'arvela-os-webhook/1.0', 'X-Arvela-Event': JSON.parse(body).event,
        'X-Arvela-Delivery': String(deliveryId), 'X-Arvela-Signature': sign(hook.secret, body), ...(token ? { 'X-Arvela-Token': token } : {}) } });
      code = r.status; ok = r.ok; if (!ok) error = (await r.text()).slice(0, 300);
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    await q(`UPDATE webhook_deliveries SET status_code=$1, ok=$2, error=$3, attempts=$4, delivered_at=CASE WHEN $2 THEN now() ELSE delivered_at END WHERE id=$5`, [code, ok, error, attempt + 1, deliveryId]).catch(() => {});
    if (!ok && attempt + 1 < RETRY.length) setTimeout(() => deliver(hook, deliveryId, body, attempt + 1).catch(() => {}), RETRY[attempt + 1]).unref?.();
    return ok;
  }

  // Olayı eşleşen tüm webhook'lara gönderir; isteği bekletmez.
  async function emit(agencyId, event, data, meta = {}) {
    const hooks = (await all('SELECT * FROM webhooks WHERE agency_id=$1 AND active', [agencyId])).filter(w => matches(w, event) || (event === 'ping' && w.id === meta.only));
    if (meta.only) hooks.splice(0, hooks.length, ...hooks.filter(w => w.id === meta.only));
    for (const w of hooks) {
      const payload = { event, label: EVENT_LABEL[event] || event, at: new Date().toISOString(), source: meta.source || 'arvela-os', actor: meta.actor || null, data };
      const r = await one('INSERT INTO webhook_deliveries (webhook_id, agency_id, event, payload) VALUES ($1,$2,$3,$4) RETURNING id', [w.id, agencyId, event, payload]);
      deliver(w, r.id, JSON.stringify({ ...payload, delivery: r.id }), 0).catch(() => {});
    }
    return hooks.length;
  }

  // İşlem e-postası: n8n "E-posta gönderici" akışına doğrudan gönderir. İçerik (kod, bağlantı) kayda yazılmaz; yalnız tür ve maskeli alıcı.
  // n8n'e doğrudan istek (olay değil): içerik kayda yazılmaz, yalnız özet.
  async function postHook(agencyId, path, event, payload, summary) {
    const w = await one(`SELECT * FROM webhooks WHERE agency_id=$1 AND active AND url LIKE $2 LIMIT 1`, [agencyId, `%/webhook/${path}`]); if (!w) return false;
    const r = await one('INSERT INTO webhook_deliveries (webhook_id, agency_id, event, payload) VALUES ($1,$2,$3,$4) RETURNING id', [w.id, agencyId, event, { event, ...summary }]);
    const body = JSON.stringify({ event, ...payload, delivery: r.id });
    const token = await tokenFor(agencyId).catch(() => '');
    let code = null, ok = false, error = null;
    try {
      const x = await fetch(w.url, { method: 'POST', body, signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json', 'User-Agent': 'arvela-os-webhook/1.0', 'X-Arvela-Event': event,
        'X-Arvela-Delivery': String(r.id), 'X-Arvela-Signature': sign(w.secret, body), ...(token ? { 'X-Arvela-Token': token } : {}) } });
      code = x.status; ok = x.ok; if (!ok) error = (await x.text()).slice(0, 300);
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    await q(`UPDATE webhook_deliveries SET status_code=$1, ok=$2, error=$3, attempts=1, delivered_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$4`, [code, ok, error, r.id]).catch(() => {});
    return ok;
  }
  // İşlem e-postası: n8n "E-posta gönderici" akışı. İçerik (kod, bağlantı) kayda yazılmaz; yalnız tür ve maskeli alıcı.
  const sendMail = (agencyId, { to, subject, html, kind }) => postHook(agencyId, 'arvela-mail', 'mail.send', { kind, to, subject, html }, { kind, to: String(to).replace(/^(.).*@/, '$1***@') });

  // İşlem kaydı kancası: server.js audit() her kayıttan sonra çağırır.
  async function onAudit(ctx, action, detail) {
    if (!ALL_EVENTS.includes(action)) return;
    const agencyId = ctx.user?.agency_id; if (!agencyId) return;
    const has = await one('SELECT 1 FROM webhooks WHERE agency_id=$1 AND active LIMIT 1', [agencyId]); if (!has) return;
    let data = (await entity(action, detail).catch(() => null)) || { ...detail };
    if (action === 'client.create' && data.status === 'lead') { action = 'lead.create'; data = (await entity(action, detail).catch(() => null)) || data; }
    if (detail && typeof detail === 'object') for (const k of ['decision', 'kind', 'via', 'status', 'amount', 'period', 'count', 'from', 'quote', 'title', 'name']) if (k in detail && !(k in data)) data[k] = detail[k];
    await emit(agencyId, action, data, { source: ctx.apiKey ? 'api' : 'arvela-os', actor: ctx.apiKey ? { api_key: ctx.apiKey.name } : ctx.user ? { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role } : null });
  }

  // Site eşitlemesinden sonra yeni acil siteler için.
  async function onSiteSync(agencyId, before) {
    const after = await all(`SELECT s.*, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1`, [agencyId]);
    for (const s of after) {
      if (siteHealth(s).label === 'Acil' && before.get(s.domain) !== 'Acil') {
        await emit(agencyId, 'site.alert', { domain: s.domain, client_id: s.client_id, client: s.client, ssl_status: s.ssl_status, wp_version: s.wp_version, issue: s.issue, url: s.client_id ? `${BASE}/musteriler/${s.client_id}/siteler` : `${BASE}/siteler` });
      }
    }
  }

  // ---------- REST API (n8n için) ----------
  async function apiAuth(ctx, scope) {
    const raw = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const m = /^arv_([0-9a-f]{8})_[A-Za-z0-9_-]{20,}$/.exec(raw);
    if (!m) throw new HttpError(401, 'API anahtarı gerekli.');
    const k = await one('SELECT * FROM api_keys WHERE prefix=$1 AND revoked_at IS NULL', [m[1]]);
    if (!k || !safeEqual(hashKey(raw), k.key_hash)) throw new HttpError(401, 'API anahtarı geçersiz.');
    if (scope && !k.scopes.includes(scope)) throw new HttpError(403, `Bu anahtarın "${scope}" yetkisi yok.`);
    q('UPDATE api_keys SET last_used=now() WHERE id=$1', [k.id]).catch(() => {});
    ctx.apiKey = k; ctx.user = { id: null, agency_id: k.agency_id, role: 'api', name: `API · ${k.name}` };
    return k;
  }
  const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const qp = (ctx, k) => ctx.url.searchParams.get(k) || '';
  const lim = (ctx) => Math.min(Math.max(int(qp(ctx, 'limit')) || 100, 1), 500);
  const api = (method, path, scope, fn) => route(method, '/api/v1' + path, async (ctx, res, p) => { const k = await apiAuth(ctx, scope); return json(res, 200, await fn(ctx, k.agency_id, p, res)); });

  api('GET', '/me', 'is', async (ctx) => ({ key: ctx.apiKey.name, scopes: ctx.apiKey.scopes, agency_id: ctx.apiKey.agency_id, app: BASE, events: ALL_EVENTS }));
  api('GET', '/clients', 'is', async (ctx, a) => ({ data: await all(`SELECT id, name, sector, contact_name, phone, email, status, created_at FROM clients WHERE agency_id=$1 AND ($2='' OR status=$2) ORDER BY name LIMIT $3`, [a, qp(ctx, 'status'), lim(ctx)]) }));
  api('GET', '/clients/:id', 'is', async (ctx, a, p) => {
    const c = await one('SELECT * FROM clients WHERE id=$1 AND agency_id=$2', [int(p.id), a]); if (!c) throw new HttpError(404, 'Müşteri bulunamadı.');
    const [services, projects, sites, approvals] = await Promise.all([
      all('SELECT cs.id, cs.status, cs.start_date, cs.end_date, cs.notes, s.code, s.name, s.billing FROM client_services cs JOIN services s ON s.id=cs.service_id WHERE cs.client_id=$1', [c.id]),
      all('SELECT id, name, status, due_date FROM projects WHERE client_id=$1 ORDER BY id DESC', [c.id]),
      all('SELECT domain, platform, wp_version, wp_vulns, ssl_status, ssl_expires, issue FROM sites WHERE client_id=$1', [c.id]),
      all('SELECT id, title, status, created_at, decided_at FROM approvals WHERE client_id=$1 ORDER BY id DESC LIMIT 50', [c.id])]);
    return { data: { ...c, url: `${BASE}/musteriler/${c.id}`, services, projects, sites, approvals } };
  });
  api('GET', '/projects', 'is', async (ctx, a) => ({ data: await all(`SELECT p.id, p.name, p.status, p.due_date, p.client_id, c.name client,
    (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int tasks, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.agency_id=$1 AND ($2='' OR p.status=$2) AND ($3::int IS NULL OR p.client_id=$3) ORDER BY p.id DESC LIMIT $4`, [a, qp(ctx, 'status'), int(qp(ctx, 'client_id')), lim(ctx)]) }));
  api('GET', '/projects/:id', 'is', async (ctx, a, p) => {
    const x = await one('SELECT p.*, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND p.agency_id=$2', [int(p.id), a]); if (!x) throw new HttpError(404, 'Proje bulunamadı.');
    const tasks = await all('SELECT t.id, t.title, t.status, t.priority, t.due_date, t.assignee_id, u.name assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=$1 ORDER BY t.id', [x.id]);
    return { data: { ...x, url: `${BASE}/projeler/${x.id}`, tasks } };
  });
  api('GET', '/tasks', 'is', async (ctx, a) => {
    const st = qp(ctx, 'status');
    return { data: await all(`SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, p.name project, c.name client, t.assignee_id, u.name assignee, u.email assignee_email
      FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=t.assignee_id
      WHERE t.agency_id=$1 AND (CASE $2 WHEN '' THEN true WHEN 'open' THEN t.status<>'bitti' WHEN 'overdue' THEN t.status<>'bitti' AND t.due_date < CURRENT_DATE WHEN 'today' THEN t.status<>'bitti' AND t.due_date = CURRENT_DATE ELSE t.status=$2 END)
      AND ($3::int IS NULL OR t.assignee_id=$3) AND ($4::int IS NULL OR t.project_id=$4) ORDER BY t.due_date NULLS LAST, t.id LIMIT $5`, [a, st, int(qp(ctx, 'assignee_id')), int(qp(ctx, 'project_id')), lim(ctx)]) };
  });
  api('GET', '/tasks/:id', 'is', async (ctx, a, p) => {
    const t = await entity('task.get', { id: p.id }); if (!t || !(await one('SELECT 1 FROM tasks WHERE id=$1 AND agency_id=$2', [int(p.id), a]))) throw new HttpError(404, 'Görev bulunamadı.');
    return { data: { ...t, notes: await all('SELECT k.body, k.created_at, u.name author FROM task_comments k LEFT JOIN users u ON u.id=k.user_id WHERE k.task_id=$1 ORDER BY k.created_at', [t.id]) } };
  });
  api('GET', '/approvals', 'is', async (ctx, a) => ({ data: await all(`SELECT ap.id, ap.title, ap.status, ap.comment, ap.created_at, ap.decided_at, ap.client_id, c.name client, c.phone client_phone, ap.project_id
    FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 AND ($2='' OR ap.status=$2) ORDER BY ap.created_at DESC LIMIT $3`, [a, qp(ctx, 'status'), lim(ctx)]) }));
  api('GET', '/sites', 'is', async (ctx, a) => {
    const rows = await all('SELECT s.domain, s.platform, s.wp_version, s.wp_vulns, s.ssl_status, s.ssl_expires, s.issue, s.synced_at, s.client_id, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1 ORDER BY s.domain', [a]);
    const want = qp(ctx, 'health');
    return { data: rows.map(s => ({ ...s, health: siteHealth(s).label })).filter(s => !want || s.health.toLowerCase() === want.toLowerCase()) };
  });
  api('GET', '/leads', 'is', async (ctx, a) => ({ data: await all(`SELECT c.id, c.name, c.contact_name, c.phone, c.email, c.stage, c.lead_source, c.lead_score, c.interest, c.call_at, c.next_action, c.next_action_at, c.created_at, u.name owner
    FROM clients c LEFT JOIN users u ON u.id=c.owner_id WHERE c.agency_id=$1 AND (CASE $2 WHEN '' THEN c.status='lead' AND c.stage = ANY($3) ELSE c.stage=$2 END) ORDER BY c.call_at NULLS LAST, c.created_at DESC LIMIT $4`, [a, qp(ctx, 'stage'), OPEN_STAGES, lim(ctx)]) }));
  api('GET', '/packages', 'is', async (ctx, a) => {
    const fin = ctx.apiKey.scopes.includes('finans'); const st = qp(ctx, 'status');
    return { data: await all(`SELECT w.id, w.title, w.status, w.pay_type, ${fin ? 'w.amount, w.hourly_rate, w.hour_cap,' : ''} w.due_date, w.freelancer_id, u.name freelancer, w.project_id, p.name project,
      COALESCE((SELECT sum(minutes) FROM time_entries WHERE package_id=w.id),0)::int minutes, w.delivered_at, w.approved_at FROM work_packages w JOIN users u ON u.id=w.freelancer_id LEFT JOIN projects p ON p.id=w.project_id
      WHERE w.agency_id=$1 AND ($2='' OR w.status=$2) ORDER BY w.id DESC LIMIT $3`, [a, st || '', lim(ctx)]) };
  });
  api('GET', '/team', 'is', async (ctx, a) => ({ data: await all(`SELECT id, name, email, role FROM users WHERE agency_id=$1 AND active AND role<>'client' ORDER BY name`, [a]) }));
  api('GET', '/summary', 'is', async (ctx, a) => {
    const [counts, late, today, waiting, acil] = await Promise.all([
      one(`SELECT (SELECT count(*) FROM clients WHERE agency_id=$1 AND status='active')::int clients, (SELECT count(*) FROM projects WHERE agency_id=$1 AND status<>'tamamlandi')::int open_projects,
        (SELECT count(*) FROM tasks WHERE agency_id=$1 AND status<>'bitti')::int open_tasks, (SELECT count(*) FROM approvals WHERE agency_id=$1 AND status='bekliyor')::int pending_approvals`, [a]),
      all(`SELECT t.id, t.title, t.due_date, u.name assignee, p.name project FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.agency_id=$1 AND t.status<>'bitti' AND t.due_date < CURRENT_DATE ORDER BY t.due_date LIMIT 50`, [a]),
      all(`SELECT t.id, t.title, u.name assignee, p.name project FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.agency_id=$1 AND t.status<>'bitti' AND t.due_date = CURRENT_DATE ORDER BY t.id LIMIT 50`, [a]),
      all(`SELECT ap.id, ap.title, c.name client, c.phone client_phone, ap.created_at FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 AND ap.status='bekliyor' ORDER BY ap.created_at LIMIT 50`, [a]),
      all(`SELECT s.*, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1`, [a])]);
    const sites = acil.filter(s => siteHealth(s).label === 'Acil').map(s => ({ domain: s.domain, client: s.client, issue: s.issue, ssl_status: s.ssl_status }));
    const fin = ctx.apiKey.scopes.includes('finans') ? await all(`SELECT i.id, i.number, i.due_date, c.name client, c.phone client_phone FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND i.status='gonderildi' AND i.due_date < CURRENT_DATE ORDER BY i.due_date`, [a]) : undefined;
    return { date: new Date().toISOString().slice(0, 10), counts, overdue_tasks: late, due_today: today, pending_approvals: waiting, urgent_sites: sites, overdue_invoices: fin, url: `${BASE}/panel` };
  });
  api('GET', '/quotes', 'finans', async (ctx, a) => ({ data: await all(`SELECT x.id, x.title, x.status, x.currency, x.created_at, x.sent_at, x.decided_at, x.client_id, c.name client FROM quotes x JOIN clients c ON c.id=x.client_id WHERE x.agency_id=$1 AND ($2='' OR x.status=$2) ORDER BY x.id DESC LIMIT $3`, [a, qp(ctx, 'status'), lim(ctx)]) }));
  api('GET', '/invoices', 'finans', async (ctx, a) => {
    const st = qp(ctx, 'status');
    return { data: await all(`SELECT i.id, i.number, i.status, i.period, i.currency, i.issue_date, i.due_date, i.client_notified_at, i.paid_at, i.paid_amount, i.client_id, c.name client, c.phone client_phone, c.email client_email,
      ROUND((SELECT COALESCE(sum(qty*unit_price),0) FROM invoice_items WHERE invoice_id=i.id) * (1 + i.vat_pct/100))::int total
      FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND (CASE $2 WHEN '' THEN true WHEN 'overdue' THEN i.status='gonderildi' AND i.due_date < CURRENT_DATE ELSE i.status=$2 END) ORDER BY i.due_date LIMIT $3`, [a, st, lim(ctx)]) };
  });

  // yazma uçları: işlem kaydı düşer, olay yeniden yayılır (kaynak: api)
  const body = (ctx) => ctx.body || {};
  const auditApi = (ctx, action, detail) => d.audit(ctx, action, { ...detail, via: 'api' });
  api('POST', '/clients', 'yaz', async (ctx, a) => {
    const b = body(ctx); if (!nn(b.name)) throw new HttpError(400, 'Firma adı gerekli.');
    const status = ['lead', 'active', 'paused', 'churned'].includes(b.status) ? b.status : 'lead';
    const src = ['web', 'whatsapp', 'referans', 'sosyal', 'outbound', 'etkinlik', 'diger'].includes(b.lead_source) ? b.lead_source : (status === 'lead' ? 'web' : null);
    const r = await one(`INSERT INTO clients (agency_id, name, sector, contact_name, phone, email, notes, status, stage, lead_source, interest, lead_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [a, nn(b.name), nn(b.sector), nn(b.contact_name), nn(b.phone), nn(b.email), nn(b.notes), status, status === 'lead' ? 'yeni' : null, src, nn(b.interest), status === 'lead' ? leadScore({ lead_source: src, phone: b.phone, email: b.email, sector: b.sector }) : null]);
    if (b.marketing_consent === true || b.marketing_consent === 'Evet') await q(`UPDATE clients SET marketing_consent_at=now(), marketing_consent_source=$1 WHERE id=$2`, [String(nn(b.consent_source) || ctx.apiKey.name).slice(0, 200), r.id]);
    if (status === 'lead' && nn(b.notes)) await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,NULL,$2,$3)', [r.id, 'not', `[${ctx.apiKey.name}] ${nn(b.notes)}`.slice(0, 4000)]);
    await auditApi(ctx, status === 'lead' ? 'lead.create' : 'client.create', { id: r.id, name: b.name });
    return { id: r.id, url: `${BASE}/${status === 'lead' ? 'satis' : 'musteriler'}/${r.id}` };
  });
  api('POST', '/projects', 'yaz', async (ctx, a) => {
    const b = body(ctx); const c = await one('SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [int(b.client_id), a]);
    if (!c) throw new HttpError(400, 'Müşteri bulunamadı.'); if (!nn(b.name)) throw new HttpError(400, 'Proje adı gerekli.');
    const r = await one('INSERT INTO projects (agency_id, client_id, name, due_date, description) VALUES ($1,$2,$3,$4,$5) RETURNING id', [a, c.id, nn(b.name), nn(b.due_date), nn(b.description)]);
    await auditApi(ctx, 'project.create', { id: r.id, client: c.id }); return { id: r.id, url: `${BASE}/projeler/${r.id}` };
  });
  api('POST', '/tasks', 'yaz', async (ctx, a) => {
    const b = body(ctx); const p = await one('SELECT id FROM projects WHERE id=$1 AND agency_id=$2', [int(b.project_id), a]);
    if (!p) throw new HttpError(400, 'Proje bulunamadı.'); if (!nn(b.title)) throw new HttpError(400, 'Görev adı gerekli.');
    let aid = int(b.assignee_id); if (aid && !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role<>'client' AND active`, [aid, a]))) aid = null;
    const r = await one('INSERT INTO tasks (agency_id, project_id, title, assignee_id, due_date, description, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [a, p.id, nn(b.title), aid, nn(b.due_date), nn(b.description), ['yuksek', 'normal', 'dusuk'].includes(b.priority) ? b.priority : 'normal']);
    await auditApi(ctx, 'task.create', { id: r.id, project: p.id }); return { id: r.id, url: `${BASE}/gorev/${r.id}` };
  });
  api('POST', '/tasks/:id/status', 'yaz', async (ctx, a, p) => {
    const t = await one('SELECT id FROM tasks WHERE id=$1 AND agency_id=$2', [int(p.id), a]); if (!t) throw new HttpError(404, 'Görev bulunamadı.');
    const st = body(ctx).status; if (!TK_ST[st]) throw new HttpError(400, `Durum şunlardan biri olmalı: ${Object.keys(TK_ST).join(', ')}`);
    await q('UPDATE tasks SET status=$1 WHERE id=$2', [st, t.id]); await auditApi(ctx, 'task.status', { id: t.id, status: st }); return { id: t.id, status: st };
  });
  api('POST', '/tasks/:id/notes', 'yaz', async (ctx, a, p) => {
    const t = await one('SELECT id FROM tasks WHERE id=$1 AND agency_id=$2', [int(p.id), a]); if (!t) throw new HttpError(404, 'Görev bulunamadı.');
    const text = nn(body(ctx).body); if (!text) throw new HttpError(400, 'Not boş olamaz.');
    await q('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,NULL,$2)', [t.id, `[${ctx.apiKey.name}] ${text}`.slice(0, 4000)]);
    await auditApi(ctx, 'task.note', { id: t.id }); return { id: t.id };
  });
  api('POST', '/approvals', 'yaz', async (ctx, a) => {
    const b = body(ctx); const c = await one('SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [int(b.client_id), a]);
    if (!c) throw new HttpError(400, 'Müşteri bulunamadı.'); if (!nn(b.title)) throw new HttpError(400, 'Konu gerekli.');
    let pid = int(b.project_id); if (pid && !(await one('SELECT 1 FROM projects WHERE id=$1 AND client_id=$2', [pid, c.id]))) pid = null;
    const r = await one('INSERT INTO approvals (agency_id, client_id, project_id, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING id', [a, c.id, pid, nn(b.title), nn(b.body)]);
    await auditApi(ctx, 'approval.request', { id: r.id, client: c.id }); return { id: r.id, url: `${BASE}/onaylar/${r.id}` };
  });

  // n8n açılışta hazır iş akışı şablonlarını buradan çeker. Şablonlarda gizli bilgi yoktur
  // (kimlik bilgileri ve alıcı adresi n8n'de seçilir), bu yüzden anahtar istenmez.
  route('GET', '/api/n8n-seed', async (ctx, res) => {
    const seed = JSON.parse(fs.readFileSync(new URL('./n8n-seed.json', import.meta.url), 'utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Seed-Version': String(seed.version) }); res.end(JSON.stringify(seed.workflows));
  });

  route('GET', '/api/n8n-seed-info', async (ctx, res) => {
    const seed = JSON.parse(fs.readFileSync(new URL('./n8n-seed.json', import.meta.url), 'utf8'));
    json(res, 200, { version: seed.version, ids: seed.ids || {} });
  });

  // GitHub 'n8n bağla' akışı n8n'i kurarken çağırır: sistem API anahtarını yeniler, webhook anahtarını döndürür
  // ve hazır akışların bağlantılarını açar (olay yönlendirici hariç). Kimlik: HMAC(SETUP_TOKEN, "arvela-n8n-provision").
  route('POST', '/api/n8n/provision', async (ctx, res) => {
    const pkey = d.SETUP_TOKEN ? crypto.createHmac('sha256', d.SETUP_TOKEN).update('arvela-n8n-provision').digest('hex') : '';
    const auth = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!pkey || !safeEqual(auth, pkey)) throw new HttpError(403, 'Yetkisiz.');
    const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']);
    await q(`UPDATE api_keys SET revoked_at=now() WHERE agency_id=$1 AND name='n8n (otomatik)' AND revoked_at IS NULL`, [agency.id]);
    const { prefix, key } = newApiKey();
    await q(`INSERT INTO api_keys (agency_id, name, prefix, key_hash, scopes) VALUES ($1,'n8n (otomatik)',$2,$3,$4)`, [agency.id, prefix, hashKey(key), ['is', 'yaz', 'finans']]);
    const token = await tokenFor(agency.id);
    const on = DEFAULT_HOOKS.filter(([, path]) => path !== 'arvela-events').map(([, path]) => `https://n8n.arveladigital.com/webhook/${path}`);
    await q(`UPDATE webhooks SET active = (url = ANY($2)) WHERE agency_id=$1 AND url LIKE 'https://n8n.arveladigital.com/webhook/%'`, [agency.id, on]);
    await q('INSERT INTO audit (agency_id, user_id, action, detail) VALUES ($1,NULL,$2,$3)', [agency.id, 'automation.n8n_provision', { prefix, hooks: on.length }]);
    json(res, 200, { api_key: key, webhook_token: token, hooks: on.length });
  });

  // ---------- Otomasyonlar sayfası ----------
  const evTone = (x) => x.ok ? 'ok' : x.attempts && !x.ok ? 'bad' : 'warn';
  const evText = (x) => x.ok ? `${x.status_code}` : x.attempts ? (x.status_code ? `Hata ${x.status_code}` : 'Ulaşılamadı') : 'Sırada';
  const eventChecks = (sel) => Object.entries(EVENTS).map(([g, list]) => `<fieldset class="evgrp"><legend>${h(g)}</legend>${list.map(e => `<label class="chk"><input type="checkbox" name="ev_${e}" ${sel.includes('*') || sel.includes(e) ? 'checked' : ''}> ${h(EVENT_LABEL[e])} <code>${e}</code></label>`).join('')}</fieldset>`).join('');
  const pickEvents = (b) => { const ev = ALL_EVENTS.filter(e => b['ev_' + e]); return ev.length === ALL_EVENTS.length ? ['*'] : ev; };

  route('GET', '/otomasyonlar', async (ctx, res) => {
    need(ctx, ...STAFF); const a = ctx.user.agency_id; const admin = ctx.user.role === 'admin'; const f = csrfField(ctx);
    const [hooks, log, keys, stats] = await Promise.all([
      all('SELECT w.*, (SELECT count(*) FROM webhook_deliveries x WHERE x.webhook_id=w.id AND x.created_at > now() - interval \'7 days\')::int week, (SELECT count(*) FROM webhook_deliveries x WHERE x.webhook_id=w.id AND x.ok IS NOT TRUE AND x.attempts>0 AND x.created_at > now() - interval \'7 days\')::int fails FROM webhooks w WHERE w.agency_id=$1 ORDER BY w.id', [a]),
      all(`SELECT x.*, w.name hook FROM webhook_deliveries x LEFT JOIN webhooks w ON w.id=x.webhook_id WHERE x.agency_id=$1 ${admin ? '' : "AND x.event NOT LIKE 'quote.%' AND x.event NOT LIKE 'invoice.%'"} ORDER BY x.created_at DESC LIMIT 60`, [a]),
      admin ? all('SELECT * FROM api_keys WHERE agency_id=$1 ORDER BY revoked_at NULLS FIRST, id DESC', [a]) : [],
      one(`SELECT count(*)::int total, count(*) FILTER (WHERE ok)::int ok FROM webhook_deliveries WHERE agency_id=$1 AND created_at > now() - interval '7 days'`, [a])]);
    const wtoken = admin ? await tokenFor(a) : '';
    const tok = ctx.url.searchParams.get('yeni'); const slot = tok && shown.get(tok); if (tok) shown.delete(tok);
    const fresh = slot && slot.user === ctx.user.id && Date.now() - slot.at < 120_000 ? slot.key : null;
    const target = (x) => { const p = x.payload?.data || {}; return p.url ? `<a href="${h(p.url.replace(BASE, ''))}">${h(p.title || p.name || p.number || p.domain || '#' + (p.id || ''))}</a>` : h(p.title || p.name || p.number || p.domain || ''); };
    send(res, 200, layout(ctx, 'Otomasyonlar', `<div class="page-head"><div><h1>Otomasyonlar</h1><p class="muted lead">Arvela OS'te olan her şey n8n'e bildirilir; n8n de API ile görev, not, proje ve müşteri ekleyebilir.</p></div>
<a class="btn gold" href="${N8N}" target="_blank" rel="noopener">n8n panelini aç</a></div>
<div class="grid"><div class="card"><span class="muted">Bağlantı</span><span class="stat">${hooks.filter(w => w.active).length}</span><span class="muted">etkin webhook</span></div>
<div class="card"><span class="muted">Son 7 gün</span><span class="stat">${stats.total}</span><span class="muted">bildirim · ${stats.ok} başarılı</span></div>
<div class="card"><span class="muted">n8n</span><span class="stat" style="font-size:20px">n8n.arveladigital.com</span><span class="muted">iş akışları, zamanlayıcılar, entegrasyonlar</span></div></div>
${fresh ? `<div class="flash"><strong>Yeni API anahtarı (yalnız bir kez gösterilir):</strong><br><code class="keybox">${h(fresh)}</code><br><span class="muted">n8n'de Credentials → Header Auth: Name "Authorization", Value "Bearer " + anahtar.</span></div>` : ''}
${admin ? `<section class="card"><h2>n8n'e bağlanma</h2><ol class="steps">
<li>n8n'de <strong>Credentials → Header Auth</strong> ile iki kimlik bilgisi açın:<br><strong>Arvela webhook</strong> · Name <code>X-Arvela-Token</code> · Value <code class="keybox">${h(wtoken)}</code><br><strong>Arvela OS API</strong> · Name <code>Authorization</code> · Value <code>Bearer arv_…</code> (aşağıdan bir API anahtarı oluşturun)</li>
<li>E-posta için bir <strong>SMTP</strong> kimlik bilgisi ekleyin (Hostinger e-posta ya da Gmail uygulama şifresi).</li>
<li>Hazır "Arvela ·" iş akışlarını açıp kimlik bilgilerini seçin, alıcı e-postasını kontrol edin ve <strong>Active</strong> yapın.</li>
<li>Aşağıdaki ilgili webhook bağlantısını <strong>Etkin</strong> yapın ve "Deneme bildirimi gönder" ile kontrol edin.</li></ol></section>` : ''}
<section class="card"><h2>Webhook bağlantıları</h2>
${hooks.map(w => `<div class="svc"><div class="svc-h"><span class="grow"><strong>${h(w.name)}</strong><span class="muted">${w.events.includes('*') ? 'Tüm olaylar' : `${w.events.length} olay`} · son 7 gün ${w.week} bildirim${w.fails ? ` · <span class="late">${w.fails} başarısız</span>` : ''}</span></span>${badge(w.active ? 'Etkin' : 'Kapalı', w.active ? 'ok' : '')}</div>
${admin ? `<details><summary>Ayrıntı ve düzenle</summary><form class="stack" method="post" action="/otomasyonlar/webhook/${w.id}">${f}
<label>Ad<input name="name" value="${h(w.name)}" required></label><label>n8n webhook adresi<input name="url" value="${h(w.url)}" required></label>
<label class="chk"><input type="checkbox" name="active" ${w.active ? 'checked' : ''}> Etkin</label>
<p class="muted">İmza anahtarı (X-Arvela-Signature için): <code>${h(w.secret)}</code></p>${eventChecks(w.events)}<div class="row"><button>Kaydet</button></div></form>
<div class="row"><form method="post" action="/otomasyonlar/webhook/${w.id}/dene">${f}<button class="ghost">Deneme bildirimi gönder</button></form>
<form method="post" action="/otomasyonlar/webhook/${w.id}/sil" data-confirm="Bu webhook bağlantısı silinsin mi?">${f}<button class="danger">Sil</button></form></div></details>` : `<p class="muted">${w.events.includes('*') ? 'Tüm olaylar' : w.events.map(e => h(EVENT_LABEL[e] || e)).join(', ')}</p>`}</div>`).join('') || '<p class="muted">Henüz bağlantı yok.</p>'}
${admin ? `<details${hooks.length ? '' : ' open'}><summary>Yeni webhook bağlantısı</summary><form class="stack" method="post" action="/otomasyonlar/webhook">${f}
<p class="muted">n8n'de bir "Webhook" düğümü (POST) ekleyip üretim adresini buraya yapıştırın. Hazır "Arvela olay yönlendirici" akışı bu iş için kurulu gelir.</p>
<div class="row"><label class="wide">Ad<input name="name" value="n8n" required></label><label class="wide">n8n webhook adresi<input name="url" required placeholder="${N8N}/webhook/arvela-events"></label></div>
${eventChecks(['*'])}<div><button class="gold">Bağlantıyı ekle</button></div></form></details>` : ''}</section>
<section class="card"><h2>Bildirim geçmişi</h2><div class="tbl"><table><tr><th>Zaman</th><th>Olay</th><th>Kayıt</th><th>Bağlantı</th><th>Sonuç</th>${admin ? '<th></th>' : ''}</tr>
${log.map(x => `<tr><td>${new Date(x.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</td><td>${h(EVENT_LABEL[x.event] || x.event)}<br><code class="muted">${h(x.event)}</code></td><td>${target(x)}</td><td>${h(x.hook || '—')}</td>
<td>${badge(evText(x), evTone(x))}${x.error && !x.ok ? `<br><span class="muted">${h(x.error.slice(0, 120))}</span>` : ''}</td>${admin ? `<td>${!x.ok && x.webhook_id ? `<form method="post" action="/otomasyonlar/teslim/${x.id}/yeniden">${f}<button class="ghost">Yeniden gönder</button></form>` : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${admin ? 6 : 5}" class="muted">Henüz bildirim yok.</td></tr>`}</table></div></section>
${admin ? `<section class="card"><h2>API anahtarları</h2><p class="muted">n8n'in Arvela OS'ten veri okuması ve görev/not/proje eklemesi için. Anahtar yalnız oluşturulduğunda gösterilir.</p>
${keys.map(k => `<div class="line"><span class="grow"><strong>${h(k.name)}</strong><span class="muted">arv_${h(k.prefix)}_… · ${k.scopes.map(s => h(SCOPES[s] || s)).join(', ')} · ${k.last_used ? 'son kullanım ' + fmtDate(k.last_used) : 'hiç kullanılmadı'}</span></span>
${k.revoked_at ? badge('İptal edildi') : `<form method="post" action="/otomasyonlar/anahtar/${k.id}/iptal" data-confirm="Bu anahtar iptal edilsin mi? Onu kullanan n8n akışları çalışmaz.">${f}<button class="danger">İptal et</button></form>`}</div>`).join('') || '<p class="muted">Henüz anahtar yok.</p>'}
<details${keys.length ? '' : ' open'}><summary>Yeni API anahtarı</summary><form class="stack" method="post" action="/otomasyonlar/anahtar">${f}<label>Ad<input name="name" value="n8n" required></label>
${Object.entries(SCOPES).map(([k, v]) => `<label class="chk"><input type="checkbox" name="scope_${k}" ${k !== 'finans' ? 'checked' : ''}> ${h(v)}</label>`).join('')}<div><button class="gold">Anahtar oluştur</button></div></form></details></section>` : ''}
<section class="card"><h2>API başvuru</h2><p class="muted">Adres: <code>${BASE}/api/v1</code> · Başlık: <code>Authorization: Bearer arv_…</code> · Gövde: JSON</p>
<div class="tbl"><table><tr><th>Uç</th><th>Ne yapar</th><th>Yetki</th></tr>
${[['GET /summary', 'Günün özeti: geciken ve bugünkü görevler, bekleyen onaylar, acil siteler (finans yetkisiyle gecikmiş faturalar)', 'is'], ['GET /clients · /clients/{id}', 'Müşteriler; ayrıntıda hizmetler, projeler, siteler, onaylar', 'is'], ['GET /projects · /projects/{id}', 'Projeler; ayrıntıda görevler', 'is'], ['GET /tasks?status=open|overdue|today', 'Görevler (assignee_id, project_id ile süzülür)', 'is'], ['GET /tasks/{id}', 'Görev ve notları', 'is'], ['GET /approvals?status=bekliyor', 'Onaylar', 'is'], ['GET /sites?health=acil', 'Siteler ve sağlık durumu', 'is'], ['GET /leads?stage=yeni|ulasildi|gorusme|teklif', 'Satış hattındaki adaylar (aşama olmadan: tüm açık adaylar)', 'is'], ['GET /packages?status=teklif|kabul|surecte|teslim|onaylandi|iptal', 'Freelancer iş paketleri ve kayıtlı süre (ücretler finans yetkisiyle)', 'is'], ['GET /team', 'Ekip', 'is'], ['GET /quotes · /invoices?status=overdue', 'Teklifler ve faturalar', 'finans'], ['POST /clients', 'Aday ya da müşteri ekle: name, phone, email, sector, contact_name, interest, lead_source, notes, status (varsayılan: lead → Satış hattı)', 'yaz'], ['POST /projects', 'Proje aç: client_id, name, description, due_date', 'yaz'], ['POST /tasks', 'Görev ekle: project_id, title, description, assignee_id, due_date, priority', 'yaz'], ['POST /tasks/{id}/status', 'Görev durumu: yapilacak, yapiliyor, incelemede, bitti', 'yaz'], ['POST /tasks/{id}/notes', 'Göreve not: body', 'yaz'], ['POST /approvals', 'Onaya gönder: client_id, project_id, title, body', 'yaz']]
      .map(([e, t, s]) => `<tr><td><code>${e}</code></td><td>${t}</td><td>${h(SCOPES[s])}</td></tr>`).join('')}</table></div>
<p class="muted">Webhook gövdesi: <code>{ event, label, at, source, actor, delivery, data }</code>. <code>data</code> ilgili kaydın ayrıntısıdır (müşteri, proje, görev, sorumlu, bağlantı). İmza: <code>X-Arvela-Signature: sha256=HMAC(imza anahtarı, gövde)</code>.</p></section>`, '/otomasyonlar'));
  });

  route('POST', '/otomasyonlar/webhook', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body;
    if (!nn(b.name) || !validUrl(b.url)) throw new HttpError(400, 'Ad ve https ile başlayan bir webhook adresi gerekli.');
    const ev = pickEvents(b); if (!ev.length) throw new HttpError(400, 'En az bir olay seçin.');
    const r = await one('INSERT INTO webhooks (agency_id, name, url, secret, events, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [ctx.user.agency_id, nn(b.name), b.url.trim(), crypto.randomBytes(24).toString('hex'), ev, ctx.user.id]);
    await d.audit(ctx, 'automation.webhook_create', { id: r.id }); redirect(res, '/otomasyonlar');
  });
  const hookFor = async (ctx, id) => { const w = await one('SELECT * FROM webhooks WHERE id=$1 AND agency_id=$2', [id, ctx.user.agency_id]); if (!w) throw new HttpError(404, 'Bağlantı bulunamadı.'); return w; };
  route('POST', '/otomasyonlar/webhook/:id', async (ctx, res, p) => {
    need(ctx, 'admin'); const w = await hookFor(ctx, int(p.id)); const b = ctx.body;
    if (!validUrl(b.url)) throw new HttpError(400, 'Ad ve https ile başlayan bir webhook adresi gerekli.');
    const ev = pickEvents(b); if (!ev.length) throw new HttpError(400, 'En az bir olay seçin.');
    await q('UPDATE webhooks SET name=$1, url=$2, events=$3, active=$4 WHERE id=$5', [nn(b.name) || w.name, b.url.trim(), ev, !!b.active, w.id]);
    await d.audit(ctx, 'automation.webhook_update', { id: w.id }); redirect(res, '/otomasyonlar');
  });
  route('POST', '/otomasyonlar/webhook/:id/sil', async (ctx, res, p) => {
    need(ctx, 'admin'); const w = await hookFor(ctx, int(p.id));
    await q('DELETE FROM webhooks WHERE id=$1', [w.id]); await d.audit(ctx, 'automation.webhook_delete', { id: w.id, name: w.name }); redirect(res, '/otomasyonlar');
  });
  route('POST', '/otomasyonlar/webhook/:id/dene', async (ctx, res, p) => {
    need(ctx, 'admin'); const w = await hookFor(ctx, int(p.id));
    await emit(ctx.user.agency_id, 'ping', { message: 'Arvela OS deneme bildirimi', by: ctx.user.name, url: `${BASE}/otomasyonlar` }, { only: w.id, actor: { id: ctx.user.id, name: ctx.user.name } });
    setTimeout(() => redirect(res, '/otomasyonlar'), 1500);
  });
  route('POST', '/otomasyonlar/teslim/:id/yeniden', async (ctx, res, p) => {
    need(ctx, 'admin');
    const x = await one('SELECT x.*, w.url, w.secret, w.active FROM webhook_deliveries x JOIN webhooks w ON w.id=x.webhook_id WHERE x.id=$1 AND x.agency_id=$2', [int(p.id), ctx.user.agency_id]);
    if (!x) throw new HttpError(404, 'Kayıt bulunamadı.');
    await deliver({ url: x.url, secret: x.secret, agency_id: x.agency_id }, x.id, JSON.stringify({ ...x.payload, delivery: x.id, redelivery: true }), RETRY.length - 1);
    redirect(res, '/otomasyonlar');
  });
  route('POST', '/otomasyonlar/anahtar', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body;
    const scopes = Object.keys(SCOPES).filter(s => b['scope_' + s]); if (!scopes.length) throw new HttpError(400, 'En az bir yetki seçin.');
    const { prefix, key } = newApiKey();
    await q('INSERT INTO api_keys (agency_id, name, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [ctx.user.agency_id, nn(b.name) || 'n8n', prefix, hashKey(key), scopes, ctx.user.id]);
    await d.audit(ctx, 'automation.key_create', { prefix, scopes });
    const tok = crypto.randomBytes(12).toString('hex'); shown.set(tok, { key, user: ctx.user.id, at: Date.now() });
    redirect(res, '/otomasyonlar?yeni=' + tok);
  });
  route('POST', '/otomasyonlar/anahtar/:id/iptal', async (ctx, res, p) => {
    need(ctx, 'admin');
    await q('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND agency_id=$2', [int(p.id), ctx.user.agency_id]);
    await d.audit(ctx, 'automation.key_revoke', { id: int(p.id) }); redirect(res, '/otomasyonlar');
  });

  return { onAudit, onSiteSync, emit, sendMail, postHook, api, body };
}
