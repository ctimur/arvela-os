// Arvela Social — hizmet koşulları ve veri silme sayfaları (Meta ve LinkedIn uygulama başvuruları bu adresleri ister); hesabı silme.
import { route, send, redirect, audit, need } from './server.mjs';
import { one, q } from './db.mjs';
import { authPage, publicPage, layout, csrf } from './ui.mjs';
import { esc, HttpError } from './lib.mjs';

const page = (title, html) => publicPage(title, `<section class="card stack" style="line-height:1.65"><h1>${esc(title)}</h1>${html}<p class="muted">Taslak metindir; hukuki inceleme sonrası güncellenecektir. Sorularınız için: <a href="mailto:hello@arveladigital.com">hello@arveladigital.com</a></p></section>`);

export function register() {
  route('GET', '/kosullar', async (ctx, res) => send(res, 200, page('Hizmet koşulları', `
<p>Arvela Social, Arvela Digital &amp; AI tarafından sunulan, sosyal medya içeriği planlama, onaylama ve yayınlama hizmetidir. Hesap açan kişi bu koşulları kabul etmiş sayılır.</p>
<h2>Hesap ve kullanım</h2><p>Hesabınızdaki tüm içerik ve paylaşımlardan siz sorumlusunuz. Bağladığınız sosyal medya hesaplarında yalnız yetkili olduğunuz hesapları kullanabilirsiniz. Platformların (Meta, LinkedIn ve diğerleri) kullanım koşullarına uymak sizin sorumluluğunuzdadır.</p>
<h2>Kanal bağlantıları</h2><p>Bir kanalı bağladığınızda platformun verdiği erişim anahtarı şifrelenerek saklanır ve yalnız sizin zamanladığınız gönderileri paylaşmak ve bu gönderilerin istatistiklerini okumak için kullanılır. Kanalı Kanallar sayfasından istediğiniz an kaldırabilir, platform ayarlarından da erişimi geri alabilirsiniz.</p>
<h2>Yapay zekâ</h2><p>Yapay zekâ özellikleri yalnız hesap sahibinin açık onayıyla açılır. Üretilen içeriği yayınlamadan önce kontrol etmek kullanıcının sorumluluğundadır.</p>
<h2>Ücretlendirme</h2><p>Paketler aylık ücretlidir; ödeme havale ile yapılır ve fatura kesilir. Ödenmeyen hesaplar askıya alınabilir; veriler askı süresince silinmez.</p>
<h2>Sorumluluğun sınırı</h2><p>Platformlardaki kesintiler, API değişiklikleri ya da platformun bir gönderiyi reddetmesi nedeniyle paylaşılamayan gönderilerden Arvela sorumlu tutulamaz; paylaşılamayan gönderiler için e-posta ile bilgilendirme yapılır.</p>
<h2>Fesih</h2><p>Hesabınızı Hesabım sayfasından istediğiniz zaman silebilirsiniz.</p>`)), { open: true });

  route('GET', '/veri-silme', async (ctx, res) => send(res, 200, page('Verilerinizi silme', `
<p>Arvela Social'da tuttuğumuz verileri dilediğiniz zaman sildirebilirsiniz.</p>
<h2>Bir sosyal medya hesabının bağlantısını kaldırmak</h2><ol><li>Arvela Social'a giriş yapın ve <strong>Kanallar</strong> sayfasını açın.</li><li>İlgili hesapta <strong>Kaldır</strong>'a basın. Hesabın erişim anahtarı hemen silinir.</li>
<li>İsterseniz platform tarafında da erişimi geri alın: Facebook'ta Ayarlar → İşletme entegrasyonları; LinkedIn'de Ayarlar → Veri gizliliği → İzin verilen hizmetler.</li></ol>
<h2>Hesabınızı ve tüm verilerinizi silmek</h2><ol><li>Hesap sahibi olarak giriş yapın ve <strong>Hesabım</strong> sayfasını açın.</li><li><strong>Hesabı ve verileri sil</strong> bölümünde işletme adınızı yazıp onaylayın.</li></ol>
<p>Bu işlem markaları, gönderileri, görselleri, kanal bağlantılarını ve ekip üyelerini kalıcı olarak siler. Yedeklerdeki kopyalar en geç 30 gün içinde kendiliğinden silinir. Giriş yapamıyorsanız <a href="mailto:hello@arveladigital.com">hello@arveladigital.com</a> adresine hesabınıza kayıtlı e-postadan yazın; talebiniz 30 gün içinde sonuçlandırılır.</p>`)), { open: true });

  route('POST', '/hesabim/sil', async (ctx, res) => {
    need(ctx, 'owner');
    if (String(ctx.body.onay || '').trim().toLocaleLowerCase('tr') !== String(ctx.ws.name).trim().toLocaleLowerCase('tr')) throw new HttpError(400, 'Onay için işletme adını aynen yazın.');
    await audit(ctx, 'workspace.delete', { id: ctx.ws.id, name: ctx.ws.name });
    await q('DELETE FROM workspaces WHERE id=$1', [ctx.ws.id]);
    res.writeHead(303, { Location: '/', 'Set-Cookie': 'ss=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' }); res.end();
  });
}
