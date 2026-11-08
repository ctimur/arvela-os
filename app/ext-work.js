// Arvela OS — iş yönetimi: projeler, görevler (açıklama, yorum, düzenleme), onaylar, hizmet kayıtları ve arama.
import { parseRequest, decisionForm, KINDS } from './ext-decisions.js';
import { locale } from './i18n.js';
// Yönetici ve çalışan tüm iş ayrıntılarını görüp düzenler; freelancer yalnız kendine atanan görevi görür,
// durumunu değiştirir ve not yazar.

export async function migrateWork({ q }) {
  await q(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT`);
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT`);
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`);
  await q(`ALTER TABLE client_services ADD COLUMN IF NOT EXISTS end_date DATE`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'tr'`);
  await q(`CREATE TABLE IF NOT EXISTS task_comments (id SERIAL PRIMARY KEY, task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id), body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
}

export const PRIO = { yuksek: 'Yüksek', normal: 'Normal', dusuk: 'Düşük' };
export const dateVal = (d) => { if (!d) return ''; const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const isLate = (t, now = new Date()) => !!t.due_date && t.status !== 'bitti' && dateVal(t.due_date) < dateVal(now);
// Arama ifadesini ILIKE için güvenli hale getirir.
export const likeArg = (s) => '%' + String(s || '').trim().slice(0, 80).replace(/[\\%_]/g, (c) => '\\' + c) + '%';

// İstemci tarafı küçük yardımcılar (CSP: yalnız aynı kaynaktan betik).
const APP_JS = `(function(){
document.querySelectorAll('table').forEach(function(t){var hs=[].map.call(t.querySelectorAll('tr:first-child th'),function(x){return x.textContent.trim()});if(!hs.length)return;
t.classList.add('rs');t.querySelectorAll('tr').forEach(function(r){[].forEach.call(r.children,function(c,i){if(c.tagName==='TD'&&hs[i])c.setAttribute('data-label',hs[i]);});});});
document.querySelectorAll('select[data-auto]').forEach(function(s){var b=s.form&&s.form.querySelector('button');if(b)b.classList.add('auto-hide');s.addEventListener('change',function(){s.form.submit();});});
var dk=document.getElementById('cmdk');if(dk&&dk.showModal){var inp=dk.querySelector('input'),links=[].slice.call(dk.querySelectorAll('nav a')),sel=0;
function vis(){return links.filter(function(l){return l.style.display!=='none';});}
function mark(){var v=vis();links.forEach(function(l){l.classList.remove('on');});if(v[sel])v[sel].classList.add('on');}
function open(){if(dk.open)return;inp.value='';links.forEach(function(l){l.style.display='';});sel=0;mark();dk.showModal();inp.focus();}
inp.addEventListener('input',function(){var q=inp.value.toLocaleLowerCase('tr').trim();links.forEach(function(l){l.style.display=!q||l.textContent.toLocaleLowerCase('tr').indexOf(q)>-1?'':'none';});sel=0;mark();});
inp.addEventListener('keydown',function(e){var v=vis();if(e.key==='ArrowDown'){sel=Math.min(sel+1,v.length-1);mark();e.preventDefault();}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);mark();e.preventDefault();}else if(e.key==='Enter'&&v.length&&(inp.value.trim()===''||v.length<links.length)){e.preventDefault();location.href=v[sel].getAttribute('href');}});
dk.addEventListener('click',function(e){if(e.target===dk)dk.close();});
document.querySelectorAll('[data-cmdk]').forEach(function(el){el.addEventListener(el.tagName==='INPUT'?'focus':'click',function(e){e.preventDefault();if(el.blur)el.blur();open();});});
document.addEventListener('keydown',function(e){var t=e.target,typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);
if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();open();}else if(e.key==='/'&&!typing){e.preventDefault();open();}});}
document.querySelectorAll('select[data-kind]').forEach(function(sel){var f=sel.form;function up(){f.querySelectorAll('[data-for]').forEach(function(el){el.hidden=el.getAttribute('data-for')!==sel.value;});}sel.addEventListener('change',up);up();});
if(window.matchMedia&&matchMedia('(max-width:700px)').matches)document.querySelectorAll('details.guide').forEach(function(d){d.open=false;});
document.querySelectorAll('form[data-confirm]').forEach(function(f){f.addEventListener('submit',function(e){if(!window.confirm(f.getAttribute('data-confirm')))e.preventDefault();});});
})();`;

export function registerWork(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, csrfField, audit, HttpError, int, nn, opts, ROLE, PR_ST, TK_ST, AP_ST, CS_ST, STAFF, redirect, send, projectExtra, flowBanner, taskExtra, decisions } = d;
  const WORKERS = ['admin', 'staff', 'freelancer'];
  const tkTone = { yapilacak: '', yapiliyor: 'warn', incelemede: 'warn', bitti: 'ok' };
  const prTone = { planlandi: '', surecte: 'warn', onayda: 'warn', tamamlandi: 'ok' };
  const apTone = (s) => s === 'onaylandi' ? 'ok' : s === 'reddedildi' ? 'bad' : 'warn';
  const qp = (ctx, k) => ctx.url.searchParams.get(k) || '';
  const people = (a) => all(`SELECT id, name, role FROM users WHERE agency_id=$1 AND active AND role IN ('admin','staff','freelancer') ORDER BY name`, [a]);
  const peopleOpts = (list, sel) => `<option value="">— Atanmadı</option>${list.map(u => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${h(u.name)} (${ROLE[u.role]})</option>`).join('')}`;
  const validAssignee = async (ctx, v) => { const id = int(v); if (!id) return null; return (await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role<>'client' AND active`, [id, ctx.user.agency_id])) ? id : null; };
  const statusForm = (ctx, t, back) => `<form class="inline-status" method="post" action="/gorev/${t.id}/durum">${csrfField(ctx)}${back ? `<input type="hidden" name="back" value="${h(back)}">` : ''}<select name="status" data-auto aria-label="Görev durumu">${opts(TK_ST, t.status)}</select><button class="ghost">Kaydet</button></form>`;
  const dueTxt = (t) => t.due_date ? `<span class="${isLate(t) ? 'late' : ''}">${fmtDate(t.due_date)}${isLate(t) ? ' · gecikti' : ''}</span>` : '—';

  route('GET', '/app.js', async (ctx, res) => { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' }); res.end(APP_JS); });

  // ---------- projeler ----------
  async function projectFor(ctx, id) {
    const p = await one('SELECT p.*, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND p.agency_id=$2', [id, ctx.user.agency_id]);
    if (!p) throw new HttpError(404, 'Proje bulunamadı.'); return p;
  }

  route('GET', '/projeler', async (ctx, res) => {
    need(ctx, ...STAFF); const a = ctx.user.agency_id;
    const durum = qp(ctx, 'durum'); const s = qp(ctx, 'q').trim();
    const where = ['p.agency_id=$1']; const args = [a];
    if (PR_ST[durum]) { args.push(durum); where.push(`p.status=$${args.length}`); } else if (durum !== 'hepsi') where.push(`p.status<>'tamamlandi'`);
    if (s) { args.push(likeArg(s)); where.push(`(p.name ILIKE $${args.length} OR c.name ILIKE $${args.length})`); }
    const rows = await all(`SELECT p.*, c.name client, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id)::int total, (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='bitti')::int done,
      (SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status<>'bitti' AND t.due_date < CURRENT_DATE)::int late
      FROM projects p JOIN clients c ON c.id=p.client_id WHERE ${where.join(' AND ')} ORDER BY (p.status='tamamlandi'), p.due_date NULLS LAST, p.id DESC`, args);
    const clients = await all(`SELECT id, name FROM clients WHERE agency_id=$1 AND status<>'churned' ORDER BY name`, [a]);
    const f = csrfField(ctx);
    send(res, 200, layout(ctx, 'Projeler', `<div class="page-head"><h1>Projeler</h1></div>
<details class="card"${clients.length && !rows.length ? ' open' : ''}><summary>Yeni proje</summary><form class="stack" method="post" action="/projeler/yeni">${f}
<div class="row"><label class="wide">Proje adı<input name="name" required></label><label>Müşteri<select name="client_id" required>${clients.map(c => `<option value="${c.id}">${h(c.name)}</option>`).join('')}</select></label><label>Teslim<input type="date" name="due_date"></label></div>
<label>Açıklama<textarea name="description" rows="2" placeholder="Kapsam, hedef, bağlantılar"></textarea></label><div><button class="gold">Proje aç</button></div></form></details>
<form class="filters" method="get" action="/projeler"><input type="search" name="q" value="${h(s)}" placeholder="Proje ya da müşteri ara" aria-label="Ara">
<select name="durum" aria-label="Durum" data-auto><option value="">Açık projeler</option><option value="hepsi"${durum === 'hepsi' ? ' selected' : ''}>Tümü</option>${opts(PR_ST, durum)}</select><button class="ghost">Filtrele</button></form>
<div class="tbl"><table><tr><th>Proje</th><th>Müşteri</th><th>Durum</th><th>İlerleme</th><th>Teslim</th></tr>
${rows.map(p => `<tr><td><a href="/projeler/${p.id}"><strong>${h(p.name)}</strong></a>${p.late ? ` <span class="badge bad">${p.late} geciken</span>` : ''}</td><td><a href="/musteriler/${p.client_id}">${h(p.client)}</a></td><td>${badge(PR_ST[p.status], prTone[p.status])}</td>
<td><div class="prog" role="img" aria-label="${p.done}/${p.total} görev tamam"><span style="width:${p.total ? Math.round(100 * p.done / p.total) : 0}%"></span></div><span class="muted">${p.done}/${p.total}</span></td><td>${fmtDate(p.due_date)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Bu filtreye uyan proje yok.</td></tr>'}</table></div>`, '/projeler'));
  });

  route('POST', '/projeler/yeni', async (ctx, res) => {
    need(ctx, ...STAFF); const b = ctx.body;
    const c = await one('SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [int(b.client_id), ctx.user.agency_id]);
    if (!c) throw new HttpError(400, 'Müşteri bulunamadı.');
    if (!nn(b.name)) throw new HttpError(400, 'Proje adı gerekli.');
    const r = await one('INSERT INTO projects (agency_id, client_id, name, due_date, description) VALUES ($1,$2,$3,$4,$5) RETURNING id', [ctx.user.agency_id, c.id, nn(b.name), nn(b.due_date), nn(b.description)]);
    await audit(ctx, 'project.create', { id: r.id, client: c.id }); redirect(res, `/projeler/${r.id}`);
  });

  route('GET', '/projeler/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id)); const a = ctx.user.agency_id;
    const [tasks, team, aps, clients, cnt] = await Promise.all([
      all(`SELECT t.*, u.name assignee, (SELECT count(*) FROM task_comments k WHERE k.task_id=t.id)::int notes FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=$1
        ORDER BY t.stage_no NULLS LAST, (t.priority='yuksek') DESC, t.due_date NULLS LAST, t.id`, [p.id]),
      people(a),
      all('SELECT * FROM approvals WHERE project_id=$1 ORDER BY created_at DESC', [p.id]),
      ctx.user.role === 'admin' ? all(`SELECT id, name FROM clients WHERE agency_id=$1 ORDER BY name`, [a]) : [],
      one(`SELECT count(*)::int n FROM tasks WHERE project_id=$1`, [p.id]),
    ]);
    const f = csrfField(ctx); const done = tasks.filter(t => t.status === 'bitti').length;
    const extra = (flowBanner ? flowBanner(ctx, p, tasks) : '') + (projectExtra ? await projectExtra(ctx, p).catch(() => '') : '');
    const col = (st) => { const list = tasks.filter(t => t.status === st); return `<section class="kcol" aria-label="${TK_ST[st]}"><h3>${TK_ST[st]} <span class="muted">${list.length}</span></h3>
${list.map(t => `<article class="kcard${isLate(t) ? ' is-late' : ''}"><a class="kt" href="/gorev/${t.id}">${t.priority === 'yuksek' ? '<span class="badge bad">Öncelikli</span> ' : ''}${h(t.title)}</a>
<div class="kmeta">${t.stage_no != null ? `<span>Aşama ${t.stage_no}</span>` : ''}${t.ready_at && t.status !== 'bitti' ? '<span class="badge warn">Sırada</span>' : ''}<span>${h(t.assignee || 'Atanmadı')}</span><span>${dueTxt(t)}</span>${t.notes ? `<span>${t.notes} not</span>` : ''}</div>${statusForm(ctx, t, '')}</article>`).join('') || '<p class="muted kempty">Boş</p>'}</section>`; };
    send(res, 200, layout(ctx, p.name, `<nav class="crumb"><a href="/projeler">Projeler</a> › <a href="/musteriler/${p.client_id}">${h(p.client)}</a></nav>
<div class="page-head"><div><h1>${h(p.name)}</h1><div class="chips">${badge(PR_ST[p.status], prTone[p.status])}<span class="muted">Teslim ${fmtDate(p.due_date)}</span><span class="muted">${done}/${tasks.length} görev tamam</span></div></div>
<a class="btn gold" href="#yeni-gorev">+ Görev</a></div>
${p.description ? `<p class="desc">${h(p.description)}</p>` : ''}
<div class="prog big" role="img" aria-label="${done}/${tasks.length} görev tamam"><span style="width:${tasks.length ? Math.round(100 * done / tasks.length) : 0}%"></span></div>
${extra}
<div class="kanban">${Object.keys(TK_ST).map(col).join('')}</div>
<section class="card" id="yeni-gorev"><h2>Yeni görev</h2><form class="stack" method="post" action="/projeler/${p.id}/gorev">${f}
<div class="row"><label class="wide">Görev<input name="title" required></label><label>Sorumlu<select name="assignee_id">${peopleOpts(team, null)}</select></label><label>Teslim<input type="date" name="due_date"></label><label>Öncelik<select name="priority">${opts(PRIO, 'normal')}</select></label></div>
<label>Açıklama<textarea name="description" rows="2"></textarea></label><div><button class="gold">Görevi ekle</button></div></form></section>
<div class="two">
<section class="card"><h2>Onaylar</h2>${aps.map(x => `<a class="line" href="/onaylar/${x.id}"><span class="grow"><strong>${h(x.title)}</strong><span class="muted">${fmtDate(x.decided_at || x.created_at)}${x.comment ? ' · ' + h(x.comment) : ''}</span></span>${badge(AP_ST[x.status], apTone(x.status))}</a>`).join('') || '<p class="muted">Bu projeye bağlı onay yok.</p>'}
<details><summary>Müşteriye onaya gönder</summary><form class="stack" method="post" action="/projeler/${p.id}/onay">${f}<label>Konu<input name="title" required></label><label>Açıklama ya da bağlantı<textarea name="body" rows="2"></textarea></label>${decisions ? decisions.requestFields() : ''}<div><button class="gold">Onaya gönder</button></div></form></details></section>
<section class="card"><h2>Proje bilgileri</h2><form class="stack" method="post" action="/projeler/${p.id}">${f}
<label>Proje adı<input name="name" value="${h(p.name)}" required></label>
<div class="row"><label>Durum<select name="status">${opts(PR_ST, p.status)}</select></label><label>Teslim<input type="date" name="due_date" value="${dateVal(p.due_date)}"></label>
${clients.length ? `<label>Müşteri<select name="client_id">${clients.map(c => `<option value="${c.id}"${c.id === p.client_id ? ' selected' : ''}>${h(c.name)}</option>`).join('')}</select></label>` : ''}</div>
<label>Açıklama<textarea name="description" rows="4">${h(p.description)}</textarea></label><div><button>Kaydet</button></div></form>
${ctx.user.role === 'admin' ? `<details class="danger"><summary>Projeyi sil</summary><form method="post" action="/projeler/${p.id}/sil" data-confirm="Proje ve ${cnt.n} görevi kalıcı olarak silinsin mi?">${f}<p class="muted">Projenin ${cnt.n} görevi ve notları da silinir; bağlı onaylar müşteride kalır.</p><button class="danger">Kalıcı olarak sil</button></form></details>` : ''}</section>
</div>`, '/projeler'));
  });

  route('POST', '/projeler/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id)); const b = ctx.body;
    let cid = p.client_id;
    if (ctx.user.role === 'admin' && int(b.client_id) && int(b.client_id) !== p.client_id && await one('SELECT 1 FROM clients WHERE id=$1 AND agency_id=$2', [int(b.client_id), ctx.user.agency_id])) cid = int(b.client_id);
    await q('UPDATE projects SET name=$1, status=$2, due_date=$3, description=$4, client_id=$5 WHERE id=$6',
      [nn(b.name) || p.name, PR_ST[b.status] ? b.status : p.status, nn(b.due_date), nn(b.description), cid, p.id]);
    if (cid !== p.client_id) await q('UPDATE approvals SET client_id=$1 WHERE project_id=$2 AND status=\'bekliyor\'', [cid, p.id]);
    await audit(ctx, 'project.update', { id: p.id }); redirect(res, `/projeler/${p.id}`);
  });

  route('POST', '/projeler/:id/sil', async (ctx, res, prm) => {
    need(ctx, 'admin'); const p = await projectFor(ctx, int(prm.id));
    await q('UPDATE approvals SET project_id=NULL WHERE project_id=$1', [p.id]);
    await q('DELETE FROM tasks WHERE project_id=$1', [p.id]);
    await q('DELETE FROM projects WHERE id=$1', [p.id]);
    await audit(ctx, 'project.delete', { id: p.id, name: p.name }); redirect(res, `/musteriler/${p.client_id}`);
  });

  route('POST', '/projeler/:id/gorev', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id)); const b = ctx.body;
    if (!nn(b.title)) throw new HttpError(400, 'Görev adı gerekli.');
    const r = await one('INSERT INTO tasks (agency_id, project_id, title, assignee_id, due_date, description, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [ctx.user.agency_id, p.id, nn(b.title), await validAssignee(ctx, b.assignee_id), nn(b.due_date), nn(b.description), PRIO[b.priority] ? b.priority : 'normal']);
    await audit(ctx, 'task.create', { id: r.id, project: p.id }); redirect(res, `/projeler/${p.id}`);
  });

  route('POST', '/projeler/:id/onay', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const p = await projectFor(ctx, int(prm.id));
    if (!nn(ctx.body.title)) throw new HttpError(400, 'Konu gerekli.');
    const rq = parseRequest(ctx.body); if (rq.error) throw new HttpError(400, rq.error);
    const r = await one('INSERT INTO approvals (agency_id, client_id, project_id, title, body, requested_by, kind, options) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [ctx.user.agency_id, p.client_id, p.id, nn(ctx.body.title), nn(ctx.body.body), ctx.user.id, rq.kind, rq.options ? JSON.stringify(rq.options) : null]);
    await audit(ctx, 'approval.request', { id: r.id, client: p.client_id }); redirect(res, `/projeler/${p.id}`);
  });

  // ---------- görevler ----------
  async function taskFor(ctx, id) {
    const t = await one(`SELECT t.*, p.name project, p.client_id, c.name client, u.name assignee FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id
      LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=$1 AND t.agency_id=$2`, [id, ctx.user.agency_id]);
    if (!t) throw new HttpError(404, 'Görev bulunamadı.');
    if (ctx.user.role === 'freelancer' && t.assignee_id !== ctx.user.id) throw new HttpError(403, 'Bu görev size atanmamış.');
    return t;
  }
  const backTo = (ctx, t) => ctx.body.back === 'mine' ? '/gorevler' : ctx.body.back === 'task' || ctx.user.role === 'freelancer' ? `/gorev/${t.id}` : `/projeler/${t.project_id}`;

  route('GET', '/gorev/:id', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const t = await taskFor(ctx, int(prm.id)); const staff = ctx.user.role !== 'freelancer';
    const [notes, team] = await Promise.all([
      all('SELECT k.*, u.name author FROM task_comments k LEFT JOIN users u ON u.id=k.user_id WHERE k.task_id=$1 ORDER BY k.created_at', [t.id]),
      staff ? people(ctx.user.agency_id) : [],
    ]);
    const f = csrfField(ctx); const flowCard = taskExtra ? await taskExtra(ctx, t).catch(() => '') : '';
    const editForm = staff ? `<form class="stack" method="post" action="/gorev/${t.id}">${f}
<label>Görev<input name="title" value="${h(t.title)}" required></label>
<div class="row"><label>Durum<select name="status">${opts(TK_ST, t.status)}</select></label><label>Sorumlu<select name="assignee_id">${peopleOpts(team, t.assignee_id)}</select></label>
<label>Teslim<input type="date" name="due_date" value="${dateVal(t.due_date)}"></label><label>Öncelik<select name="priority">${opts(PRIO, t.priority)}</select></label></div>
<label>Açıklama<textarea name="description" rows="5" placeholder="Ne yapılacak, bağlantılar, kabul ölçütü">${h(t.description)}</textarea></label><div><button>Kaydet</button></div></form>`
      : `${t.description ? `<p class="desc">${h(t.description)}</p>` : '<p class="muted">Açıklama yok.</p>'}<div class="row"><span class="muted">Teslim ${dueTxt(t)}</span></div>${statusForm(ctx, t, 'task')}`;
    send(res, 200, layout(ctx, t.title, `<nav class="crumb">${staff ? `<a href="/projeler/${t.project_id}">${h(t.project)}</a> › <a href="/musteriler/${t.client_id}">${h(t.client)}</a>` : `<a href="/gorevler">Görevlerim</a> › ${h(t.project)}`}</nav>
<div class="page-head"><div><h1>${h(t.title)}</h1><div class="chips">${badge(TK_ST[t.status], tkTone[t.status])}${t.priority === 'yuksek' ? badge('Öncelikli', 'bad') : ''}<span class="muted">${h(t.assignee || 'Atanmadı')}</span><span class="muted">Teslim ${dueTxt(t)}</span></div></div></div>
${flowCard}<div class="two wide-first"><section class="card"><h2>Ayrıntılar</h2>${editForm}</section>
<section class="card"><h2>Notlar <span class="muted">${notes.length}</span></h2>
${notes.map(n => `<div class="note"><div class="note-h"><strong>${h(n.author || (String(n.body).startsWith('Arvela OS · ') ? 'Arvela OS' : 'Silinmiş kullanıcı'))}</strong><span class="muted">${new Date(n.created_at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</span></div><p>${h(n.body)}</p></div>`).join('') || '<p class="muted">Henüz not yok. İlerlemeyi, engelleri ve bağlantıları buraya yazın.</p>'}
<form class="stack" method="post" action="/gorev/${t.id}/not">${f}<label>Not ekle<textarea name="body" rows="3" required></textarea></label><div><button class="gold">Notu kaydet</button></div></form></section></div>
${staff ? `<details class="danger card"><summary>Görevi sil</summary><form method="post" action="/gorev/${t.id}/sil" data-confirm="Görev ve notları kalıcı olarak silinsin mi?">${f}<p class="muted">Görev ve ${notes.length} not kalıcı olarak silinir.</p><button class="danger">Kalıcı olarak sil</button></form></details>` : ''}`, staff ? '/projeler' : '/gorevler'));
  });

  route('POST', '/gorev/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const t = await taskFor(ctx, int(prm.id)); const b = ctx.body;
    await q('UPDATE tasks SET title=$1, status=$2, assignee_id=$3, due_date=$4, description=$5, priority=$6 WHERE id=$7',
      [nn(b.title) || t.title, TK_ST[b.status] ? b.status : t.status, await validAssignee(ctx, b.assignee_id), nn(b.due_date), nn(b.description), PRIO[b.priority] ? b.priority : t.priority, t.id]);
    const st2 = TK_ST[b.status] ? b.status : t.status;
    await audit(ctx, 'task.update', { id: t.id, ...(st2 !== t.status ? { status: st2 } : {}) }); redirect(res, `/gorev/${t.id}`);
  });

  route('POST', '/gorev/:id/durum', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const t = await taskFor(ctx, int(prm.id));
    const st = TK_ST[ctx.body.status] ? ctx.body.status : t.status;
    await q('UPDATE tasks SET status=$1 WHERE id=$2', [st, t.id]);
    await audit(ctx, 'task.status', { id: t.id, status: st }); redirect(res, backTo(ctx, t));
  });

  route('POST', '/gorev/:id/not', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const t = await taskFor(ctx, int(prm.id));
    const body = nn(ctx.body.body); if (!body) throw new HttpError(400, 'Not boş olamaz.');
    await q('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,$2,$3)', [t.id, ctx.user.id, body.slice(0, 4000)]);
    await audit(ctx, 'task.note', { id: t.id }); redirect(res, `/gorev/${t.id}`);
  });

  route('POST', '/gorev/:id/sil', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const t = await taskFor(ctx, int(prm.id));
    await q('DELETE FROM tasks WHERE id=$1', [t.id]);
    await audit(ctx, 'task.delete', { id: t.id, title: t.title }); redirect(res, `/projeler/${t.project_id}`);
  });

  route('GET', '/gorevler', async (ctx, res) => {
    need(ctx, ...WORKERS); const fl = ctx.user.role === 'freelancer'; const a = ctx.user.agency_id;
    const kim = fl ? 'ben' : (qp(ctx, 'kim') || 'ben'); const durum = qp(ctx, 'durum') || 'acik'; const s = qp(ctx, 'q').trim();
    const where = ['t.agency_id=$1']; const args = [a];
    if (kim === 'ben') { args.push(ctx.user.id); where.push(`t.assignee_id=$${args.length}`); }
    else if (kim === 'atanmadi') where.push('t.assignee_id IS NULL');
    else if (int(kim)) { args.push(int(kim)); where.push(`t.assignee_id=$${args.length}`); }
    if (durum === 'acik') where.push(`t.status<>'bitti'`); else if (durum === 'gecikti') where.push(`t.status<>'bitti' AND t.due_date < CURRENT_DATE`); else if (TK_ST[durum]) { args.push(durum); where.push(`t.status=$${args.length}`); }
    if (s) { args.push(likeArg(s)); where.push(`(t.title ILIKE $${args.length} OR p.name ILIKE $${args.length} OR c.name ILIKE $${args.length})`); }
    const rows = await all(`SELECT t.*, p.name project, c.name client, u.name assignee FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=t.assignee_id
      WHERE ${where.join(' AND ')} ORDER BY (t.status='bitti'), (t.priority='yuksek') DESC, t.due_date NULLS LAST, t.id LIMIT 300`, args);
    const team = fl ? [] : await people(a);
    const title = fl || kim === 'ben' ? 'Görevlerim' : 'Görevler';
    const filters = `<form class="filters" method="get" action="/gorevler"><input type="search" name="q" value="${h(s)}" placeholder="Görev, proje ya da müşteri ara" aria-label="Ara">
${fl ? '' : `<select name="kim" aria-label="Kimin" data-auto><option value="ben"${kim === 'ben' ? ' selected' : ''}>Bana atananlar</option><option value="hepsi"${kim === 'hepsi' ? ' selected' : ''}>Tüm ekip</option><option value="atanmadi"${kim === 'atanmadi' ? ' selected' : ''}>Atanmamış</option>${team.filter(u => u.id !== ctx.user.id).map(u => `<option value="${u.id}"${String(u.id) === kim ? ' selected' : ''}>${h(u.name)}</option>`).join('')}</select>`}
<select name="durum" aria-label="Durum" data-auto><option value="acik"${durum === 'acik' ? ' selected' : ''}>Açık</option><option value="gecikti"${durum === 'gecikti' ? ' selected' : ''}>Geciken</option>${opts(TK_ST, durum)}<option value="hepsi"${durum === 'hepsi' ? ' selected' : ''}>Tümü</option></select><button class="ghost">Filtrele</button></form>`;
    send(res, 200, layout(ctx, title, `<div class="page-head"><h1>${title}</h1>${fl ? '' : '<a class="btn ghost" href="/projeler">Projeler</a>'}</div>${filters}
<div class="tbl"><table><tr><th>Görev</th><th>Proje</th>${fl ? '' : '<th>Müşteri</th><th>Sorumlu</th>'}<th>Teslim</th><th>Durum</th></tr>
${rows.map(t => `<tr${isLate(t) ? ' class="is-late"' : ''}><td><a href="/gorev/${t.id}"><strong>${h(t.title)}</strong></a>${t.priority === 'yuksek' ? ' ' + badge('Öncelikli', 'bad') : ''}${t.ready_at && t.status !== 'bitti' ? ' ' + badge('Sırada', 'warn') : ''}</td><td>${fl ? h(t.project) : `<a href="/projeler/${t.project_id}">${h(t.project)}</a>`}</td>${fl ? '' : `<td>${h(t.client)}</td><td>${h(t.assignee || '—')}</td>`}<td>${dueTxt(t)}</td><td>${statusForm(ctx, t, 'mine')}</td></tr>`).join('') || `<tr><td colspan="${fl ? 4 : 6}" class="muted">Bu filtreye uyan görev yok.</td></tr>`}</table></div>`, '/gorevler'));
  });

  // ---------- onaylar ----------
  async function approvalFor(ctx, id) {
    const x = await one(`SELECT ap.*, c.name client, p.name project, u.name requester, du.name decider FROM approvals ap JOIN clients c ON c.id=ap.client_id LEFT JOIN projects p ON p.id=ap.project_id
      LEFT JOIN users u ON u.id=ap.requested_by LEFT JOIN users du ON du.id=ap.decided_by WHERE ap.id=$1 AND ap.agency_id=$2`, [id, ctx.user.agency_id]);
    if (!x) throw new HttpError(404, 'Onay bulunamadı.'); return x;
  }

  route('GET', '/onaylar', async (ctx, res) => {
    need(ctx, ...STAFF); const durum = qp(ctx, 'durum') || 'bekliyor';
    const args = [ctx.user.agency_id]; let w = '';
    if (AP_ST[durum]) { args.push(durum); w = ` AND ap.status=$2`; }
    const rows = await all(`SELECT ap.*, c.name client, p.name project FROM approvals ap JOIN clients c ON c.id=ap.client_id LEFT JOIN projects p ON p.id=ap.project_id
      WHERE ap.agency_id=$1${w} ORDER BY ap.created_at DESC LIMIT 200`, args);
    send(res, 200, layout(ctx, 'Onaylar', `<div class="page-head"><h1>Onaylar</h1></div><p class="muted">Yeni onay isteği proje ya da müşteri sayfasından gönderilir.</p>
<form class="filters" method="get" action="/onaylar"><select name="durum" aria-label="Durum" data-auto>${opts(AP_ST, durum)}<option value="hepsi"${durum === 'hepsi' ? ' selected' : ''}>Tümü</option></select><button class="ghost">Filtrele</button></form>
<div class="tbl"><table><tr><th>Konu</th><th>Müşteri</th><th>Proje</th><th>Durum</th><th>Tarih</th></tr>
${rows.map(x => `<tr><td><a href="/onaylar/${x.id}"><strong>${h(x.title)}</strong></a>${x.kind && x.kind !== 'onay' ? ` <span class="muted">· ${h(KINDS[x.kind] || '')}</span>` : ''}${x.choice ? `<br><span>${h(x.choice)}</span>` : ''}${x.comment ? `<br><span class="muted">${h(x.comment)}</span>` : ''}</td><td><a href="/musteriler/${x.client_id}">${h(x.client)}</a></td><td>${x.project_id ? `<a href="/projeler/${x.project_id}">${h(x.project)}</a>` : '—'}</td><td>${badge(AP_ST[x.status], apTone(x.status))}</td><td>${fmtDate(x.decided_at || x.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Bu filtreye uyan onay yok.</td></tr>'}</table></div>`, '/onaylar'));
  });

  route('GET', '/onaylar/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const x = await approvalFor(ctx, int(prm.id)); const f = csrfField(ctx);
    const prjs = await all('SELECT id, name FROM projects WHERE client_id=$1 ORDER BY created_at DESC', [x.client_id]);
    const open = x.status === 'bekliyor';
    send(res, 200, layout(ctx, x.title, `<nav class="crumb"><a href="/onaylar">Onaylar</a> › <a href="/musteriler/${x.client_id}">${h(x.client)}</a>${x.project_id ? ` › <a href="/projeler/${x.project_id}">${h(x.project)}</a>` : ''}</nav>
<div class="page-head"><div><h1>${h(x.title)}</h1><div class="chips">${badge(AP_ST[x.status], apTone(x.status))}<span class="muted">${h(x.requester || '—')} · ${fmtDate(x.created_at)}</span>${x.decided_at ? `<span class="muted">Karar ${fmtDate(x.decided_at)}${x.decider ? ' · ' + h(x.decider) : ''}</span>` : ''}</div></div></div>
${x.comment ? `<div class="flash"><strong>Müşteri notu:</strong> ${h(x.comment)}</div>` : ''}
<div class="two wide-first"><section class="card"><h2>İstek</h2>${open ? `<form class="stack" method="post" action="/onaylar/${x.id}">${f}<label>Konu<input name="title" value="${h(x.title)}" required></label>
<label>Proje<select name="project_id"><option value="">—</option>${prjs.map(p => `<option value="${p.id}"${p.id === x.project_id ? ' selected' : ''}>${h(p.name)}</option>`).join('')}</select></label>
<label>Açıklama ya da bağlantı<textarea name="body" rows="5">${h(x.body)}</textarea></label>${decisions ? decisions.requestFields(x) : ''}<div><button>Kaydet</button></div></form>` : `<p class="muted" style="margin:0">${h(KINDS[x.kind] || KINDS.onay)}</p>${x.body ? `<p class="desc">${h(x.body)}</p>` : '<p class="muted">Açıklama yok.</p>'}`}${decisions ? await decisions.summary(x) : ''}</section>
<section class="card"><h2>Karar</h2>${open ? `<p class="muted">Müşteri portaldan ya da karar bağlantısından karar verir. Kararı telefonda ya da WhatsApp'ta aldıysanız aşağıdaki formla müşteri adına işleyin; kayıtta "Ekip işledi" olarak görünür.</p>
<p><a class="btn ghost" href="/musteriler/${x.client_id}/karar">Müşteriye karar bağlantısı gönder</a></p>
${decisionForm(x, `/onaylar/${x.id}/karar`, f, h)}
<details class="danger"><summary>İsteği geri çek</summary><form method="post" action="/onaylar/${x.id}/sil" data-confirm="Onay isteği silinsin mi?">${f}<p class="muted">Müşterinin portalından da kalkar.</p><button class="danger">Geri çek ve sil</button></form></details>`
      : `<form method="post" action="/onaylar/${x.id}/yeniden">${f}<p class="muted">Karar verildi. Gerekirse yeniden onaya açabilirsiniz.</p><button class="ghost">Yeniden onaya aç</button></form>`}</section></div>`, '/onaylar'));
  });

  route('POST', '/onaylar/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const x = await approvalFor(ctx, int(prm.id)); const b = ctx.body;
    if (x.status !== 'bekliyor') throw new HttpError(400, 'Karar verilmiş onay düzenlenemez.');
    let pid = int(b.project_id); if (pid && !(await one('SELECT 1 FROM projects WHERE id=$1 AND client_id=$2', [pid, x.client_id]))) pid = null;
    const rq = parseRequest(b); if (rq.error) throw new HttpError(400, rq.error);
    await q('UPDATE approvals SET title=$1, body=$2, project_id=$3, kind=$4, options=$5 WHERE id=$6', [nn(b.title) || x.title, nn(b.body), pid, rq.kind, rq.options ? JSON.stringify(rq.options) : null, x.id]);
    await audit(ctx, 'approval.update', { id: x.id }); redirect(res, `/onaylar/${x.id}`);
  });

  route('POST', '/onaylar/:id/karar', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const x = await approvalFor(ctx, int(prm.id));
    if (x.status !== 'bekliyor') throw new HttpError(400, 'Bu onay için karar zaten verilmiş.');
    await decisions.decide(ctx, x, ctx.body, ctx.files, 'ekip', ctx.user.name); redirect(res, `/onaylar/${x.id}`);
  });

  route('POST', '/onaylar/:id/yeniden', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const x = await approvalFor(ctx, int(prm.id));
    await q(`UPDATE approvals SET status='bekliyor', decided_at=NULL, decided_by=NULL, comment=NULL, choice=NULL, decided_via=NULL, decided_name=NULL, created_at=now() WHERE id=$1`, [x.id]);
    await audit(ctx, 'approval.reopen', { id: x.id }); redirect(res, `/onaylar/${x.id}`);
  });

  route('POST', '/onaylar/:id/sil', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const x = await approvalFor(ctx, int(prm.id));
    if (x.status !== 'bekliyor') throw new HttpError(400, 'Yalnız bekleyen istek geri çekilebilir.');
    await q('DELETE FROM approvals WHERE id=$1', [x.id]);
    await audit(ctx, 'approval.withdraw', { id: x.id, title: x.title }); redirect(res, x.project_id ? `/projeler/${x.project_id}` : `/musteriler/${x.client_id}`);
  });

  // ---------- müşteri hizmet kayıtları ----------
  async function csFor(ctx, id) {
    const cs = await one('SELECT * FROM client_services WHERE id=$1 AND agency_id=$2', [id, ctx.user.agency_id]);
    if (!cs) throw new HttpError(404, 'Kayıt bulunamadı.'); return cs;
  }
  route('POST', '/hizmet/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const cs = await csFor(ctx, int(prm.id)); const b = ctx.body;
    const st = CS_ST[b.status] ? b.status : cs.status;
    const full = 'notes' in b || 'start_date' in b;
    if (full) await q('UPDATE client_services SET status=$1, start_date=$2, end_date=$3, notes=$4 WHERE id=$5', [st, nn(b.start_date) || (st === 'aktif' && !cs.start_date ? dateVal(new Date()) : null), nn(b.end_date), nn(b.notes), cs.id]);
    else await q(`UPDATE client_services SET status=$1, start_date=COALESCE(start_date, CASE WHEN $1='aktif' THEN CURRENT_DATE END) WHERE id=$2`, [st, cs.id]);
    await audit(ctx, 'client_service.update', { id: cs.id, status: st }); redirect(res, `/musteriler/${cs.client_id}#hizmetler`);
  });
  route('POST', '/hizmet/:id/sil', async (ctx, res, prm) => {
    need(ctx, 'admin'); const cs = await csFor(ctx, int(prm.id));
    await q('DELETE FROM client_services WHERE id=$1', [cs.id]);
    await audit(ctx, 'client_service.delete', { id: cs.id }); redirect(res, `/musteriler/${cs.client_id}#hizmetler`);
  });

  // ---------- arama ----------
  route('GET', '/ara', async (ctx, res) => {
    need(ctx, ...STAFF); const a = ctx.user.agency_id; const admin = ctx.user.role === 'admin'; const s = qp(ctx, 'q').trim();
    let groups = [];
    if (s.length >= 2) {
      const L = likeArg(s);
      const [cl, pr, tk, st, ap, qu, iv] = await Promise.all([
        all(`SELECT id, name, sector FROM clients WHERE agency_id=$1 AND (name ILIKE $2 OR contact_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2 OR sector ILIKE $2) ORDER BY name LIMIT 20`, [a, L]),
        all(`SELECT p.id, p.name, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.agency_id=$1 AND (p.name ILIKE $2 OR p.description ILIKE $2) ORDER BY p.id DESC LIMIT 20`, [a, L]),
        all(`SELECT t.id, t.title, p.name project FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.agency_id=$1 AND (t.title ILIKE $2 OR t.description ILIKE $2) ORDER BY t.id DESC LIMIT 20`, [a, L]),
        all(`SELECT s.id, s.domain, s.client_id, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1 AND s.domain ILIKE $2 ORDER BY s.domain LIMIT 20`, [a, L]),
        all(`SELECT ap.id, ap.title, c.name client FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 AND ap.title ILIKE $2 ORDER BY ap.id DESC LIMIT 20`, [a, L]),
        admin ? all(`SELECT x.id, x.title, c.name client FROM quotes x JOIN clients c ON c.id=x.client_id WHERE x.agency_id=$1 AND (x.title ILIKE $2 OR CAST(x.id AS TEXT)=$3) ORDER BY x.id DESC LIMIT 20`, [a, L, s.replace('#', '')]) : [],
        admin ? all(`SELECT i.id, i.number, c.name client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND (i.number ILIKE $2 OR i.official_no ILIKE $2) ORDER BY i.id DESC LIMIT 20`, [a, L]) : [],
      ]);
      groups = [['Müşteriler', cl.map(x => [`/musteriler/${x.id}`, x.name, x.sector])], ['Projeler', pr.map(x => [`/projeler/${x.id}`, x.name, x.client])], ['Görevler', tk.map(x => [`/gorev/${x.id}`, x.title, x.project])],
        ['Siteler', st.map(x => [x.client_id ? `/musteriler/${x.client_id}/siteler` : '/siteler', x.domain, x.client])], ['Onaylar', ap.map(x => [`/onaylar/${x.id}`, x.title, x.client])],
        ['Teklifler', qu.map(x => [`/teklifler/${x.id}`, `#${x.id} · ${x.title}`, x.client])], ['Faturalar', iv.map(x => [`/faturalar/${x.id}`, x.number, x.client])]].filter(g => g[1].length);
    }
    send(res, 200, layout(ctx, 'Ara', `<div class="page-head"><h1>Ara</h1></div>
<form class="filters" method="get" action="/ara"><input type="search" name="q" value="${h(s)}" placeholder="Müşteri, proje, görev, site, fatura no…" aria-label="Ara" autofocus><button class="gold">Ara</button></form>
${s.length >= 2 ? (groups.map(([t, list]) => `<section class="card"><h2>${t} <span class="muted">${list.length}</span></h2>${list.map(([href, name, sub]) => `<a class="line" href="${href}"><span class="grow"><strong>${h(name)}</strong>${sub ? `<span class="muted">${h(sub)}</span>` : ''}</span><span class="chev" aria-hidden="true">›</span></a>`).join('')}</section>`).join('') || `<p class="muted">"${h(s)}" için sonuç yok.</p>`) : '<p class="muted">En az 2 harf yazın.</p>'}`, '/ara'));
  });
}
