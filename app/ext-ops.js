// Arvela OS — işletim: veritabanı yedeği ve geri yükleme testi kayıtları (yedek servisi yazar), kesinti izleme bilgisi.
// Yedek servisi (app/backup.sh) her gece şifreli yedek alır ve sonucu ops_events tablosuna yazar; bu modül gösterir ve uyarır.
import { t } from './i18n.js';

const H = 3600 * 1000;
export async function migrateOps({ q }) {
  await q(`CREATE TABLE IF NOT EXISTS ops_events (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, ok BOOLEAN NOT NULL, detail TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE INDEX IF NOT EXISTS ops_events_kind_at ON ops_events(kind, at DESC)`);
  await q(`DELETE FROM ops_events WHERE at < now() - interval '180 days'`);
}

// Yedek durumu: son başarılı yedek, son hata, son geri yükleme testi.
export function backupState(rows, now = Date.now()) {
  const last = (kind, ok) => rows.find(r => r.kind === kind && (ok === undefined || r.ok === ok)) || null;
  const okB = last('yedek', true), anyB = last('yedek'), okR = last('geri_yukleme', true), anyR = last('geri_yukleme');
  const age = okB ? (now - new Date(okB.at)) / H : Infinity;
  let level = 'ok', msg = 'Yedekler düzenli alınıyor.';
  if (!anyB) { level = 'warn'; msg = 'Yedek servisi henüz çalışmadı. Yayından birkaç dakika sonra ilk kayıt düşer.'; }
  else if (!okB) { level = 'bad'; msg = anyB.detail || 'Hiç başarılı yedek yok.'; }
  else if (age > 36) { level = 'bad'; msg = t`Son başarılı yedek ${Math.floor(age)} saat önce.`; }
  else if (anyB && !anyB.ok) { level = 'warn'; msg = t`Son deneme başarısız: ${anyB.detail || ''}`; }
  const rAge = okR ? (now - new Date(okR.at)) / H : Infinity;
  if (level === 'ok' && rAge > 24 * 9) { level = 'warn'; msg = anyR && !anyR.ok ? t`Geri yükleme testi başarısız: ${anyR.detail || ''}` : 'Geri yükleme testi 9 günden uzun süredir yapılmadı.'; }
  return { level, msg, okB, anyB, okR, anyR, ageHours: age };
}

export function registerOps({ route, all, need, layout, h, send }) {
  const load = (n = 40) => all(`SELECT kind, ok, detail, at FROM ops_events ORDER BY at DESC, id DESC LIMIT ${n}`).catch(() => []);
  const when = (d) => d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }) : '—';
  route('GET', '/ayarlar/yedek', async (ctx, res) => {
    need(ctx, 'admin');
    const rows = await load(60); const st = backupState(rows);
    const tone = { ok: 'ok', warn: 'warn', bad: 'bad' }[st.level];
    const KIND = { yedek: 'Yedek', geri_yukleme: 'Geri yükleme testi' };
    send(res, 200, layout(ctx, 'Yedek ve izleme', `<nav class="crumb"><a href="/ayarlar">Ayarlar</a></nav>
<div class="page-head"><div><h1>Yedek ve izleme</h1><p class="ph-meta"><span class="badge ${tone}">${st.level === 'ok' ? 'Sağlıklı' : st.level === 'warn' ? 'Dikkat' : 'Sorun var'}</span><span>${h(st.msg)}</span></p></div></div>
<div class="kpi"><div><span>Son başarılı yedek</span><b>${st.okB ? when(st.okB.at) : '—'}</b><span>her gece 02:30</span></div>
<div><span>Son geri yükleme testi</span><b>${st.okR ? when(st.okR.at) : '—'}</b><span>haftada bir</span></div><div><span>Saklama</span><b>30 gün</b><span>AES-256 şifreli, sunucu dışında</span></div></div>
<section class="card"><h2>Kayıtlar</h2>${rows.length ? `<div class="tbl"><table><tr><th>Zaman</th><th>İşlem</th><th>Sonuç</th><th>Ayrıntı</th></tr>${rows.map(r => `<tr><td data-sort="${new Date(r.at).toISOString()}">${when(r.at)}</td><td>${KIND[r.kind] || h(r.kind)}</td><td><span class="badge ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'Başarılı' : 'Hata'}</span></td><td>${h(r.detail || '')}</td></tr>`).join('')}</table></div>` : '<p class="muted">Henüz kayıt yok.</p>'}</section>
<aside class="insp"><section><h2>Nasıl çalışır</h2><p>Her gece 02:30'da veritabanının tamamı alınır, AES-256 ile şifrelenir ve sunucu dışında, özel bir GitHub deposunda saklanır. 30 günden eski yedekler silinir.</p>
<p>Haftada bir son yedek indirilir, çözülür ve boş bir veritabanına yüklenip tablo ve kayıt sayıları kontrol edilir. Yedek alınamazsa ya da test başarısız olursa Bugün ekranında uyarı çıkar.</p></section>
<section><h2>Kurulum (bir kez)</h2><ol class="steps"><li>GitHub'da <b>özel</b> bir depo açın: <code>arvela-os-yedek</code>.</li><li>Yalnız bu depoya <b>Contents: okuma ve yazma</b> izni olan, ince ayarlı bir erişim anahtarı oluşturun.</li><li>arvela-os deposunun gizli değerlerine ekleyin: <code>BACKUP_GITHUB_TOKEN</code> (anahtar) ve <code>BACKUP_PASSPHRASE</code> (uzun bir parola; bir parola yöneticisinde saklayın, kaybolursa yedekler açılamaz).</li><li>Actions → Yayına al → Run workflow.</li></ol></section>
<section><h2>Kesinti izleme</h2><p>GitHub her 5 dakikada bir os.arveladigital.com, n8n ve arveladigital.com adreslerini kontrol eder. İki deneme üst üste başarısız olursa arvela-os deposunda "Kesinti" kaydı açılır ve GitHub size e-posta gönderir. Site geri gelince kayıt kendiliğinden kapanır.</p></section>
<section><h2>Geri yükleme (acil durum)</h2><p class="muted">Yedeği indirin, <code>openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in arvela.dump.enc -out arvela.dump</code> ile çözün, <code>pg_restore --clean -d arvela arvela.dump</code> ile yükleyin. Canlıya yüklemeden önce mutlaka bir kopyada deneyin.</p></section></aside>`, '/ayarlar'));
  });
  // Bugün: yalnız Yöneticiye, yedek sorunluysa
  return {
    async todayActions() {
      const st = backupState(await load(20));
      if (st.level === 'ok') return [];
      return [{ adminOnly: true, score: st.level === 'bad' ? 86 : 50, tone: st.level, tag: 'Yedek', meta: 'Veritabanı yedeği', title: st.level === 'bad' ? 'Veritabanı yedeği alınamıyor' : 'Yedekte dikkat gereken bir durum var',
        body: st.msg, actions: [['Yedek durumunu aç', '/ayarlar/yedek', 'pri']] }];
    },
  };
}
