# Arvela Social (SaaS) hizmet kitapları (SAAS-01 … SAAS-06) — abonelik: kitap, abonenin açılışını ve aylık döngüsünü anlatır.
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'


def abonelik(code, paket, marka, kullanici, ozel):
    aylik(code, f'Arvela Social {paket}: yapay zekâ destekli otomatik sosyal medya planlama ve yayın aboneliği ({marka}, {kullanici}).',
     ['Hesap açılışı ve sosyal hesap bağlantıları', 'Marka sesi ve içerik sütunları sihirbazı', 'Aylık otomatik içerik takvimi ve onay ekranı', 'Zamanlanmış yayın ve temel analiz'] + ozel,
     ['İnsan editör kontrolü (SAAS-06)', 'Reklam yönetimi', 'Özel tasarım ve çekim'],
     [T('Aktif hesap', 'Sosyal hesaplar bağlı, ilk takvim üretildi'), T('Aylık takvim', 'Ay başında otomatik; abone onaylıyor'), T('Destek', 'İş günü içinde 1 gün yanıt')],
     [G('Sosyal hesap yönetici erişimi'), G('Marka bilgileri (sihirbazda)')],
     [S('Hoş geldin ve hesap açılışı', 'ai', 'tam', 1, None, None, 'Hesap', 'Giriş yapıldı'),
      S('Sosyal hesap bağlantıları', 'musteri', 'insan', 3, 'bilgi', H, 'Bağlı hesaplar', 'Karar kaydı var'),
      S('İlk takvimin üretimi', 'ai', 'tam', 1, None, None, 'Takvim', 'Marka sesine uygun'),
      S('Abone onayı: ilk takvim', 'musteri', 'insan', 3, 'onay', H, 'Onaylı takvim', 'Karar kaydı var'),
      S('Yayın ve kullanım takibi', 'ai', 'tam', 20, None, None, 'Yayınlar, kullanım', 'Hata yok'),
      S('Ay sonu özet ve yenileme', 'ai', 'tam', 2, None, None, 'Özet e-postası', 'Gönderildi')],
     ['Aktif kullanım (aylık giriş)', 'Onaylanan içerik oranı', 'Abonelik yenileme / kayıp oranı'],
     [R('Abone takvimi onaylamıyor', 'Hatırlatma; isteğe bağlı otomatik onay ayarı'), R('Platform API değişikliği', 'Durum sayfası ve bildirim; yayın kuyruğu bekletilir')],
     ['Claude abonenin marka sesine göre aylık takvim ve gönderi metinlerini üretir; abone onaylamadan yayın yapılmaz (otomatik onay açık değilse).'],
     ['Meta, TikTok, LinkedIn yayın API\'leri; abonelik ödemesi ödeme sağlayıcısı ile.'], None, 90, ['Takvimi onaylar, gönderiyi düzenler, analizi görür'])


abonelik('SAAS-01', 'Solo', '1 marka', '1 kullanıcı', ['2 sosyal hesap'])
abonelik('SAAS-02', 'Business', '1 marka', '3 kullanıcı', ['5 sosyal hesap', 'Ekip içi onay akışı'])
abonelik('SAAS-03', 'Agency', '5 marka', '10 kullanıcı', ['Müşteri onay bağlantısı', 'Marka başına ayrı takvim'])

aylik('SAAS-04', 'Aboneliğe eklenen her ek marka: ayrı marka sesi, takvim ve sosyal hesaplar.',
 ['Ek marka alanı', 'Marka sesi sihirbazı', 'Ayrı takvim ve onay'], ['Ek kullanıcı (paket kapsamı)'],
 [T('Ek marka aktif', 'Hesaplar bağlı, ilk takvim üretildi')], [G('Markanın sosyal hesapları')],
 [S('Marka alanı açılışı', 'ai', 'tam', 1, None, None, 'Marka', 'Açıldı'),
  S('Hesap bağlantıları', 'musteri', 'insan', 3, 'bilgi', H, 'Bağlantılar', 'Karar kaydı var'),
  S('İlk takvim', 'ai', 'tam', 1, None, None, 'Takvim', 'Üretildi'),
  S('Abone onayı', 'musteri', 'insan', 3, 'onay', H, 'Onay', 'Karar kaydı var')],
 ['Ek markanın aktif kullanımı'], [R('Markalar karışır', 'Her marka ayrı alan; yayın öncesi marka kontrolü')],
 ['Claude her marka için ayrı sistem talimatı kullanır.'], ['Marka başına ayrı bağlantı anahtarları.'], None, 90)

small('SAAS-05', 'Arvela Social kurulum ve marka eğitimi: hesapların bağlanması, marka sesinin ayarlanması ve 45 dakikalık kullanım eğitimi.',
 ['Hesap bağlantılarının birlikte yapılması', 'Marka sesi ve sütunların uzmanla ayarlanması', '45 dk canlı eğitim', 'İlk ayın takviminin birlikte gözden geçirilmesi'], ['Aylık içerik yönetimi', 'Tasarım'],
 [T('Hazır hesap', 'Tüm hesaplar bağlı, marka sesi onaylı'), T('Eğitim', 'Abone takvimi kendisi onaylayabiliyor')],
 [G('Sosyal hesap erişimleri'), G('Marka bilgileri ve örnek içerikler')],
 [S('Ön form', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Form', 'Dolu'),
  S('Marka sesi ayarı', 'ai', 'ai_taslak', 1, None, None, 'Ayar', 'Örnek metinler'),
  S('Müşteri onayı: ton', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Canlı kurulum ve eğitim', 'ekip', 'insan', 1, None, None, 'Kurulum', 'Tüm hesaplar bağlı'),
  S('İlk takvim kontrolü', 'ekip', 'ai_taslak', 1, None, 'Kabul ön kontrolü', 'Kontrol', 'Takvim onaylandı')], 7,
 ['Kurulumdan sonra 30 gün aktif kullanım'], [R('Abone yalnız bırakılınca bırakır', '14. gün kontrol araması')],
 ['Claude ön formdan marka sesini önerir.'], ['Eğitim kaydı abonenin yardım sayfasına eklenir.'], None, 60)

aylik('SAAS-06', 'İnsan editör kontrolü: yapay zekânın ürettiği her gönderiyi yayından önce Arvela editörünün okuyup düzeltmesi.',
 ['Her gönderinin editör kontrolü', 'Yazım, ton, doğruluk ve görsel kontrolü', 'Hassas konu uyarısı'], ['İçerik yazımı (sıfırdan)', 'Tasarım üretimi'],
 [T('Kontrol', 'Tüm gönderiler yayından en az 24 saat önce kontrollü')], [G('Ürün ve kampanya bilgileri güncel')],
 [S('Ayın takvimi geldi', 'ai', 'tam', 1, None, None, 'Takvim', 'Kuyrukta'),
  S('Editör kontrolü', 'ekip', 'insan', 5, None, 'Kabul ön kontrolü', 'Düzeltilmiş gönderiler', 'Hata yok'),
  S('Abone onayı', 'musteri', 'insan', 3, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Ay içi eklenenlerin kontrolü', 'ekip', 'insan', 15, None, None, 'Kontroller', '24 saat kuralı')],
 ['Editör düzeltme oranı', 'Yayın sonrası hata (0)'], [R('Editör yükü artar', 'Abone başına aylık gönderi sınırı')],
 ['Claude önce kendi kontrolünü yapar (yazım, yasaklı ifade), editör son okumayı yapar.'], ['Editör kuyruğu Arvela OS görevleri olarak açılır.'], None, 70)
