# Dijital Pazarlama hizmet kitapları (DIJ-01 … DIJ-15)
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'


def reklam(code, ad, platform, api, ozel_kapsam, ozel_kpi, oran=65):
    aylik(code, f'{ad}: kampanya kurgusu, bütçe dağılımı, kreatif testleri, günlük optimizasyon ve aylık rapor.',
     [f'{platform} kampanya yapısı ve hedef kitleler', 'Aylık bütçe planı ve günlük takip', 'Haftada en az 1 kreatif ya da kitle testi', 'Dönüşüm ölçümü kontrolü'] + ozel_kapsam,
     ['Reklam bütçesi (müşteri doğrudan öder)', 'Kreatif üretimi (DIJ-06 ya da SOS kalemleri)', 'Ölçüm kurulumu (DIJ-01)'],
     [T('Aylık plan', 'Bütçe, hedef, testler; ay başında onaylı'), T('Haftalık not', 'Harcama, sonuç, yapılan değişiklik'), T('Aylık rapor', 'Hedefe göre sonuç, öğrenilenler, gelecek ay planı')],
     [G('Reklam hesabı yönetici erişimi ve ödeme yöntemi'), G('Aylık bütçe ve hedef (satış, aday, maliyet)'), G('Kreatif materyal')],
     [S('Ayın hedefi ve bütçe', 'musteri', 'insan', 2, 'butce', H, 'Onaylı bütçe ve hedef', 'Karar kaydı var'),
      S('Kampanya planı ve test fikirleri', 'ai', 'ai_taslak', 2, None, None, 'Plan + 4 test', 'Hedefle bağlantılı'),
      S('Kurulum ve güncelleme', 'ekip', 'insan', 2, None, None, 'Yayındaki kampanyalar', 'Takip etiketleri doğru'),
      S('Günlük izleme ve uyarılar', 'ai', 'tam', 20, None, None, 'Anomali uyarıları', 'Bütçe sapması %15 altında'),
      S('Haftalık optimizasyon', 'ekip', 'ai_taslak', 4, None, None, 'Değişiklik günlüğü', 'Her değişikliğin gerekçesi yazılı'),
      S('Aylık rapor', 'ai', 'ai_taslak', 2, None, 'Kabul ön kontrolü', 'Rapor', 'Hedef karşılaştırması'),
      S('Müşteri değerlendirmesi: gelecek ay', 'musteri', 'insan', 2, 'secim', H, 'Gelecek ay kararı', 'Karar kaydı var')],
     ['Dönüşüm başına maliyet', 'ROAS ya da aday başına maliyet'] + ozel_kpi + ['Bütçe kullanım oranı'],
     [R('Ölçüm bozulur, veri yanlış', 'Haftalık dönüşüm kontrolü; sapmada uyarı'), R('Hesap kısıtlanır', 'Politika uyumu kontrol listesi; reklam metni yayından önce denetlenir')],
     ['Claude günlük harcama ve sonuç verisinde anomali arar (ani maliyet artışı, sıfır dönüşüm) ve ekibe uyarı yazar.', 'Test sonuçlarını özetleyip kazanan/kaybedeni ve bir sonraki testi önerir.'],
     [f'{api} ile n8n üzerinden günlük veri; rapor Arvela OS portalında.'], None, oran, ['Harcama ve sonuçları haftalık görür', 'Bütçe değişikliğini onaylar'])


small('DIJ-01', 'Reklam ve ölçüm altyapısının kurulumu: GA4, Google Tag Manager, Meta Pixel ve Dönüşüm API, Google Ads dönüşümleri, çerez onayıyla uyumlu.',
 ['GA4 mülkü ve olaylar', 'Google Tag Manager kurulumu', 'Meta Pixel + Conversions API', 'Google Ads ve Merchant Center bağlantıları', 'Çerez onay modu (Consent Mode v2)'], ['Reklam yönetimi (DIJ-02…05)', 'Web sitesi geliştirme'],
 [T('Ölçüm planı', 'En az 3 dönüşüm olayı ve değerleri'), T('Çalışan etiketler', 'Test satın alma/form ile doğrulandı'), T('Onay uyumu', 'Onaydan önce reklam etiketi tetiklenmiyor')],
 [G('Site yönetici erişimi'), G('Reklam ve analiz hesap erişimleri'), G('Dönüşüm olayları ve değerleri')],
 [S('Erişim ve dönüşüm tanımları', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Erişimler + olay listesi', 'Tüm hesaplar'),
  S('Ölçüm planı', 'ai', 'ai_taslak', 1, None, None, 'Plan', 'Olaylar ve parametreler'),
  S('Müşteri onayı: dönüşümler', 'musteri', 'insan', 2, 'onay', H, 'Onaylı plan', 'Karar kaydı var'),
  S('Kurulum', 'ekip', 'insan', 3, None, None, 'Etiketler', 'Önizleme modunda doğrulandı'),
  S('Test ve doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Doğrulama raporu', 'Test dönüşümleri görünüyor')], 10,
 ['Doğrulanan dönüşüm olayı sayısı', 'Analiz ve reklam paneli arasındaki fark (%10 altı)'],
 [R('Çerez onayı reklam ölçümünü düşürür', 'Consent Mode v2 ve sunucu tarafı dönüşüm'), R('Site geliştiricisi etiketleri siler', 'Etiketler GTM\'de; değişiklik günlüğü')],
 ['Claude site ve iş modelinden dönüşüm olaylarını ve parametrelerini önerir; kurulum sonrası test sonuçlarını doğrular.'], ['GA4 Admin API, GTM API; doğrulama için tarayıcı testi.'], None, 50)

reklam('DIJ-02', 'Meta Ads yönetimi (Facebook + Instagram)', 'Meta', 'Meta Marketing API', ['Advantage+ ve manuel kampanya dengesi', 'Yeniden pazarlama kitleleri'], ['Frekans ve kreatif yorgunluğu'])
reklam('DIJ-03', 'Google Ads yönetimi (Arama, Performance Max, Alışveriş)', 'Google Ads', 'Google Ads API', ['Anahtar kelime ve negatif liste yönetimi', 'Merchant Center ürün akışı kontrolü'], ['Gösterim payı', 'Arama terimi kalitesi'])
reklam('DIJ-04', 'TikTok Ads yönetimi', 'TikTok', 'TikTok Marketing API', ['Spark Ads ve içerik üretici kreatifleri', 'Kreatif yenileme ritmi (haftalık)'], ['Video izlenme oranı'], 60)
reklam('DIJ-05', 'LinkedIn Ads yönetimi (B2B)', 'LinkedIn', 'LinkedIn Marketing API', ['Firma ve unvan hedeflemesi', 'Lead Gen form akışı → Arvela OS aday'], ['Nitelikli aday oranı'], 60)

small('DIJ-06', 'Reklam kreatif seti: bir kampanya için test edilebilir görsel ve video varyasyonları, metinleriyle birlikte.',
 ['3 mesaj açısı × 3 format (kare, dikey, yatay)', 'Her kreatif için 2 başlık + 2 metin', 'Kısa video (6–15 sn) 2 adet'], ['Çekim', 'Reklam yönetimi'],
 [T('Kreatif seti', '9 görsel + 2 video; platform boyutlarında; politika uyumlu'), T('Metinler', 'Her kreatif için başlık ve metin varyasyonları')],
 [G('Kampanya hedefi, teklif ve kitle'), G('Ürün görselleri ve marka kiti')],
 [S('Mesaj açıları ve metinler', 'ai', 'ai_taslak', 2, None, None, '3 açı + metinler', 'Teklif net'),
  S('Müşteri seçimi: açılar', 'musteri', 'insan', 2, 'secim', H, 'Seçilen açılar', 'Karar kaydı var'),
  S('Tasarım ve kurgu', 'freelancer', 'insan', 4, None, None, 'Kreatifler', 'Boyutlar doğru'),
  S('Politika ve kalite kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Kontrol notu', 'Yasaklı ifade yok'),
  S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', H, 'Onaylı set', 'Karar kaydı var')], 11,
 ['Kazanan kreatifin tıklama oranı', 'Onaylanan kreatif oranı'], [R('Reklam politikası reddi', 'Yayın öncesi kontrol listesi (sağlık, finans, önce/sonra iddiaları)')],
 ['Claude geçmiş kampanya verisinden kazanan mesaj kalıplarını çıkarır ve yeni açılar önerir.'], ['Kreatifler adlandırma kuralıyla (açı_format_sürüm) teslim edilir; test sonuçları bu adla eşleşir.'],
 [M('openai', 'İsteğe bağlı: görsel varyasyon üretimi')], 60)

small('DIJ-07', 'Teknik SEO denetimi: taranabilirlik, dizin, hız, yapılandırılmış veri ve iç bağlantılar; öncelikli düzeltme listesi.',
 ['Tam site taraması (en fazla 5.000 URL)', 'Search Console ve dizin durumu', 'Core Web Vitals', 'Yapılandırılmış veri ve iç bağlantı analizi', 'Öncelikli düzeltme listesi'], ['Düzeltmelerin uygulanması (WEB-23 ya da DIJ-08)', 'İçerik üretimi'],
 [T('Denetim raporu', 'Her sorun: etkilenen URL sayısı, etki, nasıl düzeltilir'), T('Öncelik listesi', 'İlk 20 madde, etki/efor puanlı')],
 [G('Search Console ve GA4 erişimi'), G('Site yönetici erişimi', zorunlu=False)],
 [S('Erişimler', 'ai', 'tam', 1, 'bilgi', 'Bilgi isteği', 'Erişim', 'Search Console var'),
  S('Tarama ve veri toplama', 'ai', 'tam', 2, None, None, 'Tarama verisi', 'Tüm URL\'ler'),
  S('Analiz ve önceliklendirme', 'ai', 'ai_taslak', 2, None, None, 'Bulgular', 'Etki puanlı'),
  S('Uzman değerlendirmesi', 'ekip', 'insan', 2, None, None, 'Rapor', 'Yanlış pozitifler ayıklandı'),
  S('Müşteri sunumu ve onay', 'musteri', 'insan', 2, 'onay', H, 'Onaylı öncelik listesi', 'Karar kaydı var')], 9,
 ['Dizindeki geçerli sayfa oranı', '90 gün sonra organik tıklama değişimi'], [R('Geliştirici düzeltmeleri uygulamaz', 'Her madde için uygulanabilir görev metni; WEB-23 ile birleştirilebilir')],
 ['Claude tarama verisini gruplayıp kök nedenleri çıkarır (ör. tek şablon hatası 400 URL\'yi etkiliyor).'], ['Tarayıcı + Search Console API + PageSpeed API, n8n üzerinden.'], None, 70)

aylik('DIJ-08', 'Sürekli SEO: teknik bakım, anahtar kelime planı, aylık içerik ve iç bağlantı, sıralama takibi.',
 ['Aylık teknik kontrol', 'Anahtar kelime ve konu planı', 'Ayda 4 içerik (brif + yazım + optimizasyon)', 'Mevcut sayfa iyileştirmeleri', 'Sıralama ve trafik raporu'], ['Bağlantı satın alma', 'Site yeniden tasarımı'],
 [T('Aylık içerik', '4 yazı; arama niyetine uygun, iç bağlantılı, yayında'), T('Aylık rapor', 'Sıralama, tıklama, dönüşüm; gelecek ay planı')],
 [G('Search Console, GA4, site erişimi'), G('Ürün/hizmet uzmanı görüşü (aylık 30 dk)', zorunlu=False)],
 [S('Ayın konu planı', 'ai', 'ai_taslak', 2, None, None, '4 konu + brif', 'Anahtar kelime ve niyet'),
  S('Müşteri onayı: konular', 'musteri', 'insan', 2, 'onay', H, 'Onaylı konular', 'Karar kaydı var'),
  S('İçerik yazımı', 'ai', 'ai_taslak', 5, None, None, 'Taslaklar', 'Kaynaklı, özgün'),
  S('Editör ve uzman kontrolü', 'ekip', 'insan', 4, None, 'Kabul ön kontrolü', 'Son metinler', 'Doğruluk ve marka sesi'),
  S('Yayın ve teknik bakım', 'ekip', 'insan', 3, None, None, 'Yayınlar', 'Şema ve iç bağlantılar'),
  S('Aylık rapor', 'ai', 'ai_taslak', 2, None, None, 'Rapor', 'Hedef karşılaştırması')],
 ['Organik tıklama', 'İlk 10\'daki anahtar kelime sayısı', 'Organik dönüşüm'], [R('Yapay zekâ içeriği düşük kalite sayılır', 'Uzman kontrolü, özgün veri ve örnek; yalnız yapay zekâ metni yayınlanmaz')],
 ['Claude Search Console verisinden fırsat sorgularını (yüksek gösterim, düşük tıklama) bulur; içerik brifini ve taslağını yazar.'], ['Search Console API; içerik yayını WordPress REST API ile.'], None, 65)

aylik('DIJ-09', 'Yerel SEO: harita sonuçlarında görünürlük için profil, yerel sayfa, atıf ve yorum çalışması (konum başına).',
 ['Google İşletme Profili optimizasyonu', 'Yerel açılış sayfası iyileştirmesi', 'Dizin ve atıf (NAP) tutarlılığı', 'Yorum artırma önerileri', 'Harita sıralama takibi'], ['Profil gönderi yönetimi (SOS-15)', 'Reklam'],
 [T('Atıf tutarlılığı', 'Ana dizinlerde ad, adres, telefon aynı'), T('Aylık harita raporu', 'Hedef aramalarda konum ızgarası sıralaması')],
 [G('Profil erişimi ve doğru işletme bilgileri')],
 [S('Yerel anahtar kelime ve rakip analizi', 'ai', 'ai_taslak', 2, None, None, 'Analiz', '5 hedef arama'),
  S('Müşteri onayı: hedef aramalar', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Profil ve sayfa iyileştirmeleri', 'ekip', 'insan', 5, None, None, 'Değişiklikler', 'Kategori ve hizmetler doğru'),
  S('Atıf düzeltmeleri', 'freelancer', 'insan', 10, None, None, 'Atıf listesi', 'Tutarlı NAP'),
  S('Aylık harita raporu', 'ai', 'tam', 1, None, None, 'Rapor', 'Izgara sıralaması')],
 ['Harita 3\'lüsünde görünme oranı', 'Profilden arama ve yol tarifi'], [R('Profil askıya alınır', 'Kurallara uygun ad; değişiklikler kademeli')],
 ['Claude rakip profilleri karşılaştırır, eksik kategori ve hizmetleri önerir.'], ['Konum ızgarası sıralama aracı + Business Profile API.'], None, 60)

aylik('DIJ-10', 'Yapay zekâ aramalarında görünürlük (GEO): ChatGPT, Gemini, Perplexity ve Google AI yanıtlarında markanın anılması.',
 ['Hedef 20 soru için yapay zekâ yanıt takibi', 'Marka anılma ve kaynak gösterilme analizi', 'Soru-cevap ve karşılaştırma içerikleri', 'Yapılandırılmış veri ve varlık tutarlılığı (Wikidata, dizinler)'], ['Garanti edilmiş sıralama', 'Klasik SEO içerik paketi (DIJ-08)'],
 [T('Aylık görünürlük raporu', '20 soruda anılma oranı ve kaynak listesi'), T('İçerik iyileştirmeleri', 'Ayda en az 3 sayfa')],
 [G('Hedef sorular ve rakipler'), G('Site erişimi')],
 [S('Soru listesi ve ilk ölçüm', 'ai', 'tam', 2, None, None, 'Başlangıç ölçümü', '4 motorda ölçüldü'),
  S('Müşteri onayı: hedef sorular', 'musteri', 'insan', 2, 'onay', H, 'Onaylı liste', 'Karar kaydı var'),
  S('İçerik ve varlık iyileştirmeleri', 'ai', 'ai_taslak', 10, None, None, 'Değişiklikler', 'Kaynak gösterilebilir'),
  S('Uzman kontrolü ve yayın', 'ekip', 'insan', 4, None, 'Kabul ön kontrolü', 'Yayınlar', 'Doğruluk'),
  S('Aylık ölçüm ve rapor', 'ai', 'tam', 2, None, None, 'Rapor', 'Önceki aya göre')],
 ['Yapay zekâ yanıtlarında anılma oranı', 'Kaynak olarak gösterilme sayısı', 'Yapay zekâ kaynaklı ziyaret'],
 [R('Ölçüm oynak (yanıtlar değişken)', 'Her soru 3 kez sorulur, ortalama alınır'), R('Yanlış bilgi yayılıyor', 'Doğru bilgiyi taşıyan kaynak sayfa ve varlık kayıtları')],
 ['Claude ve diğer motorlara hedef soruları düzenli sorar, yanıtlardaki marka ve kaynakları çıkarır.'], ['Motor API\'leri n8n üzerinden zamanlanmış; sonuçlar tabloya.'],
 [M('openai', 'Ölçüm: ChatGPT yanıtları'), M('gemini', 'Ölçüm: Gemini yanıtları')], 75)

small('DIJ-11', 'E-posta pazarlama altyapısı: araç seçimi, liste ve izin yapısı, karşılama ve terk edilmiş sepet akışları, şablonlar.',
 ['Araç kurulumu (Brevo, Mailchimp ya da Klaviyo)', 'Alan adı doğrulama (SPF, DKIM, DMARC)', 'Liste ve segment yapısı, İYS uyumlu izin', '3 otomatik akış (karşılama, sepet, satış sonrası)', '2 bülten şablonu'], ['Aylık kampanya yönetimi (DIJ-12)', 'Liste satın alma'],
 [T('Teslim edilebilirlik', 'SPF/DKIM/DMARC doğru; test gelen kutusuna düşüyor'), T('Akışlar', '3 akış yayında, test edildi'), T('İzin', 'Her kayıtta izin kaynağı ve tarihi var')],
 [G('Alan adı DNS erişimi'), G('Mevcut liste ve izin kanıtı'), G('Marka kiti')],
 [S('Araç seçimi ve izin denetimi', 'ai', 'ai_taslak', 2, None, None, 'Öneri', 'İzinsiz kayıt ayrıldı'),
  S('Müşteri seçimi: araç', 'musteri', 'insan', 2, 'secim', H, 'Seçilen araç', 'Karar kaydı var'),
  S('Kurulum ve DNS', 'ekip', 'insan', 2, None, None, 'Hesap ve doğrulama', 'DMARC yayında'),
  S('Akış metinleri ve şablonlar', 'ai', 'ai_taslak', 3, None, None, 'Metinler', 'Marka sesine uygun'),
  S('Müşteri onayı: akışlar', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Yayın ve test', 'ekip', 'insan', 1, None, 'Kabul ön kontrolü', 'Yayındaki akışlar', 'Test gönderileri geçti')], 12,
 ['Açılma ve tıklama oranı', 'Akış başına gelir', 'Spam şikâyet oranı (%0,1 altı)'], [R('İzinsiz liste', 'İYS\'de onayı olmayan kayda ticari ileti gönderilmez')],
 ['Claude akış metinlerini yazar, konu satırı varyasyonları önerir.'], ['Araç API\'si + e-ticaret entegrasyonu; izinler İYS ile eşitlenir (DIJ-13).'], None, 60)

aylik('DIJ-12', 'E-posta ve WhatsApp kampanya yönetimi: aylık takvim, segment, içerik, gönderim ve sonuç raporu.',
 ['Ayda 4 e-posta ve 2 WhatsApp kampanyası', 'Segment ve kişiselleştirme', 'A/B test (konu satırı)', 'Aylık rapor'], ['Altyapı kurulumu (DIJ-11)', 'WhatsApp mesaj ücretleri (Meta)'],
 [T('Kampanyalar', 'Takvime göre, izinli kitleye'), T('Aylık rapor', 'Gelir, açılma, tıklama, çıkış')],
 [G('Ayın kampanyaları ve teklifler')],
 [S('Aylık kampanya takvimi', 'ai', 'ai_taslak', 2, None, None, 'Takvim', 'Segment başına'),
  S('Müşteri onayı: takvim', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('İçerik ve tasarım', 'ai', 'ai_taslak', 4, None, None, 'Kampanyalar', 'Mobil uyumlu'),
  S('Kontrol ve gönderim', 'ekip', 'insan', 16, None, 'Kabul ön kontrolü', 'Gönderimler', 'İzin ve test kontrolü'),
  S('Aylık rapor', 'ai', 'ai_taslak', 1, None, None, 'Rapor', 'Gelir bağlantılı')],
 ['Kampanya başına gelir', 'Açılma/tıklama', 'Abonelikten çıkma'], [R('WhatsApp numarası kısıtlanır', 'Yalnız izinli kişilere, onaylı şablonla, düşük sıklıkta')],
 ['Claude segment bazında kişiselleştirilmiş içerik ve konu satırı varyasyonları yazar.'], ['WhatsApp Business Platform (Cloud API) şablon mesajları; İYS kontrolü gönderim öncesi.'], None, 65)

small('DIJ-13', 'İYS (İleti Yönetim Sistemi) uyumu: kayıt, mevcut izinlerin yüklenmesi, formlarda izin metni ve eşitleme akışı.',
 ['İYS marka kaydı desteği', 'Mevcut izinlerin denetimi ve yüklenmesi', 'Site ve form izin metinleri', 'CRM/e-posta aracıyla İYS eşitlemesi'], ['Hukuki danışmanlık', 'İzinsiz verinin "temizlenmesi" dışında veri işleme'],
 [T('İYS kaydı', 'Marka İYS\'de aktif'), T('İzin akışı', 'Yeni izin 3 iş günü içinde İYS\'ye iletiliyor'), T('Form metinleri', 'Hukukçu onaylı ve yayında')],
 [G('Şirket bilgileri ve e-imza/e-Devlet erişimi'), G('Mevcut izin kayıtları ve kaynakları'), G('Hukukçu onayı')],
 [S('Mevcut izin denetimi', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'Denetim', 'Kaynaksız kayıtlar ayrıldı'),
  S('İYS kaydı', 'musteri', 'insan', 5, 'bilgi', H, 'Aktif kayıt', 'Karar kaydı var'),
  S('Form metinleri', 'ai', 'ai_taslak', 2, None, None, 'Metinler', 'Ayrı ve açık izin'),
  S('Hukukçu ve müşteri onayı', 'musteri', 'insan', 3, 'onay', H, 'Onaylı metinler', 'Karar kaydı var'),
  S('Eşitleme akışı kurulumu', 'ekip', 'insan', 2, None, None, 'Akış', 'Test kaydı İYS\'de'),
  S('Doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Sayılar eşleşiyor')], 15,
 ['İYS ile CRM arasında eşleşen izin oranı', 'İzinsiz gönderim (0)'], [R('Eski izinlerin kanıtı yok', 'Kanıtsız kayıt İYS\'ye yüklenmez, ticari iletiden çıkarılır')],
 ['Claude izin kayıtlarındaki kaynak ve tarih eksiklerini bulur, metin taslaklarını hazırlar (hukukçu onayına).'], ['İYS API (marka hesabı); n8n eşitleme akışı CRM/e-posta aracıyla.'], None, 55)

aylik('DIJ-14', 'Dönüşüm optimizasyonu: veri ve kullanıcı davranışından hipotez, aylık A/B testleri, kazananın kalıcı yapılması.',
 ['Huni analizi ve ısı haritası/oturum kaydı incelemesi', 'Ayda 2 A/B testi', 'Test sonuçları ve uygulama', 'Hipotez kütüphanesi'], ['Site yeniden tasarımı', 'Trafik getirme'],
 [T('Test planı', 'Hipotez, metrik, örneklem ve süre'), T('Sonuç raporu', 'İstatistiksel güven ve karar')],
 [G('Analiz ve site erişimi'), G('Isı haritası aracı (Clarity önerilir)', 'arvela')],
 [S('Analiz ve hipotezler', 'ai', 'ai_taslak', 3, None, None, '5 hipotez', 'Veriye dayanıyor'),
  S('Müşteri seçimi: testler', 'musteri', 'insan', 2, 'secim', H, 'Seçilen 2 test', 'Karar kaydı var'),
  S('Varyasyon tasarımı ve kurulum', 'ekip', 'insan', 4, None, None, 'Testler yayında', 'İzleme doğru'),
  S('Test süresi', 'ai', 'tam', 18, None, None, 'Test verisi', 'Örneklem yeterli'),
  S('Sonuç ve karar', 'ai', 'ai_taslak', 2, None, 'Kabul ön kontrolü', 'Rapor', 'Güven aralığı yazılı')],
 ['Dönüşüm oranı artışı', 'Tamamlanan test sayısı', 'Kazanan test oranı'], [R('Trafik yetersiz', 'Az trafikte büyük değişiklik testleri; yoksa nitel iyileştirme')],
 ['Claude oturum kayıtları özetlerinden ve huni verisinden hipotez önerir; sonuçları istatistiksel olarak yorumlar.'], ['Microsoft Clarity + GA4; test aracı sitenin altyapısına göre.'], None, 60)

small('DIJ-15', 'Canlı performans paneli: satış, reklam, sosyal medya ve site verisini tek ekranda gösteren, her sabah güncellenen pano.',
 ['Veri kaynaklarının bağlanması (en fazla 5)', 'KPI tanımları', 'Panel tasarımı (yönetici ve ekip görünümü)', 'Haftalık otomatik özet e-postası'], ['Veri ambarı projesi', 'Kaynak sistem düzeltmeleri'],
 [T('Panel', 'Her sabah güncel; KPI tanımları panelde'), T('Haftalık özet', 'Pazartesi 09:00 e-posta')],
 [G('Kaynak sistem erişimleri'), G('Önemli KPI\'lar ve hedefler')],
 [S('KPI ve kaynak listesi', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'KPI listesi', 'Tanım ve kaynak var'),
  S('Müşteri onayı: KPI\'lar', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Bağlantılar ve panel', 'ekip', 'insan', 4, None, None, 'Panel', 'Veri doğrulandı'),
  S('Doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Karşılaştırma', 'Kaynakla fark %2 altı'),
  S('Teslim ve eğitim (30 dk)', 'musteri', 'insan', 1, 'onay', H, 'Kabul', 'Karar kaydı var')], 10,
 ['Panel kullanım sıklığı', 'Veri tazeliği'], [R('Kaynak API değişir', 'Akış hatası Arvela OS kesinti uyarısına bağlı')],
 ['Claude haftalık özette değişimleri ve olası nedenleri yazar.'], ['Looker Studio ya da Arvela OS panosu; veriler n8n ile günlük çekilir.'], None, 60)
