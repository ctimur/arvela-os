// Arvela OS — uygulama içi bildirimler. İşlem kaydından (audit) türetilir: kim neyi bilmeli?
// Kural: işlemi yapan kişiye kendi işi için bildirim gitmez; aynı olay için aynı kişiye tekrar bildirim üretilmez.
import { t } from './i18n.js';

export async function migrateNotify({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, agency_id INT NOT NULL, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, href TEXT, ref TEXT, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at, created_at DESC)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS notifications_ref ON notifications(user_id, ref) WHERE ref IS NOT NULL`);
  await q(`DELETE FROM notifications WHERE created_at < now() - interval '90 days'`);
}

export const KINDS = { gorev: 'Görev', sira: 'Sıra sende', not: 'Not', karar: 'Müşteri kararı', para: 'Para', satis: 'Satış', yz: 'Yapay zekâ' };
const DECIDED = { onaylandi: 'onayladı', reddedildi: 'düzeltme istedi' };
const clip = (s, n = 140) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Bir işlem kaydından üretilecek bildirimler: [{ to: [userId], kind, title, body, href, ref }]
// db: one/all sorguları. Saf mantık burada; yazma registerNotify'da.
export async function plan(action, detail, actorId, agencyId, { one, all }) {
  const d = detail || {}; const id = Number(d.id) || 0; const out = [];
  const admins = async () => (await all(`SELECT id FROM users WHERE agency_id=$1 AND role='admin' AND active`, [agencyId])).map(r => r.id);
  const task = async (tid) => one(`SELECT t.id, t.title, t.assignee_id, t.project_id, p.name project FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND t.agency_id=$2`, [tid, agencyId]);
  if ((action === 'task.create' || action === 'task.update') && id) {
    const x = await task(id);
    if (x?.assignee_id) out.push({ to: [x.assignee_id], kind: 'gorev', title: t`Size görev atandı: ${x.title}`, body: x.project, href: `/gorev/${x.id}`, ref: `assign:${x.id}` });
  }
  if ((action === 'task.status' || action === 'task.update') && d.status === 'bitti' && id) {
    const x = await task(id);
    if (x) for (const n of await all(`SELECT id, title, assignee_id FROM tasks WHERE project_id=$1 AND status<>'bitti' AND ready_at > now() - interval '3 minutes' AND assignee_id IS NOT NULL`, [x.project_id]))
      out.push({ to: [n.assignee_id], kind: 'sira', title: t`Sıra sende: ${n.title}`, body: t`Önceki aşama bitti · ${x.project}`, href: `/gorev/${n.id}`, ref: `ready:${n.id}:${new Date().toISOString().slice(0, 13)}` });
  }
  if (action === 'task.note' && id) {
    const x = await task(id); const nt = await one(`SELECT id, body FROM task_comments WHERE task_id=$1 ORDER BY id DESC LIMIT 1`, [id]);
    if (x?.assignee_id && nt) out.push({ to: [x.assignee_id], kind: 'not', title: t`Görevinize not eklendi: ${x.title}`, body: clip(nt.body), href: `/gorev/${x.id}`, ref: `note:${nt.id}` });
  }
  if ((action === 'approval.decide' || action === 'approval.decide_for_client') && id) {
    const ap = await one(`SELECT ap.id, ap.title, ap.requested_by, c.name client FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.id=$1 AND ap.agency_id=$2`, [id, agencyId]);
    if (ap) out.push({ to: [...new Set([ap.requested_by, ...(await admins())].filter(Boolean))], kind: 'karar', title: t`${ap.client} ${DECIDED[d.decision] || 'karar verdi'}: ${ap.title}`, body: action === 'approval.decide_for_client' ? 'Ekip müşteri adına işledi' : '', href: `/onaylar/${ap.id}`, ref: `decide:${ap.id}` });
  }
  if (action === 'quote.decide' && id) {
    const x = await one(`SELECT qt.id, qt.title, qt.status, c.name client FROM quotes qt JOIN clients c ON c.id=qt.client_id WHERE qt.id=$1 AND qt.agency_id=$2`, [id, agencyId]);
    if (x) out.push({ to: await admins(), kind: 'satis', title: t`${x.client} teklife karar verdi: #${x.id} · ${x.title}`, body: x.status === 'onaylandi' ? 'Onaylandı — fatura ve proje açılabilir' : 'Reddedildi', href: `/teklifler/${x.id}`, ref: `quote:${x.id}` });
  }
  if (action === 'invoice.client_notified' && id) {
    const x = await one(`SELECT i.id, i.number, c.name client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=$1 AND i.agency_id=$2`, [id, agencyId]);
    if (x) out.push({ to: await admins(), kind: 'para', title: t`${x.client} ödediğini bildirdi: ${x.number}`, body: 'Hesap hareketlerinde kontrol edip ödendi olarak işaretleyin.', href: `/faturalar/${x.id}`, ref: `paid:${x.id}` });
  }
  if (action === 'lead.create' && id) {
    const x = await one(`SELECT id, name, owner_id, lead_source FROM clients WHERE id=$1 AND agency_id=$2`, [id, agencyId]);
    if (x) out.push({ to: x.owner_id ? [x.owner_id] : await admins(), kind: 'satis', title: t`Yeni aday: ${x.name}`, body: 'Sıcak adaya mesai içinde 15 dakikada dönün.', href: `/satis/${x.id}`, ref: `lead:${x.id}` });
  }
  if (action === 'ai.result' && d.job) {
    const j = await one(`SELECT j.id, j.task_id, j.status, t.title, t.assignee_id FROM ai_jobs j LEFT JOIN tasks t ON t.id=j.task_id WHERE j.id=$1 AND j.agency_id=$2`, [Number(d.job), agencyId]);
    if (j?.assignee_id) out.push({ to: [j.assignee_id], kind: 'yz', title: d.ok ? t`Claude taslağı hazır: ${j.title}` : t`Claude taslağı alınamadı: ${j.title}`, body: d.ok ? 'Notlarda; önerileri görev sayfasında seçip uygulayabilirsiniz.' : '', href: `/gorev/${j.task_id}`, ref: `ai:${j.id}` });
  }
  // işlemi yapan kişi kendi işinden haberdar edilmez
  for (const n of out) n.to = n.to.filter(u => u && u !== actorId);
  return out.filter(n => n.to.length);
}

export function registerNotify({ route, all, one, q, need, layout, h, csrfField, redirect, send }) {
  const WORKERS = ['admin', 'staff', 'freelancer'];
  async function onAudit(ctx, action, detail) {
    const a = ctx.user?.agency_id; if (!a) return;
    for (const n of await plan(action, detail, ctx.user?.id || null, a, { one, all }))
      for (const u of n.to) await q(`INSERT INTO notifications (agency_id, user_id, kind, title, body, href, ref) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS (SELECT 1 FROM users WHERE id=$2 AND agency_id=$1 AND active AND role<>'client')
        ON CONFLICT (user_id, ref) WHERE ref IS NOT NULL DO NOTHING`, [a, u, n.kind, clip(n.title, 200), clip(n.body, 300) || null, n.href || null, n.ref || null]);
  }
  const unread = async (uid) => (await one(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [uid]).catch(() => null))?.n || 0;
  const when = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'şimdi' : m < 60 ? t`${m} dk önce` : m < 1440 ? t`${Math.floor(m / 60)} sa önce` : new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }); };

  route('GET', '/bildirimler', async (ctx, res) => {
    need(ctx, ...WORKERS);
    const only = ctx.url.searchParams.get('tur') || ''; const unreadOnly = ctx.url.searchParams.get('okunmamis') === '1';
    const rows = await all(`SELECT * FROM notifications WHERE user_id=$1 AND ($2='' OR kind=$2) AND ($3::boolean IS FALSE OR read_at IS NULL) ORDER BY created_at DESC LIMIT 200`, [ctx.user.id, KINDS[only] ? only : '', unreadOnly]);
    const n = rows.filter(r => !r.read_at).length; const f = csrfField(ctx);
    const seg = `<nav class="viewseg" aria-label="Süz"><a href="/bildirimler"${!only && !unreadOnly ? ' class="on" aria-current="page"' : ''}>Tümü</a><a href="/bildirimler?okunmamis=1"${unreadOnly ? ' class="on" aria-current="page"' : ''}>Okunmamış</a>${Object.entries(KINDS).map(([k, v]) => `<a href="/bildirimler?tur=${k}"${only === k ? ' class="on" aria-current="page"' : ''}>${v}</a>`).join('')}</nav>`;
    const today = new Date().toDateString();
    const grp = [['Bugün', rows.filter(r => new Date(r.created_at).toDateString() === today)], ['Daha önce', rows.filter(r => new Date(r.created_at).toDateString() !== today)]];
    const row = (r) => `<a class="r nt${r.read_at ? '' : ' unread'}" href="/bildirim/${r.id}"><span class="dot ${r.read_at ? '' : 'warn'}" aria-hidden="true"></span><span class="rt"><b>${h(r.title)}</b><span class="rs">${h(KINDS[r.kind] || '')}${r.body ? ' · ' + h(r.body) : ''}</span></span><span class="chipd">${h(when(r.created_at))}</span></a>`;
    send(res, 200, layout(ctx, 'Bildirimler', `<div class="page-head"><div><h1>Bildirimler</h1><p class="ph-meta">${n ? t`${n} okunmamış` : 'Hepsi okundu.'}</p></div>
<div class="act-btns">${n ? `<form method="post" action="/bildirimler/okundu">${f}<button class="ghost">Tümünü okundu yap</button></form>` : ''}</div></div>${seg}
${rows.length ? `<div class="rows">${grp.filter(([, l]) => l.length).map(([g, l]) => `<div class="rh">${g}</div>${l.map(row).join('')}`).join('')}</div>` : '<div class="rows"><div class="r"><span class="rt"><b>Bildirim yok</b><span class="rs">Size görev atandığında, sıra size geldiğinde ya da müşteri karar verdiğinde burada görürsünüz.</span></span></div></div>'}`, '/bildirimler'));
  });
  route('GET', '/bildirim/:id', async (ctx, res, p) => {
    need(ctx, ...WORKERS);
    const r = await one(`UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2 RETURNING href`, [Number(p.id), ctx.user.id]);
    const href = r?.href && r.href.startsWith('/') && !r.href.startsWith('//') ? r.href : '/bildirimler';
    redirect(res, href);
  });
  route('POST', '/bildirimler/okundu', async (ctx, res) => {
    need(ctx, ...WORKERS);
    await q(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [ctx.user.id]);
    redirect(res, '/bildirimler');
  });
  return { onAudit, unread };
}
