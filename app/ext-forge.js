// Arvela OS — Forge: her kod değişikliği Yönetici onayıyla yayına girer, tek tıkla geri alınır.
// Değişiklikler GitHub Pull Request'idir. GitHub Actions açık PR'ları buraya bildirir (forge-report),
// onaylananları birleştirip yayınlar ve geri alma isteklerini uygular (forge-apply).
import crypto from 'node:crypto';

export const forgeKey = (setupToken) => setupToken ? crypto.createHmac('sha256', setupToken).update('arvela-forge').digest('hex') : '';
export const CH_ST = { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı · sırada', yayinda: 'Yayında', reddedildi: 'Reddedildi', hata: 'Uygulanamadı', kapandi: 'Kapandı' };
const CH_TONE = { bekliyor: 'warn', onaylandi: 'warn', yayinda: 'ok', reddedildi: '', hata: 'bad', kapandi: '' };
const RL_ST = { yayinda: 'Yayında', geri_istendi: 'Geri alma sırada', geri_alindi: 'Geri alındı', hata: 'Geri alınamadı' };
const clean = (s, n) => s == null ? null : String(s).slice(0, n);
const SHA = /^[0-9a-f]{40}$/;

// Gelen PR kaydına göre yeni durum: onaydan sonra kod değiştiyse onay düşer.
export function nextStatus(prev, pr) {
  if (pr.merged) return 'yayinda'; // Forge dışında (Yönetici'nin doğrudan izniyle) birleştirilen de yayındadır
  if (pr.state === 'closed') return prev?.status === 'reddedildi' ? 'reddedildi' : 'kapandi';
  if (!prev) return 'bekliyor';
  if (prev.head_sha !== pr.head_sha && ['onaylandi', 'hata', 'reddedildi'].includes(prev.status)) return 'bekliyor';
  return prev.status;
}

export async function migrateForge({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS forge_changes (id SERIAL PRIMARY KEY, pr INT NOT NULL UNIQUE, title TEXT, body TEXT, author TEXT, branch TEXT, head_sha TEXT, url TEXT,
    files JSONB, additions INT, deletions INT, ci TEXT, status TEXT NOT NULL DEFAULT 'bekliyor', approved_sha TEXT, decided_by INT REFERENCES users(id), decided_at TIMESTAMPTZ,
    note TEXT, error TEXT, merged_sha TEXT, deployed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS forge_releases (id SERIAL PRIMARY KEY, sha TEXT NOT NULL UNIQUE, title TEXT, source TEXT, deployed_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'yayinda',
    requested_by INT REFERENCES users(id), requested_at TIMESTAMPTZ, revert_sha TEXT, error TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS forge_runs (id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(), kind TEXT, note TEXT)`);
}

export function registerForge(d) {
  const { route, all, one, q, need, layout, h, badge, fmtDate, csrfField, HttpError, int, nn, redirect, send, safeEqual, audit, SETUP_TOKEN, VERSION } = d;
  const key = forgeKey(SETUP_TOKEN);
  const REPO = process.env.FORGE_REPO || 'ctimur/arvela-os';
  const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const ghAuth = (ctx) => { const a = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!key || !safeEqual(a, key)) throw new HttpError(403, 'Yetkisiz.'); };
  const when = (x) => x ? new Date(x).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }) : '—';

  // İsteğe bağlı: GitHub anahtarı varsa onaydan hemen sonra uygulama akışını tetikle (yoksa en geç 30 dk).
  async function kick() {
    const t = process.env.FORGE_GITHUB_TOKEN; if (!t) return false;
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/forge-apply.yml/dispatches`, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'User-Agent': 'arvela-os-forge/1.0' }, body: JSON.stringify({ ref: 'main' }) });
      return r.status === 204;
    } catch { return false; }
  }

  // ---------- GitHub Actions uçları ----------
  route('POST', '/api/forge/report', async (ctx, res) => {
    ghAuth(ctx); let b; try { b = JSON.parse(ctx.body.payload || '{}'); } catch { throw new HttpError(400, 'Geçersiz veri.'); }
    for (const pr of (b.changes || []).slice(0, 100)) {
      const n = int(pr.number); if (!n || !SHA.test(pr.head_sha || '')) continue;
      const prev = await one('SELECT * FROM forge_changes WHERE pr=$1', [n]);
      const st = nextStatus(prev, pr);
      const files = (pr.files || []).slice(0, 200).map(f => ({ name: clean(f.name, 200), status: clean(f.status, 20), add: int(f.add) || 0, del: int(f.del) || 0 }));
      await q(`INSERT INTO forge_changes (pr, title, body, author, branch, head_sha, url, files, additions, deletions, ci, status, merged_sha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (pr) DO UPDATE SET title=$2, body=$3, author=$4, branch=$5, head_sha=$6, url=$7, files=$8, additions=$9, deletions=$10, ci=$11, status=$12, merged_sha=COALESCE($13, forge_changes.merged_sha), updated_at=now(),
        approved_sha=CASE WHEN $12='bekliyor' THEN NULL ELSE forge_changes.approved_sha END`,
        [n, clean(pr.title, 300), clean(pr.body, 8000), clean(pr.author, 80), clean(pr.branch, 200), pr.head_sha, clean(pr.url, 300), JSON.stringify(files), int(pr.additions) || 0, int(pr.deletions) || 0, clean(pr.ci, 20), st, SHA.test(pr.merge_sha || '') ? pr.merge_sha : null]);
    }
    for (const r of (b.releases || []).slice(0, 50)) {
      if (!SHA.test(r.sha || '')) continue;
      await q(`INSERT INTO forge_releases (sha, title, source, deployed_at) VALUES ($1,$2,$3,$4) ON CONFLICT (sha) DO NOTHING`, [r.sha, clean(r.title, 300), clean(r.source, 20), r.at || null]);
    }
    await q('INSERT INTO forge_runs (kind, note) VALUES ($1,$2)', ['report', clean(b.note, 300)]);
    json(res, { ok: true });
  });

  route('GET', '/api/forge/queue', async (ctx, res) => {
    ghAuth(ctx);
    const merge = await all(`SELECT pr, approved_sha sha, title FROM forge_changes WHERE status='onaylandi' AND approved_sha IS NOT NULL ORDER BY decided_at`);
    const rollback = await all(`SELECT id, sha, title FROM forge_releases WHERE status='geri_istendi' ORDER BY requested_at`);
    json(res, { merge, rollback });
  });

  route('POST', '/api/forge/result', async (ctx, res) => {
    ghAuth(ctx); let b; try { b = JSON.parse(ctx.body.payload || '{}'); } catch { throw new HttpError(400, 'Geçersiz veri.'); }
    const agency = await one('SELECT id FROM agencies WHERE slug=$1', ['arvela']);
    const sys = { user: { id: null, agency_id: agency.id, role: 'system', name: 'Forge' } };
    if (b.pr) {
      const ok = b.ok === true;
      await q(`UPDATE forge_changes SET status=$1, error=$2, merged_sha=COALESCE($3, merged_sha), deployed_at=CASE WHEN $1='yayinda' THEN now() ELSE deployed_at END, updated_at=now() WHERE pr=$4`,
        [ok ? 'yayinda' : 'hata', ok ? null : clean(b.error, 1000), SHA.test(b.sha || '') ? b.sha : null, int(b.pr)]);
      if (ok && SHA.test(b.sha || '')) await q(`INSERT INTO forge_releases (sha, title, source, deployed_at) VALUES ($1,$2,'forge',now()) ON CONFLICT (sha) DO UPDATE SET deployed_at=now()`, [b.sha, clean(b.title, 300)]);
      await audit(sys, ok ? 'forge.deployed' : 'forge.failed', { pr: int(b.pr), sha: b.sha || null, error: ok ? undefined : clean(b.error, 300) });
    }
    if (b.rollback) {
      const ok = b.ok === true;
      await q(`UPDATE forge_releases SET status=$1, revert_sha=$2, error=$3 WHERE id=$4`, [ok ? 'geri_alindi' : 'hata', SHA.test(b.sha || '') ? b.sha : null, ok ? null : clean(b.error, 1000), int(b.rollback)]);
      if (ok && SHA.test(b.sha || '')) await q(`INSERT INTO forge_releases (sha, title, source, deployed_at) VALUES ($1,$2,'geri-alma',now()) ON CONFLICT (sha) DO NOTHING`, [b.sha, clean(b.title, 300)]);
      await audit(sys, ok ? 'forge.rolled_back' : 'forge.rollback_failed', { release: int(b.rollback), sha: b.sha || null });
    }
    await q('INSERT INTO forge_runs (kind, note) VALUES ($1,$2)', ['apply', clean(b.note || (b.ok ? 'tamam' : b.error), 300)]);
    json(res, { ok: true });
  });

  // ---------- Forge sayfası ----------
  route('GET', '/forge', async (ctx, res) => {
    need(ctx, 'admin'); const f = csrfField(ctx);
    const [open, done, rels, last] = await Promise.all([
      all(`SELECT c.*, u.name decider FROM forge_changes c LEFT JOIN users u ON u.id=c.decided_by WHERE c.status IN ('bekliyor','onaylandi','hata') ORDER BY c.pr DESC`),
      all(`SELECT c.*, u.name decider FROM forge_changes c LEFT JOIN users u ON u.id=c.decided_by WHERE c.status NOT IN ('bekliyor','onaylandi','hata') ORDER BY c.updated_at DESC LIMIT 15`),
      all(`SELECT r.*, u.name requester FROM forge_releases r LEFT JOIN users u ON u.id=r.requested_by ORDER BY r.deployed_at DESC NULLS LAST, r.id DESC LIMIT 20`),
      all(`SELECT * FROM forge_runs ORDER BY at DESC LIMIT 2`)]);
    const ciBadge = (c) => c === 'success' ? badge('Testler geçti', 'ok') : c === 'failure' ? badge('Testler kaldı', 'bad') : badge('Testler sürüyor', 'warn');
    const card = (c) => `<article class="act${c.status === 'bekliyor' ? ' hero' : ''}"><div class="act-meta">${badge(CH_ST[c.status], CH_TONE[c.status])}${ciBadge(c.ci)}<span class="muted">#${c.pr} · ${h(c.author || '')} · ${when(c.updated_at)}</span></div>
<h2>${h(c.title)}</h2>${c.body ? `<p class="desc">${h(c.body.slice(0, 1500))}</p>` : ''}
<details><summary>${(c.files || []).length} dosya · +${c.additions} / −${c.deletions}</summary><ul class="files">${(c.files || []).map(x => `<li><code>${h(x.name)}</code> <span class="muted">${h(x.status)} +${x.add} −${x.del}</span></li>`).join('')}</ul></details>
${c.error ? `<div class="err">${h(c.error)}</div>` : ''}
${c.status === 'onaylandi' ? `<p class="muted">${h(c.decider || '')} onayladı (${when(c.decided_at)}). ${process.env.FORGE_GITHUB_TOKEN ? 'Birkaç dakika içinde yayına girer.' : 'En geç 30 dakika içinde yayına girer (08:00–23:00).'}</p>` : ''}
<div class="act-btns">${c.status === 'bekliyor' || c.status === 'hata' ? `<form method="post" action="/forge/${c.pr}/onayla">${f}<input type="hidden" name="sha" value="${h(c.head_sha)}"><button class="gold"${c.ci !== 'success' ? ' disabled title="Testler geçmeden onaylanamaz"' : ''}>Onayla ve yayına al</button></form>
<form method="post" action="/forge/${c.pr}/reddet" class="row">${f}<input name="note" placeholder="Neden? (isteğe bağlı)" aria-label="Reddetme notu"><button class="ghost">Reddet</button></form>` : ''}
${c.status === 'onaylandi' ? `<form method="post" action="/forge/${c.pr}/vazgec">${f}<button class="ghost">Onayı geri al</button></form>` : ''}
${c.url ? `<a class="btn ghost" href="${h(c.url)}" target="_blank" rel="noopener">GitHub'da aç</a>` : ''}</div></article>`;
    const latest = rels.find(r => r.status === 'yayinda' || r.status === 'geri_istendi');
    send(res, 200, layout(ctx, 'Forge', `<div class="page-head"><div><p class="eyebrow">Sürüm ${h(VERSION)}</p><h1>Forge</h1><p class="muted lead">Arvela OS'e gelen her değişiklik burada onayınızı bekler. Onaylanan değişiklik yayına girer; yayındaki bir sürüm tek tıkla geri alınır.</p></div></div>
${open.length ? open.map(card).join('') : `<article class="act"><h2>Onay bekleyen değişiklik yok</h2><p>Yeni bir değişiklik geldiğinde burada ve Bugün sayfasında görünür.</p></article>`}
<section class="card"><h2>Sürümler</h2>${rels.map(r => `<div class="line"><span class="grow"><strong>${h(r.title || r.sha.slice(0, 7))}</strong><span class="muted"><code>${r.sha.slice(0, 7)}</code> · ${h(r.source || '')} · ${when(r.deployed_at)}${r.requester ? ' · geri alma: ' + h(r.requester) : ''}${r.error ? ' · ' + h(r.error.slice(0, 160)) : ''}</span></span>
${badge(RL_ST[r.status] || r.status, r.status === 'yayinda' ? 'ok' : r.status === 'hata' ? 'bad' : 'warn')}
${r.status === 'yayinda' || r.status === 'hata' ? `<form method="post" action="/forge/surum/${r.id}/geri-al" data-confirm="Bu sürümdeki değişiklik geri alınsın mı? Geri alma yeni bir sürüm olarak yayına girer.">${f}<button class="danger">Geri al</button></form>` : ''}</div>`).join('') || '<p class="muted">Henüz sürüm kaydı yok.</p>'}
${latest ? '' : ''}</section>
${done.length ? `<section class="card"><h2>Geçmiş değişiklikler</h2>${done.map(c => `<a class="line" href="${h(c.url || '#')}" target="_blank" rel="noopener"><span class="grow"><strong>#${c.pr} · ${h(c.title)}</strong><span class="muted">${h(c.decider || '')} · ${when(c.decided_at || c.updated_at)}${c.note ? ' · ' + h(c.note) : ''}</span></span>${badge(CH_ST[c.status], CH_TONE[c.status])}</a>`).join('')}</section>` : ''}
<p class="muted">Son GitHub kontrolü: ${last.length ? when(last[0].at) : 'henüz yok'}. Değişiklikler GitHub'da Pull Request olarak açılır; testleri geçmeyen değişiklik onaylanamaz. Onay, o anki koda verilir: sonradan kod değişirse onay düşer.</p>`, '/forge'));
  });

  const chFor = async (pr) => { const c = await one('SELECT * FROM forge_changes WHERE pr=$1', [int(pr)]); if (!c) throw new HttpError(404, 'Değişiklik bulunamadı.'); return c; };
  route('POST', '/forge/:id/onayla', async (ctx, res, p) => {
    need(ctx, 'admin'); const c = await chFor(p.id);
    if (!['bekliyor', 'hata'].includes(c.status)) throw new HttpError(400, 'Bu değişiklik onay beklemiyor.');
    if (c.ci !== 'success') throw new HttpError(400, 'Testler geçmeden onaylanamaz.');
    if (ctx.body.sha !== c.head_sha) throw new HttpError(409, 'Değişiklik siz bakarken güncellendi. Sayfayı yenileyip yeniden inceleyin.');
    await q(`UPDATE forge_changes SET status='onaylandi', approved_sha=$1, decided_by=$2, decided_at=now(), error=NULL, updated_at=now() WHERE pr=$3`, [c.head_sha, ctx.user.id, c.pr]);
    await audit(ctx, 'forge.approve', { pr: c.pr, sha: c.head_sha }); await kick(); redirect(res, '/forge');
  });
  route('POST', '/forge/:id/reddet', async (ctx, res, p) => {
    need(ctx, 'admin'); const c = await chFor(p.id);
    await q(`UPDATE forge_changes SET status='reddedildi', approved_sha=NULL, decided_by=$1, decided_at=now(), note=$2, updated_at=now() WHERE pr=$3`, [ctx.user.id, nn(ctx.body.note), c.pr]);
    await audit(ctx, 'forge.reject', { pr: c.pr }); redirect(res, '/forge');
  });
  route('POST', '/forge/:id/vazgec', async (ctx, res, p) => {
    need(ctx, 'admin'); const c = await chFor(p.id);
    if (c.status !== 'onaylandi') throw new HttpError(400, 'Bu değişiklik sırada değil.');
    await q(`UPDATE forge_changes SET status='bekliyor', approved_sha=NULL, updated_at=now() WHERE pr=$1`, [c.pr]);
    await audit(ctx, 'forge.unapprove', { pr: c.pr }); redirect(res, '/forge');
  });
  route('POST', '/forge/surum/:id/geri-al', async (ctx, res, p) => {
    need(ctx, 'admin'); const r = await one('SELECT * FROM forge_releases WHERE id=$1', [int(p.id)]);
    if (!r || !['yayinda', 'hata'].includes(r.status)) throw new HttpError(400, 'Bu sürüm geri alınamaz.');
    await q(`UPDATE forge_releases SET status='geri_istendi', requested_by=$1, requested_at=now(), error=NULL WHERE id=$2`, [ctx.user.id, r.id]);
    await audit(ctx, 'forge.rollback_request', { release: r.id, sha: r.sha }); await kick(); redirect(res, '/forge');
  });

  return { pendingCount: async () => (await one(`SELECT count(*)::int n FROM forge_changes WHERE status='bekliyor' AND ci='success'`))?.n || 0 };
}
