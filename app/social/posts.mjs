// Arvela Social — Bugün, başlangıç, takvim, gönderi listesi, gönderi düzenleyici, şablon görsel, paylaşım sayfası.
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, opts, badge } from './ui.mjs';
import { esc, nn, int, clip, HttpError, fmtDateTime, fmtTime, toLocalInput, fromLocalInput, dayKey } from './lib.mjs';
import { PLATFORMS, POST_ST, POST_TONE, FORMATS, transition } from './plans.mjs';
export { transition };
import { TEMPLATES, renderSvg } from './templates.mjs';
import { saveImage, mediaDataUri } from './media.mjs';
import { aiPanel, aiReady } from './ai.mjs';
import { avatar, KIND_NAME } from './channels.mjs';
import { REPEATS, createNextRepeat } from './publisher.mjs';
import { onStatus } from './notify.mjs';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const postFor = async (ctx, id) => { const p = await one('SELECT p.*, b.name brand FROM posts p JOIN brands b ON b.id=p.brand_id WHERE p.id=$1 AND p.workspace_id=$2', [int(id), ctx.ws.id]); if (!p) throw new HttpError(404, 'Gönderi bulunamadı.'); return p; };
const plats = (p) => (p.platforms || []).map(k => `<span class="plat">${esc(PLATFORMS[k]?.name || k)}</span>`).join('');
const thumb = (p) => p.media_ids?.length ? `<img src="/medya/${p.media_ids[0]}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px">` : '';
const needBrand = (ctx) => { if (!ctx.brand) throw new HttpError(400, 'Önce bir marka oluşturun.'); };
export const monthCount = async (wsId) => (await one(`SELECT count(*)::int n FROM posts WHERE workspace_id=$1 AND created_at >= date_trunc('month', now()) AND status<>'iptal'`, [wsId])).n;

export function register() {
  // ---------- Bugün ----------
  route('GET', '/', async (ctx, res) => {
    if (!ctx.brand) return redirect(res, '/baslangic');
    const b = ctx.brand.id;
    const [today, week, waiting, revise, cnt, ideas] = await Promise.all([
      all(`SELECT * FROM posts WHERE brand_id=$1 AND status IN ('onaylandi','taslak','onay') AND (scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = (now() AT TIME ZONE 'Europe/Istanbul')::date ORDER BY scheduled_at`, [b]),
      all(`SELECT * FROM posts WHERE brand_id=$1 AND status NOT IN ('iptal','paylasildi') AND scheduled_at > now() AND scheduled_at < now() + interval '7 days' ORDER BY scheduled_at LIMIT 12`, [b]),
      all(`SELECT * FROM posts WHERE brand_id=$1 AND status='onay' ORDER BY scheduled_at NULLS LAST LIMIT 10`, [b]),
      all(`SELECT * FROM posts WHERE brand_id=$1 AND status='duzeltme' ORDER BY scheduled_at NULLS LAST LIMIT 10`, [b]),
      one(`SELECT count(*) FILTER (WHERE status='paylasildi' AND published_at >= date_trunc('month', now()))::int pub, count(*) FILTER (WHERE status NOT IN ('iptal','paylasildi','fikir') AND scheduled_at >= now())::int planned,
        count(*) FILTER (WHERE status NOT IN ('iptal','paylasildi') AND scheduled_at < now())::int late FROM posts WHERE brand_id=$1`, [b]),
      one(`SELECT count(*)::int n FROM posts WHERE brand_id=$1 AND status='fikir'`, [b])]);
    const late = await all(`SELECT * FROM posts WHERE brand_id=$1 AND status NOT IN ('iptal','paylasildi','fikir') AND scheduled_at < now() ORDER BY scheduled_at LIMIT 8`, [b]);
    const row = (p, act) => `<div class="row" style="align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #ECE6DA">${thumb(p)}<div style="flex:1;min-width:200px"><a href="/gonderi/${p.id}"><strong>${esc(p.title || (p.caption || 'Başlıksız').slice(0, 60))}</strong></a><br><span class="muted">${fmtDateTime(p.scheduled_at)} · ${plats(p)}</span></div>${badge(POST_ST[p.status], POST_TONE[p.status])}${act || ''}</div>`;
    const sec = (title, list, empty, act) => `<section class="card"><h2>${title}</h2>${list.length ? list.map(p => row(p, act?.(p))).join('') : `<p class="muted">${empty}</p>`}</section>`;
    send(res, 200, layout(ctx, 'Bugün', `<div class="page-head"><div><h1>Merhaba ${esc(ctx.user.name.split(' ')[0])}</h1><p>${esc(ctx.brand.name)} için bugünün işleri</p></div><div class="row">${aiReady() && ctx.ws.ai_consent_at && ctx.user.role !== 'approver' ? '<a class="btn gold" href="/planla">Aylık plan oluştur</a>' : ''}<a class="btn ghost" href="/takvim">Takvimi aç</a></div></div>
<div class="kpi"><div><b>${cnt.planned}</b><span>planlanmış gönderi</span></div><div><b>${cnt.pub}</b><span>bu ay paylaşıldı</span></div><div><b>${waiting.length}</b><span>onay bekliyor</span></div><div><b>${ideas.n}</b><span>fikir havuzunda</span></div></div>
${late.length ? sec('Zamanı geçti, paylaşılmadı', late, '', p => p.status === 'onaylandi' || !ctx.lim.approvals ? `<a class="btn gold" href="/gonderi/${p.id}/paylas">Paylaş</a>` : '') : ''}
${sec('Bugün paylaşılacaklar', today, 'Bugün için planlanmış gönderi yok.', p => `<a class="btn ${p.status === 'onaylandi' ? 'gold' : 'ghost'}" href="/gonderi/${p.id}/paylas">Paylaş</a>`)}
${ctx.lim.approvals ? sec('Onay bekleyenler', waiting, 'Onay bekleyen gönderi yok.') : ''}${revise.length ? sec('Düzeltme istenenler', revise, '') : ''}
${sec('Önümüzdeki 7 gün', week, 'Önümüzdeki hafta boş. <a href="/gonderi/yeni">Gönderi ekleyin</a> ya da takvimden plan oluşturun.')}`, '/'));
  });

  // ---------- Başlangıç ----------
  route('GET', '/baslangic', async (ctx, res) => {
    const b = ctx.brand; if (!b) return send(res, 200, layout(ctx, 'Başlangıç', `<div class="card"><h1>Hoş geldiniz</h1><p>Başlamak için bir marka oluşturun.</p><form method="post" action="/markalar">${csrf(ctx)}<button class="gold">Marka oluştur</button></form></div>`));
    const full = await one('SELECT * FROM brands WHERE id=$1', [b.id]);
    const [acc, med, posts] = await Promise.all([one('SELECT count(*)::int n FROM accounts WHERE brand_id=$1', [b.id]), one(`SELECT count(*)::int n FROM media WHERE brand_id=$1 AND kind='upload'`, [b.id]), one('SELECT count(*)::int n FROM posts WHERE brand_id=$1', [b.id])]);
    const steps = [[!!(full.offer && full.audience), 'Marka sesini tanımlayın', 'Ne sattığınızı, kime sattığınızı ve nasıl konuştuğunuzu yazın; metinler buna göre yazılır.', `/markalar/${b.id}`],
      [acc.n > 0, 'Sosyal hesaplarınızı ekleyin', 'Hangi platformlarda paylaşacağınızı seçin.', `/markalar/${b.id}`],
      [!!(full.logo_id || Object.keys(full.colors || {}).length), 'Logo ve renklerinizi yükleyin', 'Şablon görseller markanızın renkleriyle üretilir.', `/markalar/${b.id}`],
      [med.n > 0, 'Fotoğraflarınızı yükleyin', 'Ürün, mekân ve ekip fotoğrafları; şablonlar bunları kullanır.', '/medya'],
      [posts.n > 0, 'İlk gönderinizi planlayın', 'Takvimden bir gün seçin ya da yeni gönderi oluşturun.', '/gonderi/yeni']];
    send(res, 200, layout(ctx, 'Başlangıç', `<div class="page-head"><div><h1>Başlangıç</h1><p>Beş adımda ilk ayınız hazır. ${steps.filter(s => s[0]).length} / 5 tamam.</p></div></div>
<section class="card"><div class="steps">${steps.map(([ok, t, d, href]) => `<div class="${ok ? 'done' : ''}"><div style="flex:1"><a href="${href}"><strong>${t}</strong></a><br><span class="muted">${d}</span></div></div>`).join('')}</div></section>`, '/'));
  });

  // ---------- Takvim ----------
  route('GET', '/takvim', async (ctx, res) => {
    if (!ctx.brand) return redirect(res, '/baslangic');
    const sp = ctx.url.searchParams; const now = new Date(Date.now() + 3 * 3600e3); const todayK = now.toISOString().slice(0, 10);
    const week = sp.get('gorunum') === 'hafta'; const canMove = ctx.user.role !== 'approver' && ctx.lim.usable;
    const tagColors = new Map((await all('SELECT name, color FROM tags WHERE workspace_id=$1', [ctx.ws.id])).map(t => [t.name, t.color]));
    const accs = new Map((await all('SELECT * FROM accounts WHERE brand_id=$1', [ctx.brand.id])).map(a => [a.id, a]));
    const chip = (p) => { const tc = (p.tags || []).map(t => tagColors.get(t)).find(Boolean); const av = (p.account_ids || []).map(id => accs.get(id)).filter(Boolean).slice(0, 3);
      return `<a class="chipp ${p.status}"${tc ? ` style="border-left-color:${esc(tc)}"` : ''} href="/gonderi/${p.id}"${canMove && p.status !== 'paylasildi' ? ` draggable="true" data-post="${p.id}"` : ''}><small>${fmtTime(p.scheduled_at)}${p.publish_mode === 'otomatik' ? ' · ⚡' : ''}${p.repeat_rule ? ' · ↻' : ''}</small><span class="chip-av">${av.map(a => avatar(a, 16)).join('')}</span>${esc((p.title || p.caption || 'Başlıksız').slice(0, 48))}</a>`; };
    let from, to, label, prevQ, nextQ, body;
    if (week) {
      const d0 = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('gun') || '') ? new Date(sp.get('gun') + 'T00:00:00Z') : new Date(todayK + 'T00:00:00Z');
      const mon = new Date(d0.getTime() - ((d0.getUTCDay() + 6) % 7) * 864e5); const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 864e5));
      from = days[0]; to = new Date(days[6].getTime() + 864e5);
      label = `${days[0].getUTCDate()} ${MONTHS[days[0].getUTCMonth()]} – ${days[6].getUTCDate()} ${MONTHS[days[6].getUTCMonth()]} ${days[6].getUTCFullYear()}`;
      prevQ = `gorunum=hafta&gun=${new Date(mon.getTime() - 7 * 864e5).toISOString().slice(0, 10)}`; nextQ = `gorunum=hafta&gun=${new Date(mon.getTime() + 7 * 864e5).toISOString().slice(0, 10)}`;
      body = async (byKey) => { const hours = Array.from({ length: 18 }, (_, i) => i + 6);
        return `<div class="wk"><div class="wk-h"></div>${days.map((d, i) => `<div class="wk-h${d.toISOString().slice(0, 10) === todayK ? ' today' : ''}">${DOW[i]} ${d.getUTCDate()}</div>`).join('')}
${hours.map(h => `<div class="wk-t">${String(h).padStart(2, '0')}:00</div>${days.map(d => { const k = d.toISOString().slice(0, 10); const hh = String(h).padStart(2, '0'); const list = (byKey.get(k) || []).filter(p => fmtTime(p.scheduled_at).slice(0, 2) === hh || (h === 6 && fmtTime(p.scheduled_at) < '06') || (h === 23 && fmtTime(p.scheduled_at) > '23'));
  return `<div class="wk-c" data-day="${k}" data-time="${hh}:00">${list.map(chip).join('')}${canMove && !list.length ? `<a class="add" href="/gonderi/yeni?gun=${k}">+</a>` : ''}</div>`; }).join('')}`).join('')}</div>`; };
    } else {
      const ay = /^\d{4}-\d{2}$/.test(sp.get('ay') || '') ? sp.get('ay') : now.toISOString().slice(0, 7);
      const [y, m] = ay.split('-').map(Number); const first = new Date(Date.UTC(y, m - 1, 1)); const startDow = (first.getUTCDay() + 6) % 7;
      const gridStart = new Date(first.getTime() - startDow * 864e5); const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 864e5));
      from = days[0]; to = new Date(days[41].getTime() + 864e5); label = `${MONTHS[m - 1]} ${y}`;
      prevQ = `ay=${new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)}`; nextQ = `ay=${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}`;
      body = async (byKey) => `<div class="cal">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${days.map(d => { const k = d.toISOString().slice(0, 10); const list = byKey.get(k) || [];
        return `<div class="day${d.getUTCMonth() !== m - 1 ? ' out' : ''}${k === todayK ? ' today' : ''}" data-day="${k}"><span class="n">${d.getUTCDate()}</span>${list.map(chip).join('')}${canMove ? `<a class="add" href="/gonderi/yeni?gun=${k}">+ ekle</a>` : ''}</div>`; }).join('')}</div>`;
    }
    const tagF = sp.get('etiket') || ''; const accF = int(sp.get('kanal'));
    const posts = (await all(`SELECT * FROM posts WHERE brand_id=$1 AND status<>'iptal' AND scheduled_at >= $2::timestamptz - interval '3 hours' AND scheduled_at < $3::timestamptz - interval '3 hours' ORDER BY scheduled_at`,
      [ctx.brand.id, from.toISOString(), to.toISOString()])).filter(p => (!tagF || (p.tags || []).includes(tagF)) && (!accF || (p.account_ids || []).includes(accF)));
    const byKey = new Map(); for (const p of posts) { const k = dayKey(p.scheduled_at); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
    const unscheduled = await all(`SELECT * FROM posts WHERE brand_id=$1 AND status NOT IN ('iptal','paylasildi') AND scheduled_at IS NULL ORDER BY id DESC LIMIT 20`, [ctx.brand.id]);
    const keep = (q2) => `/takvim?${q2}${tagF ? '&etiket=' + encodeURIComponent(tagF) : ''}${accF ? '&kanal=' + accF : ''}`;
    send(res, 200, layout(ctx, 'Takvim', `<div class="page-head"><div><h1>${esc(label)}</h1><p>${posts.length} gönderi · ⚡ otomatik paylaşım · ↻ tekrarlayan${canMove ? ' · Gönderileri sürükleyip başka güne taşıyabilirsiniz' : ''}</p></div>
<div class="row"><div class="seg"><a class="${week ? '' : 'on'}" href="/takvim">Ay</a><a class="${week ? 'on' : ''}" href="/takvim?gorunum=hafta">Hafta</a></div><a class="btn ghost" href="${keep(prevQ)}">←</a><a class="btn ghost" href="${keep(week ? 'gorunum=hafta' : '')}">Bugün</a><a class="btn ghost" href="${keep(nextQ)}">→</a></div></div>
${accs.size ? `<div class="cal-filter"><a class="${accF ? '' : 'on'}" href="/takvim${week ? '?gorunum=hafta' : ''}">Tüm kanallar</a>${[...accs.values()].map(a => `<a class="${accF === a.id ? 'on' : ''}" href="/takvim?${week ? 'gorunum=hafta&' : ''}kanal=${a.id}" title="${esc(a.name || a.handle)}">${avatar(a, 22)}</a>`).join('')}${tagColors.size ? `<span class="sep"></span>${[...tagColors.entries()].map(([t, c]) => `<a class="tagp${tagF === t ? ' on' : ''}" style="border-color:${esc(c)}" href="/takvim?${week ? 'gorunum=hafta&' : ''}etiket=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}` : ''}</div>` : ''}
<div data-dnd="${canMove ? 1 : 0}">${canMove ? csrf(ctx) : ''}${await body(byKey)}</div>
${unscheduled.length ? `<section class="card"><h2>Tarihsiz gönderiler ve fikirler</h2>${unscheduled.map(p => `<a class="chipp ${p.status}" href="/gonderi/${p.id}"${canMove ? ` draggable="true" data-post="${p.id}"` : ''}>${esc((p.title || p.caption || 'Başlıksız').slice(0, 80))} <small>${POST_ST[p.status]}</small></a>`).join('')}</section>` : ''}`, '/takvim'));
  });

  // ---------- Liste ----------
  route('GET', '/gonderiler', async (ctx, res) => {
    if (!ctx.brand) return redirect(res, '/baslangic');
    const st = POST_ST[ctx.url.searchParams.get('durum')] ? ctx.url.searchParams.get('durum') : '';
    const rows = await all(`SELECT * FROM posts WHERE brand_id=$1 ${st ? 'AND status=$2' : "AND status<>'iptal'"} ORDER BY scheduled_at DESC NULLS FIRST, id DESC LIMIT 300`, st ? [ctx.brand.id, st] : [ctx.brand.id]);
    send(res, 200, layout(ctx, 'Gönderiler', `<div class="page-head"><div><h1>Gönderiler</h1><p>${rows.length} gönderi</p></div>
<form class="row" method="get" action="/gonderiler"><label>Durum<select name="durum" data-autosubmit><option value="">Tümü (iptal hariç)</option>${opts(POST_ST, st)}</select></label></form></div>
<div class="tbl"><table><tr><th></th><th>Gönderi</th><th>Zaman</th><th>Platform</th><th>Durum</th></tr>${rows.map(p => `<tr><td style="width:72px">${thumb(p)}</td><td><a href="/gonderi/${p.id}">${esc(p.title || (p.caption || 'Başlıksız').slice(0, 70))}</a>${p.pillar ? `<br><span class="muted">${esc(p.pillar)}</span>` : ''}</td>
<td>${p.scheduled_at ? fmtDateTime(p.scheduled_at) : '<span class="muted">Tarihsiz</span>'}</td><td>${plats(p)}</td><td>${badge(POST_ST[p.status], POST_TONE[p.status])}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Gönderi yok.</td></tr>'}</table></div>`, '/gonderiler'));
  });

  // ---------- Yeni / düzenle ----------
  route('GET', '/gonderi/yeni', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); needBrand(ctx);
    const gun = /^\d{4}-\d{2}-\d{2}$/.test(ctx.url.searchParams.get('gun') || '') ? ctx.url.searchParams.get('gun') : '';
    send(res, 200, layout(ctx, 'Yeni gönderi', `<div class="page-head"><div><h1>Yeni gönderi</h1><p>${esc(ctx.brand.name)}</p></div></div>
<form class="card stack" method="post" action="/gonderi/yeni" style="max-width:560px">${csrf(ctx)}<label>Başlık (yalnız sizin için)<input name="title" maxlength="120" placeholder="Kış harmanı lansmanı" autofocus></label>
<label>Gün<input type="date" name="gun" value="${gun}"></label><div><button class="gold">Oluştur ve düzenle</button></div></form>`, '/takvim'));
  });
  route('POST', '/gonderi/yeni', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); needBrand(ctx);
    const n = await monthCount(ctx.ws.id); if (n >= ctx.lim.postsPerMonth) throw new HttpError(402, `Bu ayki gönderi sınırına ulaştınız (${ctx.lim.postsPerMonth}).`);
    const gun = /^\d{4}-\d{2}-\d{2}$/.test(ctx.body.gun || '') ? ctx.body.gun : null;
    const acc = await all('SELECT DISTINCT platform FROM accounts WHERE brand_id=$1', [ctx.brand.id]);
    const best = await one(`SELECT best_times FROM accounts WHERE brand_id=$1 AND best_times IS NOT NULL LIMIT 1`, [ctx.brand.id]);
    const time = (/(\d{2}):(\d{2})/.exec(best?.best_times || '') || [null, '19', '00']).slice(1).join(':');
    const when = gun ? fromLocalInput(`${gun}T${time}`) : null;
    const all_ = await all('SELECT id, platform, kind, status FROM accounts WHERE brand_id=$1', [ctx.brand.id]);
    const live = all_.filter(x => x.kind && x.status === 'bagli'); const pick = live.length ? live : all_; // bağlı kanallar varsayılan seçili
    const sig = await one('SELECT body FROM signatures WHERE brand_id=$1 AND is_default LIMIT 1', [ctx.brand.id]);
    const p = await one(`INSERT INTO posts (workspace_id, brand_id, platforms, account_ids, publish_mode, scheduled_at, status, created_by, title, caption) VALUES ($1,$2,$3,$4,$5,$6,'taslak',$7,$8,$9) RETURNING id`,
      [ctx.ws.id, ctx.brand.id, [...new Set(pick.map(a => a.platform))].slice(0, 7), pick.map(a => a.id), live.length ? 'otomatik' : 'elle', when, ctx.user.id, clip(nn(ctx.body.title), 120), sig ? '\n\n' + sig.body : null]);
    await audit(ctx, 'post.create', { id: p.id }); redirect(res, `/gonderi/${p.id}`);
  });
  route('GET', '/gonderi/:id', async (ctx, res, pr) => {
    const p = await postFor(ctx, pr.id); const f = csrf(ctx); const edit = ctx.user.role !== 'approver' && !['paylasildi'].includes(p.status) && ctx.lim.usable;
    const brand = await one('SELECT pillars FROM brands WHERE id=$1', [p.brand_id]); const notes = await all('SELECT * FROM post_notes WHERE post_id=$1 ORDER BY id DESC LIMIT 30', [p.id]);
    const max = Math.min(...(p.platforms?.length ? p.platforms : ['instagram']).map(k => PLATFORMS[k]?.max || 2200));
    const acts = [['onaya', 'Onaya gönder', 'gold'], ['onayla', 'Onayla', 'gold'], ['taslak', 'Taslağa al', 'ghost'], ['iptal', 'İptal et', 'danger']]
      .filter(([a]) => !transition(a, p, ctx.user.role, ctx.lim).error);
    const canRevise = !transition('duzeltme', p, ctx.user.role, ctx.lim).error;
    const lastRev = p.status === 'duzeltme' ? await one(`SELECT author, body, created_at FROM post_notes WHERE post_id=$1 AND kind IN ('duzeltme','musteri') ORDER BY id DESC LIMIT 1`, [p.id]) : null;
    const panel = await aiPanel(ctx, p, ctx.url.searchParams.get('yz'));
    const accs = await all('SELECT * FROM accounts WHERE brand_id=$1 ORDER BY (kind IS NULL), platform, id', [p.brand_id]);
    const sigs = await all('SELECT id, name, body, is_default FROM signatures WHERE brand_id=$1 ORDER BY is_default DESC, name', [p.brand_id]);
    const wsTags = await all('SELECT name, color FROM tags WHERE workspace_id=$1 ORDER BY name', [ctx.ws.id]);
    const targets = await all('SELECT t.*, a.name, a.platform FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.post_id=$1 ORDER BY t.id', [p.id]);
    const firstImg = p.media_ids?.[0]; const selected = new Set(p.account_ids || []);
    const prevPlats = [...new Set(accs.filter(a => selected.has(a.id)).map(a => a.platform))].filter(k => ['instagram', 'facebook', 'linkedin'].includes(k));
    const anyAuto = accs.some(a => a.kind && a.status === 'bagli');
    send(res, 200, layout(ctx, p.title || 'Gönderi', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/takvim">Takvim</a> · ${esc(p.brand)}</p><h1>${esc(p.title || 'Yeni gönderi')}</h1>
<p>${badge(POST_ST[p.status], POST_TONE[p.status])} ${p.scheduled_at ? fmtDateTime(p.scheduled_at) : 'Tarihsiz'} ${p.publish_mode === 'otomatik' ? badge('Otomatik paylaşım', 'gold') : ''} ${p.repeat_rule ? badge(REPEATS[p.repeat_rule] || 'Tekrar', 'muted') : ''} ${(p.tags || []).map(t => `<span class="tagp">${esc(t)}</span>`).join(' ')} ${p.ai ? badge('Yapay zekâ taslağı', 'gold') : ''} ${p.editor_status === 'bekliyor' ? badge('Editör kontrolünde', 'warn') : p.editor_status === 'kontrol_edildi' ? badge('Editör kontrol etti', 'ok') : ''}</p></div>
<div class="row">${ctx.ws.editor_service && edit && p.caption && p.editor_status !== 'bekliyor' ? `<form method="post" action="/gonderi/${p.id}/editore">${f}<button class="ghost">Editör kontrolüne gönder</button></form>` : ''}${ctx.user.role !== 'approver' && ctx.lim.usable ? `<form method="post" action="/gonderi/${p.id}/cogalt">${f}<button class="ghost">Çoğalt</button></form>` : ''}${p.status !== 'iptal' && p.publish_mode !== 'otomatik' ? `<a class="btn ${p.status === 'onaylandi' ? 'gold' : 'ghost'}" href="/gonderi/${p.id}/paylas">Paylaşım sayfası</a>` : ''}${acts.map(([a, l, t]) => `<form method="post" action="/gonderi/${p.id}/durum">${f}<input type="hidden" name="action" value="${a}"><button class="${t}">${l}</button></form>`).join('')}</div></div>
${lastRev ? `<div class="err"><strong>Düzeltme istendi</strong> · ${esc(lastRev.author || '')} · ${fmtDateTime(lastRev.created_at)}<br><span style="white-space:pre-wrap">${esc(lastRev.body)}</span></div>` : ''}
${canRevise ? `<details class="card"${p.status === 'onay' && ctx.user.role === 'approver' ? ' open' : ''}><summary style="cursor:pointer;font-weight:600">Düzeltme iste</summary><form class="stack" method="post" action="/gonderi/${p.id}/durum" style="margin-top:12px">${f}<input type="hidden" name="action" value="duzeltme"><label>Neyin değişmesini istiyorsunuz?<textarea name="comment" rows="2" maxlength="1000" required placeholder="Metin biraz uzun, fiyatı çıkaralım; görselde logo daha görünür olsun."></textarea></label><div><button class="ghost">Düzeltme iste</button></div></form></details>` : ''}
<div class="grid2" style="align-items:start"><form class="card stack" method="post" action="/gonderi/${p.id}">${f}
<label>Başlık (yalnız sizin için)<input name="title" maxlength="120" value="${esc(p.title || '')}"${edit ? '' : ' disabled'}></label>
<fieldset class="chan-sel"><legend>Kanallar</legend>${accs.length ? `<div class="chan-chips">${accs.map(a => `<label class="chan-chip${a.kind ? '' : ' manual'}" title="${esc(a.kind ? KIND_NAME[a.kind] : 'Elle paylaşım')}"><input type="checkbox" name="account_ids" value="${a.id}" data-max="${PLATFORMS[a.platform]?.max || 2200}" data-plat="${esc(a.platform)}"${selected.has(a.id) ? ' checked' : ''}${edit ? '' : ' disabled'}>${avatar(a, 30)}<span>${esc(a.name || a.handle)}<small>${esc(PLATFORMS[a.platform]?.name || a.platform)}${a.kind ? '' : ' · elle'}${a.kind && a.status !== 'bagli' ? ' · bağlantı koptu' : ''}</small></span></label>`).join('')}</div>` : `<p class="muted" style="margin:0">Bu markada kanal yok. <a href="/kanallar">Kanal bağlayın</a>.</p>`}</fieldset>
<div class="row"><label>Paylaşım<select name="mode"${edit ? '' : ' disabled'}><option value="otomatik"${p.publish_mode === 'otomatik' ? ' selected' : ''}${anyAuto ? '' : ' disabled'}>Zamanı gelince otomatik paylaş${anyAuto ? '' : ' (bağlı kanal yok)'}</option><option value="elle"${p.publish_mode !== 'otomatik' ? ' selected' : ''}>Hatırlat, elle paylaşırım</option></select></label>
<label>Tekrar<select name="repeat_rule"${edit ? '' : ' disabled'}><option value="">Tekrar yok</option>${opts(REPEATS, p.repeat_rule)}</select></label><label>Tekrar bitişi<input type="date" name="repeat_until" value="${p.repeat_until ? String(p.repeat_until).slice(0, 10) : ''}"${edit ? '' : ' disabled'}></label></div>
<div class="row"><label>Paylaşım zamanı<input type="datetime-local" name="scheduled_at" value="${toLocalInput(p.scheduled_at)}"${edit ? '' : ' disabled'}></label><label>Biçim<select name="format"${edit ? '' : ' disabled'}>${opts(Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, v.name])), p.format)}</select></label>
<label>İçerik sütunu<select name="pillar"${edit ? '' : ' disabled'}><option value="">—</option>${opts(Object.fromEntries((brand.pillars || []).map(x => [x, x])), p.pillar)}</select></label></div>
<label>Metin <span class="count" id="cap-count"></span><textarea id="caption" name="caption" rows="9" maxlength="63206" data-count="#cap-count" data-max="${max}"${edit ? '' : ' disabled'}>${esc(p.caption || '')}</textarea></label>
${edit && sigs.length ? `<div class="row" style="align-items:end"><label>İmza<select id="sig-pick">${sigs.map(g => `<option value="${esc(g.body)}">${esc(g.name)}${g.is_default ? ' (varsayılan)' : ''}</option>`).join('')}</select></label><button type="button" class="ghost" data-sig="#sig-pick" data-target="#caption">İmzayı ekle</button></div>` : ''}
<label>Hashtag'ler<input id="hashtags" name="hashtags" maxlength="600" value="${esc(p.hashtags || '')}" placeholder="#kahve #moda"${edit ? '' : ' disabled'}></label>
<label>Etiketler (iç takip; virgülle)<input name="tags" maxlength="200" list="tag-list" value="${esc((p.tags || []).join(', '))}" placeholder="kampanya, kış"${edit ? '' : ' disabled'}><datalist id="tag-list">${wsTags.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist></label>
<label>İlk yorum (isteğe bağlı)<textarea name="first_comment" rows="2" maxlength="2200"${edit ? '' : ' disabled'}>${esc(p.first_comment || '')}</textarea></label>
<label>Görsel fikri / çekim notu<textarea name="visual_brief" rows="2" maxlength="1000"${edit ? '' : ' disabled'}>${esc(p.visual_brief || '')}</textarea></label>
${edit ? `<div class="row"><button class="gold">Kaydet</button><button class="ghost" formaction="/gonderi/${p.id}/kisalt" formnovalidate title="Metindeki bağlantıları tıklama takipli kısa linke çevirir (önce kaydedin)">Bağlantıları kısalt</button></div>` : ''}</form>
<div class="stack">${targets.length || p.publish_error ? `<section class="card"><h2>Paylaşım durumu</h2>${p.publish_error ? `<div class="err">${esc(p.publish_error)}</div>` : ''}${targets.map(t => `<div class="row" style="justify-content:space-between;border-top:1px solid #ECE6DA;padding-top:8px"><span><strong>${esc(t.name)}</strong> <span class="muted">${esc(PLATFORMS[t.platform]?.name || t.platform)}</span>${t.error && t.status !== 'paylasildi' ? `<br><span class="muted">${esc(t.error)}</span>` : ''}</span>
<span>${t.status === 'paylasildi' ? `${badge('Paylaşıldı', 'ok')}${t.url ? ` <a href="${esc(t.url)}" target="_blank" rel="noopener">Gönderiyi aç</a>` : ''}` : t.status === 'hata' ? badge(t.attempts >= 3 ? 'Başarısız' : `Yeniden denenecek (${t.attempts}/3)`, t.attempts >= 3 ? 'bad' : 'warn') : badge('Bekliyor', 'muted')}</span></div>`).join('')}
${edit && (p.publish_error || targets.some(t => t.status === 'hata')) ? `<form method="post" action="/gonderi/${p.id}/yeniden" style="margin-top:10px">${f}<button class="gold">Yeniden dene</button></form>` : ''}</section>` : ''}
${prevPlats.length ? `<section class="card"><h2>Önizleme</h2><div class="pv-tabs">${prevPlats.map((k, i) => `<button type="button" class="pv-tab${i ? '' : ' on'}" data-pv-tab="${k}">${esc(PLATFORMS[k].name)}</button>`).join('')}</div>
${prevPlats.map((k, i) => { const a = accs.find(x => selected.has(x.id) && x.platform === k); return `<div class="pv pv-${k}" data-pv="${k}"${i ? ' hidden' : ''}><div class="pv-h">${avatar(a, 32)}<div><strong>${esc(a.name || a.handle)}</strong><small>${k === 'linkedin' ? 'Şimdi · 🌐' : k === 'facebook' ? 'Şimdi · Herkese açık' : esc(a.handle || '')}</small></div></div>
${k === 'instagram' ? `${firstImg ? `<img class="pv-img" src="/medya/${firstImg}" alt="">` : '<div class="pv-img pv-empty">Instagram gönderisi için görsel gerekli</div>'}<p class="pv-t"><strong>${esc((a.handle || a.name || '').replace(/^@/, ''))}</strong> <span data-pv-text></span></p>`
  : `<p class="pv-t" data-pv-text></p>${firstImg ? `<img class="pv-img" src="/medya/${firstImg}" alt="">` : ''}`}</div>`; }).join('')}<p class="muted" style="margin:8px 0 0;font-size:12px">Yaklaşık görünüm; platform metni kısaltabilir.</p></section>` : ''}
${panel}<section class="card"><h2>Görseller</h2>${p.media_ids?.length ? `<div class="thumbs">${p.media_ids.map((id, i) => `<div style="text-align:center"><a href="/medya/${id}" target="_blank"><img src="/medya/${id}" alt="Görsel ${i + 1}"></a>${edit ? `<form method="post" action="/gonderi/${p.id}/gorsel-cikar">${f}<input type="hidden" name="media_id" value="${id}"><button class="ghost" style="padding:2px 8px;font-size:12px">Çıkar</button></form>` : ''}</div>`).join('')}</div>` : '<p class="muted">Henüz görsel yok.</p>'}
${edit ? `<div class="row"><a class="btn" href="/gonderi/${p.id}/sablon">Şablondan görsel üret</a><a class="btn ghost" href="/gonderi/${p.id}/kutuphane">Kütüphaneden seç</a></div>
<form class="row" method="post" action="/medya" enctype="multipart/form-data" data-jpeg>${f}<input type="hidden" name="back" value="/gonderi/${p.id}"><label>Fotoğraf yükle<input type="file" name="files" accept="image/*" multiple required></label><button class="ghost">Yükle</button></form>` : ''}</section>
<section class="card"><h2>Notlar</h2><form class="stack" method="post" action="/gonderi/${p.id}/not">${f}<textarea name="body" rows="2" maxlength="2000" required placeholder="Ekibe not ya da düzeltme isteği"></textarea><div><button class="ghost">Not ekle</button></div></form>
${notes.map(n => `<div style="border-top:1px solid #ECE6DA;padding-top:8px"><strong>${esc(n.author || '')}</strong> <span class="muted">${fmtDateTime(n.created_at)}${n.kind !== 'not' ? ' · ' + esc({ durum: 'durum', duzeltme: 'düzeltme isteği', musteri: 'müşteri', editor: 'Arvela editör' }[n.kind] || n.kind) : ''}</span><p style="margin:4px 0;white-space:pre-wrap">${esc(n.body)}</p></div>`).join('')}</section></div></div>`, '/takvim'));
  });
  route('POST', '/gonderi/:id', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id); const b = ctx.body;
    if (p.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi değiştirilemez.');
    const accs = await all('SELECT id, platform, kind, status FROM accounts WHERE brand_id=$1', [p.brand_id]);
    const ids = [...new Set([].concat(b.account_ids || []).map(Number))].filter(id => accs.some(a => a.id === id));
    const platforms = [...new Set(ids.map(id => accs.find(a => a.id === id).platform))].filter(k => PLATFORMS[k]);
    const mode = b.mode === 'otomatik' && ids.some(id => accs.find(a => a.id === id).kind) ? 'otomatik' : 'elle';
    const tags = [...new Set(String(b.tags || '').split(',').map(t => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 8);
    for (const t of tags) await q('INSERT INTO tags (workspace_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ctx.ws.id, t]);
    const repeat = REPEATS[b.repeat_rule] ? b.repeat_rule : null; const until = repeat && /^\d{4}-\d{2}-\d{2}$/.test(b.repeat_until || '') ? b.repeat_until : null;
    const when = b.scheduled_at ? fromLocalInput(b.scheduled_at) : null; if (b.scheduled_at && !when) throw new HttpError(400, 'Paylaşım zamanı geçersiz.');
    // onaylanmış gönderi değişirse yeniden onaya düşer
    const changed = (p.caption || '') !== (b.caption || '') || String(p.scheduled_at || '') !== String(when || '');
    const st = p.status === 'onaylandi' && changed && ctx.lim.approvals ? 'taslak' : p.status;
    await q(`UPDATE posts SET title=$1, platforms=$2, scheduled_at=$3, format=$4, pillar=$5, caption=$6, hashtags=$7, first_comment=$8, visual_brief=$9, status=$10, account_ids=$11, publish_mode=$12, tags=$13, repeat_rule=$14, repeat_until=$15, publish_error=NULL, updated_at=now() WHERE id=$16`,
      [clip(nn(b.title), 120), platforms, when, FORMATS[b.format] ? b.format : 'kare', clip(nn(b.pillar), 60), clip(b.caption ?? '', 63206), clip(nn(b.hashtags), 600), clip(nn(b.first_comment), 2200), clip(nn(b.visual_brief), 1000), st, ids, mode, tags, repeat, until, p.id]);
    await q(`DELETE FROM post_targets WHERE post_id=$1 AND status<>'paylasildi' AND NOT (account_id = ANY($2::int[]))`, [p.id, ids]);
    if (st !== p.status) await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,'durum','Onaylı metin ya da zaman değişti; yeniden onay gerekiyor.')`, [p.id, ctx.user.id, ctx.user.name]);
    await audit(ctx, 'post.update', { id: p.id }); redirect(res, `/gonderi/${p.id}`);
  });
  route('POST', '/gonderi/:id/durum', async (ctx, res, pr) => {
    const p = await postFor(ctx, pr.id); if (!['duzeltme', 'onayla'].includes(ctx.body.action)) needUsable(ctx);
    const t = transition(ctx.body.action, p, ctx.user.role, ctx.lim); if (t.error) throw new HttpError(400, t.error);
    if (t.to === 'onay' && !p.caption) throw new HttpError(400, 'Onaya göndermeden önce metni yazın.');
    const comment = clip(nn(ctx.body.comment), 1000); if (t.to === 'duzeltme' && !comment) throw new HttpError(400, 'Neyin düzeltilmesini istediğinizi yazın.');
    await q(`UPDATE posts SET status=$1, updated_at=now()${t.to === 'paylasildi' ? ', published_at=now(), published_by=$3' : ''} WHERE id=$2`, t.to === 'paylasildi' ? [t.to, p.id, ctx.user.id] : [t.to, p.id]);
    await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,$4,$5)`, [p.id, ctx.user.id, ctx.user.name, t.to === 'duzeltme' ? 'duzeltme' : 'durum', t.to === 'duzeltme' ? comment : `${POST_ST[p.status]} → ${POST_ST[t.to]}${comment ? ': ' + comment : ''}`]);
    if (t.to === 'paylasildi') await createNextRepeat(p);
    if (t.to === 'onay' && ctx.ws.editor_service) await q(`UPDATE posts SET editor_status='bekliyor' WHERE id=$1 AND editor_status IS DISTINCT FROM 'bekliyor'`, [p.id]);
    await onStatus({ ...ctx.ws, lim: ctx.lim }, p, t.to, { actorId: ctx.user.id, actorName: ctx.user.name, comment });
    await audit(ctx, 'post.status', { id: p.id, from: p.status, to: t.to }); redirect(res, ctx.body.back === 'paylas' ? `/gonderi/${p.id}/paylas` : `/gonderi/${p.id}`);
  });
  route('POST', '/gonderi/:id/editore', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id);
    if (!ctx.ws.editor_service) throw new HttpError(402, 'İnsan editör kontrolü bir eklentidir; Paket sayfasından isteyebilirsiniz.');
    if (!p.caption) throw new HttpError(400, 'Önce metni yazın.'); if (p.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi.');
    await q(`UPDATE posts SET editor_status='bekliyor' WHERE id=$1`, [p.id]);
    await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,'durum','Editör kontrolüne gönderildi.')`, [p.id, ctx.user.id, ctx.user.name]);
    await audit(ctx, 'post.editor', { id: p.id }); redirect(res, `/gonderi/${p.id}`);
  });
  route('POST', '/gonderi/:id/yeniden', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id);
    if (p.status === 'paylasildi') throw new HttpError(400, 'Gönderi zaten paylaşıldı.');
    await q(`UPDATE post_targets SET attempts=0, next_try=NULL, error=NULL, status='bekliyor' WHERE post_id=$1 AND status='hata'`, [p.id]);
    await q('UPDATE posts SET publish_error=NULL WHERE id=$1', [p.id]); await audit(ctx, 'post.retry', { id: p.id }); redirect(res, `/gonderi/${p.id}`);
  });
  route('POST', '/gonderi/:id/cogalt', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id);
    if (await monthCount(ctx.ws.id) >= ctx.lim.postsPerMonth) throw new HttpError(402, `Bu ayki gönderi sınırına ulaştınız (${ctx.lim.postsPerMonth}).`);
    const c = await one(`INSERT INTO posts (workspace_id, brand_id, platforms, account_ids, publish_mode, status, title, caption, hashtags, first_comment, visual_brief, pillar, format, template, template_data, media_ids, tags, created_by)
      SELECT workspace_id, brand_id, platforms, account_ids, publish_mode, 'taslak', COALESCE(title, '') || ' (kopya)', caption, hashtags, first_comment, visual_brief, pillar, format, template, template_data, media_ids, tags, $2 FROM posts WHERE id=$1 RETURNING id`, [p.id, ctx.user.id]);
    await audit(ctx, 'post.duplicate', { from: p.id, id: c.id }); redirect(res, `/gonderi/${c.id}`);
  });
  route('POST', '/gonderi/:id/zaman', async (ctx, res, pr) => { // takvimde sürükle-bırak
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id);
    if (p.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi taşınamaz.');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(ctx.body.gun || '') ? ctx.body.gun : null; if (!day) throw new HttpError(400, 'Gün geçersiz.');
    const hm = /^([01]\d|2[0-3]):[0-5]\d$/.test(ctx.body.saat || '') ? ctx.body.saat : (p.scheduled_at ? toLocalInput(p.scheduled_at).slice(11, 16) : '19:00');
    const when = fromLocalInput(`${day}T${hm}`); const st = p.status === 'onaylandi' && ctx.lim.approvals ? 'taslak' : p.status;
    await q('UPDATE posts SET scheduled_at=$1, status=$2, updated_at=now() WHERE id=$3', [when, st, p.id]);
    if (st !== p.status) await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,'durum','Zaman değişti; yeniden onay gerekiyor.')`, [p.id, ctx.user.id, ctx.user.name]);
    await audit(ctx, 'post.move', { id: p.id }); send(res, 200, JSON.stringify({ ok: true, reapprove: st !== p.status }), 'application/json; charset=utf-8');
  });
  route('POST', '/gonderi/:id/not', async (ctx, res, pr) => {
    const p = await postFor(ctx, pr.id); if (!nn(ctx.body.body)) throw new HttpError(400, 'Not boş olamaz.');
    await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,'not',$4)`, [p.id, ctx.user.id, ctx.user.name, clip(ctx.body.body, 2000)]); redirect(res, `/gonderi/${p.id}`);
  });
  route('POST', '/gonderi/:id/gorsel-cikar', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); const p = await postFor(ctx, pr.id);
    await q('UPDATE posts SET media_ids = array_remove(media_ids, $1::int), updated_at=now() WHERE id=$2', [int(ctx.body.media_id), p.id]); redirect(res, `/gonderi/${p.id}`);
  });
  route('GET', '/gonderi/:id/kutuphane', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); const p = await postFor(ctx, pr.id);
    const rows = await all(`SELECT id FROM media WHERE workspace_id=$1 AND brand_id=$2 AND kind<>'logo' ORDER BY id DESC LIMIT 120`, [ctx.ws.id, p.brand_id]);
    send(res, 200, layout(ctx, 'Görsel seç', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/gonderi/${p.id}">Gönderiye dön</a></p><h1>Kütüphaneden görsel seç</h1></div></div>
<form class="stack" method="post" action="/gonderi/${p.id}/kutuphane">${csrf(ctx)}<div class="media-grid">${rows.map(m => `<figure><label style="display:block;cursor:pointer"><img src="/medya/${m.id}" alt="" loading="lazy"><figcaption><span><input type="checkbox" name="media" value="${m.id}"${p.media_ids?.includes(m.id) ? ' checked disabled' : ''}> Seç</span></figcaption></label></figure>`).join('') || '<p class="muted">Kütüphane boş.</p>'}</div>
<div><button class="gold">Seçilenleri ekle</button></div></form>`, '/takvim'));
  });
  route('POST', '/gonderi/:id/kutuphane', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); const p = await postFor(ctx, pr.id);
    const ids = [].concat(ctx.body.media || []).map(int).filter(Boolean);
    const ok = ids.length ? (await all('SELECT id FROM media WHERE id = ANY($1::int[]) AND workspace_id=$2', [ids, ctx.ws.id])).map(r => r.id) : [];
    const merged = [...new Set([...(p.media_ids || []), ...ok])].slice(0, 10);
    await q('UPDATE posts SET media_ids=$1, updated_at=now() WHERE id=$2', [merged, p.id]); redirect(res, `/gonderi/${p.id}`);
  });

  // ---------- Şablon görsel ----------
  const tplData = (sp) => ({ baslik: clip(sp.get('baslik'), 200) || '', alt: clip(sp.get('alt'), 200) || '', cta: clip(sp.get('cta'), 32) || '', maddeler: clip(sp.get('maddeler'), 600) || '', ust: clip(sp.get('ust'), 40) || '' });
  route('GET', '/gonderi/:id/sablon', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); const p = await postFor(ctx, pr.id); const d = p.template_data || {};
    const photos = await all(`SELECT id FROM media WHERE workspace_id=$1 AND brand_id=$2 AND kind='upload' ORDER BY id DESC LIMIT 40`, [ctx.ws.id, p.brand_id]);
    const tpl = p.template || 'kapak'; const photo = d.photo || p.media_ids?.[0] || photos[0]?.id || '';
    send(res, 200, layout(ctx, 'Şablon görsel', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/gonderi/${p.id}">Gönderiye dön</a></p><h1>Şablondan görsel</h1><p>Markanızın renkleri, yazı stili ve logosuyla. Renkleri Markalar sayfasından değiştirebilirsiniz.</p></div></div>
<div class="grid2" style="align-items:start"><form id="tpl-form" class="card stack">${csrf(ctx)}
<fieldset style="border:0;padding:0;margin:0"><legend class="muted" style="font-size:13px;font-weight:600;margin-bottom:6px">Şablon</legend><div class="tpl-grid">${Object.entries(TEMPLATES).map(([k, v]) => `<label><input type="radio" name="sablon" value="${k}"${k === tpl ? ' checked' : ''}> ${esc(v.name)}</label>`).join('')}</div></fieldset>
<label>Biçim<select name="bicim">${opts(Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, v.name])), p.format)}</select></label>
<label>Üst etiket (duyuru)<input name="ust" maxlength="40" value="${esc(d.ust || '')}" placeholder="YENİ"></label>
<label>Başlık<textarea name="baslik" rows="2" maxlength="200">${esc(d.baslik || p.title || '')}</textarea></label>
<label>Alt metin<input name="alt" maxlength="200" value="${esc(d.alt || '')}"></label>
<label>Düğme metni (kampanya)<input name="cta" maxlength="32" value="${esc(d.cta || '')}" placeholder="Hemen dene"></label>
<label>Maddeler (liste; her satıra bir, en çok 5)<textarea name="maddeler" rows="4" maxlength="600">${esc(d.maddeler || '')}</textarea></label>
<label>Fotoğraf<select name="foto"><option value="">Fotoğrafsız</option>${photos.map((m, i) => `<option value="${m.id}"${String(m.id) === String(photo) ? ' selected' : ''}>Fotoğraf ${photos.length - i} (#${m.id})</option>`).join('')}</select></label>
${photos.length ? '' : '<p class="muted">Fotoğraflı şablonlar için önce <a href="/medya">Medya</a> sayfasından fotoğraf yükleyin.</p>'}</form>
<div class="stack"><div class="preview" data-render="/gonderi/${p.id}/sablon.svg"></div><div class="row"><button class="gold" data-save-png="/gonderi/${p.id}/sablon">Görseli kaydet ve gönderiye ekle</button></div></div></div>`, '/takvim'));
  });
  route('GET', '/gonderi/:id/sablon.svg', async (ctx, res, pr) => {
    const p = await postFor(ctx, pr.id); const sp = ctx.url.searchParams; const brand = await one('SELECT * FROM brands WHERE id=$1', [p.brand_id]);
    const photo = sp.get('foto') ? await mediaDataUri(ctx.ws.id, sp.get('foto')) : null; const logo = brand.logo_id ? await mediaDataUri(ctx.ws.id, brand.logo_id) : null;
    const tpl = TEMPLATES[sp.get('sablon')] ? sp.get('sablon') : 'kapak'; const format = FORMATS[sp.get('bicim')] ? sp.get('bicim') : p.format;
    const data = tplData(sp);
    if (ctx.user.role !== 'approver') await q('UPDATE posts SET template=$1, template_data=$2, format=$3 WHERE id=$4', [tpl, JSON.stringify({ ...data, photo: int(sp.get('foto')) }), format, p.id]);
    send(res, 200, renderSvg({ template: tpl, format, data, brand, photo, logo }), 'image/svg+xml', { 'Cache-Control': 'no-store' });
  });
  route('POST', '/gonderi/:id/sablon', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx); const p = await postFor(ctx, pr.id);
    const f = ctx.files.find(x => x.field === 'file'); if (!f) throw new HttpError(400, 'Görsel gelmedi.');
    const m = await saveImage(ctx, f.data, `sablon-${p.id}.png`, 'render', p.brand_id);
    await q('UPDATE posts SET media_ids = array_prepend($1::int, media_ids), updated_at=now() WHERE id=$2', [m.id, p.id]);
    await audit(ctx, 'post.render', { id: p.id, media: m.id }); send(res, 200, JSON.stringify({ redirect: `/gonderi/${p.id}` }), 'application/json');
  });

  // ---------- Paylaşım sayfası (telefon için) ----------
  route('GET', '/gonderi/:id/paylas', async (ctx, res, pr) => {
    const p = await postFor(ctx, pr.id); const f = csrf(ctx);
    const acc = await all('SELECT platform, handle FROM accounts WHERE brand_id=$1 AND platform = ANY($2::text[])', [p.brand_id, p.platforms || []]);
    const text = [p.caption, p.hashtags].filter(Boolean).join('\n\n');
    const canPub = !transition('paylasildi', p, ctx.user.role, ctx.lim).error;
    send(res, 200, layout(ctx, 'Paylaş', `<div class="page-head"><div><p class="muted" style="margin:0"><a href="/gonderi/${p.id}">Gönderiye dön</a></p><h1>Paylaşım</h1><p>${p.scheduled_at ? fmtDateTime(p.scheduled_at) : 'Tarihsiz'} · ${plats(p)} ${badge(POST_ST[p.status], POST_TONE[p.status])}</p></div></div>
${p.status !== 'onaylandi' && ctx.lim.approvals && p.status !== 'paylasildi' ? '<div class="note">Bu gönderi henüz onaylanmadı.</div>' : ''}
<div class="grid2" style="align-items:start"><section class="card"><h2>1. Görselleri indirin</h2>${p.media_ids?.length ? `<div class="thumbs">${p.media_ids.map((id, i) => `<a href="/medya/${id}?indir=1"><img src="/medya/${id}" alt="Görsel ${i + 1}"></a>`).join('')}</div><p class="muted">Görsele dokunun; telefonunuza kaydedilir.</p>` : '<p class="muted">Görsel yok.</p>'}</section>
<section class="card"><h2>2. Metni kopyalayın</h2><textarea id="share-text" rows="8" readonly>${esc(text)}</textarea><div><button class="gold" data-copy="#share-text">Metni kopyala</button></div>
${p.first_comment ? `<label>İlk yorum<textarea id="share-comment" rows="2" readonly>${esc(p.first_comment)}</textarea></label><div><button class="ghost" data-copy="#share-comment">Yorumu kopyala</button></div>` : ''}</section>
<section class="card"><h2>3. Paylaşın</h2><p class="muted">Uygulamayı açın, görseli seçin ve metni yapıştırın.</p>${acc.map(a => `<p><strong>${esc(PLATFORMS[a.platform]?.name || a.platform)}</strong> · ${esc(a.handle)}</p>`).join('') || '<p class="muted">Bu platformlar için hesap eklenmemiş.</p>'}
${canPub ? `<form method="post" action="/gonderi/${p.id}/durum">${f}<input type="hidden" name="action" value="paylasildi"><input type="hidden" name="back" value="paylas"><button class="gold">Paylaştım, işaretle</button></form>` : p.status === 'paylasildi' ? `<div class="flash">Paylaşıldı: ${fmtDateTime(p.published_at)}</div>` : ''}</section></div>`, '/takvim'));
  });
}
