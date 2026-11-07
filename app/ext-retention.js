// Arvela OS — KVKK saklama ve imha: süresi dolan aday kayıtlarını anonimleştirir, eski işlem kayıtlarını siler.
// Müşteriye dönmüş kayıtlar, faturalar, freelancer süre ve ödemeleri yasal saklama gereği dokunulmaz.
// Süreler Yönetici tarafından ayarlanır; otomatik çalışma varsayılan olarak kapalıdır.
import { t } from './i18n.js';

export const DEFAULTS = { lead_months: 24, audit_months: 24, auto: false };
export const clampMonths = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(120, Math.max(6, n)) : d; };
export function readSettings(rows) {
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { lead_months: clampMonths(m['retention.lead_months'], DEFAULTS.lead_months), audit_months: clampMonths(m['retention.audit_months'], DEFAULTS.audit_months),
    auto: m['retention.auto'] === '1', last_run: m['retention.last_run'] || null, last_result: m['retention.last_result'] || null };
}
// Bir sonraki otomatik çalışma zamanı geldi mi (günde bir).
export const due = (s, now = Date.now()) => s.auto && (!s.last_run || now - Date.parse(s.last_run) >= 23 * 3600e3);

// Son hareketi (oluşturma, not, sonraki adım) süreden eski açık ya da kaybedilmiş adaylar.
const STALE = `FROM clients c WHERE c.agency_id=$1 AND c.status='lead' AND c.anonymized_at IS NULL
  AND GREATEST(c.created_at, COALESCE((SELECT max(created_at) FROM client_notes n WHERE n.client_id=c.id), c.created_at), COALESCE(c.next_action_at, c.created_at), COALESCE(c.call_at, c.created_at)) < now() - make_interval(months => $2)`;

export async function migrateRetention({ q }) {
  await q('ALTER TABLE clients ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ');
}

export function registerRetention(d) {
  const { route, all, one, q, need, layout, h, csrfField, HttpError, redirect, send, audit, fmtDate } = d;
  const settings = async (a) => readSettings(await all(`SELECT key, value FROM settings WHERE agency_id=$1 AND key LIKE 'retention.%'`, [a]));
  const put = (a, k, v) => q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [a, 'retention.' + k, String(v)]);
  const preview = async (a, s) => {
    const [leads, logs] = await Promise.all([one(`SELECT count(*)::int n ${STALE}`, [a, s.lead_months]),
      one(`SELECT count(*)::int n FROM audit WHERE agency_id=$1 AND created_at < now() - make_interval(months => $2)`, [a, s.audit_months])]);
    return { leads: leads.n, logs: logs.n };
  };

  async function run(a, actor = null) {
    const s = await settings(a);
    const ids = (await all(`SELECT c.id ${STALE}`, [a, s.lead_months])).map(r => r.id);
    for (const id of ids) {
      await q('DELETE FROM client_notes WHERE client_id=$1', [id]);
      await q(`DELETE FROM task_comments WHERE task_id IN (SELECT t.id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.client_id=$1)`, [id]);
      await q(`UPDATE tasks SET title='Aday görevi (anonim)', description=NULL WHERE project_id IN (SELECT id FROM projects WHERE client_id=$1)`, [id]);
      await q(`UPDATE projects SET description=NULL WHERE client_id=$1`, [id]);
      await q(`UPDATE clients SET name=$2, contact_name=NULL, phone=NULL, email=NULL, notes=NULL, interest=NULL, sector=NULL, next_action=NULL, next_action_at=NULL, call_at=NULL,
        lost_reason=NULL, marketing_consent_at=NULL, marketing_consent_source=NULL, stage='kaybedildi', anonymized_at=now() WHERE id=$1`, [id, `Anonim aday #${id}`]);
    }
    const logs = await q(`DELETE FROM audit WHERE agency_id=$1 AND created_at < now() - make_interval(months => $2)`, [a, s.audit_months]);
    const result = { at: new Date().toISOString(), leads: ids.length, logs: logs.rowCount || 0 };
    await put(a, 'last_run', result.at); await put(a, 'last_result', JSON.stringify(result));
    // kendi kaydı silinmesin diye en son yazılır; kişisel veri içermez
    await q('INSERT INTO audit (agency_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [a, actor, 'retention.run', { leads: result.leads, logs: result.logs, auto: !actor }]);
    return result;
  }

  route('GET', '/veri-saklama', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const s = await settings(a); const p = await preview(a, s);
    const last = s.last_result ? JSON.parse(s.last_result) : null; const f = csrfField(ctx);
    send(res, 200, layout(ctx, 'Veri saklama', `<nav class="crumb"><a href="/kayitlar">Kayıtlar</a></nav><div class="page-head"><div><h1>Veri saklama (KVKK)</h1>
<p class="muted lead">Süresi dolan aday kayıtları anonimleştirilir, eski işlem kayıtları silinir. Müşteriler, teklif ve faturalar, freelancer süre ve ödemeleri yasal saklama süresi için korunur.</p></div></div>
<div class="grid"><div class="card"><span class="muted">Süresi dolan aday</span><span class="stat">${p.leads}</span></div><div class="card"><span class="muted">Süresi dolan işlem kaydı</span><span class="stat">${p.logs}</span></div>
<div class="card"><span class="muted">Son çalışma</span><span class="stat" style="font-size:20px">${last ? h(new Date(last.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })) : '—'}</span>${last ? `<span class="muted">${h(t`${last.leads} aday, ${last.logs} kayıt`)}</span>` : ''}</div></div>
<div class="two"><section class="card"><h2>Süreler</h2><form class="stack" method="post" action="/veri-saklama">${f}
<div class="row"><label>Aday kayıtları (ay)<input name="lead_months" inputmode="numeric" value="${s.lead_months}"></label><label>İşlem kayıtları (ay)<input name="audit_months" inputmode="numeric" value="${s.audit_months}"></label></div>
<label class="chk"><input type="checkbox" name="auto"${s.auto ? ' checked' : ''}> Her gün otomatik uygula</label>
<p class="muted">Aday: son görüşme, not ya da planlı adımdan bu kadar ay sonra adı, iletişim bilgileri, notları ve görev ayrıntıları silinir; sayılar için anonim kayıt kalır. Süreler 6–120 ay arasıdır; hukukçunuzla kesinleştirin.</p>
<div><button>Kaydet</button></div></form></section>
<section class="card"><h2>Şimdi uygula</h2><p>Bugünkü ayarlarla <strong>${p.leads}</strong> aday anonimleştirilir ve <strong>${p.logs}</strong> işlem kaydı silinir. Bu işlem geri alınamaz.</p>
<form method="post" action="/veri-saklama/uygula" data-confirm="Süresi dolan kayıtlar kalıcı olarak anonimleştirilsin ve silinsin mi? Geri alınamaz.">${f}<button class="danger"${p.leads + p.logs ? '' : ' disabled'}>Şimdi uygula</button></form></section></div>`, '/kayitlar'));
  });

  route('POST', '/veri-saklama', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const b = ctx.body;
    await put(a, 'lead_months', clampMonths(b.lead_months, DEFAULTS.lead_months)); await put(a, 'audit_months', clampMonths(b.audit_months, DEFAULTS.audit_months)); await put(a, 'auto', b.auto ? '1' : '0');
    await audit(ctx, 'retention.settings', { lead_months: clampMonths(b.lead_months, DEFAULTS.lead_months), audit_months: clampMonths(b.audit_months, DEFAULTS.audit_months), auto: !!b.auto });
    redirect(res, '/veri-saklama');
  });

  route('POST', '/veri-saklama/uygula', async (ctx, res) => {
    need(ctx, 'admin'); await run(ctx.user.agency_id, ctx.user.id); redirect(res, '/veri-saklama');
  });

  // Günlük otomatik çalışma (açıksa). Uygulama açılışından 10 dk sonra ve 6 saatte bir kontrol eder.
  const tick = async () => {
    for (const ag of await all('SELECT id FROM agencies')) {
      try { if (due(await settings(ag.id))) await run(ag.id, null); } catch (e) { console.error('veri saklama:', e.message); }
    }
  };
  if (!d.noTimer) { setTimeout(() => { tick(); setInterval(tick, 6 * 3600e3).unref?.(); }, 10 * 60e3).unref?.(); }
  return { run, tick };
}
