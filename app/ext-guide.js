// Arvela OS — sayfa rehberi: her sayfada "Bu sayfa ne işe yarar" ve "Sonra ne olur", her bölümde kısa açıklama.
// Sistemi ilk kez kullanan kişi hangi düğmeye bastığında ne olacağını buradan anlar. Rehber kişi başına gizlenebilir.
// Metinler [Türkçe, İngilizce] çiftidir; sayfa diline göre seçilir.

const P = (m, ne, sonra) => ({ m, ne, sonra });
export const PAGES = [
  // ----- ekip -----
  P(/^\/panel$/, ['Günün işleri önem sırasıyla burada: acil siteler, sıra size gelen aşamalar, bekleyen onaylar, ödemeler ve sıcak adaylar. En üstteki kart en önemlisidir.', 'Today\'s work in order of importance: urgent sites, stages that are now yours, pending approvals, payments and hot leads. The top card matters most.'],
    ['Karttaki düğmeye basınca ilgili kayda gidersiniz. İşi bitirince (ör. görevi "Bitti" yapınca) kart kendiliğinden kalkar ve sıradaki iş öne gelir.', 'A card\'s button takes you to the record. When you finish (e.g. set the task to "Done") the card disappears and the next one moves up.']),
  P(/^\/satis$/, ['Satış hattı: web formundan, WhatsApp\'tan ya da elle gelen adaylar aşamalara göre sıralanır.', 'Sales pipeline: leads from the web form, WhatsApp or manual entry, grouped by stage.'],
    ['Adayı açıp ön görüşme saati, sonraki adım ve notları girin. "Kazanıldı" yaptığınızda aday müşteriye dönüşür; teklif ve proje açabilirsiniz.', 'Open a lead to set the call time, next step and notes. Marking it "Won" turns it into a client so you can open a quote and a project.']),
  P(/^\/satis\/\d+$/, ['Bir adayın bütün bilgisi: iletişim, ilgi alanı, skor, görüşme geçmişi ve sonraki adım.', 'Everything about one lead: contact, interest, score, call history and next step.'],
    ['Sonraki adım tarihini girerseniz o gün Bugün\'e düşer. Aşamayı "Kazanıldı" yapınca müşteri kaydı açılır; "Kaybedildi" seçerseniz neden kaydedilir.', 'If you set a next-step date it shows up on Today that day. "Won" creates the client; "Lost" records the reason.']),
  P(/^\/musteriler$/, ['Tüm müşteriler ve durumları. Yeni müşteriyi buradan ekleyebilirsiniz.', 'All clients and their status. You can add a new client here.'],
    ['Müşteriyi açınca hizmetlerini, projelerini, sitelerini ve onaylarını görürsünüz. Yeni müşteri eklenince n8n karşılama akışı (bağlıysa) çalışır.', 'Opening a client shows services, projects, sites and approvals. Adding a client triggers the n8n welcome flow if connected.']),
  P(/^\/musteriler\/\d+$/, ['Müşterinin tek sayfalık özeti: hizmetleri, projeleri, onayları, siteleri ve portal kullanıcıları.', 'One-page summary of a client: services, projects, approvals, sites and portal users.'],
    ['Hizmet eklediğinizde katalogdaki hizmet kitabı müşteriye kopyalanır ve ona özel düzenlenebilir. Proje açıp "Hizmetten başlat" derseniz aşamalar görev olarak açılır. Portal kullanıcısı eklerseniz müşteri kendi panelinden takip eder ve karar verir.', 'Adding a service copies its playbook to the client, where it can be tailored. Open a project and use "Start from a service" to create the stages as tasks. Add a portal user so the client can follow and decide in their own panel.']),
  P(/^\/musteriler\/\d+\/siteler$/, ['Bu müşterinin siteleri: SSL, WordPress sürümü ve bilinen açıklar.', 'This client\'s sites: SSL, WordPress version and known vulnerabilities.'],
    ['Durumlar Hostinger eşitlemesiyle güncellenir. Bir site "Acil" olursa Bugün\'e kart düşer ve n8n site uyarısı gönderilir.', 'Statuses update with the Hostinger sync. If a site becomes "Urgent" a card appears on Today and n8n sends a site alert.']),
  P(/^\/musteriler\/\d+\/karar$/, ['Müşterinin giriş yapmadan karar vermesi için e-posta doğrulamalı bağlantı. Bağlantı müşterinin bekleyen tüm kararlarını gösterir.', 'An email-verified link so the client can decide without signing in. It shows all of the client\'s pending decisions.'],
    ['"E-postayla gönder" bağlantıyı müşteriye yollar; "Bağlantıyı oluştur" WhatsApp\'tan paylaşmanız için bir kez gösterir. Müşteri açınca e-postasına 6 haneli kod gider; kodla doğrulayıp karar verir. Karar onayda, müşteri geçmişinde ve bağlı aşamada kayıt olur, akış ilerler.', '"Send by email" mails the link to the client; "Create link" shows it once so you can share it on WhatsApp. When the client opens it, a 6-digit code goes to their email; after verifying they decide. The decision is recorded on the approval, the client history and the linked stage, and the flow moves on.']),
  P(/^\/ayarlar\/yapay-zeka$/, ['Claude bağlantısının ayarları: açık/kapalı, otomatik taslak, model ve kişisel veri kuralı.', 'Claude connection settings: on/off, automatic drafts, model and the personal-data rule.'],
    ['Açınca yapay zekâ aşamaları açıldığında Claude taslak hazırlar (n8n üzerinden); taslak görevin notlarına düşer ve görev "İncelemede" olur. SS-2 kutusu işaretli değilken müşteri adı ve iletişim bilgileri maskelenir.', 'When on, Claude drafts each AI stage as it opens (via n8n); the draft lands in the task notes and the task moves to "In review". Until the SS-2 box is ticked, client names and contact details are masked.']),
  P(/^\/yapay-zeka\/\d+$/, ['Bir yapay zekâ işinin ayrıntısı: gönderilen istem ve gelen sonuç.', 'One AI job: the prompt sent and the result received.'], ['Sonucu kontrol edip görevde düzeltin; uygunsa görevi "Bitti" yapın, akış ilerler.', 'Check the result and fix it in the task; if it fits, set the task to "Done" and the flow moves on.']),
  P(/^\/ayarlar\/kararlar$/, ['Müşteri kararlarıyla ilgili ayarlar.', 'Settings for client decisions.'], ['Otomatik e-posta açıksa her yeni onay isteğinde müşteriye karar bağlantısı gider (n8n "E-posta gönderici" akışı etkin olmalı).', 'With automatic email on, every new approval request sends the client a decision link (the n8n "Email sender" workflow must be active).']),
  P(/^\/projeler$/, ['Tüm projeler, ilerlemeleri ve teslim tarihleri.', 'All projects with progress and due dates.'],
    ['Yeni proje açtıktan sonra proje sayfasında "Hizmetten başlat" ile hizmet kitabının aşamalarını görev olarak açın; akış ilk aşamadan kendiliğinden başlar.', 'After creating a project, use "Start from a service" on its page to create the playbook stages as tasks; the flow starts at the first stage by itself.']),
  P(/^\/projeler\/\d+$/, ['Projenin kontrol merkezi. Üstteki "Sıradaki adım" kartı şu an kimin neyi yapması gerektiğini söyler; altta görev panosu, onaylar ve proje bilgileri var.', 'The project control centre. The "Next step" card on top says who needs to do what right now; below are the task board, approvals and project details.'],
    ['Bir aşama "Bitti" olunca sıradaki açılır ve sorumlusuna bildirim gider. Müşteri kararı aşamasında onay isteği kendiliğinden müşteriye gider; onaylanınca akış ilerler, düzeltme istenirse önceki aşama müşterinin notuyla yeniden açılır. Son aşama bitince proje "Onayda" olur.', 'When a stage is "Done" the next one opens and its owner is notified. At a client-decision stage an approval request goes to the client automatically; approval moves the flow on, a revision request reopens the previous stage with the client\'s note. When the last stage is done the project moves to "In approval".']),
  P(/^\/projeler\/\d+\/kitap$/, ['Bu projeye özel hizmet kitabı: kapsam, aşamalar, kabul ölçütleri ve yapay zekâ yöntemi.', 'The playbook for this project only: scope, stages, acceptance criteria and AI method.'],
    ['Burada yaptığınız değişiklik yalnız bu projede geçerlidir; katalog ve müşteri kitabı değişmez. Açılmış görevler değişmez; yeni aşama gerekiyorsa projeye görev ekleyin.', 'Changes here apply to this project only; the catalogue and client playbook stay as they are. Existing tasks do not change; add a task if you need a new stage.']),
  P(/^\/gorev\/\d+$/, ['Bir görevin ayrıntısı: ne yapılacak, kim yapacak, ne zamana, notlar.', 'One task in detail: what, who, by when, and notes.'],
    ['Durumu "Bitti" yaptığınızda görev hizmet kitabının bir aşamasıysa sıradaki aşama açılır ve sorumlusuna haber gider. Sorumluyu değiştirirseniz yeni kişiye bildirim gider. Notlar müşteriye görünmez.', 'Setting the status to "Done" opens the next stage if this task is a playbook stage, and notifies its owner. Changing the owner notifies the new person. Notes are not visible to the client.']),
  P(/^\/gorevler$/, ['Size (ya da seçtiğiniz kişiye) atanan görevler. "Sırada" rozeti, önceki aşaması bitmiş ve şimdi sizi bekleyen işleri gösterir.', 'Tasks assigned to you (or the person you pick). The "Up next" badge marks work whose previous stage is done and is now waiting for you.'],
    ['Durumu listeden değiştirebilirsiniz; "Bitti" dediğinizde akış sıradaki aşamaya geçer.', 'Change the status right in the list; "Done" moves the flow to the next stage.']),
  P(/^\/onaylar$/, ['Müşteriden beklenen tüm kararlar. Akıştaki müşteri kararı aşamaları buraya kendiliğinden düşer.', 'Every decision expected from clients. Client-decision stages from the flow arrive here automatically.'],
    ['Müşteri portaldan karar verir. Kararı telefonda ya da WhatsApp\'ta aldıysanız onayı açıp "Müşteri onayladı" ya da "Düzeltme istedi" ile işleyin; bağlı aşama buna göre ilerler.', 'Clients decide in the portal. If you got the decision by phone or WhatsApp, open the approval and record it; the linked stage moves on accordingly.']),
  P(/^\/onaylar\/\d+$/, ['Bir onay isteğinin içeriği ve kararı.', 'One approval request and its decision.'],
    ['"Müşteri onayladı" derseniz bağlı aşama biter ve sıradaki açılır. "Düzeltme istedi" derseniz önceki aşama notla yeniden açılır; o bitince yeni onay isteği kendiliğinden gider.', '"Client approved" completes the linked stage and opens the next. "Asked for changes" reopens the previous stage with the note; when it is done a new request is sent automatically.']),
  P(/^\/siteler$/, ['Hostinger\'daki tüm siteler ve sağlık durumları.', 'All sites on Hostinger and their health.'],
    ['Siteyi bir müşteriye bağlarsanız müşteri portalında görünür. "Acil" siteler Bugün\'e düşer; bakım teklifi hazırlayabilirsiniz.', 'Linking a site to a client shows it in the client portal. "Urgent" sites appear on Today; you can prepare a maintenance quote.']),
  P(/^\/paketler$/, ['Freelancer\'lara verilen iş paketleri: kapsam, ücret şekli, süre ve durum.', 'Work packages given to freelancers: scope, pay type, time and status.'],
    ['Paketi açınca freelancer\'a görünür. Freelancer süre girer ve "İncelemeye gönder" der; siz kabul edince ödeme bakiyesine eklenir.', 'Once opened the package is visible to the freelancer. They log time and send it for review; when you accept it, the amount is added to their balance.']),
  P(/^\/paketler\/\d+$/, ['Bir iş paketinin ayrıntısı, süre kayıtları ve ödemeleri.', 'One work package with its time entries and payments.'],
    ['Durum adımları: Taslak → Açık → Çalışılıyor → İncelemede → Kabul edildi. Kabulden sonra Freelancer ödemeleri sayfasında bakiye oluşur.', 'Status steps: Draft → Open → In progress → In review → Accepted. After acceptance the balance appears on the freelancer payments page.']),
  P(/^\/odemeler$/, ['Freelancer\'lara borç ve yapılan ödemeler.', 'What is owed to freelancers and what has been paid.'],
    ['Ödeme kaydettiğinizde bakiye düşer ve kayıt pakete bağlanır.', 'Recording a payment lowers the balance and links it to the package.']),
  P(/^\/katalog$/, ['Arvela\'nın tüm hizmetleri ve paketleri, fiyatlarıyla. Teklif ve faturalar bu listeden beslenir.', 'All Arvela services and packages with prices. Quotes and invoices draw on this list.'],
    ['Hizmet adına tıklayınca hizmet kitabı açılır: kapsam, aşamalar, yapay zekâ ile nasıl yönetileceği. Kitapta yaptığınız değişiklik yeni müşteri ve projelere kopyalanır.', 'Click a service to open its playbook: scope, stages and how AI runs it. Changes you make are copied to new clients and projects.']),
  P(/^\/katalog\/\d+$/, ['Hizmet kitabı: bu hizmet nasıl teslim edilir, hangi aşamada kim çalışır, nerede müşteri kararı gerekir ve yapay zekâ neyi yapar.', 'The playbook: how this service is delivered, who works at each stage, where the client decides and what AI does.'],
    ['Düzenleyip kaydettiğinizde sonraki müşteri ve projeler bu sürümle başlar; daha önce kopyalanmış kitaplar değişmez.', 'Once saved, future clients and projects start from this version; playbooks already copied stay as they are.']),
  P(/^\/hizmet\/\d+\/kitap$/, ['Bu müşteriye özel hizmet kitabı.', 'The playbook for this client only.'],
    ['Bu müşteri için açılan yeni projeler bu kitapla başlar. "Katalogdaki haline dön" ile özelleştirmeyi kaldırabilirsiniz.', 'New projects for this client start from this playbook. "Reset to catalogue" removes the customisation.']),
  P(/^\/teklifler$/, ['Teklifler: taslak, gönderilen, kabul ve ret.', 'Quotes: draft, sent, accepted and declined.'],
    ['Taslağı açıp kalemleri katalogdan ekleyin ve "Gönder" deyin; teklif müşterinin portalına düşer. Müşteri kabul edince hizmetler müşteriye eklenir.', 'Open a draft, add items from the catalogue and press "Send"; the quote appears in the client portal. When the client accepts, the services are added to the client.']),
  P(/^\/teklifler\/\d+$/, ['Bir teklifin kalemleri, toplamı ve durumu.', 'One quote with its items, total and status.'],
    ['Gönderdikten sonra kalemler kilitlenir. Müşteri portaldan kabul ya da ret verir; karar burada ve Bugün\'de görünür.', 'Items lock once sent. The client accepts or declines in the portal; the decision shows here and on Today.']),
  P(/^\/faturalar$/, ['Faturalar ve ödeme durumları. Aylık hizmetlerin faturaları tek tuşla açılır.', 'Invoices and payment status. Monthly service invoices are created in one click.'],
    ['Faturayı gönderince müşterinin portalına düşer. Müşteri "Ödedim" derse Bugün\'e kart gelir; havaleyi kontrol edip ödendi işaretleyin.', 'Sent invoices appear in the client portal. If the client reports payment, a card appears on Today; check the transfer and mark it paid.']),
  P(/^\/faturalar\/ayarlar$/, ['Fatura ayarları: banka bilgileri, KDV ve numara biçimi.', 'Invoice settings: bank details, VAT and numbering.'], ['Değişiklik yeni faturalarda geçerli olur.', 'Changes apply to new invoices.']),
  P(/^\/faturalar\/\d+$/, ['Bir faturanın kalemleri, vadesi ve ödemesi.', 'One invoice with items, due date and payment.'],
    ['Ödeme girildiğinde fatura "Ödendi" olur ve müşteri nabzı güncellenir.', 'Recording the payment marks it paid and updates the client pulse.']),
  P(/^\/otomasyonlar$/, ['Arvela OS\'ta olan her şey (yeni aday, görev, onay, fatura) n8n\'e olay olarak gönderilir. Bağlantılar, API anahtarları ve gönderim geçmişi burada.', 'Everything in Arvela OS (new lead, task, approval, invoice) is sent to n8n as an event. Connections, API keys and delivery history live here.'],
    ['Bir olay oluşunca eşleşen webhook\'a gönderilir; başarısız olursa 30 sn ve 2 dk sonra yeniden denenir. n8n de API anahtarıyla Arvela OS\'a kayıt yazabilir.', 'When an event happens it is sent to matching webhooks; failures are retried after 30 s and 2 min. n8n can also write back with an API key.']),
  P(/^\/ekip$/, ['Ekip üyeleri, freelancer\'lar ve rolleri.', 'Team members, freelancers and their roles.'],
    ['Yeni kişi ekleyince giriş bilgisiyle sisteme girer. Freelancer yalnız kendine atanan görev ve paketleri görür.', 'New people sign in with the details you set. Freelancers only see tasks and packages assigned to them.']),
  P(/^\/forge$/, ['Arvela OS güncellemeleri. Claude\'un hazırladığı her değişiklik testleri geçince burada onayınızı bekler.', 'Arvela OS updates. Every change Claude prepares waits here for your approval once its tests pass.'],
    ['"Onayla ve yayına al" derseniz değişiklik birleştirilir ve birkaç dakikada canlıya çıkar. Testler geçmeden düğme açılmaz.', '"Approve and deploy" merges the change and it goes live within minutes. The button stays off until tests pass.']),
  P(/^\/kayitlar$/, ['Sistemde yapılan her işlemin kaydı: kim, ne zaman, ne yaptı.', 'A record of every action: who did what and when.'], ['Kayıtlar Veri saklama ayarına göre süre dolunca silinir.', 'Records are deleted when the retention period set in Data retention runs out.']),
  P(/^\/veri-saklama$/, ['KVKK için veri saklama süreleri: eski adaylar ve işlem kayıtları.', 'Data retention periods for KVKK: stale leads and audit records.'], ['"Şimdi uygula" süre dolan kayıtları anonimleştirir ya da siler; geri alınamaz.', '"Apply now" anonymises or deletes records past their period; this cannot be undone.']),
  P(/^\/ayarlar$/, ['Sistem ayarları.', 'System settings.'], ['Bir ayarı değiştirdiğinizde tüm ekip için geçerli olur.', 'A change applies to the whole team.']),
  P(/^\/ayarlar\/tema$/, ['Arvela OS\'un görünümü: tema ve tema içi seçenekler.', 'How Arvela OS looks: theme and its options.'],
    ['"Önizle" yalnız size gösterir. Kaydettiğinizde tema tüm ekip ve müşteri portalı için değişir.', '"Preview" shows it only to you. Saving changes the theme for the whole team and the client portal.']),
  P(/^\/ara$/, ['Müşteri, proje, görev ve adaylarda arama.', 'Search across clients, projects, tasks and leads.'], ['Sonuca tıklayınca kayda gidersiniz. Her yerden ⌘K / Ctrl+K ile açılır.', 'Click a result to open it. Open search anywhere with ⌘K / Ctrl+K.']),
  // ----- müşteri portalı -----
  P(/^\/portal$/, ['Arvela ile yürüyen işleriniz: sizden beklenen kararlar, projelerinizin hangi aşamada olduğu ve hizmetleriniz.', 'Your work with Arvela: decisions we need from you, where your projects are and your services.'],
    ['Bir onayı verdiğinizde ekibimiz bir sonraki aşamaya geçer ve size haber verir. "Düzeltme iste" derseniz notunuz ilgili ekibe gider; düzeltme bitince yeniden onayınıza gelir.', 'When you approve, our team moves to the next stage and keeps you posted. "Ask for changes" sends your note to the team; once fixed it comes back for your approval.']),
  P(/^\/portal\/siteler$/, ['Sitelerinizin güvenlik ve bakım durumu.', 'Security and maintenance status of your sites.'], ['Bir sorun görünürse ekibimiz bilgilendirilir; size de haber veririz.', 'If an issue shows up our team is alerted and we will let you know.']),
  P(/^\/portal\/teklifler(\/\d+)?$/, ['Size gönderilen teklifler.', 'Quotes sent to you.'], ['Kabul ettiğinizde hizmet başlatılır ve proje planı açılır; ret verirseniz notunuzla ekibe döner.', 'Accepting starts the service and opens the project plan; declining sends your note back to the team.']),
  P(/^\/portal\/faturalar(\/\d+)?$/, ['Faturalarınız ve ödeme bilgileri.', 'Your invoices and payment details.'], ['Havale yaptıktan sonra "Ödedim" deyin; ekibimiz kontrol edip faturayı kapatır.', 'After paying by transfer press "I have paid"; our team checks and closes the invoice.']),
];

// Bölüm başlıkları (h2 ve açılır başlıklar) için kısa açıklama.
export const SECTIONS = {
  'Müşteri nabzı': ['Her müşterinin en kötü sinyali: gecikmiş fatura, acil site ya da bekleyen onay.', 'Each client\'s worst signal: overdue invoice, urgent site or pending approval.'],
  'Yeni görev': ['Görev ekleyip sorumlu seçin; atanan kişiye bildirim gider ve Bugün sayfasına düşer.', 'Add a task and pick an owner; they are notified and it appears on their Today page.'],
  'Onaylar': ['Müşteriden beklenen kararlar. Akıştaki müşteri kararları buraya kendiliğinden eklenir.', 'Decisions expected from the client. Client decisions from the flow are added here automatically.'],
  'Müşteriye onaya gönder': ['Akış dışı bir onay için. Gönderince müşterinin portalına düşer; karar gelince Bugün\'de görürsünüz.', 'For an approval outside the flow. It goes to the client portal; you will see the decision on Today.'],
  'Proje bilgileri': ['Ad, durum, teslim tarihi ve açıklama. Teslim tarihi müşteri portalında görünür.', 'Name, status, due date and description. The due date is shown in the client portal.'],
  'Hizmetten başlat: aşamaları görev olarak aç': ['Hizmeti seçin: kitabın aşamaları sorumlu ve tarihleriyle görev olarak açılır, ilk aşama hemen başlar ve sorumlusuna haber gider.', 'Pick a service: its stages are created as tasks with owners and dates, the first one starts right away and its owner is notified.'],
  'Hizmet kitabı': ['Bu işin nasıl yürüyeceğinin tanımı. Projeye kopyalanmış haliyle çalışır.', 'How this work is run. The project uses its own copy.'],
  'Ayrıntılar': ['Görevin tanımı, sorumlusu ve tarihi. Durumu "Bitti" yapmak akışı ilerletir.', 'The task definition, owner and date. Setting it to "Done" moves the flow on.'],
  'Notlar': ['İlerleme, engel ve bağlantılar. "Arvela OS" notları akışın kendiliğinden yazdıklarıdır.', 'Progress, blockers and links. Notes from "Arvela OS" are written by the flow.'],
  'İstek': ['Müşteriye gösterilen içerik. Karar verilene kadar düzenlenebilir.', 'What the client sees. Editable until a decision is made.'],
  'Karar': ['Kararı burada işlerseniz bağlı aşama da buna göre ilerler.', 'Recording the decision here moves the linked stage too.'],
  'Yeni aday': ['Telefonla ya da yüz yüze gelen adayı elle ekleyin; skoru ve sonraki adımı belirleyin.', 'Add a lead that came by phone or in person; set the score and next step.'],
  'Aday bilgileri': ['Aşama ve sonraki adım tarihi Bugün sayfasını besler.', 'Stage and next-step date feed the Today page.'],
  'İletişim geçmişi': ['Her görüşme notu burada birikir; n8n son notu da bildirimlerde kullanır.', 'Every call note collects here; n8n uses the latest one in notifications.'],
  'Yeni iş paketi': ['Freelancer\'a verilecek işi tanımlayın: kapsam, ücret şekli ve teslim.', 'Define work for a freelancer: scope, pay type and due date.'],
  'Süre kaydı': ['Çalışılan süreyi girin; saatlik paketlerde ücret bundan hesaplanır.', 'Log time worked; hourly packages are paid from this.'],
  'Ödeme kaydet': ['Yapılan ödemeyi girin; bakiye hemen düşer.', 'Record a payment; the balance drops right away.'],
  "n8n'e bağlanma": ['n8n\'i Arvela OS\'a bağlama adımları. Bağlantı bir kez kurulur.', 'Steps to connect n8n to Arvela OS. Done once.'],
  'Webhook bağlantıları': ['Hangi olayın hangi n8n akışına gideceği.', 'Which event goes to which n8n workflow.'],
  'API anahtarları': ['n8n\'in Arvela OS\'a kayıt yazması için anahtarlar. Anahtar bir kez gösterilir.', 'Keys that let n8n write to Arvela OS. A key is shown once.'],
  'Portal kullanıcıları': ['Müşterinin kendi panelinden takip ve karar vermesi için giriş hesapları.', 'Sign-in accounts so the client can follow and decide in their own panel.'],
  'Kalemler': ['Katalogdan ya da elle kalem ekleyin; toplam ve KDV kendiliğinden hesaplanır.', 'Add items from the catalogue or by hand; totals and VAT are calculated.'],
  'Onayınızı bekleyenler': ['Sizden beklenen kararlar. Onayladığınızda iş sıradaki aşamaya geçer.', 'Decisions we need from you. Approving moves the work to the next stage.'],
  'Kararınız': ['Onaylayın ya da notla düzeltme isteyin.', 'Approve, or ask for changes with a note.'],
  'Geçmiş onaylar': ['Verdiğiniz kararların kaydı.', 'A record of the decisions you made.'],
  'Projeleriniz': ['Projelerinizin ilerlemesi ve teslim tarihi.', 'Progress and due dates of your projects.'],
  'Hizmetleriniz': ['Arvela\'dan aldığınız hizmetler.', 'The services you get from Arvela.'],
  'Aşamalar': ['İşin sırayla yürüyen adımları: kim yapar, ne kadar sürer, nerede müşteri kararı gerekir.', 'The ordered steps: who works, how long, where the client decides.'],
  'Yapay zekâ destekli proje yönetimi': ['Yapay zekânın hangi işi yaptığı ve insanın nerede kontrol ettiği.', 'Which work AI does and where a person checks it.'],
  'Teslimatlar ve kabul ölçütleri': ['Müşteriye teslim edilecekler ve neye göre kabul edileceği.', 'What is delivered and how it is accepted.'],
  'Müşteriden istenenler': ['İşe başlamak için müşteriden gereken bilgi ve dosyalar.', 'Information and files needed from the client to start.'],
  'Riskler ve önlemler': ['Sık görülen sorunlar ve önceden alınacak önlem.', 'Common problems and how to prevent them.'],
  'Yeni müşteri ekle': ['Müşteri eklendikten sonra hizmet, proje ve portal kullanıcısı tanımlayabilirsiniz.', 'After adding the client you can set services, projects and portal users.'],
  'Yeni proje': ['Projeyi açtıktan sonra proje sayfasında hizmetten başlatın.', 'After creating it, start it from a service on the project page.'],
  'Yeni teklif': ['Taslak açılır; kalemleri ekleyip gönderin.', 'A draft is created; add items and send.'],
  'Site ekle': ['Site eklenince eşitlemeyle sağlık durumu dolar.', 'Health fills in with the next sync.'],
  'Ekip üyesi ekle': ['Rol seçin: Yönetici her şeyi, Çalışan iş kısmını, Freelancer yalnız kendine atananları görür.', 'Pick a role: Admin sees everything, Staff the work side, Freelancer only what is assigned to them.'],
  'Şimdi uygula': ['Süresi dolan kayıtları hemen temizler. Geri alınamaz.', 'Cleans records past their period now. Cannot be undone.'],
  'Yeni bağlantı': ['Müşterinin bekleyen kararları için yeni bağlantı. Eski bağlantılar süresi dolana ya da iptal edilene kadar çalışır.', 'A new link for the client\'s pending decisions. Older links work until they expire or are revoked.'],
  'Bağlantılar': ['Oluşturulan bağlantılar; şüpheli bir durumda iptal edin.', 'Links created so far; revoke one if anything looks wrong.'],
  'Bağlantı hazır': ['Bu bağlantıyı yalnız müşteriyle paylaşın; açan kişi yine de e-posta koduyla doğrulamak zorundadır.', 'Share this link only with the client; whoever opens it still has to verify with the email code.'],
  'Otomatik karar e-postası': ['Açarsanız müşteriye her onay isteğinde e-posta gider; kapalıyken bağlantıyı elle gönderirsiniz.', 'When on, the client gets an email for every approval request; when off you send the link by hand.'],
  'Yapay zekâ motoru': ['Bu projede kullanılacak motor. Claude\'dan, aşamalara göre hangi motorun uygun olduğuna dair öneri alabilirsiniz.', 'The engine for this project. You can ask Claude which engine suits each stage.'],
  'Claude bağlantısı': ['Kaydettiğiniz ayar tüm ekip için geçerli olur.', 'The setting applies to the whole team.'],
  'Gönderilen istem': ['Claude\'a giden metnin aynısı; maskeli alanlar köşeli parantezle görünür.', 'Exactly what was sent to Claude; masked fields appear in brackets.'],
  'Alt görevler': ['Bu göreve bağlı işler. Hepsi bitince ana görevi "Bitti" yapın.', 'Work linked to this task. When all are done, set the main task to "Done".'],
  'Kontrol listesi': ['Görevin küçük adımları; işaretledikçe ilerleme görünür. Sorumlu ve freelancer da işaretleyebilir.', 'Small steps of the task; progress shows as you tick. The owner and freelancer can tick too.'],
  'Hatırlatmalar': ['Zamanı gelince görevin notlarına yazılır ve sorumluya bildirim gider. "Görev bitmediyse" koşulunda görev bitmişse gönderilmez.', 'When due, a note is added and the owner is notified. With "if the task is not done", nothing is sent once the task is done.'],
  'Sürümler': ['Yayındaki ve önceki sürümler; gerekirse geri alın.', 'Live and previous versions; roll back if needed.'],
};

const pick = (pair, lang) => (lang === 'en' ? pair[1] : pair[0]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const findPage = (path) => PAGES.find(g => g.m.test(path)) || null;
// Başlık metninden anahtar: sayaç, işaret ve "·" sonrası atılır.
export const sectionKey = (label) => String(label).replace(/[\u0001\u0002]/g, '').split(/\s\(|\s·|<|\u0001/)[0].replace(/\s+/g, ' ').trim();

// page-head bloğunun bittiği yeri bul (iç içe div sayılır).
function afterHead(html) {
  const i = html.indexOf('<div class="page-head">'); if (i < 0) return -1;
  let depth = 0; const re = /<div\b|<\/div>/g; re.lastIndex = i; let m;
  while ((m = re.exec(html))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return m.index + 6; }
  return -1;
}

// Sayfa gövdesine "Ayrıntılar" düğmesini ve bilgi katmanını yerleştirir. Bilgi katmanı (sayfa rehberi, bölüm açıklamaları)
// her zaman HTML'de vardır; görünürlüğü <body class="info-on"> belirler (düğme anında açar/kapatır, tercih çerezde kalır).
export function applyGuide(html, { path, lang = 'tr', M1 = '', M2 = '', btn: withBtn = true }) {
  const mark = (s) => M1 + esc(s) + M2;
  const g = findPage(path);
  if (!g) return html;
  const en = lang === 'en';
  const btn = `<button type="button" class="info-btn" data-info aria-pressed="false" aria-controls="sayfa-bilgi"><span aria-hidden="true">i</span>${mark(en ? 'Details' : 'Ayrıntılar')}</button>`;
  const box = `<section class="guide" id="sayfa-bilgi" aria-label="${en ? 'Page guide' : 'Sayfa rehberi'}"><div><p class="eyebrow">${mark(en ? 'What this page is for' : 'Bu sayfa ne işe yarar')}</p><p>${mark(pick(g.ne, lang))}</p></div><div><p class="eyebrow">${mark(en ? 'What happens next' : 'Sonra ne olur')}</p><p>${mark(pick(g.sonra, lang))}</p></div></section>`;
  const at = afterHead(html);
  let out;
  if (!withBtn) out = at < 0 ? box + html : html.slice(0, at) + box + html.slice(at);
  else if (at < 0) out = `<div class="info-bar">${btn}</div>` + box + html;
  else {
    const head = html.slice(0, at - 6); // page-head'in kapanış </div>'inden önce: düğme sağ üstte
    out = head + btn + '</div>' + box + html.slice(at);
  }
  const hint = (label) => { const k = sectionKey(label); return SECTIONS[k] ? `<p class="g-hint">${mark(pick(SECTIONS[k], lang))}</p>` : ''; };
  out = out.replace(/(<h2(?:\s[^>]*)?>)([^<]*)((?:<span[^>]*>[^<]*<\/span>)?)(<\/h2>)/g, (m, a, label, span, end) => m + hint(label));
  out = out.replace(/(<summary>)([^<]+)(<\/summary>)/g, (m, a, label) => m + hint(label));
  return out;
}
