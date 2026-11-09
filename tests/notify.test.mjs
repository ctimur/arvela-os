import { plan, KINDS } from '../app/ext-notify.js';
import assert from 'node:assert';

// sahte veritabanı: sorgu metnine göre yanıt
const db = (map) => ({
  one: async (sql) => { for (const [k, v] of Object.entries(map)) if (sql.includes(k)) return typeof v === 'function' ? v() : v; return null; },
  all: async (sql) => { for (const [k, v] of Object.entries(map)) if (sql.includes(k)) return v; return []; },
});
const T = { id: 5, title: 'Tasarım', assignee_id: 7, project_id: 2, project: 'Lotus' };

let n = await plan('task.create', { id: 5 }, 1, 1, db({ 'FROM tasks t JOIN projects': T }));
assert.equal(n.length, 1); assert.deepEqual(n[0].to, [7]); assert.equal(n[0].kind, 'gorev'); assert.equal(n[0].href, '/gorev/5');
n = await plan('task.create', { id: 5 }, 7, 1, db({ 'FROM tasks t JOIN projects': T }));
assert.equal(n.length, 0, 'kendine atadığı görev için bildirim yok');

n = await plan('task.status', { id: 5, status: 'bitti' }, 7, 1, db({ 'FROM tasks t JOIN projects': T, "ready_at > now()": [{ id: 6, title: 'Test', assignee_id: 9 }] }));
assert.ok(n.some(x => x.kind === 'sira' && x.to[0] === 9 && x.href === '/gorev/6'), 'sıra sende');

n = await plan('task.note', { id: 5 }, 1, 1, db({ 'FROM tasks t JOIN projects': T, 'FROM task_comments': { id: 33, body: 'Logo dosyası eklendi '.repeat(20) } }));
assert.equal(n[0].kind, 'not'); assert.ok(n[0].body.length <= 140); assert.equal(n[0].ref, 'note:33');

n = await plan('approval.decide', { id: 3, decision: 'reddedildi' }, null, 1, db({ 'FROM approvals ap': { id: 3, title: 'Metin', requested_by: 4, client: 'Lotus' }, "role='admin'": [{ id: 1 }, { id: 4 }] }));
assert.deepEqual(n[0].to.sort(), [1, 4], 'isteyen + yöneticiler, tekrarsız'); assert.ok(n[0].title.includes('düzeltme istedi'));

n = await plan('ai.result', { job: 8, ok: true }, null, 1, db({ 'FROM ai_jobs j': { id: 8, task_id: 5, title: 'Tasarım', assignee_id: 7 } }));
assert.equal(n[0].kind, 'yz');
assert.equal((await plan('settings.update', {}, 1, 1, db({}))).length, 0, 'ilgisiz işlem');
for (const x of ['gorev', 'sira', 'not', 'karar', 'para', 'satis', 'yz']) assert.ok(KINDS[x]);
console.log('notify: ok');
