// Arvela OS — teklif modülü: katalogdan kalem, TL/EUR, indirim, toplamlar, müşteri onayı.
const ST = { taslak: 'Taslak', gonderildi: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' };
const TONE = { taslak: '', gonderildi: 'warn', onaylandi: 'ok', reddedildi: 'bad' };
const CUR = { TRY: 'TL', EUR: 'EUR' };
const MONTHLY = 'Aylık';

export async function migrateQuotes({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS quotes (id SERIAL PRIMARY KEY, agency_id INT NOT NULL REFERENCES agencies(id), client_id INT NOT NULL REFERENCES clients(id),
    title TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','EUR')), discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    status TEXT NOT NULL DEFAULT 'taslak' CHECK (status IN ('taslak','gonderildi','onaylandi','reddedildi')), valid_until DATE, notes TEXT,
    created_by INT REFERENCES users(id), sent_at TIMESTAMPTZ, decided_at TIMESTAMPTZ, decided_by INT REFERENCES users(id), comment TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS quote_items (id SERIAL PRIMARY KEY, quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, service_id INT REFERENCES services(id),
    name TEXT NOT NULL, billing TEXT, unit TEXT, qty INT NOT NULL DEFAULT 1 CHECK (qty > 0), unit_price INT NOT NULL CHECK (unit_price >= 0), sort INT DEFAULT 0)`);
}

export function totals(quote, items) {
  const sum = (f) => items.filter(f).reduce((a, i) => a + i.qty * i.unit_price, 0);
  const k = 1 - Number(quote.discount_pct || 0) / 100;
  const once = sum(i => i.billing !== MONTHLY), monthly = sum(i => i.billing === MONTHLY);
  const r = (n) => Math.round(n * k);
  return { onceList: once, monthlyList: monthly, once: r(once), monthly: r(monthly), year: r(once + 12 * monthly), yearList: once + 12 * monthly };
}

export function registerQuotes(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, fmtMoney, csrfField, audit, HttpError, int, nn } = d;
  const money = (n, c) => `${fmtMoney(n)} ${CUR[c]}`;
  const go = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };
  const send = (res, html) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'",
    });
    res.end(html);
  };
  async function quoteFor(ctx, id) {
    const x = await one('SELECT qt.*, c.name client FROM quotes qt JOIN clients c ON c.id=qt.client_id WHERE qt.id=$1 AND qt.agency_id=$2', [id, ctx.user.agency_id]);
    if (!x) throw new HttpError(404, 'Teklif bulunamadı.'); return x;
  }
  const itemsOf = (id) => all('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort, id', [id]);

  function summary(x, items) {
    const t = totals(x, items); const c = x.currency; const disc = Number(x.discount_pct) > 0;
    const line = (label, val, list) => `<div class="row" style="justify-content:space-between"><span>${label}</span><span><strong>${money(val, c)}</strong>${disc && list !== val ? ` <s class="muted">${money(list, c)}</s>` : ''}</span></div>`;
    return `<div class="card" style="gap:8px">${line('Tek seferlik', t.once, t.onceList)}${line('Aylık', t.monthly, t.monthlyList)}
<div style="border-top:1px solid var(--line);padding-top:8px">${line('İlk yıl toplamı', t.year, t.yearList)}</div>
${disc ? `<p class="muted" style="margin:0">%${Number(x.discount_pct)} indirim uygulandı. Fiyatlar KDV hariçtir.</p>` : '<p class="muted" style="margin:0">Fiyatlar KDV hariçtir.</p>'}</div>`;
  }
  const itemTable = (x, items, editable, f) => `<div class="tbl"><table><tr><th>Kalem</th><th>Faturalama</th><th>Adet</th><th>Birim fiyat</th><th>Tutar</th>${editable ? '<th></th>' : ''}</tr>
${items.map(i => `<tr><td>${h(i.name)}</td><td>${h(i.billing || '')}${i.unit ? ` · ${h(i.unit)}` : ''}</td>
<td>${editable ? `<form class="row" method="post" action="/teklifler/${x.id}/kalem/${i.id}">${f}<input type="number" name="qty" min="1" value="${i.qty}" aria-label="Adet" style="width:80px"><input type="number" name="unit_price" min="0" value="${i.unit_price}" aria-label="Birim fiyat" style="width:120px"><button class="ghost">Kaydet</button></form>` : i.qty}</td>
<td>${money(i.unit_price, x.currency)}</td><td>${money(i.qty * i.unit_price, x.currency)}</td>
${editable ? `<td><form class="inline" method="post" action="/teklifler/${x.id}/kalem/${i.id}/sil">${f}<button class="ghost">Çıkar</button></form></td>` : ''}</tr>`).join('') || `<tr><td colspan="${editable ? 6 : 5}" class="muted">Henüz kalem yok.</td></tr>`}</table></div>`;

  // ----- ajans tarafı (yalnız yönetici: fiyatlar burada) -----
  route('GET', '/teklifler', async (ctx, res) => {
    need(ctx, 'admin');
    const rows = await all(`SELECT qt.*, c.name client FROM quotes qt JOIN clients c ON c.id=qt.client_id WHERE qt.agency_id=$1 ORDER BY qt.created_at DESC LIMIT 300`, [ctx.user.agency_id]);
    const its = rows.length ? await all('SELECT * FROM quote_items WHERE quote_id = ANY($1)', [rows.map(r => r.id)]) : [];
    const clients = await all(`SELECT id, name FROM clients WHERE agency_id=$1 ORDER BY name`, [ctx.user.agency_id]);
    send(res, layout(ctx, 'Teklifler', `<h1>Teklifler</h1>
<details class="card"${rows.length ? '' : ' open'}><summary>Yeni teklif</summary><form class="row" method="post" action="/teklifler">${csrfField(ctx)}
<label>Müşteri<select name="client_id" required>${clients.map(c => `<option value="${c.id}">${h(c.name)}</option>`).join('')}</select></label>
<label style="flex:1;min-width:220px">Başlık<input name="title" required placeholder="Web sitesi ve bakım"></label>
<label>Para birimi<select name="currency"><option value="TRY">TL</option><option value="EUR">EUR</option></select></label><button class="gold">Oluştur</button></form></details>
<div class="tbl"><table><tr><th>Teklif</th><th>Müşteri</th><th>Durum</th><th>İlk yıl</th><th>Tarih</th></tr>
${rows.map(x => { const t = totals(x, its.filter(i => i.quote_id === x.id)); return `<tr><td><a href="/teklifler/${x.id}">#${x.id} · ${h(x.title)}</a></td><td>${h(x.client)}</td><td>${badge(ST[x.status], TONE[x.status])}</td><td>${money(t.year, x.currency)}</td><td>${fmtDate(x.sent_at || x.created_at)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Henüz teklif yok.</td></tr>'}</table></div>`, '/teklifler'));
  });
  route('POST', '/teklifler', async (ctx, res) => {
    need(ctx, 'admin'); const b = ctx.body;
    const c = await one('SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [int(b.client_id), ctx.user.agency_id]);
    if (!c || !nn(b.title)) throw new HttpError(400, 'Müşteri ve başlık gerekli.');
    const r = await one(`INSERT INTO quotes (agency_id, client_id, title, currency, created_by, valid_until) VALUES ($1,$2,$3,$4,$5, CURRENT_DATE + 14) RETURNING id`,
      [ctx.user.agency_id, c.id, nn(b.title), CUR[b.currency] ? b.currency : 'TRY', ctx.user.id]);
    await audit(ctx, 'quote.create', { id: r.id, client: c.id }); go(res, `/teklifler/${r.id}`);
  });
  route('GET', '/teklifler/:id', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await quoteFor(ctx, int(p.id)); const items = await itemsOf(x.id); const f = csrfField(ctx);
    const editable = x.status === 'taslak';
    const svcs = editable ? await all(`SELECT s.id, s.code, s.name, s.billing, s.price_try, s.price_eur, sc.name cat FROM services s JOIN service_categories sc ON sc.id=s.category_id WHERE s.agency_id=$1 AND s.active ORDER BY sc.sort, s.code`, [ctx.user.agency_id]) : [];
    const priceOf = (s) => x.currency === 'EUR' ? s.price_eur : s.price_try;
    send(res, layout(ctx, `Teklif #${x.id}`, `<div><a href="/teklifler">← Teklifler</a> · <a href="/musteriler/${x.client_id}">${h(x.client)}</a></div>
<div class="row" style="justify-content:space-between"><h1>#${x.id} · ${h(x.title)}</h1>${badge(ST[x.status], TONE[x.status])}</div>
${x.status === 'reddedildi' && x.comment ? `<div class="err">Müşteri notu: ${h(x.comment)}</div>` : ''}${x.status === 'onaylandi' ? `<div class="flash">${fmtDate(x.decided_at)} tarihinde onaylandı; hizmetler müşteriye "Kurulumda" olarak eklendi.${x.comment ? ` Not: ${h(x.comment)}` : ''}</div>` : ''}
<div class="row" style="align-items:flex-start;gap:16px">
<section class="card" style="flex:2 1 520px;min-width:0"><h2>Kalemler</h2>${itemTable(x, items, editable, f)}
${editable ? `<form class="row" method="post" action="/teklifler/${x.id}/kalem">${f}<label style="flex:1;min-width:280px">Katalogdan modül<select name="service_id" required>${svcs.filter(s => priceOf(s) != null).map(s => `<option value="${s.id}">${h(s.cat)} — ${h(s.code)} ${h(s.name)} (${money(priceOf(s), x.currency)}${s.billing === MONTHLY ? '/ay' : ''})</option>`).join('')}</select></label>
<label>Adet<input type="number" name="qty" min="1" value="1" style="width:80px"></label><button class="gold">Ekle</button></form>
<form class="row" method="post" action="/teklifler/${x.id}/ozel">${f}<label style="flex:1;min-width:220px">Özel kalem<input name="name" required placeholder="Kataloğa girmeyen iş"></label>
<label>Faturalama<select name="billing"><option>Tek seferlik</option><option>Aylık</option></select></label><label>Fiyat<input type="number" name="unit_price" min="0" required style="width:120px"></label><button class="ghost">Ekle</button></form>` : ''}</section>
<section style="flex:1 1 280px;display:flex;flex-direction:column;gap:16px">${summary(x, items)}
${editable ? `<form class="card" method="post" action="/teklifler/${x.id}/ayar">${f}<h3>Ayarlar</h3><label>Başlık<input name="title" value="${h(x.title)}" required></label>
<label>İndirim (%)<input type="number" name="discount_pct" min="0" max="100" step="0.5" value="${Number(x.discount_pct)}"></label>
<label>Geçerlilik<input type="date" name="valid_until" value="${x.valid_until ? new Date(x.valid_until).toISOString().slice(0, 10) : ''}"></label>
<label>Müşteriye not<textarea name="notes" rows="3">${h(x.notes)}</textarea></label><button class="ghost">Kaydet</button></form>
<form method="post" action="/teklifler/${x.id}/gonder">${f}<button class="gold" style="width:100%"${items.length ? '' : ' disabled'}>Müşteriye gönder</button></form>
<p class="muted" style="margin:0">Gönderilen teklif müşterinin portalında görünür; gönderdikten sonra değiştirilemez.</p>` : x.status === 'gonderildi' ? `<form method="post" action="/teklifler/${x.id}/geri">${f}<button class="ghost" style="width:100%">Geri çek ve düzenle</button></form>` : ''}
${x.status !== 'taslak' ? `<form method="post" action="/teklifler/${x.id}/kopya">${f}<button class="ghost" style="width:100%">Kopyasını oluştur</button></form>` : ''}</section></div>`, '/teklifler'));
  });
  const draft = async (ctx, id) => { const x = await quoteFor(ctx, id); if (x.status !== 'taslak') throw new HttpError(400, 'Yalnız taslak teklif değiştirilebilir.'); return x; };
  route('POST', '/teklifler/:id/kalem', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id));
    const s = await one('SELECT * FROM services WHERE id=$1 AND agency_id=$2', [int(ctx.body.service_id), ctx.user.agency_id]);
    const price = s && (x.currency === 'EUR' ? s.price_eur : s.price_try);
    if (!s || price == null) throw new HttpError(400, 'Bu modülün bu para biriminde fiyatı yok.');
    await q('INSERT INTO quote_items (quote_id, service_id, name, billing, unit, qty, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [x.id, s.id, `${s.code} · ${s.name}`, s.billing, s.unit, Math.max(1, int(ctx.body.qty) || 1), price]);
    go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/ozel', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const price = int(ctx.body.unit_price);
    if (!nn(ctx.body.name) || price == null || price < 0) throw new HttpError(400, 'Kalem adı ve fiyat gerekli.');
    await q('INSERT INTO quote_items (quote_id, name, billing, qty, unit_price) VALUES ($1,$2,$3,1,$4)', [x.id, nn(ctx.body.name), ctx.body.billing === MONTHLY ? MONTHLY : 'Tek seferlik', price]);
    go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/kalem/:kid', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const qty = int(ctx.body.qty); const price = int(ctx.body.unit_price);
    if (!qty || qty < 1 || price == null || price < 0) throw new HttpError(400, 'Adet ve fiyat geçersiz.');
    await q('UPDATE quote_items SET qty=$1, unit_price=$2 WHERE id=$3 AND quote_id=$4', [qty, price, int(p.kid), x.id]); go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/kalem/:kid/sil', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id));
    await q('DELETE FROM quote_items WHERE id=$1 AND quote_id=$2', [int(p.kid), x.id]); go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/ayar', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id)); const b = ctx.body;
    const disc = Math.min(100, Math.max(0, Number(b.discount_pct) || 0));
    await q('UPDATE quotes SET title=$1, discount_pct=$2, valid_until=$3, notes=$4 WHERE id=$5', [nn(b.title) || x.title, disc, nn(b.valid_until), nn(b.notes), x.id]);
    go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/gonder', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await draft(ctx, int(p.id));
    if (!(await itemsOf(x.id)).length) throw new HttpError(400, 'Kalemsiz teklif gönderilemez.');
    await q(`UPDATE quotes SET status='gonderildi', sent_at=now() WHERE id=$1`, [x.id]);
    await audit(ctx, 'quote.send', { id: x.id, client: x.client_id }); go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/geri', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await quoteFor(ctx, int(p.id));
    if (x.status !== 'gonderildi') throw new HttpError(400, 'Yalnız onay bekleyen teklif geri çekilebilir.');
    await q(`UPDATE quotes SET status='taslak', sent_at=NULL WHERE id=$1`, [x.id]);
    await audit(ctx, 'quote.withdraw', { id: x.id }); go(res, `/teklifler/${x.id}`);
  });
  route('POST', '/teklifler/:id/kopya', async (ctx, res, p) => {
    need(ctx, 'admin'); const x = await quoteFor(ctx, int(p.id));
    const r = await one(`INSERT INTO quotes (agency_id, client_id, title, currency, discount_pct, notes, created_by, valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE + 14) RETURNING id`,
      [x.agency_id, x.client_id, `${x.title} (kopya)`, x.currency, x.discount_pct, x.notes, ctx.user.id]);
    await q('INSERT INTO quote_items (quote_id, service_id, name, billing, unit, qty, unit_price, sort) SELECT $1, service_id, name, billing, unit, qty, unit_price, sort FROM quote_items WHERE quote_id=$2', [r.id, x.id]);
    await audit(ctx, 'quote.copy', { from: x.id, id: r.id }); go(res, `/teklifler/${r.id}`);
  });

  // ----- müşteri portalı -----
  route('GET', '/portal/teklifler', async (ctx, res) => {
    need(ctx, 'client');
    const rows = await all(`SELECT * FROM quotes WHERE client_id=$1 AND status<>'taslak' ORDER BY (status<>'gonderildi'), sent_at DESC`, [ctx.user.client_id]);
    send(res, layout(ctx, 'Tekliflerim', `<h1>Teklifleriniz</h1><div class="tbl"><table><tr><th>Teklif</th><th>Durum</th><th>Tarih</th><th>Geçerlilik</th></tr>
${rows.map(x => `<tr><td><a href="/portal/teklifler/${x.id}">#${x.id} · ${h(x.title)}</a></td><td>${badge(ST[x.status], TONE[x.status])}</td><td>${fmtDate(x.sent_at)}</td><td>${fmtDate(x.valid_until)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Henüz teklif yok.</td></tr>'}</table></div>`, '/portal/teklifler'));
  });
  route('GET', '/portal/teklifler/:id', async (ctx, res, p) => {
    need(ctx, 'client');
    const x = await one(`SELECT * FROM quotes WHERE id=$1 AND client_id=$2 AND status<>'taslak'`, [int(p.id), ctx.user.client_id]);
    if (!x) throw new HttpError(404, 'Teklif bulunamadı.');
    const items = await itemsOf(x.id); const f = csrfField(ctx);
    const expired = x.valid_until && new Date(x.valid_until) < new Date(new Date().toDateString());
    send(res, layout(ctx, `Teklif #${x.id}`, `<div><a href="/portal/teklifler">← Tekliflerim</a></div>
<div class="row" style="justify-content:space-between"><h1>#${x.id} · ${h(x.title)}</h1>${badge(ST[x.status], TONE[x.status])}</div>
${x.notes ? `<div class="card"><p style="margin:0;white-space:pre-wrap">${h(x.notes)}</p></div>` : ''}
${itemTable(x, items, false, f)}${summary(x, items)}
${x.status === 'gonderildi' ? (expired ? `<div class="err">Bu teklifin geçerlilik süresi ${fmtDate(x.valid_until)} tarihinde doldu. Güncel teklif için bize yazın.</div>` : `<form class="card" method="post" action="/portal/teklifler/${x.id}/karar">${f}<h2>Kararınız</h2>
<p class="muted" style="margin:0">Geçerlilik: ${fmtDate(x.valid_until)}. Onayladığınızda ekibimiz kurulum için sizinle iletişime geçer.</p>
<label>Notunuz (isteğe bağlı)<textarea name="comment" rows="2"></textarea></label>
<div class="row"><button class="gold" name="decision" value="onaylandi">Teklifi onayla</button><button class="ghost" name="decision" value="reddedildi">Değişiklik iste</button></div></form>`) : ''}`, '/portal/teklifler'));
  });
  route('POST', '/portal/teklifler/:id/karar', async (ctx, res, p) => {
    need(ctx, 'client');
    const dcs = ['onaylandi', 'reddedildi'].includes(ctx.body.decision) ? ctx.body.decision : null;
    if (!dcs) throw new HttpError(400, 'Karar geçersiz.');
    const x = await one(`UPDATE quotes SET status=$1, comment=$2, decided_by=$3, decided_at=now() WHERE id=$4 AND client_id=$5 AND status='gonderildi'
      AND (valid_until IS NULL OR valid_until >= CURRENT_DATE) RETURNING *`, [dcs, nn(ctx.body.comment), ctx.user.id, int(p.id), ctx.user.client_id]);
    if (!x) throw new HttpError(404, 'Teklif bulunamadı, süresi dolmuş ya da zaten karar verilmiş.');
    if (dcs === 'onaylandi') {
      for (const i of await itemsOf(x.id)) {
        if (i.service_id) await q(`INSERT INTO client_services (agency_id, client_id, service_id, status, notes) VALUES ($1,$2,$3,'kurulum',$4)`, [x.agency_id, x.client_id, i.service_id, `Teklif #${x.id} ile onaylandı`]);
      }
    }
    await audit(ctx, 'quote.decide', { id: x.id, decision: dcs }); go(res, `/portal/teklifler/${x.id}`);
  });
}
