// Arvela Social kanallar (0.4): anahtar kasası, imzalı görsel adresi, LinkedIn metin kaçışı, Meta/LinkedIn paylaşım akışı (sahte fetch).
import assert from 'node:assert';
process.env.SOCIAL_TOKEN_KEY = 'ab'.repeat(32); process.env.SOCIAL_URL = 'https://social.test';
process.env.META_APP_ID = 'app'; process.env.META_APP_SECRET = 's'; process.env.META_POLL_MS = '1';
const v = await import('../app/social/vault.mjs');
const P = await import('../app/social/providers.mjs');

// --- kasa
const sealed = v.seal('gizli-anahtar'); assert.ok(sealed.startsWith('v1:') && !sealed.includes('gizli'));
assert.equal(v.open(sealed), 'gizli-anahtar'); assert.notEqual(v.seal('x'), v.seal('x'), 'her şifrelemede yeni IV');
assert.equal(v.open(sealed.slice(0, -4) + 'AAAA'), null, 'bozulan veri açılmaz');
assert.deepEqual(v.openJson(v.sealJson([{ a: 1 }])), [{ a: 1 }]);
const path = v.signedMediaPath(7, 60, 1_000_000_000_000); const [, , id, exp, sig] = path.split('/');
assert.equal(id, '7'); assert.ok(v.checkMediaSig(7, exp, sig, 1_000_000_000_000));
assert.ok(!v.checkMediaSig(8, exp, sig, 1_000_000_000_000), 'başka görsel'); assert.ok(!v.checkMediaSig(7, exp, sig, 1_000_000_100_000), 'süresi geçti');
const k = process.env.SOCIAL_TOKEN_KEY; delete process.env.SOCIAL_TOKEN_KEY; assert.equal(v.vaultReady(), false); assert.throws(() => v.seal('x')); process.env.SOCIAL_TOKEN_KEY = k;

// --- LinkedIn metni
assert.equal(P.liEscape('Yeni (sınırlı) ürün #kış_2026 @ali *yıldız*'), 'Yeni \\(sınırlı\\) ürün {hashtag|\\#|kış_2026} \\@ali \\*yıldız\\*');
assert.equal(P.liEscape('a\\b'), 'a\\\\b');

// --- Meta yetki adresi
const au = new URL(P.meta.authUrl('durum123'));
assert.equal(au.searchParams.get('redirect_uri'), 'https://social.test/kanallar/meta/donus'); assert.ok(au.searchParams.get('scope').includes('instagram_content_publish'));

// --- sahte fetch ile paylaşım
const calls = []; let reply = () => ({});
globalThis.fetch = async (url, o = {}) => { const u = String(url); const body = o.body instanceof URLSearchParams ? Object.fromEntries(o.body) : o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null;
  calls.push({ u, m: o.method || 'GET', body, h: o.headers }); const r = reply(u, o.method || 'GET', body);
  return new Response(JSON.stringify(r.json ?? {}), { status: r.status || 200, headers: r.headers || {} }); };
reply = (u, m) => /\/media$/.test(u) ? { json: { id: 'c1' } } : /c1\?/.test(u) ? { json: { status_code: 'FINISHED' } } : /media_publish/.test(u) ? { json: { id: 'm9' } } : /m9\?/.test(u) ? { json: { permalink: 'https://ig/p/9' } } : { json: { id: 'x' } };
const ig = { kind: 'ig_business', external_id: '911' };
const r1 = await P.meta.publish(ig, 'tok', { text: 'Merhaba', first_comment: 'ilk' }, [{ mime: 'image/jpeg', url: 'https://social.test/m/1/2/s' }]);
assert.deepEqual(r1, { id: 'm9', url: 'https://ig/p/9' }); assert.ok(calls.some(c => /m9\/comments/.test(c.u)), 'ilk yorum');
await assert.rejects(P.meta.publish(ig, 'tok', { text: 'x' }, [{ mime: 'image/png', url: 'u' }]), (e) => e.retry === false && /JPEG/.test(e.message));
await assert.rejects(P.meta.publish(ig, 'tok', { text: 'x' }, []), /en az bir görsel/);
calls.length = 0; reply = (u) => /photos/.test(u) ? { json: { id: 'ph' + calls.length } } : { json: { id: '111_5' } };
const r2 = await P.meta.publish({ kind: 'fb_page', external_id: '111' }, 'tok', { text: 'Çoklu' }, [{ mime: 'image/jpeg', url: 'a' }, { mime: 'image/jpeg', url: 'b' }]);
assert.equal(r2.id, '111_5'); const feed = calls.find(c => /111\/feed/.test(c.u)); assert.equal(JSON.parse(feed.body.attached_media).length, 2);
assert.ok(calls.filter(c => /photos/.test(c.u)).every(c => c.body.published === 'false'));
reply = () => ({ status: 400, json: { error: { message: 'Session has expired', type: 'OAuthException', code: 190 } } });
await assert.rejects(P.meta.publish({ kind: 'fb_page', external_id: '1' }, 't', { text: 'a' }, []), (e) => e.auth === true && e.retry === false);
reply = () => ({ status: 500, json: { error: { message: 'tmp', code: 2 } } });
await assert.rejects(P.meta.publish({ kind: 'fb_page', external_id: '1' }, 't', { text: 'a' }, []), (e) => e.retry === true);
// LinkedIn
calls.length = 0;
reply = (u, m) => /initializeUpload/.test(u) ? { json: { value: { uploadUrl: 'https://up/1', image: 'urn:li:image:1' } } } : /^https:\/\/up/.test(u) ? { status: 201 } : /rest\/posts/.test(u) ? { status: 201, headers: { 'x-restli-id': 'urn:li:share:5' } } : {};
const r3 = await P.linkedin.publish({ kind: 'li_person', external_id: 'urn:li:person:a' }, 'tok', { text: 'Selam #kahve' }, [{ mime: 'image/jpeg', bytes: Buffer.from('x') }]);
assert.equal(r3.id, 'urn:li:share:5'); const post = calls.find(c => /rest\/posts/.test(c.u));
assert.equal(post.body.content.media.id, 'urn:li:image:1'); assert.equal(post.body.commentary, 'Selam {hashtag|\\#|kahve}'); assert.ok(post.h['Linkedin-Version']);
console.log('social kanal testleri tamam');
