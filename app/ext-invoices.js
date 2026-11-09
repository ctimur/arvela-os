// Arvela OS — fatura ve havale takibi. Resmî e-Arşiv/e-Fatura muhasebe yazılımından kesilir; burada takip edilir.
import { translateHtml } from './i18n.js';
const ST = { taslak: 'Taslak', gonderildi: 'Ödeme bekleniyor', odendi: 'Ödendi', iptal: 'İptal' };
const TONE = { taslak: '', gonderildi: 'warn', odendi: 'ok', iptal: 'bad' };
const CUR = { TRY: 'TL', EUR: 'EUR' };

export async function migrateInvoices({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS settings (agency_id INT NOT NULL REFERENCES agencies(id), key TEXT NOT NULL, value TEXT, PRIMARY KEY (agency_id, key))`);
  await q(`CREATE TABLE IF NOT EXISTS invoices (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id),
    number TEXT NOT NULL, period TEXT, quote_id INT REFERENCES quotes(id), currency TEXT NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','EUR')),
    vat_pct NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (vat_pct >= 0 AND vat_pct <= 100), issue_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE NOT NULL DEFAULT CURRENT_DATE + 7,
    status TEXT NOT NULL DEFAULT 'taslak' CHECK (status IN ('taslak','gonderildi','odendi','iptal')), official_no TEXT, notes TEXT,
    sent_at TIMESTAMPTZ, client_notified_at TIMESTAMPTZ, paid_at DATE, paid_amount INT, payment_ref TEXT, created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (agency_id, number))`);
  await q(`CREATE TABLE IF NOT EXISTS invoice_items (id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, service_id INT REFERENCES services(id),
    name TEXT NOT NULL, qty INT NOT NULL DEFAULT 1 CHECK (qty > 0), unit_price INT NOT NULL CHECK (unit_price >= 0), sort INT DEFAULT 0)`);
  await q('CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id, status)');
}

export function invoiceTotals(inv, items) {
  const sub = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const vat = Math.round(sub * Number(inv.vat_pct || 0) / 100);
  return { sub, vat, total: sub + vat };
}
export const isOverdue = (inv, today = new Date()) => inv.status === 'gonderildi' && new Date(inv.due_date) < new Date(today.toDateString());

export function registerInvoices(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, audit, HttpError, int, nn } = d;
  const money = (n, c) => `${fmtMoney(n)} ${CUR[c] || c}`;
  const go = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };
  const send = (res, html) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'",
    });
    res.end(translateHtml(html));
  };
  const dateIn = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';
  const statusBadge = (x) => isOverdue(x) ? badge('Gecikti', 'bad') : badge(ST[x.status], TONE[x.status]);
  const itemsOf = (id) => all('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort, id', [id]);
  async function settingsOf(agencyId) {
    const rows = await all('SELECT key, value FROM settings WHERE agency_id=$1', [agencyId]);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
  async function invoiceFor(ctx, id) {
    const x = await one('SELECT i.*, c.name client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=$1 AND i.agency_id=$2', [id, ctx.user.agency_id]);
    if (!x) throw new HttpError(404, 'Fatura bulunamadı.'); return x;
  }
  async function nextNumber(agencyId, clientId) {
    const y = new Date().getFullYear(); const pre = (await one('SELECT is_demo FROM clients WHERE id=$1', [clientId]).catch(() => null))?.is_demo ? 'DEMO' : 'ARV'; // demo faturalar gerçek sırayı kullanmaz
    const r = await one(`SELECT count(*)::int n FROM invoices WHERE agency_id=$1 AND number LIKE $2`, [agencyId, `${pre}-${y}-%`]);
    return `${pre}-${y}-${String(r.n + 1).padStart(4, '0')}`;
  }
  async function createInvoice(ctx, { clientId, period = null, quoteId = null, currency = 'TRY', items }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const inv = await one(`INSERT INTO invoices (agency_id, client_id, number, period, quote_id, currency, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.user.agency_id, clientId, await nextNumber(ctx.user.agency_id, clientId), period, quoteId, currency, ctx.user.id]);
        for (const [i, it] of items.entries()) {
          await q('INSERT INTO invoice_items (invoice_id, service_id, name, qty, unit_price, sort) VALUES ($1,$2,$3,$4,$5,$6)', [inv.id, it.service_id || null, it.name, it.qty || 1, it.unit_price, i]);
        }
        return inv.id;
      } catch (e) { if (e.code !== '23505' || attempt === 2) throw e; }
    }
  }
  const itemTable = (x, items, editable, f) => `<div class="tbl"><table><tr><th>Kalem</th><th>Adet</th><th>Birim</th><th>Tutar</th>${editable ? '<th></th>' : ''}</tr>
${items.map(i => `<tr><td>${h(i.name)}</td><td>${editable ? `<form class="row" method="post" action="/faturalar/${x.id}/kalem/${i.id}">${f}<input type="number" name="qty" min="1" value="${i.qty}" aria-label="Adet" style="width:72px"><input type="number" name="unit_price" min="0" value="${i.unit_price}" aria-label="Birim fiyat" style="width:120px"><button class="ghost">Kaydet</button></form>` : i.qty}</td>
<td>${money(i.unit_price, x.currency)}</td><td>${money(i.qty * i.unit_price, x.currency)}</td>${editable ? `<td><form class="inline" method="post" action="/faturalar/${x.id}/kalem/${i.id}/sil">${f}<button class="ghost">Çıkar</button></form></td>` : ''}</tr>`).join('') || `<tr><td colspan="${editable ? 5 : 4}" class="muted">Kalem yok.</td></tr>`}</table></div>`;
  const totalsCard = (x, items) => { const t = invoiceTotals(x, items); return `<div class="card" style="gap:8px">
<div class="row" style="justify-content:space-between"><span>Ara toplam</span><span>${money(t.sub, x.currency)}</span></div>
<div class="row" style="justify-content:space-between"><span>KDV %${Number(x.vat_pct)}</span><span>${money(t.vat, x.currency)}</span></div>
<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px"><strong>Toplam</strong><strong>${money(t.total, x.currency)}</strong></div></div>`; };
  const bankCard = (s, x) => s.iban ? `<div class="card"><h3>Havale bilgileri</h3><p style="margin:0;line-height:1.7">${h(s.hesap_adi || '')}<br>${h(s.banka || '')}<br><strong style="font-family:monospace;font-size:15px">${h(s.iban)}</strong></p>
<p class="muted" style="margin:0">Açıklamaya <strong>${h(x.number)}</strong> yazın.</p></div>` : '<div class="card"><p class="muted" style="margin:0">Havale bilgileri henüz girilmedi.</p></div>';

  // ----- yönetici -----
  route('GET', '/faturalar', async (ctx, res) => {
    need(ctx, 'admin'); const a = ctx.user.agency_id; const f = csrfField(ctx);
    const filter = ['taslak', 'gonderildi', 'odendi', 'iptal', 'gecikti'].includes(ctx.url.searchParams.get('durum')) ? ctx.url.searchParams.get('durum') : '';
    const rows = await all(`SELECT i.*, c.name client, COALESCE((SELECT sum(qty*unit_price) FROM invoice_items WHERE invoice_id=i.id),0)::bigint sub FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.agency_id=$1 ORDER BY i.issue_date DESC, i.id DESC LIMIT 500`, [a]);
    const tot = (x) => Number(x.sub) + Math.round(Number(x.sub) * Number(x.vat_pct) / 100);
    const view = rows.filter(x => !filter || (filter === 'gecikti' ? isOverdue(x) : x.status === filter));
    const sumBy = (fn) => rows.filter(fn).filter(x => x.currency === 'TRY').reduce((s, x) => s + tot(x), 0);
    const month = new Date().toISOString().slice(0, 7);
    const pending = sumBy(x => x.status === 'gonderildi'), late = sumBy(x => isOverdue(x)), paid = sumBy(x => x.status === 'odendi' && String(x.paid_at || '').length && new Date(x.paid_at).toISOString().slice(0, 7) === month);
    const clients = await all('SELECT id, name FROM clients WHERE agency_id=$1 ORDER BY name', [a]);
    const approved = await all(`SELECT qt.id, qt.title, c.name client FROM quotes qt JOIN clients c ON c.id=qt.client_id WHERE qt.agency_id=$1 AND qt.status='onaylandi' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=qt.id AND i.status<>'iptal') ORDER BY qt.decided_at DESC`, [a]);
    const stat = (n, t, tone = '') => `<div class="card"><span class="muted">${t}</span><span class="stat"${tone ? ` style="color:${tone}"` : ''}>${fmtMoney(n)} TL</span></div>`;
    const tab = (k, t) => `<a href="/faturalar${k ? `?durum=${k}` : ''}"${filter === k ? ' class="badge warn"' : ' class="badge"'} style="text-decoration:none">${t}</a>`;
    send(res, layout(ctx, 'Faturalar', `<div class="row" style="justify-content:space-between"><h1>Faturalar</h1><a href="/faturalar/ayarlar">Havale bilgileri</a></div>
<p class="muted" style="margin:0">Resmî e-Arşiv / e-Fatura muhasebe yazılımınızdan kesilir; numarasını faturaya yazabilirsiniz. Tutarlar TL toplamlarıdır.</p>
<div class="grid">${stat(pending, 'Ödeme bekleniyor')}${stat(late, 'Gecikmiş', '#7A2418')}${stat(paid, 'Bu ay tahsil edilen', '#24502B')}</div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
<form class="card" method="post" action="/faturalar/aylik">${f}<h3>Aylık faturaları oluştur</h3><p class="muted" style="margin:0">Aktif aylık hizmeti olan her müşteri için teklifte anlaşılan adet ve fiyatla (yoksa katalog fiyatıyla) taslak açılır. O ay için faturası olan müşteri atlanır.</p>
<div class="row"><label>Dönem<input type="month" name="period" value="${month}" required></label><button class="gold">Taslakları oluştur</button></div></form>
<form class="card" method="post" action="/faturalar/tekliften">${f}<h3>Onaylı tekliften</h3>${approved.length ? `<label>Teklif<select name="quote_id">${approved.map(x => `<option value="${x.id}">#${x.id} · ${h(x.title)} · ${h(x.client)}</option>`).join('')}</select></label><div><button class="gold">Fatura taslağı</button></div>` : '<p class="muted" style="margin:0">Faturalanmamış onaylı teklif yok.</p>'}</form>
<form class="card" method="post" action="/faturalar">${f}<h3>Boş fatura</h3><label>Müşteri<select name="client_id">${clients.map(c => `<option value="${c.id}">${h(c.name)}</option>`).join('')}</select></label><div><button class="ghost">Oluştur</button></div></form></div>
<div class="row">${tab('', 'Hepsi')}${tab('taslak', 'Taslak')}${tab('gonderildi', 'Ödeme bekleniyor')}${tab('gecikti', 'Gecikmiş')}${tab('odendi', 'Ödendi')}${tab('iptal', 'İptal')}</div>
<div class="tbl"><table><tr><th>No</th><th>Müşteri</th><th>Dönem</th><th>Toplam</th><th>Vade</th><th>Durum</th></tr>
${view.map(x => `<tr><td><a href="/faturalar/${x.id}">${h(x.number)}</a></td><td>${h(x.client)}</td><td>${h(x.period || '—')}</td><td>${money(tot(x), x.currency)}</td><td>${fmtDate(x.due_date)}</td><td>${statusBadge(x)}${x.client_notified_at && x.status === 'gonderildi' ? ' ' + badge('Müşteri ödedi dedi', 'ok') : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Kayıt yok.</td></tr>'}</table></div>`, '/faturalar'));
  });
  route('POST', '/faturalar', async (ctx, res) => {
    need(ctx, 'admin');
    const c = await one('SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [int(ctx.body.client_id), ctx.user.agency_id]);
    if (!c) throw new HttpError(400, 'Müşteri bulunamadı.');
    const id = await createInvoice(ctx, { clientId: c.id, items: [] });
    await audit(ctx, 'invoice.create', { id }); go(res, `/faturalar/${id}`);
  });
  route('POST', '/faturalar/aylik', async (ctx, res) => {
    need(ctx, 'admin'); const period = String(ctx.body.period || '');
    if (!/^\d{4}-\d{2}$/.test(period)) throw new HttpError(400, 'Dönem geçersiz.');
    // Fiyat: indirimli dönemdeyse indirimli fiyat, yoksa teklifte anlaşılan, o da yoksa katalog. Katalog dışı aylık kalemler de dahil.
    const rows = await all(`SELECT cs.client_id, s.id service_id, COALESCE(s.code || ' · ' || s.name, cs.name) label,
        CASE WHEN cs.promo_until IS NOT NULL AND to_date($2 || '-01', 'YYYY-MM-DD') <= cs.promo_until THEN cs.promo_price ELSE COALESCE(cs.unit_price, s.price_try) END price_try,
        (cs.promo_until IS NOT NULL AND to_date($2 || '-01', 'YYYY-MM-DD') <= cs.promo_until) promo, COALESCE(cs.qty, 1) qty, COALESCE(cs.currency, 'TRY') currency
      FROM client_services cs LEFT JOIN services s ON s.id=cs.service_id
      WHERE cs.agency_id=$1 AND cs.status='aktif' AND COALESCE(s.billing, cs.billing)='Aylık' AND COALESCE(cs.unit_price, s.price_try) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.client_id=cs.client_id AND i.period=$2 AND i.status<>'iptal') ORDER BY cs.client_id, 3`, [ctx.user.agency_id, period]);
    const byClient = new Map();
    for (const r of rows) { const key = `${r.client_id}|${r.currency}`; if (!byClient.has(key)) byClient.set(key, []); byClient.get(key).push({ service_id: r.service_id, name: `${r.label} (${period}${r.promo ? ', indirimli dönem' : ''})`, qty: Number(r.qty) || 1, unit_price: Number(r.price_try) }); }
    for (const [key, items] of byClient) { const [clientId, currency] = key.split('|'); await createInvoice(ctx, { clientId: Number(clientId), period, currency, items }); }
    await audit(ctx, 'invoice.monthly', { period, count: byClient.size });
    go(res, '/faturalar?durum=taslak');
  });
  route('POST', '/faturalar/tekliften', async (ctx, res) => {
    need(ctx, 'admin');
    const x = await one(`SELECT * FROM quotes WHERE id=$1 AND agency_id=$2 AND status='onaylandi'`, [int(ctx.body.quote_id), ctx.user.agency_id]);
    if (!x) throw new HttpError(400, 'Onaylı teklif bulunamadı.');
    const k = 1 - Number(x.discount_pct || 0) / 100;
    const its = await all('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort, id', [x.id]);
    const items = its.map(i => ({ service_id: i.service_id, name: i.billing === 'Aylık' ? `${i.name} (ilk ay)` : i.name, qty: i.qty, unit_price: Math.round(i.unit_price * k * (1 - Math.min(100, Number(i.disc_pct || 0)) / 100)) }));
    const id = await createInvoice(ctx, { clientId: x.client_id, quoteId: x.id, currency: x.currency, items });
    await audit(ctx, 'invoice.from_quote', { id, quote: x.id }); go(res, `/faturalar/${id}`);
  });
  route('GET', '/faturalar/ayarlar', async (ctx, res) => {
    need(ctx, 'admin'); const s = await settingsOf(ctx.user.agency_id);
    send(res, layout(ctx, 'Havale bilgileri', `<div><a href="/faturalar">← Faturalar</a></div><h1>Havale bilgileri</h1>
<form class="card stack" method="post" action="/faturalar/ayarlar" style="max-width:560px">${csrfField(ctx)}<label>Hesap sahibi<input name="hesap_adi" value="${h(s.hesap_adi)}"></label><label>Banka<input name="banka" value="${h(s.banka)}"></label>
<label>IBAN<input name="iban" value="${h(s.iban)}" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></label><p class="muted" style="margin:0">Müşterinin portalında ve fatura sayfasında gösterilir.</p><div><button class="gold">Kaydet</button></div></form>`, '/faturalar'));
  });
  route('POST', '/faturalar/ayarlar', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body;
    const iban = String(b.iban || '').replace(/\s+/g, '').toUpperCase();
    if (iban && !/^TR\d{24}$/.test(iban)) throw new HttpError(400, 'IBAN TR ile başlamalı ve 26 karakter olmalı.');
    for (const [k, v] of [['hesap_adi', nn(b.hesap_adi)], ['banka', nn(b.banka)], ['iban', iban ? iban.replace(/(.{4})/g, '$1 ').trim() : null]]) {
      await q('INSERT INTO settings (agency_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (agency_id, key) DO UPDATE SET value=EXCLUDED.value', [ctx.user.agency_id, k, v]);
    }
    await audit(ctx, 'settings.bank', {}); go(res, '/faturalar/ayarlar');
  });
  route('GET', '/faturalar/:id', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await invoiceFor(ctx, int(p.id)); const items = await itemsOf(x.id); const f = csrfField(ctx);
    const editable = x.status === 'taslak'; const s = await settingsOf(ctx.user.agency_id); const t = invoiceTotals(x, items);
    send(res, layout(ctx, x.number, `<div><a href="/faturalar">← Faturalar</a> · <a href="/musteriler/${x.client_id}">${h(x.client)}</a></div>
<div class="row" style="justify-content:space-between"><h1>${h(x.number)}</h1>${statusBadge(x)}</div>
${x.client_notified_at && x.status === 'gonderildi' ? `<div class="flash">Müşteri ${fmtDate(x.client_notified_at)} tarihinde ödemeyi yaptığını bildirdi. Hesabı kontrol edip "Ödendi" olarak işaretleyin.</div>` : ''}
<div class="row" style="align-items:flex-start;gap:16px">
<section class="card" style="flex:2 1 520px;min-width:0"><h2>Kalemler</h2>${itemTable(x, items, editable, f)}
${editable ? `<form class="row" method="post" action="/faturalar/${x.id}/kalem">${f}<label style="flex:1;min-width:220px">Kalem<input name="name" required></label><label>Adet<input type="number" name="qty" min="1" value="1" style="width:72px"></label><label>Birim fiyat<input type="number" name="unit_price" min="0" required style="width:120px"></label><button class="ghost">Ekle</button></form>` : ''}</section>
<section style="flex:1 1 300px;display:flex;flex-direction:column;gap:16px">${totalsCard(x, items)}
${editable ? `<form class="card" method="post" action="/faturalar/${x.id}/ayar">${f}<h3>Ayarlar</h3><div class="row"><label>Düzenleme<input type="date" name="issue_date" value="${dateIn(x.issue_date)}"></label><label>Vade<input type="date" name="due_date" value="${dateIn(x.due_date)}"></label></div>
<label>KDV (%)<input type="number" name="vat_pct" min="0" max="100" step="1" value="${Number(x.vat_pct)}"></label><label>Resmî fatura no<input name="official_no" value="${h(x.official_no)}"></label><label>Not<textarea name="notes" rows="2">${h(x.notes)}</textarea></label><button class="ghost">Kaydet</button></form>
${s.iban ? '' : '<p class="err" style="margin:0">Havale bilgisi (IBAN) girilmemiş; müşteri nereye ödeyeceğini göremez. <a href="/faturalar/ayarlar">Havale bilgilerini girin</a>.</p>'}<form method="post" action="/faturalar/${x.id}/gonder">${f}<button class="gold" style="width:100%"${items.length && t.total > 0 && s.iban ? '' : ' disabled'}>Müşteriye gönder</button></form>` : ''}
${x.status === 'gonderildi' ? `<form class="card" method="post" action="/faturalar/${x.id}/odendi">${f}<h3>Ödemeyi kaydet</h3><div class="row"><label>Tarih<input type="date" name="paid_at" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Tutar<input type="number" name="paid_amount" min="0" value="${t.total}" required style="width:130px"></label></div>
<label>Havale açıklaması / dekont<input name="payment_ref" placeholder="${h(x.number)}"></label><button class="gold">Ödendi olarak işaretle</button></form>` : ''}
${x.status === 'odendi' ? `<div class="card"><h3>Ödeme</h3><p style="margin:0">${fmtDate(x.paid_at)} · ${money(x.paid_amount, x.currency)}${x.payment_ref ? ` · ${h(x.payment_ref)}` : ''}</p>${x.paid_amount !== t.total ? `<p class="err" style="margin:0">Fatura toplamı ${money(t.total, x.currency)}; fark ${money(t.total - x.paid_amount, x.currency)}.</p>` : ''}</div>` : ''}
${x.status === 'gonderildi' ? bankCard(s, x) : ''}
${['taslak', 'gonderildi'].includes(x.status) ? `<form method="post" action="/faturalar/${x.id}/iptal">${f}<button class="ghost" style="width:100%">Faturayı iptal et</button></form>` : ''}</section></div>`, '/faturalar'));
  });
  const draft = async (ctx, id) => { const x = await invoiceFor(ctx, id); if (x.status !== 'taslak') throw new HttpError(400, 'Yalnız taslak fatura değiştirilebilir.'); return x; };
  route('POST', '/faturalar/:id/kalem', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const price = int(ctx.body.unit_price);
    if (!nn(ctx.body.name) || price == null || price < 0) throw new HttpError(400, 'Kalem adı ve fiyat gerekli.');
    await q('INSERT INTO invoice_items (invoice_id, name, qty, unit_price, sort) VALUES ($1,$2,$3,$4,999)', [x.id, nn(ctx.body.name), Math.max(1, int(ctx.body.qty) || 1), price]); go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/kalem/:kid', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const qty = int(ctx.body.qty), price = int(ctx.body.unit_price);
    if (!qty || qty < 1 || price == null || price < 0) throw new HttpError(400, 'Adet ve fiyat geçersiz.');
    await q('UPDATE invoice_items SET qty=$1, unit_price=$2 WHERE id=$3 AND invoice_id=$4', [qty, price, int(p.kid), x.id]); go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/kalem/:kid/sil', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id));
    await q('DELETE FROM invoice_items WHERE id=$1 AND invoice_id=$2', [int(p.kid), x.id]); go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/ayar', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const b = ctx.body;
    const vat = Math.min(100, Math.max(0, Number(b.vat_pct) || 0));
    await q('UPDATE invoices SET issue_date=COALESCE($1, issue_date), due_date=COALESCE($2, due_date), vat_pct=$3, official_no=$4, notes=$5 WHERE id=$6', [nn(b.issue_date), nn(b.due_date), vat, nn(b.official_no), nn(b.notes), x.id]);
    go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/gonder', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id));
    if (invoiceTotals(x, await itemsOf(x.id)).total <= 0) throw new HttpError(400, 'Tutarı sıfır olan fatura gönderilemez.');
    if (!(await settingsOf(ctx.user.agency_id)).iban) throw new HttpError(400, 'Önce havale bilgilerini (IBAN) girin: Faturalar › Havale bilgileri. Müşteri ödemeyi bu hesaba yapar.');
    await q(`UPDATE invoices SET status='gonderildi', sent_at=now() WHERE id=$1`, [x.id]);
    await audit(ctx, 'invoice.send', { id: x.id }); go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/odendi', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await invoiceFor(ctx, int(p.id)); const amt = int(ctx.body.paid_amount);
    if (x.status !== 'gonderildi') throw new HttpError(400, 'Yalnız ödeme bekleyen fatura ödendi yapılabilir.');
    if (amt == null || amt < 0 || !nn(ctx.body.paid_at)) throw new HttpError(400, 'Tarih ve tutar gerekli.');
    await q(`UPDATE invoices SET status='odendi', paid_at=$1, paid_amount=$2, payment_ref=$3 WHERE id=$4`, [nn(ctx.body.paid_at), amt, nn(ctx.body.payment_ref), x.id]);
    await audit(ctx, 'invoice.paid', { id: x.id, amount: amt }); go(res, `/faturalar/${x.id}`);
  });
  route('POST', '/faturalar/:id/iptal', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await invoiceFor(ctx, int(p.id));
    if (!['taslak', 'gonderildi'].includes(x.status)) throw new HttpError(400, 'Bu fatura iptal edilemez.');
    await q(`UPDATE invoices SET status='iptal' WHERE id=$1`, [x.id]);
    await audit(ctx, 'invoice.cancel', { id: x.id }); go(res, `/faturalar/${x.id}`);
  });

  // ----- müşteri portalı -----
  route('GET', '/portal/faturalar', async (ctx, res) => {
    need(ctx, 'client');
    const rows = await all(`SELECT i.*, COALESCE((SELECT sum(qty*unit_price) FROM invoice_items WHERE invoice_id=i.id),0)::bigint sub FROM invoices i WHERE i.client_id=$1 AND i.status IN ('gonderildi','odendi') ORDER BY (i.status<>'gonderildi'), i.due_date DESC`, [ctx.user.client_id]);
    const tot = (x) => Number(x.sub) + Math.round(Number(x.sub) * Number(x.vat_pct) / 100);
    const due = rows.filter(x => x.status === 'gonderildi'); const byCur = {};
    due.forEach(x => { byCur[x.currency] = (byCur[x.currency] || 0) + tot(x); });
    send(res, layout(ctx, 'Faturalarım', `<h1>Faturalarınız</h1>
<div class="card"><span class="muted">Ödenecek toplam</span><span class="stat">${Object.keys(byCur).length ? Object.entries(byCur).map(([c, n]) => money(n, c)).join(' + ') : '0 TL'}</span>${due.some(x => isOverdue(x)) ? '<span class="badge bad" style="align-self:flex-start">Vadesi geçmiş fatura var</span>' : ''}</div>
<div class="tbl"><table><tr><th>No</th><th>Dönem</th><th>Toplam</th><th>Vade</th><th>Durum</th></tr>
${rows.map(x => `<tr><td><a href="/portal/faturalar/${x.id}">${h(x.number)}</a></td><td>${h(x.period || '—')}</td><td>${money(tot(x), x.currency)}</td><td>${fmtDate(x.due_date)}</td><td>${statusBadge(x)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Fatura yok.</td></tr>'}</table></div>`, '/portal/faturalar'));
  });
  route('GET', '/portal/faturalar/:id', async (ctx, res, p) => {
    need(ctx, 'client');
    const x = await one(`SELECT * FROM invoices WHERE id=$1 AND client_id=$2 AND status IN ('gonderildi','odendi')`, [int(p.id), ctx.user.client_id]);
    if (!x) throw new HttpError(404, 'Fatura bulunamadı.');
    const items = await itemsOf(x.id); const s = await settingsOf(x.agency_id); const f = csrfField(ctx);
    send(res, layout(ctx, x.number, `<div><a href="/portal/faturalar">← Faturalarım</a></div>
<div class="row" style="justify-content:space-between"><h1>${h(x.number)}</h1>${statusBadge(x)}</div>
<p class="muted" style="margin:0">Düzenleme ${fmtDate(x.issue_date)} · Vade ${fmtDate(x.due_date)}${x.official_no ? ` · Resmî fatura no ${h(x.official_no)}` : ''}</p>
${itemTable(x, items, false, f)}${totalsCard(x, items)}
${x.status === 'gonderildi' ? `${bankCard(s, x)}${x.client_notified_at ? `<div class="flash">${fmtDate(x.client_notified_at)} tarihinde ödeme bildiriminiz alındı; kontrol edip onaylayacağız.</div>` : `<form method="post" action="/portal/faturalar/${x.id}/bildir">${f}<button class="gold">Ödemeyi yaptım</button></form>`}` : `<div class="flash">${fmtDate(x.paid_at)} tarihinde ödendi. Teşekkür ederiz.</div>`}`, '/portal/faturalar'));
  });
  route('POST', '/portal/faturalar/:id/bildir', async (ctx, res, p) => {
    need(ctx, 'client');
    const x = await one(`UPDATE invoices SET client_notified_at=now() WHERE id=$1 AND client_id=$2 AND status='gonderildi' AND client_notified_at IS NULL RETURNING id`, [int(p.id), ctx.user.client_id]);
    if (!x) throw new HttpError(404, 'Fatura bulunamadı ya da bildirim zaten yapıldı.');
    await audit(ctx, 'invoice.client_notified', { id: x.id }); go(res, `/portal/faturalar/${x.id}`);
  });
}
