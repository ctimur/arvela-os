import { extract, normalize, nextDue, addDays, describe, FORMAT, START, END, KINDS } from '../app/ext-suggest.js';
import assert from 'node:assert';

const raw = `# Metin taslağı\nBaşlık...\n\nKontrol listesi:\n- a\n\n${START}\n\`\`\`json\n${JSON.stringify({ oneriler: [
  { tur: 'alt_gorev', baslik: 'Görselleri hazırla', rol: 'freelancer', gun: 3 },
  { tur: 'gorev', baslik: 'SEO başlıkları', aciklama: 'x', rol: 'kotu', gun: 999 },
  { tur: 'kontrol', maddeler: ['Mobil test', '', 'Form test'] },
  { tur: 'soru', baslik: 'Logo', soru: 'Vektörel logo dosyanızı gönderir misiniz?' },
  { tur: 'hatirlatma', baslik: 'Müşteriye dön', gun: 2, tekrar_gun: 3, kosul: 'yok' },
  { tur: 'yz_isi', baslik: 'Meta açıklamaları', istem: '5 sayfa için meta açıklaması' },
  { tur: 'fikir', baslik: 'A/B testi', aciklama: 'İki başlıkla dene' },
  { tur: 'sil_her_seyi', baslik: 'x' }, { tur: 'gorev' }, { tur: 'yz_isi', baslik: 'istemsiz' }] })}\n\`\`\`\n${END}`;
const ex = extract(raw);
assert.ok(ex.text.startsWith('# Metin taslağı') && !ex.text.includes(START) && !ex.text.includes('"oneriler"'));
assert.equal(ex.error, null);
assert.deepEqual(ex.items.map(i => i.tur), ['alt_gorev', 'gorev', 'kontrol', 'soru', 'hatirlatma', 'yz_isi', 'fikir'], 'bilinmeyen/eksik öneriler atlanır');
assert.equal(ex.items[1].rol, 'ekip'); assert.equal(ex.items[1].gun, 90, 'sınır');
assert.deepEqual(ex.items[2].maddeler, ['Mobil test', 'Form test']);
assert.equal(ex.items[4].kosul, 'gorev_bitmediyse'); assert.equal(ex.items[4].tekrar_gun, 3);
assert.deepEqual(extract('Sadece metin'), { text: 'Sadece metin', items: [], error: null });
assert.equal(extract(`a ${START} {bozuk ${END}`).error, 'Öneri bloğu okunamadı');
assert.equal(extract(`a ${START} {bozuk`).text, 'a');
assert.equal(normalize({ oneriler: Array(30).fill({ tur: 'fikir', baslik: 'x' }) }).length, 15);
assert.equal(normalize(null).length, 0);
assert.ok(normalize({ oneriler: [{ tur: 'fikir', baslik: 'a'.repeat(500) }] })[0].baslik.length === 160);

assert.equal(addDays('2026-11-08', 3), '2026-11-11');
const now = new Date('2026-11-20T10:00:00Z');
assert.equal(nextDue('2026-11-10T09:00:00Z', 3, now), '2026-11-22T09:00:00.000Z', 'geçmişte kalan tekrar ileri taşınır');
assert.equal(nextDue('2026-11-10T09:00:00Z', 0, now), null);
assert.ok(describe(ex.items[4]).includes('her 3 günde') && describe(ex.items[0]).includes('Freelancer'));
assert.ok(FORMAT.includes(START) && FORMAT.includes('fikir') && Object.keys(KINDS).length === 7);
console.log('suggest: ok');
