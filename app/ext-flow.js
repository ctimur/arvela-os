// Arvela OS — aşama akışı: hizmet kitabından açılan görevler sırayla ilerler.
// Bir aşama "Bitti" olunca sıradaki açılır ve sorumlusuna bildirilir; müşteri kararı aşamasında
// onay isteği kendiliğinden gönderilir. Onay gelince akış ilerler, düzeltme istenirse önceki aşama yeniden açılır.
import { t } from './i18n.js';

export async function migrateFlow({ q }) {
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_no INT');
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ');
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_id INT REFERENCES approvals(id) ON DELETE SET NULL');
  await q('CREATE INDEX IF NOT EXISTS tasks_approval_idx ON tasks(approval_id)');
  // 0.17.0'da açılan aşama görevlerine sıra numarası ver (yalnız henüz numarası olmayan projelerde)
  await q(`UPDATE tasks t SET stage_no=x.n FROM (SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY id) n FROM tasks WHERE stage_role IS NOT NULL) x
    WHERE t.id=x.id AND t.stage_no IS NULL AND NOT EXISTS (SELECT 1 FROM tasks z WHERE z.project_id=t.project_id AND z.stage_no IS NOT NULL)`);
  // çift önekleri düzelt: "Müşteri kararı: Müşteri onayı: …" → "Müşteri onayı: …"
  await q(`UPDATE tasks SET title=substr(title, 17) WHERE title LIKE 'Müşteri kararı: Müşteri%'`);
  await q(`UPDATE tasks SET title=substr(title, 13) WHERE title LIKE 'Yapay zekâ: Yapay zekâ%'`);
}

// ---------- saf yardımcılar (test edilir) ----------
export const stageTasks = (tasks) => (tasks || []).filter(x => x.stage_no != null).sort((a, b) => a.stage_no - b.stage_no || a.id - b.id);
// Akışın durumu: şu anki aşama (ilk bitmemiş), sıradaki, kaçıncı olduğu.
export function flowState(tasks) {
  const list = stageTasks(tasks); const i = list.findIndex(x => x.status !== 'bitti');
  return { list, total: list.length, done: list.filter(x => x.status === 'bitti').length, cur: i < 0 ? null : list[i], no: i < 0 ? list.length : i + 1, next: i < 0 ? null : list[i + 1] || null };
}
// Müşteri düzeltme istediğinde yeniden açılacak aşama: karar aşamasından önceki son insan/yapay zekâ aşaması.
export const reworkStage = (tasks, decision) => [...stageTasks(tasks)].reverse().find(x => x.stage_no < decision.stage_no && x.stage_role !== 'musteri') || null;
// Proje teslimi son aşamadan önceyse uyarı için son aşama tarihi.
export function lateEnd(projectDue, tasks) {
  const ends = (tasks || []).map(x => x.due_date).filter(Boolean).map(d => new Date(d).getTime());
  if (!ends.length || !projectDue) return null;
  const max = Math.max(...ends); return max > new Date(projectDue).getTime() ? new Date(max).toISOString().slice(0, 10) : null;
}
const tx = (s) => t([s]);
const ROLE_TXT = { ai: 'Yapay zekâ', ekip: 'Ekip', freelancer: 'Freelancer', musteri: 'Müşteri' };
// Aşama için "ne yapılır / bitince ne olur" açıklaması.
export function stageHelp(cur, next) {
  const after = next ? t`Bitince sıradaki aşama açılır: ${next.title}.` : tx('Bu son aşama; bitince proje "Onayda" durumuna geçer.');
  if (!cur) return { what: tx('Tüm aşamalar tamamlandı.'), after: tx('Teslimi müşteriyle kapatın ve proje durumunu "Tamamlandı" yapın. Aylık hizmet varsa faturası Faturalar\'dan açılır.') };
  if (cur.stage_role === 'musteri') return { what: cur.approval_id ? tx('Müşteriden karar bekleniyor. Onay isteği portala ve müşteriye gitti; telefonda ya da WhatsApp\'ta karar aldıysanız onay sayfasından işleyebilirsiniz.') : tx('Bu bir müşteri kararı aşaması. Akış başlayınca onay isteği kendiliğinden gönderilir.'),
    after: next ? t`Müşteri onaylarsa aşama kapanır ve sıradaki açılır (${next.title}). Düzeltme isterse önceki aşama notuyla yeniden açılır.` : tx('Müşteri onaylarsa proje "Onayda" durumuna geçer. Düzeltme isterse önceki aşama yeniden açılır.') };
  if (cur.stage_role === 'ai') return { what: tx('Bu aşama yapay zekâ için tasarlandı. Claude bağlantısı (n8n) henüz kurulmadı; şimdilik sorumlu kişi yapay zekâ yardımıyla yürütür, çıktıyı kabul ölçütüne göre kontrol eder ve görevi "Bitti" yapar.'), after };
  return { what: cur.assignee ? t`${cur.assignee} bu aşamayı yürütüyor. Çıktı ve kabul ölçütü görevin açıklamasında.` : tx('Bu aşamaya sorumlu atanmadı. Görevi açıp bir sorumlu seçin; atanan kişiye bildirim gider.'), after };
}

export function registerFlow(d) {
  const { route, all, one, q, need, h, badge, fmtDate, csrfField, HttpError, int, redirect, STAFF, audit, TK_ST } = d;
  const note = (ctx, taskId, body) => q('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,$2,$3)', [taskId, ctx.user?.id || null, ('Arvela OS · ' + body).slice(0, 4000)]);
  const stagesOf = (pid) => all('SELECT t.*, u.name assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=$1 AND t.stage_no IS NOT NULL ORDER BY t.stage_no, t.id', [pid]);
  const tidy = (s) => String(s || '').replace(/^(Müşteri kararı|Yapay zekâ):\s*/, '');

  // Aşamayı aç: sorumluya bildir; müşteri kararıysa onay isteği gönder.
  async function activate(ctx, x, prev) {
    const r = await one('UPDATE tasks SET ready_at=now() WHERE id=$1 AND ready_at IS NULL RETURNING id', [x.id]); if (!r) return;
    if (x.stage_role === 'musteri' && !x.approval_id) {
      const p = await one('SELECT client_id FROM projects WHERE id=$1', [x.project_id]);
      const body = [x.description, prev ? `Önceki aşama: ${tidy(prev.title)} (tamamlandı)` : ''].filter(Boolean).join('\n\n');
      const ap = await one('INSERT INTO approvals (agency_id, client_id, project_id, title, body, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [x.agency_id, p.client_id, x.project_id, tidy(x.title), body, ctx.user?.role === 'client' ? null : ctx.user?.id || null]);
      await q(`UPDATE tasks SET approval_id=$1, status='incelemede' WHERE id=$2`, [ap.id, x.id]);
      await note(ctx, x.id, `Müşteriye onay isteği gönderildi (#${ap.id}). Müşteri portaldan karar verir; karar gelince bu aşama kendiliğinden ilerler.`);
      await audit(ctx, 'approval.request', { id: ap.id, client: p.client_id, task: x.id, via: 'flow' });
    } else if (x.stage_role === 'ai') {
      await note(ctx, x.id, 'Sıra bu aşamada. Yapay zekâ aşaması: Claude bağlantısı kurulana kadar sorumlu kişi yapay zekâ yardımıyla yürütür, çıktıyı kontrol eder ve görevi "Bitti" yapar.');
    } else {
      await note(ctx, x.id, prev ? `Önceki aşama tamamlandı (${tidy(prev.title)}). Sıra bu görevde; bitince "Bitti" yapın, sistem sıradakine geçer.` : 'Proje başladı. Sıra bu görevde; bitince "Bitti" yapın, sistem sıradakine geçer.');
    }
    await audit(ctx, 'task.update', { id: x.id, stage: 'ready', via: 'flow' }); // n8n görev bildirimi sorumluya haber verir
  }

  async function advance(ctx, pid, done) {
    const st = flowState(await stagesOf(pid));
    if (!st.total) return;
    if (!st.cur) {
      const p = await one(`UPDATE projects SET status='onayda' WHERE id=$1 AND status IN ('planlandi','surecte') RETURNING id`, [pid]);
      if (p) await audit(ctx, 'project.update', { id: pid, status: 'onayda', via: 'flow' });
      return;
    }
    await q(`UPDATE projects SET status='surecte' WHERE id=$1 AND status='planlandi'`, [pid]);
    if (!st.cur.ready_at) await activate(ctx, st.cur, done);
  }

  // server.js audit() her kayıttan sonra bekleyerek çağırır.
  async function onAudit(ctx, action, detail = {}) {
    const a = ctx.user?.agency_id; if (!a) return;
    if ((action === 'task.status' || action === 'task.update') && detail.status === 'bitti') {
      const x = await one('SELECT * FROM tasks WHERE id=$1 AND agency_id=$2', [int(detail.id), a]);
      if (x && x.stage_no != null && x.status === 'bitti') await advance(ctx, x.project_id, x);
    } else if (action === 'project.playbook' && detail.tasks) {
      await advance(ctx, int(detail.id), null);
    } else if (action === 'approval.decide' || action === 'approval.decide_for_client') {
      const x = await one('SELECT * FROM tasks WHERE approval_id=$1 AND agency_id=$2', [int(detail.id), a]); if (!x) return;
      const ap = await one('SELECT comment FROM approvals WHERE id=$1', [int(detail.id)]); const c = ap?.comment ? `: "${ap.comment}"` : '.';
      if (detail.decision === 'onaylandi') {
        await q(`UPDATE tasks SET status='bitti' WHERE id=$1`, [x.id]); await note(ctx, x.id, `Müşteri onayladı${c} Sıradaki aşama açılıyor.`);
        await audit(ctx, 'task.status', { id: x.id, status: 'bitti', via: 'flow' });
      } else {
        const prev = reworkStage(await stagesOf(x.project_id), x);
        await q(`UPDATE tasks SET status='yapilacak', approval_id=NULL, ready_at=NULL WHERE id=$1`, [x.id]);
        await note(ctx, x.id, `Müşteri düzeltme istedi${c}${prev ? ` "${tidy(prev.title)}" yeniden açıldı; o aşama bitince yeni onay isteği kendiliğinden gönderilir.` : ''}`);
        if (prev) {
          await q(`UPDATE tasks SET status='yapiliyor', ready_at=now() WHERE id=$1`, [prev.id]);
          await note(ctx, prev.id, `Müşteri düzeltme istedi (${tidy(x.title)})${c} Düzeltmeyi yapıp görevi "Bitti" yapın; sistem müşteriye yeniden onay gönderir.`);
          await audit(ctx, 'task.update', { id: prev.id, stage: 'revision', via: 'flow' });
        }
      }
    } else if (action === 'approval.reopen') {
      const x = await one('SELECT id FROM tasks WHERE approval_id=$1 AND agency_id=$2', [int(detail.id), a]);
      if (x) { await q(`UPDATE tasks SET status='incelemede' WHERE id=$1`, [x.id]); await note(ctx, x.id, 'Onay yeniden açıldı; müşterinin kararı bekleniyor.'); }
    }
  }

  // Var olan projede akışı elle başlat (0.17.0'da açılan projeler için).
  route('POST', '/projeler/:id/akis', async (ctx, res, p) => {
    need(ctx, ...STAFF); const pr = await one('SELECT id FROM projects WHERE id=$1 AND agency_id=$2', [int(p.id), ctx.user.agency_id]); if (!pr) throw new HttpError(404, 'Proje bulunamadı.');
    await advance(ctx, pr.id, null); ctx.flash = null; redirect(res, `/projeler/${pr.id}`);
  });
  route('POST', '/projeler/:id/teslim', async (ctx, res, p) => {
    need(ctx, ...STAFF); const d8 = /^\d{4}-\d{2}-\d{2}$/.test(ctx.body.due_date || '') ? ctx.body.due_date : null; if (!d8) throw new HttpError(400, 'Tarih geçersiz.');
    const pr = await one('UPDATE projects SET due_date=$1 WHERE id=$2 AND agency_id=$3 RETURNING id', [d8, int(p.id), ctx.user.agency_id]); if (!pr) throw new HttpError(404, 'Proje bulunamadı.');
    await audit(ctx, 'project.update', { id: pr.id, due_date: d8 }); redirect(res, `/projeler/${pr.id}`);
  });

  const dot = (x) => x.status === 'bitti' ? 'ok' : x.ready_at ? 'warn' : '';
  // Proje sayfası: "Sıradaki adım" ve aşama listesi.
  function projectBanner(ctx, p, tasks) {
    const st = flowState(tasks); if (!st.total) return '';
    const f = csrfField(ctx); const help = stageHelp(st.cur, st.next); const end = lateEnd(p.due_date, st.list);
    const role = st.cur ? ROLE_TXT[st.cur.stage_role] || '' : '';
    let btn = '';
    if (st.cur && !st.cur.ready_at) btn = `<form method="post" action="/projeler/${p.id}/akis">${f}<button class="gold">Akışı başlat</button></form>`;
    else if (st.cur?.stage_role === 'musteri' && st.cur.approval_id) btn = `<a class="btn gold" href="/onaylar/${st.cur.approval_id}">Onay isteğini aç</a><a class="btn ghost" href="/gorev/${st.cur.id}">Görevi aç</a>`;
    else if (st.cur) btn = `<form method="post" action="/gorev/${st.cur.id}/durum">${f}<input type="hidden" name="status" value="bitti"><button class="gold">Aşamayı tamamla</button></form><a class="btn ghost" href="/gorev/${st.cur.id}">Görevi aç</a>`;
    const warn = end ? `<form class="flow-warn" method="post" action="/projeler/${p.id}/teslim">${f}<input type="hidden" name="due_date" value="${end}"><span>${h(t`Son aşamanın tarihi (${fmtDate(end)}) proje tesliminden (${fmtDate(p.due_date)}) sonra.`)}</span><button class="ghost">Teslimi son aşamaya taşı</button></form>` : '';
    return `<section class="flowbar" aria-label="Sıradaki adım"><p class="eyebrow">${st.cur ? h(t`Sıradaki adım · Aşama ${st.no}/${st.total}`) + (role ? ' · ' + h(tx(role)) : '') : 'Akış tamamlandı'}</p>
<h2>${st.cur ? h(tidy(st.cur.title)) : 'Tüm aşamalar bitti'}</h2>${st.cur ? `<div class="chips">${badge(TK_ST[st.cur.status], st.cur.status === 'bitti' ? 'ok' : 'warn')}<span class="muted">${h(st.cur.assignee || 'Atanmadı')}</span><span class="muted">Teslim ${fmtDate(st.cur.due_date)}</span></div>` : ''}
<p>${h(help.what)}</p><p class="muted"><b>Sonra ne olur:</b> ${h(help.after)}</p>${btn ? `<div class="row">${btn}</div>` : ''}${warn}
<details><summary>Tüm aşamalar (${st.done}/${st.total})</summary><ol class="stages">${st.list.map(x => `<li><span class="dot ${dot(x)}"></span><a href="/gorev/${x.id}">${h(tidy(x.title))}</a> <span class="muted">${h(tx(ROLE_TXT[x.stage_role] || ''))} · ${fmtDate(x.due_date)}</span></li>`).join('')}</ol></details></section>`;
  }

  // Görev sayfası: aşama bilgisi ve bitince ne olacağı.
  async function taskCard(ctx, x) {
    if (x.stage_no == null) return '';
    const st = flowState(await stagesOf(x.project_id)); const i = st.list.findIndex(y => y.id === x.id); const next = st.list[i + 1] || null;
    const help = stageHelp({ ...x, assignee: x.assignee }, next);
    const wait = st.cur && st.cur.id !== x.id && x.status !== 'bitti' && st.list.indexOf(st.cur) < i;
    return `<section class="flowbar small"><p class="eyebrow">${h(t`Hizmet kitabı · Aşama ${i + 1}/${st.total}`)} · ${h(tx(ROLE_TXT[x.stage_role] || ''))}</p>
<p>${wait ? h(t`Bu aşama henüz sırada değil; önce "${tidy(st.cur.title)}" bitmeli. Erken başlayabilirsiniz ama akış sırayla ilerler.`) : h(help.what)}</p><p class="muted"><b>"Bitti" yaptığınızda:</b> ${h(help.after)}</p>
${x.approval_id ? `<p><a href="/onaylar/${x.approval_id}">Bağlı onay isteğini aç</a></p>` : ''}</section>`;
  }

  // Bugün: sorumlusu olmayan açık aşamalar ve uzun süredir bekleyen müşteri kararları.
  async function todayActions(a) {
    const rows = await all(`SELECT t.id, t.title, t.project_id, t.stage_role, t.ready_at, p.name project, c.name client FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id
      WHERE t.agency_id=$1 AND t.ready_at IS NOT NULL AND t.status<>'bitti' AND t.assignee_id IS NULL AND t.stage_role<>'musteri' LIMIT 10`, [a]);
    return rows.map(x => ({ score: 67, tone: 'warn', tag: 'Akış · sorumlu yok', meta: t`${x.client} · ${x.project}`, title: tidy(x.title),
      body: tx('Önceki aşama bitti, sıra bu aşamada ama sorumlusu yok. Bir kişi atayın; atanan kişiye bildirim gider ve iş onun listesine düşer.'), actions: [['Sorumlu ata', `/gorev/${x.id}`, 'pri'], ['Projeye git', `/projeler/${x.project_id}`, 'sec']] }));
  }

  // Müşteri portalı: her projede şu an ne yapılıyor, sırada ne var.
  async function portalFlow(cid) {
    const prjs = await all(`SELECT id, name, due_date FROM projects WHERE client_id=$1 AND status<>'tamamlandi' ORDER BY created_at DESC LIMIT 10`, [cid]);
    const out = [];
    for (const p of prjs) {
      const st = flowState(await stagesOf(p.id)); if (!st.total) continue;
      const nowTxt = !st.cur ? tx('Tüm aşamalar tamamlandı; teslim için sizinle iletişime geçeceğiz.') : st.cur.stage_role === 'musteri' ? (st.cur.approval_id ? tx('Sizden karar bekleniyor: yukarıdaki onay isteğine bakın.') : tx('Bir sonraki adımda sizden karar istenecek.')) : t`Ekibimiz çalışıyor: ${tidy(st.cur.title)}.`;
      const nxt = st.next ? (st.next.stage_role === 'musteri' ? t`Sırada sizin kararınız var: ${tidy(st.next.title)} (tahmini ${fmtDate(st.next.due_date)}).` : t`Sırada: ${tidy(st.next.title)}.`) : '';
      out.push(`<div class="later-row"><span class="dot ${st.cur?.stage_role === 'musteri' ? 'warn' : 'ok'}"></span><span class="grow"><strong>${h(p.name)}</strong> <span class="muted">${h(t`Aşama ${st.no}/${st.total}`)}</span><span class="muted">${h(nowTxt)} ${h(nxt)}</span></span></div>`);
    }
    return out.length ? `<section class="later"><p class="eyebrow">Projenizde şu an</p>${out.join('')}</section>` : '';
  }

  return { onAudit, advance, projectBanner, taskCard, todayActions, portalFlow };
}
