import { parseRequest, parseDecision, checkFile, parseMultipart, maskEmail, validEmail, decisionForm, decisionSummary, newToken, newCode, mailHtml, KINDS } from '../app/ext-decisions.js';
import assert from 'node:assert';

// istek türleri
assert.deepEqual(parseRequest({}), { kind: 'onay', options: null });
assert.deepEqual(parseRequest({ kind: 'secim', options: 'Mavi\n\n Yeşil \nKırmızı' }).options, ['Mavi', 'Yeşil', 'Kırmızı']);
assert.ok(parseRequest({ kind: 'secim', options: 'Tek' }).error);
assert.deepEqual(parseRequest({ kind: 'butce', amount: '12.500,50', currency: 'EUR', scope: 'Ana sayfa + 3 iç sayfa' }).options, { amount: 12500.5, currency: 'EUR', scope: 'Ana sayfa + 3 iç sayfa' });
assert.ok(parseRequest({ kind: 'butce', amount: '' }).error);
assert.equal(parseRequest({ kind: 'yok' }).kind, 'onay');

// kararlar
assert.deepEqual(parseDecision({ kind: 'onay' }, { decision: 'onaylandi' }), { status: 'onaylandi', comment: null, choice: null });
assert.ok(parseDecision({ kind: 'onay' }, { decision: 'reddedildi' }).error, 'düzeltme notsuz olmaz');
assert.equal(parseDecision({ kind: 'onay' }, { decision: 'reddedildi', comment: 'Logo büyük' }).status, 'reddedildi');
const sec = { kind: 'secim', options: ['A', 'B'] };
assert.equal(parseDecision(sec, { decision: 'onaylandi', choice: '1' }).choice, 'B');
assert.ok(parseDecision(sec, { decision: 'onaylandi', choice: '7' }).error);
assert.ok(parseDecision(sec, { decision: 'onaylandi' }).error);
assert.equal(parseDecision({ kind: 'secim', options: [] }, { choice_text: 'Lacivert' }).choice, 'Lacivert');
assert.equal(parseDecision({ kind: 'butce', options: { amount: 1000, currency: 'TRY' } }, { decision: 'onaylandi' }).choice, 'Kabul: 1000 TRY');
assert.ok(parseDecision({ kind: 'bilgi' }, {}).error);
assert.equal(parseDecision({ kind: 'bilgi' }, { answer: 'Alan adı: x.com' }).choice, 'Alan adı: x.com');
assert.equal(parseDecision({ kind: 'bilgi' }, { decision: 'reddedildi' }, [{}]).status, 'onaylandi', 'bilgi her zaman yanıttır');

// dosya
assert.equal(checkFile({ filename: 'a.pdf', data: Buffer.from('x') }).mime, 'application/pdf');
assert.ok(checkFile({ filename: 'a.html', data: Buffer.from('x') }).error);
assert.ok(checkFile({ filename: 'a.svg', data: Buffer.from('x') }).error);
assert.ok(checkFile({ filename: 'b.png', data: Buffer.alloc(8 * 1024 * 1024 + 1) }).error);
assert.equal(checkFile({ filename: '', data: Buffer.alloc(0) }), null);
assert.equal(checkFile({ filename: '../../x"y.PNG', data: Buffer.from('x') }).name.includes('/'), false);

// multipart
const bd = '----arv123';
const raw = Buffer.concat([Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="answer"\r\n\r\nMerhaba dünya\r\n--${bd}\r\nContent-Disposition: form-data; name="files"; filename="r.png"\r\nContent-Type: image/png\r\n\r\n`), Buffer.from([0, 1, 2, 13, 10, 255]), Buffer.from(`\r\n--${bd}\r\nContent-Disposition: form-data; name="files"; filename=""\r\n\r\n\r\n--${bd}--\r\n`)]);
const mp = parseMultipart(raw, `multipart/form-data; boundary=${bd}`);
assert.equal(mp.fields.answer, 'Merhaba dünya');
assert.equal(mp.files.length, 1); assert.deepEqual([...mp.files[0].data], [0, 1, 2, 13, 10, 255]);
assert.deepEqual(parseMultipart(Buffer.from('x'), 'multipart/form-data'), { fields: {}, files: [] });

// e-posta ve belirteçler
assert.equal(maskEmail('canturk@firma.com.tr'), 'c******@f****.com.tr');
assert.equal(maskEmail('yok'), '');
assert.ok(validEmail('a@b.co') && !validEmail('a@b') && !validEmail('a b@c.com'));
assert.ok(/^[A-Za-z0-9_-]{43}$/.test(newToken())); assert.ok(/^\d{6}$/.test(newCode()));
assert.ok(!mailHtml('<b>', ['<script>'], ['Aç', 'https://x/"']).includes('<script>'));

// formlar: her türde doğru alanlar, kaçış
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
assert.ok(decisionForm({ id: 1, kind: 'secim', title: 't', options: ['<x>', 'B'] }, '/a', '', h).includes('&lt;x&gt;'));
assert.ok(decisionForm({ id: 1, kind: 'bilgi', title: 't' }, '/a', '', h).includes('multipart/form-data'));
assert.ok(decisionForm({ id: 1, kind: 'butce', title: 't', options: { amount: 1500, currency: 'EUR' } }, '/a', '', h).includes('1.500 EUR'));
assert.ok(decisionForm({ id: 1, kind: 'onay', title: 't' }, '/a', '<i>', h).includes('Düzeltme iste'));
assert.ok(decisionSummary({ kind: 'secim', options: ['A'], choice: 'A', decided_via: 'baglanti', decided_name: 'Can' }, [{ id: 3, name: 'x.pdf', size: 2048 }], h, (f) => '/f/' + f.id).includes('/f/3'));
assert.equal(Object.keys(KINDS).length, 4);
console.log('decisions: ok');
