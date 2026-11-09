// Экспорт слоёв в выбранной системе: окно экспорта присылает готовую строку proj4 (зона задана вручную)
const test = require('node:test'), assert = require('node:assert');
const { startServer } = require('./helpers');
let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });

test('DXF в МСК-86 зона 4 (вручную) — координаты и имя файла', async () => {
  const gj = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'П1' }, geometry: { type: 'Point', coordinates: [70.5, 61.2] } }] });
  const id = (await S.api('POST', '/api/layers', { name: 'Т', geojson: gj })).body.id;
  const crs = '+proj=tmerc +lat_0=0 +lon_0=78.05 +k=1 +x_0=4500000 +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs';
  const r = await fetch(S.base + '/api/layers/export-dxf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layerIds: [id], crs, crsName: 'МСК-86 зона 4 (2008)' }) });
  assert.strictEqual(r.status, 200);
  const txt = Buffer.from(await r.arrayBuffer()).toString('latin1');
  const m = txt.match(/INSERT[\s\S]*?\n 10\r?\n([\d.]+)\r?\n 20\r?\n([\d.]+)/);
  assert.ok(m, 'есть INSERT с координатами');
  assert.ok(Math.abs(+m[1] - 4094742.26) < 0.05 && Math.abs(+m[2] - 1000214.73) < 0.05, `координаты ${m[1]} ${m[2]}`);
  assert.match(decodeURIComponent(r.headers.get('content-disposition') || ''), /МСК-86_зона_4_2008/);
});
