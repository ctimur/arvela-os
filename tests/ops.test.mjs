import { backupState } from '../app/ext-ops.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert';

const now = Date.parse('2026-11-10T10:00:00Z'); const ago = (h) => new Date(now - h * 3600e3).toISOString();
assert.equal(backupState([], now).level, 'warn', 'henüz çalışmadı');
assert.equal(backupState([{ kind: 'yedek', ok: false, detail: 'Yedek ayarları eksik', at: ago(1) }], now).level, 'bad', 'hiç başarılı yedek yok');
const good = [{ kind: 'yedek', ok: true, detail: 'x', at: ago(5) }, { kind: 'geri_yukleme', ok: true, detail: 'y', at: ago(48) }];
assert.equal(backupState(good, now).level, 'ok');
assert.equal(backupState([{ kind: 'yedek', ok: true, at: ago(40) }, good[1]], now).level, 'bad', '36 saatten eski');
assert.equal(backupState([{ kind: 'yedek', ok: false, detail: 'pg_dump', at: ago(1) }, ...good], now).level, 'warn', 'son deneme hatalı ama dünkü yedek var');
assert.equal(backupState([good[0], { kind: 'geri_yukleme', ok: true, at: ago(24 * 10) }], now).level, 'warn', 'test eski');

// yedek betiği: sözdizimi, gizli değer basmıyor, açık depoya göndermiyor
execFileSync('sh', ['-n', 'app/backup.sh']);
const sh = fs.readFileSync('app/backup.sh', 'utf8');
assert.ok(!/echo[^\n]*\$(BACKUP_PASSPHRASE|BACKUP_GITHUB_TOKEN|DB_PASSWORD)/.test(sh), 'gizli değer yazdırılmaz');
assert.ok(sh.includes('-pass env:BACKUP_PASSPHRASE') && sh.includes('.private'), 'parola ortamdan, depo özel olmalı');
const compose = fs.readFileSync('deploy/docker-compose.yml', 'utf8');
assert.ok(compose.includes('appsrc:/src:ro') && compose.includes('BACKUP_PASSPHRASE: ${BACKUP_PASSPHRASE}'));
console.log('ops: ok');
