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
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
