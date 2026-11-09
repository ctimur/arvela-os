// Arvela OS — yapay zekâ işleri: hizmet kitabındaki yapay zekâ aşamaları için taslak üretimi.
// İş n8n'e gider (webhook arvela-ai), n8n Claude API'yi çağırır, sonuç /api/v1/ai/result ile döner.
// Anthropic ile SS-2 sözleşmesi imzalanıp bildirilene kadar müşteri kişisel verisi gönderilmez: metin maskelenir.

import { FORMAT } from './ext-suggest.js';

export const ENGINES = {
  claude: { name: 'Claude (Anthropic)', ready: true, models: { 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (dengeli, önerilen)', 'claude-opus-5-5': 'Claude Opus 5.5 (en güçlü, daha pahalı)', 'claude-haiku-5-5': 'Claude Haiku 5.5 (hızlı, ekonomik)' } },
  openai: { name: 'OpenAI', ready: false, models: {} },
  gemini: { name: 'Gemini (Google)', ready: false, models: {} },
};
export const JOB_ST = { sirada: 'Sırada', gonderildi: 'Claude çalışıyor', bitti: 'Taslak hazır', hata: 'Hata' };
export const DEFAULTS = { 'ai.enabled': '0', 'ai.auto': '1', 'ai.model': 'claude-sonnet-5-5', 'ai.pii_ok': '0' };

export async function migrateAi({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS ai_jobs (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), kind TEXT NOT NULL DEFAULT 'taslak',
    task_id INT REFERENCES tasks(id) ON DELETE CASCADE, project_id INT REFERENCES projects(id) ON DELETE CASCADE, engine TEXT NOT NULL DEFAULT 'claude', model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sirada', masked BOOLEAN NOT NULL DEFAULT true, prompt TEXT, result TEXT, error TEXT, usage JSONB,
    created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now(), done_at TIMESTAMPTZ)`);
  await q('CREATE INDEX IF NOT EXISTS ai_jobs_task ON ai_jobs(task_id)');
  await q('CREATE INDEX IF NOT EXISTS ai_jobs_project ON ai_jobs(project_id)');
  await q('ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_engine TEXT');
}

// ---------- saf yardımcılar (test edilir) ----------
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Kişisel veriyi maskele: e-posta, telefon, IBAN, TC kimlik no, verilen adlar (müşteri, yetkili).
export function mask(text, names = []) {
  let s = String(text ?? '');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-posta]');
  s = s.replace(/\bTR\d{2}[ ]?(?:\d{4}[ ]?){5}\d{2}\b/gi, '[IBAN]');
  s = s.replace(/(?<!\d)[1-9]\d{10}(?!\d)/g, '[kimlik no]');
  s = s.replace(/(?:\+?\d[\d ()-]{8,}\d)/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[telefon]' : m));
  for (const n of names.filter(x => x && String(x).trim().length >= 3).sort((a, b) => b.length - a.length)) s = s.replace(new RegExp(esc(String(n).trim()), 'gi'), '[Müşteri]');
  return s;
}

const SYSTEM = `Sen Arvela Digital & AI ajansının proje ekibinde çalışan bir uzmansın. Arvela OS'teki bir hizmet aşaması için taslak hazırlıyorsun.
Kurallar: Türkçe yaz. Aşamanın beklenen çıktısını ve kabul ölçütünü karşıla. Bilmediğin bilgiyi uydurma; eksik bilgiyi "Sorulacak:" başlığıyla listele.
Köşeli parantezli yer tutucular ([Müşteri], [e-posta] vb.) gizlenmiş kişisel verilerdir; onları tahmin etme, olduğu gibi bırak.
Çıktın bir insan tarafından kontrol edilip onaylanacak bir taslaktır; sonunda "Kontrol listesi:" başlığıyla 3–6 maddelik bir kontrol listesi ver.`;

const list = (arr, f = (x) => x) => (Array.isArray(arr) ? arr.map((x) => '- ' + (typeof x === 'string' ? x : f(x))).join('\n') : '');
// Aşama görevi için istem. piiOk false ise müşteri adı/yetkili ve kişisel veriler maskelenir.
export function buildPrompt({ task, project, service, playbook, client, piiOk, extra }) {
  const names = piiOk ? [] : [client?.name, client?.contact_name];
  const m = (x) => (piiOk ? String(x ?? '') : mask(x, names));
  const lines = [
    `Hizmet: ${service || '—'}`,
    `Proje: ${m(project?.name)}`,
    playbook?.ozet ? `Hizmet özeti: ${m(playbook.ozet)}` : '',
    list(playbook?.kapsam) ? `Kapsam:\n${m(list(playbook.kapsam))}` : '',
    list(playbook?.teslimatlar, (x) => `${x.ad}${x.kabul ? ' — kabul: ' + x.kabul : ''}`) ? `Teslimatlar:\n${m(list(playbook.teslimatlar, (x) => `${x.ad}${x.kabul ? ' — kabul: ' + x.kabul : ''}`))}` : '',
    list(playbook?.ai?.yontem) ? `Yapay zekâ yöntemi:\n${m(list(playbook.ai.yontem))}` : '',
    `Aşama: ${m(String(task?.title || '').replace(/^Yapay zekâ:\s*/, ''))}`,
    task?.description ? `Aşama tanımı:\n${m(task.description)}` : '',
    project?.description ? `Proje notları:\n${m(project.description)}` : '',
    extra ? `Ek istek: ${m(extra)}` : 'Bu aşamanın çıktısını taslak olarak hazırla.',
  ];
  return { system: SYSTEM + FORMAT, prompt: lines.filter(Boolean).join('\n\n').slice(0, 12000), masked: !piiOk };
}

// Proje için motor önerisi istemi (yalnız aşama adları ve rolleri; müşteri bilgisi yok).
export function suggestPrompt({ stages, service }) {
  const list = (stages || []).map((s, i) => `${i + 1}. ${String(s.title).replace(/^(Yapay zekâ|Müşteri kararı):\s*/, '')} (${s.stage_role || 'ekip'})`).join('\n');
  return { system: SYSTEM, masked: true, prompt: `Hizmet: ${service || '—'}\nAşamalar:\n${list}\n\nBu projede hangi aşamada hangi yapay zekâ motorunun (Claude, OpenAI GPT ve görsel üretimi, Google Gemini ve Imagen/Veo vb.) kullanılması verimli olur? Her öneri için aşama, motor, neden ve dikkat edilecek noktayı kısa bir tabloyla ver. Claude'un yeterli olduğu yerde başka motor önerme.` };
}

export function registerAi(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, postHook, api, apiBody } = d;
  const onResult = (...a) => (d.onResult ? d.onResult(...a) : null);
  const get = async (a, k) => (await one('SELECT value FROM settings WHERE agency_id=$1 AND key=$2', [a, k]))?.value ?? DEFAULTS[k];
  const put = (a, k, v) => q(`INSERT INTO settings (agency_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value`, [a, k, v]);
  const note = (taskId, body) => q('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,NULL,$2)', [taskId, ('Arvela OS · ' + body).slice(0, 8000)]);

  async function config(a) { const [enabled, auto, model, piiOk] = await Promise.all(['ai.enabled', 'ai.auto', 'ai.model', 'ai.pii_ok'].map(k => get(a, k))); return { enabled: enabled === '1', auto: auto === '1', model, piiOk: piiOk === '1' }; }

  // Görev için taslak işi oluştur ve n8n'e gönder.
  async function draft(ctx, taskId, extra) {
    const a = ctx.user.agency_id; const cfg = await config(a);
    if (!cfg.enabled) throw new HttpError(400, 'Yapay zekâ kapalı: Ayarlar → Yapay zekâ.');
    const t = await one(`SELECT t.*, p.name pname, p.description pdesc, p.playbook, p.ai_engine, p.client_id, s.name service FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN services s ON s.id=p.service_id WHERE t.id=$1 AND t.agency_id=$2`, [taskId, a]);
    if (!t) throw new HttpError(404, 'Görev bulunamadı.');
    if (await one(`SELECT 1 FROM ai_jobs WHERE task_id=$1 AND status IN ('sirada','gonderildi') AND created_at > now() - interval '15 minutes'`, [t.id])) throw new HttpError(409, 'Bu görev için bir taslak zaten hazırlanıyor.');
    const client = await one('SELECT name, contact_name FROM clients WHERE id=$1', [t.client_id]);
    const pb = t.playbook || {};
    const pr = buildPrompt({ task: t, project: { name: t.pname, description: t.pdesc }, service: t.service, playbook: pb, client, piiOk: cfg.piiOk, extra });
    const job = await one(`INSERT INTO ai_jobs (agency_id, kind, task_id, project_id, engine, model, masked, prompt, created_by) VALUES ($1,'taslak',$2,$3,'claude',$4,$5,$6,$7) RETURNING id`,
      [a, t.id, t.project_id, cfg.model, pr.masked, pr.prompt, ctx.user.id || null]);
    return dispatch(ctx, job.id, pr, cfg.model, t.id);
  }
  async function dispatch(ctx, jobId, pr, model, taskId) {
    const ok = await postHook(ctx.user.agency_id, 'arvela-ai', 'ai.request', { job_id: jobId, model, max_tokens: 6000, system: pr.system, prompt: pr.prompt }, { job_id: jobId, model, masked: pr.masked });
    await q(`UPDATE ai_jobs SET status=$1, error=$2 WHERE id=$3`, [ok ? 'gonderildi' : 'hata', ok ? null : 'n8n "Yapay zekâ (Claude)" bağlantısına ulaşılamadı. Otomasyonlar sayfasından bağlantının etkin olduğunu kontrol edin.', jobId]);
    if (taskId) await note(taskId, ok ? `Yapay zekâ taslağı istendi (Claude, iş #${jobId}${pr.masked ? ', kişisel veriler maskelendi' : ''}). Taslak gelince bu görevin notlarına yazılır ve görev "İncelemede" olur.` : `Yapay zekâ taslağı gönderilemedi (iş #${jobId}): n8n bağlantısı yok.`);
    await audit(ctx, 'ai.request', { job: jobId, task: taskId || undefined, ok });
    if (!ok) await audit(ctx, 'ai.result', { job: jobId, ok: false, via: 'dispatch' }); // sorumlu ve yöneticiye "taslak alınamadı" bildirimi
    return { id: jobId, ok };
  }

  // Akış: yapay zekâ aşaması açılınca (ayar açıksa) taslağı kendiliğinden iste.
  async function onAudit(ctx, action, detail = {}) {
    if (action !== 'task.update' || detail.stage !== 'ready' || !ctx.user?.agency_id) return;
    const t = await one(`SELECT id, stage_role FROM tasks WHERE id=$1 AND agency_id=$2`, [int(detail.id), ctx.user.agency_id]);
    if (t?.stage_role !== 'ai') return;
    const cfg = await config(ctx.user.agency_id); if (!cfg.enabled || !cfg.auto) return;
    await draft(ctx, t.id).catch((e) => console.error('yapay zekâ:', e.message));
  }

  // n8n sonucu bildirir.
  api('POST', '/ai/result', 'yaz', async (ctx, a) => {
    const b = apiBody(ctx); const job = await one('SELECT * FROM ai_jobs WHERE id=$1 AND agency_id=$2', [int(b.job_id), a]);
    if (!job) throw new HttpError(404, 'İş bulunamadı.');
    if (job.status === 'bitti') return { id: job.id, status: job.status };
    const ok = b.ok !== false && b.ok !== 'false' && nn(b.text);
    await q(`UPDATE ai_jobs SET status=$1, result=$2, error=$3, usage=$4, done_at=now() WHERE id=$5`, [ok ? 'bitti' : 'hata', ok ? String(b.text).slice(0, 60000) : null, ok ? null : String(b.error || 'Boş yanıt').slice(0, 1000), b.usage && typeof b.usage === 'object' ? b.usage : null, job.id]);
    const sx = ok ? await onResult(job, String(b.text)) : null; const shown = sx ? sx.text : String(b.text || '');
    if (sx) await q('UPDATE ai_jobs SET result=$1 WHERE id=$2', [shown.slice(0, 60000), job.id]);
    if (job.task_id) {
      if (ok) {
        await note(job.task_id, `Yapay zekâ taslağı (${job.model}, iş #${job.id}) — kontrol edip düzeltin, uygunsa görevi "Bitti" yapın.${sx?.count ? ` Claude ${sx.count} öneri de gönderdi; görev sayfasında "Claude'un önerileri" bölümünden seçip uygulayabilirsiniz.` : ''}\n\n${shown.slice(0, 7000)}`);
        await q(`UPDATE tasks SET status='incelemede' WHERE id=$1 AND status IN ('yapilacak','yapiliyor')`, [job.task_id]);
      } else await note(job.task_id, `Yapay zekâ taslağı alınamadı (iş #${job.id}): ${String(b.error || 'boş yanıt').slice(0, 300)}. Görevi elle yürütün ya da yeniden deneyin.`);
      await audit(ctx, 'task.update', { id: job.task_id, ai: ok ? 'draft' : 'error', via: 'api' }); // sorumluya n8n görev bildirimi
    }
    await audit(ctx, 'ai.result', { job: job.id, ok: !!ok });
    return { id: job.id, status: ok ? 'bitti' : 'hata' };
  });

  // ---------- ekip ekranları ----------
  route('POST', '/gorev/:id/yapay-zeka', async (ctx, res, p) => { need(ctx, ...STAFF); await draft(ctx, int(p.id)); redirect(res, `/gorev/${int(p.id)}`); });
  route('GET', '/yapay-zeka/:id', async (ctx, res, p) => {
    need(ctx, ...STAFF); const j = await one(`SELECT j.*, t.title task, pr.name project FROM ai_jobs j LEFT JOIN tasks t ON t.id=j.task_id LEFT JOIN projects pr ON pr.id=j.project_id WHERE j.id=$1 AND j.agency_id=$2`, [int(p.id), ctx.user.agency_id]);
    if (!j) throw new HttpError(404, 'İş bulunamadı.');
    send(res, 200, layout(ctx, `Yapay zekâ işi #${j.id}`, `<nav class="crumb">${j.task_id ? `<a href="/gorev/${j.task_id}">${h(j.task)}</a>` : j.project_id ? `<a href="/projeler/${j.project_id}">${h(j.project)}</a>` : ''}</nav>
<div class="page-head"><div><h1>Yapay zekâ işi #${j.id}</h1><div class="chips">${badge(JOB_ST[j.status], j.status === 'bitti' ? 'ok' : j.status === 'hata' ? 'bad' : 'warn')}<span class="muted">${h(j.model)}</span><span class="muted">${j.masked ? 'Kişisel veriler maskelendi' : 'Maskesiz (SS-2 onaylı)'}</span></div></div></div>
${j.error ? `<div class="err">${h(j.error)}</div>` : ''}<div class="two"><section class="card"><h2>Sonuç</h2>${j.result ? `<pre class="ai-out">${h(j.result)}</pre>` : '<p class="muted">Henüz sonuç yok.</p>'}</section>
<section class="card"><h2>Gönderilen istem</h2><pre class="ai-out">${h(j.prompt)}</pre></section></div>`, '/projeler'));
  });

  // Görev sayfası kartı.
  async function taskCard(ctx, t) {
    if (!STAFF.includes(ctx.user.role)) return '';
    const cfg = await config(ctx.user.agency_id); const jobs = await all('SELECT id, status, model, created_at FROM ai_jobs WHERE task_id=$1 ORDER BY id DESC LIMIT 5', [t.id]);
    if (!cfg.enabled && t.stage_role !== 'ai' && !jobs.length) return '';
    const f = csrfField(ctx);
    const btn = cfg.enabled ? `<form method="post" action="/gorev/${t.id}/yapay-zeka">${f}<button class="${t.stage_role === 'ai' ? 'gold' : 'ghost'}">Yapay zekâ ile taslak üret</button></form>` : `<a class="btn ghost" href="/ayarlar/yapay-zeka">Yapay zekâyı aç</a>`;
    return `<section class="flowbar small"><p class="eyebrow">Yapay zekâ · Claude</p><p>${cfg.enabled ? 'Claude bu görevin tanımına, hizmet kitabına ve kabul ölçütüne göre bir taslak hazırlar. Taslak notlara düşer, görev "İncelemede" olur; siz kontrol edip "Bitti" yapınca akış ilerler.' : 'Yapay zekâ henüz kapalı. Ayarlar → Yapay zekâ\'dan açınca bu aşamanın taslağı Claude ile hazırlanır.'}${cfg.enabled && !cfg.piiOk ? ' Müşteri adı ve iletişim bilgileri maskelenerek gönderilir.' : ''}</p>
<div class="row">${btn}</div>${jobs.length ? `<p class="muted" style="margin:0">${jobs.map(j => `<a href="/yapay-zeka/${j.id}">#${j.id} ${h(JOB_ST[j.status])}</a> · ${fmtDate(j.created_at)}`).join(' · ')}</p>` : ''}</section>`;
  }

  // Proje sayfası: motor seçimi ve Claude'dan motor önerisi.
  async function projectCard(ctx, p) {
    if (!STAFF.includes(ctx.user.role)) return '';
    const cfg = await config(ctx.user.agency_id); if (!cfg.enabled) return '';
    const f = csrfField(ctx); const sug = await one(`SELECT id, status, result FROM ai_jobs WHERE project_id=$1 AND kind='oneri' ORDER BY id DESC LIMIT 1`, [p.id]);
    const eng = ENGINES[p.ai_engine] ? p.ai_engine : 'claude';
    return `<details class="card add"><summary>Yapay zekâ motoru · ${h(ENGINES[eng].name)}</summary><p class="muted">Bu projenin yapay zekâ aşamaları için motor. Şu an yalnız Claude bağlı; diğerleri bağlandığında seçilebilir.</p>
<form class="row" method="post" action="/projeler/${p.id}/yapay-zeka">${f}<label>Motor<select name="engine">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}"${k === eng ? ' selected' : ''}${v.ready ? '' : ' disabled'}>${h(v.name)}${v.ready ? '' : ' (yakında)'}</option>`).join('')}</select></label><button class="ghost">Kaydet</button></form>
<form method="post" action="/projeler/${p.id}/yapay-zeka/oneri">${f}<button class="ghost">Claude'a bu proje için motor önerisi sor</button></form>
${sug ? `<p class="muted" style="margin:0">Son öneri: <a href="/yapay-zeka/${sug.id}">#${sug.id} · ${h(JOB_ST[sug.status])}</a></p>` : ''}</details>`;
  }
  route('POST', '/projeler/:id/yapay-zeka', async (ctx, res, p) => {
    need(ctx, ...STAFF); const e = ENGINES[ctx.body.engine]?.ready ? ctx.body.engine : 'claude';
    const r = await one('UPDATE projects SET ai_engine=$1 WHERE id=$2 AND agency_id=$3 RETURNING id', [e, int(p.id), ctx.user.agency_id]); if (!r) throw new HttpError(404, 'Proje bulunamadı.');
    await audit(ctx, 'project.update', { id: r.id, ai_engine: e }); redirect(res, `/projeler/${r.id}`);
  });
  route('POST', '/projeler/:id/yapay-zeka/oneri', async (ctx, res, p) => {
    need(ctx, ...STAFF); const a = ctx.user.agency_id; const cfg = await config(a); if (!cfg.enabled) throw new HttpError(400, 'Yapay zekâ kapalı.');
    const pr0 = await one('SELECT p.id, s.name service FROM projects p LEFT JOIN services s ON s.id=p.service_id WHERE p.id=$1 AND p.agency_id=$2', [int(p.id), a]); if (!pr0) throw new HttpError(404, 'Proje bulunamadı.');
    const stages = await all('SELECT title, stage_role FROM tasks WHERE project_id=$1 AND stage_no IS NOT NULL ORDER BY stage_no', [pr0.id]);
    const pr = suggestPrompt({ stages, service: pr0.service });
    const job = await one(`INSERT INTO ai_jobs (agency_id, kind, project_id, engine, model, masked, prompt, created_by) VALUES ($1,'oneri',$2,'claude',$3,true,$4,$5) RETURNING id`, [a, pr0.id, cfg.model, pr.prompt, ctx.user.id]);
    await dispatch(ctx, job.id, pr, cfg.model, null); redirect(res, `/yapay-zeka/${job.id}`);
  });

  // Ayarlar → Yapay zekâ
  route('GET', '/ayarlar/yapay-zeka', async (ctx, res) => {
    need(ctx, 'admin'); const cfg = await config(ctx.user.agency_id); const f = csrfField(ctx);
    const [hook, stats] = await Promise.all([one(`SELECT active FROM webhooks WHERE agency_id=$1 AND url LIKE '%/webhook/arvela-ai' LIMIT 1`, [ctx.user.agency_id]),
      one(`SELECT count(*)::int n, count(*) FILTER (WHERE status='bitti')::int ok, count(*) FILTER (WHERE status='hata')::int bad FROM ai_jobs WHERE agency_id=$1 AND created_at > now() - interval '30 days'`, [ctx.user.agency_id])]);
    const chk = (n, on, label) => `<label class="chk"><input type="checkbox" name="${n}" value="1"${on ? ' checked' : ''}> ${label}</label>`;
    send(res, 200, layout(ctx, 'Yapay zekâ', `<nav class="crumb"><a href="/ayarlar">Ayarlar</a></nav><div class="page-head"><div><h1>Yapay zekâ</h1><div class="chips">${badge(cfg.enabled ? 'Açık' : 'Kapalı', cfg.enabled ? 'ok' : '')}${badge(hook?.active ? 'n8n bağlantısı etkin' : 'n8n bağlantısı kapalı', hook?.active ? 'ok' : 'warn')}<span class="muted">Son 30 gün: ${stats.n} iş · ${stats.ok} taslak · ${stats.bad} hata</span></div></div></div>
<section class="card"><h2>Claude bağlantısı</h2><form class="stack" method="post" action="/ayarlar/yapay-zeka">${f}
${chk('enabled', cfg.enabled, 'Yapay zekâyı aç (Claude, n8n üzerinden)')}
${chk('auto', cfg.auto, 'Akışta yapay zekâ aşaması açılınca taslağı kendiliğinden iste')}
<label>Model<select name="model">${Object.entries(ENGINES.claude.models).map(([k, v]) => `<option value="${k}"${k === cfg.model ? ' selected' : ''}>${h(v)}</option>`).join('')}</select></label>
<fieldset><legend>Kişisel veri</legend>${chk('pii_ok', cfg.piiOk, 'Anthropic ile SS-2 standart sözleşmesi imzalandı ve KVKK bildirimi yapıldı: müşteri verisini maskesiz gönder')}
<p class="muted" style="margin:0">İşaretli değilken müşteri adı, yetkili adı, e-posta, telefon, IBAN ve kimlik numaraları gönderilmeden önce maskelenir.</p></fieldset>
<div><button class="gold">Kaydet</button></div></form></section>
<section class="card"><h2>Diğer motorlar</h2><p class="muted">${Object.values(ENGINES).filter(e => !e.ready).map(e => h(e.name)).join(', ')} henüz bağlı değil. Proje sayfasında Claude'dan motor önerisi alabilirsiniz; bir motor gerekli görülürse bağlantısı eklenir.</p></section>`, '/ayarlar'));
  });
  route('POST', '/ayarlar/yapay-zeka', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const b = ctx.body;
    await put(a, 'ai.enabled', b.enabled === '1' ? '1' : '0'); await put(a, 'ai.auto', b.auto === '1' ? '1' : '0');
    await put(a, 'ai.model', ENGINES.claude.models[b.model] ? b.model : DEFAULTS['ai.model']); await put(a, 'ai.pii_ok', b.pii_ok === '1' ? '1' : '0');
    await audit(ctx, 'settings.update', { key: 'ai', enabled: b.enabled === '1', pii_ok: b.pii_ok === '1' }); redirect(res, '/ayarlar/yapay-zeka');
  });

  return { onAudit, taskCard, projectCard, draft, config };
}
