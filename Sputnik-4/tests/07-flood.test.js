// Зоны затопления: проверка запроса и (если есть GDAL с Python) полный расчёт
// на искусственном рельефе — долина реки и замкнутая котловина в стороне.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { startServer } = require('./helpers');

// Python с GDAL и numpy (как ищет dem-processor на Linux); на Windows без OSGeo4W в PATH — пропуск
const PY = ['/usr/bin/python3.12', '/usr/bin/python3.11', 'python3', 'python'].find(p => {
  try { execFileSync(p, ['-c', 'from osgeo import gdal; import numpy'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
});
const HAS_GDAL = !!PY && ['/usr/bin', '/usr/local/bin', 'C:\\OSGeo4W\\bin'].some(d => fs.existsSync(path.join(d, process.platform === 'win32' ? 'gdalwarp.exe' : 'gdalwarp')));

let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { if (S) await S.stop(); });
const bbox = { minLat: 66.501, maxLat: 66.519, minLng: 74.505, maxLng: 74.545 };

test('затопление: без области или отметки — понятная ошибка', async () => {
  let r = await S.api('POST', '/api/dem/flood', { level: 5 });
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /област/i);
  r = await S.api('POST', '/api/dem/flood', { bbox, level: 'abc' });
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /отметк/i);
  r = await S.api('POST', '/api/dem/flood', { bbox: { minLat: 60, maxLat: 62, minLng: 70, maxLng: 75 }, level: 5 });
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /большая/i);
});

test('затопление: расчёт по рельефу из кэша тайлов', { skip: !HAS_GDAL && 'нет GDAL/Python' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_flood_'));
  try {
    // Рельеф: 5 м у реки (широта 66.51), +1 м на каждые 100 м; котловина глубиной до 4 м на севере
    const tif = path.join(dir, 'dem_74.500_66.500_74.550_66.520.tif');
    execFileSync(PY, ['-c', `
import numpy as np
from osgeo import gdal, osr
x0,x1,y0,y1=74.50,74.55,66.50,66.52
dx=4/(111320*np.cos(np.radians(66.51))); dy=4/111320
c=int((x1-x0)/dx); r=int((y1-y0)/dy)
X,Y=np.meshgrid(np.linspace(x0,x1,c),np.linspace(y1,y0,r))
z=5+np.abs(Y-66.51)*111320*0.01
q=np.hypot((X-74.54)*111320*np.cos(np.radians(66.5)),(Y-66.518)*111320)
z=np.where(q<80,z-(80-q)*0.05,z).astype(np.float32)
ds=gdal.GetDriverByName('GTiff').Create(r'${tif}',c,r,1,gdal.GDT_Float32)
ds.SetGeoTransform((x0,dx,0,y1,0,-dy)); s=osr.SpatialReference(); s.ImportFromEPSG(4326); ds.SetProjection(s.ExportToWkt())
ds.GetRasterBand(1).WriteArray(z); ds=None`]);
    assert.ok((await S.api('PUT', '/api/dem/tiles-dir', { dir })).status < 300);

    // Поправка геоида (БСВ-77) сдвигает все высоты на N — берём её из минимума рельефа (5 м у реки)
    let r = await S.api('POST', '/api/dem/flood', { bbox, level: 1000, minArea: 100 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const off = r.body.stats.dem_min - 5.16;
    assert.ok(Math.abs(off) < 0.3 || r.body.stats.geoid, 'сдвиг высот без поправки геоида: ' + off);
    r = await S.api('POST', '/api/dem/flood', { bbox, level: 7 + off, minArea: 100 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.features.length, 1);               // только долина
    const z = r.body.features[0].properties;
    // полоса ±200 м вдоль реки на ширину области (~1,77 км) ≈ 0,7 км²
    assert.ok(z.area_m2 > 6e5 && z.area_m2 < 8e5, 'площадь ' + z.area_m2);
    assert.ok(Math.abs(z.depth_max - 2) < 0.3, 'глубина ' + z.depth_max);

    // Выше — затапливается и котловина; «только связанные с водой» её отбрасывает
    r = await S.api('POST', '/api/dem/flood', { bbox, level: String(12.5 + off).replace('.', ','), minArea: 100 });
    assert.strictEqual(r.body.features.length, 2);
    r = await S.api('POST', '/api/dem/flood', { bbox, level: 12.5 + off, minArea: 100, connectedOnly: true });
    assert.strictEqual(r.body.features.length, 1);
    assert.strictEqual(r.body.stats.dropped_isolated, 1);
    // Ниже реки — ничего
    r = await S.api('POST', '/api/dem/flood', { bbox, level: 3 + off });
    assert.strictEqual(r.body.features.length, 0);
    // Уклон воды вдоль реки: 7 м в начале (запад) → 12 м в конце (восток) — зона шире, чем при 7, и уже, чем при 12
    const a7 = (await S.api('POST', '/api/dem/flood', { bbox, level: 7 + off })).body.stats.flood_m2;
    const a12 = (await S.api('POST', '/api/dem/flood', { bbox, level: 12 + off, connectedOnly: true })).body.stats.flood_m2;
    r = await S.api('POST', '/api/dem/flood', { bbox, levels: [7 + off, 12 + off], axis: [[74.505, 66.51], [74.545, 66.51]], connectedOnly: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const as = r.body.stats.flood_m2;
    assert.ok(as > a7 * 1.2 && as < a12 * 0.95, `уклон: ${a7} < ${as} < ${a12}`);
    assert.strictEqual((await S.api('POST', '/api/dem/flood', { bbox, levels: [7, 12] })).status, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('очередь выгрузок: проверка запроса', async () => {
  let r = await S.api('POST', '/api/dem/jobs', { kind: 'dem', params: {} });
  assert.strictEqual(r.status, 400);
  r = await S.api('POST', '/api/dem/jobs', { kind: 'batch', params: { items: [] } });
  assert.strictEqual(r.status, 400);
  r = await S.api('GET', '/api/dem/jobs/нет/file');
  assert.strictEqual(r.status, 404);
});

test('очередь выгрузок: задание выполняется в фоне, архив скачивается', { skip: !HAS_GDAL && 'нет GDAL/Python' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_jobs_'));
  try {
    execFileSync(PY, ['-c', `
import numpy as np
from osgeo import gdal, osr
x0,x1,y0,y1=74.50,74.55,66.50,66.52
dx=4/(111320*np.cos(np.radians(66.51))); dy=4/111320
c=int((x1-x0)/dx); r=int((y1-y0)/dy)
X,Y=np.meshgrid(np.linspace(x0,x1,c),np.linspace(y1,y0,r))
z=(5+np.abs(Y-66.51)*111320*0.01).astype(np.float32)
ds=gdal.GetDriverByName('GTiff').Create(r'${path.join(dir, 'dem_74.500_66.500_74.550_66.520.tif')}',c,r,1,gdal.GDT_Float32)
ds.SetGeoTransform((x0,dx,0,y1,0,-dy)); s=osr.SpatialReference(); s.ImportFromEPSG(4326); ds.SetProjection(s.ExportToWkt())
ds.GetRasterBand(1).WriteArray(z); ds=None`]);
    await S.api('PUT', '/api/dem/tiles-dir', { dir });
    const P4 = '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=13500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
    const r = await S.api('POST', '/api/dem/jobs', { kind: 'dem', title: 'тест', user_name: 'Тест', file_name: 'тест.zip',
      params: { bbox: { minLat: 66.505, maxLat: 66.512, minLng: 74.51, maxLng: 74.52 }, proj4: P4, projId: 'gsk2011_z13', interval: 1, gridStep: 0, exportSatellite: false } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    let j;
    for (let i = 0; i < 120; i++) {
      j = (await S.api('GET', '/api/dem/jobs?user=Тест')).body.find(x => x.id === r.body.id);
      if (j && (j.status === 'done' || j.status === 'error')) break;
      await new Promise(res => setTimeout(res, 500));
    }
    assert.strictEqual(j.status, 'done', j.error || j.status);
    const f = await fetch(`${S.base}/api/dem/jobs/${r.body.id}/file`);
    assert.strictEqual(f.status, 200);
    assert.match(f.headers.get('content-disposition'), /UTF-8''/);
    assert.ok((await f.arrayBuffer()).byteLength > 500);
    assert.strictEqual((await S.api('DELETE', `/api/dem/jobs/${r.body.id}`)).status, 200);
    assert.ok(!(await S.api('GET', '/api/dem/jobs')).body.some(x => x.id === r.body.id));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ГИС-операции: буфер, обрезка, разность, отбор, слияние', { skip: !HAS_GDAL && 'нет GDAL/Python' }, async () => {
  const sq = (x, y, d) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
  const mk = async (name, geoms) => (await S.api('POST', '/api/layers', { name, geojson: JSON.stringify({ type: 'FeatureCollection', features: geoms.map((g, i) => ({ type: 'Feature', properties: { name: name + i, Тип: i % 2 ? 'Б' : 'А' }, geometry: g })) }) })).body.id;
  const A = await mk('Лицензии', [sq(74.50, 66.50, 0.02), sq(74.53, 66.50, 0.02)]);
  const B = await mk('ООПТ', [sq(74.51, 66.50, 0.015)]);
  const P = await mk('Скважины', [{ type: 'Point', coordinates: [74.6, 66.6] }]);
  const op = async b => { const r = await S.api('POST', '/api/gis/op', b); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r.body; };
  let r = await op({ op: 'buffer', layerA: P, distance: 100 });
  assert.ok(Math.abs(r.stats.area_ha - Math.PI * 100 * 100 / 1e4) < 0.1, 'площадь буфера ' + r.stats.area_ha);
  r = await op({ op: 'clip', layerA: A, layerB: B });
  assert.strictEqual(r.features.length, 1);                                // задета только первая лицензия
  r = await op({ op: 'select', layerA: A, layerB: B }); assert.strictEqual(r.features.length, 1);
  const full = (await op({ op: 'dissolve', layerA: A })).stats.area_ha;
  const diff = (await op({ op: 'difference', layerA: A, layerB: B })).stats.area_ha;
  const clip = (await op({ op: 'clip', layerA: A, layerB: B })).stats.area_ha;
  assert.ok(Math.abs(full - diff - clip) < 0.01, `${full} ≠ ${diff} + ${clip}`);
  r = await op({ op: 'dissolve', layerA: A, field: 'Тип' }); assert.strictEqual(r.features.length, 2);
  assert.strictEqual((await S.api('POST', '/api/gis/op', { op: 'clip', layerA: A })).status, 400);
});

test('анализ рельефа: уклоны, сток, водосбор, сравнение со съёмкой', { skip: !HAS_GDAL && 'нет GDAL/Python' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgk_ta_'));
  try {
    // наклонная плоскость: 1 м на 100 м к западу (уклон ≈ 0,57°) + долина вдоль широты 66.61
    execFileSync(PY, ['-c', `
import numpy as np
from osgeo import gdal, osr
x0,x1,y0,y1=74.60,74.65,66.60,66.62
dx=4/(111320*np.cos(np.radians(66.61))); dy=4/111320
c=int((x1-x0)/dx); r=int((y1-y0)/dy)
X,Y=np.meshgrid(np.linspace(x0,x1,c),np.linspace(y1,y0,r))
z=(20+np.abs(Y-66.61)*111320*0.02+(X-x0)*111320*np.cos(np.radians(66.61))*0.01).astype(np.float32)
ds=gdal.GetDriverByName('GTiff').Create(r'${path.join(dir, 'dem_74.600_66.600_74.650_66.620.tif')}',c,r,1,gdal.GDT_Float32)
ds.SetGeoTransform((x0,dx,0,y1,0,-dy)); s=osr.SpatialReference(); s.ImportFromEPSG(4326); ds.SetProjection(s.ExportToWkt())
ds.GetRasterBand(1).WriteArray(z); ds=None`]);
    await S.api('PUT', '/api/dem/tiles-dir', { dir });
    const bbox = { minLat: 66.601, maxLat: 66.619, minLng: 74.601, maxLng: 74.649 };
    const A = async b => { const r = await S.api('POST', '/api/dem/analysis', { bbox, ...b }); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r.body; };
    let r = await A({ mode: 'slope' });
    assert.ok(r.stats.mean > 0.9 && r.stats.mean < 1.6, 'средний уклон ' + r.stats.mean);   // √(1,15²+0,57²) ≈ 1,28°
    assert.ok(r.overlay && r.overlay.png.length > 100);
    r = await A({ mode: 'flow' });
    assert.ok(r.lines.features.length > 0);
    const main = r.lines.features.reduce((a, f) => f.properties.catchment_km2 > a.properties.catchment_km2 ? f : a);
    assert.ok(main.properties.catchment_km2 > 1, 'главный тальвег ' + main.properties.catchment_km2);
    r = await A({ mode: 'watershed', point: [74.603, 66.61] });
    assert.ok(r.stats.area_km2 > 2 && r.stats.area_km2 <= 4.3, 'водосбор ' + r.stats.area_km2);
    // сравнение: сначала узнаём высоты ArcticDEM в точках, затем «съёмка» на 0,5 м выше
    const P = [[74.61, 66.605], [74.62, 66.612], [74.63, 66.615], [74.64, 66.607]];
    const d0 = (await A({ mode: 'compare', points: P.map(q => [...q, 0]) })).points.features.map(f => f.properties.dem);
    r = await A({ mode: 'compare', points: P.map((q, i) => [...q, d0[i] + 0.5]) });
    assert.ok(Math.abs(r.stats.mean - 0.5) < 0.2, 'сдвиг съёмки ' + r.stats.mean);
    assert.strictEqual((await S.api('POST', '/api/dem/analysis', { bbox, mode: 'watershed' })).status, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
