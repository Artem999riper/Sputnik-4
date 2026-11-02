// Ситуация для выгрузки рельефа (situation.js): разбор OSM, классы, обрезка по рамке,
// заполнение знаками, дописывание в DXF горизонталей (слои шаблона, cp1251).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../situation');

const PROJ = '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=500000 +y_0=-5000000 +ellps=krass +units=m +no_defs';
const BBOX = { minLng: 74.99, maxLng: 75.05, minLat: 65.99, maxLat: 66.02 };

function osmSample() {
  let id = 1; const el = [];
  const node = (lng, lat) => { el.push({ type: 'node', id, lon: lng, lat }); return id++; };
  const ring = (cx, cy, rx, ry, n = 24) => { const a = []; for (let i = 0; i < n; i++) a.push(node(cx + rx * Math.cos(i / n * 2 * Math.PI), cy + ry * Math.sin(i / n * 2 * Math.PI))); a.push(a[0]); return a; };
  const way = (wid, nodes, tags) => el.push({ type: 'way', id: wid, nodes, tags });
  way(1, ring(75.010, 66.010, 0.004, 0.0015), { natural: 'water', name: 'оз. Круглое' });
  way(2, ring(75.030, 66.012, 0.010, 0.004), {});
  way(3, ring(75.030, 66.012, 0.002, 0.0008), {});
  el.push({ type: 'relation', id: 9, tags: { type: 'multipolygon', natural: 'wetland', wetland: 'bog' }, members: [{ type: 'way', ref: 2, role: 'outer' }, { type: 'way', ref: 3, role: 'inner' }] });
  way(4, ring(74.995, 65.995, 0.012, 0.004), { natural: 'wood' });
  way(5, [[74.98, 66.0], [75.0, 66.003], [75.06, 66.004]].map(p => node(p[0], p[1])), { waterway: 'river', name: 'р. Тестовая' });
  way(6, ring(75.012, 66.000, 0.0002, 0.0001, 4), { building: 'yes' });
  way(7, [[74.99, 66.018], [75.05, 66.019]].map(p => node(p[0], p[1])), { power: 'line', voltage: '110000' });
  way(8, [[74.99, 66.005], [75.05, 66.006]].map(p => node(p[0], p[1])), { man_made: 'pipeline', substance: 'gas', location: 'overground' });
  return { elements: el };
}
function baseDxf(file) {
  const L = []; const g = (c, v) => L.push(String(c).padStart(3), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 64); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, 1); g(0, 'LAYER'); g(2, 'GORIZONTALI'); g(70, 0); g(62, 5); g(6, 'CONTINUOUS'); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB');
  g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
  [10, 12].forEach(z => { g(0, 'LINE'); g(8, 'GORIZONTALI'); g(62, 5); g(10, 500000); g(20, 2323000); g(30, z); g(11, 501000); g(21, 2323500); g(31, z); });
  g(0, 'ENDSEC'); g(0, 'EOF');
  fs.writeFileSync(file, L.join('\r\n') + '\r\n', 'latin1');
}

test('OSM → классы: мультиполигон с дыркой, вода, лес, река, здание, ЛЭП, газопровод', () => {
  const gj = S.osmToGeoJSON(osmSample());
  const by = Object.fromEntries(gj.features.map(f => [f.properties._sit, f]));
  for (const k of ['lake', 'bog', 'forest', 'river', 'building', 'power_hv', 'pipe_gas']) assert.ok(by[k], 'есть класс ' + k);
  assert.strictEqual(by.bog.geometry.type, 'Polygon');
  assert.strictEqual(by.bog.geometry.coordinates.length, 2, 'болото с островом (внутреннее кольцо)');
  assert.strictEqual(S.classify({ highway: 'track', surface: 'ground' }), 'road_track');
  assert.strictEqual(S.classify({ highway: 'primary' }), 'road_asph');
  assert.strictEqual(S.classify({ natural: 'wetland', wetland: 'reedbed' }, true), 'reed');
});

test('ситуация в DXF: слои шаблона, блоки знаков, обрезка, горизонтали на слои шаблона, cp1251', () => {
  const gj = S.osmToGeoJSON(osmSample());
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sit_')), 'r.dxf');
  baseDxf(file);
  const sit = S.buildSituation(gj.features, { proj4: PROJ, bbox: BBOX, scale: 2000 });
  assert.ok(sit.stats._symbols > 100, 'знаки заполнения: ' + sit.stats._symbols);
  for (const b of ['Les', 'Boloto5']) assert.ok(sit.usedBlocks.has(b), 'блок ' + b);
  assert.ok(sit.usedLayers.has('ВЛ 110 кВ 3пров'), 'ЛЭП по напряжению');
  assert.ok(sit.usedLayers.has('Газопровод надземный'), 'надземный газопровод');
  S.mergeIntoDxf(file, sit, { interval: 2, contoursToTemplate: true });
  const buf = fs.readFileSync(file), txt = buf.toString('latin1');
  const has = s => buf.includes(S.toCp1251(s));
  assert.ok(has('Контур леса') && has('Контур болота') && has('Озеро'), 'кириллические слои в cp1251');
  assert.ok(has('оз. Круглое') && has('р. Тестовая'), 'подписи названий');
  assert.ok(/\$DWGCODEPAGE\r\n  3\r\nANSI_1251/.test(txt), 'кодовая страница');
  assert.ok(/SECTION\r\n  2\r\nBLOCKS/.test(txt), 'раздел блоков');
  assert.ok(has('Горизонтали утолщенные') && has('Горизонтали основные'), 'горизонтали на слоях шаблона');
  assert.ok(!/GORIZONTALI\r\n 62\r\n/.test(txt.split('ENTITIES')[1]), 'цвет горизонталей — по слою');
  assert.ok(/\r\n  0\r\nEOF\r\n$/.test(txt), 'конец файла');
  // всё внутри рамки: координаты вершин не выходят за неё дальше 1 м
  const proj4 = require('proj4'), T = proj4('EPSG:4326', PROJ);
  const c = [T.forward([BBOX.minLng, BBOX.minLat]), T.forward([BBOX.maxLng, BBOX.maxLat]), T.forward([BBOX.minLng, BBOX.maxLat]), T.forward([BBOX.maxLng, BBOX.minLat])];
  const xmin = Math.min(...c.map(p => p[0])) - 1, xmax = Math.max(...c.map(p => p[0])) + 1;
  const xs = []; const m = sit.ent; for (let i = 0; i + 1 < m.length; i += 2) if (m[i].trim() === '10') xs.push(+m[i + 1]);
  assert.ok(xs.length && xs.every(x => x === 0 || (x >= xmin && x <= xmax)), 'обрезано по рамке');
});

test('ситуация: класс из поля «класс» (правка в таблице) и выбор групп', () => {
  const f = { type: 'Feature', properties: { 'класс': 'Кустарник' }, geometry: { type: 'Polygon', coordinates: [[[75.0, 66.0], [75.01, 66.0], [75.01, 66.005], [75.0, 66.005], [75.0, 66.0]]] } };
  const a = S.buildSituation([f], { proj4: PROJ, bbox: BBOX, scale: 2000 });
  assert.ok(a.usedLayers.has('Контур кустарника') && a.usedBlocks.has('KustZarosli'));
  const b = S.buildSituation([f], { proj4: PROJ, bbox: BBOX, scale: 2000, groups: ['water'] });
  assert.strictEqual(b.usedLayers.size, 0, 'группа «растительность» выключена');
});
