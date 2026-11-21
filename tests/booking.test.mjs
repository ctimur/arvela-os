// Arvela OS 0.34: 15 dk görüşme — ayar doğrulama, boş saat hesabı, randevu doğrulama.
import assert from 'node:assert';
import { normalizeCfg, freeSlots, validBooking, toUtc, localDate, webKey, DEFAULT_CFG } from '../app/ext-booking.js';

const c = normalizeCfg({}); assert.deepEqual([c.days, c.start, c.end, c.minutes], [[1, 2, 3, 4, 5], '10:00', '19:00', 15]);
assert.equal(normalizeCfg({ start: '19:00', end: '10:00' }).start, '10:00', 'bitiş başlangıçtan önce olamaz');
assert.equal(normalizeCfg({ minutes: 5 }).minutes, 15); assert.equal(normalizeCfg({ meetUrl: 'javascript:alert(1)' }).meetUrl, '');
assert.deepEqual(normalizeCfg({ days: ['1', 9, 3, 3] }).days, [1, 3]); assert.equal(normalizeCfg({ title: 'a<b>\nc' }).title, 'a b  c');

// Pazartesi 23 Kasım 2026, 08:00 İstanbul
const now = toUtc('2026-11-23', '08:00');
const cfg = normalizeCfg({ start: '10:00', end: '11:00', minutes: 15, buffer: 5, leadHours: 0, horizonDays: 7 });
let d = freeSlots(cfg, [], now, '2026-11-23', 1); assert.deepEqual(d[0].slots, ['10:00', '10:20', '10:40'], '15 dk + 5 dk ara');
d = freeSlots(cfg, [{ starts_at: toUtc('2026-11-23', '10:20'), ends_at: toUtc('2026-11-23', '10:35') }], now, '2026-11-23', 1);
assert.deepEqual(d[0].slots, ['10:00', '10:40'].filter(x => x !== '10:00' || true).filter(x => x === '10:40' || x === '10:00'), 'dolu saat ve arası düşer');
assert.ok(!d[0].slots.includes('10:20'));
assert.deepEqual(freeSlots(cfg, [], now, '2026-11-28', 1), [], 'cumartesi kapalı');
assert.deepEqual(freeSlots({ ...cfg, closed: ['2026-11-23'] }, [], now, '2026-11-23', 1), [], 'tatil günü');
assert.deepEqual(freeSlots({ ...cfg, leadHours: 3 }, [], now, '2026-11-23', 1)[0].slots, ['10:00', '10:20', '10:40'].filter(t => toUtc('2026-11-23', t) >= new Date(now.getTime() + 3 * 3600e3)), 'en erken 3 saat sonra');
assert.deepEqual(freeSlots({ ...cfg, breaks: [{ start: '10:15', end: '10:30' }] }, [], now, '2026-11-23', 1)[0].slots, ['10:00', '10:40'].filter(t => t !== '10:00' || true).slice(0, 2).filter(t => ['10:00', '10:40'].includes(t)), 'öğle arası');
assert.deepEqual(freeSlots({ ...cfg, perDay: 1 }, [{ starts_at: toUtc('2026-11-23', '10:00'), ends_at: toUtc('2026-11-23', '10:15') }], now, '2026-11-23', 1)[0].slots, [], 'günlük sınır doldu');
assert.equal(freeSlots(cfg, [], now, '2026-12-30', 1).length, 0, 'ufkun ötesi');
assert.equal(localDate(toUtc('2026-11-23', '01:00')), '2026-11-23');
assert.equal(freeSlots(DEFAULT_CFG.days && normalizeCfg({ leadHours: 0 }), [], now, '2026-11-23', 1)[0].slots.length, 27, '10:00–19:00, 20 dk adım');

// randevu doğrulama
assert.ok(validBooking({ name: 'A', email: 'kotu', kvkk: true, date: '2026-11-23', time: '10:00' }).error);
assert.ok(validBooking({ name: 'A', email: 'a@b.co', kvkk: false, date: '2026-11-23', time: '10:00' }).error, 'aydınlatma onayı şart');
assert.ok(validBooking({ name: 'A', email: 'a@b.co', kvkk: true, date: '2026-11-23', time: '25:00' }).error);
const v = validBooking({ name: ' Ali ', email: 'Ali@B.co', kvkk: true, date: '2026-11-23', time: '10:00', answers: { sorun: 'Müşteri bulamıyoruz', liste: ['a', 'b'] }, pages: ['web', 'emlak'], lang: 'en', iys: true });
assert.deepEqual([v.name, v.email, v.lang, v.iys, v.answers.liste, v.pages], ['Ali', 'ali@b.co', 'en', true, 'a, b', ['web', 'emlak']]);
assert.equal(webKey(''), ''); assert.notEqual(webKey('x'), webKey('y'));
console.log('randevu testleri tamam');
