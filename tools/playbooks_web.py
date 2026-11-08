# Web & E-Ticaret hizmet kitapları (24 modül). Çıktı: app/playbooks.json (kod → hizmet kitabı)
import json, os
def S(ad, rol, oto, gun, karar=None, akis=None, cikti='', kontrol=''):
    return dict(ad=ad, rol=rol, otomasyon=oto, gun=gun, karar=karar, akis=akis, cikti=cikti, kontrol=kontrol)
def T(ad, kabul): return dict(ad=ad, kabul=kabul)
def G(ad, kimden='musteri', zorunlu=True, nasil='Portaldan yükleme ya da e-posta doğrulamalı karar sayfası'): return dict(ad=ad, kimden=kimden, zorunlu=zorunlu, nasil=nasil)
def R(risk, onlem): return dict(risk=risk, onlem=onlem)
def M(motor, amac): return dict(motor=motor, amac=amac)

# Tüm hizmetlerde ortak yapay zekâ destekli yönetim yöntemi
COMMON_Y = [
 'Proje açılışında Claude hizmet kitabını, müşteri kaydını ve geçmiş notları okuyup görev listesini, takvimi ve müşteriden istenecek bilgileri hazırlar; ekip yalnız onaylar.',
 'Her aşama bir görevdir; görev "incelemede"ye geçince Claude kabul ölçütlerine göre ön kontrol yapar, eksikleri göreve not olarak yazar.',
 'Müşteri kararı gereken her adımda Arvela OS karar kaydı açar; müşteri portaldan ya da e-posta doğrulamalı karar sayfasından onaylar, seçer veya revize ister. Karar, gerekçesiyle projeye işlenir.',
 'Her pazartesi Claude proje durum özetini (biten, sıradaki, bekleyen karar, risk) yazar; müşteri portalında yayımlanır, isteyen müşteriye e-postayla gider.',
 'Geciken görev, 48 saattir yanıtlanmayan karar ya da kapsam dışı istek tespit edilince Bugün sayfasına uyarı düşer; kapsam dışı istek için Claude ek iş teklifi taslağı hazırlar.',
]
COMMON_T = [
 'Kaynak: Arvela OS /api/v1 (proje, görev, onay, müşteri) + bu hizmet kitabı. Claude çağrıları n8n üzerinden yapılır; anahtar Arvela OS dışında, n8n ortamında durur.',
 'n8n akışları: "Proje başlangıcı" (görev + takvim), "Haftalık durum özeti", "Karar hatırlatma" (24/48 saat), "Kabul ön kontrolü" (görev incelemede olayı).',
 'Kişisel veri: Claude\'a yalnız işin gerektirdiği alanlar gider; müşteri kişisel verisi standart sözleşme (KVKK m.9, SS-2) imzalanana kadar gönderilmez, yerine firma düzeyi veri kullanılır.',
 'Her yapay zekâ çıktısı işlem kaydına (kim, ne zaman, hangi akış) düşer; müşteriye giden her metin bir ekip üyesinin onayından geçer, bu hizmette aksi belirtilmedikçe.',
]
def AI(yontem, teknik, ek=None, oran=70):
    return dict(motor='claude', yontem=COMMON_Y + yontem, teknik=COMMON_T + teknik, ek_motorlar=ek or [], otomasyon_orani=oran)
PANEL_STD = ['Proje durumunu ve haftalık özeti görür', 'Kendisinden istenen bilgi ve dosyaları yükler', 'Teslimatları onaylar ya da revize ister']

P = {}
P['WEB-01'] = dict(
 ozet='Sitenin neden, kim için ve hangi sayfalarla yapılacağını netleştiren keşif çalışması. Sonuçta onaylı site haritası, içerik planı ve ölçülebilir hedefler çıkar.',
 kapsam=['Ön soru formu ve 60 dk keşif görüşmesi', 'Rakip ve sektör incelemesi (en fazla 5 site)', 'Hedef kitle ve kullanıcı yolculuğu özeti', 'Site haritası ve sayfa başına içerik planı', 'Ölçüm planı: hedefler, dönüşüm olayları'],
 kapsam_disi=['Tasarım ve geliştirme (WEB-02, WEB-05)', 'Metin yazımı (SOS kategorisi)', 'Marka kimliği çalışması'],
 teslimatlar=[T('Keşif raporu', 'İş hedefi, hedef kitle, rakip bulguları ve 3 öncelik net yazılmış'), T('Site haritası', 'Her sayfanın amacı ve birincil eylemi tanımlı; müşteri onaylı'), T('İçerik planı', 'Sayfa başına başlık, bölümler, gereken içerik ve sorumlusu'), T('Ölçüm planı', 'En az 3 dönüşüm olayı ve hedef değeri')],
 girdiler=[G('Ön soru formu yanıtları'), G('Mevcut site, sosyal medya ve rakip adresleri'), G('Satış süreci ve sık sorulan sorular'), G('Varsa marka kılavuzu ve logo', zorunlu=False)],
 asamalar=[S('Ön soru formunu gönder ve yanıtları topla', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Doldurulmuş form', 'Zorunlu alanlar dolu'),
  S('Rakip ve sektör incelemesi', 'ai', 'ai_taslak', 2, None, None, 'Rakip tablosu: güçlü/zayıf yönler, sayfa yapıları', 'En az 3 rakip, kaynak bağlantıları'),
  S('Keşif görüşmesi (60 dk)', 'ekip', 'insan', 1, None, None, 'Görüşme notu; Claude özetler', 'Hedef, kitle, öncelikler not edildi'),
  S('Site haritası ve içerik planı taslağı', 'ai', 'ai_taslak', 2, None, None, 'Site haritası + içerik planı', 'Her sayfanın amacı ve eylemi var'),
  S('İç gözden geçirme', 'ekip', 'insan', 1, None, None, 'Düzeltilmiş taslak', 'Kabul ölçütleri sağlandı'),
  S('Müşteri onayı: site haritası', 'musteri', 'insan', 3, 'onay', 'Karar hatırlatma', 'Onaylı site haritası', 'Karar kaydı var'),
  S('Ölçüm planı ve devir', 'ai', 'ai_taslak', 1, None, None, 'Ölçüm planı, WEB-02/05 için brif', 'Dönüşüm olayları tanımlı')],
 sla=dict(sure_gun=10, revizyon='Site haritasında 2 tur', yanit='İş günü içinde 4 saat'),
 kpi=['Onaya kadar geçen gün', 'Revizyon tur sayısı', 'Sonraki tasarım aşamasında değişen sayfa sayısı (düşük olmalı)'],
 riskler=[R('Müşteri formu geç dolduruyor', 'Karar hatırlatma akışı 24/48 saatte hatırlatır; görüşmede birlikte doldurulur'), R('Kapsam büyüyor', 'Site haritası onaydan sonra kilitlenir; yeni sayfa ek iş olarak tekliflenir')],
 ai=AI(['Claude ön soru formu yanıtlarından hedef kitle ve kullanıcı yolculuğu taslağı çıkarır.', 'Rakip sitelerin sayfa yapısını karşılaştırma tablosuna döker; ekip doğrular.', 'Görüşme notundan site haritası ve içerik planını üretir; her sayfaya tek birincil eylem atar.'],
  ['Rakip incelemesi için sayfa içerikleri n8n HTTP düğümüyle alınır, Claude\'a özetletilir (robots.txt\'e uyulur).', 'Site haritası çıktısı JSON (sayfa, amaç, eylem, bölümler) olarak projeye kaydedilir; WEB-02 bu dosyayla başlar.'],
  [M('openai', 'İsteğe bağlı: görüşme ses kaydının yazıya dökülmesi (Whisper)')], 75),
 musteri_paneli=PANEL_STD + ['Site haritasını sayfa sayfa görür, sayfa bazında yorum bırakır'])

P['WEB-02'] = dict(
 ozet='Onaylı site haritasına göre 5 ana ekranın masaüstü ve mobil kullanıcı arayüzü tasarımı. İki tasarım yönü sunulur, müşteri birini seçer.',
 kapsam=['Moodboard ve 2 tasarım yönü', 'Seçilen yönde 5 ekran, masaüstü + mobil', 'Bileşen ve renk/tipografi listesi', 'Tıklanabilir prototip'],
 kapsam_disi=['Logo ve kurumsal kimlik', '5 ekranı aşan sayfalar (WEB-03)', 'Kodlama'],
 teslimatlar=[T('2 tasarım yönü', 'Ana sayfa üzerinde iki farklı yön; marka kılavuzuyla uyumlu'), T('5 ekran tasarımı', 'Masaüstü 1440 ve mobil 390 genişlikte; erişilebilirlik kontrastı 4.5:1'), T('Prototip bağlantısı', 'Ana akış tıklanarak gezilebiliyor'), T('Tasarım sistemi notu', 'Renk, yazı, buton, form bileşenleri tanımlı')],
 girdiler=[G('Onaylı site haritası (WEB-01)', 'arvela'), G('Logo ve marka renkleri'), G('Beğenilen 3 site örneği', zorunlu=False), G('Ürün/hizmet görselleri', zorunlu=False)],
 asamalar=[S('Brif ve moodboard', 'ai', 'ai_taslak', 1, None, None, 'Moodboard: renk, yazı, görsel dili', 'Marka kılavuzuna uygun'),
  S('İki tasarım yönü (ana sayfa)', 'ekip', 'insan', 3, None, None, 'İki ana sayfa tasarımı', 'İki yön gerçekten farklı'),
  S('Müşteri seçimi: tasarım yönü', 'musteri', 'insan', 2, 'secim', 'Karar hatırlatma', 'Seçilen yön', 'Karar kaydı var'),
  S('5 ekran masaüstü + mobil', 'ekip', 'insan', 5, None, None, 'Ekran tasarımları', 'Tüm ekranlarda mobil hâl var'),
  S('Erişilebilirlik ve tutarlılık ön kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Kontrol raporu', 'Kontrast, dokunma alanı, metin boyutu'),
  S('Müşteri onayı: ekranlar', 'musteri', 'insan', 3, 'onay', 'Karar hatırlatma', 'Onaylı tasarımlar', '2 revizyon turu içinde'),
  S('Prototip ve geliştirme devri', 'ekip', 'insan', 1, None, None, 'Prototip + devir notu', 'Bileşen listesi tamam')],
 sla=dict(sure_gun=15, revizyon='2 tur', yanit='İş günü içinde 4 saat'),
 kpi=['Seçimden onaya revizyon sayısı', 'Erişilebilirlik kontrolünden geçen ekran oranı (%100)', 'Geliştirmede tasarım kaynaklı geri dönüş sayısı'],
 riskler=[R('Müşteri iki yönü de beğenmiyor', 'Seçim sayfasında "üçüncü yön iste" yerine yorumla ortak yön birleştirilir; ek tur tekliflenir'), R('İçerik eksik, tasarım boş kalıyor', 'Gerçek içerik yoksa Claude örnek metin üretir, "taslak" etiketiyle')],
 ai=AI(['Claude site haritası ve marka bilgisinden moodboard brifini ve ekran başına bölüm listesini yazar.', 'Tasarım dosyalarından alınan ekran görüntülerini kabul ölçütlerine göre denetler (kontrast, hiyerarşi, mobil).', 'Müşteri yorumlarını revizyon listesine çevirir, kapsam dışı olanları ayırır.'],
  ['Tasarım: Claude Design / Figma; ekran görüntüleri n8n ile projeye eklenir.', 'Seçim kararı iki seçenekli karar kaydıdır; müşteri e-posta bağlantısıyla seçebilir.'],
  [M('gemini', 'İsteğe bağlı: moodboard için görsel üretimi'), M('openai', 'İsteğe bağlı: görsel üretimi (gpt-image)')], 55),
 musteri_paneli=PANEL_STD + ['İki tasarım yönünden birini seçer', 'Ekran bazında yorum bırakır'])

P['WEB-03'] = dict(
 ozet='WEB-02 kapsamındaki 5 ekrana ek olarak her bir yeni ekranın aynı tasarım sistemiyle masaüstü ve mobil tasarımı.',
 kapsam=['1 ek ekran, masaüstü + mobil', 'Mevcut tasarım sistemiyle uyum', '1 revizyon turu'],
 kapsam_disi=['Yeni tasarım yönü', 'Yeni bileşen kütüphanesi'],
 teslimatlar=[T('Ek ekran tasarımı', 'Tasarım sistemiyle tutarlı; mobil hâl var')],
 girdiler=[G('Ekranın amacı ve içeriği'), G('Onaylı tasarım sistemi (WEB-02)', 'arvela')],
 asamalar=[S('Ekran brifi', 'ai', 'ai_taslak', 1, None, None, 'Bölüm listesi', 'Amaç ve eylem tanımlı'), S('Tasarım', 'ekip', 'insan', 2, None, None, 'Ekran', 'Mobil hâl var'), S('Ön kontrol', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Kontrast ve tutarlılık'), S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', '1 tur içinde')],
 sla=dict(sure_gun=5, revizyon='1 tur', yanit='İş günü içinde 4 saat'), kpi=['Teslim süresi', 'Revizyon sayısı'],
 riskler=[R('Ekran yeni bileşen gerektiriyor', 'Bileşen ek iş olarak ayrıca tahmin edilir')],
 ai=AI(['Claude ekran amacından bölüm listesini çıkarır ve tasarım sistemine uygunluğu denetler.'], [], oran=60), musteri_paneli=PANEL_STD)

P['WEB-04'] = dict(
 ozet='Tek bir kampanya, ürün ya da hizmet için dönüşüme odaklı tek sayfalık site; form, WhatsApp ve ölçüm kurulumu dahil.',
 kapsam=['Tek sayfa: başlık, fayda, sosyal kanıt, SSS, eylem', 'Form ve WhatsApp butonu; form Arvela OS satış hattına düşer', 'GA4 + dönüşüm olayları, çerez onayı', 'Hız: mobil Lighthouse 90+', 'Alan adı ve SSL bağlantısı'],
 kapsam_disi=['Reklam yönetimi (DIJ)', 'Çoklu sayfa', 'Profesyonel fotoğraf çekimi'],
 teslimatlar=[T('Yayında landing page', 'Mobil Lighthouse performans ≥90, erişilebilirlik ≥95'), T('Çalışan form', 'Test başvurusu Arvela OS satış hattında görünüyor'), T('Ölçüm', 'GA4\'te form ve WhatsApp tıklaması olay olarak görünüyor'), T('KVKK', 'Aydınlatma bağlantısı ve çerez onayı çalışıyor')],
 girdiler=[G('Kampanya/ürün bilgisi ve teklif'), G('Logo ve görseller'), G('Yorum veya referanslar', zorunlu=False), G('Alan adı erişimi veya DNS yetkisi')],
 asamalar=[S('Brif ve teklif metninin netleşmesi', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Brif', 'Tek ana teklif ve eylem'),
  S('Sayfa metni taslağı', 'ai', 'ai_taslak', 1, None, None, 'Başlık, fayda, SSS metinleri', 'Marka sesiyle uyumlu, abartısız'),
  S('Müşteri onayı: metin', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onaylı metin', 'Karar kaydı'),
  S('Tasarım ve geliştirme', 'ekip', 'insan', 3, None, None, 'Hazır sayfa (önizleme adresi)', 'Mobil ve masaüstü'),
  S('Form → Arvela OS, GA4, çerez onayı', 'ekip', 'ai_taslak', 1, None, 'Web formu → aday', 'Ölçüm ve form kurulumu', 'Test kaydı satış hattında'),
  S('Otomatik kalite kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Lighthouse + bağlantı + form testi raporu', 'Ölçütler sağlandı'),
  S('Müşteri onayı: yayın', 'musteri', 'insan', 1, 'onay', 'Karar hatırlatma', 'Yayın onayı', 'Karar kaydı'),
  S('Yayın ve 7 gün izleme', 'ai', 'tam', 7, None, 'Acil site uyarısı', 'İlk hafta raporu', 'Hata yok, dönüşüm olayları geliyor')],
 sla=dict(sure_gun=10, revizyon='Metinde 2, tasarımda 1 tur', yanit='İş günü içinde 4 saat; yayın sonrası kesinti 2 saat'),
 kpi=['Dönüşüm oranı (form + WhatsApp / ziyaret)', 'Mobil Lighthouse performansı', 'İlk aday gelene kadar geçen süre'],
 riskler=[R('DNS erişimi gecikiyor', 'Önizleme adresinde onay alınır; DNS için adım adım rehber karar sayfasında'), R('Reklam trafiği kalitesiz', 'İlk hafta raporunda kaynak kırılımı; DIJ ekibine aktarım')],
 ai=AI(['Claude brifinden başlık seçenekleri ve fayda listesi çıkarır; müşteri seçenekler arasından seçer.', 'Yayın öncesi kontrolü n8n otomatik yapar: Lighthouse, kırık bağlantı, form testi, çerez onayı.', 'Yayından sonra 7 gün her sabah ziyaret ve dönüşüm özetini yazar; anormallikte uyarı açar.'],
  ['Lighthouse: PageSpeed Insights API (n8n HTTP).', 'Form testi: n8n test başvurusu gönderir, Arvela OS\'te aday oluştuğunu /api/v1/leads ile doğrular, sonra test kaydını kapatır.', 'GA4 olayları: Measurement Protocol ile test olayı.'],
  [M('gemini', 'İsteğe bağlı: görsel varyasyonları')], 75),
 musteri_paneli=PANEL_STD + ['Başlık seçenekleri arasından seçer', 'İlk hafta ziyaret ve aday sayısını görür'])

P['WEB-05'] = dict(
 ozet='8 sayfaya kadar kurumsal web sitesi: tasarım sistemine göre geliştirme, içerik girişi, form, ölçüm, KVKK ve yayın. Site Arvela OS\'te "Siteler" kaydıyla izlenir.',
 kapsam=['8 sayfaya kadar geliştirme (WordPress ya da statik/Node)', 'Yönetim paneli ve 30 dk kullanım eğitimi', 'İletişim formu → Arvela OS satış hattı, WhatsApp butonu', 'Temel SEO: başlıklar, meta, site haritası, Search Console', 'GA4, çerez onayı, aydınlatma metni bağlantısı', 'Hostinger\'da yayın, SSL, yedek'],
 kapsam_disi=['Tasarım (WEB-02) ve metin yazımı', '8 sayfayı aşan sayfa', 'Çok dil (WEB-06)', 'Blog içeriği üretimi'],
 teslimatlar=[T('Yayında site', 'Tüm sayfalar mobil ve masaüstünde tasarıma uygun; Lighthouse performans ≥85'), T('Yönetim erişimi ve eğitim', 'Müşteri bir sayfayı kendisi güncelleyebildi'), T('Form ve ölçüm', 'Test başvurusu satış hattında, GA4 olayları geliyor'), T('Teslim dosyası', 'Erişimler, eklentiler, yedek planı Arvela OS\'te kayıtlı')],
 girdiler=[G('Onaylı tasarımlar (WEB-02)', 'arvela'), G('Sayfa metinleri ve görseller'), G('Alan adı / DNS erişimi'), G('Yasal bilgiler: unvan, adres, MERSİS (KVKK metni için)')],
 asamalar=[S('Proje açılışı ve erişimlerin toplanması', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Erişim kontrol listesi', 'DNS, içerik, yasal bilgi tamam'),
  S('Kurulum: sunucu, tema/iskelet, staging', 'ekip', 'ai_taslak', 2, None, None, 'Staging adresi', 'SSL ve yedek açık'),
  S('Sayfa geliştirme', 'ekip', 'insan', 6, None, None, 'Sayfalar', 'Tasarıma uygun, mobil'),
  S('İçerik girişi ve SEO alanları', 'ai', 'ai_taslak', 2, None, None, 'İçerik + meta açıklamalar', 'Her sayfada başlık ve meta'),
  S('Form, WhatsApp, GA4, çerez onayı', 'ekip', 'ai_taslak', 1, None, 'Web formu → aday', 'Ölçüm kurulumu', 'Test olayları geliyor'),
  S('Otomatik kalite kontrolü', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor: hız, kırık bağlantı, erişilebilirlik, form', 'Ölçütler sağlandı'),
  S('Müşteri incelemesi ve revizyon', 'musteri', 'insan', 4, 'onay', 'Karar hatırlatma', 'Revizyon listesi / onay', '2 tur içinde'),
  S('Yayın, Search Console, Siteler kaydı', 'ekip', 'ai_taslak', 1, None, None, 'Canlı site', 'Arvela OS Siteler\'de kayıtlı, eşitleme çalışıyor'),
  S('Eğitim ve 14 gün izleme', 'ai', 'tam', 14, None, 'Acil site uyarısı', 'İzleme raporu', 'Kesinti ve hata yok')],
 sla=dict(sure_gun=25, revizyon='2 tur', yanit='İş günü içinde 4 saat; yayın sonrası kesinti 2 saat'),
 kpi=['Zamanında teslim', 'Lighthouse performans ve erişilebilirlik', 'İlk 30 günde form başvurusu', 'Yayın sonrası hata sayısı'],
 riskler=[R('İçerik gecikmesi', 'İçerik eksikse Claude taslak üretir, müşteri onaylar; gecikme 5 iş gününü aşarsa takvim kaydırılır ve kayda geçer'), R('Eklenti/güvenlik açığı', 'Site her sabah eşitlenir; açık çıkarsa Bugün\'e acil uyarı'), R('Kapsam kayması', 'Yeni sayfa istekleri ek iş teklifi olarak karar sayfasına düşer')],
 ai=AI(['Claude içerik eksiklerini görev bazında listeler, müşteriden yalnız eksik olanı ister.', 'Her sayfa için meta başlık/açıklama ve görsel alt metinlerini üretir; ekip onaylar.', 'Yayın öncesi kalite kontrolünü otomatik yapar ve sonucu proje kaydına yazar.', 'Müşterinin revizyon e-postalarını/yorumlarını madde madde göreve çevirir.'],
  ['Site Hostinger\'a hosting_deploy (Git) ya da WordPress kurulumuyla yayınlanır; site Arvela OS Siteler\'e eklenir ve günlük eşitlemeye girer.', 'Kalite kontrolü: PageSpeed API, bağlantı tarayıcı (n8n), axe-core erişilebilirlik taraması.', 'Search Console doğrulaması DNS TXT ile; DNS değişikliği yalnız ekip onayıyla.'],
  [M('openai', 'İsteğe bağlı: görsel alt metni üretimi için görüntü tanıma')], 65),
 musteri_paneli=PANEL_STD + ['Staging adresinden siteyi görüp sayfa bazında revizyon ister', 'Yayın onayını verir'])

def small(code, ozet, kapsam, disi, tesl, girdi, asama, gun, kpi, risk, yontem, teknik, ek=None, oran=65, panel=None, rev='1 tur'):
    P[code] = dict(ozet=ozet, kapsam=kapsam, kapsam_disi=disi, teslimatlar=tesl, girdiler=girdi, asamalar=asama, sla=dict(sure_gun=gun, revizyon=rev, yanit='İş günü içinde 4 saat'),
                   kpi=kpi, riskler=risk, ai=AI(yontem, teknik, ek, oran), musteri_paneli=PANEL_STD + (panel or []))

small('WEB-06', 'Sitenin ikinci ve sonraki dillerde yayınlanması: dil yapısı, çeviri, hreflang ve dil seçici.',
 ['Dil yapısı (alt dizin: /en/)', 'Claude ile çeviri + anadil kontrolü', 'hreflang ve dil seçici', 'Dil başına site haritası'], ['Yeni içerik üretimi', 'Yasal metinlerin hukuki çevirisi'],
 [T('İkinci dil yayında', 'Tüm sayfalar çevrili, hreflang doğru'), T('Terim sözlüğü', 'Marka ve hizmet adları sabit')],
 [G('Hedef dil(ler) ve pazar'), G('Marka terimleri ve çevrilmeyecek adlar', zorunlu=False)],
 [S('Terim sözlüğü', 'ai', 'ai_taslak', 1, None, None, 'Sözlük', 'Marka adları sabit'), S('Makine çevirisi', 'ai', 'tam', 1, None, None, 'Çeviri taslağı', 'Tüm sayfalar'),
  S('Anadil kontrolü', 'freelancer', 'insan', 3, None, None, 'Düzeltilmiş çeviri', 'Anadil konuşurundan onay'), S('Teknik kurulum: hreflang, seçici', 'ekip', 'ai_taslak', 1, None, None, 'Dil yapısı', 'Search Console hatasız'),
  S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 8,
 ['Dil başına organik trafik', 'Çeviri düzeltme oranı'], [R('Çeviri ton hatası', 'Anadil kontrolü zorunlu adım; terim sözlüğü')],
 ['Claude sayfaları terim sözlüğüne bağlı kalarak çevirir; değişen sayfalar otomatik yeniden çeviri kuyruğuna girer.'], ['Çeviri farkı: sayfa içeriği değişince n8n eski/yeni karşılaştırıp yalnız değişen bölümü çevirir.'],
 [M('openai', 'İkinci görüş: kritik sayfalarda çapraz çeviri kontrolü'), M('gemini', 'Alternatif: Asya dilleri için karşılaştırma')], 75, ['Çeviriyi sayfa bazında onaylar'])

small('WEB-07', 'Blog ve içerik modülü: kategori, etiket, yazar, SEO alanları ve yayın akışı. Arvela OS içerik takvimiyle bağlanabilir.',
 ['Blog liste ve detay şablonları', 'Kategori/etiket, ilgili yazılar', 'SEO: şema (Article), meta, site haritası', 'Yayın akışı: taslak → onay → yayın'], ['Yazı üretimi (SOS-xx içerik paketleri)'],
 [T('Blog modülü', 'Örnek 2 yazı yayında, şema doğrulayıcıdan geçiyor'), T('Yayın akışı', 'Müşteri taslağı onaylayınca yazı yayına alınabiliyor')],
 [G('Kategori listesi'), G('İlk 2 yazı metni', zorunlu=False)],
 [S('Bilgi mimarisi: kategori/etiket', 'ai', 'ai_taslak', 1, None, None, 'Kategori yapısı', 'Çakışma yok'), S('Şablon geliştirme', 'ekip', 'insan', 3, None, None, 'Blog şablonları', 'Mobil, şema'),
  S('Yayın akışı ve n8n bağlantısı', 'ekip', 'ai_taslak', 1, None, None, 'Akış', 'Onaylı taslak yayınlanabiliyor'), S('Ön kontrol', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Şema ve hız'), S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 8,
 ['Yayınlanan yazı/ay', 'Blog organik trafiği'], [R('Yazı üretilmiyor, blog boş kalıyor', 'İçerik paketi önerisi; Claude aylık konu listesi çıkarır')],
 ['Claude aylık konu önerilerini anahtar kelime ve müşteri sorularından çıkarır; müşteri seçer.', 'Onaylanan taslak n8n ile CMS\'e taslak olarak gönderilir.'], ['WordPress REST API ya da statik sitede Markdown + Git; yayın ekip onayıyla.'],
 None, 70, ['Aylık konu listesinden seçim yapar', 'Yazı taslaklarını onaylar'])

small('WEB-08', 'Randevu / rezervasyon modülü: hizmet, süre, personel ve takvim; onay ve hatırlatma bildirimleri.',
 ['Hizmet ve süre tanımları', 'Takvim (Google Takvim eşitleme)', 'Onay ve hatırlatma e-postası/WhatsApp şablonu', 'Rezervasyon → Arvela OS aday/müşteri kaydı'], ['Ödeme alma (WEB-12)', 'Çağrı merkezi'],
 [T('Çalışan rezervasyon', 'Test rezervasyonu takvime ve Arvela OS\'e düştü'), T('Bildirimler', 'Onay ve 24 saat önce hatırlatma gidiyor')],
 [G('Hizmet listesi, süreler, çalışma saatleri'), G('Takvim erişimi (Google)'), G('İletişim izni metni (İYS)', 'arvela')],
 [S('Kurgu ve kurallar', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Rezervasyon kuralları', 'İptal/erteleme kuralı var'), S('Kurulum ve takvim eşitleme', 'ekip', 'insan', 3, None, None, 'Modül', 'Çift rezervasyon yok'),
  S('Bildirim akışları', 'ekip', 'ai_taslak', 1, None, None, 'n8n akışları', 'Test bildirimi geldi'), S('Uçtan uca test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Test raporu', 'Kayıt + takvim + bildirim'),
  S('Müşteri onayı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 8,
 ['Aylık rezervasyon', 'Gelmeme oranı', 'Hatırlatma sonrası iptal oranı'], [R('Takvim çakışması', 'Eşitleme her 5 dakikada; çakışmada kayıt reddedilir'), R('İzinsiz ileti', 'Hatırlatmalar hizmet bildirimi; pazarlama iletisi ayrı onay')],
 ['Gelmeme oranı yüksekse Claude hatırlatma zamanlaması ve metni için öneri yazar.'], ['n8n: rezervasyon webhook → Arvela OS /api/v1/clients (aday) + Google Calendar düğümü + e-posta/WhatsApp.'],
 None, 80, ['Rezervasyon raporunu görür'])

small('WEB-09', 'Sitede 7/24 cevap veren yapay zekâ asistanı: sık sorulan sorular, hizmet bilgisi, aday toplama ve ekibe devir.',
 ['Bilgi tabanı (SSS, hizmetler, fiyat aralıkları)', 'Asistan kişiliği ve sınırları', 'Aday bilgisi toplama → Arvela OS', 'İnsana devir (WhatsApp/e-posta)', 'Aylık konuşma analizi'], ['Ödeme alma', 'Sağlık/hukuk gibi alanlarda kişisel tavsiye'],
 [T('Yayında asistan', 'Test soru setinin %90\'ı doğru yanıtlandı'), T('Devir akışı', 'Yanıtlayamadığı soruda ekibe bildirim gitti'), T('KVKK', 'Sohbet başında aydınlatma bağlantısı')],
 [G('SSS ve hizmet bilgileri'), G('Yanıtlamaması gereken konular'), G('Devir için iletişim kanalı')],
 [S('Bilgi tabanı derleme', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'Bilgi tabanı', 'Müşteri onaylı'), S('Asistan talimatı ve sınırlar', 'ai', 'ai_taslak', 1, None, None, 'Sistem talimatı', 'Sınırlar net'),
  S('Müşteri onayı: bilgi tabanı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı'), S('Widget kurulumu ve devir akışı', 'ekip', 'insan', 2, None, None, 'Çalışan widget', 'Aday Arvela OS\'te'),
  S('Test soru seti ile değerlendirme', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Değerlendirme raporu', '%90 doğru'), S('Yayın ve haftalık analiz', 'ai', 'tam', 7, None, None, 'Haftalık rapor', 'Yanıtsız sorular listelendi')], 10,
 ['Doğru yanıt oranı', 'Asistandan gelen aday', 'Devir oranı'], [R('Yanlış bilgi (uydurma)', 'Yalnız bilgi tabanından yanıt; emin değilse devir; haftalık örnek denetimi'), R('Kişisel veri', 'Sohbet kayıtları 90 gün; KVKK saklama ayarına bağlı')],
 ['Claude asistanı yalnız onaylı bilgi tabanıyla yanıtlar; bilinmeyen soru otomatik "bilgi tabanına eklenecek" listesine düşer.', 'Haftalık rapor: en çok sorulanlar, yanıtsızlar, gelen adaylar; müşteri yeni bilgiyi onaylar.'],
 ['Claude API (n8n webhook) + sitede hafif widget; konuşma kayıtları Arvela OS\'te müşteri altında.', 'Değerlendirme: 30 soruluk test seti her bilgi tabanı değişikliğinde otomatik çalışır.'],
 [M('openai', 'İsteğe bağlı: sesli asistan (ses ↔ metin)'), M('gemini', 'İsteğe bağlı: görsel soru (ürün fotoğrafı)')], 90, ['Yanıtsız soruların cevabını yazar, bilgi tabanına eklenmesini onaylar'])

small('WEB-10', '50 ürüne kadar e-ticaret mağazası: WooCommerce ya da hazır altyapıda kurulum, kategori, ürün sayfaları, sepet ve ödeme akışı.',
 ['Mağaza kurulumu ve tema', 'Kategori yapısı, filtreler', '50 ürüne kadar ürün girişi', 'Sepet, ödeme sayfası, sipariş e-postaları', 'Mesafeli satış, iade, KVKK sayfaları', 'GA4 e-ticaret olayları'], ['Ödeme altyapısı başvurusu (WEB-12)', 'Kargo entegrasyonu (WEB-13)', 'Ürün fotoğraf çekimi'],
 [T('Yayında mağaza', 'Test siparişi baştan sona tamamlandı'), T('Ürünler', '50 ürün eksiksiz: başlık, açıklama, fiyat, stok, görsel'), T('Yasal sayfalar', 'Mesafeli satış ve iade sayfaları yayında'), T('Ölçüm', 'GA4 satın alma olayı geliyor')],
 [G('Ürün listesi (Excel/CSV) ve görseller'), G('Kargo ve iade koşulları'), G('Şirket ve vergi bilgileri'), G('Ödeme altyapısı tercihi')],
 [S('Mağaza kurgusu: kategori, varyant, kargo kuralları', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'Mağaza planı', 'Kategori ve varyant yapısı onaylı'),
  S('Müşteri onayı: mağaza planı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı'),
  S('Kurulum ve tema', 'ekip', 'insan', 4, None, None, 'Staging mağaza', 'Mobil uyumlu'),
  S('Ürün verisini temizleme ve zenginleştirme', 'ai', 'ai_taslak', 2, None, None, 'Temiz ürün dosyası (başlık, açıklama, SEO)', 'Eksik alan yok'),
  S('Ürün içe aktarma', 'ekip', 'ai_taslak', 1, None, None, 'Ürünler yüklü', '50 ürün'),
  S('Yasal sayfalar ve e-postalar', 'ai', 'ai_taslak', 1, None, None, 'Sayfa ve e-posta şablonları', 'Hukukçu onaylı şablon'),
  S('Uçtan uca test siparişi', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Test raporu', 'Sipariş, e-posta, stok düşümü'),
  S('Müşteri onayı: yayın', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Yayın onayı', 'Karar kaydı'),
  S('Yayın ve 14 gün izleme', 'ai', 'tam', 14, None, None, 'Satış ve hata raporu', 'Ödeme hatası yok')], 30,
 ['Dönüşüm oranı', 'Sepet terk oranı', 'Ödeme hatası', 'Ürün sayfası hızı'], [R('Ürün verisi dağınık', 'Claude temizleme adımı; eksikler tek listede müşteriden istenir'), R('Yasal eksik', 'Mesafeli satış/iade sayfası olmadan yayın onayı verilemez')],
 ['Claude ürün dosyasını temizler: başlık standardı, açıklama, SEO alanları, eksik alan raporu.', 'Sipariş, stok ve iade sorunlarını günlük özetle bildirir (mağaza MCP/REST bağlantısıyla).'],
 ['WooCommerce REST API (Arvela\'nın mağaza bağlantıları gibi); ürün içe aktarma CSV + API.', 'Test siparişi n8n ile sandbox ödeme yöntemiyle verilir, sonra iptal edilir.'],
 [M('gemini', 'Ürün görsellerinde arka plan temizleme/varyasyon'), M('openai', 'Ürün fotoğrafından açıklama taslağı (görüntü tanıma)')], 70, ['Mağaza planını ve ürün dosyasını onaylar', 'Günlük satış özetini görür'], '2 tur')

small('WEB-11', 'Ürün yükleme ve katalog düzenleme: ürün verisinin temizlenmesi, zenginleştirilmesi ve mağazaya yüklenmesi.',
 ['Ürün dosyası temizleme (başlık, varyant, birim)', 'Açıklama ve SEO alanları', 'Görsel adlandırma ve alt metin', 'Toplu yükleme ve kontrol'], ['Fotoğraf çekimi', 'Fiyat belirleme'],
 [T('Yüklenen ürünler', 'Tüm alanlar dolu; hata raporu sıfır'), T('Değişiklik raporu', 'Ürün başına yapılan değişiklikler listelendi')],
 [G('Ürün listesi ve görseller'), G('Mağaza yönetici erişimi')],
 [S('Veri analizi ve eksik raporu', 'ai', 'tam', 1, 'bilgi', 'Bilgi isteği', 'Eksik listesi', 'Müşteriye tek listede'), S('Zenginleştirme', 'ai', 'ai_taslak', 2, None, None, 'Zenginleştirilmiş dosya', 'Marka sesi'),
  S('Müşteri onayı: örnek 10 ürün', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı'), S('Toplu yükleme', 'ekip', 'ai_taslak', 1, None, None, 'Yüklü ürünler', 'Hata yok'), S('Otomatik kontrol', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Kontrol raporu', 'Eksik alan sıfır')], 7,
 ['Ürün başına süre', 'Hata oranı', 'Ürün sayfası dönüşümü'], [R('Yanlış fiyat/stok', 'Fiyat ve stok değiştirilmez; yalnız müşteri dosyasından gelir, fark raporlanır')],
 ['Önce 10 ürünlük örnek onaylatılır; onaylanan stil tüm ürünlere uygulanır.'], ['Mağaza API ile toplu güncelleme; her değişiklik öncesi yedek alınır.'],
 [M('gemini', 'Görsel düzenleme'), M('openai', 'Görselden ürün özelliği çıkarma')], 85, ['Örnek ürünleri onaylar'])

small('WEB-12', 'Ödeme altyapısı entegrasyonu (iyzico, PayTR veya banka sanal POS): başvuru desteği, kurulum, test ve canlıya alma.',
 ['Sağlayıcı seçimi önerisi', 'Başvuru belgelerinin hazırlanması', 'Kurulum, 3D Secure, taksit', 'Sandbox ve canlı test'], ['Sağlayıcı komisyon pazarlığı', 'Muhasebe entegrasyonu (WEB-15)'],
 [T('Canlı ödeme', 'Gerçek kartla 1 TL\'lik test ve iadesi başarılı'), T('Taksit/3D', 'Ayarlar sağlayıcı paneliyle uyumlu')],
 [G('Şirket belgeleri (sağlayıcının istediği)'), G('Sağlayıcı paneli erişimi (müşteri verir, Arvela kart verisi görmez)')],
 [S('Sağlayıcı karşılaştırması', 'ai', 'ai_taslak', 1, None, None, 'Karşılaştırma', 'Güncel komisyonlar kaynaklı'), S('Müşteri seçimi', 'musteri', 'insan', 2, 'secim', 'Karar hatırlatma', 'Seçilen sağlayıcı', 'Karar kaydı'),
  S('Başvuru belgeleri kontrol listesi', 'ai', 'tam', 1, 'bilgi', 'Bilgi isteği', 'Liste', 'Eksiksiz'), S('Kurulum ve sandbox testi', 'ekip', 'insan', 2, None, None, 'Test sonucu', 'Başarılı/başarısız senaryolar'),
  S('Canlı test ve iade', 'ekip', 'insan', 1, None, None, 'Canlı test kaydı', 'İade de test edildi')], 10,
 ['Ödeme başarı oranı', '3D hata oranı'], [R('Başvuru gecikmesi', 'Sağlayıcı süreci müşteriye bağlı; takvim karar kaydına göre kayar')],
 ['Claude başvuru belge listesini sağlayıcıya göre çıkarır ve eksikleri takip eder.'], ['Kart verisi Arvela\'dan geçmez; yalnız sağlayıcı ödeme sayfası/iframe. API anahtarları müşterinin mağaza ayarında.'], None, 50, ['Sağlayıcı seçimini yapar'])

small('WEB-13', 'Kargo entegrasyonu: anlaşmalı kargo firmasıyla gönderi oluşturma, takip numarası ve müşteri bildirimleri.',
 ['Kargo firması API entegrasyonu', 'Otomatik gönderi oluşturma ve etiket', 'Takip bildirimi e-posta/SMS', 'Desi/ücret kuralları'], ['Kargo anlaşması pazarlığı'],
 [T('Otomatik gönderi', 'Test siparişinde etiket ve takip numarası oluştu'), T('Bildirim', 'Müşteriye takip bağlantısı gitti')],
 [G('Kargo firması anlaşma bilgileri ve API erişimi')],
 [S('Kurallar: desi, ücret, kapıda ödeme', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Kural tablosu', 'Onaylı'), S('Entegrasyon', 'ekip', 'insan', 3, None, None, 'Çalışan entegrasyon', 'Etiket basılıyor'),
  S('Uçtan uca test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Test raporu', 'Takip bildirimi geldi'), S('Müşteri onayı', 'musteri', 'insan', 1, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 7,
 ['Sipariş → kargo süresi', 'Teslimat sorunu oranı'], [R('API kesintisi', 'Hata kuyruğu; 1 saat içinde yeniden dener, sonra uyarı')],
 ['Gecikmiş kargoları günlük tarar, müşteriye bilgi taslağı hazırlar.'], ['Kargo API (Yurtiçi, Aras, MNG vb.) n8n ile; sipariş durumu mağaza API\'sinden.'], None, 85)

small('WEB-14', 'Pazaryeri entegrasyonu (Trendyol, Hepsiburada, Amazon TR): ürün, stok, fiyat ve sipariş eşitlemesi.',
 ['Ürün eşleştirme ve kategori/özellik haritalama', 'Stok ve fiyat eşitlemesi', 'Sipariş aktarımı', 'Hata ve ret raporları'], ['Pazaryeri mağaza başvurusu', 'Pazaryeri reklam yönetimi'],
 [T('Eşitleme', 'Stok değişikliği 15 dk içinde pazaryerinde'), T('Sipariş aktarımı', 'Test siparişi mağaza paneline düştü')],
 [G('Pazaryeri satıcı paneli API bilgileri'), G('Fiyatlama kuralı (komisyon farkı)')],
 [S('Kategori/özellik haritalama', 'ai', 'ai_taslak', 2, None, None, 'Haritalama tablosu', 'Zorunlu özellikler dolu'), S('Fiyat kuralı onayı', 'musteri', 'insan', 2, 'butce', 'Karar hatırlatma', 'Fiyat kuralı', 'Karar kaydı'),
  S('Entegrasyon kurulumu', 'ekip', 'insan', 3, None, None, 'Eşitleme', 'Hatasız'), S('İlk eşitleme ve ret düzeltmeleri', 'ai', 'ai_taslak', 2, None, None, 'Düzeltme listesi', 'Ret sıfır')], 10,
 ['Ret oranı', 'Stok tutarsızlığı', 'Pazaryeri satış payı'], [R('Fazla satış (stok farkı)', 'Eşitleme 15 dk; kritik stokta pazaryeri adedi düşürülür')],
 ['Reddedilen ürünlerin nedenini okuyup düzeltme önerir.'], ['Pazaryeri API\'leri + mağaza API; n8n zamanlanmış eşitleme.'], None, 80)

small('WEB-15', 'E-fatura / e-arşiv entegrasyonu: siparişlerden otomatik fatura kesimi ve muhasebe aktarımı.',
 ['Entegratör bağlantısı (Paraşüt, Logo, Uyumsoft vb.)', 'Sipariş → fatura kuralları (KDV, iade)', 'Otomatik gönderim'], ['Mali müşavirlik'],
 [T('Otomatik fatura', 'Test siparişinden e-arşiv fatura oluştu ve müşteriye gitti')],
 [G('Entegratör hesabı ve API'), G('Mali müşavir onaylı KDV kuralları')],
 [S('Kural tablosu', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Kurallar', 'Mali müşavir onaylı'), S('Kurulum', 'ekip', 'insan', 2, None, None, 'Entegrasyon', 'Test faturası'),
  S('Mali müşavir onayı', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 7,
 ['Faturası eksik sipariş sayısı (0)'], [R('Yanlış KDV', 'Kurallar mali müşavir onayı olmadan canlıya alınmaz')],
 ['Günlük: faturası kesilmemiş siparişleri bulur, uyarı açar.'], ['Entegratör API + mağaza sipariş olayı (n8n).'], None, 85)

small('WEB-16', 'Sepet terk ve geri kazanım kurgusu: e-posta/WhatsApp hatırlatma serisi, teşvik kuralları ve ölçüm.',
 ['Sepet terk tespiti', '3 adımlı hatırlatma serisi', 'İndirim/teşvik kuralı', 'Gelir ölçümü'], ['Genel e-posta pazarlaması'],
 [T('Seri yayında', 'Test sepetinde 1 saat sonra ilk hatırlatma geldi'), T('Rapor', 'Geri kazanılan sepet ve gelir görünür')],
 [G('Teşvik politikası (indirim oranı)'), G('Pazarlama izni olan kişiler (İYS)', 'arvela')],
 [S('Seri kurgusu ve metinler', 'ai', 'ai_taslak', 1, None, None, 'Seri', 'Marka sesi'), S('Müşteri onayı: metin ve teşvik', 'musteri', 'insan', 2, 'butce', 'Karar hatırlatma', 'Onay', 'Karar kaydı'),
  S('Kurulum', 'ekip', 'ai_taslak', 2, None, None, 'Otomasyon', 'Yalnız izinli kişilere'), S('Test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Test raporu', 'Zamanlama doğru')], 7,
 ['Geri kazanım oranı', 'Seri başına gelir'], [R('İzinsiz ileti', 'Yalnız pazarlama onayı olanlara; İYS kontrolü')],
 ['Aylık A/B: Claude iki metin varyasyonu önerir, kazanan otomatik seçilir.'], ['Mağaza sepet olayları + n8n zamanlayıcı + e-posta/WhatsApp.'], None, 90, ['Teşvik oranını onaylar'])

small('WEB-17', 'Web uygulaması / müşteri portalı: ihtiyaç analizi, tasarım, geliştirme, test ve yayın. Sprint\'lerle yürütülür.',
 ['İhtiyaç analizi ve kullanıcı hikâyeleri', 'Veri modeli ve mimari', '2 haftalık sprint\'ler, her sprint sonunda demo', 'Otomatik testler', 'Yayın ve bakım planı'], ['Mobil uygulama mağaza yayını', 'Sınırsız değişiklik'],
 [T('Kullanıcı hikâyeleri', 'Her hikâyenin kabul ölçütü var; müşteri onaylı'), T('Çalışan uygulama', 'Kabul ölçütleri otomatik testle doğrulanıyor'), T('Teknik belge', 'Kurulum, yedek, erişim')],
 [G('İş süreçleri ve örnek veriler'), G('Kullanıcı rolleri'), G('Entegre olunacak sistemler')],
 [S('İhtiyaç analizi ve hikâyeler', 'ai', 'ai_taslak', 5, 'bilgi', 'Bilgi isteği', 'Hikâye listesi', 'Kabul ölçütleri var'), S('Müşteri onayı: kapsam ve öncelik', 'musteri', 'insan', 3, 'butce', 'Karar hatırlatma', 'Onaylı backlog', 'Karar kaydı'),
  S('Mimari ve veri modeli', 'ekip', 'ai_taslak', 3, None, None, 'Mimari notu', 'Güvenlik gözden geçirildi'), S('Sprint 1', 'ekip', 'ai_taslak', 10, None, None, 'Demo', 'Testler geçiyor'),
  S('Sprint demosu ve onay', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Sprint onayı', 'Karar kaydı'), S('Sonraki sprint\'ler', 'ekip', 'ai_taslak', 20, None, None, 'Özellikler', 'Testler'),
  S('Güvenlik ve yük testi', 'ai', 'ai_taslak', 3, None, None, 'Test raporu', 'Kritik bulgu yok'), S('Yayın ve devir', 'ekip', 'insan', 2, 'onay', None, 'Canlı uygulama', 'Belgeler tam')], 50,
 ['Sprint hedefine ulaşma oranı', 'Hata kaçağı', 'Kullanıcı memnuniyeti'], [R('Kapsam kayması', 'Backlog dışı istek otomatik ek iş teklifine döner'), R('Güvenlik', 'Kod incelemesi + bağımlılık taraması her PR\'da')],
 ['Claude hikâyeleri ve kabul ölçütlerini yazar, kodlamada Claude Code ekiple çift çalışır, her PR otomatik test ve inceleme alır (Arvela OS\'in Forge yöntemi).', 'Sprint sonunda Claude demo notu ve sürüm notunu müşteri diliyle yazar.'],
 ['Git + PR + otomatik test (GitHub Actions) + Forge benzeri onay; müşteri sprint onayını karar sayfasından verir.'], [M('openai', 'İkinci görüş kod incelemesi (isteğe bağlı)')], 55,
 ['Sprint demolarını izler ve onaylar', 'Backlog önceliğini belirler'], '2 tur / sprint')

small('WEB-18', 'API / üçüncü taraf entegrasyonu: iki sistem arasında veri akışının tasarımı, kurulumu ve izlenmesi.',
 ['Veri eşleme', 'n8n ya da kod ile entegrasyon', 'Hata kuyruğu ve uyarılar', 'İzleme panosu'], ['Karşı sistemin geliştirilmesi'],
 [T('Çalışan entegrasyon', 'Test verisi iki yönde doğru akıyor'), T('İzleme', 'Hata olunca uyarı geliyor')],
 [G('API belgeleri ve erişim'), G('Örnek veri')],
 [S('Eşleme tablosu', 'ai', 'ai_taslak', 2, None, None, 'Eşleme', 'Zorunlu alanlar'), S('Kurulum', 'ekip', 'insan', 3, None, None, 'Akış', 'Hata kuyruğu'),
  S('Test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Çift yön'), S('Müşteri onayı', 'musteri', 'insan', 1, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 8,
 ['Başarılı aktarım oranı', 'Ortalama gecikme'], [R('API değişikliği', 'Haftalık sağlık testi; şema değişince uyarı')],
 ['Hata loglarını Claude sınıflandırır ve çözüm önerisi yazar.'], ['n8n (tercihen) ya da Node servis; sırlar n8n kimlik bilgilerinde.'], None, 80)

small('WEB-19', 'PWA: sitenin telefona uygulama gibi kurulabilmesi, çevrimdışı sayfa ve isteğe bağlı bildirimler.',
 ['Manifest ve ikonlar', 'Service worker, çevrimdışı sayfa', 'İsteğe bağlı web push'], ['Mağaza (App Store/Play) yayını'],
 [T('Kurulabilir site', 'Lighthouse PWA kontrolleri geçiyor')], [G('Uygulama ikonu (Arvela tasarlayabilir)', zorunlu=False)],
 [S('Kurulum', 'ekip', 'insan', 2, None, None, 'PWA', 'Kurulabiliyor'), S('Test', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Lighthouse'), S('Müşteri onayı', 'musteri', 'insan', 1, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 5,
 ['Kurulum sayısı', 'Geri dönen ziyaretçi'], [R('Eski önbellek', 'Sürüm değişince önbellek yenilenir')], ['Claude bildirim metinlerini önerir.'], ['Workbox / elle service worker.'], None, 60)

small('WEB-20', 'Aylık bakım ve güvenlik: güncellemeler, yedek, güvenlik taraması, kesinti izleme ve aylık rapor. Arvela OS site eşitlemesiyle otomatik izlenir.',
 ['Çekirdek, eklenti, tema güncellemeleri (önce yedek)', 'Günlük güvenlik ve SSL kontrolü (Arvela OS eşitleme)', 'Haftalık yedek doğrulama', 'Kesinti izleme (5 dk)', 'Ayda 1 saate kadar küçük değişiklik', 'Aylık bakım raporu'], ['Yeni özellik geliştirme (WEB-23)', 'İçerik üretimi'],
 [T('Aylık rapor', 'Güncellemeler, açıklar, kesinti, yedek durumu tek sayfada; müşteri portalında'), T('Güncel site', 'Bilinen açığı olan eklenti yok')],
 [G('Yönetici erişimi (Hostinger hesabı Arvela\'da ise gerekmez)', zorunlu=False)],
 [S('Her sabah: site durumu eşitlemesi', 'ai', 'tam', 1, None, 'Acil site uyarısı', 'SSL, sürüm, açık durumu', 'Acil durumda Bugün\'e uyarı'),
  S('Haftalık: güncelleme penceresi (yedek → güncelle → kontrol)', 'ekip', 'ai_taslak', 1, None, None, 'Güncelleme kaydı', 'Site açılıyor, hata yok'),
  S('Haftalık: yedek doğrulama', 'ai', 'tam', 1, None, None, 'Yedek raporu', 'Son yedek 7 günden yeni'),
  S('Ay sonu: bakım raporu', 'ai', 'tam', 1, None, 'Haftalık durum özeti', 'Rapor', 'Portalda yayında'),
  S('Büyük güncellemede müşteri onayı (ör. ana sürüm)', 'musteri', 'insan', 2, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 30,
 ['Kesinti süresi (dk/ay)', 'Açığı olan eklenti sayısı (0)', 'Güncelleme gecikmesi'], [R('Güncelleme siteyi bozar', 'Önce yedek, sonra güncelleme, ardından otomatik kontrol; bozulursa geri yükleme'), R('Müşteri eklenti ekliyor', 'Eşitlemede yeni eklenti görülünce not düşer')],
 ['Arvela OS her sabah Hostinger\'dan sürüm, SSL ve açık bilgisini çeker; Claude öncelik sırası çıkarır.', 'Güncelleme sonrası Claude siteyi dışarıdan kontrol eder (ana sayfa, form, ödeme) ve raporu yazar.', 'Aylık raporu müşteri diliyle yazar; aksiyon gerektiren bir şey yoksa "her şey yolunda" der.'],
 ['Arvela OS site eşitlemesi (deploy/site_sync.py) + Hostinger API (maintain-wordpress becerileri).', 'Kesinti izleme: n8n 5 dk HTTP kontrolü; 2 hata üst üste → acil uyarı.'], None, 85, ['Aylık bakım raporunu görür', 'Büyük güncellemeleri onaylar'])

small('WEB-21', 'Hosting yönetimi + SSL + CDN: sunucu, alan adı, e-posta DNS kayıtları, SSL yenileme ve CDN ayarları.',
 ['Hosting planı ve kaynak izleme', 'Alan adı ve DNS yönetimi (e-posta kayıtları korunur)', 'SSL ve otomatik yenileme', 'CDN ve önbellek'], ['Sunucu donanımı', 'E-posta kutusu yönetimi (ayrı)'],
 [T('Yenilemeler takipte', 'Alan adı/SSL/hosting bitişleri Arvela OS\'te; 30 gün önce uyarı'), T('DNS belgesi', 'Tüm kayıtlar ve amaçları yazılı')],
 [G('Alan adı ve hosting erişimi')],
 [S('Envanter: alan adı, DNS, SSL, hosting', 'ai', 'tam', 1, 'bilgi', 'Bilgi isteği', 'Envanter', 'Bitiş tarihleri kayıtlı'), S('Aylık: kaynak ve yenileme kontrolü', 'ai', 'tam', 1, None, None, 'Kontrol raporu', 'Yaklaşan bitişler'),
  S('Yenileme kararı (ücretli)', 'musteri', 'insan', 7, 'butce', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 30,
 ['Kaçan yenileme (0)', 'SSL hatası (0)'], [R('Alan adı süresi dolar', '60/30/7 gün önce karar kaydı ve uyarı')],
 ['Claude DNS değişikliklerinden önce mevcut kayıtları belgeler (e-posta kesintisini önlemek için).'], ['Hostinger API (domains, DNS, hosting); değişiklik yalnız ekip onayıyla.'], None, 85, ['Yenileme kararlarını verir'])

small('WEB-22', 'Hız optimizasyonu (Core Web Vitals): ölçüm, iyileştirme ve önce/sonra raporu.',
 ['Başlangıç ölçümü (mobil/masaüstü)', 'Görsel, önbellek, kod iyileştirmeleri', 'Önce/sonra raporu'], ['Yeniden tasarım', 'Sunucu taşıma'],
 [T('İyileşme', 'Mobil LCP < 2.5 sn ya da başlangıca göre en az %30 iyileşme')], [G('Yönetici erişimi')],
 [S('Ölçüm ve darboğaz analizi', 'ai', 'tam', 1, None, None, 'Analiz', 'Öncelikli 5 madde'), S('İyileştirmeler', 'ekip', 'ai_taslak', 3, None, None, 'Değişiklikler', 'Yedek alındı'),
  S('Tekrar ölçüm ve rapor', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Önce/sonra', 'Hedef sağlandı'), S('Müşteri onayı', 'musteri', 'insan', 1, 'onay', 'Karar hatırlatma', 'Onay', 'Karar kaydı')], 7,
 ['LCP, INP, CLS'], [R('Görsel kalite düşer', 'Sıkıştırma önce/sonra örnekleri onaya sunulur')], ['Claude PageSpeed çıktısını okuyup önceliklendirir.'], ['PageSpeed Insights API; önbellek/CDN Hostinger ayarları.'], None, 70)

small('WEB-23', 'Aylık geliştirme saati paketi: küçük değişiklikler ve yeni bölümler için ayrılmış saat havuzu; harcama şeffaf.',
 ['Aylık saat havuzu', 'Talep → tahmin → onay → iş akışı', 'Harcanan süre kaydı ve rapor'], ['Büyük projeler (ayrı teklif)'],
 [T('Şeffaf harcama', 'Her talebin tahmini ve gerçek süresi portalda')], [G('Talepler (portal ya da e-posta)')],
 [S('Talebi al ve netleştir', 'ai', 'ai_taslak', 1, 'bilgi', 'Bilgi isteği', 'Netleşmiş talep', 'Kabul ölçütü var'), S('Süre tahmini ve onay', 'musteri', 'insan', 1, 'butce', 'Karar hatırlatma', 'Onay', 'Karar kaydı'),
  S('Uygulama', 'ekip', 'insan', 2, None, None, 'Değişiklik', 'Kabul ölçütü'), S('Kontrol ve kapanış', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Kapanış notu', 'Süre kaydı')], 30,
 ['Tahmin isabeti', 'Talep kapanış süresi', 'Havuz kullanım oranı'], [R('Havuz aşımı', 'Havuz %80\'de uyarı; aşım ek onayla')],
 ['Claude e-posta/WhatsApp talebini okuyup görev, kabul ölçütü ve süre tahmini taslağı çıkarır.'], ['Süre kaydı Arvela OS iş paketlerindeki gibi; aylık rapor otomatik.'], None, 70, ['Talep açar, tahmini onaylar, harcanan saati görür'])

small('WEB-24', 'KVKK / GDPR site uyum paketi: aydınlatma metni, çerez politikası ve onay yönetimi, form metinleri, saklama ayarları.',
 ['Site veri envanteri (formlar, çerezler, araçlar)', 'Aydınlatma metni ve çerez politikası taslağı (hukukçu onayına)', 'Çerez onay yönetimi (reddet/kabul eşit)', 'Form metinleri ve pazarlama onayı (İYS)'], ['Hukuki danışmanlık ve temsil', 'VERBİS kaydı'],
 [T('Çerez onayı', 'Onaydan önce analitik/reklam kodu yüklenmiyor'), T('Metinler', 'Hukukçu onaylı ve sitede yayında'), T('Envanter', 'Her araç ve amacı listede')],
 [G('Şirket unvanı, adres, MERSİS'), G('Kullanılan araçlar listesi', 'arvela'), G('Hukukçu onayı')],
 [S('Site taraması: çerez ve araç envanteri', 'ai', 'tam', 1, None, None, 'Envanter', 'Tüm çerezler'), S('Metin taslakları', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'Taslaklar', 'Envanterle uyumlu'),
  S('Hukukçu ve müşteri onayı', 'musteri', 'insan', 5, 'onay', 'Karar hatırlatma', 'Onaylı metinler', 'Karar kaydı'), S('Onay yönetimi kurulumu', 'ekip', 'insan', 1, None, None, 'Çerez onayı', 'Eşit seçenekler'),
  S('Doğrulama taraması', 'ai', 'tam', 1, None, 'Kabul ön kontrolü', 'Rapor', 'Onaysız kod yüklenmiyor')], 10,
 ['Onaysız yüklenen çerez (0)', 'Onay oranı'], [R('Hukuki sorumluluk', 'Arvela taslak hazırlar; yayın hukukçu onayı olmadan yapılmaz')],
 ['Claude site taramasından envanteri ve metin taslaklarını çıkarır (Arvela\'nın kendi KVKK metinleri şablon).'], ['Tarayıcı ile çerez taraması (n8n + headless), onay öncesi/sonrası karşılaştırma.'], None, 70, ['Metinleri onaylar'])

out = {code: {**v, 'v': 1} for code, v in P.items()}
dst = os.path.join(os.path.dirname(__file__), '..', 'app', 'playbooks.json')
json.dump(out, open(dst, 'w'), ensure_ascii=False, indent=1)
open(dst, 'a').write('\n')
print(len(out), 'hizmet kitabı', os.path.getsize(dst), 'bayt')
