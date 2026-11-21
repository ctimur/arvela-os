// arveladigital.com — tarayıcı betiği (CSP: yalnız bu dosya çalışır). Çerçevesiz, bağımlılıksız.
export const JS = String.raw`(() => {
'use strict';
const D = JSON.parse(document.getElementById('data').textContent || '{}'); const L = D.lang || 'tr';
const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ss = { get(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const COURSE = '<svg viewBox="0 0 64 300" preserveAspectRatio="none" aria-hidden="true"><path class="sail draw" d="M32 10 C 6 60, 58 90, 32 150 S 8 240, 32 290"/><circle class="buoy" cx="32" cy="10" r="7"/><circle class="buoy" cx="32" cy="150" r="7"/><circle class="buoy end" cx="32" cy="290" r="7"/></svg>';
const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const draw = (root) => { const p = $('.sail', root); if (p) p.style.setProperty('--len', Math.ceil(p.getTotalLength ? p.getTotalLength() : 420)); };

// menü
const bg = $('.burger'); if (bg) bg.addEventListener('click', () => { const t = $('.top'); const o = t.classList.toggle('open'); bg.setAttribute('aria-expanded', o); });
// bildirim (takip çerezi yok; kapatıldığı hatırlanır)
try { if (D.notice && !localStorage.getItem('av_notice')) { const n = document.createElement('div'); n.className = 'notice'; n.setAttribute('role', 'region'); n.setAttribute('aria-label', 'notice');
  n.innerHTML = '<p>' + D.notice.text + '</p><button type="button">' + esc(D.notice.ok) + '</button>'; document.body.appendChild(n);
  $('button', n).addEventListener('click', () => { try { localStorage.setItem('av_notice', '1'); } catch {} n.remove(); }); } } catch {}
// gezilen bölümler (yalnız bu oturumda; görüşme formuyla gönderilir)
const pages = ss.get('av_pages', []); const here = D.solTitle || location.pathname; if (pages[pages.length - 1] !== here) { pages.push(here); ss.set('av_pages', pages.slice(-30)); }

// ---------- ana sayfa: sorun seç, rotayı gör ----------
if (D.view === 'home') {
  const box = $('#route'); const chips = $$('.chip');
  const show = (s) => { const x = D.sols[s]; if (!x) return;
    chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.sol === s));
    box.innerHTML = '<div class="fade" style="display:flex;flex-direction:column;flex:1"><p class="rt">' + esc(x.short) + '</p><h2>' + esc(x.title) + '</h2><div class="course">' + COURSE +
      x.route.map((r, i) => '<div class="stop"><b>' + esc(D.labels.stages[i]) + '</b><p>' + esc(r) + '</p></div>').join('') + '</div>' +
      '<div class="acts"><a class="btn btn-gold" href="' + D.bookPath + '?c=' + encodeURIComponent(s) + '">' + esc(D.labels.book) + '</a><a class="link" href="' + x.href + '">' + esc(D.labels.more) + '</a></div></div>';
    draw(box); ss.set('av_interest', s); };
  chips.forEach(c => c.addEventListener('click', (e) => { e.preventDefault(); show(c.dataset.sol); if (innerWidth < 900) box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }));
}

// ---------- randevu bileşeni ----------
const dayLabel = (d) => { const dt = new Date(d + 'T12:00:00Z'); return { w: dt.toLocaleDateString(L === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'short', timeZone: 'UTC' }), n: dt.getUTCDate(), m: dt.toLocaleDateString(L === 'en' ? 'en-GB' : 'tr-TR', { month: 'short', timeZone: 'UTC' }),
  long: dt.toLocaleDateString(L === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) }; };
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  let j = {}; try { j = await r.json(); } catch {} if (!r.ok) { const e = new Error(j.error || ''); e.status = r.status; throw e; } return j;
}
function booking(root, B, extra) {
  const slotsEl = $('[data-slots]', root); let days = []; let day = null; let time = null;
  const load = async () => { try { const j = await api('/api/slots?lang=' + L); days = j.days || []; if (!days.length) { slotsEl.innerHTML = '<p class="muted">' + esc(B.none) + '</p>'; return; } day = days[0].date; time = null; render(); }
    catch { slotsEl.innerHTML = '<p class="err">' + esc(B.error) + '</p>'; } };
  const render = () => {
    const d = days.find(x => x.date === day);
    slotsEl.innerHTML = '<p style="margin:18px 0 0;font-weight:600">' + esc(B.pickDay) + '</p><div class="days" role="group" aria-label="' + esc(B.pickDay) + '">' + days.map(x => { const l = dayLabel(x.date); return '<button type="button" class="day" data-d="' + x.date + '" aria-pressed="' + (x.date === day) + '" aria-label="' + esc(l.long) + '">' + esc(l.w) + '<b>' + l.n + '</b>' + esc(l.m) + '</button>'; }).join('') + '</div>' +
      '<p style="margin:8px 0 0;font-weight:600">' + esc(B.pickTime) + '</p><div class="times" role="group" aria-label="' + esc(B.pickTime) + '">' + d.slots.map(s => '<button type="button" class="time" data-t="' + s + '" aria-pressed="' + (s === time) + '">' + s + '</button>').join('') + '</div><div data-form></div>';
    $$('.day', slotsEl).forEach(b => b.addEventListener('click', () => { day = b.dataset.d; time = null; render(); $('.day[aria-pressed=true]', slotsEl).focus(); }));
    $$('.time', slotsEl).forEach(b => b.addEventListener('click', () => { time = b.dataset.t; $$('.time', slotsEl).forEach(x => x.setAttribute('aria-pressed', x === b)); form(); }));
  };
  const form = () => {
    const f = $('[data-form]', slotsEl); const l = dayLabel(day); const keep = f.querySelector('form') ? Object.fromEntries(new FormData(f.querySelector('form'))) : {};
    f.innerHTML = '<div class="chosen"><span><span class="muted">' + esc(B.chosen) + ':</span> <b>' + esc(l.long) + ', ' + time + '</b></span></div>' +
      '<form class="form" novalidate><label>' + esc(B.name) + '<input name="name" autocomplete="name" required maxlength="120"></label><label>' + esc(B.email) + '<input name="email" type="email" autocomplete="email" required maxlength="200"></label>' +
      '<label>' + esc(B.phone) + '<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label>' + esc(B.company) + '<input name="company" autocomplete="organization" maxlength="160"></label>' +
      '<label class="full">' + esc(B.website) + '<input name="website" maxlength="200"></label><label class="full">' + esc(B.note) + '<textarea name="note" maxlength="1000"></textarea></label>' +
      '<label class="hp" aria-hidden="true">Fax<input name="fax" tabindex="-1" autocomplete="off"></label>' +
      '<label class="check full"><input type="checkbox" name="kvkk" required><span>' + B.kvkk + '</span></label><label class="check full"><input type="checkbox" name="iys"><span>' + esc(B.iys) + '</span></label>' +
      '<div class="full"><button class="btn btn-ink" type="submit">' + esc(B.submit) + '</button><p class="err" role="alert" hidden></p></div></form>';
    const fm = $('form', f); for (const [k, v] of Object.entries(keep)) { const i = fm.elements[k]; if (i && i.type !== 'checkbox') i.value = v; }
    fm.addEventListener('submit', async (e) => { e.preventDefault(); const er = $('.err', fm); er.hidden = true; const btn = $('button[type=submit]', fm);
      const v = Object.fromEntries(new FormData(fm)); if (!v.name || !v.email || !fm.elements.kvkk.checked) { er.textContent = !fm.elements.kvkk.checked ? (L === 'en' ? 'Please confirm you have read the privacy notice.' : 'Lütfen aydınlatma metnini onaylayın.') : (L === 'en' ? 'Please enter your name and email.' : 'Lütfen adınızı ve e-postanızı yazın.'); er.hidden = false; return; }
      btn.disabled = true; btn.textContent = B.busy;
      try { const j = await api('/api/book', { ...v, kvkk: true, iys: fm.elements.iys.checked, date: day, time, lang: L, pages: ss.get('av_pages', []), answers: extra(), source: location.pathname });
        root.innerHTML = '<div class="ok" tabindex="-1"><h2>' + esc(B.done) + '</h2><p style="font-size:20px;margin:6px 0 10px"><b>' + esc(j.day) + ', ' + esc(j.time) + '</b></p><p class="muted">' + esc(B.doneText) + '</p>' + (j.meet_url ? '<p><a class="btn btn-gold" href="' + esc(j.meet_url) + '">' + (L === 'en' ? 'Meeting link' : 'Görüşme bağlantısı') + '</a></p>' : '') + '</div>';
        $('.ok', root).focus(); ss.set('av_booked', true); const ld = document.getElementById('lead'); if (ld) ld.hidden = true;
      } catch (x) { btn.disabled = false; btn.textContent = B.submit; er.textContent = x.message || B.error; er.hidden = false; if (x.status === 409) { await load(); } } });
    $('input[name=name]', fm).focus();
  };
  load();
}
const ctxAnswers = () => { const a = ss.get('av_answers', {}); const c = new URLSearchParams(location.search).get('c') || ss.get('av_interest', null); if (D.solTitle) a.cozum = D.solTitle; else if (c && !a.cozum && D.solTitles && D.solTitles[c]) a.cozum = D.solTitles[c]; return a; };
if (D.view === 'solution' || D.view === 'book') { const r = $('[data-book]'); if (r) booking(r, D.book, ctxAnswers); }

// ---------- eşleştirici ----------
if (D.view === 'match') {
  const box = $('#match'); const ans = {}; let i = 0;
  const step = () => { const q = D.qs[i];
    box.innerHTML = '<div class="prog" aria-hidden="true">' + D.qs.map((_, k) => '<i class="' + (k <= i ? 'on' : '') + '"></i>').join('') + '</div><p class="qn">' + esc(D.m.step) + ' ' + (i + 1) + ' ' + D.m.of + ' ' + D.qs.length + '</p><h2 tabindex="-1">' + esc(q.q) + '</h2>' +
      '<div class="opts" role="group" aria-label="' + esc(q.q) + '">' + q.a.map(o => '<button type="button" class="opt" data-v="' + esc(o.v) + '" aria-pressed="' + (ans[q.key] === o.v) + '">' + esc(o.l) + '</button>').join('') + '</div>' +
      '<div class="nav">' + (i ? '<button type="button" data-back>' + esc(D.m.back) + '</button>' : '<span></span>') + '</div>';
    $('h2', box).focus({ preventScroll: true });
    $$('.opt', box).forEach(b => b.addEventListener('click', () => { ans[q.key] = b.dataset.v; i++; if (i < D.qs.length) step(); else result(); }));
    const bk = $('[data-back]', box); if (bk) bk.addEventListener('click', () => { i--; step(); }); };
  const result = async () => {
    let r; try { r = await api('/api/route?' + new URLSearchParams({ lang: L, ...ans })); } catch { r = { primary: ans.sorun, secondary: null }; }
    const x = D.sols[r.primary]; const y = r.secondary && D.sols[r.secondary]; const sorunLabel = x ? x.title : '';
    const answers = { sektor: ans.sektor, sorun: sorunLabel, hedef: ans.hedef, zaman: ans.zaman, cozum: x.short }; ss.set('av_answers', answers);
    box.innerHTML = '<div class="result"><div class="prog" aria-hidden="true">' + D.qs.map(() => '<i class="on"></i>').join('') + '</div><h2 tabindex="-1">' + esc(D.m.resultTitle) + '</h2><p class="muted">' + esc(D.m.resultLead) + '</p>' +
      '<div class="first"><p class="svc">' + esc(x.short) + '</p><h3>' + esc(x.title) + '</h3><p>' + esc(x.lead) + '</p><ol>' + x.route.map((s, k) => '<li><b>' + esc(D.stages[k]) + ':</b> ' + esc(s) + '</li>').join('') + '</ol><p style="margin:18px 0 0"><a class="link" style="color:var(--paper)" href="' + x.href + '">' + (L === 'en' ? 'Read the full solution' : 'Çözümün tamamını oku') + '</a></p></div>' +
      (y ? '<p>' + esc(D.m.also) + ' <a class="link" href="' + y.href + '">' + esc(y.short) + '</a></p>' : '') + '<div class="nav"><button type="button" data-again>' + esc(D.m.back) + '</button></div></div>';
    $('h2', box).focus(); $('[data-again]', box).addEventListener('click', () => { i = D.qs.length - 1; $('#after').hidden = true; step(); });
    const after = $('#after'); after.hidden = false; const bx = $('[data-book]', after); bx.querySelector('h2').textContent = D.m.bookTitle; booking(bx, D.book, () => ss.get('av_answers', {}));
    const ld = $('#lead'); ld.innerHTML = '<details><summary class="link" style="cursor:pointer;list-style:none">' + esc(D.m.notNow) + '</summary><form class="form" novalidate><label>' + esc(D.book.email) + '<input name="email" type="email" required autocomplete="email"></label><label>' + esc(D.book.name) + '<input name="name" autocomplete="name"></label>' +
      '<label class="hp" aria-hidden="true">Fax<input name="fax" tabindex="-1" autocomplete="off"></label><label class="check full"><input type="checkbox" name="kvkk"><span>' + D.book.kvkk + '</span></label><label class="check full"><input type="checkbox" name="iys"><span>' + esc(D.book.iys) + '</span></label>' +
      '<div class="full"><button class="btn btn-line" type="submit">' + esc(D.m.sendBtn) + '</button><p class="err" role="alert" hidden></p></div></form></details>';
    $('form', ld).addEventListener('submit', async (e) => { e.preventDefault(); const fm = e.target; const er = $('.err', fm); const v = Object.fromEntries(new FormData(fm));
      if (!fm.elements.kvkk.checked || !v.email) { er.textContent = L === 'en' ? 'Enter your email and confirm the privacy notice.' : 'E-postanızı yazın ve aydınlatma metnini onaylayın.'; er.hidden = false; return; }
      try { await api('/api/lead', { ...v, kvkk: true, iys: fm.elements.iys.checked, lang: L, answers: ss.get('av_answers', {}), pages: ss.get('av_pages', []) }); fm.outerHTML = '<p class="muted">' + esc(D.m.sent) + '</p>'; }
      catch (x) { er.textContent = x.message || D.book.error; er.hidden = false; } });
  };
  step();
}

// ---------- iptal ----------
if (D.view === 'cancel') { const f = $('[data-cancel]'); if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const b = $('button', f); b.disabled = true;
  try { await api('/api/cancel', { token: f.elements.t.value, lang: L }); $('#cancel').innerHTML = '<h1 style="font-size:32px;margin-bottom:12px">' + esc(D.c.title) + '</h1><p>' + esc(D.c.done) + '</p>'; }
  catch (x) { $('#cancel').innerHTML = '<h1 style="font-size:32px;margin-bottom:12px">' + esc(D.c.title) + '</h1><p class="err">' + esc(x.status === 404 ? D.c.bad : D.err) + '</p>'; } }); }
})();`;
