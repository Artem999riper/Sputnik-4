// Администрирование → «📈 Активность»: учёт функций по людям, профиль, нагрузка «сейчас»
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const H = n => ({ 'X-User-Name': encodeURIComponent(n) });

test('учёт использования: функции по людям, действия в браузере, профиль и «сейчас»', async () => {
  const gj = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'т' }, geometry: { type: 'Point', coordinates: [73, 61] } }] });
  const id = (await S.api('POST', '/api/layers', { name: 'L', geojson: gj }, H('Петров П.П.'))).body.id;
  await S.api('PUT', `/api/layers/${id}`, { name: 'L', geojson: gj }, H('Петров П.П.'));
  await S.api('PUT', `/api/layers/${id}`, { name: 'L', geojson: gj }, H('Петров П.П.'));
  await S.api('POST', '/api/layers/export-dxf', { layerIds: [id], crs: 'wgs84' }, H('Петров П.П.'));
  await S.api('POST', '/api/usage', { f: 'Отчёт для заказчика' }, H('Петров П.П.'));
  await S.api('POST', '/api/usage', { f: 'взлом' }, H('Петров П.П.'));                 // не из списка — не считается
  await S.api('GET', '/api/layers', undefined, H('Иванов И.И.'));
  const r = await S.api('GET', '/api/admin/usage?days=1');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const p = r.body.users.find(u => u.name === 'Петров П.П.'), iv = r.body.users.find(u => u.name === 'Иванов И.И.');
  assert.ok(p && iv, 'оба в сводке');
  assert.ok(p.actions >= 5 && p.bytes > 0, JSON.stringify(p));
  assert.strictEqual(iv.actions, 0, 'просмотр — не действие');
  const prof = (await S.api('GET', '/api/admin/usage/user?name=' + encodeURIComponent('Петров П.П.') + '&days=7')).body;
  const f = Object.fromEntries(prof.features.map(x => [x.feature, x.n]));
  assert.strictEqual(f['Слои: правка объектов'], 2);
  assert.strictEqual(f['Экспорт слоёв: DXF'], 1);
  assert.strictEqual(f['Слои: создание и импорт'], 1);
  assert.strictEqual(f['Отчёт для заказчика'], 1);
  assert.ok(!f['взлом']);
  assert.strictEqual(prof.byDay.length, 1);
  const live = (await S.api('GET', '/api/admin/usage/live')).body;
  assert.ok(live.server && live.server.cores >= 1 && live.users.some(u => u.name === 'Петров П.П.'));
});

test('«По функциям»: кто сколько раз; отказы — отдельно', async () => {
  const bb = { minLat: 61, maxLat: 61.01, minLng: 73, maxLng: 73.02 };
  await S.api('POST', '/api/dem/analysis', { mode: 'watershed', bbox: bb }, H('Сидоров С.С.'));   // без точки — отказ 400
  await S.api('POST', '/api/usage', { f: 'Каталог координат' }, H('Сидоров С.С.'));
  await S.api('POST', '/api/usage', { f: 'Каталог координат' }, H('Петров П.П.'));
  await S.api('POST', '/api/usage', { f: 'Каталог координат' }, H('Петров П.П.'));
  const r = (await S.api('GET', '/api/admin/usage?days=1')).body;
  const cat = r.features.find(f => f.f === 'Каталог координат');
  assert.strictEqual(cat.n, 3);
  assert.deepStrictEqual(cat.users.map(u => [u.name, u.n]), [['Петров П.П.', 2], ['Сидоров С.С.', 1]]);
  assert.ok(!r.features.some(f => /^Анализ рельефа/.test(f.f) && f.users.some(u => u.name === 'Сидоров С.С.')), 'отказ не засчитан как анализ');
  assert.ok(r.features.some(f => /^Отказы/.test(f.f)));
});
