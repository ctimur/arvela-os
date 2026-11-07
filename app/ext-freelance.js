// Arvela OS — freelancer iş paketleri, süre kaydı ve ödeme takibi (sabit ücret + saatlik).
// Tutarlar yalnız Yöneticiye ve paketin freelancer'ına görünür; Çalışan işi yönetir, parayı görmez.
import { t } from './i18n.js';

export const PK_ST = { teklif: 'Teklif edildi', kabul: 'Kabul edildi', surecte: 'Sürüyor', teslim: 'Teslim edildi', onaylandi: 'Onaylandı', iptal: 'İptal' };
export const PAY = { sabit: 'Sabit ücret', saatlik: 'Saatlik' };
export const METHODS = { havale: 'Havale/EFT', nakit: 'Nakit', diger: 'Diğer' };
const PK_TONE = { teklif: 'warn', kabul: '', surecte: '', teslim: 'warn', onaylandi: 'ok', iptal: '' };
const OPEN = ['teklif', 'kabul', 'surecte', 'teslim'];

// Paketin TL değeri: sabitte anlaşılan tutar, saatlikte kayıtlı süre × ücret (saat sınırı varsa sınırda durur).
export function packageValue(p, minutes = 0) {
  if (p.pay_type === 'saatlik') {
    const cap = p.hour_cap ? p.hour_cap * 60 : Infinity;
    return Math.round(Math.min(minutes, cap) / 60 * (p.hourly_rate || 0));
  }
  return p.amount || 0;
}
// Freelancer başına bakiye: hak ediş (onaylanan paketler) − ödenen = borç; süren işler ayrıca gösterilir.
export function balances(packages, payments) {
  const out = new Map();
  const row = (id, name) => { if (!out.has(id)) out.set(id, { id, name, earned: 0, pending: 0, paid: 0, owed: 0 }); const r = out.get(id); if (name && !r.name) r.name = name; return r; };
  for (const p of packages) {
    const v = packageValue(p, Number(p.minutes) || 0); const r = row(p.freelancer_id, p.freelancer);
    if (p.status === 'onaylandi') r.earned += v; else if (OPEN.includes(p.status) && p.status !== 'teklif') r.pending += v;
  }
  for (const x of payments) row(x.freelancer_id, x.freelancer).paid += x.amount || 0;
  for (const r of out.values()) r.owed = r.earned - r.paid;
  return [...out.values()].sort((a, b) => b.owed - a.owed || String(a.name).localeCompare(String(b.name), 'tr'));
}
// Kim hangi duruma geçirebilir.
export function canMove(role, own, from, to) {
  if (!PK_ST[to] || from === to) return false;
  if (role === 'admin' || role === 'staff') return true;
  if (role !== 'freelancer' || !own) return false;
  return (from === 'teklif' && (to === 'kabul' || to === 'iptal')) || ((from === 'kabul' || from === 'surecte') && to === 'teslim');
}
export const hm = (min) => { const m = Math.max(0, Math.round(Number(min) || 0)); return t`${Math.floor(m / 60)} sa ${String(m % 60).padStart(2, '0')} dk`; };
// "1:30", "1,5", "90dk" ya da "2" (saat) → dakika
export function parseDuration(v) {
  const s = String(v || '').trim().toLowerCase().replace(',', '.');
  let m = s.match(/^(\d{1,2}):([0-5]\d)$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d{1,4})\s*(dk|dakika|m|min)$/); if (m) return +m[1];
  m = s.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*(sa|saat|h)?$/); if (m) return Math.round(parseFloat(m[1]) * 60);
  return null;
}
// Bugün sayfası: teslim edilip onay bekleyen paketler.
export function packageActions(rows) {
  return rows.map(p => ({ score: 66, tone: 'warn', tag: 'İş paketi', meta: t`${p.freelancer} · teslim edildi`, title: t`${p.title} onayınızı bekliyor`, body: '',
    actions: [['Paketi aç', `/paketler/${p.id}`, 'pri']] }));
}

export async function migrateFreelance({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS work_packages (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), freelancer_id INT NOT NULL REFERENCES users(id), project_id INT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL, description TEXT, pay_type TEXT NOT NULL DEFAULT 'sabit' CHECK (pay_type IN ('sabit','saatlik')), amount INT, hourly_rate INT, hour_cap INT, due_date DATE,
    status TEXT NOT NULL DEFAULT 'teklif' CHECK (status IN ('teklif','kabul','surecte','teslim','onaylandi','iptal')), created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
    accepted_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, approved_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS time_entries (id SERIAL PRIMARY KEY, package_id INT NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE, user_id INT REFERENCES users(id),
    work_date DATE NOT NULL DEFAULT CURRENT_DATE, minutes INT NOT NULL CHECK (minutes > 0 AND minutes <= 1440), note TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS fl_payments (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), freelancer_id INT NOT NULL REFERENCES users(id), package_id INT REFERENCES work_packages(id) ON DELETE SET NULL,
    amount INT NOT NULL CHECK (amount > 0), paid_at DATE NOT NULL, method TEXT, ref TEXT, note TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS idx_wp_freelancer ON work_packages(agency_id, freelancer_id, status)');
  await q('CREATE INDEX IF NOT EXISTS idx_te_package ON time_entries(package_id)');
}

export function registerFreelance(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, opts } = d;
  const WORKERS = [...STAFF, 'freelancer'];
  const tl = (n) => `${fmtMoney(n || 0)} TL`;
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const dateVal = (x) => x ? new Date(x).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) : '';
  const money = (v) => { const n = int(String(v ?? '').replace(/[^\d]/g, '')); return n && n > 0 ? n : null; };
  const SEL = `SELECT w.*, u.name freelancer, p.name project, c.name client, COALESCE((SELECT sum(minutes) FROM time_entries WHERE package_id=w.id),0)::int minutes
    FROM work_packages w JOIN users u ON u.id=w.freelancer_id LEFT JOIN projects p ON p.id=w.project_id LEFT JOIN clients c ON c.id=p.client_id`;
  const freelancers = (a) => all(`SELECT id, name FROM users WHERE agency_id=$1 AND active AND role='freelancer' ORDER BY name`, [a]);
  const projects = (a) => all(`SELECT p.id, p.name, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.agency_id=$1 AND p.status<>'tamamlandi' ORDER BY c.name, p.name`, [a]);
  async function pkgFor(ctx, id) {
    const w = await one(`${SEL} WHERE w.id=$1 AND w.agency_id=$2`, [id, ctx.user.agency_id]);
    if (!w || (ctx.user.role === 'freelancer' && w.freelancer_id !== ctx.user.id)) throw new HttpError(404, 'İş paketi bulunamadı.');
    return w;
  }
  const seesMoney = (ctx, w) => ctx.user.role === 'admin' || (ctx.user.role === 'freelancer' && (!w || w.freelancer_id === ctx.user.id));
  const payTxt = (ctx, w) => !seesMoney(ctx, w) ? PAY[w.pay_type] : w.pay_type === 'saatlik' ? (w.hour_cap ? t`${tl(w.hourly_rate)}/saat · en çok ${w.hour_cap} saat` : t`${tl(w.hourly_rate)}/saat`) : tl(w.amount);
  const userOpts = (list, sel) => list.map(u => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${h(u.name)}</option>`).join('');
  const projOpts = (list, sel) => `<option value="">— Proje yok —</option>${list.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${h(p.client)} · ${h(p.name)}</option>`).join('')}`;
  const moneyFields = (w = {}) => `<div class="row"><label>Ödeme şekli<select name="pay_type">${opts(PAY, w.pay_type || 'sabit')}</select></label><label>Sabit tutar (TL)<input name="amount" inputmode="numeric" value="${h(w.amount ?? '')}"></label>
<label>Saatlik ücret (TL)<input name="hourly_rate" inputmode="numeric" value="${h(w.hourly_rate ?? '')}"></label><label>Saat sınırı<input name="hour_cap" inputmode="numeric" value="${h(w.hour_cap ?? '')}" placeholder="İsteğe bağlı"></label></div>`;
  const readPay = (b, w = {}) => { const pay_type = PAY[b.pay_type] ? b.pay_type : (w.pay_type || 'sabit');
    return { pay_type, amount: pay_type === 'sabit' ? money(b.amount) : null, hourly_rate: pay_type === 'saatlik' ? money(b.hourly_rate) : null, hour_cap: pay_type === 'saatlik' ? money(b.hour_cap) : null }; };

  route('GET', '/paketler', async (ctx, res) => {
    need(ctx, ...WORKERS); const a = ctx.user.agency_id; const fl = ctx.user.role === 'freelancer'; const admin = ctx.user.role === 'admin';
    const durum = ctx.url.searchParams.get('durum') || 'acik'; const kim = fl ? ctx.user.id : int(ctx.url.searchParams.get('kim'));
    const args = [a]; const where = ['w.agency_id=$1'];
    if (kim) { args.push(kim); where.push(`w.freelancer_id=$${args.length}`); }
    if (durum === 'acik') where.push(`w.status IN ('teklif','kabul','surecte','teslim')`); else if (PK_ST[durum]) { args.push(durum); where.push(`w.status=$${args.length}`); }
    const rows = await all(`${SEL} WHERE ${where.join(' AND ')} ORDER BY (w.status='teslim') DESC, w.due_date NULLS LAST, w.id DESC LIMIT 300`, args);
    const [people, projs] = fl ? [[], []] : await Promise.all([freelancers(a), projects(a)]);
    let summary = '';
    if (fl || admin) {
      const [pk, pay] = await Promise.all([all(`${SEL} WHERE w.agency_id=$1 ${fl ? 'AND w.freelancer_id=$2' : ''}`, fl ? [a, ctx.user.id] : [a]),
        all(`SELECT x.freelancer_id, x.amount FROM fl_payments x WHERE x.agency_id=$1 ${fl ? 'AND x.freelancer_id=$2' : ''}`, fl ? [a, ctx.user.id] : [a])]);
      const tot = balances(pk, pay).reduce((s, r) => ({ earned: s.earned + r.earned, pending: s.pending + r.pending, paid: s.paid + r.paid, owed: s.owed + r.owed }), { earned: 0, pending: 0, paid: 0, owed: 0 });
      summary = `<div class="grid"><div class="card"><span class="muted">${fl ? 'Alacağım' : 'Freelancer borcu'}</span><span class="stat">${tl(tot.owed)}</span></div><div class="card"><span class="muted">Hak ediş (onaylanan)</span><span class="stat">${tl(tot.earned)}</span></div>
<div class="card"><span class="muted">Ödenen</span><span class="stat">${tl(tot.paid)}</span></div><div class="card"><span class="muted">Süren işlerin değeri</span><span class="stat">${tl(tot.pending)}</span></div></div>`;
    }
    const filters = `<form class="filters" method="get" action="/paketler">${fl ? '' : `<select name="kim" aria-label="Freelancer" data-auto><option value="">Tüm freelancerlar</option>${userOpts(people, kim)}</select>`}
<select name="durum" aria-label="Durum" data-auto><option value="acik"${durum === 'acik' ? ' selected' : ''}>Açık</option>${opts(PK_ST, durum)}<option value="hepsi"${durum === 'hepsi' ? ' selected' : ''}>Tümü</option></select><button class="ghost">Filtrele</button></form>`;
    const late = (w) => w.due_date && OPEN.includes(w.status) && dateVal(w.due_date) < today();
    const table = `<div class="tbl"><table><tr><th>İş paketi</th>${fl ? '' : '<th>Freelancer</th>'}<th>Proje</th><th>Ücret</th><th>Süre</th><th>Teslim</th><th>Durum</th></tr>
${rows.map(w => `<tr${late(w) ? ' class="is-late"' : ''}><td><a href="/paketler/${w.id}"><strong>${h(w.title)}</strong></a></td>${fl ? '' : `<td>${h(w.freelancer)}</td>`}<td>${w.project ? `${h(w.client)} · ${h(w.project)}` : '—'}</td>
<td>${h(payTxt(ctx, w))}</td><td>${w.minutes ? h(hm(w.minutes)) : '—'}</td><td>${w.due_date ? h(fmtDate(w.due_date)) : '—'}</td><td>${badge(PK_ST[w.status], PK_TONE[w.status])}</td></tr>`).join('') || `<tr><td colspan="${fl ? 6 : 7}" class="muted">Bu filtreye uyan iş paketi yok.</td></tr>`}</table></div>`;
    const form = fl ? '' : `<section class="card" id="yeni-paket"><h2>Yeni iş paketi</h2>${people.length ? `<form class="stack" method="post" action="/paketler">${csrfField(ctx)}
<div class="row"><label class="wide">Başlık<input name="title" required placeholder="Ör. 5 ürün sayfası tasarımı"></label><label>Freelancer<select name="freelancer_id" required>${userOpts(people)}</select></label></div>
<div class="row"><label class="wide">Proje<select name="project_id">${projOpts(projs)}</select></label><label>Teslim<input type="date" name="due_date"></label></div>
${admin ? moneyFields() : '<p class="muted">Ücreti Yönetici belirler.</p>'}<label>Kapsam ve kabul ölçütü<textarea name="description" rows="3"></textarea></label><div><button class="gold">Paketi teklif et</button></div></form>`
      : '<p class="muted">Önce Ekip sayfasından Freelancer rolünde bir kullanıcı ekleyin.</p>'}</section>`;
    send(res, 200, layout(ctx, fl ? 'İş paketlerim' : 'İş paketleri', `<div class="page-head"><div><h1>${fl ? 'İş paketlerim' : 'İş paketleri'}</h1><p class="muted lead">${fl ? 'Teklifleri kabul edin, sürenizi kaydedin, bitince teslim edin. Onaylanan işler hak edişinize yazılır.' : 'Freelancerlara iş verin; teslimleri onaylayın. Onaylanan paket hak edişe yazılır.'}</p></div>
<div class="act-btns">${admin ? '<a class="btn ghost" href="/odemeler">Ödemeler</a>' : ''}${fl ? '' : '<a class="btn gold" href="#yeni-paket">+ İş paketi</a>'}</div></div>${summary}${filters}${table}${form}`, '/paketler'));
  });

  route('POST', '/paketler', async (ctx, res) => {
    need(ctx, ...STAFF); const b = ctx.body; const a = ctx.user.agency_id;
    if (!nn(b.title)) throw new HttpError(400, 'Başlık gerekli.');
    const fid = int(b.freelancer_id); if (!fid || !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role='freelancer' AND active`, [fid, a]))) throw new HttpError(400, 'Freelancer seçin.');
    let pid = int(b.project_id); if (pid && !(await one('SELECT 1 FROM projects WHERE id=$1 AND agency_id=$2', [pid, a]))) pid = null;
    const p = ctx.user.role === 'admin' ? readPay(b) : { pay_type: 'sabit', amount: null, hourly_rate: null, hour_cap: null };
    const r = await one(`INSERT INTO work_packages (agency_id, freelancer_id, project_id, title, description, pay_type, amount, hourly_rate, hour_cap, due_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [a, fid, pid, nn(b.title), nn(b.description), p.pay_type, p.amount, p.hourly_rate, p.hour_cap, nn(b.due_date), ctx.user.id]);
    await audit(ctx, 'package.create', { id: r.id, title: nn(b.title), freelancer_id: fid }); redirect(res, `/paketler/${r.id}`);
  });

  route('GET', '/paketler/:id', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const w = await pkgFor(ctx, int(prm.id)); const role = ctx.user.role; const staff = role !== 'freelancer'; const admin = role === 'admin'; const own = w.freelancer_id === ctx.user.id;
    const [entries, tasks, pays, projs] = await Promise.all([
      all('SELECT e.*, u.name author FROM time_entries e LEFT JOIN users u ON u.id=e.user_id WHERE e.package_id=$1 ORDER BY e.work_date DESC, e.id DESC', [w.id]),
      w.project_id ? all(`SELECT id, title, status, due_date FROM tasks WHERE project_id=$1 AND assignee_id=$2 ORDER BY (status='bitti'), due_date NULLS LAST`, [w.project_id, w.freelancer_id]) : [],
      seesMoney(ctx, w) ? all('SELECT * FROM fl_payments WHERE package_id=$1 ORDER BY paid_at DESC', [w.id]) : [],
      staff ? projects(ctx.user.agency_id) : []]);
    const f = csrfField(ctx); const value = packageValue(w, w.minutes); const locked = ['onaylandi', 'iptal'].includes(w.status);
    const canLog = admin || (!locked && (staff || (own && ['kabul', 'surecte'].includes(w.status))));
    const over = w.pay_type === 'saatlik' && w.hour_cap && w.minutes > w.hour_cap * 60;
    const moves = Object.keys(PK_ST).filter(s => canMove(role, own, w.status, s));
    const btn = { kabul: ['Kabul et', 'gold'], iptal: [staff ? 'İptal et' : 'Reddet', 'ghost'], teslim: ['Teslim ettim', 'gold'], onaylandi: ['Teslimi onayla', 'gold'], surecte: [w.status === 'teslim' ? 'Düzeltmeye geri gönder' : 'Sürüyor', 'ghost'], teklif: ['Teklife geri al', 'ghost'] };
    const moveForms = moves.filter(s => staff ? (s === 'iptal' && w.status !== 'onaylandi') || ((s === 'onaylandi' || s === 'surecte') && w.status === 'teslim') : true)
      .map(s => `<form class="inline" method="post" action="/paketler/${w.id}/durum"${s === 'iptal' || s === 'onaylandi' ? ` data-confirm="${s === 'onaylandi' ? 'Teslim onaylansın ve hak edişe yazılsın mı?' : 'Paket iptal edilsin mi?'}"` : ''}>${f}<input type="hidden" name="status" value="${s}"><button class="${btn[s][1]}">${btn[s][0]}</button></form>`).join('');
    const info = `<dl class="kv"><dt>Ödeme</dt><dd>${h(payTxt(ctx, w))}</dd><dt>Kayıtlı süre</dt><dd>${h(hm(w.minutes))}${over ? ' ' + badge('Saat sınırı aşıldı', 'bad') : ''}</dd>
${seesMoney(ctx, w) ? `<dt>${w.status === 'onaylandi' ? 'Hak ediş' : 'Şu anki değer'}</dt><dd><strong>${h(tl(value))}</strong></dd>` : ''}<dt>Teslim tarihi</dt><dd>${w.due_date ? h(fmtDate(w.due_date)) : '—'}</dd>
${w.accepted_at ? `<dt>Kabul</dt><dd>${h(fmtDate(w.accepted_at))}</dd>` : ''}${w.delivered_at ? `<dt>Teslim edildi</dt><dd>${h(fmtDate(w.delivered_at))}</dd>` : ''}${w.approved_at ? `<dt>Onaylandı</dt><dd>${h(fmtDate(w.approved_at))}</dd>` : ''}</dl>
${w.description ? `<p class="desc">${h(w.description)}</p>` : ''}`;
    const edit = staff ? `<details class="card"><summary>Paketi düzenle</summary><form class="stack" method="post" action="/paketler/${w.id}">${f}<label>Başlık<input name="title" value="${h(w.title)}" required></label>
<div class="row"><label class="wide">Proje<select name="project_id">${projOpts(projs, w.project_id)}</select></label><label>Teslim<input type="date" name="due_date" value="${dateVal(w.due_date)}"></label><label>Durum<select name="status">${opts(PK_ST, w.status)}</select></label></div>
${admin ? moneyFields(w) : ''}<label>Kapsam ve kabul ölçütü<textarea name="description" rows="4">${h(w.description)}</textarea></label><div><button>Kaydet</button></div></form>
${!entries.length && !pays.length ? `<form method="post" action="/paketler/${w.id}/sil" data-confirm="İş paketi kalıcı olarak silinsin mi?">${f}<button class="danger">Paketi sil</button></form>` : ''}</details>` : '';
    const log = `<section class="card"><h2>Süre kaydı <span class="muted">${h(hm(w.minutes))}</span></h2>
${canLog ? `<form class="stack" method="post" action="/paketler/${w.id}/sure">${f}<div class="row"><label>Tarih<input type="date" name="work_date" value="${today()}" required></label><label>Süre<input name="duration" required placeholder="1:30 ya da 1,5" inputmode="decimal"></label><label class="wide">Ne yapıldı<input name="note"></label></div><div><button class="gold">Süreyi kaydet</button></div></form>` : ''}
${entries.map(e => `<div class="note"><div class="note-h"><strong>${h(fmtDate(e.work_date))} · ${h(hm(e.minutes))}</strong><span class="muted">${h(e.author || '')}${canLog && (staff || e.user_id === ctx.user.id) ? ` · <form class="inline" method="post" action="/paketler/sure/${e.id}/sil" data-confirm="Süre kaydı silinsin mi?">${f}<button class="textbtn">Sil</button></form>` : ''}</span></div>${e.note ? `<p>${h(e.note)}</p>` : ''}</div>`).join('') || '<p class="muted">Henüz süre kaydı yok.</p>'}</section>`;
    const side = `<section class="card"><h2>Bağlı görevler</h2>${tasks.map(k => `<a class="line" href="/gorev/${k.id}"><span class="grow"><strong>${h(k.title)}</strong></span>${k.due_date ? `<span class="muted">${h(fmtDate(k.due_date))}</span>` : ''}</a>`).join('') || `<p class="muted">${w.project_id ? 'Bu projede freelancer\'a atanmış görev yok.' : 'Paket bir projeye bağlı değil.'}</p>`}</section>
${seesMoney(ctx, w) ? `<section class="card"><h2>Bu pakete yapılan ödemeler</h2>${pays.map(x => `<div class="line"><span class="grow"><strong>${h(tl(x.amount))}</strong><span class="muted">${h(METHODS[x.method] || '')}${x.ref ? ' · ' + h(x.ref) : ''}</span></span><span class="muted">${h(fmtDate(x.paid_at))}</span></div>`).join('') || '<p class="muted">Ödeme yok.</p>'}
${admin && w.status === 'onaylandi' ? `<a class="btn ghost" href="/odemeler?kim=${w.freelancer_id}&paket=${w.id}#odeme">Ödeme kaydet</a>` : ''}</section>` : ''}`;
    send(res, 200, layout(ctx, w.title, `<nav class="crumb"><a href="/paketler">${staff ? 'İş paketleri' : 'İş paketlerim'}</a>${w.project && staff ? ` › <a href="/projeler/${w.project_id}">${h(w.client)} · ${h(w.project)}</a>` : w.project ? ` › ${h(w.project)}` : ''}</nav>
<div class="page-head"><div><h1>${h(w.title)}</h1><div class="chips">${badge(PK_ST[w.status], PK_TONE[w.status])}${staff ? `<span class="muted">${h(w.freelancer)}</span>` : ''}<span class="muted">${h(PAY[w.pay_type])}</span></div></div><div class="act-btns">${moveForms}</div></div>
${w.status === 'teklif' && own ? '<div class="flash">Bu iş size teklif edildi. Kapsamı ve ücreti inceleyip kabul edin ya da reddedin.</div>' : ''}
<div class="two wide-first"><div class="stack"><section class="card"><h2>Ayrıntılar</h2>${info}</section>${log}</div><div class="stack">${side}${edit}</div></div>`, '/paketler'));
  });

  route('POST', '/paketler/:id', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const w = await pkgFor(ctx, int(prm.id)); const b = ctx.body; const a = ctx.user.agency_id;
    let pid = int(b.project_id); if (pid && !(await one('SELECT 1 FROM projects WHERE id=$1 AND agency_id=$2', [pid, a]))) pid = null;
    const p = ctx.user.role === 'admin' ? readPay(b, w) : w; const st = PK_ST[b.status] ? b.status : w.status;
    await q(`UPDATE work_packages SET title=$1, description=$2, project_id=$3, due_date=$4, pay_type=$5, amount=$6, hourly_rate=$7, hour_cap=$8, status=$9,
      approved_at=CASE WHEN $9='onaylandi' AND status<>'onaylandi' THEN now() WHEN $9<>'onaylandi' THEN NULL ELSE approved_at END WHERE id=$10`,
      [nn(b.title) || w.title, nn(b.description), pid, nn(b.due_date), p.pay_type, p.amount, p.hourly_rate, p.hour_cap, st, w.id]);
    await audit(ctx, st !== w.status ? 'package.status' : 'package.update', { id: w.id, title: w.title, ...(st !== w.status ? { from: w.status, status: st } : {}) });
    redirect(res, `/paketler/${w.id}`);
  });

  route('POST', '/paketler/:id/durum', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const w = await pkgFor(ctx, int(prm.id)); const to = ctx.body.status;
    if (!canMove(ctx.user.role, w.freelancer_id === ctx.user.id, w.status, to)) throw new HttpError(403, 'Bu işlem için yetkiniz yok.');
    const stamp = { kabul: ', accepted_at=now()', teslim: ', delivered_at=now()', onaylandi: ', approved_at=now()' }[to] || '';
    await q(`UPDATE work_packages SET status=$1${stamp}${to !== 'onaylandi' ? ', approved_at=NULL' : ''} WHERE id=$2`, [to, w.id]);
    await audit(ctx, 'package.status', { id: w.id, title: w.title, from: w.status, status: to, freelancer_id: w.freelancer_id });
    redirect(res, `/paketler/${w.id}`);
  });

  route('POST', '/paketler/:id/sure', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const w = await pkgFor(ctx, int(prm.id)); const role = ctx.user.role; const own = w.freelancer_id === ctx.user.id;
    const locked = ['onaylandi', 'iptal'].includes(w.status);
    if (!(role === 'admin' || (!locked && (role === 'staff' || (own && ['kabul', 'surecte'].includes(w.status)))))) throw new HttpError(403, 'Bu pakete süre kaydedilemez.');
    const min = parseDuration(ctx.body.duration); if (!min || min > 1440) throw new HttpError(400, 'Süreyi 1:30 ya da 1,5 gibi yazın (en çok 24 saat).');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(ctx.body.work_date || '') ? ctx.body.work_date : today();
    await q('INSERT INTO time_entries (package_id, user_id, work_date, minutes, note) VALUES ($1,$2,$3,$4,$5)', [w.id, ctx.user.id, day, min, nn(ctx.body.note)?.slice(0, 1000) ?? null]);
    if (w.status === 'kabul') await q(`UPDATE work_packages SET status='surecte' WHERE id=$1`, [w.id]);
    await audit(ctx, 'package.time', { id: w.id, title: w.title, minutes: min }); redirect(res, `/paketler/${w.id}`);
  });

  route('POST', '/paketler/sure/:eid/sil', async (ctx, res, prm) => {
    need(ctx, ...WORKERS); const e = await one('SELECT * FROM time_entries WHERE id=$1', [int(prm.eid)]); if (!e) throw new HttpError(404, 'Kayıt bulunamadı.');
    const w = await pkgFor(ctx, e.package_id); const role = ctx.user.role;
    const ok = role === 'admin' || (!['onaylandi', 'iptal'].includes(w.status) && (role === 'staff' || e.user_id === ctx.user.id));
    if (!ok) throw new HttpError(403, 'Bu kayıt silinemez.');
    await q('DELETE FROM time_entries WHERE id=$1', [e.id]); await audit(ctx, 'package.time', { id: w.id, title: w.title, minutes: -e.minutes }); redirect(res, `/paketler/${w.id}`);
  });

  route('POST', '/paketler/:id/sil', async (ctx, res, prm) => {
    need(ctx, ...STAFF); const w = await pkgFor(ctx, int(prm.id));
    if (await one('SELECT 1 FROM time_entries WHERE package_id=$1 UNION ALL SELECT 1 FROM fl_payments WHERE package_id=$1 LIMIT 1', [w.id])) throw new HttpError(400, 'Süre ya da ödeme kaydı olan paket silinemez; iptal edin.');
    await q('DELETE FROM work_packages WHERE id=$1', [w.id]); await audit(ctx, 'package.update', { id: w.id, title: w.title, deleted: true }); redirect(res, '/paketler');
  });

  // ---------- ödemeler (yalnız Yönetici) ----------
  route('GET', '/odemeler', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const kim = int(ctx.url.searchParams.get('kim')); const paket = int(ctx.url.searchParams.get('paket'));
    const [pk, pays, people] = await Promise.all([all(`${SEL} WHERE w.agency_id=$1`, [a]),
      all(`SELECT x.*, u.name freelancer, w.title package FROM fl_payments x JOIN users u ON u.id=x.freelancer_id LEFT JOIN work_packages w ON w.id=x.package_id WHERE x.agency_id=$1 ORDER BY x.paid_at DESC, x.id DESC`, [a]),
      all(`SELECT id, name FROM users WHERE agency_id=$1 AND role='freelancer' ORDER BY name`, [a])]);
    const bal = balances(pk, pays); const owedOf = (id) => bal.find(r => r.id === id)?.owed || 0;
    const f = csrfField(ctx); const done = pk.filter(w => w.status === 'onaylandi');
    send(res, 200, layout(ctx, 'Freelancer ödemeleri', `<nav class="crumb"><a href="/paketler">İş paketleri</a></nav><div class="page-head"><div><h1>Freelancer ödemeleri</h1><p class="muted lead">Onaylanan paketler hak edişe yazılır; ödemeyi kaydettikçe borç düşer.</p></div></div>
<div class="tbl"><table><tr><th>Freelancer</th><th>Hak ediş</th><th>Ödenen</th><th>Borç</th><th>Süren işler</th><th></th></tr>
${bal.map(r => `<tr><td><a href="/paketler?kim=${r.id}&durum=hepsi"><strong>${h(r.name)}</strong></a></td><td>${h(tl(r.earned))}</td><td>${h(tl(r.paid))}</td><td>${r.owed > 0 ? `<strong>${h(tl(r.owed))}</strong>` : r.owed < 0 ? badge(t`Fazla ödeme ${tl(-r.owed)}`, 'warn') : '—'}</td><td>${h(tl(r.pending))}</td>
<td>${r.owed > 0 ? `<a class="btn ghost" href="/odemeler?kim=${r.id}#odeme">Öde</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Henüz iş paketi yok.</td></tr>'}</table></div>
<div class="two"><section class="card" id="odeme"><h2>Ödeme kaydet</h2>${people.length ? `<form class="stack" method="post" action="/odemeler">${f}
<div class="row"><label class="wide">Freelancer<select name="freelancer_id" required>${people.map(u => `<option value="${u.id}"${u.id === kim ? ' selected' : ''}>${h(u.name)}${owedOf(u.id) > 0 ? ' · ' + h(t`borç ${tl(owedOf(u.id))}`) : ''}</option>`).join('')}</select></label>
<label>Tutar (TL)<input name="amount" inputmode="numeric" required value="${kim && owedOf(kim) > 0 ? owedOf(kim) : ''}"></label></div>
<div class="row"><label>Tarih<input type="date" name="paid_at" value="${today()}" required></label><label>Yöntem<select name="method">${opts(METHODS, 'havale')}</select></label><label class="wide">Dekont / açıklama no<input name="ref"></label></div>
<label>Paket (isteğe bağlı)<select name="package_id"><option value="">—</option>${done.filter(w => !kim || w.freelancer_id === kim).map(w => `<option value="${w.id}"${w.id === paket ? ' selected' : ''}>${h(w.freelancer)} · ${h(w.title)} · ${h(tl(packageValue(w, w.minutes)))}</option>`).join('')}</select></label>
<label>Not<input name="note"></label><div><button class="gold">Ödemeyi kaydet</button></div></form>` : '<p class="muted">Freelancer yok.</p>'}</section>
<section class="card"><h2>Ödeme geçmişi</h2>${pays.slice(0, 100).map(x => `<div class="line"><span class="grow"><strong>${h(x.freelancer)} · ${h(tl(x.amount))}</strong><span class="muted">${h(METHODS[x.method] || '')}${x.package ? ' · ' + h(x.package) : ''}${x.ref ? ' · ' + h(x.ref) : ''}</span></span><span class="muted">${h(fmtDate(x.paid_at))}</span>
<form class="inline" method="post" action="/odemeler/${x.id}/sil" data-confirm="Ödeme kaydı silinsin mi?">${f}<button class="textbtn">Sil</button></form></div>`).join('') || '<p class="muted">Henüz ödeme yok.</p>'}</section></div>`, '/odemeler'));
  });

  route('POST', '/odemeler', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body; const a = ctx.user.agency_id;
    const fid = int(b.freelancer_id); if (!fid || !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role='freelancer'`, [fid, a]))) throw new HttpError(400, 'Freelancer seçin.');
    const amount = money(b.amount); if (!amount) throw new HttpError(400, 'Tutar gerekli.');
    let pid = int(b.package_id); if (pid && !(await one('SELECT 1 FROM work_packages WHERE id=$1 AND agency_id=$2 AND freelancer_id=$3', [pid, a, fid]))) pid = null;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.paid_at || '') ? b.paid_at : today();
    const r = await one(`INSERT INTO fl_payments (agency_id, freelancer_id, package_id, amount, paid_at, method, ref, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [a, fid, pid, amount, day, METHODS[b.method] ? b.method : 'diger', nn(b.ref), nn(b.note), ctx.user.id]);
    await audit(ctx, 'freelancer.payment', { id: r.id, freelancer_id: fid, package_id: pid, amount }); redirect(res, '/odemeler');
  });

  route('POST', '/odemeler/:id/sil', async (ctx, res, prm) => {
    need(ctx, 'admin'); const x = await one('SELECT * FROM fl_payments WHERE id=$1 AND agency_id=$2', [int(prm.id), ctx.user.agency_id]); if (!x) throw new HttpError(404, 'Ödeme bulunamadı.');
    await q('DELETE FROM fl_payments WHERE id=$1', [x.id]); await audit(ctx, 'freelancer.payment', { id: x.id, freelancer_id: x.freelancer_id, amount: -x.amount, deleted: true }); redirect(res, '/odemeler');
  });

  return { awaitingReview: (a) => all(`SELECT w.id, w.title, u.name freelancer FROM work_packages w JOIN users u ON u.id=w.freelancer_id WHERE w.agency_id=$1 AND w.status='teslim' ORDER BY w.delivered_at`, [a]) };
}
