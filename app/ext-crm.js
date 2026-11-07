// Arvela OS — satış hattı: adaylar, aşamalar, 15 dk ön görüşme, sonraki adım ve iletişim geçmişi.
// Aday, durumu "lead" olan müşteri kaydıdır; kazanılınca aynı kayıt aktif müşteriye döner (geçmiş korunur).
import { t } from './i18n.js';

export const STAGES = { yeni: 'Yeni', ulasildi: 'Ulaşıldı', gorusme: 'Ön görüşme', teklif: 'Teklif', kazanildi: 'Kazanıldı', kaybedildi: 'Kaybedildi' };
export const OPEN_STAGES = ['yeni', 'ulasildi', 'gorusme', 'teklif'];
export const SOURCES = { web: 'Web formu', whatsapp: 'WhatsApp', referans: 'Referans', sosyal: 'Sosyal medya', outbound: 'Kişisel ulaşım', etkinlik: 'Etkinlik', diger: 'Diğer' };
export const KINDS = { not: 'Not', arama: 'Arama', whatsapp: 'WhatsApp', eposta: 'E-posta', gorusme: 'Görüşme' };
const STAGE_TONE = { yeni: 'warn', ulasildi: '', gorusme: 'warn', teklif: 'warn', kazanildi: 'ok', kaybedildi: '' };

// Basit ve açıklanabilir aday puanı (0–100): kaynak, ilgi ve iletişim bilgisi.
export function leadScore(x) {
  let s = 20;
  if (x.lead_source === 'referans') s += 30; else if (x.lead_source === 'web') s += 20; else if (x.lead_source === 'whatsapp') s += 20; else if (x.lead_source === 'sosyal') s += 10;
  if (x.phone) s += 15; if (x.email) s += 5; if (x.sector) s += 5;
  if (x.call_at) s += 15; if (x.stage === 'teklif') s += 10;
  if (Number(x.value_estimate) >= 15000) s += 10;
  return Math.max(0, Math.min(100, s));
}
export const scoreTone = (n) => n >= 70 ? 'ok' : n >= 45 ? 'warn' : '';
export function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1); if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return /^\d{11,15}$/.test(d) ? `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}` : null;
}
const dtVal = (d) => { if (!d) return ''; const x = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
// datetime-local değeri İstanbul saatidir (+03:00, yaz saati yok).
export const dtParse = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '') ? new Date(v + ':00+03:00').toISOString() : null;
const fmtDT = (d) => d ? new Date(d).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '—';

export async function migrateCrm({ q }) {
  for (const col of ['stage TEXT', 'lead_source TEXT', 'lead_score INT', 'next_action TEXT', 'next_action_at TIMESTAMPTZ', 'call_at TIMESTAMPTZ', 'lost_reason TEXT', 'value_estimate INT', 'owner_id INT REFERENCES users(id)', 'interest TEXT', 'won_at TIMESTAMPTZ', 'marketing_consent_at TIMESTAMPTZ', 'marketing_consent_source TEXT'])
    await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col}`);
  await q(`UPDATE clients SET stage='yeni' WHERE status='lead' AND stage IS NULL`);
  await q(`CREATE TABLE IF NOT EXISTS client_notes (id SERIAL PRIMARY KEY, client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, user_id INT REFERENCES users(id),
    kind TEXT NOT NULL DEFAULT 'not', body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
}

// Bugün sayfası için satış aksiyonları (saf fonksiyon).
export function crmActions(leads, now = Date.now()) {
  const out = [];
  for (const l of leads) {
    const callIn = l.call_at ? (new Date(l.call_at) - now) / 60000 : null;
    const age = (now - new Date(l.created_at)) / 60000;
    const tel = l.phone ? `tel:${String(l.phone).replace(/[^+\d]/g, '')}` : null;
    if (callIn !== null && callIn > -60 && callIn < 24 * 60) {
      out.push({ score: callIn < 30 ? 95 : 72, tone: 'warn', tag: 'Ön görüşme', meta: t`${l.name} · ${fmtDT(l.call_at)}`, title: t`${l.contact_name || l.name} ile 15 dk ön görüşme`,
        body: l.interest ? t`İlgi: ${l.interest}` : '', actions: [['Adayı aç', `/satis/${l.id}`, 'pri'], ...(tel ? [['Telefonla ara', tel, 'sec']] : [])] });
    } else if (l.stage === 'yeni' && age < 24 * 60) {
      out.push({ score: age < 15 ? 93 : 78, tone: 'bad', tag: 'Sıcak aday', meta: t`${SOURCES[l.lead_source] || 'Aday'} · ${Math.round(age)} dk önce`, title: t`${l.name} size ulaştı`,
        body: 'Mesai içinde 15 dakika içinde dönün; ön görüşme saati önerin.', actions: [...(tel ? [['Telefonla ara', tel, 'pri']] : []), ['Adayı aç', `/satis/${l.id}`, tel ? 'sec' : 'pri']] });
    } else if (l.next_action_at && new Date(l.next_action_at) <= now) {
      out.push({ score: 62, tone: 'warn', tag: 'Satış', meta: t`${l.name} · ${STAGES[l.stage] || ''}`, title: l.next_action || 'Adayla sonraki adım', body: '',
        actions: [['Adayı aç', `/satis/${l.id}`, 'pri']] });
    }
  }
  return out;
}

export function registerCrm(d) {
  const { route, all, one, q, need, layout, h, badge, fmtMoney, csrfField, HttpError, int, nn, redirect, send, STAFF, audit, opts } = d;
  const f = (ctx) => csrfField(ctx);
  const leadFor = async (ctx, id) => { const l = await one(`SELECT c.*, u.name owner FROM clients c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=$1 AND c.agency_id=$2`, [id, ctx.user.agency_id]); if (!l) throw new HttpError(404, 'Aday bulunamadı.'); return l; };
  const team = (a) => all(`SELECT id, name FROM users WHERE agency_id=$1 AND active AND role IN ('admin','staff') ORDER BY name`, [a]);
  const money = (n) => n ? `${fmtMoney(n)} TL/ay` : '';

  route('GET', '/satis', async (ctx, res) => {
    need(ctx, ...STAFF); const a = ctx.user.agency_id; const admin = ctx.user.role === 'admin';
    const kaynak = ctx.url.searchParams.get('kaynak') || ''; const kim = ctx.url.searchParams.get('kim') || '';
    const rows = await all(`SELECT c.*, u.name owner FROM clients c LEFT JOIN users u ON u.id=c.owner_id WHERE c.agency_id=$1 AND (c.status='lead' OR c.stage IN ('kazanildi','kaybedildi'))
      AND ($2='' OR c.lead_source=$2) AND ($3::int IS NULL OR c.owner_id=$3) ORDER BY c.call_at NULLS LAST, c.lead_score DESC NULLS LAST, c.created_at DESC`, [a, SOURCES[kaynak] ? kaynak : '', int(kim)]);
    const people = await team(a); const now = Date.now();
    const won = rows.filter(r => r.stage === 'kazanildi' && r.won_at && now - new Date(r.won_at) < 30 * 864e5).length;
    const lost = rows.filter(r => r.stage === 'kaybedildi').length;
    const col = (st) => { const list = rows.filter(r => r.stage === st); const sum = list.reduce((s, r) => s + (r.value_estimate || 0), 0);
      return `<section class="kcol" aria-label="${STAGES[st]}"><h3>${STAGES[st]} <span class="muted">${list.length}${admin && sum ? ' · ' + fmtMoney(sum) + ' TL' : ''}</span></h3>
${list.map(l => { const late = l.next_action_at && new Date(l.next_action_at) <= now; return `<article class="kcard${late ? ' is-late' : ''}"><a class="kt" href="/satis/${l.id}">${h(l.name)}</a>
<div class="kmeta">${badge(t`Puan ${l.lead_score ?? leadScore(l)}`, scoreTone(l.lead_score ?? leadScore(l)))}${l.contact_name ? `<span>${h(l.contact_name)}</span>` : ''}${l.lead_source ? `<span>${h(SOURCES[l.lead_source])}</span>` : ''}</div>
${l.call_at ? `<div class="kmeta"><span>Ön görüşme: ${h(fmtDT(l.call_at))}</span></div>` : ''}${l.next_action ? `<div class="kmeta"><span class="${late ? 'late' : ''}">${h(l.next_action)}${l.next_action_at ? ' · ' + h(fmtDT(l.next_action_at)) : ''}</span></div>` : ''}
${admin && l.value_estimate ? `<div class="kmeta"><span>${money(l.value_estimate)}</span></div>` : ''}
<form class="inline-status" method="post" action="/satis/${l.id}/asama">${f(ctx)}<select name="stage" data-auto aria-label="Aşama">${opts(STAGES, l.stage)}</select><button class="ghost">Kaydet</button></form></article>`; }).join('') || '<p class="muted kempty">Boş</p>'}</section>`; };
    send(res, 200, layout(ctx, 'Satış hattı', `<div class="page-head"><div><h1>Satış hattı</h1><p class="muted lead">Her adayı 15 dakikalık ön görüşmeye taşıyın. Sıcak adaya mesai içinde 15 dakikada dönün.</p></div><a class="btn gold" href="#yeni-aday">+ Aday</a></div>
<div class="grid"><div class="card"><span class="muted">Açık aday</span><span class="stat">${rows.filter(r => OPEN_STAGES.includes(r.stage)).length}</span></div>
<div class="card"><span class="muted">Planlı ön görüşme</span><span class="stat">${rows.filter(r => r.call_at && new Date(r.call_at) > now && OPEN_STAGES.includes(r.stage)).length}</span></div>
<div class="card"><span class="muted">Son 30 günde kazanılan</span><span class="stat">${won}</span></div><div class="card"><span class="muted">Kaybedilen (toplam)</span><span class="stat">${lost}</span></div></div>
<form class="filters" method="get" action="/satis"><select name="kaynak" aria-label="Kaynak" data-auto><option value="">Tüm kaynaklar</option>${opts(SOURCES, kaynak)}</select>
<select name="kim" aria-label="Sorumlu" data-auto><option value="">Herkes</option>${people.map(p => `<option value="${p.id}"${String(p.id) === kim ? ' selected' : ''}>${h(p.name)}</option>`).join('')}</select><button class="ghost">Filtrele</button></form>
<div class="kanban">${OPEN_STAGES.map(col).join('')}</div>
<section class="card" id="yeni-aday"><h2>Yeni aday</h2><form class="stack" method="post" action="/satis">${f(ctx)}
<div class="row"><label class="wide">Firma<input name="name" required></label><label class="wide">Yetkili<input name="contact_name"></label></div>
<div class="row"><label>Telefon<input name="phone" type="tel" inputmode="tel"></label><label>E-posta<input name="email" type="email"></label><label>Kaynak<select name="lead_source">${opts(SOURCES, 'web')}</select></label></div>
<div class="row"><label class="wide">İlgilendiği hizmet<input name="interest" placeholder="Ör. e-ticaret sitesi, sosyal medya"></label><label>Sektör<input name="sector"></label>${admin ? '<label>Tahmini aylık değer (TL)<input name="value_estimate" inputmode="numeric"></label>' : ''}</div>
<div class="row"><label>Ön görüşme<input type="datetime-local" name="call_at"></label><label>Sorumlu<select name="owner_id"><option value="">—</option>${people.map(p => `<option value="${p.id}"${p.id === ctx.user.id ? ' selected' : ''}>${h(p.name)}</option>`).join('')}</select></label></div>
<label>Not<textarea name="note" rows="2"></textarea></label><div><button class="gold">Adayı ekle</button></div></form></section>
${rows.some(r => !OPEN_STAGES.includes(r.stage)) ? `<section class="card"><h2>Kapananlar</h2>${rows.filter(r => !OPEN_STAGES.includes(r.stage)).slice(0, 30).map(l => `<a class="line" href="/satis/${l.id}"><span class="grow"><strong>${h(l.name)}</strong><span class="muted">${h(l.lost_reason || l.interest || '')}</span></span>${badge(STAGES[l.stage], STAGE_TONE[l.stage])}</a>`).join('')}</section>` : ''}`, '/satis'));
  });

  route('POST', '/satis', async (ctx, res) => {
    need(ctx, ...STAFF); const b = ctx.body; const a = ctx.user.agency_id;
    if (!nn(b.name)) throw new HttpError(400, 'Firma adı gerekli.');
    let owner = int(b.owner_id); if (owner && !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role IN ('admin','staff')`, [owner, a]))) owner = null;
    const x = { lead_source: SOURCES[b.lead_source] ? b.lead_source : 'diger', phone: nn(b.phone), email: nn(b.email), sector: nn(b.sector), call_at: dtParse(b.call_at), stage: dtParse(b.call_at) ? 'gorusme' : 'yeni', value_estimate: ctx.user.role === 'admin' ? int(String(b.value_estimate || '').replace(/\D/g, '')) : null };
    const r = await one(`INSERT INTO clients (agency_id, name, contact_name, phone, email, sector, status, stage, lead_source, lead_score, interest, call_at, value_estimate, owner_id)
      VALUES ($1,$2,$3,$4,$5,$6,'lead',$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [a, nn(b.name), nn(b.contact_name), x.phone, x.email, x.sector, x.stage, x.lead_source, leadScore(x), nn(b.interest), x.call_at, x.value_estimate, owner]);
    if (nn(b.note)) await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,$2,$3,$4)', [r.id, ctx.user.id, 'not', nn(b.note)]);
    await audit(ctx, 'lead.create', { id: r.id, name: b.name, source: x.lead_source }); redirect(res, `/satis/${r.id}`);
  });

  route('GET', '/satis/:id', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await leadFor(ctx, int(p.id)); const admin = ctx.user.role === 'admin';
    const [notes, people] = await Promise.all([all('SELECT n.*, u.name author FROM client_notes n LEFT JOIN users u ON u.id=n.user_id WHERE n.client_id=$1 ORDER BY n.created_at DESC', [l.id]), team(ctx.user.agency_id)]);
    const score = l.lead_score ?? leadScore(l); const wa = waLink(l.phone, `Merhaba ${l.contact_name || ''}, Arvela Digital & AI'dan yazıyorum.`.replace('  ', ' '));
    const open = OPEN_STAGES.includes(l.stage) || l.status === 'lead';
    send(res, 200, layout(ctx, l.name, `<nav class="crumb"><a href="/satis">Satış hattı</a>${l.status !== 'lead' ? ` › <a href="/musteriler/${l.id}">Müşteri sayfası</a>` : ''}</nav>
<div class="page-head"><div><h1>${h(l.name)}</h1><div class="chips">${badge(STAGES[l.stage] || 'Aday', STAGE_TONE[l.stage])}${badge(t`Puan ${score}`, scoreTone(score))}${l.contact_name ? `<span class="muted">${h(l.contact_name)}</span>` : ''}${l.lead_source ? `<span class="muted">${h(SOURCES[l.lead_source])}</span>` : ''}${l.owner ? `<span class="muted">Sorumlu: ${h(l.owner)}</span>` : ''}${l.marketing_consent_at ? badge('Pazarlama onayı var', 'ok') : `<span class="muted">Pazarlama onayı yok</span>`}</div></div>
<div class="act-btns">${l.phone ? `<a class="btn" href="tel:${h(String(l.phone).replace(/[^+\d]/g, ''))}">Telefonla ara</a>` : ''}${wa ? `<a class="btn ghost" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${l.email ? `<a class="btn ghost" href="mailto:${h(l.email)}">E-posta</a>` : ''}</div></div>
${l.call_at ? `<div class="flash"><strong>Ön görüşme:</strong> ${h(fmtDT(l.call_at))}</div>` : ''}
<div class="two wide-first"><section class="card"><h2>İletişim geçmişi</h2>
<form class="stack" method="post" action="/satis/${l.id}/not">${f(ctx)}<div class="row"><label>Tür<select name="kind">${opts(KINDS, 'arama')}</select></label><label class="wide">Ne konuşuldu?<input name="body" required></label></div>
<div class="row"><label class="wide">Sonraki adım<input name="next_action" value="${h(l.next_action)}" placeholder="Ör. teklif gönder, yeniden ara"></label><label>Ne zaman<input type="datetime-local" name="next_action_at" value="${dtVal(l.next_action_at)}"></label></div><div><button class="gold">Kaydet</button></div></form>
${notes.map(n => `<div class="note"><div class="note-h"><strong>${h(KINDS[n.kind] || n.kind)} · ${h(n.author || 'Sistem')}</strong><span class="muted">${h(fmtDT(n.created_at))}</span></div><p>${h(n.body)}</p></div>`).join('') || '<p class="muted">Henüz kayıt yok.</p>'}</section>
<section class="card"><h2>Aday bilgileri</h2><form class="stack" method="post" action="/satis/${l.id}">${f(ctx)}
<label>Firma<input name="name" value="${h(l.name)}" required></label><div class="row"><label>Yetkili<input name="contact_name" value="${h(l.contact_name)}"></label><label>Telefon<input name="phone" type="tel" value="${h(l.phone)}"></label></div>
<div class="row"><label>E-posta<input name="email" type="email" value="${h(l.email)}"></label><label>Sektör<input name="sector" value="${h(l.sector)}"></label></div>
<div class="row"><label>Aşama<select name="stage">${opts(STAGES, l.stage)}</select></label><label>Kaynak<select name="lead_source">${opts(SOURCES, l.lead_source)}</select></label><label>Puan<input name="lead_score" inputmode="numeric" value="${score}"></label></div>
<label>İlgilendiği hizmet<input name="interest" value="${h(l.interest)}"></label>
<div class="row"><label>Ön görüşme<input type="datetime-local" name="call_at" value="${dtVal(l.call_at)}"></label><label>Sorumlu<select name="owner_id"><option value="">—</option>${people.map(u => `<option value="${u.id}"${u.id === l.owner_id ? ' selected' : ''}>${h(u.name)}</option>`).join('')}</select></label>${admin ? `<label>Aylık değer (TL)<input name="value_estimate" inputmode="numeric" value="${h(l.value_estimate ?? '')}"></label>` : ''}</div>
<label class="chk"><input type="checkbox" name="marketing_consent"${l.marketing_consent_at ? ' checked' : ''}> Kampanya ve duyuru iletisi onayı var</label>
${l.marketing_consent_at ? `<p class="muted">Onay: ${h(fmtDT(l.marketing_consent_at))}${l.marketing_consent_source ? ' · ' + h(l.marketing_consent_source) : ''}</p>` : '<p class="muted">Yalnız kişi açıkça onay verdiyse işaretleyin (İYS).</p>'}
<label>Kaybedilme nedeni<input name="lost_reason" value="${h(l.lost_reason)}" placeholder="Yalnız kaybedildiyse"></label><div><button>Kaydet</button></div></form>
${open && l.status === 'lead' ? `<div class="row"><form method="post" action="/satis/${l.id}/kazanildi" data-confirm="Aday kazanıldı olarak işaretlenip aktif müşteriye çevrilsin mi?">${f(ctx)}<button class="gold">Kazanıldı · müşteriye çevir</button></form>${admin ? `<a class="btn ghost" href="/teklifler#yeni">Teklif hazırla</a>` : ''}</div>` : ''}
<p class="muted">Puan; kaynak, iletişim bilgisi, ön görüşme ve tahmini değere göre önerilir, elle değiştirebilirsiniz.</p></section></div>`, '/satis'));
  });

  route('POST', '/satis/:id', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await leadFor(ctx, int(p.id)); const b = ctx.body;
    const stage = STAGES[b.stage] ? b.stage : l.stage;
    let owner = int(b.owner_id); if (owner && !(await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND role IN ('admin','staff')`, [owner, ctx.user.agency_id]))) owner = null;
    const score = Math.max(0, Math.min(100, int(b.lead_score) ?? l.lead_score ?? 0));
    const value = ctx.user.role === 'admin' && 'value_estimate' in b ? int(String(b.value_estimate || '').replace(/\D/g, '')) : l.value_estimate;
    await q(`UPDATE clients SET name=$1, contact_name=$2, phone=$3, email=$4, sector=$5, stage=$6, lead_source=$7, lead_score=$8, interest=$9, call_at=$10, owner_id=$11, value_estimate=$12, lost_reason=$13 WHERE id=$14`,
      [nn(b.name) || l.name, nn(b.contact_name), nn(b.phone), nn(b.email), nn(b.sector), stage, SOURCES[b.lead_source] ? b.lead_source : l.lead_source, score, nn(b.interest), dtParse(b.call_at), owner, value, nn(b.lost_reason), l.id]);
    const consent = !!b.marketing_consent;
    if (consent !== !!l.marketing_consent_at) await q(`UPDATE clients SET marketing_consent_at=$1, marketing_consent_source=$2 WHERE id=$3`, consent ? [new Date().toISOString(), t`${ctx.user.name} işaretledi`, l.id] : [null, null, l.id]);
    if (stage !== l.stage) await audit(ctx, 'lead.stage', { id: l.id, from: l.stage, to: stage }); else await audit(ctx, 'lead.update', { id: l.id });
    redirect(res, `/satis/${l.id}`);
  });

  route('POST', '/satis/:id/asama', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await leadFor(ctx, int(p.id)); const st = STAGES[ctx.body.stage] ? ctx.body.stage : l.stage;
    if (st === 'kazanildi') return redirect(res, `/satis/${l.id}`);
    await q('UPDATE clients SET stage=$1 WHERE id=$2', [st, l.id]);
    if (st !== l.stage) await audit(ctx, 'lead.stage', { id: l.id, from: l.stage, to: st });
    redirect(res, '/satis');
  });

  route('POST', '/satis/:id/not', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await leadFor(ctx, int(p.id)); const b = ctx.body;
    const body = nn(b.body); if (!body) throw new HttpError(400, 'Not boş olamaz.');
    await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,$2,$3,$4)', [l.id, ctx.user.id, KINDS[b.kind] ? b.kind : 'not', body.slice(0, 4000)]);
    const nextStage = l.stage === 'yeni' && ['arama', 'whatsapp', 'eposta', 'gorusme'].includes(b.kind) ? 'ulasildi' : l.stage;
    await q('UPDATE clients SET next_action=$1, next_action_at=$2, stage=$3 WHERE id=$4', [nn(b.next_action), dtParse(b.next_action_at), nextStage, l.id]);
    await audit(ctx, 'lead.note', { id: l.id, kind: b.kind });
    if (nextStage !== l.stage) await audit(ctx, 'lead.stage', { id: l.id, from: l.stage, to: nextStage });
    redirect(res, `/satis/${l.id}`);
  });

  route('POST', '/satis/:id/kazanildi', async (ctx, res, p) => {
    need(ctx, ...STAFF); const l = await leadFor(ctx, int(p.id));
    await q(`UPDATE clients SET status='active', stage='kazanildi', won_at=now(), next_action=NULL, next_action_at=NULL WHERE id=$1`, [l.id]);
    await q('INSERT INTO client_notes (client_id, user_id, kind, body) VALUES ($1,$2,$3,$4)', [l.id, ctx.user.id, 'not', 'Kazanıldı, aktif müşteriye çevrildi.']);
    await audit(ctx, 'lead.won', { id: l.id, name: l.name });
    await audit(ctx, 'client.create', { id: l.id, name: l.name, from: 'lead' }); // karşılama akışı yeni müşteri olayını dinler
    redirect(res, `/musteriler/${l.id}`);
  });

  // Bugün sayfası için açık adaylar
  return { openLeads: (a) => all(`SELECT id, name, contact_name, phone, stage, lead_source, interest, call_at, next_action, next_action_at, created_at FROM clients WHERE agency_id=$1 AND status='lead' AND stage = ANY($2)`, [a, OPEN_STAGES]) };
}
