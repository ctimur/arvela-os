# Arvela Estate (Emlak) hizmet kitapları (EML-01 … EML-14)
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'

small('EML-01', 'Emlak ofisi web sitesi: portföy listeleme, gelişmiş arama, danışman sayfaları, talep formları ve WhatsApp yönlendirmesi; ilanlar portal ya da CRM\'den otomatik.',
 ['Keşif ve site haritası', 'Tasarım (2 yön, seçilen yönde tüm şablonlar)', 'Portföy listeleme, harita ve filtreli arama', 'Danışman profilleri ve talep formları', 'İlan aktarımı (EML-06 ya da Arvela Estate CRM)', 'Temel SEO, KVKK metinleri, hız'],
 ['Çekim (EML-14)', 'Reklam (EML-12)', 'Ek dil (WEB-06)'],
 [T('Yayındaki site', 'Mobil PageSpeed 85+; tüm ilanlar güncel'), T('Arama', 'Konum, tip, fiyat, oda filtreleri çalışıyor'), T('Talep akışı', 'Form ve WhatsApp talepleri danışmana 1 dk içinde düşüyor')],
 [G('Logo, marka renkleri, ofis bilgileri'), G('Danışman listesi ve fotoğrafları'), G('İlan kaynağı (portal hesabı ya da CRM)'), G('Alan adı erişimi')],
 [S('Keşif ve site haritası', 'ekip', 'ai_taslak', 3, 'bilgi', 'Bilgi isteği', 'Site haritası', 'Talep yolları net'),
  S('Müşteri onayı: site haritası', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('İki tasarım yönü', 'ekip', 'insan', 4, None, None, 'Tasarım yönleri', 'Mobil öncelikli'),
  S('Müşteri seçimi: tasarım', 'musteri', 'insan', 2, 'secim', H, 'Seçilen yön', 'Karar kaydı var'),
  S('Geliştirme ve ilan aktarımı', 'ekip', 'insan', 12, None, None, 'Çalışan site', 'İlanlar otomatik geliyor'),
  S('İçerik ve SEO metinleri', 'ai', 'ai_taslak', 3, None, None, 'Sayfa metinleri, ilçe sayfaları', 'Yerel anahtar kelimeler'),
  S('Kalite kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Kontrol raporu', 'Hız, form, erişilebilirlik'),
  S('Müşteri kabul ve yayın', 'musteri', 'insan', 3, 'onay', H, 'Yayın onayı', 'Karar kaydı var')], 30,
 ['Aylık talep sayısı', 'İlan sayfası başına talep', 'Organik trafik'], [R('İlan verisi bozuk', 'Aktarımda doğrulama; hatalı ilan yayına alınmaz'), R('Danışman fotoğrafları gecikir', 'Geçici yer tutucu; yayın engellenmez')],
 ['Claude ilçe ve mahalle tanıtım sayfalarını, ilan açıklama şablonlarını yazar.'], ['WordPress + emlak eklentisi ya da Arvela Estate; ilan aktarımı XML/API.'], None, 55, ['Talepleri ve site istatistiklerini görür'], '2 tur')

small('EML-02', 'Konut projesi tanıtım sitesi: proje hikâyesi, kat planları, daire seçici, sanal tur, ödeme planı ve satış ofisine randevu.',
 ['Proje hikâyesi ve konum sayfası', 'Kat planları ve etkileşimli daire seçici', 'Sanal tur/video yerleşimi', 'Ödeme planı hesaplayıcı', 'Randevu ve talep akışı (satış ekibine)', 'Çok dil (TR + 1 dil)'],
 ['Görselleştirme/render üretimi', 'Reklam kampanyası (EML-13)'],
 [T('Yayındaki site', 'Daire seçici güncel stokla; mobil hızlı'), T('Talep akışı', 'Randevu talepleri satış ekibine anında')],
 [G('Render, kat planları, stok listesi'), G('Ödeme planı seçenekleri'), G('Satış ofisi bilgileri')],
 [S('Keşif ve içerik planı', 'ekip', 'ai_taslak', 3, 'bilgi', 'Bilgi isteği', 'Plan', 'Stok verisi biçimi net'),
  S('Müşteri seçimi: tasarım yönü', 'musteri', 'insan', 3, 'secim', H, 'Seçilen yön', 'Karar kaydı var'),
  S('Tasarım', 'ekip', 'insan', 6, None, None, 'Ekranlar', 'Daire seçici akışı'),
  S('Geliştirme', 'ekip', 'insan', 12, None, None, 'Site', 'Stok güncellemesi kolay'),
  S('Metinler ve çeviri', 'ai', 'ai_taslak', 3, None, None, 'Metinler', 'İki dilde'),
  S('Kalite kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Hız ve form'),
  S('Müşteri kabul ve yayın', 'musteri', 'insan', 3, 'onay', H, 'Yayın onayı', 'Karar kaydı var')], 31,
 ['Randevu talebi', 'Daire seçici kullanım oranı'], [R('Stok güncel değil', 'Satış ekibi tek tabloyu günceller, site otomatik çeker')],
 ['Claude proje hikâyesini, konum avantajlarını ve iki dilli metinleri yazar.'], ['Stok tablosu Google Sheets ya da CRM\'den; daire seçici SVG kat planı.'], None, 50, None, '2 tur')

small('EML-03', 'Danışman kişisel sayfası: danışmanın tanıtımı, aktif portföyü, yorumları ve tek tıkla iletişim.',
 ['Tek sayfa, danışman profili', 'Aktif portföy (otomatik)', 'Yorumlar ve iletişim'], ['Ayrı alan adı (istenirse ek)', 'Çekim'],
 [T('Sayfa', 'Portföy otomatik güncel, mobil uyumlu')], [G('Danışman fotoğrafı ve biyografisi')],
 [S('Biyografi ve metin', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Metin', 'Onaylı bilgiler'),
  S('Sayfa kurulumu', 'ekip', 'insan', 2, None, None, 'Sayfa', 'Portföy bağlı'),
  S('Danışman onayı', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var')], 5,
 ['Sayfadan gelen talep'], [R('Danışman ayrılır', 'Sayfa ofis sayfasına yönlenir')],
 ['Claude danışman bilgilerinden kısa biyografi yazar.'], ['Ofis sitesindeki portföyden danışman filtresi.'], None, 60)

aylik('EML-04', 'Arvela Estate CRM: portföy, müşteri talepleri, eşleştirme, randevu ve danışman performansı tek yerde (ofis aboneliği).',
 ['Portföy ve müşteri kayıtları', 'Talep–portföy otomatik eşleştirme', 'Randevu ve gösterim takibi', 'Danışman performans paneli', 'WhatsApp entegrasyonu'], ['Kurulum ve veri taşıma (EML-07)', 'Ek kullanıcılar (EML-05)'],
 [T('Aktif ofis', 'Danışmanlar giriş yapıyor, portföy güncel'), T('Destek', 'İş günü içinde 1 gün')],
 [G('Danışman listesi')],
 [S('Aylık kullanım kontrolü', 'ai', 'tam', 25, None, None, 'Kullanım raporu', 'Aktif kullanıcı'),
  S('Güncelleme notları ve öneriler', 'ai', 'ai_taslak', 2, None, None, 'Ay sonu özeti', 'Gönderildi'),
  S('Ofis değerlendirmesi', 'musteri', 'insan', 3, 'secim', H, 'İstekler', 'Karar kaydı var')],
 ['Aktif danışman oranı', 'Eşleştirmeden çıkan gösterim'], [R('Danışmanlar kullanmaz', 'Kısa eğitim videoları; ofis yöneticisine kullanım raporu')],
 ['Claude talep metinlerini yapılandırır ve portföyle eşleştirir, danışmana öneri listesi çıkarır.'], ['Arvela Estate (Arvela OS tabanlı) ofis alanı.'], None, 75)

aylik('EML-05', 'Arvela Estate\'e ek danışman kullanıcısı.', ['Kullanıcı hesabı ve yetkiler', 'Kısa eğitim videoları'], ['Ek ofis'],
 [T('Hesap', 'Danışman giriş yaptı')], [G('Danışman bilgileri')],
 [S('Hesap açılışı', 'ai', 'tam', 1, None, None, 'Hesap', 'Davet gitti'), S('Danışman ilk giriş', 'musteri', 'insan', 3, 'bilgi', H, 'Giriş', 'Karar kaydı var'), S('Kullanım takibi', 'ai', 'tam', 25, None, None, 'Rapor', 'Aktif')],
 ['Aktif kullanım'], [R('Hesap paylaşımı', 'Kişisel giriş; KVKK erişim kaydı')], ['Claude yeni danışmana ilk hafta ipuçları gönderir.'], ['Rol yetkisi: danışman.'], None, 90)

small('EML-06', 'Portal ilan aktarımı: ilanların sahibinden.com, hepsiemlak, emlakjet gibi portallara ve sitelere tek yerden aktarılması (portal başına).',
 ['Portal hesabı ve aktarım biçimi', 'Alan eşleştirme (tip, oda, m², özellikler)', 'Otomatik ekleme/güncelleme/kaldırma', 'Hata raporu'], ['Portal ücretleri', 'İlan içerik üretimi'],
 [T('Aktarım', 'Yeni ilan 1 saat içinde portalda; satılan ilan kalkıyor')], [G('Portal kurumsal hesabı ve entegrasyon izni')],
 [S('Portal izni ve biçim', 'musteri', 'insan', 5, 'bilgi', H, 'Entegrasyon izni', 'Karar kaydı var'),
  S('Alan eşleştirme', 'ai', 'ai_taslak', 2, None, None, 'Eşleme tablosu', 'Tüm zorunlu alanlar'),
  S('Aktarım kurulumu', 'ekip', 'insan', 3, None, None, 'Akış', 'Test ilanı yayında'),
  S('Doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Hata yok'),
  S('Müşteri kabulü', 'musteri', 'insan', 2, 'onay', H, 'Kabul', 'Karar kaydı var')], 13,
 ['Aktarım hata oranı', 'İlan güncelleme gecikmesi'], [R('Portal biçimi değişir', 'Hata bildirimi; AI-16 bakım kapsamı')],
 ['Claude eşleşmeyen alanları ve eksik bilgileri ilan bazında raporlar.'], ['Portal XML/API; n8n zamanlanmış akış.'], None, 65)

small('EML-07', 'Arvela Estate kurulum ve veri taşıma: mevcut portföy, müşteri ve talep kayıtlarının temizlenip aktarılması, ofis eğitimi.',
 ['Mevcut veri çıkarımı (Excel, eski CRM)', 'Temizleme ve tekilleştirme', 'Aktarım ve doğrulama', 'Ofis eğitimi (60 dk)'], ['Kâğıt kayıtların dijitalleştirilmesi'],
 [T('Aktarılmış veri', 'Kayıt sayıları eşleşiyor, çift kayıt yok'), T('Eğitim', 'Danışmanlar ilk portföyü kendi girdi')],
 [G('Mevcut veri dosyaları'), G('Müşteri kayıtları için KVKK dayanağı')],
 [S('Veri teslimi', 'musteri', 'insan', 3, 'bilgi', H, 'Dosyalar', 'Karar kaydı var'),
  S('Temizleme ve eşleme', 'ai', 'ai_taslak', 3, None, None, 'Temiz veri', 'Çiftler birleştirildi'),
  S('Aktarım', 'ekip', 'insan', 2, None, None, 'Aktarılmış kayıtlar', 'Sayılar eşleşiyor'),
  S('Doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Örneklem doğru'),
  S('Eğitim ve kabul', 'musteri', 'insan', 2, 'onay', H, 'Kabul', 'Karar kaydı var')], 11,
 ['Aktarım doğruluğu', '30 gün sonra aktif kullanım'], [R('Eski veride izin dayanağı yok', 'Pazarlama iletisi için kullanılmaz; yalnız hizmet ilişkisi')],
 ['Claude dağınık kayıtları (serbest metin notlar dahil) yapılandırır ve tekilleştirir.'], ['Aktarım öncesi yedek; geri alma planı.'], None, 65)

aylik('EML-08', 'Yapay zekâ ile ilan metni ve çok dilli açıklama: her yeni ilan için SEO uyumlu Türkçe metin ve hedef dillere çeviri.',
 ['Yeni ilan başına açıklama (Türkçe)', 'İngilizce, Almanca, Arapça, Rusça seçenekleri', 'Başlık ve öne çıkan özellik listesi'], ['Fotoğraf/video', 'Portal ücretleri'],
 [T('İlan metinleri', 'İlan verisine sadık; abartı ve yanlış iddia yok')], [G('İlan verisi (CRM\'den otomatik)')],
 [S('Yeni ilanları yakala', 'ai', 'tam', 25, None, None, 'Metin taslakları', 'Her ilan için'),
  S('Danışman onayı', 'musteri', 'insan', 3, 'onay', H, 'Onaylı metinler', 'Karar kaydı var'),
  S('Ay sonu özeti', 'ai', 'tam', 1, None, None, 'Özet', 'İlan sayısı')],
 ['Onaylanan metin oranı', 'İlan başına talep'], [R('Yanıltıcı ilan ifadesi', 'Yalnız ilan verisindeki özellikler; yasaklı ifade listesi')],
 ['Claude ilan verisinden metin ve çeviri üretir; danışman onaylar.'], ['Arvela Estate ilan olayı → n8n → Claude → onay kuyruğu.'], None, 85)

asistan_code = 'EML-09'
small(asistan_code, 'WhatsApp emlak asistanı: ilan sorularını yanıtlayan, alıcı/kiracı ihtiyacını soran, uygun portföyü öneren ve gösterim randevusunu danışmana aktaran asistan.',
 ['Portföye bağlı bilgi tabanı', 'İhtiyaç sorgulama (bütçe, konum, oda)', 'Portföy önerisi ve randevu', 'Danışmana devir'], ['Aylık işletim (AI-04)', 'WhatsApp ücretleri'],
 [T('Asistan', '50 soruluk testte %90 doğru'), T('Randevu akışı', 'Randevu danışman takvimine düşüyor')], [G('WhatsApp Business hesabı'), G('Danışman takvimleri')],
 [S('Kapsam ve bilgi', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Bilgi', 'Portföy bağlı'),
  S('Akış ve ton', 'ekip', 'insan', 2, None, None, 'Tasarım', 'Devir kuralları'),
  S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Kurulum', 'ekip', 'insan', 5, None, None, 'Asistan', 'Test hesabında'),
  S('Test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', '%90'),
  S('Kabul ve yayın', 'musteri', 'insan', 3, 'onay', H, 'Kabul', 'Karar kaydı var'),
  S('2 hafta ince ayar', 'ekip', 'ai_taslak', 14, None, None, 'İyileştirme', 'Haftalık inceleme')], 30,
 ['Asistandan gelen randevu', 'İnsana devir oranı'], [R('Satılmış ilan öneriliyor', 'Portföy her saat eşitlenir'), R('Kişisel veri', 'KVKK aydınlatma ilk mesajda')],
 ['Claude ihtiyaç bilgisini yapılandırıp portföyle eşleştirir.'], ['WhatsApp Cloud API + Arvela Estate portföy API\'si.'], None, 70)

aylik('EML-10', 'Yapay zekâ ön fiyat değerleme: bölgedeki ilan ve emsal verisinden fiyat aralığı ve gerekçeli kısa rapor (ofis aboneliği).',
 ['Adres/özellik girişiyle fiyat aralığı', 'Emsal listesi ve gerekçe', 'Danışmanın sahibine gönderebileceği PDF'], ['Lisanslı ekspertiz raporu (SPK)', 'Kesin değer taahhüdü'],
 [T('Değerleme', 'Emsal kaynakları gösterilir; "ön değerleme, ekspertiz değildir" ibaresi')], [G('Ofis bölgeleri')],
 [S('Bölge verisinin güncellenmesi', 'ai', 'tam', 25, None, None, 'Veri', 'Haftalık'),
  S('Ofis değerlendirmesi', 'musteri', 'insan', 3, 'secim', H, 'Geri bildirim', 'Karar kaydı var'),
  S('Model kalibrasyonu', 'ekip', 'ai_taslak', 2, None, None, 'Kalibrasyon notu', 'Satış fiyatlarıyla sapma')],
 ['Gerçek satış fiyatına sapma', 'Kullanım sayısı'], [R('Yanlış değer ilanı', 'Aralık + gerekçe; yasal ibare; ekspertiz yerine geçmez')],
 ['Claude emsalleri seçer, farkları gerekçelendirir ve aralık önerir.'], ['İlan verisi yalnız izinli kaynaklardan; kişisel veri kullanılmaz.'], None, 85)

small('EML-11', 'Sanal home staging: boş ya da eşyası eski odaların yapay zekâ ile döşenmiş, gerçekçi 10 görseli.',
 ['10 görsel, 2 stil seçeneği', 'Mimari ögeler korunur', '"Sanal döşenmiştir" etiketi'], ['Mimari değişiklik (duvar, pencere)', 'Fotoğraf çekimi'],
 [T('10 görsel', 'Oda ölçüleri ve mimari sadık; etiketli')], [G('Oda fotoğrafları (geniş açı)')],
 [S('Stil seçimi', 'musteri', 'insan', 2, 'secim', H, 'Stil', 'Karar kaydı var'),
  S('Görsel üretimi', 'ai', 'ai_taslak', 2, None, None, 'Adaylar', 'Mimari korunmuş'),
  S('Rötuş ve seçim', 'ekip', 'insan', 1, None, 'Kabul ön kontrolü', '10 görsel', 'Etiketli'),
  S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var')], 7,
 ['İlan tıklanma oranı (önce/sonra)'], [R('Yanıltıcı görsel', 'Mimariyi değiştiren görsel teslim edilmez; etiket zorunlu')],
 ['Claude stil istemlerini yazar; ekip sadakat kontrolünü yapar.'], ['Görsel üretimi referans fotoğrafla.'], [M('openai', 'Görsel düzenleme'), M('gemini', 'Alternatif görsel üretimi')], 70)

aylik('EML-12', 'Portföy reklam yönetimi: yeni ve öne çıkan ilanlar için Meta ve Google reklamları, talep formları danışmana.',
 ['İlan bazlı reklam şablonları', 'Konum ve kitle hedefleme', 'Talep formları → CRM → danışman', 'Aylık rapor'], ['Reklam bütçesi', 'Proje lansmanı (EML-13)'],
 [T('Kampanyalar', 'Yeni ilan 48 saat içinde reklamda'), T('Aylık rapor', 'İlan başına talep ve maliyet')], [G('Reklam hesabı ve bütçe'), G('Öne çıkarılacak ilanlar')],
 [S('Ayın bütçesi ve ilanlar', 'musteri', 'insan', 2, 'butce', H, 'Onaylı bütçe', 'Karar kaydı var'),
  S('Reklam şablonları', 'ai', 'ai_taslak', 2, None, None, 'Reklamlar', 'İlan verisine sadık'),
  S('Yayın ve optimizasyon', 'ekip', 'insan', 22, None, None, 'Kampanyalar', 'Haftalık kontrol'),
  S('Aylık rapor', 'ai', 'ai_taslak', 2, None, None, 'Rapor', 'İlan bazlı')],
 ['Talep başına maliyet', 'Gösterime dönen talep oranı'], [R('Konut reklamı kısıtları (Meta özel kategori)', 'Yaş/cinsiyet hedeflemesi yok; politika uyumu')],
 ['Claude ilan verisinden reklam metinleri ve görsel seçimini önerir.'], ['Meta Marketing API, Google Ads API; ilan katalogu.'], None, 60)

small('EML-13', 'Konut projesi lansman kampanyası (6 hafta): ön talep toplama, lansman etkinliği, reklam, içerik ve satış ekibine talep akışı.',
 ['Strateji ve mesaj', 'Ön kayıt sayfası ve talep akışı', '6 haftalık reklam ve sosyal medya', 'Lansman etkinliği iletişimi', 'Haftalık rapor'], ['Reklam bütçesi', 'Etkinlik organizasyonu (mekân, ikram)', 'Render üretimi'],
 [T('Ön kayıt', 'Hedef talep sayısı ve maliyeti haftalık izleniyor'), T('Kampanya raporu', 'Talep, randevu, satış')], [G('Proje görselleri ve fiyat listesi'), G('Satış ekibi ve hedefler'), G('Bütçe')],
 [S('Strateji ve bütçe', 'musteri', 'insan', 3, 'butce', H, 'Onaylı plan', 'Karar kaydı var'),
  S('Ön kayıt sayfası ve akış', 'ekip', 'insan', 5, None, None, 'Sayfa', 'Talepler CRM\'de'),
  S('Kreatifler ve içerik', 'ai', 'ai_taslak', 5, None, None, 'Kreatifler', 'Mesajla tutarlı'),
  S('Müşteri onayı: kreatifler', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Kampanya (6 hafta)', 'ekip', 'insan', 42, None, None, 'Kampanya', 'Haftalık optimizasyon'),
  S('Haftalık raporlar', 'ai', 'ai_taslak', 6, None, None, 'Raporlar', 'Satış ekibi geri bildirimi'),
  S('Kapanış raporu', 'ai', 'ai_taslak', 2, None, 'Kabul ön kontrolü', 'Rapor', 'Satışa dönüşüm')], 60,
 ['Ön kayıt sayısı ve maliyeti', 'Randevuya dönüşüm', 'Satış'], [R('Talepler takip edilmez', 'Satış ekibine 15 dk kuralı ve günlük takip listesi')],
 ['Claude haftalık verilerden mesaj ve kitle önerileri çıkarır.'], ['Reklam API\'leri + CRM; talep akışı AI-06 ile aynı.'], None, 55)

small('EML-14', 'Foto, video ve drone çekim koordinasyonu: portföy için çekim planı, çekimci, izinler ve teslim düzeni.',
 ['Çekim listesi ve plan', 'Çekimci/drone pilotu koordinasyonu', 'Drone izinleri', 'Teslim ve adlandırma'], ['Çekimci ücreti (ayrı)', 'Kurgu (SOS-10)'],
 [T('Çekim seti', 'Plan listesine göre tamam; ilan sistemine yüklendi')], [G('Mülk erişimi ve randevu'), G('Uçuş izni için bilgiler')],
 [S('Çekim planı', 'ai', 'ai_taslak', 1, None, None, 'Plan', 'Oda listesi'),
  S('Tarih ve izin onayı', 'musteri', 'insan', 3, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Çekim', 'freelancer', 'insan', 1, None, None, 'Ham görüntü', 'Liste tamam'),
  S('Seçim ve teslim', 'ekip', 'insan', 2, None, 'Kabul ön kontrolü', 'Teslim', 'Adlandırma doğru')], 7,
 ['Çekimden ilana geçen süre'], [R('Drone izni yok', 'Yasak bölge kontrolü; izin yoksa yer çekimi')],
 ['Claude mülk tipine göre çekim listesini çıkarır.'], ['Dosyalar ilan kaydına bağlanır.'], None, 30)
