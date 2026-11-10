// Корзина слоёв (7 дней) и версии слоя
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const fc = n => JSON.stringify({ type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', properties: { name: 'т' + i }, geometry: { type: 'Point', coordinates: [73 + i * 0.001, 61] } })) });

test('удалённый слой — в корзине, возвращается целиком', async () => {
  const id = (await S.api('POST', '/api/layers', { name: 'Скважины', color: '#ff0000', geojson: fc(3) })).body.id;
  await S.api('PUT', `/api/layers/${id}/style`, { style: { labelField: 'name' } });
  assert.strictEqual((await S.api('DELETE', `/api/layers/${id}`)).status, 200);
  const tr = (await S.api('GET', '/api/layers-trash')).body;
  const t = tr.find(x => x.layer_id === id);
  assert.ok(t, 'слой в корзине');
  assert.strictEqual(t.n_features, 3); assert.strictEqual(t.days_left, 7);
  const r = await S.api('POST', `/api/layers-trash/${t.id}/restore`);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const l = (await S.api('GET', '/api/layers')).body.find(x => x.id === id);
  assert.ok(l && l.color === '#ff0000' && JSON.parse(l.style_json).labelField === 'name' && JSON.parse(l.geojson).features.length === 3);
  assert.ok(!(await S.api('GET', '/api/layers-trash')).body.some(x => x.layer_id === id), 'из корзины убран');
  // удалить навсегда
  await S.api('DELETE', `/api/layers/${id}`);
  const t2 = (await S.api('GET', '/api/layers-trash')).body.find(x => x.layer_id === id);
  assert.strictEqual((await S.api('DELETE', `/api/layers-trash/${t2.id}`)).status, 200);
  assert.ok(!(await S.api('GET', '/api/layers-trash')).body.some(x => x.layer_id === id));
});

test('версии: прежнее состояние сохраняется, возврат — с версией «перед возвратом»', async () => {
  const id = (await S.api('POST', '/api/layers', { name: 'Профили', geojson: fc(2) })).body.id;
  await S.api('PUT', `/api/layers/${id}`, { name: 'Профили', geojson: fc(5) });      // авто-версия: 2 объекта
  await S.api('PUT', `/api/layers/${id}`, { name: 'Профили', geojson: fc(7) });      // в течение 15 мин — новой авто-версии нет
  let vs = (await S.api('GET', `/api/layers/${id}/versions`)).body;
  assert.strictEqual(vs.length, 1); assert.strictEqual(vs[0].n_features, 2);
  const m = await S.api('POST', `/api/layers/${id}/versions`, { note: 'после полевых' });
  assert.ok(m.body.id);
  vs = (await S.api('GET', `/api/layers/${id}/versions`)).body;
  assert.strictEqual(vs.length, 2); assert.ok(vs.some(v => v.kind === 'manual' && v.note === 'после полевых' && v.n_features === 7));
  const auto = vs.find(v => v.kind === 'auto');
  const r = await S.api('POST', `/api/layers/${id}/versions/${auto.id}/restore`);
  assert.strictEqual(r.status, 200);
  const l = (await S.api('GET', '/api/layers')).body.find(x => x.id === id);
  assert.strictEqual(JSON.parse(l.geojson).features.length, 2);
  vs = (await S.api('GET', `/api/layers/${id}/versions`)).body;
  assert.ok(vs.some(v => v.kind === 'before' && v.n_features === 7), 'текущее сохранено перед возвратом');
  const one = (await S.api('GET', `/api/layers/${id}/versions/${auto.id}`)).body;
  assert.strictEqual(JSON.parse(one.geojson).features.length, 2);
});
