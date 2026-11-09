// Arvela OS — hizmet kitapları: her katalog hizmetinin kapsamı, aşamaları ve yapay zekâ destekli yönetim yöntemi.
// Katalogda düzenlenir; müşteriye (client_services) ve projeye (projects) eklenirken kopyalanıp orada ayrıca özelleştirilir.
// Projeye eklenen hizmetin aşamaları görev olarak açılır.
import fs from 'node:fs';
import { t } from './i18n.js';

export const ROLES = { ai: 'Yapay zekâ', ekip: 'Ekip', freelancer: 'Freelancer', musteri: 'Müşteri' };
export const AUTO = { tam: 'Tam otomatik', ai_taslak: 'Yapay zekâ taslak + insan onayı', insan: 'İnsan (yapay zekâ destekli)' };
export const DECISIONS = { onay: 'Onay / revizyon', secim: 'Seçenek seçimi', butce: 'Bütçe / kapsam kararı', bilgi: 'Bilgi / dosya' };
export const ENGINES = { claude: 'Claude (Anthropic)', openai: 'OpenAI', gemini: 'Gemini (Google)' };
const ROLE_TONE = { ai: 'ok', ekip: '', freelancer: '', musteri: 'warn' };
// Kitaplarda kullanılan akış takma adları → n8n'deki gerçek akış (Arvela · …)
export const AKIS = { 'Karar hatırlatma': 'Onay hatırlatma', 'Bilgi isteği': 'E-posta gönderici (karar bağlantısı)', 'Kabul ön kontrolü': 'Yapay zekâ (Claude)', 'Haftalık durum özeti': 'Sabah özeti', 'Yeni müşteri': 'Yeni müşteri karşılama' };
export const akisName = (a) => (a ? AKIS[a] || a : a);

const str = (v, max = 2000) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const lines = (v) => str(v, 20000).split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60);
const pipes = (v, keys) => lines(v).map(l => { const p = l.split('|').map(x => x.trim()); return Object.fromEntries(keys.map((k, i) => [k, p[i] || ''])); }).filter(o => o[keys[0]]);
const pick = (v, set, d) => (Object.hasOwn(set, v) ? v : d);

// Formdan hizmet kitabı oku (katalog, müşteri ve proje aynı formu kullanır).
export function parsePlaybook(b) {
  const asamalar = [];
  for (let i = 0; i < 40; i++) {
    const ad = str(b[`s_ad_${i}`], 200); if (!ad) continue;
    asamalar.push({ ad, rol: pick(b[`s_rol_${i}`], ROLES, 'ekip'), otomasyon: pick(b[`s_oto_${i}`], AUTO, 'insan'), gun: Math.max(0, Math.min(365, Number.parseInt(b[`s_gun_${i}`], 10) || 0)),
      karar: Object.hasOwn(DECISIONS, b[`s_karar_${i}`]) ? b[`s_karar_${i}`] : null, akis: str(b[`s_akis_${i}`], 120) || null, cikti: str(b[`s_cikti_${i}`], 400), kontrol: str(b[`s_kontrol_${i}`], 400) });
  }
  return {
    v: 1, ozet: str(b.ozet), kapsam: lines(b.kapsam), kapsam_disi: lines(b.kapsam_disi),
    teslimatlar: pipes(b.teslimatlar, ['ad', 'kabul']),
    girdiler: pipes(b.girdiler, ['ad', 'kimden', 'zorunlu', 'nasil']).map(g => ({ ad: g.ad, kimden: g.kimden === 'arvela' ? 'arvela' : 'musteri', zorunlu: !/isteğe|hayır|opsiyonel/i.test(g.zorunlu), nasil: g.nasil })),
    asamalar,
    sla: { sure_gun: Number.parseInt(b.sla_gun, 10) || asamalar.reduce((s, x) => s + x.gun, 0), revizyon: str(b.sla_revizyon, 200), yanit: str(b.sla_yanit, 200) },
    kpi: lines(b.kpi), riskler: pipes(b.riskler, ['risk', 'onlem']),
    ai: { motor: pick(b.ai_motor, ENGINES, 'claude'), yontem: lines(b.ai_yontem), teknik: lines(b.ai_teknik), ek_motorlar: pipes(b.ai_ek, ['motor', 'amac']).filter(x => Object.hasOwn(ENGINES, x.motor)),
      otomasyon_orani: Math.max(0, Math.min(100, Number.parseInt(b.ai_oran, 10) || 0)) },
    musteri_paneli: lines(b.musteri_paneli),
  };
}

// Aşamalardan görev planı: başlangıç tarihinden itibaren birikimli süre.
export function planTasks(pb, start, people = {}) {
  let day = 0; const base = new Date(start || Date.now());
  return (pb?.asamalar || []).map((s, i) => {
    day += Math.max(1, s.gun || 1);
    const due = new Date(base.getTime() + day * 864e5).toISOString().slice(0, 10);
    const prefix = s.rol === 'musteri' && !/^müşteri/i.test(s.ad) ? 'Müşteri kararı: ' : s.rol === 'ai' && !/^yapay zek/i.test(s.ad) ? 'Yapay zekâ: ' : '';
    const assignee = s.rol === 'freelancer' ? (people.freelancer || people.ekip || null) : (people.ekip || null);
    const desc = [`Rol: ${ROLES[s.rol]} · ${AUTO[s.otomasyon]}${s.karar ? ' · Karar: ' + DECISIONS[s.karar] : ''}${s.akis ? ' · n8n: ' + akisName(s.akis) : ''}`, s.cikti && `Çıktı: ${s.cikti}`, s.kontrol && `Kabul: ${s.kontrol}`].filter(Boolean).join('\n');
    return { stage_no: i + 1, title: (prefix + s.ad).slice(0, 200), description: desc, due_date: due, assignee_id: assignee, role: s.rol, automation: s.otomasyon, decision: s.karar };
  });
}

// Aylık hizmet: sonraki dönemin adı ve başlangıcı. "… · Kasım 2026" → "… · Aralık 2026"; ay eki yoksa eklenir.
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export function nextPeriod(name, start) {
  const m = new RegExp(`^(.*?)\\s*·\\s*(${AYLAR.join('|')}) (\\d{4})$`).exec(String(name || ''));
  let y, mo, base = String(name || '').trim();
  if (m) { base = m[1]; mo = AYLAR.indexOf(m[2]) + 1; y = Number(m[3]); if (mo === 12) { mo = 0; y++; } }
  else { const d = new Date(start || Date.now()); y = d.getUTCFullYear(); mo = d.getUTCMonth() + 1; if (mo === 12) { mo = 0; y++; } }
  const first = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  return { name: `${base} · ${AYLAR[mo]} ${y}`.slice(0, 200), start: first };
}

export function stats(pb) {
  const a = pb?.asamalar || [];
  return { asama: a.length, gun: a.reduce((s, x) => s + (x.gun || 0), 0), karar: a.filter(x => x.karar).length, otomatik: a.filter(x => x.rol === 'ai').length, oran: pb?.ai?.otomasyon_orani ?? null };
}

export async function migratePlaybooks({ q, all }) {
  await q('ALTER TABLE services ADD COLUMN IF NOT EXISTS playbook JSONB');
  await q('ALTER TABLE services ADD COLUMN IF NOT EXISTS playbook_updated_at TIMESTAMPTZ');
  await q('ALTER TABLE client_services ADD COLUMN IF NOT EXISTS playbook JSONB');
  await q('ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_id INT REFERENCES services(id) ON DELETE SET NULL');
  await q('ALTER TABLE projects ADD COLUMN IF NOT EXISTS playbook JSONB');
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_role TEXT');
  await q('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_decision TEXT');
  // hazır hizmet kitaplarını yalnız boş olan hizmetlere yaz (Yönetici düzenlemesi korunur)
  const file = new URL('./playbooks.json', import.meta.url);
  if (!fs.existsSync(file)) return 0;
  const books = JSON.parse(fs.readFileSync(file, 'utf8')); let n = 0;
  for (const [code, pb] of Object.entries(books)) {
    const r = await q('UPDATE services SET playbook=$1 WHERE code=$2 AND playbook IS NULL', [JSON.stringify(pb), code]); n += r?.rowCount || 0;
  }
  return n;
}

// ---------- görünüm ----------
function viewHtml(pb, h, badge) {
  if (!pb) return '<p class="muted">Bu hizmet için henüz kitap yok.</p>';
  const st = stats(pb); const ul = (xs) => xs?.length ? `<ul>${xs.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
  return `<div class="pb">
<p class="lead">${h(pb.ozet)}</p>
<div class="grid pb-stats"><div class="card"><span class="muted">Süre</span><span class="stat">${h(t`${pb.sla?.sure_gun || st.gun} gün`)}</span></div><div class="card"><span class="muted">Aşama</span><span class="stat">${st.asama}</span></div>
<div class="card"><span class="muted">Müşteri karar noktası</span><span class="stat">${st.karar}</span></div><div class="card"><span class="muted">Yapay zekâ ile yürüyen iş</span><span class="stat">${st.oran == null ? '—' : '%' + st.oran}</span></div></div>
<div class="two"><section class="card"><h2>Kapsam</h2>${ul(pb.kapsam)}<h3>Kapsam dışı</h3>${ul(pb.kapsam_disi)}</section>
<section class="card"><h2>Teslimatlar ve kabul ölçütleri</h2>${(pb.teslimatlar || []).map(x => `<div class="line"><span class="grow"><strong>${h(x.ad)}</strong><span class="muted">${h(x.kabul)}</span></span></div>`).join('') || '<p class="muted">—</p>'}</section></div>
<section class="card"><h2>Aşamalar</h2><div class="tbl"><table><tr><th>#</th><th>Aşama</th><th>Kim</th><th>Otomasyon</th><th>Gün</th><th>Karar</th><th>Çıktı ve kabul</th></tr>
${(pb.asamalar || []).map((s, i) => `<tr><td>${i + 1}</td><td><strong>${h(s.ad)}</strong>${s.akis ? `<br><span class="muted">n8n: ${h(akisName(s.akis))}</span>` : ''}</td><td>${badge(ROLES[s.rol], ROLE_TONE[s.rol])}</td><td>${h(AUTO[s.otomasyon])}</td><td>${s.gun}</td><td>${s.karar ? badge(DECISIONS[s.karar], 'warn') : '—'}</td><td>${h(s.cikti)}${s.kontrol ? `<br><span class="muted">${h(s.kontrol)}</span>` : ''}</td></tr>`).join('')}</table></div></section>
<div class="two"><section class="card"><h2>Müşteriden istenenler</h2>${(pb.girdiler || []).map(g => `<div class="line"><span class="grow"><strong>${h(g.ad)}</strong><span class="muted">${g.kimden === 'arvela' ? 'Arvela sağlar' : 'Müşteri'} · ${g.zorunlu ? 'zorunlu' : 'isteğe bağlı'}${g.nasil ? ' · ' + h(g.nasil) : ''}</span></span></div>`).join('') || '<p class="muted">—</p>'}</section>
<section class="card"><h2>Müşteri panelinde</h2>${ul(pb.musteri_paneli)}<h3>Süre ve SLA</h3><p style="margin:0">${h(t`${pb.sla?.sure_gun ?? st.gun} gün`)}${pb.sla?.revizyon ? ' · ' + h(pb.sla.revizyon) : ''}${pb.sla?.yanit ? ' · ' + h(pb.sla.yanit) : ''}</p></section></div>
<section class="card"><h2>Yapay zekâ destekli proje yönetimi</h2><h3>Yöntem</h3>${ul(pb.ai?.yontem)}<h3>Teknik ayrıntılar</h3>${ul(pb.ai?.teknik)}
<h3>Yapay zekâ motorları</h3><p style="margin:0">Ana motor: <strong>${h(ENGINES[pb.ai?.motor] || 'Claude')}</strong>${(pb.ai?.ek_motorlar || []).length ? '' : ' · ek motor önerisi yok'}</p>${(pb.ai?.ek_motorlar || []).map(m => `<div class="line"><span class="grow"><strong>${h(ENGINES[m.motor])}</strong><span class="muted">${h(m.amac)}</span></span></div>`).join('')}</section>
<div class="two"><section class="card"><h2>Ölçülecekler (KPI)</h2>${ul(pb.kpi)}</section><section class="card"><h2>Riskler ve önlemler</h2>${(pb.riskler || []).map(r => `<div class="line"><span class="grow"><strong>${h(r.risk)}</strong><span class="muted">${h(r.onlem)}</span></span></div>`).join('') || '<p class="muted">—</p>'}</section></div>
</div>`;
}

function editorHtml(pb, h, action, csrf, extra = '') {
  pb = pb || { asamalar: [], ai: {} };
  const ln = (xs) => h((xs || []).join('\n')); const pp = (xs, keys) => h((xs || []).map(o => keys.map(k => o[k] ?? '').join(' | ')).join('\n'));
  const opt = (set, v, empty) => `${empty ? '<option value="">—</option>' : ''}${Object.entries(set).map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}`;
  const rows = [...(pb.asamalar || []), ...Array.from({ length: 3 }, () => ({}))];
  return `<form class="stack pb-edit" method="post" action="${action}">${csrf}${extra}
<label>Özet<textarea name="ozet" rows="3">${h(pb.ozet)}</textarea></label>
<div class="two"><label>Kapsam (her satır bir madde)<textarea name="kapsam" rows="6">${ln(pb.kapsam)}</textarea></label><label>Kapsam dışı<textarea name="kapsam_disi" rows="6">${ln(pb.kapsam_disi)}</textarea></label></div>
<label>Teslimatlar · her satır: teslimat | kabul ölçütü<textarea name="teslimatlar" rows="5">${pp(pb.teslimatlar, ['ad', 'kabul'])}</textarea></label>
<label>Müşteriden istenenler · her satır: ne | musteri ya da arvela | zorunlu ya da isteğe bağlı | nasıl<textarea name="girdiler" rows="5">${h((pb.girdiler || []).map(g => [g.ad, g.kimden, g.zorunlu ? 'zorunlu' : 'isteğe bağlı', g.nasil].join(' | ')).join('\n'))}</textarea></label>
<fieldset class="pb-stages"><legend>Aşamalar · boş bıraktığınız satır silinir</legend><div class="tbl"><table><tr><th>Aşama</th><th>Kim</th><th>Otomasyon</th><th>Gün</th><th>Karar</th><th>n8n akışı</th><th>Çıktı</th><th>Kabul</th></tr>
${rows.map((s, i) => `<tr><td><input name="s_ad_${i}" value="${h(s.ad)}" aria-label="Aşama ${i + 1}"></td><td><select name="s_rol_${i}" aria-label="Kim">${opt(ROLES, s.rol || 'ekip')}</select></td><td><select name="s_oto_${i}" aria-label="Otomasyon">${opt(AUTO, s.otomasyon || 'insan')}</select></td>
<td><input name="s_gun_${i}" inputmode="numeric" value="${h(s.gun ?? '')}" aria-label="Gün" style="width:64px"></td><td><select name="s_karar_${i}" aria-label="Karar">${opt(DECISIONS, s.karar, true)}</select></td><td><input name="s_akis_${i}" value="${h(s.akis)}" aria-label="n8n akışı"></td>
<td><input name="s_cikti_${i}" value="${h(s.cikti)}" aria-label="Çıktı"></td><td><input name="s_kontrol_${i}" value="${h(s.kontrol)}" aria-label="Kabul"></td></tr>`).join('')}</table></div></fieldset>
<div class="row"><label>Toplam süre (gün)<input name="sla_gun" inputmode="numeric" value="${h(pb.sla?.sure_gun ?? '')}"></label><label class="wide">Revizyon hakkı<input name="sla_revizyon" value="${h(pb.sla?.revizyon)}"></label><label class="wide">Yanıt süresi<input name="sla_yanit" value="${h(pb.sla?.yanit)}"></label></div>
<div class="two"><label>Ölçülecekler (KPI)<textarea name="kpi" rows="4">${ln(pb.kpi)}</textarea></label><label>Riskler · her satır: risk | önlem<textarea name="riskler" rows="4">${pp(pb.riskler, ['risk', 'onlem'])}</textarea></label></div>
<label>Müşteri panelinde neler yapabilir<textarea name="musteri_paneli" rows="3">${ln(pb.musteri_paneli)}</textarea></label>
<h3>Yapay zekâ destekli yönetim</h3>
<div class="row"><label>Ana motor<select name="ai_motor">${opt(ENGINES, pb.ai?.motor || 'claude')}</select></label><label>Yapay zekâ ile yürüyen iş (%)<input name="ai_oran" inputmode="numeric" value="${h(pb.ai?.otomasyon_orani ?? '')}"></label></div>
<label>Yöntem<textarea name="ai_yontem" rows="7">${ln(pb.ai?.yontem)}</textarea></label><label>Teknik ayrıntılar<textarea name="ai_teknik" rows="6">${ln(pb.ai?.teknik)}</textarea></label>
<label>Ek yapay zekâ motorları · her satır: openai ya da gemini | amaç<textarea name="ai_ek" rows="3">${pp(pb.ai?.ek_motorlar, ['motor', 'amac'])}</textarea></label>
<div><button class="gold">Kaydet</button></div></form>`;
}

export function registerPlaybooks(d) {
  const { route, all, one, q, need, layout, h, badge, csrfField, HttpError, int, redirect, send, STAFF, audit, fmtDate } = d;
  const svcFor = async (ctx, id) => { const s = await one(`SELECT s.*, sc.name cat FROM services s JOIN service_categories sc ON sc.id=s.category_id WHERE s.id=$1 AND s.agency_id=$2`, [id, ctx.user.agency_id]); if (!s) throw new HttpError(404, 'Hizmet bulunamadı.'); return s; };
  const people = (a) => all(`SELECT id, name, role FROM users WHERE agency_id=$1 AND active AND role IN ('admin','staff','freelancer') ORDER BY name`, [a]);

  route('GET', '/katalog/:id', async (ctx, res, p) => {
    need(ctx, ...STAFF); const s = await svcFor(ctx, int(p.id)); const admin = ctx.user.role === 'admin';
    send(res, 200, layout(ctx, s.name, `<nav class="crumb"><a href="/katalog">Katalog</a> › ${h(s.cat)}</nav><div class="page-head"><div><p class="eyebrow">${h(s.code)} · ${h(s.sub || '')}</p><h1>${h(s.name)}</h1>
<div class="chips"><span class="muted">${h(s.billing || '')}</span>${s.playbook_updated_at ? `<span class="muted">${h(t`Son düzenleme: ${fmtDate(s.playbook_updated_at)}`)}</span>` : ''}</div></div>${admin ? '<a class="btn ghost" href="#duzenle" data-open="duzenle">Düzenle</a>' : ''}</div>
${viewHtml(s.playbook, h, badge)}
${admin ? `<details class="card" id="duzenle"><summary>Hizmet kitabını düzenle</summary><p class="muted">Buradaki değişiklik yeni eklenen müşteri ve projelere uygulanır; önceden eklenmiş olanlar kendi kopyasını korur.</p>${editorHtml(s.playbook, h, `/katalog/${s.id}/kitap`, csrfField(ctx))}</details>` : ''}`, '/katalog'));
  });
  route('POST', '/katalog/:id/kitap', async (ctx, res, p) => {
    need(ctx, 'admin'); const s = await svcFor(ctx, int(p.id)); const pb = parsePlaybook(ctx.body);
    await q('UPDATE services SET playbook=$1, playbook_updated_at=now() WHERE id=$2', [JSON.stringify(pb), s.id]);
    await audit(ctx, 'service.playbook', { id: s.id, code: s.code }); redirect(res, `/katalog/${s.id}`);
  });

  // müşteriye eklenmiş hizmet: kendi kopyası ya da katalog
  const csFor = async (ctx, id) => { const r = await one(`SELECT cs.*, s.code, s.name, s.playbook base, c.name client FROM client_services cs JOIN services s ON s.id=cs.service_id JOIN clients c ON c.id=cs.client_id WHERE cs.id=$1 AND cs.agency_id=$2`, [id, ctx.user.agency_id]); if (!r) throw new HttpError(404, 'Hizmet kaydı bulunamadı.'); return r; };
  route('GET', '/hizmet/:id/kitap', async (ctx, res, p) => {
    need(ctx, ...STAFF); const r = await csFor(ctx, int(p.id)); const own = !!r.playbook; const pb = r.playbook || r.base; const f = csrfField(ctx);
    send(res, 200, layout(ctx, r.name, `<nav class="crumb"><a href="/musteriler/${r.client_id}">${h(r.client)}</a> › Hizmet kitabı</nav><div class="page-head"><div><p class="eyebrow">${h(r.code)}</p><h1>${h(r.name)}</h1>
<div class="chips">${own ? badge('Bu müşteriye özel', 'warn') : badge('Katalogdaki tanım')}</div></div><a class="btn ghost" href="#duzenle">Bu müşteri için düzenle</a></div>
${viewHtml(pb, h, badge)}
<details class="card" id="duzenle"><summary>Bu müşteri için düzenle</summary><p class="muted">Yalnız ${h(r.client)} için geçerli olur; katalog değişmez.</p>${editorHtml(pb, h, `/hizmet/${r.id}/kitap`, f)}
${own ? `<form method="post" action="/hizmet/${r.id}/kitap/sifirla" data-confirm="Bu müşteriye özel değişiklikler silinip katalog tanımına dönülsün mü?">${f}<button class="ghost">Katalog tanımına dön</button></form>` : ''}</details>`, '/musteriler'));
  });
  route('POST', '/hizmet/:id/kitap', async (ctx, res, p) => {
    need(ctx, ...STAFF); const r = await csFor(ctx, int(p.id)); await q('UPDATE client_services SET playbook=$1 WHERE id=$2', [JSON.stringify(parsePlaybook(ctx.body)), r.id]);
    await audit(ctx, 'client_service.playbook', { id: r.id, client_id: r.client_id }); redirect(res, `/hizmet/${r.id}/kitap`);
  });
  route('POST', '/hizmet/:id/kitap/sifirla', async (ctx, res, p) => {
    need(ctx, ...STAFF); const r = await csFor(ctx, int(p.id)); await q('UPDATE client_services SET playbook=NULL WHERE id=$1', [r.id]); redirect(res, `/hizmet/${r.id}/kitap`);
  });

  // proje: hizmetten başlat (kitabı kopyalar, aşamaları görev olarak açar) ve proje kitabını düzenle
  const prjFor = async (ctx, id) => { const r = await one(`SELECT p.*, c.name client FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND p.agency_id=$2`, [id, ctx.user.agency_id]); if (!r) throw new HttpError(404, 'Proje bulunamadı.'); return r; };
  // Freelancer aşamalarına iş paketi: kitaptan atanan her freelancer için projede bir paket (yoksa) teklif edilir.
  // Ücreti Yönetici girer; önceki dönemin paketi varsa ücret şekli oradan taşınır.
  async function autoPackages(ctx, projectId, fromProjectId = null) {
    const a = ctx.user.agency_id;
    const pr = await one('SELECT name FROM projects WHERE id=$1', [projectId]);
    const rows = await all(`SELECT assignee_id, title, description, due_date FROM tasks WHERE project_id=$1 AND stage_role='freelancer' AND assignee_id IS NOT NULL ORDER BY stage_no`, [projectId]);
    const by = new Map(); for (const r of rows) { if (!by.has(r.assignee_id)) by.set(r.assignee_id, []); by.get(r.assignee_id).push(r); }
    let n = 0;
    for (const [fid, st] of by) {
      if (await one('SELECT 1 FROM work_packages WHERE project_id=$1 AND freelancer_id=$2 AND status<>\'iptal\'', [projectId, fid])) continue;
      const prev = fromProjectId ? await one(`SELECT pay_type, amount, hourly_rate, hour_cap FROM work_packages WHERE project_id=$1 AND freelancer_id=$2 AND status<>'iptal' ORDER BY id DESC LIMIT 1`, [fromProjectId, fid]) : null;
      const desc = st.map(x => { const out = String(x.description || '').split(/\r?\n/).find(l => l.startsWith('Çıktı:')); return `• ${String(x.title).replace(/^[^:]*:\s*/, '')}${out ? ' — ' + out.slice(6).trim() : ''}`; }).join('\n');
      const due = st.map(x => x.due_date).filter(Boolean).sort().at(-1) || null;
      const r = await one(`INSERT INTO work_packages (agency_id, freelancer_id, project_id, title, description, pay_type, amount, hourly_rate, hour_cap, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [a, fid, projectId, `${pr.name} · freelancer işi`, desc, prev?.pay_type || 'sabit', prev?.amount ?? null, prev?.hourly_rate ?? null, prev?.hour_cap ?? null, due, ctx.user.id]);
      await audit(ctx, 'package.create', { id: r.id, title: `${pr.name} · freelancer işi`, freelancer_id: fid, auto: true }); n++;
    }
    return n;
  }
  route('POST', '/projeler/:id/hizmet', async (ctx, res, p) => {
    need(ctx, ...STAFF); const pr = await prjFor(ctx, int(p.id)); const a = ctx.user.agency_id; const b = ctx.body;
    const s = await svcFor(ctx, int(b.service_id));
    const cs = await one(`SELECT playbook FROM client_services WHERE client_id=$1 AND service_id=$2 AND playbook IS NOT NULL ORDER BY id DESC LIMIT 1`, [pr.client_id, s.id]);
    const pb = cs?.playbook || s.playbook; if (!pb) throw new HttpError(400, 'Bu hizmetin kitabı yok; önce katalogda doldurun.');
    const valid = async (v, roles) => { const id = int(v); if (!id) return null; return (await one(`SELECT 1 FROM users WHERE id=$1 AND agency_id=$2 AND active AND role = ANY($3)`, [id, a, roles])) ? id : null; };
    const plan = planTasks(pb, /^\d{4}-\d{2}-\d{2}$/.test(b.start || '') ? b.start : null, { ekip: await valid(b.ekip_id, ['admin', 'staff']), freelancer: await valid(b.freelancer_id, ['freelancer']) });
    // teslim tarihi son aşamadan önce kalmasın
    await q('UPDATE projects SET service_id=$1, playbook=$2, due_date=GREATEST(due_date, $3::date) WHERE id=$4', [s.id, JSON.stringify(pb), plan.at(-1)?.due_date || null, pr.id]);
    const base = (await one('SELECT COALESCE(max(stage_no),0)::int n FROM tasks WHERE project_id=$1', [pr.id])).n;
    for (const x of plan) await q(`INSERT INTO tasks (agency_id, project_id, title, description, due_date, assignee_id, stage_role, stage_decision, stage_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [a, pr.id, x.title, x.description, x.due_date, x.assignee_id, x.role, x.decision, base + x.stage_no]);
    await audit(ctx, 'project.playbook', { id: pr.id, service: s.code, tasks: plan.length }); await autoPackages(ctx, pr.id); redirect(res, `/projeler/${pr.id}`);
  });
  route('GET', '/projeler/:id/kitap', async (ctx, res, p) => {
    need(ctx, ...STAFF); const pr = await prjFor(ctx, int(p.id)); const s = pr.service_id ? await one('SELECT code, name FROM services WHERE id=$1', [pr.service_id]) : null;
    send(res, 200, layout(ctx, pr.name, `<nav class="crumb"><a href="/projeler/${pr.id}">${h(pr.name)}</a> › Hizmet kitabı</nav><div class="page-head"><div><p class="eyebrow">${h(s ? s.code + ' · ' + s.name : '')}</p><h1>${h(pr.name)}</h1><div class="chips">${badge('Bu projeye özel', 'warn')}</div></div></div>
${viewHtml(pr.playbook, h, badge)}<details class="card" id="duzenle"><summary>Bu proje için düzenle</summary><p class="muted">Yalnız bu projede geçerlidir. Var olan görevler değişmez; yeni aşama gerekiyorsa projeye görev olarak ekleyin.</p>${editorHtml(pr.playbook, h, `/projeler/${pr.id}/kitap`, csrfField(ctx))}</details>`, '/projeler'));
  });
  route('POST', '/projeler/:id/kitap', async (ctx, res, p) => {
    need(ctx, ...STAFF); const pr = await prjFor(ctx, int(p.id)); await q('UPDATE projects SET playbook=$1 WHERE id=$2', [JSON.stringify(parsePlaybook(ctx.body)), pr.id]);
    await audit(ctx, 'project.playbook', { id: pr.id, edited: true }); redirect(res, `/projeler/${pr.id}/kitap`);
  });

  // aylık hizmet: sonraki dönemi aç (kitap, aşamalar ve aşama sorumluları taşınır)
  route('POST', '/projeler/:id/sonraki-donem', async (ctx, res, p) => {
    need(ctx, ...STAFF); const pr = await prjFor(ctx, int(p.id)); const a = ctx.user.agency_id;
    const s = pr.service_id ? await one('SELECT id, code, billing FROM services WHERE id=$1', [pr.service_id]) : null;
    if (!pr.playbook || !s || s.billing !== 'Aylık') throw new HttpError(400, 'Yalnız aylık bir hizmetten başlatılmış projede kullanılabilir.');
    const np = nextPeriod(pr.name, pr.due_date || pr.created_at);
    const dup = await one('SELECT id FROM projects WHERE agency_id=$1 AND client_id=$2 AND name=$3', [a, pr.client_id, np.name]);
    if (dup) return redirect(res, `/projeler/${dup.id}`);
    const prev = await all('SELECT stage_no, assignee_id FROM tasks WHERE project_id=$1 AND stage_no IS NOT NULL', [pr.id]); const who = Object.fromEntries(prev.map(x => [x.stage_no, x.assignee_id]));
    const plan = planTasks(pr.playbook, np.start, {});
    const r = await one(`INSERT INTO projects (agency_id, client_id, name, due_date, description, service_id, playbook) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [a, pr.client_id, np.name, plan.at(-1)?.due_date || null, pr.description || null, s.id, JSON.stringify(pr.playbook)]);
    for (const x of plan) await q(`INSERT INTO tasks (agency_id, project_id, title, description, due_date, assignee_id, stage_role, stage_decision, stage_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [a, r.id, x.title, x.description, x.due_date, who[x.stage_no] ?? null, x.role, x.decision, x.stage_no]);
    await audit(ctx, 'project.create', { id: r.id, client_id: pr.client_id, from: pr.id, period: np.name });
    await audit(ctx, 'project.playbook', { id: r.id, service: s.code, tasks: plan.length, period: true }); await autoPackages(ctx, r.id, pr.id); redirect(res, `/projeler/${r.id}`);
  });

  // proje sayfasına eklenen kart
  async function projectCard(ctx, pr) {
    const f = csrfField(ctx);
    if (pr.playbook) { const st = stats(pr.playbook); const s = pr.service_id ? await one('SELECT code, name, billing FROM services WHERE id=$1', [pr.service_id]) : null;
      const monthly = s?.billing === 'Aylık'; const np = monthly ? nextPeriod(pr.name, pr.due_date || pr.created_at) : null;
      return `<section class="summary"><h2>Hizmet kitabı${s ? ' · ' + h(s.code + ' ' + s.name) : ''}</h2><p>${h(t`${st.asama} aşama · ${st.gun} gün · ${st.karar} müşteri kararı`)}${st.oran != null ? ' · ' + h(t`yapay zekâ ile %${st.oran}`) : ''}</p><p><a href="/projeler/${pr.id}/kitap">Kitabı aç ve bu proje için düzenle</a></p>
${monthly ? `<form method="post" action="/projeler/${pr.id}/sonraki-donem" class="inline">${f}<button class="ghost">Sonraki ayı başlat: ${h(np.name)}</button></form><p class="muted">Aylık hizmet: kitap, aşamalar ve aşama sorumluları yeni dönem projesine taşınır; bu proje olduğu gibi kalır.</p>` : ''}</section>`; }
    const [svcs, team] = await Promise.all([all(`SELECT s.id, s.code, s.name, (cs.id IS NOT NULL) mine FROM services s LEFT JOIN client_services cs ON cs.service_id=s.id AND cs.client_id=$2 WHERE s.agency_id=$1 AND s.active AND s.playbook IS NOT NULL ORDER BY (cs.id IS NULL), s.code`, [ctx.user.agency_id, pr.client_id]), people(ctx.user.agency_id)]);
    if (!svcs.length) return '';
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    return `<details class="card"><summary>Hizmetten başlat: aşamaları görev olarak aç</summary><form class="stack" method="post" action="/projeler/${pr.id}/hizmet">${f}
<div class="row"><label class="wide">Hizmet<select name="service_id" required>${svcs.map(s => `<option value="${s.id}">${s.mine ? '★ ' : ''}${h(s.code)} · ${h(s.name)}</option>`).join('')}</select></label><label>Başlangıç<input type="date" name="start" value="${today}"></label></div>
<div class="row"><label>Ekip sorumlusu<select name="ekip_id"><option value="">—</option>${team.filter(u => u.role !== 'freelancer').map(u => `<option value="${u.id}"${u.id === ctx.user.id ? ' selected' : ''}>${h(u.name)}</option>`).join('')}</select></label>
<label>Freelancer<select name="freelancer_id"><option value="">—</option>${team.filter(u => u.role === 'freelancer').map(u => `<option value="${u.id}">${h(u.name)}</option>`).join('')}</select></label></div>
<p class="muted">★ müşteriye eklenmiş hizmet; varsa müşteriye özel kitap kullanılır. Kitap projeye kopyalanır, orada ayrıca düzenlenebilir.</p><div><button class="gold">Görevleri aç</button></div></form></details>`;
  }
  return { projectCard };
}
