# Proje Yönetimi hizmet kitapları (PM-01 … PM-06). PM-06 aynı zamanda yeni müşteri karşılamasını (n8n "Yeni müşteri" akışı) içerir.
from playbooks_web import S, T, G, R, M, small, aylik

H = 'Karar hatırlatma'

aylik('PM-01', 'Dış kaynak dijital proje yönetimi: müşterinin dijital projelerinin planlanması, ekip ve tedarikçi takibi, risk yönetimi ve haftalık raporlama.',
 ['Proje planı ve takvim yönetimi', 'Haftalık durum toplantısı', 'Ekip/tedarikçi görev takibi', 'Risk ve değişiklik yönetimi', 'Haftalık durum raporu'], ['Proje işlerinin kendisi (tasarım, geliştirme vb.)', 'Sözleşme ve hukuki işler'],
 [T('Güncel plan', 'Her hafta güncel; kritik yol belli'), T('Haftalık rapor', 'Pazartesi 10:00; biten, sıradaki, risk, karar bekleyen'), T('Değişiklik kaydı', 'Her kapsam değişikliği onaylı')],
 [G('Proje paydaşları ve tedarikçiler'), G('Mevcut plan ve sözleşmeler')],
 [S('Ayın planı ve öncelikler', 'ai', 'ai_taslak', 2, None, None, 'Aylık plan', 'Kilometre taşları'),
  S('Müşteri onayı: öncelikler', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Haftalık toplantılar ve takip', 'ekip', 'insan', 20, None, None, 'Notlar, aksiyonlar', 'Her hafta'),
  S('Haftalık raporlar', 'ai', 'ai_taslak', 4, None, None, 'Raporlar', 'Zamanında'),
  S('Ay sonu değerlendirme', 'musteri', 'insan', 2, 'secim', H, 'Gelecek ay kararı', 'Karar kaydı var')],
 ['Zamanında biten kilometre taşı oranı', 'Bütçe sapması', 'Açık risk sayısı'], [R('Tedarikçi yanıt vermez', 'Yükseltme kuralı sözleşmede; haftalık raporda görünür')],
 ['Claude toplantı notlarından aksiyonları çıkarır, gecikme riskini hesaplar ve haftalık raporu yazar.'], ['Proje Arvela OS\'te; tedarikçilere freelancer/iş paketi erişimi verilebilir.'], None, 60)

small('PM-02', 'Proje kurulumu: hedef, kapsam, plan, roller, iletişim düzeni ve proje alanının (Arvela OS) hazırlanması.',
 ['Başlangıç toplantısı', 'Kapsam ve teslimat tanımı', 'Plan, kilometre taşları ve RACI', 'İletişim planı', 'Arvela OS proje alanı ve portal erişimi'], ['Proje yürütme (PM-01)', 'İşin kendisi'],
 [T('Proje tüzüğü', 'Hedef, kapsam, kapsam dışı, bütçe, riskler'), T('Plan', 'Görevler, tarihler, sorumlular'), T('Proje alanı', 'Paydaşlar giriş yaptı')],
 [G('Paydaş listesi'), G('Bütçe ve hedef tarih'), G('Mevcut belgeler', zorunlu=False)],
 [S('Ön bilgi', 'ai', 'tam', 2, 'bilgi', 'Bilgi isteği', 'Bilgi formu', 'Paydaşlar belli'),
  S('Başlangıç toplantısı', 'ekip', 'insan', 1, None, None, 'Toplantı notu', 'Hedefler yazılı'),
  S('Tüzük ve plan taslağı', 'ai', 'ai_taslak', 3, None, None, 'Tüzük + plan', 'Kapsam dışı yazılı'),
  S('Müşteri onayı: tüzük', 'musteri', 'insan', 3, 'onay', H, 'Onaylı tüzük', 'Karar kaydı var'),
  S('Proje alanı kurulumu', 'ekip', 'insan', 1, None, 'Kabul ön kontrolü', 'Proje alanı', 'Erişimler açık')], 10,
 ['Kapsam değişikliği sayısı (ilk 30 gün)', 'Plana uyum'], [R('Kapsam belirsiz', 'Tüzük onaylanmadan iş başlamaz')],
 ['Claude toplantı notundan tüzük ve plan taslağı çıkarır.'], ['Proje Arvela OS\'te hizmet kitabıyla açılır.'], None, 60)

aylik('PM-03', 'Tedarikçi ve ajans koordinasyonu: birden fazla tedarikçinin teslimlerini, iletişimini ve kalite kontrolünü tek noktadan yönetme.',
 ['Tedarikçi teslim takvimi', 'Brif ve kabul kontrolü', 'Haftalık koordinasyon', 'Fatura/hakediş kontrolü'], ['Tedarikçi seçimi (DAN-03)', 'Sözleşme müzakeresi'],
 [T('Teslim takibi', 'Her teslim kabul ölçütüne göre kontrol'), T('Aylık özet', 'Tedarikçi bazında zamanında teslim ve kalite')],
 [G('Tedarikçi listesi ve sözleşmeler')],
 [S('Teslim takvimi', 'ai', 'ai_taslak', 2, None, None, 'Takvim', 'Tüm tedarikçiler'),
  S('Brif ve kabul ölçütleri', 'ekip', 'insan', 3, None, None, 'Brifler', 'Ölçülebilir'),
  S('Teslim kontrolleri', 'ekip', 'ai_taslak', 20, None, 'Kabul ön kontrolü', 'Kontrol notları', 'Ret gerekçeli'),
  S('Aylık değerlendirme', 'musteri', 'insan', 2, 'secim', H, 'Kararlar', 'Karar kaydı var')],
 ['Zamanında teslim oranı', 'Ret oranı'], [R('Sorumluluk belirsiz', 'RACI ve tek iletişim kanalı')],
 ['Claude teslimleri brif ve kabul ölçütleriyle karşılaştırıp ön kontrol notu yazar.'], ['Tedarikçilere Arvela OS iş paketi erişimi.'], None, 55)

small('PM-04', 'Yönetim panosu ve otomatik raporlama: projelerin durum, bütçe ve risklerini gösteren pano ve haftalık otomatik özet.',
 ['Proje KPI\'ları ve pano', 'Veri bağlantıları (Arvela OS, tablolar, Jira vb.)', 'Haftalık özet e-postası'], ['Veri ambarı', 'Kaynak sistem düzeltmesi'],
 [T('Pano', 'Günlük güncel'), T('Haftalık özet', 'Pazartesi otomatik')], [G('KPI\'lar ve kaynak erişimleri')],
 [S('KPI tanımı', 'ai', 'ai_taslak', 2, 'bilgi', 'Bilgi isteği', 'KPI listesi', 'Tanımlı'),
  S('Müşteri onayı: KPI', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Pano ve bağlantılar', 'ekip', 'insan', 4, None, None, 'Pano', 'Veri doğru'),
  S('Doğrulama ve teslim', 'musteri', 'insan', 2, 'onay', H, 'Kabul', 'Karar kaydı var')], 10,
 ['Pano kullanım sıklığı'], [R('Veri tanımları farklı', 'KPI sözlüğü panoda')],
 ['Claude haftalık özette dikkat gerektiren projeleri öne çıkarır.'], ['Arvela OS API + n8n; pano Arvela OS ya da Looker Studio.'], None, 65)

small('PM-05', 'Çevik süreç kurulumu ve eğitim: ekibe uygun Scrum/Kanban düzeni, toplantı ritmi, panolar ve iki sprintlik koçluk.',
 ['Mevcut çalışma biçimi analizi', 'Süreç tasarımı (rol, toplantı, pano)', '1 günlük eğitim', '2 sprint koçluk'], ['Araç lisansları', 'Sürekli Scrum Master hizmeti'],
 [T('Süreç kılavuzu', 'Roller, ritim, tanımlar (hazır/bitti)'), T('Pano', 'Ekip kendi kullanıyor'), T('Koçluk notları', '2 sprint retrospektifi')],
 [G('Ekip listesi ve mevcut araçlar')],
 [S('Analiz', 'ekip', 'insan', 3, 'bilgi', 'Bilgi isteği', 'Analiz notu', 'Darboğazlar'),
  S('Süreç tasarımı', 'ai', 'ai_taslak', 2, None, None, 'Kılavuz taslağı', 'Ekibe uygun'),
  S('Müşteri onayı: süreç', 'musteri', 'insan', 2, 'onay', H, 'Onay', 'Karar kaydı var'),
  S('Eğitim günü', 'ekip', 'insan', 1, None, None, 'Eğitim', 'Uygulamalı'),
  S('2 sprint koçluk', 'ekip', 'insan', 20, None, None, 'Koçluk notları', 'Retrospektifler'),
  S('Kapanış ve kabul', 'musteri', 'insan', 2, 'onay', H, 'Kabul', 'Karar kaydı var')], 30,
 ['Sprint hedefi tutturma', 'Döngü süresi'], [R('Ekip direnç gösterir', 'Küçük başlangıç; ekibin seçtiği tek iyileştirme')],
 ['Claude retrospektif notlarını özetler, tekrar eden engelleri çıkarır.'], ['Pano Arvela OS projesi ya da ekibin aracı.'], None, 40)

aylik('PM-06', 'Arvela OS müşteri çalışma alanı ve yeni müşteri karşılaması: portal hesabı, karşılama e-postası, bilgi istekleri, karar bağlantıları ve aylık özet.',
 ['Karşılama: portal hesabı, hoş geldin e-postası (n8n "Yeni müşteri" akışı)', 'İlk bilgi ve erişim istekleri (karar kaydı olarak)', 'Proje ve kararların portalda izlenmesi', 'Aylık özet e-postası'], ['Proje işleri (ilgili hizmet kitapları)', 'Özel yazılım geliştirme'],
 [T('Aktif portal', 'Müşteri ilk hafta giriş yaptı'), T('Karşılama tamam', 'Bilgi ve erişim istekleri yanıtlandı'), T('Aylık özet', 'Ay başında e-postayla')],
 [G('Müşteri yetkilisi ad, e-posta, telefon'), G('Fatura ve şirket bilgileri')],
 [S('Hoş geldin e-postası ve portal hesabı', 'ai', 'tam', 1, None, 'Yeni müşteri', 'Portal hesabı', 'E-posta gitti'),
  S('Bilgi ve erişim istekleri', 'musteri', 'insan', 5, 'bilgi', H, 'Bilgiler ve erişimler', 'Karar kaydı var'),
  S('Karşılama görüşmesi (20 dk)', 'ekip', 'insan', 2, None, None, 'Görüşme notu', 'Portal birlikte gezildi'),
  S('Portal kullanım takibi', 'ai', 'tam', 20, None, None, 'Kullanım', 'Giriş var'),
  S('Aylık özet', 'ai', 'tam', 2, None, None, 'Özet e-postası', 'Gönderildi')],
 ['İlk hafta portal girişi', 'Bilgi isteklerinin yanıt süresi', 'Aylık portal kullanımı'],
 [R('Müşteri portala girmez', 'Karar bağlantıları şifresiz (kodla doğrulama); e-posta özetleri'), R('Erişim bilgileri e-postayla dolaşır', 'Erişimler yalnız portaldan, şifre yöneticisi önerisiyle')],
 ['Claude müşteri kaydından karşılama e-postasını ve bilgi istek listesini kişiselleştirir; aylık özeti yazar.'], ['n8n "Yeni müşteri" ve "E-posta gönderici" akışları; Arvela OS portal ve karar bağlantıları.'], None, 85,
 ['Projelerini, kararlarını, faturalarını ve sitelerini tek yerden görür'])
