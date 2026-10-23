// Импорт: Shapefile (геометрия, дыры, атрибуты cp1251, .prj Пулково) и DXF
// (новые типы объектов, пересчёт из МСК). Файлы собираются прямо в тесте.
const test = require('node:test'), assert = require('node:assert');
const proj4 = require('proj4');
const { readShp, readDbf, prjToProj4 } = require('../shp-reader');
const { parseDXF, dxfEntitiesToFeatures, makeDxfInverseTransform } = require('../routes/misc.js')._test;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
const E = 3572529.5527, N = 983088.7864;   // МСК-86 зона 3 для 61.25 с.ш., 73.4 в.д.
const PRJ = 'PROJCS["MSK-86 zone 3",GEOGCS["GCS_Pulkovo_1942",DATUM["D_Pulkovo_1942",SPHEROID["Krasovsky_1940",6378245.0,298.3]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",3500000.0],PARAMETER["False_Northing",-5811057.63],PARAMETER["Central_Meridian",72.05],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

function buildPolygonShp(rings) {
  const pts = rings.flat(), nP = rings.length, nPt = pts.length;
  const content = 44 + 4 * nP + 16 * nPt, b = Buffer.alloc(100 + 8 + content);
  b.writeInt32BE(9994, 0); b.writeInt32BE(b.length / 2, 24); b.writeInt32LE(1000, 28); b.writeInt32LE(5, 32);
  let o = 100; b.writeInt32BE(1, o); b.writeInt32BE(content / 2, o + 4); o += 8;
  b.writeInt32LE(5, o); b.writeInt32LE(nP, o + 36); b.writeInt32LE(nPt, o + 40);
  let k = 0; rings.forEach((r, i) => { b.writeInt32LE(k, o + 44 + i * 4); k += r.length; });
  const p0 = o + 44 + 4 * nP; pts.forEach((p, i) => { b.writeDoubleLE(p[0], p0 + i * 16); b.writeDoubleLE(p[1], p0 + i * 16 + 8); });
  return b;
}
function cp1251(s) { return Buffer.from([...s].map(ch => { const c = ch.charCodeAt(0); if (c >= 0x410 && c <= 0x44F) return c - 0x410 + 0xC0; if (c === 0x401) return 0xA8; if (c === 0x451) return 0xB8; if (c === 0x2116) return 0xB9; return c < 128 ? c : 63; })); }
function buildDbf(name, value) {
  const len = 40, hdr = 32 + 32 + 1, rec = 1 + len, b = Buffer.alloc(hdr + rec + 1, 0x20);
  b.fill(0, 0, hdr); b[0] = 3; b.writeUInt32LE(1, 4); b.writeUInt16LE(hdr, 8); b.writeUInt16LE(rec, 10); b[29] = 0xC9;
  cp1251(name).copy(b, 32); b[32 + 11] = 'C'.charCodeAt(0); b[32 + 16] = len; b[hdr - 1] = 0x0D;
  b[hdr] = 0x20; cp1251(value).copy(b, hdr + 1); b[b.length - 1] = 0x1A;
  return b;
}

test('SHP: полигон с дырой, атрибуты cp1251, .prj Пулково → точное положение', () => {
  const outer = [[E, N], [E, N + 100], [E + 100, N + 100], [E + 100, N], [E, N]];          // по часовой
  const hole = [[E + 40, N + 40], [E + 60, N + 40], [E + 60, N + 60], [E + 40, N + 60], [E + 40, N + 40]];
  const g = readShp(buildPolygonShp([outer, hole]));
  assert.strictEqual(g[0].type, 'Polygon'); assert.strictEqual(g[0].coordinates.length, 2, 'внешнее кольцо + дыра');
  const attrs = readDbf(buildDbf('НАЗВ', 'Площадка №1'));
  assert.strictEqual(attrs[0]['НАЗВ'], 'Площадка №1');
  const ps = prjToProj4(PRJ, proj4);
  assert.match(ps, /\+towgs84=23\.57,-140\.95/, 'для Пулково подставлены параметры ГОСТ');
  const [lng, lat] = proj4(ps, 'WGS84', [E, N]);
  near(lat, 61.25, 1e-6, 'lat'); near(lng, 73.4, 1e-6, 'lng');
});
test('SHP: битый файл — понятная ошибка', () => { assert.throws(() => readShp(Buffer.alloc(120)), /повреждён|Shapefile/); });

const DXF = (ents) => ['0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n');
test('DXF: окружность, сплайн, штриховка, полилиния и пересчёт из МСК-86', () => {
  const txt = DXF([
    ['0', 'CIRCLE', '8', 'Колодцы', '10', E, '20', N, '40', '20'],
    ['0', 'SPLINE', '8', 'Сети', '70', '8', '71', '3', '74', '4', '11', E, '21', N, '11', E + 50, '21', N + 30, '11', E + 100, '21', N, '11', E + 150, '21', N + 40],
    ['0', 'HATCH', '8', 'Заливка', '2', 'SOLID', '91', '1', '92', '2', '72', '0', '73', '1', '93', '4', '10', E, '20', N, '10', E + 10, '20', N, '10', E + 10, '20', N + 10, '10', E, '20', N + 10],
    ['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0', '10', E, '20', N, '10', E + 5, '20', N + 5],
  ]);
  const layers = parseDXF(txt);
  assert.deepStrictEqual([...layers.keys()].sort(), ['0', 'Заливка', 'Колодцы', 'Сети'].sort());
  const inv = makeDxfInverseTransform('mskfull:86:2008', E);
  const all = [...layers.values()].flatMap(ents => dxfEntitiesToFeatures(ents, inv));
  const types = all.map(f => f.geometry.type).sort();
  assert.deepStrictEqual(types, ['LineString', 'LineString', 'Polygon', 'Polygon']);
  const poly = all.find(f => f.properties.hatch === 'SOLID');
  near(poly.geometry.coordinates[0][0][1], 61.25, 1e-6, 'lat'); near(poly.geometry.coordinates[0][0][0], 73.4, 1e-6, 'lng');
  const spline = all.find(f => f.geometry.type === 'LineString' && f.geometry.coordinates.length > 10);
  assert.ok(spline, 'сплайн сглажен (много точек)');
});
test('DXF: СК-42 Гаусс-Крюгер, зона по X', () => {
  const inv = makeDxfInverseTransform('gk:sk42', 13414172.149);
  const [lng, lat] = inv(13414172.149, 6794446.625);
  near(lat, 61.25, 1e-6, 'lat'); near(lng, 73.4, 1e-6, 'lng');
});
