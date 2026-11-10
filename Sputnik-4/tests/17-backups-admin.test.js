// Администрирование → «💾 Резервные копии»: список, удаление выбранных, «старше N дней»
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });

test('резервные копии: удаление выбранных и старых, свежая остаётся', async () => {
  const B = path.join(S.dir, 'backups');
  fs.readdirSync(B).forEach(f => fs.rmSync(path.join(B, f), { force: true }));   // автокопия при старте — не мешает
  const mk = (name, daysAgo) => { const p = path.join(B, name); fs.writeFileSync(p, Buffer.alloc(2048)); const t = new Date(Date.now() - daysAgo * 86400000); fs.utimesSync(p, t, t); };
  mk('backup_auto_new.db', 0); mk('backup_2026-01-01T00-00-00.db', 1); mk('backup_auto_a.db', 2);
  mk('backup_auto_b.db', 40); mk('backup_auto_c.db', 50); mk('backup_auto_d.db', 60);
  fs.writeFileSync(path.join(B, 'backup_auto_d.db-wal'), 'x');
  let r = await S.api('GET', '/api/admin/backups');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.items.length, 6); assert.strictEqual(r.body.items[0].name, 'backup_auto_new.db');
  // самую свежую не удалить, остальные — да
  r = await S.api('POST', '/api/admin/backups/delete', { names: ['backup_auto_new.db', 'backup_auto_a.db'] });
  assert.strictEqual(r.body.deleted, 1); assert.strictEqual(r.body.kept, 'backup_auto_new.db');
  assert.ok(fs.existsSync(path.join(B, 'backup_auto_new.db')) && !fs.existsSync(path.join(B, 'backup_auto_a.db')));
  // имена с путём — отказ
  assert.strictEqual((await S.api('POST', '/api/admin/backups/delete', { names: ['..\\test.db'] })).status, 400);
  assert.strictEqual((await S.api('POST', '/api/admin/backups/delete', { names: ['../test.db'] })).status, 400);
  // старше 30 дней, оставить 3 последних: из 5 (new, 2026-01-01, b40, c50, d60) удалятся c50 и d60
  r = await S.api('POST', '/api/admin/backups/cleanup', { days: 30, keep: 3 });
  assert.strictEqual(r.body.deleted, 2); assert.strictEqual(r.body.left, 3);
  assert.ok(!fs.existsSync(path.join(B, 'backup_auto_d.db')) && !fs.existsSync(path.join(B, 'backup_auto_d.db-wal')));
  assert.ok(fs.existsSync(path.join(B, 'backup_auto_b.db')));
  assert.ok(fs.existsSync(path.join(S.dir, 'test.db')), 'база не тронута');
});
