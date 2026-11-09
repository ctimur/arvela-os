# AI İş Çözümleri hizmet kitapları (AI-01 … AI-16)
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'
KVKK_R = R('Kişisel veri yurt dışına aktarılır', 'Müşteriyle KVKK açık rıza/aydınlatma metni; yapay zekâ sağlayıcısıyla standart sözleşme; hassas veri asistana verilmez')


def asistan(code, ad, kanal, api, gun_kurulum, ozel_kapsam, ozel_tesl, ozel_risk, ek=None, oran=70):
    small(code, f'{ad}: işletmenin bilgileriyle eğitilmiş, sık soruları yanıtlayan, satış fırsatını yakalayıp ekibe aktaran ve gerektiğinde insana devreden yapay zekâ asistanı.',
     ['Bilgi tabanı (ürün, fiyat, SSS, politika) hazırlığı', 'Konuşma akışı, ton ve devretme kuralları', f'{kanal} bağlantısı', 'Aday ve randevunun Arvela OS / müşteri CRM\'ine aktarımı', '2 hafta ince ayar'] + ozel_kapsam,
     ['Aylık işletim ve iyileştirme (AI-04)', 'Mesaj/çağrı ücretleri (sağlayıcıya ödenir)', 'Ödeme alma'],
     [T('Çalışan asistan', 'Test setindeki 50 sorunun en az %90\'ını doğru yanıtlıyor'), T('Devretme', 'Bilmediği ya da hassas konuda insana devrediyor'), T('Kullanım kılavuzu', 'Bilgi güncelleme ve devralma adımları')] + ozel_tesl,
     [G('Ürün/hizmet, fiyat, SSS ve politika belgeleri'), G(f'{kanal} hesabı ve yönetici erişimi'), G('Devredilecek kişi ve çalışma saatleri')],
     [S('Bilgi toplama ve kapsam', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Belgeler ve kapsam', 'Zorunlu belgeler var'),
      S('Bilgi tabanı ve test seti', 'ai', 'ai_taslak', 3, None, None, 'Bilgi tabanı + 50 soruluk test', 'Kaynaklar eşleşiyor'),
      S('Akış, ton ve devretme kuralları', 'ekip', 'insan', 2, None, None, 'Konuşma tasarımı', 'Hassas konular tanımlı'),
      S('Müşteri onayı: ton ve kurallar', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
      S('Kurulum ve bağlantılar', 'ekip', 'insan', gun_kurulum, None, None, 'Asistan + entegrasyonlar', 'Test hesabında çalışıyor'),
      S('Test seti ile doğrulama', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Test raporu', '%90 doğru'),
      S('Müşteri kabul testi', 'musteri', 'insan', 3, 'onay', H, 'Kabul', 'Karar kaydı var'),
      S('Yayın ve 2 hafta ince ayar', 'ekip', 'ai_taslak', 14, None, None, 'Yayındaki asistan, iyileştirme günlüğü', 'Haftalık konuşma incelemesi')], 30,
     ['Otomatik çözülen konuşma oranı', 'İnsana devir oranı', 'Asistandan gelen aday/randevu', 'Yanlış yanıt oranı'],
     [R('Asistan yanlış bilgi verir', 'Yalnız bilgi tabanından yanıt; emin değilse devir; haftalık konuşma incelemesi'), KVKK_R] + ozel_risk,
     ['Claude belgelerden bilgi tabanını ve test setini çıkarır; konuşma kayıtlarını haftalık inceleyip eksik bilgiyi raporlar.', 'Asistanın kendisi Claude ile çalışır; sistem talimatı marka sesi ve devretme kurallarını içerir.'],
     [f'{api}; n8n konuşma akışı; bilgi tabanı vektör aramasıyla; konuşma kayıtları saklama süresiyle.'], ek, oran,
     ['Konuşma özetlerini ve gelen adayları görür', 'Bilgi güncelleme talebi açar'], '2 hafta ince ayar')


asistan('AI-01', 'WhatsApp yapay zekâ asistanı (işe özel)', 'WhatsApp Business', 'WhatsApp Business Platform (Cloud API)', 4, ['WhatsApp şablon mesajları (randevu hatırlatma vb.)'], [], [R('Numara kısıtlanır', 'Yalnız müşterinin başlattığı konuşmaya serbest yanıt; şablonlar Meta onaylı')])
asistan('AI-02', 'Instagram / Facebook DM asistanı', 'Instagram ve Facebook Messenger', 'Meta Graph API (Messenger + Instagram)', 3, ['Yorumdan DM\'e yönlendirme akışı'], [], [R('Platform politikası', '24 saat mesajlaşma penceresi kuralına uyum')])
asistan('AI-03', 'Web sitesi yapay zekâ asistanı', 'Web sitesi sohbet balonu', 'Site içi sohbet bileşeni + Arvela API', 3, ['Sayfaya göre karşılama mesajı'], [], [R('Sitede yavaşlık', 'Bileşen gecikmeli yüklenir; çerez onayına uygun')])

aylik('AI-04', 'Yapay zekâ asistanının aylık işletimi: barındırma, izleme, bilgi güncellemeleri ve aylık iyileştirme.',
 ['Barındırma ve izleme (kesinti uyarısı)', 'Ayda 4 saate kadar bilgi güncellemesi', 'Haftalık konuşma incelemesi', 'Aylık performans raporu'], ['Yeni kanal ya da büyük akış değişikliği (yeni proje)', 'Mesaj/model kullanım ücretleri (aşım halinde ayrıca)'],
 [T('Çalışma süresi', 'Aylık %99'), T('Aylık rapor', 'Konuşma, çözüm, devir, aday; iyileştirme listesi')],
 [G('Güncel fiyat, kampanya ve politika değişiklikleri')],
 [S('Haftalık konuşma incelemesi', 'ai', 'ai_taslak', 20, None, None, 'Hatalı/eksik yanıt listesi', 'Her hafta'),
  S('Bilgi güncellemesi', 'ekip', 'insan', 4, 'bilgi', 'Bilgi isteği', 'Güncel bilgi tabanı', 'Test seti geçiyor'),
  S('Aylık rapor', 'ai', 'ai_taslak', 2, None, None, 'Rapor', 'Önceki aya göre'),
  S('Müşteri değerlendirmesi', 'musteri', 'insan', 2, 'secim', H, 'Gelecek ay önceliği', 'Karar kaydı var')],
 ['Otomatik çözüm oranı', 'Yanlış yanıt oranı', 'Çalışma süresi'], [R('Model sürümü değişir, davranış kayar', 'Test seti her model değişikliğinde yeniden çalışır')],
 ['Claude konuşma kayıtlarını özetler, yanıtlanamayan soruları kümeler ve bilgi tabanına eklenecekleri önerir.'], ['İzleme Arvela OS kesinti uyarısına bağlı; kullanım maliyeti aylık raporda.'], None, 75)

asistan('AI-05', 'Sesli yapay zekâ asistanı (çağrı karşılama)', 'Telefon hattı', 'Bulut santral + konuşma tanıma ve ses sentezi', 6, ['Çağrı yönlendirme ve mesai dışı karşılama'], [T('Çağrı kaydı ve özeti', 'Her çağrı özetiyle CRM\'de')], [R('Ses tanıma hatası', 'Önemli bilgi (telefon, tarih) tekrar ettirilir'), R('Çağrı kaydı izni', 'Çağrı başında aydınlatma anonsu')],
        [M('openai', 'Gerçek zamanlı ses (konuşma tanıma/sentez)')], 65)


def akis(code, ozet, kapsam, tesl, girdi, kurulum_asama, kpi, risk, yontem, teknik, gun=18, ek=None, oran=70):
    small(code, ozet, kapsam + ['Hata durumunda bildirim ve elle devralma', 'Kullanım kılavuzu ve 30 gün destek'], ['Aylık bakım (AI-16)', 'Üçüncü taraf yazılım lisansları'],
     tesl + [T('Kılavuz', 'Akışın ne yaptığı, nasıl durdurulacağı, kime haber verildiği')], girdi + [G('Kullanılan sistemlere erişim')],
     [S('Süreç keşfi ve mevcut durum', 'ekip', 'insan', 2, 'bilgi', 'Bilgi isteği', 'Süreç haritası', 'Adımlar ve istisnalar yazılı'),
      S('Çözüm tasarımı', 'ai', 'ai_taslak', 2, None, None, 'Akış tasarımı', 'Hata yolları var'),
      S('Müşteri onayı: tasarım', 'musteri', 'insan', 2, 'onay', H, 'Onaylı tasarım', 'Karar kaydı var')] + kurulum_asama +
     [S('Test (gerçek örneklerle)', 'ai', 'tam', 2, None, 'Kabul ön kontrolü', 'Test raporu', '20 örnekte doğru'),
      S('Müşteri kabul testi', 'musteri', 'insan', 3, 'onay', H, 'Kabul', 'Karar kaydı var'),
      S('Yayın ve 30 gün izleme', 'ekip', 'ai_taslak', 5, None, None, 'Yayındaki akış', 'Hata bildirimleri çalışıyor')], gun,
     kpi, risk, yontem, teknik, ek, oran, ['Akışın çalışma geçmişini ve hataları görür'])


akis('AI-06', 'Aday toplama ve otomatik nitelendirme: formlar, reklam formları ve mesajlardan gelen adayları tek yerde toplayan, puanlayan ve doğru kişiye atayan akış.',
 ['Kaynak bağlantıları (site formu, Meta/Google form, WhatsApp)', 'Nitelendirme soruları ve puanlama', 'Atama ve 15 dk içinde bildirim', 'CRM\'e kayıt'],
 [T('Akış', 'Tüm kaynaklardan aday 1 dk içinde CRM\'de'), T('Puanlama', 'Sıcak/ılık/soğuk; kurallar yazılı')], [G('Nitelikli aday tanımı')],
 [S('Kaynak bağlantıları ve puanlama', 'ekip', 'insan', 4, None, None, 'Akış', 'Test adayları puanlandı')],
 ['Adaya ilk dönüş süresi', 'Nitelikli aday oranı', 'Kaybolan aday (0)'], [R('Çift kayıt', 'Telefon/e-posta ile eşleştirme'), KVKK_R],
 ['Claude aday mesajından ihtiyaç, bütçe ve aciliyeti çıkarır, puanı gerekçesiyle yazar.'], ['n8n webhook\'ları; CRM API (Arvela OS /api/v1/leads ya da müşterinin CRM\'i).'])
akis('AI-07', 'Teklif ve doküman otomasyonu: görüşme notu ya da formdan kurumsal şablonda teklif, sözleşme ve benzeri belgelerin taslağı.',
 ['Şablonların (teklif, sözleşme, iş emri) değişkenli hâle getirilmesi', 'Fiyat listesinden kalem seçimi', 'Taslak → onay → PDF → gönderim'],
 [T('Belge akışı', 'Formdan 5 dk içinde onaya hazır taslak'), T('Şablonlar', 'En fazla 3 şablon')], [G('Mevcut şablonlar ve fiyat listesi')],
 [S('Şablon ve fiyat listesi bağlantısı', 'ekip', 'insan', 4, None, None, 'Akış', 'Örnek belge doğru')],
 ['Teklif hazırlama süresi', 'Hatalı fiyat (0)'], [R('Yanlış fiyat', 'Fiyat yalnız listeden; insan onayı olmadan gönderim yok')],
 ['Claude görüşme notundan kapsamı ve kalemleri çıkarır, açıklama metinlerini yazar.'], ['Belge oluşturma: Google Docs/Word şablonu + PDF; gönderim e-posta ya da e-imza aracıyla.'])
akis('AI-08', 'Randevu ve hatırlatma otomasyonu: çevrim içi randevu, takvim eşitleme, WhatsApp/SMS hatırlatma ve gelmeyen müşteri takibi.',
 ['Randevu sayfası ve takvim eşitleme', '24 saat ve 2 saat önce hatırlatma', 'İptal/erteleme bağlantısı', 'Gelmeyen müşteriye takip mesajı'],
 [T('Randevu akışı', 'Çift rezervasyon yok; hatırlatmalar gidiyor')], [G('Hizmetler, süreler ve çalışma saatleri')],
 [S('Takvim ve mesaj kurulumu', 'ekip', 'insan', 3, None, None, 'Akış', 'Test randevusu baştan sona')],
 ['Gelmeme oranı', 'Çevrim içi randevu oranı'], [R('Hatırlatma izni', 'WhatsApp şablonu ve izinli numaralar')],
 ['Claude hatırlatma ve takip mesajlarını marka sesiyle yazar.'], ['Google/Microsoft takvim API; WhatsApp Cloud API ya da SMS sağlayıcısı.'], 15)
akis('AI-09', 'İş akışı otomasyonu: tekrar eden bir iç süreci (ör. sipariş → fatura → kargo bildirimi) uçtan uca otomatikleştirme.',
 ['Bir süreç, en fazla 3 sistem', 'Hata ve istisna yolları', 'Raporlama'],
 [T('Akış', 'Süreç insan müdahalesi olmadan çalışıyor; istisnalar bildirimle')], [G('Sürecin bugünkü adımları ve örnek kayıtlar')],
 [S('Akış kurulumu', 'ekip', 'insan', 3, None, None, 'Akış', 'Örnekler doğru işlendi')],
 ['Kazanılan saat (aylık)', 'Hata oranı'], [R('Kaynak sistem değişir', 'Hata bildirimi + AI-16 bakım')],
 ['Claude metin içeren adımlarda (e-posta okuma, sınıflandırma) karar verir; diğer adımlar kurallıdır.'], ['n8n akışları; sistem API\'leri ya da e-posta/tablo bağlantıları.'], 12)

small('AI-10', 'Kurumsal bilgi asistanı: şirket belgeleri, prosedürler ve geçmiş yazışmalar üzerinde soru-cevap yapan, kaynak gösteren iç asistan.',
 ['Belge kaynaklarının bağlanması (Drive, SharePoint, klasör)', 'Erişim yetkilerine göre yanıt', 'Kaynak gösterme ve güncelleme akışı', 'Ekip eğitimi'], ['Belge düzenleme/temizleme projesi', 'Müşteriye açık asistan (AI-01…03)'],
 [T('Asistan', '50 soruluk testte %90 doğru, her yanıt kaynaklı'), T('Yetki', 'Kullanıcı yalnız erişebildiği belgeden yanıt alıyor')],
 [G('Belge kaynakları ve erişim'), G('Kullanıcı ve yetki listesi'), G('Gizli tutulacak belge listesi')],
 [S('Kaynak ve yetki keşfi', 'ekip', 'insan', 3, 'bilgi', 'Bilgi isteği', 'Kaynak haritası', 'Gizli belgeler işaretli'),
  S('Müşteri onayı: kapsam ve yetki', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Dizinleme ve asistan kurulumu', 'ekip', 'insan', 6, None, None, 'Asistan', 'Yetki testi geçti'),
  S('Test seti ile doğrulama', 'ai', 'tam', 2, None, 'Kabul ön kontrolü', 'Test raporu', '%90 doğru, kaynaklı'),
  S('Ekip eğitimi ve kabul', 'musteri', 'insan', 3, 'onay', H, 'Kabul', 'Karar kaydı var'),
  S('30 gün izleme', 'ekip', 'ai_taslak', 10, None, None, 'İyileştirme günlüğü', 'Haftalık inceleme')], 30,
 ['Haftalık soru sayısı', 'Kaynaklı yanıt oranı', 'Yanıt bulunamayan soru oranı'],
 [R('Yetkisiz bilgiye erişim', 'Belge izinleri dizinlemede korunur; yetki testi kabul şartı'), KVKK_R],
 ['Claude yalnız erişilen belgelerden, kaynak göstererek yanıtlar; bulamazsa "bilmiyorum" der.'], ['Vektör dizini müşteri ortamında ya da Arvela barındırmasında; belge değişince yeniden dizinleme.'], None, 70)

akis('AI-11', 'Yapay zekâ içerik fabrikası: marka sesi kılavuzuyla blog, sosyal medya ve e-posta içeriklerini toplu üreten, onaya sunan sistem.',
 ['Marka sesi ve içerik kuralları', 'Konu → taslak → onay → yayın akışı', 'Görsel öneri ve şablon bağlantısı'],
 [T('Fabrika', 'Haftalık 10 içerik taslağı otomatik onay kuyruğunda')], [G('Marka sesi kılavuzu (yoksa SOS-02)'), G('Yayın kanalları')],
 [S('Akış ve kanal bağlantıları', 'ekip', 'insan', 4, None, None, 'Fabrika', 'Örnek içerikler onaylandı')],
 ['Haftalık onaylanan içerik', 'Düzeltme oranı'], [R('Tekdüze içerik', 'Konu ve format çeşitliliği kuralları; insan onayı')],
 ['Claude sistem talimatında marka sesi kılavuzu ile içerik üretir; ekip/müşteri onaylamadan yayın yapılmaz.'], ['n8n zamanlanmış akış; WordPress ve sosyal medya API\'leri.'], 15, [M('openai', 'İsteğe bağlı: görsel üretimi')])
akis('AI-12', 'Rapor ve pano otomasyonu: elle hazırlanan haftalık/aylık raporları kaynak sistemlerden otomatik üretip dağıtma.',
 ['En fazla 4 veri kaynağı', 'Rapor şablonu ve yorum bölümü', 'Zamanlanmış dağıtım (e-posta/WhatsApp)'],
 [T('Otomatik rapor', 'Zamanında ve kaynakla tutarlı')], [G('Mevcut rapor örneği'), G('Alıcı listesi')],
 [S('Veri bağlantıları ve şablon', 'ekip', 'insan', 4, None, None, 'Rapor akışı', 'Kaynakla fark %2 altı')],
 ['Raporlamada kazanılan saat', 'Raporun zamanında gitme oranı'], [R('Veri tanımı farklı', 'KPI sözlüğü onaylı')],
 ['Claude sayıların değişimini yorumlar, dikkat edilmesi gerekenleri öne çıkarır.'], ['n8n + Google Sheets/Looker Studio ya da Arvela OS panosu.'])
akis('AI-13', 'Ürün açıklaması ve çeviri otomasyonu: 500 ürün için SEO uyumlu açıklama ve hedef dillere çeviri, mağazaya toplu yükleme.',
 ['Ürün verisinin çekilmesi', 'Açıklama şablonu ve terim sözlüğü', 'Hedef dillere çeviri', 'Mağazaya toplu yükleme'],
 [T('500 ürün', 'Açıklamalar marka sesinde, özellikleri doğru; çeviriler sözlüğe uygun')], [G('Ürün listesi ve özellikleri'), G('Hedef diller')],
 [S('Toplu üretim ve örnek kontrol', 'ai', 'ai_taslak', 3, None, None, 'Açıklamalar', '%10 örneklem insan kontrolü')],
 ['Düzeltme oranı', 'Ürün sayfası organik trafiği'], [R('Yanlış ürün özelliği', 'Yalnız verideki özellikler kullanılır; örneklem kontrolü')],
 ['Claude ürün verisinden açıklama ve çeviri üretir; uydurma özellik yazmaması sistem talimatında.'], ['WooCommerce/Shopify API ile toplu okuma-yazma; değişiklik öncesi yedek.'], 12)

small('AI-14', 'Yapay zekâya hazırlık analizi: şirketin süreçlerinde yapay zekânın en çok değer katacağı 5 alanı, veri hazırlığını ve yol haritasını çıkarır.',
 ['Departman görüşmeleri (en fazla 5)', 'Süreç ve veri envanteri', 'Fırsat listesi (etki × uygulanabilirlik)', 'Risk ve KVKK değerlendirmesi', '90 günlük yol haritası'], ['Uygulama projeleri (AI-01…13)', 'Yazılım lisansları'],
 [T('Hazırlık raporu', 'Fırsat başına tahmini kazanç ve efor'), T('Yol haritası', '90 gün; ilk 2 proje net')],
 [G('Departman yöneticileriyle görüşme saatleri'), G('Kullanılan yazılımlar listesi')],
 [S('Ön anket', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Anket yanıtları', 'Her departmandan'),
  S('Görüşmeler', 'ekip', 'insan', 5, None, None, 'Görüşme notları', 'Süreç adımları yazılı'),
  S('Fırsat analizi', 'ai', 'ai_taslak', 3, None, None, 'Fırsat listesi', 'Puanlı'),
  S('Uzman değerlendirmesi ve yol haritası', 'ekip', 'insan', 3, None, 'Kabul ön kontrolü', 'Rapor', 'Gerçekçi efor'),
  S('Sunum ve karar: ilk projeler', 'musteri', 'insan', 3, 'secim', H, 'Seçilen projeler', 'Karar kaydı var')], 17,
 ['Yol haritasından başlatılan proje sayısı', 'İlk projenin geri dönüşü'], [R('Beklenti çok yüksek', 'Her fırsatın sınırları ve başarısızlık riski raporda')],
 ['Claude görüşme notlarını süreç haritasına çevirir, benzer şirketlerdeki kullanım örnekleriyle fırsatları puanlar.'], ['Görüşmeler kayıtlıysa yazıya dökülür; rapor Arvela OS\'te.'], None, 60)

small('AI-15', 'Ekip yapay zekâ eğitimi: şirketin kendi işleri üzerinden uygulamalı, güvenli kullanım kurallarıyla yarım günlük oturum.',
 ['Ön anket ve kullanım örnekleri', '3,5 saatlik uygulamalı oturum (en fazla 15 kişi)', 'Şirkete özel istem kütüphanesi', 'Güvenli kullanım politikası taslağı'], ['Lisans satışı', 'Birebir koçluk'],
 [T('Oturum', 'Katılımcılar kendi işlerinden 3 görevi yapay zekâ ile tamamladı'), T('İstem kütüphanesi', 'Departman başına en az 5 istem'), T('Politika taslağı', 'Hangi veri girilmez, kim onaylar')],
 [G('Katılımcı listesi ve departmanlar'), G('Kullanılan yapay zekâ araçları')],
 [S('Ön anket', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Yanıtlar', 'Katılımcıların %70\'i'),
  S('İçerik ve örnekler', 'ai', 'ai_taslak', 3, None, None, 'Eğitim akışı + istemler', 'Şirket işlerinden örnek'),
  S('Müşteri onayı: içerik', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Oturum', 'ekip', 'insan', 1, None, None, 'Eğitim', 'Uygulama tamamlandı'),
  S('Değerlendirme ve materyal teslimi', 'ai', 'ai_taslak', 2, None, None, 'Anket + materyal', 'Memnuniyet ölçüldü')], 11,
 ['Memnuniyet puanı', '30 gün sonra düzenli kullanan oranı'], [R('Gizli veri araçlara girilir', 'Politika taslağı ve örneklerle "girilmeyecek veri" uygulaması')],
 ['Claude ön anketten departman örneklerini ve istem kütüphanesini hazırlar.'], ['Materyaller şirket klasörüne; 30 gün sonra kısa takip anketi.'], None, 55)

aylik('AI-16', 'Yapay zekâ akışlarının bakımı ve iyileştirmesi: izleme, hata giderme, kaynak değişikliklerine uyum, aylık iyileştirme.',
 ['Akış başına izleme ve hata giderme', 'API/kaynak değişikliklerine uyum', 'Ayda 2 saate kadar küçük iyileştirme', 'Aylık çalışma raporu'], ['Yeni akış (yeni proje)', 'Kullanım ücretleri'],
 [T('Çalışma süresi', 'Aylık %99'), T('Hata giderme', 'Kritik hata 1 iş günü içinde'), T('Aylık rapor', 'Çalışma sayısı, hata, iyileştirme')],
 [G('İyileştirme talepleri', zorunlu=False)],
 [S('Sürekli izleme', 'ai', 'tam', 25, None, None, 'Hata bildirimleri', 'Uyarılar çalışıyor'),
  S('Hata giderme ve iyileştirme', 'ekip', 'insan', 3, None, None, 'Değişiklik günlüğü', 'Test sonrası yayın'),
  S('Aylık rapor', 'ai', 'ai_taslak', 1, None, None, 'Rapor', 'Önceki aya göre'),
  S('Müşteri değerlendirmesi', 'musteri', 'insan', 1, 'secim', H, 'Gelecek ay önceliği', 'Karar kaydı var')],
 ['Çalışma süresi', 'Hata başına çözüm süresi'], [R('Sağlayıcı API\'si kapanır', 'Alternatif yol ve önceden bildirim')],
 ['Claude hata kayıtlarını özetler, tekrar eden hataların kök nedenini önerir.'], ['n8n hata akışı Arvela OS bildirim ve kesinti uyarısına bağlı.'], None, 70)
