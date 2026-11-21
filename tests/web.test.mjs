// arveladigital.com: içerik bütünlüğü, eşleştirici, sayfalar ve sahte Arvela OS köprüsüyle randevu akışı
import assert from 'node:assert/strict';
import http from 'node:http';

const bridge = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c; const body = b ? JSON.parse(b) : null;
  const ok = req.headers.authorization === 'Bearer test-key';
  res.setHeader('Content-Type', 'application/json');
  if (!ok) { res.writeHead(403); return res.end('{"error":"Yetkisiz."}'); }
  if (req.url === '/api/web/musait') return res.end(JSON.stringify({ minutes: 15, days: [{ date: '2030-01-07', slots: ['10:00', '10:20'] }] }));
  if (req.url === '/api/web/randevu') { if (body.time === '10:20') { res.writeHead(409); return res.end('{"error":"Bu saat artık dolu."}'); } bridge.last = body; res.writeHead(201); return res.end(JSON.stringify({ ok: true, day: 'x', time: body.time })); }
  if (req.url === '/api/web/talep') { res.writeHead(201); return res.end('{"ok":true}'); }
  if (req.url === '/api/web/iptal') { res.writeHead(404); return res.end('{"error":"yok"}'); }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => bridge.listen(0, r));
process.env.WEB_BRIDGE_URL = `http://127.0.0.1:${bridge.address().port}`; process.env.WEB_BRIDGE_KEY = 'test-key'; process.env.WEB_URL = 'https://arveladigital.com';

const { T, SOLUTIONS, recommend } = await import('../app/web/content.mjs');
const { server } = await import('../app/web/server.mjs');

// içerik: iki dil aynı yapıda
for (const s of SOLUTIONS) for (const l of ['tr', 'en']) { const x = T[l].sol[s]; assert.ok(x.title && x.short && x.lead, `${l}/${s}`); assert.equal(x.route.length, 3); assert.ok(x.signs.length >= 3 && x.deliver.length >= 3); }
assert.equal(T.tr.match.qs.length, T.en.match.qs.length); assert.equal(T.tr.faq.length, T.en.faq.length);
// eşleştirici
assert.deepEqual(recommend({ sorun: 'sosyal', sektor: 'Emlak' }), { primary: 'sosyal', secondary: 'emlak', urgent: false });
assert.equal(recommend({ sorun: 'web', hedef: 'Daha çok müşteri' }).secondary, 'reklam');
assert.equal(recommend({ sorun: 'yok' }).primary, 'web');
assert.equal(recommend({ sorun: 'surec', hedef: 'Save the team time', zaman: 'Right away, this month' }, 'en').secondary, 'yapay-zeka');
assert.equal(recommend({ sorun: 'surec', zaman: 'Right away, this month' }, 'en').urgent, true);

await new Promise(r => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
const get = (p, h = {}) => fetch(base + p, { headers: h, redirect: 'manual' });
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

const paths = ['/', '/en', '/eslestir', '/en/match', '/randevu', '/en/book', '/hakkimizda', '/en/about', '/kvkk', '/en/privacy', '/cerez', '/en/cookies', ...SOLUTIONS.map(s => `/cozum/${s}`), '/en/solutions/real-estate', '/en/solutions/ai'];
for (const p of paths) { const r = await get(p); assert.equal(r.status, 200, p); const h = await r.text(); assert.ok(h.includes('<main id="main">') && h.includes('/site.js'), p); assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'")); assert.ok(!/<script>(?!<)/.test(h), `satır içi betik yok: ${p}`); }
assert.ok((await (await get('/')).text()).includes('hreflang="en"'));
assert.equal((await get('/cozum/yok')).status, 404); assert.equal((await get('/en/solutions/web')).status, 404);
assert.equal((await get('/cozum/web/')).status, 301);
assert.equal(await new Promise(r => http.get(base + '/', { headers: { host: 'www.arveladigital.com' } }, (x) => { x.resume(); r(x.headers.location); })), 'https://arveladigital.com/');
for (const a of ['/site.css', '/site.js', '/favicon.svg', '/og.png', '/assets/inter-400.woff', '/robots.txt', '/sitemap.xml']) assert.equal((await get(a)).status, 200, a);
assert.ok((await (await get('/sitemap.xml')).text()).includes('/en/solutions/real-estate'));
assert.equal((await get('/randevu/iptal?t=kisa')).status, 400); assert.equal((await get('/randevu/iptal?t=' + 'a'.repeat(24))).status, 200);

// API
const sl = await (await get('/api/slots')).json(); assert.equal(sl.days[0].slots[0], '10:00');
assert.equal((await get('/api/route?sorun=emlak&lang=tr')).status, 200);
assert.equal((await post('/api/book', { name: 'A', email: 'a@b.co', date: '2030-01-07', time: '10:00' })).status, 400, 'KVKK onayı şart');
const ok = await post('/api/book', { name: 'Ayşe', email: 'a@b.co', kvkk: true, iys: true, date: '2030-01-07', time: '10:00', answers: { sorun: 'x'.repeat(500) }, pages: Array(40).fill('/p'), lang: 'en' });
assert.equal(ok.status, 201); assert.equal(bridge.last.answers.sorun.length, 300); assert.equal(bridge.last.pages.length, 30); assert.equal(bridge.last.lang, 'en'); assert.equal(bridge.last.iys, true);
const taken = await post('/api/book', { name: 'B', email: 'b@b.co', kvkk: true, date: '2030-01-07', time: '10:20' }); assert.equal(taken.status, 409); assert.match((await taken.json()).error, /dolu/);
bridge.last = null; assert.equal((await post('/api/book', { fax: 'bot', name: 'B', kvkk: true })).status, 201); assert.equal(bridge.last, null, 'bal küpü OS\'e gitmez');
assert.equal((await post('/api/lead', { email: 'l@b.co', kvkk: true })).status, 201);
assert.equal((await post('/api/cancel', { token: 'a'.repeat(24) })).status, 404);
assert.equal((await fetch(base + '/api/book', { method: 'POST', body: 'x' })).status, 415);
assert.equal((await fetch(base + '/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://kotu.example' }, body: '{}' })).status, 403);

server.close(); bridge.close();
console.log('web sitesi testleri tamam');
