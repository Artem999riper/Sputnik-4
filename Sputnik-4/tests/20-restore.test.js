// Восстановление из резервной копии: только админ, проверка копии, копия текущей базы
// перед восстановлением, подмена файла при следующем запуске (не на ходу), путь — PGK_DB
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { startServer } = require('./helpers');

test('восстановление из копии', async () => {
  let S = await startServer({ keep: true });
  const dir = S.dir, B = path.join(dir, 'backups');
  try {
    const A = (await S.api('POST', '/api/sites', { name: 'До копии' })).body.id;
    const r0 = await S.api('POST', '/api/backups/create'); assert.strictEqual(r0.status, 200);
    const name = r0.body.name;
    await S.api('POST', '/api/sites', { name: 'После копии' });
    // чужая / битая копия — отказ, база не тронута
    fs.writeFileSync(path.join(B, 'backup_broken.db'), 'not a database at all, just text'.repeat(200));
    let r = await S.api('POST', '/api/backups/restore/backup_broken.db');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual((await S.api('POST', '/api/backups/restore/..%2Ftest.db')).status, 400);
    // не админ (запрос не с самого сервера) — 403
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    if (lan) {
      const x = await fetch(`http://${lan.address}:${S.port}/api/backups/restore/${name}`, { method: 'POST', headers: { 'X-User-Name': 'Petrov' } });
      assert.strictEqual(x.status, 403);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'test.db.restore')));
    // админ — копия текущей базы + подготовленная подмена
    r = await S.api('POST', `/api/backups/restore/${name}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(fs.existsSync(path.join(B, r.body.before)), 'текущая база сохранена');
    assert.ok(fs.existsSync(path.join(dir, 'test.db.restore')), 'подмена подготовлена рядом с PGK_DB');
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'survey.db.restore')));
    // до перезапуска — данные прежние
    assert.ok((await S.api('GET', '/api/sites')).body.some(s => s.name === 'После копии'));
    await S.stop();
    S = await startServer({ dir, keep: true });
    const names = (await S.api('GET', '/api/sites')).body.map(s => s.name);
    assert.ok(names.includes('До копии') && !names.includes('После копии'), names.join());
    assert.ok(!fs.existsSync(path.join(dir, 'test.db.restore')));
    assert.ok((await S.api('GET', '/api/sites')).body.some(s => s.id === A));
  } finally { await S.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
