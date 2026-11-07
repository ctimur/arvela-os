"""Hazır n8n iş akışlarını üretir: app/n8n-seed.json.

n8n açılışta bu dosyayı Arvela OS'ten (/api/n8n-seed) çeker ve SEED sürümü değişmişse bir kez içe aktarır.
Akışlar pasif gelir; kimlik bilgileri (Arvela OS API, Arvela webhook, SMTP) n8n'de kullanıcı tarafından seçilir.
Kullanım: python3 tools/n8n_seed.py
"""
import json, uuid, pathlib

API = 'https://os.arveladigital.com/api/v1'
TO = 'hello@arveladigital.com'
FROM = 'Arvela OS <hello@arveladigital.com>'
NS = uuid.UUID('6f1c1b2a-7b0e-4c41-9d2e-a7e1a0c0de01')
uid = lambda s: str(uuid.uuid5(NS, s))
wid = lambda s: uuid.uuid5(NS, 'wf-' + s).hex[:16]


def node(name, typ, ver, pos, params, creds=None, extra=None):
    n = {'id': uid(name + typ), 'name': name, 'type': typ, 'typeVersion': ver, 'position': pos, 'parameters': params}
    if creds:
        n['credentials'] = creds
    n.update(extra or {})
    return n


def note(name, text, pos, w=420, h=260):
    return node(name, 'n8n-nodes-base.stickyNote', 1, pos, {'content': text, 'width': w, 'height': h})


API_CRED = {'httpHeaderAuth': {'id': 'arvelaApiCred01', 'name': 'Arvela OS API'}}
HOOK_CRED = {'httpHeaderAuth': {'id': 'arvelaHookCred1', 'name': 'Arvela webhook'}}
SMTP_CRED = {'smtp': {'id': 'arvelaSmtpCred1', 'name': 'SMTP'}}


def http(name, pos, path, method='GET', body=None, query=None):
    p = {'method': method, 'url': API + path, 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'options': {}}
    if query:
        p['sendQuery'] = True
        p['queryParameters'] = {'parameters': [{'name': k, 'value': v} for k, v in query.items()]}
    if body:
        p.update({'sendBody': True, 'specifyBody': 'json', 'jsonBody': body})
    return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, p, API_CRED)


def code(name, pos, js):
    return node(name, 'n8n-nodes-base.code', 2, pos, {'jsCode': js})


def email(name, pos, subject, html, to=TO):
    return node(name, 'n8n-nodes-base.emailSend', 2.1, pos, {'fromEmail': FROM, 'toEmail': to, 'subject': subject, 'emailFormat': 'html', 'html': html, 'options': {}}, SMTP_CRED)


def schedule(name, pos, cron):
    return node(name, 'n8n-nodes-base.scheduleTrigger', 1.2, pos, {'rule': {'interval': [{'field': 'cronExpression', 'expression': cron}]}})


def webhook(name, pos, path):
    return node(name, 'n8n-nodes-base.webhook', 2, pos, {'httpMethod': 'POST', 'path': path, 'authentication': 'headerAuth', 'responseMode': 'onReceived', 'options': {}}, HOOK_CRED, {'webhookId': uid('hook-' + path)})


def cond(left, op, right=None, typ='string'):
    c = {'id': uid(left + op + str(right)), 'leftValue': left, 'operator': {'type': typ, 'operation': op}}
    if right is not None:
        c['rightValue'] = right
    if op in ('notEmpty', 'empty', 'true', 'false', 'exists'):
        c['operator']['singleValue'] = True
    return c


def iff(name, pos, conds):
    return node(name, 'n8n-nodes-base.if', 2.2, pos, {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2}, 'conditions': conds, 'combinator': 'and'}, 'options': {}})


def link(conn, a, b, out=0):
    conn.setdefault(a, {'main': []})
    while len(conn[a]['main']) <= out:
        conn[a]['main'].append([])
    conn[a]['main'][out].append({'node': b, 'type': 'main', 'index': 0})


def wf(key, name, nodes, conn, tags=None):
    return {'id': wid(key), 'name': name, 'nodes': nodes, 'connections': conn, 'active': False, 'settings': {'executionOrder': 'v1', 'timezone': 'Europe/Istanbul', 'saveManualExecutions': True},
            'pinData': {}, 'meta': {'templateCredsSetupCompleted': False}, 'tags': []}


ESC = "const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));\n"
LI = "const li = (arr, f) => arr && arr.length ? '<ul>' + arr.map(x => '<li>' + f(x) + '</li>').join('') + '</ul>' : '<p style=\"color:#6B6558\">Yok.</p>';\n"
flows = []

# 1 · Olay yönlendirici
c = {}
groups = [('Görev', 'task.'), ('Proje', 'project.'), ('Onay', 'approval.'), ('Müşteri', 'client'), ('Teklif', 'quote.'), ('Fatura', 'invoice.'), ('Site', 'site.')]
sw = node('Olay türü', 'n8n-nodes-base.switch', 3.2, [440, 300], {'rules': {'values': [
    {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2}, 'conditions': [cond('={{ $json.body.event }}', 'startsWith', pre)], 'combinator': 'and'}, 'renameOutput': True, 'outputKey': g}
    for g, pre in groups]}, 'options': {'fallbackOutput': 'extra', 'renameFallbackOutput': 'Diğer'}})
nodes = [note('Nasıl çalışır', '## Arvela · Olay yönlendirici\nArvela OS\'teki her olay (görev, proje, onay, müşteri, teklif, fatura, site) buraya gelir ve türüne göre ayrılır.\n\nHer çıkışa istediğin adımı ekle: Slack/Telegram mesajı, Google Sheets satırı, e-posta…\n\n`$json.body.data` kaydın ayrıntısıdır; `url` alanı Arvela OS\'teki sayfasıdır.\n\nArvela OS → Otomasyonlar → "n8n · Olay yönlendirici" bağlantısını Etkin yap.', [-40, -60], 460, 300),
         webhook('Arvela olayı', [200, 300], 'arvela-events'), sw]
link(c, 'Arvela olayı', 'Olay türü')
for i, (g, _) in enumerate(groups + [('Diğer', '')]):
    n = f'{g} olayları'
    nodes.append(node(n, 'n8n-nodes-base.noOp', 1, [720, 60 + i * 110], {}))
    link(c, 'Olay türü', n, i)
flows.append(wf('router', 'Arvela · Olay yönlendirici', nodes, c))

# 2 · Sabah özeti
c = {}
js = ESC + LI + """const s = $input.first().json;
const n = s.counts || {};
const html = `<h2 style="font-family:Arial">Günaydın · ${s.date}</h2>
<p>${n.clients} aktif müşteri · ${n.open_projects} açık proje · ${n.open_tasks} açık görev · ${n.pending_approvals} bekleyen onay</p>
<h3>Geciken görevler</h3>${li(s.overdue_tasks, t => `${esc(t.title)} — ${esc(t.project)} · ${esc(t.assignee || 'atanmadı')} · ${String(t.due_date).slice(0,10)}`)}
<h3>Bugün teslim</h3>${li(s.due_today, t => `${esc(t.title)} — ${esc(t.project)} · ${esc(t.assignee || 'atanmadı')}`)}
<h3>Onay bekleyenler</h3>${li(s.pending_approvals, a => `${esc(a.title)} — ${esc(a.client)}`)}
<h3>Acil siteler</h3>${li(s.urgent_sites, x => `${esc(x.domain)} — ${esc(x.client || '')} ${esc(x.issue || x.ssl_status || '')}`)}
${s.overdue_invoices ? '<h3>Gecikmiş faturalar</h3>' + li(s.overdue_invoices, i => `${esc(i.number)} — ${esc(i.client)}`) : ''}
<p><a href="${s.url}">Arvela OS'te Bugün sayfasını aç</a></p>`;
return [{ json: { html, subject: `Arvela · ${s.date} günlük özet` } }];"""
nodes = [note('Nasıl çalışır', '## Arvela · Sabah özeti\nHafta içi 08:30\'da günün özetini e-postayla gönderir.\nAlıcıyı "E-posta gönder" düğümünden değiştir. Finans yetkili anahtarla gecikmiş faturalar da eklenir.', [-40, -120], 380, 180),
         schedule('Hafta içi 08:30', [0, 300], '30 8 * * 1-5'), http('Günün özeti', [240, 300], '/summary'), code('Özeti hazırla', [480, 300], js),
         email('E-posta gönder', [720, 300], '={{ $json.subject }}', '={{ $json.html }}')]
for a, b in [('Hafta içi 08:30', 'Günün özeti'), ('Günün özeti', 'Özeti hazırla'), ('Özeti hazırla', 'E-posta gönder')]:
    link(c, a, b)
flows.append(wf('morning', 'Arvela · Sabah özeti', nodes, c))

# 3 · Onay hatırlatma
c = {}
js = ESC + """const now = Date.now(); const rows = $input.first().json.data || [];
const wa = (p, t) => { let d = String(p || '').replace(/\\D/g, ''); if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1); if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d.length >= 11 ? `https://wa.me/${d}?text=${encodeURIComponent(`Merhaba, "${t}" onayınızı bekliyor. Portalınızdan bakabilirsiniz.`)}` : null; };
const old = rows.filter(a => now - new Date(a.created_at) >= 2 * 864e5);
if (!old.length) return [];
const html = '<h2 style="font-family:Arial">2 günden uzun süredir onay bekleyenler</h2><ul>' + old.map(a => { const l = wa(a.client_phone, a.title); return `<li><strong>${esc(a.title)}</strong> — ${esc(a.client)} · ${Math.floor((now - new Date(a.created_at)) / 864e5)} gün ${l ? `· <a href="${l}">WhatsApp'tan hatırlat</a>` : ''}</li>`; }).join('') + '</ul><p style="color:#6B6558">Müşteriye mesaj göndermeden önce İYS/KVKK iznini kontrol et.</p>';
return [{ json: { html, count: old.length } }];"""
nodes = [note('Nasıl çalışır', '## Arvela · Onay hatırlatma\nHer iş günü 10:00\'da 2 günden uzun bekleyen onayları listeler; müşteriye tek dokunuşla WhatsApp hatırlatması için bağlantı verir. Bekleyen yoksa e-posta gitmez.', [-40, -120], 400, 180),
         schedule('Her iş günü 10:00', [0, 300], '0 10 * * 1-5'), http('Bekleyen onaylar', [240, 300], '/approvals', query={'status': 'bekliyor'}), code('Eskileri seç', [480, 300], js),
         email('Ekibe gönder', [720, 300], '=Arvela · {{ $json.count }} onay bekliyor', '={{ $json.html }}')]
for a, b in [('Her iş günü 10:00', 'Bekleyen onaylar'), ('Bekleyen onaylar', 'Eskileri seç'), ('Eskileri seç', 'Ekibe gönder')]:
    link(c, a, b)
flows.append(wf('approvals', 'Arvela · Onay hatırlatma', nodes, c))

# 4 · Gecikmiş faturalar
c = {}
js = ESC + """const rows = $input.first().json.data || [];
if (!rows.length) return [];
const sum = rows.reduce((a, i) => a + (i.total || 0), 0);
const html = '<h2 style="font-family:Arial">Gecikmiş faturalar</h2><ul>' + rows.map(i => `<li><strong>${esc(i.number)}</strong> — ${esc(i.client)} · ${new Intl.NumberFormat('tr-TR').format(i.total || 0)} ${i.currency === 'EUR' ? '€' : 'TL'} · vade ${String(i.due_date).slice(0, 10)}${i.client_notified_at ? ' · <em>müşteri ödedim dedi</em>' : ''}</li>`).join('') + `</ul><p>Toplam: ${new Intl.NumberFormat('tr-TR').format(sum)}</p><p><a href="https://os.arveladigital.com/faturalar">Faturaları aç</a></p>`;
return [{ json: { html, count: rows.length } }];"""
nodes = [note('Nasıl çalışır', '## Arvela · Gecikmiş faturalar\nPazartesi 09:00\'da vadesi geçmiş faturaları özetler.\nAPI anahtarında **Finans** yetkisi gerekir.', [-40, -120], 380, 160),
         schedule('Pazartesi 09:00', [0, 300], '0 9 * * 1'), http('Gecikmiş faturalar', [240, 300], '/invoices', query={'status': 'overdue'}), code('Listeyi hazırla', [480, 300], js),
         email('Yöneticiye gönder', [720, 300], '=Arvela · {{ $json.count }} gecikmiş fatura', '={{ $json.html }}')]
for a, b in [('Pazartesi 09:00', 'Gecikmiş faturalar'), ('Gecikmiş faturalar', 'Listeyi hazırla'), ('Listeyi hazırla', 'Yöneticiye gönder')]:
    link(c, a, b)
flows.append(wf('invoices', 'Arvela · Gecikmiş faturalar', nodes, c))

# 5 · Yeni müşteri karşılama
c = {}
js_tasks = """const p = $input.first().json; const due = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const tasks = [
  ['Karşılama görüşmesi yap', 'Hedefleri, marka varlıklarını ve erişimleri konuş.', 1, 'yuksek'],
  ['Erişimleri topla', 'Alan adı, hosting, sosyal medya ve reklam hesabı erişimleri.', 3, 'normal'],
  ['Marka dosyasını oluştur', 'Logo, renkler, yazı tipleri, ton.', 5, 'normal'],
  ['İlk ay planını hazırla', 'İçerik takvimi ya da iş planı; müşteriye onaya gönder.', 7, 'normal'],
];
return tasks.map(([title, description, d, priority]) => ({ json: { project_id: p.id, title, description, due_date: due(d), priority } }));"""
nodes = [note('Nasıl çalışır', '## Arvela · Yeni müşteri karşılama\nArvela OS\'te yeni müşteri eklenince "Karşılama" projesi açar ve 4 başlangıç görevi ekler.\nGörev listesini "Görevleri hazırla" düğümünden değiştir.\nArvela OS → Otomasyonlar → "n8n · Yeni müşteri karşılama" bağlantısını Etkin yap.', [-40, -140], 460, 200),
         webhook('Yeni müşteri', [0, 300], 'arvela-new-client'),
         iff('Müşteri eklendi mi', [220, 300], [cond('={{ $json.body.event }}', 'equals', 'client.create')]),
         http('Karşılama projesi', [460, 280], '/projects', 'POST', '={{ JSON.stringify({ client_id: $json.body.data.id, name: "Karşılama · " + $json.body.data.name, description: "Yeni müşteri başlangıç adımları (n8n)." }) }}'),
         code('Görevleri hazırla', [700, 280], js_tasks),
         http('Görevi ekle', [940, 280], '/tasks', 'POST', '={{ JSON.stringify($json) }}')]
for a, b in [('Yeni müşteri', 'Müşteri eklendi mi'), ('Karşılama projesi', 'Görevleri hazırla'), ('Görevleri hazırla', 'Görevi ekle')]:
    link(c, a, b)
link(c, 'Müşteri eklendi mi', 'Karşılama projesi', 0)
flows.append(wf('onboarding', 'Arvela · Yeni müşteri karşılama', nodes, c))

# 6 · Görev bildirimi
c = {}
js = ESC + """const e = $input.first().json.body; const t = e.data || {};
if (!t.assignee_email) return [];
if (e.event === 'task.update' && e.actor && e.actor.id === t.assignee_id) return [];
const html = `<h2 style="font-family:Arial">${e.event === 'task.create' ? 'Sana yeni bir görev atandı' : 'Görevin güncellendi'}</h2>
<p><strong>${esc(t.title)}</strong><br>${esc(t.project)} · ${esc(t.client)}${t.due_date ? ' · teslim ' + String(t.due_date).slice(0, 10) : ''}${t.priority === 'yuksek' ? ' · <strong>öncelikli</strong>' : ''}</p>
${t.description ? `<p style="white-space:pre-wrap">${esc(t.description)}</p>` : ''}<p><a href="${t.url}">Görevi Arvela OS'te aç</a></p>`;
return [{ json: { to: t.assignee_email, subject: `Arvela · ${t.title}`, html } }];"""
nodes = [note('Nasıl çalışır', '## Arvela · Görev bildirimi\nGörev oluşturulunca ya da güncellenince sorumlusuna e-posta gönderir (kendi yaptığı değişiklik hariç).\nArvela OS → Otomasyonlar → "n8n · Görev bildirimi" bağlantısını Etkin yap.', [-40, -120], 420, 180),
         webhook('Görev olayı', [0, 300], 'arvela-task-assigned'), code('E-postayı hazırla', [240, 300], js),
         email('Sorumluya gönder', [480, 300], '={{ $json.subject }}', '={{ $json.html }}', '={{ $json.to }}')]
link(c, 'Görev olayı', 'E-postayı hazırla'); link(c, 'E-postayı hazırla', 'Sorumluya gönder')
flows.append(wf('task-notify', 'Arvela · Görev bildirimi', nodes, c))

# 7 · Acil site uyarısı
c = {}
js = ESC + """const s = ($input.first().json.body || {}).data || {};
return [{ json: { subject: `Acil: ${s.domain}`, html: `<h2 style="font-family:Arial">${esc(s.domain)} acil duruma düştü</h2><p>${esc(s.client || 'Müşterisiz')}</p><p>${esc(s.issue || '')} SSL: ${esc(s.ssl_status || '—')} · WordPress: ${esc(s.wp_version || '—')}</p><p><a href="${s.url}">Arvela OS'te aç</a></p>` } }];"""
nodes = [note('Nasıl çalışır', '## Arvela · Acil site uyarısı\nSabahki Hostinger eşitlemesinde bir site acil duruma düşerse hemen e-posta gönderir.\nTelegram ya da Slack düğümü ekleyerek mesaj olarak da alabilirsin.', [-40, -120], 420, 170),
         webhook('Site uyarısı', [0, 300], 'arvela-site-alert'), code('Mesajı hazırla', [240, 300], js), email('Uyarı gönder', [480, 300], '={{ $json.subject }}', '={{ $json.html }}')]
link(c, 'Site uyarısı', 'Mesajı hazırla'); link(c, 'Mesajı hazırla', 'Uyarı gönder')
flows.append(wf('site-alert', 'Arvela · Acil site uyarısı', nodes, c))

# 8 · Web formu → aday
c = {}
CONSENT = 'Kampanya ve duyuruları e-posta, SMS ve telefonla almak istiyorum (isteğe bağlı)'
form = node('İletişim formu', 'n8n-nodes-base.formTrigger', 2.2, [0, 300], {'formTitle': 'Arvela Digital & AI · İletişim', 'formDescription': 'Projenizi kısaca anlatın, aynı gün dönüş yapalım. Bilgileriniz talebinize dönmek ve ön görüşmeyi planlamak için işlenir; ayrıntılar: arveladigital.com/kvkk',
    'formFields': {'values': [{'fieldLabel': 'Ad Soyad', 'requiredField': True}, {'fieldLabel': 'Firma', 'requiredField': True}, {'fieldLabel': 'Telefon', 'requiredField': True},
                              {'fieldLabel': 'E-posta', 'fieldType': 'email'}, {'fieldLabel': 'İlgilendiğiniz hizmet', 'fieldType': 'dropdown', 'fieldOptions': {'values': [{'option': 'Web sitesi / e-ticaret'}, {'option': 'Sosyal medya yönetimi'}, {'option': 'Dijital pazarlama'}, {'option': 'Yapay zekâ çözümleri'}, {'option': 'Emlak yazılımları'}, {'option': 'Diğer'}]}},
                              {'fieldLabel': 'Mesaj', 'fieldType': 'textarea'}, {'fieldLabel': CONSENT, 'fieldType': 'dropdown', 'fieldOptions': {'values': [{'option': 'Hayır'}, {'option': 'Evet'}]}}]},
    'options': {'respondWithOptions': {'values': {'formSubmittedText': 'Teşekkürler! En kısa sürede size dönüş yapacağız.'}}}}, extra={'webhookId': uid('form-lead')})
nodes = [note('Nasıl çalışır', '## Arvela · Web formu → aday\nn8n\'in barındırdığı iletişim formu (adresi düğümde, "Production URL"). Gönderilince Arvela OS\'e aday müşteri, "İlk görüşme" projesi ve "Adayı ara" görevi ekler.\nSitene bağlantı ya da iframe olarak koyabilirsin. Aydınlatma metni arveladigital.com/kvkk adresinde yayınlanmalı. Pazarlama onayı isteğe bağlıdır; "Evet" seçilirse adayın kaydına onay tarihi yazılır (İYS\'ye yüklenmeli).', [-40, -160], 460, 220), form,
         http('Aday müşteri', [240, 300], '/clients', 'POST', '={{ JSON.stringify({ name: $json["Firma"], contact_name: $json["Ad Soyad"], phone: $json["Telefon"], email: $json["E-posta"] || null, status: "lead", marketing_consent: $json["' + CONSENT + '"] === "Evet", consent_source: "Web formu", notes: "Web formu · " + ($json["İlgilendiğiniz hizmet"] || "") + "\\n" + ($json["Mesaj"] || "") }) }}'),
         http('İlk görüşme projesi', [480, 300], '/projects', 'POST', '={{ JSON.stringify({ client_id: $json.id, name: "İlk görüşme", description: "Web formundan gelen aday (n8n)." }) }}'),
         http('Adayı ara görevi', [720, 300], '/tasks', 'POST', '={{ JSON.stringify({ project_id: $json.id, title: "Adayı ara: " + $("İletişim formu").first().json["Ad Soyad"], description: "Tel: " + $("İletişim formu").first().json["Telefon"] + "\\nHizmet: " + ($("İletişim formu").first().json["İlgilendiğiniz hizmet"] || "") + "\\n" + ($("İletişim formu").first().json["Mesaj"] || ""), due_date: new Date().toISOString().slice(0,10), priority: "yuksek" }) }}')]
for a, b in [('İletişim formu', 'Aday müşteri'), ('Aday müşteri', 'İlk görüşme projesi'), ('İlk görüşme projesi', 'Adayı ara görevi')]:
    link(c, a, b)
flows.append(wf('lead-form', 'Arvela · Web formu → aday', nodes, c))

out = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'n8n-seed.json'
IDS = {f['name']: f['id'] for f in flows}
out.write_text(json.dumps({'version': 3, 'ids': IDS, 'workflows': flows}, ensure_ascii=False, indent=0) + '\n')
print(len(flows), 'akış', out.stat().st_size, 'bayt')
