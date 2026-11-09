// Arvela OS — demo verisi: canlı sistemde sistemi göstermek ve geri bildirim almak için gerçekçi örnek müşteriler,
// projeler, teklifler, faturalar, yapay zekâ taslakları ve müşteri kararları. Tek tuşla yüklenir, tek tuşla izsiz silinir.
// Kaynak: app/demo.json (tools/demo_export.py, simülasyon veritabanından üretir). Tarihler yükleme anına kaydırılır.
// Demo kayıtlar clients.is_demo / users.is_demo ile işaretlenir; n8n'e olay göndermez, fatura numarası "DEMO-" ile başlar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let FIX = null;
export const fixture = () => (FIX ??= JSON.parse(fs.readFileSync(path.join(HERE, 'demo.json'), 'utf8')));

export async function migrateDemo({ q }) {
  await q('ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false');
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false');
}

// Sayfa yolundaki kimlikleri yeni kimliklerle değiştir (/gorev/12 → /gorev/431).
const PATHS = { gorev: 'tasks', projeler: 'projects', musteriler: 'clients', satis: 'clients', teklifler: 'quotes', faturalar: 'invoices', onaylar: 'approvals', 'yapay-zeka': 'ai_jobs', paketler: 'work_packages' };
export function rewriteHref(s, ids) {
  if (typeof s !== 'string') return s;
  return s.replace(/\/(portal\/teklifler|gorev|projeler|musteriler|satis|teklifler|faturalar|onaylar|yapay-zeka|paketler)\/(\d+)/g, (m, p, n) => {
    const t = p === 'portal/teklifler' ? 'quotes' : PATHS[p]; const to = ids[t]?.get(Number(n)); return to ? `/${p}/${to}` : m;
  });
}
// Tarihleri yükleme anına kaydır: zaman damgası ms kadar, tarih gün kadar.
export function shift(v, type, ms) {
  if (v == null) return v;
  if (type === 'timestamp with time zone') return new Date(new Date(v).getTime() + ms).toISOString();
  if (type === 'date') { const d = new Date(String(v).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(ms / 864e5)); return d.toISOString().slice(0, 10); }
  return v;
}

export function registerDemo({ route, one, all, q, need, layout, h, csrfField, redirect, send, HttpError, audit, withTx, hashPassword }) {
  const state = async (a) => one(`SELECT (SELECT count(*) FROM clients WHERE agency_id=$1 AND is_demo)::int clients, (SELECT count(*) FROM users WHERE agency_id=$1 AND is_demo)::int users,
    (SELECT count(*) FROM projects p JOIN clients c ON c.id=p.client_id WHERE c.agency_id=$1 AND c.is_demo)::int projects`, [a]);

  // Yükle: tek işlemde; bir hata olursa hiçbir şey yazılmaz.
  async function load(ctx, password) {
    const F = fixture(); const a = ctx.user.agency_id; const ms = Date.now() - new Date(F.ref_time).getTime();
    return withTx(async (tq) => {
      const one1 = async (s, p) => (await tq(s, p)).rows[0] || null;
      const svc = new Map((await tq('SELECT id, code FROM services WHERE agency_id=$1', [a])).rows.map(r => [r.code, r.id]));
      const ids = {}; const later = []; const hash = hashPassword(password);
      const mapRef = (ref, v) => {
        if (v == null) return null;
        if (ref === 'agencies') return a;
        if (ref === 'services') return svc.get(F.services[String(v)]) ?? null;
        if (ref === 'users' && !ids.users?.has(v)) return ids.users ? ctx.user.id : undefined; // simülasyonun yöneticisi → yükleyen yönetici
        return ids[ref]?.has(v) ? ids[ref].get(v) : undefined; // undefined: tablo henüz yüklenmedi → sonra bağla
      };
      for (const tb of F.tables) {
        const fk = F.fks[tb.name] || {}; const ty = F.types[tb.name] || {}; ids[tb.name] = new Map();
        for (const r of tb.rows) {
          const cols = [], vals = [], defer = [];
          for (const [c, v0] of Object.entries(r)) {
            if (c === 'id') continue;
            let v = v0;
            if (fk[c]) { const m = mapRef(fk[c], v0); if (m === undefined) { defer.push([c, fk[c], v0]); v = null; } else v = m; }
            else if (ty[c] === 'jsonb') v = v0 == null ? null : JSON.stringify(v0);
            else if (ty[c] === 'bytea') v = v0 == null ? null : Buffer.from(String(v0).replace(/^\\x/, ''), 'hex');
            else v = shift(v0, ty[c], ms);
            cols.push(c); vals.push(v);
          }
          if (tb.name === 'users') { cols.push('pass_hash', 'is_demo'); vals.push(hash, true); }
          if (tb.name === 'clients') { cols.push('is_demo'); vals.push(true); }
          if (tb.name === 'notifications') { const i = cols.indexOf('ref'); if (i >= 0) vals[i] = 'demo:' + (vals[i] || r.id); }
          const x = await one1(`INSERT INTO ${tb.name} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, vals);
          ids[tb.name].set(r.id, x.id);
          for (const d of defer) later.push([tb.name, x.id, ...d]);
        }
      }
      for (const [t, id, c, ref, v] of later) { const m = mapRef(ref, v); if (m != null) await tq(`UPDATE ${t} SET "${c}"=$1 WHERE id=$2`, [m, id]); }
      // Bağlantı içeren metin alanları
      for (const [t, c] of [['notifications', 'href'], ['ai_suggestions', 'ref']]) for (const [, nid] of ids[t] || []) {
        const r = await one1(`SELECT "${c}" v FROM ${t} WHERE id=$1`, [nid]); const v = rewriteHref(r?.v, ids); if (v !== r?.v) await tq(`UPDATE ${t} SET "${c}"=$1 WHERE id=$2`, [v, nid]);
      }
      return Object.fromEntries(Object.entries(ids).map(([k, m]) => [k, m.size]));
    });
  }

  // Kaldır: demo müşterilerden ve demo kullanıcılardan bağlı tüm kayıtlara (yabancı anahtarlar üzerinden) iner.
  async function purge(a) {
    const fkRows = await all(`SELECT tc.table_name child, kcu.column_name col, ccu.table_name parent, c.is_nullable = 'YES' nullable FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
      JOIN information_schema.columns c ON c.table_name=tc.table_name AND c.column_name=kcu.column_name AND c.table_schema='public' WHERE tc.constraint_type='FOREIGN KEY'`);
    const hasId = new Set((await all(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id'`)).map(r => r.table_name));
    const gone = {};
    return withTx(async (tq) => {
      async function del(table, ids) {
        ids = ids.filter(x => x != null).map(String); if (!ids.length) return; // oturum gibi metin kimlikler için metinle karşılaştır
        (gone[table] ||= []).push(...ids);
        for (const f of fkRows.filter(f => f.parent === table)) {
          // Kullanıcıya ve siteye bağlı isteğe bağlı alanlar boşaltılır (gerçek kayıtlar kalır); diğer bağlı kayıtlar silinir.
          if (f.nullable && (table === 'users' || f.child === 'sites' || (f.child === table))) { await tq(`UPDATE ${f.child} SET "${f.col}"=NULL WHERE "${f.col}"::text = ANY($1::text[])`, [ids]); continue; }
          if (hasId.has(f.child)) await del(f.child, (await tq(`SELECT id FROM ${f.child} WHERE "${f.col}"::text = ANY($1::text[])`, [ids])).rows.map(r => r.id));
          else await tq(`DELETE FROM ${f.child} WHERE "${f.col}"::text = ANY($1::text[])`, [ids]);
        }
        await tq(`DELETE FROM ${table} WHERE id::text = ANY($1::text[])`, [ids]);
      }
      await del('clients', (await tq('SELECT id FROM clients WHERE agency_id=$1 AND is_demo', [a])).rows.map(r => r.id));
      await del('users', (await tq('SELECT id FROM users WHERE agency_id=$1 AND is_demo', [a])).rows.map(r => r.id));
      // Gerçek kullanıcılara düşen, demo kayıtları gösteren bildirimler
      const hrefs = []; const P = { tasks: '/gorev/', projects: '/projeler/', clients: '/musteriler/', quotes: '/teklifler/', invoices: '/faturalar/', approvals: '/onaylar/', ai_jobs: '/yapay-zeka/', work_packages: '/paketler/' };
      for (const [t, p] of Object.entries(P)) for (const id of gone[t] || []) hrefs.push(p + id, (t === 'clients' ? '/satis/' : p) + id);
      await tq(`DELETE FROM notifications WHERE agency_id=$1 AND (ref LIKE 'demo:%' OR split_part(href, '#', 1) = ANY($2::text[]))`, [a, hrefs]);
      return Object.fromEntries(Object.entries(gone).map(([k, v]) => [k, v.length]));
    });
  }

  route('GET', '/ayarlar/demo', async (ctx, res) => {
    need(ctx, 'admin'); const s = await state(ctx.user.agency_id); const f = csrfField(ctx); const F = fixture();
    const team = F.tables.find(t => t.name === 'users').rows; const firms = F.tables.find(t => t.name === 'clients').rows;
    send(res, 200, layout(ctx, 'Demo verisi', `<nav class="crumb"><a href="/ayarlar">Ayarlar</a></nav>
<div class="page-head"><div><h1>Demo verisi</h1><p class="ph-meta">Sistemi canlı göstermek ve geri bildirim almak için gerçekçi örnek iş</p></div></div>
${s.clients ? `<div class="callout"><strong>Demo verisi yüklü:</strong> ${s.clients} firma, ${s.projects} proje, ${s.users} demo hesap. Demo kayıtlar n8n'e e-posta/WhatsApp göndermez; faturaları "DEMO-" numaralıdır.</div>` : ''}
<section class="card"><h2>İçinde ne var</h2>
<p class="muted">${firms.map(c => `${h(c.name)} <span class="muted">(${c.status === 'lead' ? 'aday' : 'müşteri'})</span>`).join(' · ')}</p>
<ul><li>Satış hattı: yeni, ulaşıldı, ön görüşme ve kaybedilen adaylar; bir teklifte değişiklik turu</li>
<li>Teklifler, ödenmiş, gecikmiş ve taslak faturalar; teklifte anlaşılan fiyatla aylık hizmetler</li>
<li>Hizmet kitaplarından açılmış 7 proje: biten, süren, müşteri kararı bekleyen ve düzeltme turu yaşamış</li>
<li>Claude taslakları ve önerileri, kontrol listesi, hatırlatma, müşteriye soru (dosyalı yanıt)</li>
<li>Freelancer iş paketleri ve süre kayıtları; ekip bildirimleri</li></ul>
<p class="muted">Demo hesaplar (portal ve ekip gözünden göstermek için): ${team.map(u => `${h(u.name)} · ${h(u.email)}`).join(' · ')}</p></section>
${s.clients ? `<section class="card"><h2>Demo verisini kaldır</h2><p class="muted">Demo firmalar, hesaplar ve bunlara bağlı her kayıt silinir. Gerçek kayıtlarınıza dokunulmaz; demo kişiye atadığınız gerçek görevlerin sorumlusu boşalır.</p>
<form method="post" action="/ayarlar/demo/kaldir" data-confirm="Tüm demo verisi silinsin mi? Bu geri alınamaz.">${f}<button class="danger">Demo verisini kaldır</button></form></section>`
: `<form class="card stack" method="post" action="/ayarlar/demo/yukle" style="max-width:620px">${f}<h2>Demo verisini yükle</h2>
<p class="muted">Tarihler bugüne göre ayarlanır. Demo hesapların hepsine aşağıdaki şifre verilir; şifreyi siz belirleyin ve yalnız demo gösterdiğiniz kişilerle paylaşın.</p>
<label>Demo hesap şifresi<input type="password" name="password" minlength="10" required autocomplete="new-password"></label>
<div><button class="gold">Demo verisini yükle</button></div></form>`}`, '/ayarlar'));
  });
  route('POST', '/ayarlar/demo/yukle', async (ctx, res) => {
    need(ctx, 'admin'); const pw = String(ctx.body.password || '');
    if (pw.length < 10) throw new HttpError(400, 'Demo hesap şifresi en az 10 karakter olmalı.');
    if ((await state(ctx.user.agency_id)).clients) throw new HttpError(400, 'Demo verisi zaten yüklü. Yeniden yüklemek için önce kaldırın.');
    const n = await load(ctx, pw); await audit(ctx, 'demo.load', { clients: n.clients, projects: n.projects });
    redirect(res, '/panel');
  });
  route('POST', '/ayarlar/demo/kaldir', async (ctx, res) => {
    need(ctx, 'admin'); const n = await purge(ctx.user.agency_id); await audit(ctx, 'demo.remove', { clients: n.clients || 0 });
    redirect(res, '/ayarlar/demo');
  });

  return { isDemoClient: async (id) => !!id && !!(await one('SELECT 1 FROM clients WHERE id=$1 AND is_demo', [Number(id)]).catch(() => null)), purge, load };
}
