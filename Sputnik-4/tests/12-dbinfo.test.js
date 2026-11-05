// Администрирование → «Состав базы»: таблицы с описаниями, записи, размеры, поля и последние записи
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });

test('состав базы: все таблицы описаны, числа записей и размеры, просмотр таблицы', async () => {
  await S.api('POST', '/api/sites', { name: 'Объект-дб', lat: 66, lng: 75 });
  const r = await S.api('GET', '/api/admin/dbinfo');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const t = Object.fromEntries(r.body.tables.map(x => [x.name, x]));
  assert.ok(t.sites && t.sites.rows >= 1 && t.sites.section === 'Объекты' && t.sites.desc);
  const undescribed = r.body.tables.filter(x => !x.desc).map(x => x.name);
  assert.deepStrictEqual(undescribed, [], 'у каждой таблицы есть описание');
  assert.ok(r.body.file.bytes > 0);
  const one = await S.api('GET', '/api/admin/dbinfo/sites');
  assert.strictEqual(one.status, 200);
  assert.ok(one.body.cols.some(c => c.name === 'name') && one.body.rows.length >= 1);
  assert.strictEqual((await S.api('GET', '/api/admin/dbinfo/no_such')).status, 404);
});
