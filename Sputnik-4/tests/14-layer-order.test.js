// Порядок слоёв: перетаскивание в панели → PATCH /api/layers/order; новые слои — сверху
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const gj = JSON.stringify({ type: 'FeatureCollection', features: [] });

test('порядок слоёв сохраняется, новый слой — первым', async () => {
  const ids = [];
  for (const n of ['L1', 'L2', 'L3']) ids.push((await S.api('POST', '/api/layers', { name: n, geojson: gj })).body.id);
  const want = [ids[1], ids[2], ids[0]];
  const r = await S.api('PATCH', '/api/layers/order', { ids: want });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  let got = (await S.api('GET', '/api/layers')).body.map(l => l.id);
  assert.deepStrictEqual(got, want);
  const nid = (await S.api('POST', '/api/layers', { name: 'L4', geojson: gj })).body.id;
  got = (await S.api('GET', '/api/layers')).body.map(l => l.id);
  assert.deepStrictEqual(got, [nid, ...want]);
  assert.strictEqual((await S.api('PATCH', '/api/layers/order', {})).status, 400);
});

test('лёгкий список слоёв: rev растёт при изменении геометрии, геометрия — по запросу', async () => {
  const id = (await S.api('POST', '/api/layers', { name: 'R', geojson: gj })).body.id;
  const lite = () => S.api('GET', '/api/layers?lite=1').then(r => r.body.find(l => l.id === id));
  const a = await lite();
  assert.ok(a && !('geojson' in a) && a.glen > 0, 'без геометрии, с размером');
  await S.api('PUT', `/api/layers/${id}`, { name: 'R2', geojson: gj });                    // геометрия та же — версия не меняется
  assert.strictEqual((await lite()).rev, a.rev);
  const g2 = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [73, 61] } }] });
  await S.api('PUT', `/api/layers/${id}`, { name: 'R2', geojson: g2 });
  const b = await lite();
  assert.strictEqual(b.rev, (a.rev || 0) + 1); assert.strictEqual(b.name, 'R2');
  const got = (await S.api('POST', '/api/layers-get', { ids: [id] })).body;
  assert.strictEqual(got.length, 1); assert.strictEqual(got[0].geojson, g2); assert.strictEqual(got[0].rev, b.rev);
});
