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
