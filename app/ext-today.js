// Arvela OS — "Bugün" akışı: ekibe ve müşteriye sıradaki işi öne çıkaran aksiyon listesi.
import { siteHealth } from './ext-sites.js';
import { t, lang } from './i18n.js';

const DAY = 86400000;
const daysSince = (d, now) => d ? Math.max(0, Math.floor((now - new Date(d)) / DAY)) : 0;
const ago = (n) => n === 0 ? 'bugün' : n === 1 ? 'dünden beri' : t`${n} gündür`;

// Türkiye numarasını wa.me biçimine çevirir; anlaşılmazsa null.
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return /^\d{11,15}$/.test(d) ? d : null;
}
const wa = (phone, text) => { const n = waNumber(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null; };

// Veriden sıralı aksiyon listesi kurar. Saf fonksiyon: test edilebilir.
export function buildActions(d, { admin, now = Date.now() }) {
  const out = [];
  for (const s of d.sites || []) {
    const hl = siteHealth(s); if (hl.label !== 'Acil') continue;
    const why = s.issue || (s.ssl_status === 'expired' ? 'SSL sertifikasının süresi dolmuş.' : 'SSL kurulamadı.');
    out.push({ score: 90, tone: 'bad', tag: 'Acil · Site', meta: t`${s.client || 'Müşterisiz'} · ${ago(daysSince(s.checked_at, now))}`,
      title: t`${s.domain} için müdahale gerekiyor`, body: t`${why} Önerilen sıra: yedek al, düzelt, siteyi dışarıdan kontrol et.`,
      actions: [['Siteyi aç', s.client_id ? `/musteriler/${s.client_id}/siteler` : '/siteler', 'pri'], ...(admin ? [['Bakım teklifi hazırla', '/teklifler', 'sec']] : [])] });
  }
  if (admin) for (const i of d.notified || []) {
    out.push({ score: 85, tone: 'warn', tag: 'Havale', meta: t`${i.client} · ${ago(daysSince(i.client_notified_at, now))}`,
      title: t`${i.number}: müşteri ödediğini bildirdi`, body: 'Hesap hareketlerinde havaleyi bul, tutarı ve dekontu girip ödendi olarak işaretle.',
      actions: [['Faturayı aç', `/faturalar/${i.id}`, 'pri']] });
  }
  if (admin) for (const i of d.overdue || []) {
    const n = daysSince(i.due_date, now); const link = wa(i.phone, `Merhaba, ${i.number} numaralı faturanın vadesi geçti. Ödeme bilgileri portalınızda: Faturalarım.`);
    out.push({ score: 70 + Math.min(n, 10), tone: 'bad', tag: 'Gecikmiş fatura', meta: t`${i.client} · vade ${n} gün geçti`,
      title: t`${i.number} ödenmedi`, body: 'Müşteriye nazik bir hatırlatma gönder; ödeme bildirimi gelince buraya düşer.',
      actions: [...(link ? [["WhatsApp'tan hatırlat", link, 'pri', true]] : []), ['Faturayı aç', `/faturalar/${i.id}`, link ? 'sec' : 'pri']] });
  }
  for (const k of d.tasks || []) {
    const late = k.due_date && new Date(k.due_date) < new Date(new Date(now).toDateString());
    const today = k.due_date && new Date(k.due_date).toDateString() === new Date(now).toDateString();
    out.push({ score: late ? 75 : today ? 65 : 40, tone: late ? 'bad' : today ? 'warn' : '', tag: late ? 'Görev · gecikti' : today ? 'Görev · bugün' : 'Görev',
      meta: t`${k.client} · ${k.project}`, title: k.title, body: '',
      actions: [['Görevi aç', `/gorev/${k.id}`, 'pri'], ['Projeye git', `/projeler/${k.project_id}`, 'sec']] });
  }
  for (const a of d.approvals || []) {
    const n = daysSince(a.created_at, now); const link = wa(a.phone, `Merhaba, "${a.title}" onayınızı bekliyor. Portalınızdan bakabilirsiniz.`);
    out.push({ score: n >= 2 ? 60 : 35, tone: 'warn', tag: 'Onay', meta: t`${a.client} · ${ago(n)} müşteride`, title: a.title, body: '',
      actions: [...(link && n >= 1 ? [["WhatsApp'tan hatırlat", link, 'pri', true]] : []), ['Onayı aç', `/onaylar/${a.id}`, link && n >= 1 ? 'sec' : 'pri']] });
  }
  if (admin && d.forgePending) out.push({ score: 80, tone: 'warn', tag: 'Forge', meta: 'Arvela OS güncellemesi',
    title: t`${d.forgePending} değişiklik onayınızı bekliyor`, body: 'İnceleyip onaylarsanız yayına girer; istediğiniz zaman tek tıkla geri alabilirsiniz.',
    actions: [['Değişiklikleri incele', '/forge', 'pri']] });
  if (admin && d.monthlyDue) out.push({ score: 55, tone: 'warn', tag: 'Fatura', meta: t`${d.monthlyDue} müşteri · ${d.period}`,
    title: 'Bu ayın aylık faturaları henüz açılmadı', body: 'Aktif aylık hizmetlerden taslakları tek tuşla oluştur, kontrol edip gönder.',
    actions: [['Faturalara git', '/faturalar', 'pri']] });
  if (admin) for (const x of d.draftQuotes || []) out.push({ score: 45, tone: '', tag: 'Teklif · taslak', meta: t`${x.client} · ${ago(daysSince(x.created_at, now))}`,
    title: t`#${x.id} · ${x.title}`, body: '', actions: [['Gözden geçir, gönder', `/teklifler/${x.id}`, 'pri']] });
  if (admin) for (const i of d.draftInvoices || []) out.push({ score: 42, tone: '', tag: 'Fatura · taslak', meta: i.client,
    title: t`${i.number} gönderilmeyi bekliyor`, body: '', actions: [['Faturayı aç', `/faturalar/${i.id}`, 'pri']] });
  return out.sort((a, b) => b.score - a.score);
}

// Müşteri nabzı: her müşterinin en kötü sinyali.
export function buildPulse(d) {
  const m = new Map();
  const put = (id, name, rank, tone, label) => { const c = m.get(id); if (!c || rank > c.rank) m.set(id, { id, name, rank, tone, label }); };
  for (const c of d.clients || []) put(c.id, c.name, 0, 'ok', 'Sağlıklı');
  for (const s of d.sites || []) if (s.client_id) { const hl = siteHealth(s); if (hl.label === 'Acil') put(s.client_id, s.client, 4, 'bad', s.ssl_status === 'expired' ? 'SSL doldu' : s.ssl_status === 'failed' ? 'SSL yok' : 'Site sorunu'); else if (hl.label === 'Güncelleme') put(s.client_id, s.client, 2, 'warn', 'Güncelleme'); }
  for (const i of d.overdue || []) put(i.client_id, i.client, 3, 'bad', 'Ödeme gecikti');
  for (const a of d.approvals || []) put(a.client_id, a.client, 1, 'warn', 'Onay bekliyor');
  return [...m.values()].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'tr'));
}

function actionCard(x, h, size) {
  const btns = x.actions.map(([t, href, cls, ext], i) => `<a class="btn ${cls}" href="${h(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${h(t)}</a>`).join('');
  return `<article class="act ${size}${size === 'hero' ? '' : ''}"><div class="act-meta"><span class="badge ${x.tone}">${h(x.tag)}</span><span class="muted">${h(x.meta)}</span></div>
<${size === 'hero' ? 'h2' : 'h3'}>${h(x.title)}</${size === 'hero' ? 'h2' : 'h3'}>${x.body ? `<p>${h(x.body)}</p>` : ''}<div class="act-btns">${btns}</div></article>`;
}
export function registerToday({ all, one, h, layout, need, STAFF, forgePending }) {
  return async function todayPage(ctx, res, send) {
    need(ctx, ...STAFF); const a = ctx.user.agency_id; const admin = ctx.user.role === 'admin';
    const period = new Date().toISOString().slice(0, 7);
    const [sites, tasks, approvals, clients, overdue, notified, draftQuotes, draftInvoices, md, done] = await Promise.all([
      all(`SELECT s.*, c.name client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.agency_id=$1`, [a]),
      all(`SELECT t.*, p.name project, c.name client FROM tasks t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=p.client_id
        WHERE t.agency_id=$1 AND t.assignee_id=$2 AND t.status<>'bitti' ORDER BY t.due_date NULLS LAST LIMIT 20`, [a, ctx.user.id]),
      all(`SELECT ap.*, c.name client, c.phone FROM approvals ap JOIN clients c ON c.id=ap.client_id WHERE ap.agency_id=$1 AND ap.status='bekliyor' ORDER BY ap.created_at LIMIT 20`, [a]),
      all(`SELECT id, name FROM clients WHERE agency_id=$1 AND status='active'`, [a]),
      admin ? all(`SELECT i.*, c.name client, c.phone FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND i.status='gonderildi' AND i.client_notified_at IS NULL AND i.due_date < CURRENT_DATE ORDER BY i.due_date`, [a]) : [],
      admin ? all(`SELECT i.*, c.name client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND i.status='gonderildi' AND i.client_notified_at IS NOT NULL ORDER BY i.client_notified_at`, [a]) : [],
      admin ? all(`SELECT x.*, c.name client FROM quotes x JOIN clients c ON c.id=x.client_id WHERE x.agency_id=$1 AND x.status='taslak' ORDER BY x.created_at LIMIT 10`, [a]) : [],
      admin ? all(`SELECT i.*, c.name client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 AND i.status='taslak' ORDER BY i.created_at LIMIT 10`, [a]) : [],
      admin ? one(`SELECT count(DISTINCT cs.client_id)::int n FROM client_services cs JOIN services s ON s.id=cs.service_id
        WHERE cs.agency_id=$1 AND cs.status='aktif' AND s.billing='Aylık' AND s.price_try IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.client_id=cs.client_id AND i.period=$2 AND i.status<>'iptal')`, [a, period]) : { n: 0 },
      one(`SELECT count(*)::int n FROM tasks WHERE agency_id=$1 AND assignee_id=$2 AND status='bitti'`, [a, ctx.user.id]),
    ]);
    const fp = admin && forgePending ? await forgePending().catch(() => 0) : 0;
    const d = { sites, tasks, approvals, clients, overdue, notified, draftQuotes, draftInvoices, monthlyDue: md?.n || 0, period, forgePending: fp };
    const acts = buildActions(d, { admin }); const pulse = buildPulse(d);
    const first = ctx.user.name.split(' ')[0];
    const [hero, ...rest] = acts; const pair = rest.slice(0, 2); const later = rest.slice(2);
    const head = !acts.length ? 'Bugün her şey yolunda.' : lang() === 'en' ? `${acts.length} things to do today.` : `Bugün ${acts.length} iş var.`;
    const later_ = later.length ? `<section class="later"><p class="eyebrow">Sonra</p>${later.map(x => `<a class="later-row" href="${h(x.actions[0][1])}"${x.actions[0][3] ? ' target="_blank" rel="noopener"' : ''}><span class="dot ${x.tone}"></span><span class="grow"><strong>${h(x.title)}</strong><span class="muted">${h(x.tag)} · ${h(x.meta)}</span></span><span class="chev" aria-hidden="true">›</span></a>`).join('')}</section>` : '';
    const body = `<div class="today">
<section class="today-main">
<div class="today-head"><div><p class="eyebrow">Günaydın, ${h(first)}</p><h1>${h(head)}</h1><p class="muted lead">${acts.length ? 'En önemlisinden başlayın; biri bitince sıradaki öne gelir.' : 'Bekleyen iş yok. Yeni bir teklif ya da proje başlatabilirsiniz.'}</p></div>
<div class="today-count"><span class="stat">${done.n}</span><span class="muted">tamamladığınız görev</span></div></div>
${hero ? actionCard(hero, h, 'hero') : `<article class="act hero"><h2>Sıra boş</h2><p>Müşterilere bakmak için <a href="/musteriler">Müşteriler</a>'e geçin.</p></article>`}
${pair.length ? `<div class="act-pair">${pair.map(x => actionCard(x, h, 'mid')).join('')}</div>` : ''}
${later_}
</section>
<aside class="pulse card"><h2>Müşteri nabzı</h2>${pulse.slice(0, 8).map(p => `<a class="pulse-row" href="/musteriler/${p.id}"><span class="dot ${p.tone}"></span><span class="grow">${h(p.name)}</span><span class="muted">${h(p.label)}</span></a>`).join('') || '<p class="muted">Aktif müşteri yok.</p>'}
<a class="pulse-all" href="/musteriler">${clients.length} müşterinin tümü</a></aside>
</div>`;
    send(res, 200, layout(ctx, 'Bugün', body, '/panel'));
  };
}

// Müşteri portalı için "Sizden beklenenler".
export async function portalActions({ all, cid, h, fmtMoney }) {
  const [quotes, invoices] = await Promise.all([
    all(`SELECT id, title FROM quotes WHERE client_id=$1 AND status='gonderildi' ORDER BY sent_at`, [cid]),
    all(`SELECT i.id, i.number, i.due_date, i.client_notified_at, i.vat_pct, (SELECT COALESCE(sum(qty*unit_price),0) FROM invoice_items WHERE invoice_id=i.id)::int sub
      FROM invoices i WHERE i.client_id=$1 AND i.status='gonderildi' ORDER BY i.due_date`, [cid]),
  ]);
  const rows = [
    ...invoices.filter(i => !i.client_notified_at).map(i => {
      const late = new Date(i.due_date) < new Date(new Date().toDateString()); const total = Math.round(i.sub * (1 + Number(i.vat_pct) / 100));
      return { tone: late ? 'bad' : 'warn', title: t`${i.number} · ${fmtMoney(total)} TL`, meta: late ? 'Vadesi geçti' : 'Ödeme bekliyor', href: `/portal/faturalar/${i.id}` };
    }),
    ...quotes.map(x => ({ tone: 'warn', title: x.title, meta: 'Teklif · kararınızı bekliyor', href: `/portal/teklifler/${x.id}` })),
  ];
  if (!rows.length) return '';
  return `<section class="later"><p class="eyebrow">Sizden beklenenler</p>${rows.map(r => `<a class="later-row" href="${h(r.href)}"><span class="dot ${r.tone}"></span><span class="grow"><strong>${h(r.title)}</strong><span class="muted">${h(r.meta)}</span></span><span class="chev" aria-hidden="true">›</span></a>`).join('')}</section>`;
}
