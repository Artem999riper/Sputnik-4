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

test('DXF R12: длинные кириллические названия слоёв — не длиннее 31 символа, без запрещённых знаков', async () => {
  const gj = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'т' }, geometry: { type: 'Point', coordinates: [70.5, 61.2] } }] });
  const ids = [];
  for (const n of ['Инженерно-геологические скважины (бурение) №2 — уч. 150–250', 'Инженерно-геологические скважины (бурение) №2 — уч. 250–300'])
    ids.push((await S.api('POST', '/api/layers', { name: n, geojson: gj })).body.id);
  const r = await fetch(S.base + '/api/layers/export-dxf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layerIds: ids, crs: 'wgs84' }) });
  assert.strictEqual(r.status, 200);
  const txt = new TextDecoder('windows-1251').decode(await r.arrayBuffer());
  const L = txt.split(/\r?\n/), names = [];
  for (let i = 0; i < L.length - 3; i++) if (L[i].trim() === '0' && L[i + 1] === 'LAYER' && L[i + 2].trim() === '2') names.push(L[i + 3]);
  assert.strictEqual(names.length, 2);
  names.forEach(n => { assert.ok(n.length <= 31, n); assert.match(n, /^[A-Za-z0-9А-Яа-яЁё_$-]+$/, n); });
  assert.notStrictEqual(names[0].toUpperCase(), names[1].toUpperCase());
  assert.match(txt, /\$DWGCODEPAGE\r?\n  3\r?\nANSI_1251/);
});

test('DXF слоёв: точка — блок слоя с атрибутом NAME и скрытыми атрибутами полей', () => {
  const { buildLayersDXF } = require('../dxf-writer');
  const gj = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: 'Скв-1', 'глубина': 15, _done: true }, geometry: { type: 'Point', coordinates: [73, 61] } },
    { type: 'Feature', properties: { name: 'Скв-2' }, geometry: { type: 'Point', coordinates: [73.01, 61] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [73.02, 61] } }] };
  const s = buildLayersDXF({ layers: [{ name: 'Скважины', color: 5, geojson: JSON.stringify(gj) }] });
  const L = s.split(/\r?\n/).map(x => x.trim()), pairs = []; for (let i = 0; i + 1 < L.length; i += 2) pairs.push([L[i], L[i + 1]]);
  const ents = pairs.filter(p => p[0] === '0').map(p => p[1]);
  assert.strictEqual(ents.filter(e => e === 'INSERT').length, 2, 'две точки с названием — вставки блока');
  assert.strictEqual(ents.filter(e => e === 'ATTDEF').length, 2, 'в блоке: NAME и ГЛУБИНА');
  assert.strictEqual(ents.filter(e => e === 'ATTRIB').length, 4);
  assert.ok(/\n\s*2\r?\n\s*NAME\r?\n/.test(s) && /\n\s*1\r?\nСкв-1\r?\n/.test(s), 'атрибут NAME = Скв-1');
  assert.ok(/\n\s*2\r?\nГЛУБИНА\r?\n\s*70\r?\n\s*1\r?\n/.test(s), 'поле — скрытый атрибут');
  assert.ok(!/_DONE/.test(s), 'служебные поля не выгружаются');
  assert.strictEqual(ents.filter(e => e === 'BLOCK').length, 3, '*MODEL_SPACE, *PAPER_SPACE и один блок слоя');
});
