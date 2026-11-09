import { inviteHash, registerInvite, INVITE_DAYS } from '../app/ext-invite.js';
import assert from 'node:assert';
assert.equal(inviteHash('abc'), inviteHash('abc')); assert.notEqual(inviteHash('abc'), inviteHash('abd')); assert.equal(inviteHash('x').length, 64);
assert.equal(INVITE_DAYS, 7);
const routes = {}; registerInvite({ route: (m, p, fn) => { routes[`${m} ${p}`] = fn; } });
for (const k of ['POST /musteriler/:id/davet', 'GET /davet/:token', 'POST /davet/:token']) assert.ok(routes[k], k);
