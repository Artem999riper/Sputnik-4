// Геодезия: пересчёт координат и замеры сверены с эталонной библиотекой PROJ.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { ROOT, loadBrowser } = require('./helpers');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);

const B = loadBrowser(['public/vendor/proj4.js', 'public/js/coord-convert.js', 'public/js/kameral.js'],
  { MSK_FULL: JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'msk-zones.json'), 'utf8')), coordMskRegion: '86' });
const CV = B.get('CV'), conv = B.get('cvConvert');
const setSys = (src, dst, o) => Object.assign(CV, { src, dst, srcZone: 'auto', dstZone: 'auto', srcMsk: '86', dstMsk: '86', srcMskDatum: '2008', dstMskDatum: '2008', srcSwap: false, dstSwap: false, withH: false }, o || {});

test('WGS-84 → МСК-86 зона 3 (эталон PROJ)', () => {
  setSys('geo:wgs', 'msk'); const r = conv(61.25, 73.4, NaN);
  near(r.a, 983088.786, 0.002, 'X'); near(r.b, 3572529.553, 0.002, 'Y');
  assert.match(r.dstName, /МСК-86 зона 3/);
});
test('МСК-86 → WGS-84 обратно в ту же точку', () => {
  setSys('msk', 'geo:wgs'); const r = conv(983088.786, 3572529.553, NaN);
  near(r.a, 61.25, 1e-7, 'B'); near(r.b, 73.4, 1e-7, 'L');
});
test('WGS-84 → СК-42 Гаусс-Крюгер, зона 13', () => {
  setSys('geo:wgs', 'gk:sk42'); const r = conv(61.25, 73.4, NaN);
  near(r.a, 6794446.625, 0.002, 'X'); near(r.b, 13414172.149, 0.002, 'Y');
});
test('эллипсоидальная высота WGS-84 → СК-42 (эталон PROJ 123.0258)', () => {
  setSys('geo:wgs', 'geo:sk42', { withH: true }); const r = conv(61.25, 73.4, 100);
  near(r.h, 123.0258, 0.001, 'H');
});
test('порядок X↔Y на входе', () => {
  setSys('geo:wgs', 'msk', { srcSwap: true });
  const read = B.get('_cvReadAB'); const [a, b] = read('73.4', '61.25');
  assert.strictEqual(a, 61.25); assert.strictEqual(b, 73.4);
});
test('разбор углов', () => {
  const p = B.get('cvParseAngle');
  near(p("61°30'15.2\""), 61.504222, 1e-6, 'ГМС'); near(p('61,5'), 61.5, 1e-9, 'запятая');
  near(p("72°15' з.д."), -72.25, 1e-9, 'з.д.'); near(p('S12.5'), -12.5, 1e-9, 'S');
  assert.ok(Number.isNaN(p('61 70')), 'минуты ≥ 60 — ошибка'); assert.ok(Number.isNaN(p('abc')));
});
test('координаты в глобальном поиске', () => {
  const g = B.get('cvGuessPoints');
  const m = g('983088.786 3572529.553')[0]; assert.match(m.label, /МСК-86/); near(m.lat, 61.25, 1e-6, 'lat');
  const k = g('ск42 6794446.6 13414172.1')[0]; assert.match(k.label, /СК-42/);
  const u = g('utm 43 6791685.034 414149.603')[0]; near(u.lon, 73.4, 1e-6, 'utm lon');
  assert.strictEqual(g('Иванов').length, 0);
});
test('длина по Винсенти и площадь (эталон PROJ Geod)', () => {
  const d = B.get('_geoDist'), A = B.get('_geoArea');
  const P = (lat, lng) => ({ lat, lng });
  near(d(P(61.25, 73.4), P(61.3, 73.5)), 7734.0252, 0.001, 'длина');
  near(d(P(55.75, 37.6), P(59.94, 30.31)), 635852.614, 0.01, 'Москва—Петербург');
  near(A([P(61.25, 73.4), P(61.25, 73.42), P(61.26, 73.42), P(61.26, 73.4)]), 1196196.59, 0.5, 'площадь');
});
