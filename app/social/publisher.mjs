// Arvela Social — otomatik paylaşım motoru: zamanı gelen onaylı gönderileri bağlı kanallara gönderir,
// kanal başına sonucu kaydeder, geçici hatalarda yeniden dener, kalıcı hatada ekibe e-posta atar; tekrarlayan gönderinin sonrakini oluşturur.
import { one, all, q } from './db.mjs';
import { canUse } from './plans.mjs';
import { providerFor, ProviderError } from './providers.mjs';
import { open as unseal, signedMediaPath } from './vault.mjs';
import { recipients, sendMail, mailHtml, base } from './notify.mjs';

export const RETRY_MIN = [5, 15, 60]; export const MAX_ATTEMPTS = 3;
export const REPEATS = { gunluk: 'Her gün', haftalik: 'Her hafta', aylik: 'Her ay' };
const INTERVAL = { gunluk: '1 day', haftalik: '7 days', aylik: '1 month' };
export const postText = (p) => [String(p.caption || '').trim(), String(p.hashtags || '').trim()].filter(Boolean).join('\n\n');
const hooks = { onPublished: async (p, ev) => { const a = await import('./automation.mjs'); const cur = await one('SELECT * FROM posts WHERE id=$1', [p.id]); await a.fireWebhooks(p.workspace_id, ev, await a.postPayload(cur || p)); } };

// Tekrarlayan gönderi: bir sonraki kopyayı oluşturur (aynı içerik, aynı kanallar, aynı onay durumu)
export async function createNextRepeat(p) {
  if (!INTERVAL[p.repeat_rule] || !p.scheduled_at) return null;
  const next = await one(`SELECT ($1::timestamptz + $2::interval) AS at`, [p.scheduled_at, INTERVAL[p.repeat_rule]]);
  if (p.repeat_until && new Date(next.at) > new Date(`${String(p.repeat_until).slice(0, 10)}T23:59:59+03:00`)) return null;
  const root = p.repeat_of || p.id;
  if (await one('SELECT 1 FROM posts WHERE repeat_of=$1 AND scheduled_at=$2', [root, next.at])) return null;
  return one(`INSERT INTO posts (workspace_id, brand_id, platforms, account_ids, publish_mode, scheduled_at, status, title, caption, hashtags, first_comment, visual_brief, pillar, format, template, template_data, media_ids, tags, repeat_rule, repeat_until, repeat_of, created_by)
    SELECT workspace_id, brand_id, platforms, account_ids, publish_mode, $2, CASE WHEN status='paylasildi' THEN 'onaylandi' ELSE status END, title, caption, hashtags, first_comment, visual_brief, pillar, format, template, template_data, media_ids, tags, repeat_rule, repeat_until, $3, created_by
    FROM posts WHERE id=$1 RETURNING id`, [p.id, next.at, root]);
}

async function mediaFor(p) {
  if (!p.media_ids?.length) return [];
  const rows = await all('SELECT id, mime, bytes FROM media WHERE id = ANY($1::int[]) AND workspace_id=$2', [p.media_ids, p.workspace_id]);
  const by = new Map(rows.map(r => [r.id, r])); const b = base();
  return p.media_ids.map(id => by.get(id)).filter(Boolean).map(m => ({ ...m, url: b + signedMediaPath(m.id) }));
}

async function publishTarget(p, t, acc, media) {
  const prov = providerFor(acc.kind); const token = unseal(acc.token_enc);
  if (!prov || !token || acc.status !== 'bagli') { await q(`UPDATE post_targets SET status='hata', error=$1, attempts=$2 WHERE id=$3`, ['Kanal bağlantısı geçersiz; Kanallar sayfasından yeniden bağlayın.', MAX_ATTEMPTS, t.id]); return false; }
  try {
    const r = await prov.publish(acc, token, { text: postText(p), first_comment: p.first_comment }, media);
    await q(`UPDATE post_targets SET status='paylasildi', external_id=$1, url=$2, error=NULL, attempts=attempts+1, published_at=now() WHERE id=$3`, [r.id, r.url, t.id]);
    if (acc.last_error) await q('UPDATE accounts SET last_error=NULL WHERE id=$1', [acc.id]);
    return true;
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(String(e.message || e));
    const attempts = t.attempts + 1; const final = !pe.retry || attempts >= MAX_ATTEMPTS;
    await q(`UPDATE post_targets SET status='hata', error=$1, attempts=$2, next_try=CASE WHEN $3 THEN NULL ELSE now() + ($4 || ' minutes')::interval END WHERE id=$5`,
      [pe.message.slice(0, 500), final ? MAX_ATTEMPTS : attempts, final, String(RETRY_MIN[Math.min(attempts - 1, RETRY_MIN.length - 1)]), t.id]);
    await q(`UPDATE accounts SET last_error=$1${pe.auth ? `, status='yeniden'` : ''} WHERE id=$2`, [pe.message.slice(0, 300), acc.id]);
    return false;
  }
}

export async function processPost(postId) {
  const p = await one(`UPDATE posts SET locked_at=now() WHERE id=$1 AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes') RETURNING *`, [postId]); if (!p) return null;
  try {
    const accs = await all(`SELECT * FROM accounts WHERE id = ANY($1::int[]) AND kind IS NOT NULL`, [p.account_ids || []]);
    for (const a of accs) await q('INSERT INTO post_targets (post_id, account_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, a.id]);
    const targets = await all('SELECT * FROM post_targets WHERE post_id=$1', [p.id]); const byAcc = new Map(accs.map(a => [a.id, a]));
    const media = await mediaFor(p);
    for (const t of targets) {
      if (t.status === 'paylasildi' || t.attempts >= MAX_ATTEMPTS || (t.next_try && new Date(t.next_try) > new Date())) continue;
      const acc = byAcc.get(t.account_id); if (acc) await publishTarget(p, t, acc, media);
    }
    const after = await all('SELECT t.status, t.attempts, t.error, a.name, a.platform FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.post_id=$1', [p.id]);
    if (after.length && after.every(t => t.status === 'paylasildi')) {
      await q(`UPDATE posts SET status='paylasildi', published_at=now(), publish_error=NULL, updated_at=now() WHERE id=$1`, [p.id]);
      await q(`INSERT INTO post_notes (post_id, author, kind, body) VALUES ($1,'Arvela Social','durum',$2)`, [p.id, `Otomatik paylaşıldı: ${after.map(t => t.name).join(', ')}.`]);
      await createNextRepeat(p); await hooks.onPublished(p, 'paylasildi').catch(() => {});
      return 'paylasildi';
    }
    const dead = after.filter(t => t.status === 'hata' && t.attempts >= MAX_ATTEMPTS); const pending = after.some(t => t.status !== 'paylasildi' && t.attempts < MAX_ATTEMPTS);
    if (!after.length) {
      const msg = 'Gönderide otomatik paylaşılacak bağlı kanal yok.';
      if (!p.publish_error) await failMail(p, msg); await q('UPDATE posts SET publish_error=$1 WHERE id=$2', [msg, p.id]); return 'hata';
    }
    if (dead.length && !pending) {
      const msg = dead.map(t => `${t.name}: ${t.error}`).join(' · ').slice(0, 900);
      if (!p.publish_error) { await failMail(p, msg); await hooks.onPublished(p, 'hata').catch(() => {}); }
      await q('UPDATE posts SET publish_error=$1 WHERE id=$2', [msg, p.id]); return 'hata';
    }
    return 'bekliyor';
  } finally { await q('UPDATE posts SET locked_at=NULL WHERE id=$1', [p.id]); }
}

async function failMail(p, msg) {
  for (const u of await recipients(p.workspace_id, ['owner', 'editor'])) await sendMail(u.email, `Paylaşılamadı: ${p.title || 'gönderi'}`, mailHtml('Bir gönderi otomatik paylaşılamadı', [msg, 'Gönderiyi açıp sorunu giderdikten sonra "Yeniden dene" diyebilir ya da elle paylaşabilirsiniz.'], ['Gönderiyi aç', `/gonderi/${p.id}`]), 'genel');
}

// Zamanı gelen gönderiler (askıdaki ya da süresi biten hesaplarınki hariç)
export async function publishDue(now = new Date()) {
  const due = await all(`SELECT p.id, w.status ws_status, w.plan, w.trial_ends, w.paid_until FROM posts p JOIN workspaces w ON w.id=p.workspace_id
    WHERE p.publish_mode='otomatik' AND p.status='onaylandi' AND p.scheduled_at <= $1 AND p.scheduled_at > $1::timestamptz - interval '3 days'
      AND (p.locked_at IS NULL OR p.locked_at < now() - interval '10 minutes')
      AND (EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id=p.id AND t.status<>'paylasildi' AND t.attempts < ${MAX_ATTEMPTS} AND (t.next_try IS NULL OR t.next_try <= $1))
           OR NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id=p.id)) ORDER BY p.scheduled_at LIMIT 25`, [now.toISOString()]);
  const out = [];
  for (const d of due) { if (!canUse({ status: d.ws_status, plan: d.plan, trial_ends: d.trial_ends, paid_until: d.paid_until }, now)) continue; out.push([d.id, await processPost(d.id)]); }
  return out;
}

// Metrikler: son 30 gündeki paylaşımlar (6 saatte bir), hesap takipçileri (günde bir)
export async function refreshMetrics() {
  const rows = await all(`SELECT a.*, t.id AS target_id, t.external_id AS post_ext, t.account_id FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.status='paylasildi' AND t.external_id IS NOT NULL
    AND t.published_at > now() - interval '30 days' AND (t.metrics_at IS NULL OR t.metrics_at < now() - interval '6 hours') AND a.status='bagli' ORDER BY t.metrics_at NULLS FIRST LIMIT 60`);
  let n = 0;
  for (const r of rows) {
    const prov = providerFor(r.kind); const tok = unseal(r.token_enc); if (!prov || !tok) continue;
    try { const m = await prov.postMetrics(r, tok, r.post_ext); await q('UPDATE post_targets SET metrics=$1, metrics_at=now() WHERE id=$2', [m ? JSON.stringify(m) : null, r.target_id]); n++; }
    catch (e) { await q('UPDATE post_targets SET metrics_at=now() WHERE id=$1', [r.target_id]); if (e.auth) await q(`UPDATE accounts SET status='yeniden', last_error=$1 WHERE id=$2`, [e.message.slice(0, 300), r.account_id]); }
  }
  const accs = await all(`SELECT * FROM accounts WHERE kind IS NOT NULL AND status='bagli' AND (followers_at IS NULL OR followers_at < now() - interval '20 hours') LIMIT 40`);
  for (const a of accs) {
    const prov = providerFor(a.kind); const tok = unseal(a.token_enc); if (!prov || !tok) continue;
    try { const f = await prov.followers(a, tok); await q('UPDATE accounts SET followers=COALESCE($1, followers), followers_at=now() WHERE id=$2', [f, a.id]); } catch { await q('UPDATE accounts SET followers_at=now() WHERE id=$1', [a.id]); }
  }
  // Süresi dolan bağlantılar
  await q(`UPDATE accounts SET status='yeniden', last_error='Bağlantının süresi doldu.' WHERE status='bagli' AND token_expires IS NOT NULL AND token_expires < now()`);
  return n;
}

let timer = null;
export function startPublisher(everyMs = 60_000) {
  if (timer) return; let busy = false; let last = 0;
  const tick = async () => {
    if (busy) return; busy = true;
    try { await publishDue(); if (Date.now() - last > 30 * 60_000) { last = Date.now(); await refreshMetrics(); } }
    catch (e) { console.error('paylaşım motoru:', e.message); } finally { busy = false; }
  };
  timer = setInterval(tick, everyMs); timer.unref?.(); setTimeout(tick, 10_000).unref?.();
}
