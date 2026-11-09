// Arvela OS — yapay zekâ önerileri: Claude taslakla birlikte yapılandırılmış öneriler gönderir
// (görev, alt görev, kontrol listesi, müşteriye soru, hatırlatma/otomasyon, yeni yapay zekâ işi, fikir).
// Hiçbiri kendiliğinden uygulanmaz: ekip görev sayfasında tek tek seçip uygular ya da reddeder.
// Ayrıca: alt görevler (tasks.parent_id), kontrol listesi ve zamanlanmış hatırlatmalar.

export const KINDS = {
  gorev: 'Yeni görev', alt_gorev: 'Alt görev', kontrol: 'Kontrol listesi', soru: 'Müşteriye soru',
  hatirlatma: 'Hatırlatma / otomasyon', yz_isi: 'Yeni yapay zekâ işi', fikir: 'Fikir',
};
const ROLES = ['ekip', 'freelancer', 'ai'];
export const COND = { her_zaman: 'Her durumda', gorev_bitmediyse: 'Görev bitmediyse' };
export const START = '<arvela-oneriler>', END = '</arvela-oneriler>';

// Claude'a eklenen biçim talimatı (ext-ai sistem istemine eklenir).
export const FORMAT = `
Taslaktan sonra, en sonda, Arvela OS'in uygulayabileceği önerileri şu biçimde ver (geçerli JSON, en çok 15 öneri):
${START}
{"oneriler":[
 {"tur":"alt_gorev","baslik":"...","aciklama":"...","rol":"ekip|freelancer|ai","gun":2},
 {"tur":"gorev","baslik":"...","aciklama":"...","rol":"ekip","gun":3},
 {"tur":"kontrol","maddeler":["...","..."]},
 {"tur":"soru","baslik":"Müşteriden istenecek bilgi","soru":"..."},
 {"tur":"hatirlatma","baslik":"...","gun":3,"tekrar_gun":0,"kosul":"gorev_bitmediyse"},
 {"tur":"yz_isi","baslik":"...","istem":"Bu görev için hazırlanacak ek taslak"},
 {"tur":"fikir","baslik":"...","aciklama":"İşi iyileştirecek, hızlandıracak ya da yeni gelir getirecek öneri"}
]}
${END}
Kurallar: Yalnız bu türleri kullan. "gun" bugünden itibaren gün sayısıdır. Müşteriye sorulacak her eksik bilgi için bir "soru" önerisi ver.
Her yanıtta 1–3 "fikir" önerisi ekle. Gerek yoksa bir türü kullanma. Kişisel veri yazma.`;

// ---------- saf yardımcılar (test edilir) ----------
const str = (v, n) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : ''; };
const txt = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : ''; };
const num = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : def; };

// Yanıt metninden öneri bloğunu ayır: { text (bloksuz), items (doğrulanmış), error }.
export function extract(raw) {
  const s = String(raw ?? ''); const i = s.lastIndexOf(START); const j = s.lastIndexOf(END);
  if (i < 0) return { text: s.trim(), items: [], error: null };
  const text = (s.slice(0, i) + (j > i ? s.slice(j + END.length) : '')).trim();
  const body = s.slice(i + START.length, j > i ? j : undefined).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return { text, items: normalize(JSON.parse(body)), error: null }; } catch { return { text, items: [], error: 'Öneri bloğu okunamadı' }; }
}

// Yalnız izin verilen türler ve alanlar; sınırlar uygulanır.
export function normalize(data) {
  const list = Array.isArray(data?.oneriler) ? data.oneriler : Array.isArray(data) ? data : [];
  const out = [];
  for (const o of list.slice(0, 20)) {
    const tur = String(o?.tur || ''); if (!KINDS[tur]) continue;
    const baslik = str(o.baslik, 160);
    if (tur === 'gorev' || tur === 'alt_gorev') { if (baslik) out.push({ tur, baslik, aciklama: txt(o.aciklama, 2000), rol: ROLES.includes(o.rol) ? o.rol : 'ekip', gun: num(o.gun, 0, 90, 2) }); }
    else if (tur === 'kontrol') { const m = (Array.isArray(o.maddeler) ? o.maddeler : []).map(x => str(x, 200)).filter(Boolean).slice(0, 15); if (m.length) out.push({ tur, baslik: baslik || 'Kontrol listesi', maddeler: m }); }
    else if (tur === 'soru') { const soru = txt(o.soru || o.aciklama, 1500); if (soru) out.push({ tur, baslik: baslik || 'Müşteriden bilgi', soru }); }
    else if (tur === 'hatirlatma') { if (baslik) out.push({ tur, baslik, aciklama: txt(o.aciklama, 1000), gun: num(o.gun, 0, 180, 3), tekrar_gun: num(o.tekrar_gun, 0, 90, 0), kosul: COND[o.kosul] ? o.kosul : 'gorev_bitmediyse' }); }
    else if (tur === 'yz_isi') { const istem = txt(o.istem || o.aciklama, 2000); if (baslik && istem) out.push({ tur, baslik, istem }); }
    else if (tur === 'fikir') { if (baslik) out.push({ tur, baslik, aciklama: txt(o.aciklama, 1500) }); }
  }
  return out.slice(0, 15);
}

export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
// Tekrarlayan hatırlatmanın sonraki zamanı (geçmişte kalmışsa bugünden sonraya taşır).
export function nextDue(due, every, now = new Date()) {
  if (!every) return null; let t = new Date(due).getTime(); const step = every * 864e5;
  do { t += step; } while (t <= now.getTime());
  return new Date(t).toISOString();
}

export function describe(s) {
  const p = s.payload || s;
  if (p.tur === 'kontrol') return p.maddeler.join(' · ');
  if (p.tur === 'soru') return p.soru;
  if (p.tur === 'hatirlatma') return `${p.gun} gün sonra${p.tekrar_gun ? `, sonra her ${p.tekrar_gun} günde bir` : ''} · ${COND[p.kosul]}${p.aciklama ? ' · ' + p.aciklama : ''}`;
  if (p.tur === 'yz_isi') return p.istem;
  if (p.tur === 'gorev' || p.tur === 'alt_gorev') return `${p.rol === 'ai' ? 'Yapay zekâ' : p.rol === 'freelancer' ? 'Freelancer' : 'Ekip'} · ${p.gun} gün${p.aciklama ? ' · ' + p.aciklama : ''}`;
  return p.aciklama || '';
}

export async function migrateSuggest({ q }) {
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES tasks(id) ON DELETE CASCADE');
  await q('CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks(parent_id)');
  await q(`CREATE TABLE IF NOT EXISTS task_checklist (id SERIAL PRIMARY KEY, task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, body TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT false, done_by INT REFERENCES users(id) ON DELETE SET NULL, done_at TIMESTAMPTZ, sort INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS task_checklist_task ON task_checklist(task_id)');
  await q(`CREATE TABLE IF NOT EXISTS ai_suggestions (id SERIAL PRIMARY KEY, agency_id INT NOT NULL, job_id INT REFERENCES ai_jobs(id) ON DELETE CASCADE, task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'oneri', ref TEXT,
    decided_by INT REFERENCES users(id) ON DELETE SET NULL, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS ai_suggestions_task ON ai_suggestions(task_id, status)');
  await q(`CREATE TABLE IF NOT EXISTS reminders (id SERIAL PRIMARY KEY, agency_id INT NOT NULL, task_id INT REFERENCES tasks(id) ON DELETE CASCADE, project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL, body TEXT, due_at TIMESTAMPTZ NOT NULL, repeat_days INT NOT NULL DEFAULT 0, cond TEXT NOT NULL DEFAULT 'gorev_bitmediyse', status TEXT NOT NULL DEFAULT 'aktif',
    last_sent_at TIMESTAMPTZ, sent_count INT NOT NULL DEFAULT 0, created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await q(`CREATE INDEX IF NOT EXISTS reminders_due ON reminders(status, due_at)`);
}

export function registerSuggest(d) {
  const { route, all, one, q, need, h, badge, fmtDate, csrfField, HttpError, int, redirect, STAFF, audit, aiDraft } = d;
  const WORK = [...STAFF, 'freelancer'];
  const note = (taskId, body) => q('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,NULL,$2)', [taskId, ('Arvela OS · ' + body).slice(0, 4000)]);

  // ext-ai sonuç geldiğinde çağırır: öneri bloğunu ayırır ve kaydeder, kalan metni döner.
  async function onResult(job, raw) {
    const ex = extract(raw);
    for (const it of ex.items) await q('INSERT INTO ai_suggestions (agency_id, job_id, task_id, project_id, kind, payload) VALUES ($1,$2,$3,$4,$5,$6)', [job.agency_id, job.id, job.task_id, job.project_id, it.tur, it]);
    return { text: ex.text, count: ex.items.length, error: ex.error };
  }

  async function taskOf(ctx, id) {
    const t = await one('SELECT t.*, p.client_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND t.agency_id=$2', [id, ctx.user.agency_id]);
    if (!t) throw new HttpError(404, 'Görev bulunamadı.');
    if (ctx.user.role === 'freelancer' && t.assignee_id !== ctx.user.id) throw new HttpError(403, 'Bu görev size atanmamış.');
    return t;
  }

  // Tek öneriyi uygula; oluşan kaydın bağlantısını döner.
  async function apply(ctx, s, t, edited) {
    const p = { ...s.payload, ...(edited ? { baslik: edited } : {}) }; const a = ctx.user.agency_id; const today = new Date().toISOString().slice(0, 10);
    if (p.tur === 'gorev' || p.tur === 'alt_gorev' || p.tur === 'fikir') {
      const title = (p.tur === 'fikir' ? 'Fikir: ' : p.rol === 'ai' ? 'Yapay zekâ: ' : '') + p.baslik;
      const fl = p.rol === 'freelancer' ? await one(`SELECT assignee_id FROM tasks WHERE project_id=$1 AND stage_role='freelancer' AND assignee_id IS NOT NULL ORDER BY stage_no LIMIT 1`, [t.project_id]) : null;
      const assignee = p.tur === 'fikir' ? null : p.rol === 'ekip' ? t.assignee_id : p.rol === 'freelancer' ? fl?.assignee_id || null : null;
      const r = await one(`INSERT INTO tasks (agency_id, project_id, title, description, due_date, assignee_id, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [a, t.project_id, title.slice(0, 200), [p.aciklama, `Claude önerisi (iş #${s.job_id}) · ${t.title}`].filter(Boolean).join('\n\n'), addDays(today, p.gun ?? 7), assignee, p.tur === 'alt_gorev' ? t.id : null]);
      await audit(ctx, 'task.create', { id: r.id, project: t.project_id, via: 'ai', suggestion: s.id });
      return `/gorev/${r.id}`;
    }
    if (p.tur === 'kontrol') {
      const base = (await one('SELECT COALESCE(max(sort),0)::int n FROM task_checklist WHERE task_id=$1', [t.id])).n;
      for (const [i, m] of p.maddeler.entries()) await q('INSERT INTO task_checklist (task_id, body, sort) VALUES ($1,$2,$3)', [t.id, m, base + i + 1]);
      return `/gorev/${t.id}#kontrol`;
    }
    if (p.tur === 'soru') {
      const r = await one(`INSERT INTO approvals (agency_id, client_id, project_id, title, body, requested_by, kind) VALUES ($1,$2,$3,$4,$5,$6,'bilgi') RETURNING id`, [a, t.client_id, t.project_id, p.baslik, p.soru, ctx.user.id]);
      await audit(ctx, 'approval.request', { id: r.id, client: t.client_id, via: 'ai', suggestion: s.id });
      return `/onaylar/${r.id}`;
    }
    if (p.tur === 'hatirlatma') {
      const r = await one(`INSERT INTO reminders (agency_id, task_id, project_id, title, body, due_at, repeat_days, cond, created_by) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval, $7,$8,$9) RETURNING id`,
        [a, t.id, t.project_id, p.baslik, p.aciklama || null, String(p.gun), p.tekrar_gun, p.kosul, ctx.user.id]);
      await audit(ctx, 'reminder.create', { id: r.id, task: t.id, via: 'ai' });
      return `/gorev/${t.id}#hatirlatmalar`;
    }
    if (p.tur === 'yz_isi') { const j = await aiDraft(ctx, t.id, `${p.baslik}\n${p.istem}`); return `/yapay-zeka/${j.id}`; }
    throw new HttpError(400, 'Bilinmeyen öneri türü.');
  }

  route('POST', '/gorev/:id/oneriler', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const t = await taskOf(ctx, int(prm.id)); const b = ctx.body;
    const ids = Object.keys(b).filter(k => /^s_\d+$/.test(k)).map(k => int(k.slice(2)));
    if (!ids.length) throw new HttpError(400, 'Önce en az bir öneri seçin.');
    const rows = await all(`SELECT * FROM ai_suggestions WHERE id = ANY($1::int[]) AND task_id=$2 AND agency_id=$3 AND status='oneri' ORDER BY id`, [ids, t.id, ctx.user.agency_id]);
    let done = 0, failed = 0;
    for (const s of rows) {
      if (b.islem === 'reddet') { await q(`UPDATE ai_suggestions SET status='reddedildi', decided_by=$1, decided_at=now() WHERE id=$2`, [ctx.user.id, s.id]); done++; continue; }
      try {
        const ref = await apply(ctx, s, t, String(b['b_' + s.id] || '').trim().slice(0, 160) || null);
        await q(`UPDATE ai_suggestions SET status='uygulandi', ref=$1, decided_by=$2, decided_at=now() WHERE id=$3`, [ref, ctx.user.id, s.id]); done++;
      } catch (e) { failed++; await note(t.id, `Öneri uygulanamadı (${KINDS[s.kind]}: ${s.payload.baslik || ''}): ${e.message}`); }
    }
    await note(t.id, b.islem === 'reddet' ? `${done} Claude önerisi reddedildi.` : `${done} Claude önerisi uygulandı${failed ? `, ${failed} uygulanamadı` : ''}.`);
    await audit(ctx, b.islem === 'reddet' ? 'ai.reject' : 'ai.apply', { task: t.id, count: done });
    redirect(res, `/gorev/${t.id}#oneriler`);
  });

  // Kontrol listesi: ekle, işaretle, sil (görevi görebilen herkes işaretleyebilir)
  route('POST', '/gorev/:id/kontrol', async (ctx, res, prm) => {
    need(ctx, ...WORK); const t = await taskOf(ctx, int(prm.id)); const body = String(ctx.body.body || '').trim().slice(0, 200);
    if (!body) throw new HttpError(400, 'Madde boş olamaz.');
    await q('INSERT INTO task_checklist (task_id, body, sort) VALUES ($1,$2,(SELECT COALESCE(max(sort),0)+1 FROM task_checklist WHERE task_id=$1))', [t.id, body]);
    redirect(res, `/gorev/${t.id}#kontrol`);
  });
  route('POST', '/kontrol/:id', async (ctx, res, prm) => {
    need(ctx, ...WORK); const c = await one('SELECT * FROM task_checklist WHERE id=$1', [int(prm.id)]); if (!c) throw new HttpError(404, 'Madde bulunamadı.');
    const t = await taskOf(ctx, c.task_id);
    if (ctx.body.islem === 'sil' && STAFF.includes(ctx.user.role)) await q('DELETE FROM task_checklist WHERE id=$1', [c.id]);
    else await q('UPDATE task_checklist SET done=NOT done, done_by=CASE WHEN done THEN NULL ELSE $1 END, done_at=CASE WHEN done THEN NULL ELSE now() END WHERE id=$2', [ctx.user.id, c.id]);
    redirect(res, `/gorev/${t.id}#kontrol`);
  });
  route('POST', '/hatirlatma/:id/iptal', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const r = await one(`UPDATE reminders SET status='iptal' WHERE id=$1 AND agency_id=$2 RETURNING task_id`, [int(prm.id), ctx.user.agency_id]);
    if (!r) throw new HttpError(404, 'Hatırlatma bulunamadı.'); await audit(ctx, 'reminder.cancel', { id: int(prm.id) }); redirect(res, `/gorev/${r.task_id}#hatirlatmalar`);
  });
  route('POST', '/gorev/:id/hatirlatma', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const t = await taskOf(ctx, int(prm.id)); const b = ctx.body; const title = String(b.title || '').trim().slice(0, 160);
    if (!title) throw new HttpError(400, 'Hatırlatma adı gerekli.');
    const r = await one(`INSERT INTO reminders (agency_id, task_id, project_id, title, due_at, repeat_days, cond, created_by) VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval, $6,$7,$8) RETURNING id`,
      [ctx.user.agency_id, t.id, t.project_id, title, String(num(b.gun, 0, 180, 3)), num(b.tekrar, 0, 90, 0), COND[b.kosul] ? b.kosul : 'gorev_bitmediyse', ctx.user.id]);
    await audit(ctx, 'reminder.create', { id: r.id, task: t.id }); redirect(res, `/gorev/${t.id}#hatirlatmalar`);
  });

  // Zamanı gelen hatırlatmalar: görev notu + sorumluya bildirim (task.update → n8n görev bildirimi). 5 dakikada bir.
  async function runReminders() {
    const due = await all(`SELECT r.*, t.status task_status, t.title task_title FROM reminders r LEFT JOIN tasks t ON t.id=r.task_id WHERE r.status='aktif' AND r.due_at <= now() ORDER BY r.due_at LIMIT 50`);
    for (const r of due) {
      const skip = r.cond === 'gorev_bitmediyse' && r.task_status === 'bitti';
      const next = !skip && r.repeat_days ? nextDue(r.due_at, r.repeat_days) : null;
      await q(`UPDATE reminders SET status=$1, due_at=COALESCE($2::timestamptz, due_at), last_sent_at=CASE WHEN $3 THEN last_sent_at ELSE now() END, sent_count=sent_count + CASE WHEN $3 THEN 0 ELSE 1 END WHERE id=$4`,
        [skip ? 'tamam' : next ? 'aktif' : 'tamam', next, skip, r.id]);
      if (skip || !r.task_id) continue;
      await note(r.task_id, `Hatırlatma: ${r.title}${r.body ? ' — ' + r.body : ''}${next ? ` (sonraki: ${fmtDate(next)})` : ''}`);
      await audit({ user: { id: null, agency_id: r.agency_id, role: 'api', name: 'Arvela OS' } }, 'task.update', { id: r.task_id, reminder: r.id });
    }
    return due.length;
  }
  const timer = setInterval(() => runReminders().catch((e) => console.error('hatırlatma:', e.message)), 5 * 60_000); timer.unref?.();

  // Görev sayfası kartları: öneriler (ekip), alt görevler, kontrol listesi, hatırlatmalar.
  async function taskCards(ctx, t) {
    const staff = STAFF.includes(ctx.user.role); const f = csrfField(ctx);
    const [sug, subs, checks, rems, parent] = await Promise.all([
      staff ? all(`SELECT * FROM ai_suggestions WHERE task_id=$1 AND status='oneri' ORDER BY id`, [t.id]) : [],
      all(`SELECT t.id, t.title, t.status, t.due_date, u.name assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.parent_id=$1 ORDER BY t.id`, [t.id]),
      all('SELECT * FROM task_checklist WHERE task_id=$1 ORDER BY sort, id', [t.id]),
      staff ? all(`SELECT * FROM reminders WHERE task_id=$1 AND status='aktif' ORDER BY due_at`, [t.id]) : [],
      t.parent_id ? one('SELECT id, title FROM tasks WHERE id=$1', [t.parent_id]) : null]);
    const out = [];
    if (parent) out.push(`<p class="muted">Bu bir alt görev · ana görev: <a href="/gorev/${parent.id}">${h(parent.title)}</a></p>`);
    if (sug.length) out.push(`<section class="card" id="oneriler" style="border-color:var(--champ)"><h2>Claude'un önerileri (${sug.length})</h2>
<p class="muted">Hiçbiri kendiliğinden uygulanmaz. Uygulamak istediklerinizi işaretleyin; başlığı düzeltebilirsiniz. Görev ve alt görevler projeye eklenir, sorular müşteriye bilgi isteği olarak gider, hatırlatmalar zamanı gelince sorumluya bildirilir.</p>
<form class="stack" method="post" action="/gorev/${t.id}/oneriler">${f}<div class="sug-list">${sug.map(s => `<label class="sug"><input type="checkbox" name="s_${s.id}" value="1"><span class="grow"><span class="badge${s.kind === 'soru' ? ' warn' : s.kind === 'fikir' ? ' ok' : ''}">${h(KINDS[s.kind])}</span>
${s.kind === 'kontrol' ? `<strong>${h(s.payload.baslik)}</strong>` : `<input name="b_${s.id}" value="${h(s.payload.baslik)}" aria-label="Başlık" maxlength="160">`}<span class="muted">${h(describe(s))}</span></span></label>`).join('')}</div>
<div class="row"><button class="gold" name="islem" value="uygula">Seçilenleri uygula</button><button class="ghost" name="islem" value="reddet">Seçilenleri reddet</button></div></form></section>`);
    if (subs.length) out.push(`<section class="card"><h2>Alt görevler (${subs.filter(x => x.status === 'bitti').length}/${subs.length})</h2>${subs.map(x => `<a class="line" href="/gorev/${x.id}"><span class="grow"><strong>${h(x.title)}</strong><span class="muted">${h(x.assignee || 'Atanmadı')} · ${fmtDate(x.due_date)}</span></span>${badge(x.status === 'bitti' ? 'Bitti' : 'Açık', x.status === 'bitti' ? 'ok' : 'warn')}</a>`).join('')}</section>`);
    const addCheck = `<form class="row" method="post" action="/gorev/${t.id}/kontrol">${f}<input name="body" placeholder="Yeni madde" aria-label="Yeni madde" maxlength="200" required><button class="ghost">Ekle</button></form>`;
    if (!checks.length && staff) out.push(`<details class="card add" id="kontrol"><summary>Kontrol listesi ekle</summary>${addCheck}</details>`);
    if (checks.length) out.push(`<section class="card" id="kontrol"><h2>Kontrol listesi (${checks.filter(c => c.done).length}/${checks.length})</h2>
${checks.map(c => `<form class="check-row" method="post" action="/kontrol/${c.id}">${f}<button class="chkbox${c.done ? ' on' : ''}" aria-label="${c.done ? 'İşareti kaldır' : 'Tamamlandı işaretle'}">${c.done ? '✓' : ''}</button><span class="grow${c.done ? ' done' : ''}">${h(c.body)}</span>${staff ? `<button class="linkish" name="islem" value="sil">Sil</button>` : ''}</form>`).join('')}
${addCheck}</section>`);
    if (staff) out.push(`<${rems.length ? 'section' : 'details'} class="card${rems.length ? '' : ' add'}" id="hatirlatmalar">${rems.length ? '<h2>Hatırlatmalar</h2>' : '<summary>Hatırlatma ekle</summary>'}${rems.map(r => `<div class="line"><span class="grow"><strong>${h(r.title)}</strong><span class="muted">${fmtDate(r.due_at)}${r.repeat_days ? ` · her ${r.repeat_days} günde` : ''} · ${h(COND[r.cond])}</span></span><form method="post" action="/hatirlatma/${r.id}/iptal">${f}<button class="linkish">İptal</button></form></div>`).join('') || ''}
${rems.length ? '<details><summary>Hatırlatma ekle</summary>' : ''}<form class="stack" method="post" action="/gorev/${t.id}/hatirlatma">${f}<label>Ne hatırlatılsın?<input name="title" required maxlength="160"></label>
<div class="row"><label>Kaç gün sonra<input type="number" name="gun" min="0" max="180" value="3"></label><label>Tekrar (gün, 0 = yok)<input type="number" name="tekrar" min="0" max="90" value="0"></label><label>Koşul<select name="kosul">${Object.entries(COND).map(([k, v]) => `<option value="${k}"${k === 'gorev_bitmediyse' ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div><div><button class="ghost">Ekle</button></div></form>${rems.length ? '</details></section>' : '</details>'}`);
    return out.join('');
  }

  return { onResult, taskCards, runReminders };
}
