# Kurumsal Dijital Danışmanlık hizmet kitapları (DAN-01 … DAN-07)
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'

small('DAN-01', 'Dijital olgunluk analizi: satış, pazarlama, operasyon, veri ve teknoloji alanlarında şirketin bugünkü durumu, 0–5 puanlı ve kıyaslı.',
 ['Yönetim ve departman görüşmeleri (en fazla 6)', 'Anket (çalışanlar)', 'Sistem ve veri incelemesi', '5 alanda puanlama ve sektör kıyası', 'Öncelikli 10 öneri'], ['Uygulama projeleri', 'Yazılım satın alma'],
 [T('Olgunluk raporu', '5 alan, kanıta dayalı puan, kıyas'), T('Öneri listesi', '10 öneri; etki, maliyet, süre')],
 [G('Görüşme takvimi'), G('Sistem listesi ve erişim (okuma)'), G('Hedefler ve bütçe aralığı')],
 [S('Başlangıç toplantısı ve anket', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Anket yanıtları', 'Katılım %60+'),
  S('Görüşmeler', 'ekip', 'insan', 6, None, None, 'Görüşme notları', 'Her alan kapsandı'),
  S('Sistem incelemesi', 'ekip', 'ai_taslak', 3, None, None, 'Bulgular', 'Kanıt ekli'),
  S('Puanlama ve kıyas', 'ai', 'ai_taslak', 2, None, None, 'Puan tablosu', 'Gerekçeli'),
  S('Rapor ve öneriler', 'ekip', 'insan', 3, None, 'Kabul ön kontrolü', 'Rapor', 'Öneriler uygulanabilir'),
  S('Yönetim sunumu ve karar', 'musteri', 'insan', 3, 'secim', H, 'Öncelikler', 'Karar kaydı var')], 20,
 ['Önerilerden başlatılan proje sayısı', '12 ay sonra olgunluk puanı değişimi'], [R('Görüşmeler aksar', 'Anket ve sistem verisiyle telafi; eksik alan raporda belirtilir')],
 ['Claude görüşme notlarını alan bazında sınıflandırır, çelişkileri ve tekrar eden sorunları çıkarır.'], ['Puanlama çerçevesi sabit; sonuçlar Arvela OS\'te müşteri kaydında.'], None, 55)

small('DAN-02', 'Dijital dönüşüm yol haritası: 12–18 aylık, bütçeli, sorumlu ve ölçütlü proje portföyü ve yönetim modeli.',
 ['Hedef durum ve iş hedefleri', 'Proje portföyü (önceliklendirme)', 'Bütçe ve kaynak planı', 'Yönetişim: karar mekanizması, KPI\'lar', 'İlk 90 günün ayrıntılı planı'], ['Uygulama', 'İşe alım'],
 [T('Yol haritası', 'Her proje: amaç, bütçe, sorumlu, süre, KPI'), T('90 gün planı', 'Haftalık kilometre taşları')],
 [G('Olgunluk analizi (DAN-01) ya da eşdeğeri', zorunlu=False), G('Yönetim atölyesi için 2 yarım gün'), G('Bütçe çerçevesi')],
 [S('Girdi toplama', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Belgeler', 'Hedefler net'),
  S('Hedef durum atölyesi', 'ekip', 'insan', 3, None, None, 'Atölye çıktıları', 'Hedefler ölçülebilir'),
  S('Proje portföyü taslağı', 'ai', 'ai_taslak', 4, None, None, 'Portföy', 'Bağımlılıklar çıkarıldı'),
  S('Bütçe ve kapsam kararı', 'musteri', 'insan', 4, 'butce', H, 'Onaylı portföy', 'Karar kaydı var'),
  S('Yol haritası ve 90 gün planı', 'ekip', 'insan', 5, None, 'Kabul ön kontrolü', 'Yol haritası', 'Sorumlular atanmış'),
  S('Yönetim onayı', 'musteri', 'insan', 3, 'onay', H, 'Onay', 'Karar kaydı var')], 25,
 ['Planlanan kilometre taşlarına uyum', 'Proje başına KPI gerçekleşmesi'], [R('Plan rafta kalır', 'Aylık danışmanlık (DAN-04) ya da PM-01 ile takip önerisi; 90 gün planı haftalık')],
 ['Claude projeler arası bağımlılıkları ve kaynak çakışmalarını bulur, senaryo bazında bütçe tabloları çıkarır.'], ['Yol haritası Arvela OS\'te proje olarak açılabilir; her proje bir hizmet kitabıyla eşlenir.'], None, 50)

small('DAN-03', 'Teknoloji ve araç seçimi: ihtiyaç listesinden kısa liste, demo, puanlama ve karar; tek bir alan için (CRM, ERP, e-ticaret altyapısı vb.).',
 ['İhtiyaç ve kriter listesi', 'Pazar taraması ve 3–4 adaylık kısa liste', 'Demo ve referans görüşmeleri', 'Puanlama, toplam sahip olma maliyeti', 'Karar raporu'], ['Lisans müzakeresi (isteğe bağlı ek)', 'Kurulum'],
 [T('Kriter listesi', 'Zorunlu/iyi olur ayrımı; ağırlıklı'), T('Karar raporu', 'Puan tablosu, 3 yıllık maliyet, riskler')],
 [G('Kullanıcı ve süreç bilgisi'), G('Bütçe ve entegrasyon gereksinimleri')],
 [S('İhtiyaç toplama', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'İhtiyaç listesi', 'Kullanıcılardan'),
  S('Kriterler ve ağırlıklar', 'ekip', 'ai_taslak', 2, None, None, 'Kriter listesi', 'Ağırlıklı'),
  S('Müşteri onayı: kriterler', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Pazar taraması ve kısa liste', 'ai', 'ai_taslak', 3, None, None, 'Kısa liste', 'Kaynaklı'),
  S('Demolar ve puanlama', 'ekip', 'insan', 6, None, None, 'Puan tablosu', 'Aynı senaryo'),
  S('Karar', 'musteri', 'insan', 3, 'secim', H, 'Seçilen araç', 'Karar kaydı var')], 19,
 ['Seçim sonrası 6 ayda benimsenme', 'Bütçe sapması'], [R('Satıcı demosu yanıltıcı', 'Şirketin gerçek senaryosuyla demo ve referans görüşmesi')],
 ['Claude araç belgelerini ve fiyat sayfalarını kriterlere göre karşılaştırma tablosuna döker; ekip doğrular.'], ['Kaynaklar raporda bağlantılı; Arvela komisyon almaz (tarafsızlık beyanı).'], None, 50)

aylik('DAN-04', 'Aylık dijital danışmanlık: düzenli toplantılar, karar desteği, ekip ve tedarikçi koordinasyonu, aylık ilerleme raporu.',
 ['Ayda 2 toplantı (60 dk)', 'Toplantılar arası yazılı soru-cevap', 'Karar notları ve aksiyon takibi', 'Aylık ilerleme raporu'], ['Uygulama işleri (ayrı kalemler)', 'Ayda 8 saati aşan çalışma'],
 [T('Toplantı notları', '24 saat içinde portalda; aksiyonlar sorumlulu'), T('Aylık rapor', 'Kararlar, aksiyon durumu, riskler')],
 [G('Gündem maddeleri (toplantıdan 2 gün önce)')],
 [S('Gündem toplama', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Gündem', 'Maddeler önceliklendi'),
  S('Toplantılar', 'ekip', 'insan', 14, None, None, 'Notlar ve aksiyonlar', 'Sorumlu ve tarih var'),
  S('Aksiyon takibi', 'ai', 'tam', 10, None, None, 'Hatırlatmalar', 'Geciken aksiyon bildirimi'),
  S('Aylık rapor ve öncelik kararı', 'musteri', 'insan', 2, 'secim', H, 'Gelecek ay öncelikleri', 'Karar kaydı var')],
 ['Zamanında kapanan aksiyon oranı', 'Danışmanlık saati kullanımı'], [R('Danışmanlık uygulamaya dönmüyor', 'Her toplantı aksiyonla biter; aylık rapor yönetime')],
 ['Claude toplantı kayıtlarından not, karar ve aksiyon listesi çıkarır, aksiyon sahiplerine hatırlatma gönderir.'], ['Toplantı kaydı izinle; notlar Arvela OS müşteri kaydında.'], None, 60)

small('DAN-05', 'Saatlik danışmanlık: belirli bir konuda uzman görüşü; görüşme öncesi hazırlık ve sonrasında yazılı özet.',
 ['Ön soru formu', 'Görüşme (saat bazlı)', 'Yazılı özet ve öneriler'], ['Uygulama', 'Belge hazırlama (ayrı teklif)'],
 [T('Özet', 'Görüşmeden sonra 24 saat içinde; somut adımlar')], [G('Konu ve ilgili belgeler')],
 [S('Ön form ve hazırlık', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Hazırlık notu', 'Sorular net'),
  S('Görüşme', 'ekip', 'insan', 1, None, None, 'Görüşme', 'Süre kaydı'),
  S('Özet ve onay', 'musteri', 'insan', 2, 'onay', H, 'Özet', 'Karar kaydı var')], 5,
 ['Memnuniyet', 'Tekrar alım'], [R('Kapsam büyür', 'Saat sınırı; ek ihtiyaç teklif olarak')],
 ['Claude ön formdan hazırlık notu ve olası sorular çıkarır; görüşme sonrası özeti yazar.'], ['Süre Arvela OS\'te kayıtlı; faturaya bağlanır.'], None, 50)

small('DAN-06', 'KVKK / GDPR dijital süreç ön denetimi: dijital kanallardaki kişisel veri akışları, açık rıza ve aydınlatma, saklama ve aktarım riskleri.',
 ['Veri envanteri (site, CRM, e-posta, reklam, yapay zekâ araçları)', 'Aydınlatma ve rıza akışlarının kontrolü', 'Yurt dışı aktarım ve sağlayıcı sözleşmeleri', 'Saklama ve imha uygulamaları', 'Risk listesi ve düzeltme planı'], ['Hukuki görüş ve temsil (avukat)', 'VERBİS kaydı'],
 [T('Envanter', 'Her sistem: veri kategorisi, amaç, dayanak, saklama'), T('Risk listesi', 'Yüksek/orta/düşük; düzeltme adımı ve sorumlu')],
 [G('Sistem listesi ve erişim'), G('Mevcut aydınlatma metinleri'), G('Hukukçu (sonuçların değerlendirmesi için)')],
 [S('Sistem ve süreç keşfi', 'ai', 'tam', 3, 'bilgi', 'Bilgi isteği', 'Sistem listesi', 'Tüm kanallar'),
  S('Veri akışı haritası', 'ekip', 'ai_taslak', 4, None, None, 'Envanter', 'Akışlar çizildi'),
  S('Uyum kontrolü', 'ai', 'ai_taslak', 3, None, None, 'Bulgular', 'Mevzuat maddesine bağlı'),
  S('Uzman değerlendirmesi', 'ekip', 'insan', 2, None, 'Kabul ön kontrolü', 'Rapor', 'Hukukçuya hazır'),
  S('Sunum ve düzeltme planı kararı', 'musteri', 'insan', 3, 'secim', H, 'Plan', 'Karar kaydı var')], 15,
 ['Kapanan yüksek risk sayısı', 'Rızasız işlenen kayıt (0)'], [R('Rapor hukuki görüş sanılır', 'Raporda "teknik ön denetimdir, hukuki görüş değildir" ibaresi; hukukçu değerlendirmesi önerilir')],
 ['Claude sistem ayarlarından ve metinlerden veri kategorilerini ve eksik aydınlatmaları çıkarır.'], ['Arvela\'nın kendi KVKK çalışması şablon olarak kullanılır.'], None, 55)

small('DAN-07', 'Marka kimliği çalışması: marka stratejisi, isim/slogan desteği, logo, renk ve yazı sistemi, kurumsal kimlik kılavuzu.',
 ['Marka stratejisi atölyesi (konumlandırma, kişilik, ses)', 'Logo: 3 yön, seçilen yönde 2 tur', 'Renk, yazı, görsel dil', 'Kurumsal kimlik kılavuzu (PDF + dijital)', 'Temel uygulamalar: kartvizit, antetli, sosyal medya profilleri'], ['Ambalaj ve tabela uygulamaları', 'Marka tescil başvurusu (TÜRKPATENT araştırması önerilir)'],
 [T('Logo ve varyasyonlar', 'Vektör, yatay/dikey/ikon, siyah-beyaz'), T('Kimlik kılavuzu', 'Kullanım kuralları ve yanlış kullanım örnekleri'), T('Uygulamalar', 'Baskıya hazır dosyalar')],
 [G('Şirket hikâyesi, hedef kitle, rakipler'), G('Beğenilen/beğenilmeyen marka örnekleri', zorunlu=False)],
 [S('Brif ve araştırma', 'ai', 'ai_taslak', 3, 'bilgi', 'Bilgi isteği', 'Araştırma özeti', 'Rakip görsel dili'),
  S('Strateji atölyesi', 'ekip', 'insan', 2, None, None, 'Marka platformu', 'Konumlandırma cümlesi'),
  S('Müşteri onayı: strateji', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Logo: 3 yön', 'ekip', 'insan', 6, None, None, '3 yön', 'Gerçekten farklı'),
  S('Müşteri seçimi: logo yönü', 'musteri', 'insan', 3, 'secim', H, 'Seçilen yön', 'Karar kaydı var'),
  S('Geliştirme ve kimlik sistemi', 'ekip', 'insan', 6, None, None, 'Logo + sistem', 'Küçük boyutta okunuyor'),
  S('Kılavuz ve uygulamalar', 'ekip', 'ai_taslak', 4, None, 'Kabul ön kontrolü', 'Kılavuz', 'Tüm dosyalar'),
  S('Müşteri kabul', 'musteri', 'insan', 3, 'onay', H, 'Kabul', 'Karar kaydı var')], 30,
 ['Revizyon tur sayısı', 'Kimliğin kanallarda tutarlı uygulanma oranı'], [R('Benzer marka/logo', 'Tasarım öncesi ve sonrası benzerlik araştırması; tescil uygunluğu önerisi')],
 ['Claude strateji atölyesi notlarından marka platformu metnini ve ses kılavuzunu yazar.'], ['Kılavuz Arvela Design System biçiminde de teslim edilebilir.'], None, 35, None, '2 tur')
