// Arvela Social — yapay zekâ: Claude ile aylık plan ve metin seçenekleri, Agency paketinde görsel üretimi.
// KVKK: ilk kullanımdan önce hesap sahibinin açık rızası alınır (yurt dışına aktarım: Anthropic, ABD). E-posta ve telefon numaraları gönderilmeden maskelenir.
import { route, send, redirect, audit, need, needUsable } from './server.mjs';
import { one, all, q } from './db.mjs';
import { layout, csrf, badge } from './ui.mjs';
import { esc, nn, int, clip, HttpError, fmtDateTime, fromLocalInput } from './lib.mjs';
import { PLATFORMS, FORMATS, POST_ST } from './plans.mjs';
import { saveImage } from './media.mjs';

export const MODEL = () => process.env.SOCIAL_AI_MODEL || 'claude-sonnet-5-5';
const MOCK = () => process.env.SOCIAL_AI_MOCK === '1';
export const aiReady = () => MOCK() || !!process.env.ANTHROPIC_API_KEY;
export const imageReady = () => MOCK() || !!process.env.OPENAI_API_KEY;
import { MONTHS, OPS, maskPII, extractJson, planPrompt, textPrompt, normalizePlan, normalizeOptions } from './ai-core.mjs';
export { OPS, maskPII, extractJson, brandBrief, planPrompt, textPrompt, normalizePlan, normalizeOptions } from './ai-core.mjs';

// ---------- Sağlayıcılar ----------
function mockClaude(prompt) {
  if (prompt.includes('"gonderiler"')) {
    const month = /(\d{4})-(\d{2})/.exec(prompt.match(/Tarihler (\d{4}-\d{2})/)?.[1] || '')?.[0] || new Date().toISOString().slice(0, 7);
    const count = Number(prompt.match(/için (\d+) gönderilik/)?.[1] || 4); const keys = prompt.match(/anahtarlar: ([a-z, ]+)\)/)?.[1].split(', ') || ['instagram'];
    return JSON.stringify({ gonderiler: Array.from({ length: count }, (_, i) => ({ tarih: `${month}-${String(Math.min(28, 3 + i * 3)).padStart(2, '0')}`, saat: '19:30', platformlar: [keys[i % keys.length]],
      sutun: 'Ürün', baslik: `Deneme gönderisi ${i + 1}`, metin: `Deneme metni ${i + 1}: kış için sıcak bir öneri ☕`, etiketler: '#deneme #arvela', gorsel_fikri: 'Buharlı fincan, sabah ışığı', sablon: { tur: 'kapak', baslik: `Öneri ${i + 1}` } })) });
  }
  return JSON.stringify({ secenekler: [1, 2, 3].map(i => ({ metin: `Seçenek ${i}: kısa, akıcı ve marka sesine uygun metin.`, etiketler: `#secenek${i} #arvela` })) });
}

export async function claude({ system, prompt, maxTokens = 4000, model = MODEL() }) {
  if (MOCK()) return { text: mockClaude(prompt), in: 0, out: 0, model: 'mock' };
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new HttpError(503, 'Yapay zekâ henüz etkin değil.');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(600_000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Claude hatası', r.status, j?.error?.type); throw new Error(r.status === 429 || r.status === 529 ? 'Yapay zekâ şu an yoğun; birkaç dakika sonra tekrar deneyin.' : 'Yapay zekâ yanıt veremedi.'); }
  return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''), in: j.usage?.input_tokens || 0, out: j.usage?.output_tokens || 0, model };
}

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPXNyBStAAAAABJRU5ErkJggg==';
export async function openaiImage(prompt, size) {
  if (MOCK()) return Buffer.from(PNG_1PX, 'base64');
  const key = process.env.OPENAI_API_KEY; if (!key) throw new HttpError(503, 'Görsel üretimi henüz etkin değil.');
  const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', signal: AbortSignal.timeout(240_000),
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.SOCIAL_IMAGE_MODEL || 'gpt-image-1', prompt, size, n: 1, quality: process.env.SOCIAL_IMAGE_QUALITY || 'medium' }) }); // orta kalite: maliyet denetimi
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data?.[0]?.b64_json) { console.error('görsel hatası', r.status, j?.error?.code); throw new Error(j?.error?.code === 'moderation_blocked' ? 'Bu istem görsel kurallarına takıldı; farklı anlatın.' : 'Görsel üretilemedi.'); }
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// ---------- Kota ve rıza ----------
export async function usage(wsId) {
  const r = await one(`SELECT count(*) FILTER (WHERE kind IN ('plan','metin'))::int text, count(*) FILTER (WHERE kind='gorsel')::int img FROM ai_jobs
    WHERE workspace_id=$1 AND status<>'hata' AND created_at >= date_trunc('month', now())`, [wsId]);
  return { text: r.text, img: r.img };
}
async function guard(ctx, kind) {
  needUsable(ctx);
  if (!aiReady() && kind !== 'gorsel') throw new HttpError(503, 'Yapay zekâ henüz etkin değil.');
  if (!ctx.ws.ai_consent_at) throw new HttpError(403, 'Yapay zekâyı kullanmadan önce hesap sahibinin Yapay zekâ sayfasında onay vermesi gerekiyor.');
  const u = await usage(ctx.ws.id);
  if (kind === 'gorsel') {
    if (!ctx.lim.aiImages) throw new HttpError(402, 'Yapay zekâ görselleri Agency paketinde.');
    if (!imageReady()) throw new HttpError(503, 'Görsel üretimi henüz etkin değil.');
    if (u.img >= ctx.lim.aiImagesPerMonth) throw new HttpError(402, `Bu ayki görsel hakkınız doldu (${ctx.lim.aiImagesPerMonth}).`);
  } else if (u.text >= ctx.lim.aiPerMonth) throw new HttpError(402, `Bu ayki yapay zekâ hakkınız doldu (${ctx.lim.aiPerMonth}).`);
}
const finish = (id, status, out, err, tok = {}) => q(`UPDATE ai_jobs SET status=$1, output=$2, error=$3, in_tokens=$4, out_tokens=$5, model=COALESCE($6, model), done_at=now() WHERE id=$7`,
  [status, out == null ? null : JSON.stringify(out), err, tok.in || null, tok.out || null, tok.model || null, id]);

// ---------- Arka plan işleri ----------
export async function runPlan(jobId) {
  const job = await one('SELECT * FROM ai_jobs WHERE id=$1', [jobId]); const inp = job.input;
  try {
    const brand = await one('SELECT * FROM brands WHERE id=$1', [job.brand_id]); const accounts = await all('SELECT platform, best_times FROM accounts WHERE brand_id=$1', [job.brand_id]);
    const pr = planPrompt({ brand, accounts, month: inp.month, count: inp.count, platforms: inp.platforms, focus: inp.focus, today: inp.today });
    const r = await claude({ ...pr, maxTokens: Math.min(16000, 1200 + inp.count * 700) });
    const j = extractJson(r.text); if (!j) throw new Error('Yapay zekâ beklenen biçimde yanıt vermedi; tekrar deneyin.');
    const best = accounts.map(a => /(\d{2}:\d{2})/.exec(a.best_times || '')?.[1]).find(Boolean) || '19:00';
    const items = normalizePlan(j.gonderiler, { month: inp.month, platforms: inp.platforms, pillars: brand.pillars || [], defaultTime: best });
    if (!items.length) throw new Error('Plan oluşturulamadı; tekrar deneyin.');
    const ids = [];
    for (const it of items.slice(0, inp.count)) {
      const p = await one(`INSERT INTO posts (workspace_id, brand_id, platforms, scheduled_at, status, title, caption, hashtags, first_comment, visual_brief, pillar, template, template_data, ai, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14) RETURNING id`, [job.workspace_id, job.brand_id, it.platforms, fromLocalInput(`${it.day}T${it.time}`), inp.as === 'fikir' ? 'fikir' : 'taslak',
        it.title, it.caption, it.hashtags, it.first_comment, it.visual_brief, it.pillar, it.template, JSON.stringify(it.template_data), job.created_by]);
      ids.push(p.id);
    }
    await finish(jobId, 'bitti', { posts: ids }, null, r);
  } catch (e) { await finish(jobId, 'hata', null, String(e.message || e).slice(0, 300)); }
}

export async function runImage(jobId) {
  const job = await one('SELECT * FROM ai_jobs WHERE id=$1', [jobId]); const inp = job.input;
  try {
    const brand = await one('SELECT * FROM brands WHERE id=$1', [job.brand_id]);
    const colors = Object.values(brand.colors || {}).filter(Boolean).join(', ');
    const prompt = `${maskPII(inp.prompt)}\n\nSosyal medya gönderisi için fotoğraf gerçekçiliğinde, profesyonel bir görsel. Sektör: ${maskPII(brand.sector || '-')}.${colors ? ` Markanın renk paleti: ${colors}.` : ''} Görselde yazı, logo, marka adı, filigran ve tanınabilir gerçek kişi olmasın.`;
    const buf = await openaiImage(prompt, inp.format === 'kare' ? '1024x1024' : '1024x1536');
    const ctx = { ws: { id: job.workspace_id }, user: { id: job.created_by } };
    const m = await saveImage(ctx, buf, `yz-${job.post_id || 'gorsel'}.png`, 'ai', job.brand_id);
    if (job.post_id) await q('UPDATE posts SET media_ids = array_prepend($1::int, media_ids), updated_at=now() WHERE id=$2', [m.id, job.post_id]);
    await finish(jobId, 'bitti', { media: m.id }, null, { model: process.env.SOCIAL_IMAGE_MODEL || 'gpt-image-1' });
  } catch (e) { await finish(jobId, 'hata', null, String(e.message || e).slice(0, 300)); }
}

// Gönderi düzenleyicisindeki yapay zekâ kutusu
export async function aiPanel(ctx, p, jobId) {
  if (ctx.user.role === 'approver' || p.status === 'paylasildi' || !ctx.lim.usable) return '';
  const f = csrf(ctx);
  if (!aiReady()) return '';
  if (!ctx.ws.ai_consent_at) return `<section class="card" id="yz"><h2>Yapay zekâ</h2><p class="muted">Metin önerileri için ${ctx.user.role === 'owner' ? '<a href="/yapay-zeka">Yapay zekâ sayfasında</a> onay verin' : 'hesap sahibinin Yapay zekâ sayfasında onay vermesi gerekiyor'}.</p></section>`;
  const job = jobId ? await one(`SELECT * FROM ai_jobs WHERE id=$1 AND post_id=$2 AND workspace_id=$3 AND kind='metin'`, [int(jobId), p.id, ctx.ws.id]) : null;
  const optsHtml = job?.status === 'bitti' ? (job.output?.secenekler || []).map((o, i) => `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px;background:#FBF9F4">
<p style="margin:0 0 6px;white-space:pre-wrap">${esc(o.metin)}</p>${o.etiketler ? `<p class="muted" style="margin:0 0 8px">${esc(o.etiketler)}</p>` : ''}
<form method="post" action="/gonderi/${p.id}/yz/${job.id}">${f}<input type="hidden" name="i" value="${i}"><button class="ghost">Bunu kullan</button></form></div>`).join('') : job?.status === 'hata' ? `<div class="err">${esc(job.error)}</div>` : '';
  const img = ctx.lim.aiImages && imageReady() ? `<form class="stack" method="post" action="/gonderi/${p.id}/yz-gorsel" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">${f}<label>Yapay zekâ görseli (Agency)<textarea name="prompt" rows="2" maxlength="600" required placeholder="Ahşap masada buharı tüten kahve fincanı, sabah ışığı">${esc(p.visual_brief || '')}</textarea></label><div><button class="ghost">Görsel üret</button></div></form>` : '';
  return `<section class="card" id="yz"><h2>Yapay zekâ</h2><form class="stack" method="post" action="/gonderi/${p.id}/yz">${f}<div class="row"><label>İşlem<select name="islem">${Object.entries(OPS).map(([k, v]) => `<option value="${k}"${(!p.caption && k === 'yaz') ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
<label>Ek istek (isteğe bağlı)<input name="not" maxlength="300" placeholder="Hafta sonu kampanyasını vurgula"></label><div><button class="gold">3 seçenek üret</button></div><p class="muted" style="margin:0">Kişisel veri (müşteri adı, telefon) yazmayın. Öneriler kaydedilmeden önce gösterilir.</p></form>${optsHtml}${img}</section>`;
}

export function register() {
  // ---------- Yapay zekâ sayfası: rıza ve kullanım ----------
  route('GET', '/yapay-zeka', async (ctx, res) => {
    const u = await usage(ctx.ws.id); const f = csrf(ctx); const by = ctx.ws.ai_consent_by ? await one('SELECT name FROM users WHERE id=$1', [ctx.ws.ai_consent_by]) : null;
    const jobs = await all(`SELECT j.id, j.kind, j.status, j.created_at, u.name FROM ai_jobs j LEFT JOIN users u ON u.id=j.created_by WHERE j.workspace_id=$1 ORDER BY j.id DESC LIMIT 15`, [ctx.ws.id]);
    send(res, 200, layout(ctx, 'Yapay zekâ', `<div class="page-head"><div><h1>Yapay zekâ</h1><p>Aylık plan, metin seçenekleri${ctx.lim.aiImages ? ' ve görseller' : ''}</p></div>${ctx.ws.ai_consent_at && ctx.user.role !== 'approver' ? '<a class="btn gold" href="/planla">Aylık plan oluştur</a>' : ''}</div>
${aiReady() ? '' : '<div class="note">Yapay zekâ bu sunucuda henüz etkin değil.</div>'}
<div class="kpi"><div><b>${u.text} / ${ctx.lim.aiPerMonth}</b><span>bu ay metin ve plan isteği</span></div>${ctx.lim.aiImages ? `<div><b>${u.img} / ${ctx.lim.aiImagesPerMonth}</b><span>bu ay görsel</span></div>` : ''}</div>
<section class="card"><h2>Veri işleme onayı (KVKK)</h2><p>Yapay zekâ özellikleri için marka bilgileriniz (ad, sektör, hedef kitle, üslup notları) ve gönderi metinleriniz, metin üretmek amacıyla <strong>Anthropic PBC (ABD)</strong>${ctx.lim.aiImages ? ' ve görsel üretmek amacıyla <strong>OpenAI (ABD)</strong>' : ''} hizmetine iletilir. Bu, kişisel verilerin yurt dışına aktarımı sayılabilir.</p>
<p class="muted">E-posta adresleri ve telefon numaraları gönderilmeden otomatik olarak gizlenir. Metinlere müşteri adı, sağlık bilgisi gibi kişisel veri yazmayın. Sağlayıcıların API koşullarına göre bu veriler model eğitiminde kullanılmaz.</p>
${ctx.ws.ai_consent_at ? `<div class="flash">Onay verildi: ${fmtDateTime(ctx.ws.ai_consent_at)}${by ? ` · ${esc(by.name)}` : ''}</div>${ctx.user.role === 'owner' ? `<form method="post" action="/yapay-zeka/riza">${f}<input type="hidden" name="geri" value="1"><button class="ghost" data-confirm="Onayı geri çekerseniz yapay zekâ özellikleri kapanır. Emin misiniz?">Onayı geri çek</button></form>` : ''}`
  : ctx.user.role === 'owner' ? `<form class="stack" method="post" action="/yapay-zeka/riza">${f}<label class="chk"><input type="checkbox" name="riza" value="1" required> Yukarıdaki aktarımı okudum; hesabım adına açık rıza veriyorum.</label><div><button class="gold">Onayla ve aç</button></div></form>` : '<p class="muted">Onayı yalnız hesap sahibi verebilir.</p>'}</section>
${jobs.length ? `<section class="card"><h2>Son işler</h2><div class="tbl"><table><tr><th>İş</th><th>Tür</th><th>Durum</th><th>Kim</th><th>Zaman</th></tr>${jobs.map(j => `<tr><td><a href="/yz-is/${j.id}">#${j.id}</a></td><td>${{ plan: 'Aylık plan', metin: 'Metin', gorsel: 'Görsel' }[j.kind]}</td><td>${badge({ calisiyor: 'Çalışıyor', bitti: 'Bitti', hata: 'Hata' }[j.status], j.status === 'bitti' ? 'ok' : j.status === 'hata' ? 'bad' : 'warn')}</td><td>${esc(j.name || '')}</td><td>${fmtDateTime(j.created_at)}</td></tr>`).join('')}</table></div></section>` : ''}`, '/yapay-zeka'));
  });
  route('POST', '/yapay-zeka/riza', async (ctx, res) => {
    need(ctx, 'owner');
    if (ctx.body.geri === '1') { await q('UPDATE workspaces SET ai_consent_at=NULL, ai_consent_by=NULL WHERE id=$1', [ctx.ws.id]); await audit(ctx, 'ai.consent', { given: false }); }
    else { if (ctx.body.riza !== '1') throw new HttpError(400, 'Onay kutusunu işaretleyin.'); await q('UPDATE workspaces SET ai_consent_at=now(), ai_consent_by=$1 WHERE id=$2', [ctx.user.id, ctx.ws.id]); await audit(ctx, 'ai.consent', { given: true }); }
    redirect(res, '/yapay-zeka');
  });

  // ---------- Aylık plan ----------
  route('GET', '/planla', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); if (!ctx.brand) return redirect(res, '/baslangic');
    if (!ctx.ws.ai_consent_at || !aiReady()) return redirect(res, '/yapay-zeka');
    const accounts = await all('SELECT DISTINCT platform FROM accounts WHERE brand_id=$1', [ctx.brand.id]); const u = await usage(ctx.ws.id);
    const used = (await one(`SELECT count(*)::int n FROM posts WHERE workspace_id=$1 AND created_at >= date_trunc('month', now()) AND status<>'iptal'`, [ctx.ws.id])).n;
    const left = Math.max(0, ctx.lim.postsPerMonth - used); const now = new Date(Date.now() + 3 * 3600e3); const thisM = now.toISOString().slice(0, 7);
    const nextM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    const lbl = (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
    const running = await one(`SELECT id FROM ai_jobs WHERE workspace_id=$1 AND kind='plan' AND status='calisiyor' LIMIT 1`, [ctx.ws.id]);
    send(res, 200, layout(ctx, 'Aylık plan', `<div class="page-head"><div><h1>Aylık plan oluştur</h1><p>${esc(ctx.brand.name)} için Claude bir aylık gönderi takvimi ve metinleri hazırlar; hepsi taslak olarak gelir, siz düzenleyip onaylarsınız.</p></div></div>
${running ? `<div class="note">Bir plan hazırlanıyor. <a href="/yz-is/${running.id}">Durumu gör</a></div>` : ''}
${accounts.length ? '' : `<div class="note">Önce <a href="/markalar/${ctx.brand.id}">marka sayfasından</a> en az bir sosyal hesap ekleyin.</div>`}
<form class="card stack" method="post" action="/planla" style="max-width:640px">${csrf(ctx)}
<div class="row"><label>Ay<select name="ay"><option value="${thisM}">${lbl(thisM)} (kalan günler)</option><option value="${nextM}" selected>${lbl(nextM)}</option></select></label>
<label>Gönderi sayısı<input type="number" name="adet" min="1" max="${Math.min(31, left)}" value="${Math.min(12, left)}" required></label></div>
<fieldset style="border:0;padding:0;margin:0"><legend class="muted" style="font-size:13px;font-weight:600;margin-bottom:6px">Platformlar</legend><div class="row" style="gap:14px">${accounts.map(a => `<label class="chk"><input type="checkbox" name="platforms" value="${a.platform}" checked> ${esc(PLATFORMS[a.platform]?.name || a.platform)}</label>`).join('')}</div></fieldset>
<label>Bu ay neyi öne çıkaralım? (isteğe bağlı)<textarea name="odak" rows="3" maxlength="800" placeholder="Yeni kış harmanı, 20 Kasım'da Kadıköy şubesinin açılışı, hafta içi öğle menüsü"></textarea></label>
<label>Gönderiler hangi durumda gelsin<select name="olarak"><option value="taslak">Taslak (takvime yerleşir)</option><option value="fikir">Fikir (fikir havuzuna)</option></select></label>
<p class="muted" style="margin:0">Bu ay kalan gönderi hakkı: ${left}. Yapay zekâ hakkı: ${Math.max(0, ctx.lim.aiPerMonth - u.text)}. Bir plan isteği 1 hak sayılır; hazırlanması 1–3 dakika sürer.</p>
<div><button class="gold"${accounts.length && left && !running ? '' : ' disabled'}>Planı hazırla</button></div></form>`, '/yapay-zeka'));
  });
  route('POST', '/planla', async (ctx, res) => {
    need(ctx, 'owner', 'editor'); await guard(ctx, 'plan'); if (!ctx.brand) throw new HttpError(400, 'Önce bir marka oluşturun.');
    const month = /^\d{4}-\d{2}$/.test(ctx.body.ay || '') ? ctx.body.ay : null; if (!month) throw new HttpError(400, 'Ay geçersiz.');
    const nowK = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7); if (month < nowK) throw new HttpError(400, 'Geçmiş bir ay seçilemez.');
    const accounts = (await all('SELECT DISTINCT platform FROM accounts WHERE brand_id=$1', [ctx.brand.id])).map(a => a.platform);
    const platforms = [].concat(ctx.body.platforms || []).filter(k => accounts.includes(k) && PLATFORMS[k]); if (!platforms.length) throw new HttpError(400, 'En az bir platform seçin.');
    const used = (await one(`SELECT count(*)::int n FROM posts WHERE workspace_id=$1 AND created_at >= date_trunc('month', now()) AND status<>'iptal'`, [ctx.ws.id])).n;
    const count = Math.min(int(ctx.body.adet) || 0, 31, ctx.lim.postsPerMonth - used); if (count < 1) throw new HttpError(402, 'Bu ayki gönderi hakkınız dolu.');
    if (await one(`SELECT 1 FROM ai_jobs WHERE workspace_id=$1 AND kind='plan' AND status='calisiyor'`, [ctx.ws.id])) throw new HttpError(409, 'Zaten hazırlanan bir plan var.');
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    const job = await one(`INSERT INTO ai_jobs (workspace_id, brand_id, kind, input, model, created_by) VALUES ($1,$2,'plan',$3,$4,$5) RETURNING id`,
      [ctx.ws.id, ctx.brand.id, JSON.stringify({ month, count, platforms, focus: clip(nn(ctx.body.odak), 800), as: ctx.body.olarak === 'fikir' ? 'fikir' : 'taslak', today }), MODEL(), ctx.user.id]);
    await audit(ctx, 'ai.plan', { job: job.id, month, count }); runPlan(job.id); redirect(res, `/yz-is/${job.id}`);
  });

  // ---------- İş durumu ----------
  route('GET', '/yz-is/:id', async (ctx, res, pr) => {
    const j = await one('SELECT * FROM ai_jobs WHERE id=$1 AND workspace_id=$2', [int(pr.id), ctx.ws.id]); if (!j) throw new HttpError(404, 'İş bulunamadı.');
    if (j.status === 'bitti' && j.kind !== 'plan' && j.post_id) return redirect(res, `/gonderi/${j.post_id}${j.kind === 'metin' ? `?yz=${j.id}#yz` : ''}`);
    const posts = j.status === 'bitti' && j.kind === 'plan' ? await all('SELECT id, title, caption, scheduled_at, status FROM posts WHERE id = ANY($1::int[]) AND workspace_id=$2 ORDER BY scheduled_at', [j.output?.posts || [], ctx.ws.id]) : [];
    const head = j.status === 'calisiyor' ? '<meta http-equiv="refresh" content="4">' : '';
    send(res, 200, layout(ctx, 'Yapay zekâ işi', `${head}<div class="page-head"><div><p class="muted" style="margin:0"><a href="/yapay-zeka">Yapay zekâ</a></p><h1>${{ plan: 'Aylık plan', metin: 'Metin seçenekleri', gorsel: 'Görsel' }[j.kind]} #${j.id}</h1></div></div>
${j.status === 'calisiyor' ? `<section class="card"><h2>Hazırlanıyor…</h2><p class="muted">${j.kind === 'plan' ? 'Claude markanızı okuyup takvimi yazıyor. Bu 1–3 dakika sürebilir;' : 'Görsel üretiliyor. Bu 1 dakika kadar sürebilir;'} sayfa kendiliğinden yenilenir. Bu sayfadan ayrılabilirsiniz, iş arka planda sürer.</p></section>` : ''}
${j.status === 'hata' ? `<div class="err">${esc(j.error || 'Bir sorun oluştu.')}</div><p><a class="btn ghost" href="${j.kind === 'plan' ? '/planla' : j.post_id ? `/gonderi/${j.post_id}` : '/yapay-zeka'}">Tekrar dene</a></p>` : ''}
${posts.length ? `<section class="card"><h2>${posts.length} gönderi hazır</h2><p class="muted">Hepsi ${POST_ST[posts[0].status].toLowerCase()} durumunda. Her birini açıp düzenleyin, şablon görsel ekleyin ve onaya gönderin.</p>${posts.map(p => `<div class="row" style="align-items:center;padding:8px 0;border-bottom:1px solid #ECE6DA"><div style="flex:1;min-width:200px"><a href="/gonderi/${p.id}"><strong>${esc(p.title || String(p.caption || '').slice(0, 60))}</strong></a><br><span class="muted">${fmtDateTime(p.scheduled_at)}</span></div></div>`).join('')}<p style="margin-top:14px"><a class="btn gold" href="/takvim?ay=${esc(j.input.month)}">Takvimde gör</a></p></section>` : ''}`, '/yapay-zeka'));
  });

  // ---------- Gönderi metni: 3 seçenek ----------
  route('POST', '/gonderi/:id/yz', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); await guard(ctx, 'metin');
    const p = await one('SELECT * FROM posts WHERE id=$1 AND workspace_id=$2', [int(pr.id), ctx.ws.id]); if (!p) throw new HttpError(404, 'Gönderi bulunamadı.');
    if (p.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi değiştirilemez.');
    const op = OPS[ctx.body.islem] ? ctx.body.islem : 'iyilestir'; if (op !== 'yaz' && !p.caption) throw new HttpError(400, 'Önce bir metin yazın ya da "Metni yaz" seçin.');
    const brand = await one('SELECT * FROM brands WHERE id=$1', [p.brand_id]); const accounts = await all('SELECT platform FROM accounts WHERE brand_id=$1', [p.brand_id]);
    const max = Math.min(...(p.platforms?.length ? p.platforms : ['instagram']).map(k => PLATFORMS[k]?.max || 2200));
    const note = clip(nn(ctx.body.not), 300);
    const job = await one(`INSERT INTO ai_jobs (workspace_id, brand_id, post_id, kind, input, model, created_by) VALUES ($1,$2,$3,'metin',$4,$5,$6) RETURNING id`, [ctx.ws.id, p.brand_id, p.id, JSON.stringify({ op, note }), MODEL(), ctx.user.id]);
    try {
      const r = await claude({ ...textPrompt({ brand, accounts, post: p, op, note, max }), maxTokens: 3000 });
      const o = normalizeOptions(extractJson(r.text), max); if (!o.length) throw new Error('Yapay zekâ beklenen biçimde yanıt vermedi; tekrar deneyin.');
      await finish(job.id, 'bitti', { secenekler: o }, null, r);
    } catch (e) { await finish(job.id, 'hata', null, String(e.message || e).slice(0, 300)); }
    redirect(res, `/gonderi/${p.id}?yz=${job.id}#yz`);
  });
  route('POST', '/gonderi/:id/yz/:job', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); needUsable(ctx);
    const p = await one('SELECT * FROM posts WHERE id=$1 AND workspace_id=$2', [int(pr.id), ctx.ws.id]); if (!p) throw new HttpError(404, 'Gönderi bulunamadı.');
    const j = await one(`SELECT * FROM ai_jobs WHERE id=$1 AND post_id=$2 AND kind='metin' AND status='bitti'`, [int(pr.job), p.id]); const o = j?.output?.secenekler?.[int(ctx.body.i) ?? -1];
    if (!o) throw new HttpError(404, 'Seçenek bulunamadı.'); if (p.status === 'paylasildi') throw new HttpError(400, 'Paylaşılmış gönderi değiştirilemez.');
    const st = p.status === 'onaylandi' && ctx.lim.approvals ? 'taslak' : p.status;
    await q('UPDATE posts SET caption=$1, hashtags=COALESCE($2, hashtags), status=$3, ai=true, updated_at=now() WHERE id=$4', [o.metin, nn(o.etiketler), st, p.id]);
    await q(`INSERT INTO post_notes (post_id, user_id, author, kind, body) VALUES ($1,$2,$3,'durum',$4)`, [p.id, ctx.user.id, ctx.user.name, `Yapay zekâ önerisi uygulandı (${OPS[j.input?.op] || 'metin'})${st !== p.status ? '; yeniden onay gerekiyor' : ''}.`]);
    await audit(ctx, 'ai.apply', { post: p.id, job: j.id }); redirect(res, `/gonderi/${p.id}`);
  });

  // ---------- Görsel (Agency) ----------
  route('POST', '/gonderi/:id/yz-gorsel', async (ctx, res, pr) => {
    need(ctx, 'owner', 'editor'); await guard(ctx, 'gorsel');
    const p = await one('SELECT * FROM posts WHERE id=$1 AND workspace_id=$2', [int(pr.id), ctx.ws.id]); if (!p) throw new HttpError(404, 'Gönderi bulunamadı.');
    const prompt = clip(nn(ctx.body.prompt), 600); if (!prompt) throw new HttpError(400, 'Görseli anlatın.');
    if (await one(`SELECT 1 FROM ai_jobs WHERE workspace_id=$1 AND kind='gorsel' AND status='calisiyor'`, [ctx.ws.id])) throw new HttpError(409, 'Zaten üretilen bir görsel var; birkaç saniye bekleyin.');
    const job = await one(`INSERT INTO ai_jobs (workspace_id, brand_id, post_id, kind, input, model, created_by) VALUES ($1,$2,$3,'gorsel',$4,$5,$6) RETURNING id`,
      [ctx.ws.id, p.brand_id, p.id, JSON.stringify({ prompt, format: FORMATS[p.format] ? p.format : 'kare' }), process.env.SOCIAL_IMAGE_MODEL || 'gpt-image-1', ctx.user.id]);
    await audit(ctx, 'ai.image', { post: p.id, job: job.id }); runImage(job.id); redirect(res, `/yz-is/${job.id}`);
  });
}
