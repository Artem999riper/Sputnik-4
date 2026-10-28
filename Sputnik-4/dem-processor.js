// ═══════════════════════════════════════════════════════════
// dem-processor.js
// DXF генерируется через Python (OSGeo4W) — чистый R12
// Спутник через тайлы Esri + GDAL VRT
// ═══════════════════════════════════════════════════════════

const { execFile, exec } = require('child_process');
const https   = require('https');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const execP     = promisify(exec);

// ── STAC API ───────────────────────────────────────────────
const STAC_TIMEOUT_MS = 15000; // 15 секунд — быстрый таймаут

function stacSearch(bbox, collection) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      collections: [collection],
      bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat],
      limit: 20,
    });
    let settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(connTimer); fn(v); };

    // Жёсткий таймер на соединение (ETIMEDOUT может висеть несколько минут)
    const connTimer = setTimeout(() => {
      try { req.destroy(); } catch(e) {}
      done(reject, new Error('Таймаут подключения к ArcticDEM STAC API (15 сек). Проверьте доступ к stac.pgc.umn.edu:443'));
    }, STAC_TIMEOUT_MS);

    const req = https.request({
      hostname: 'stac.pgc.umn.edu', path: '/api/v1/search', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: STAC_TIMEOUT_MS,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { done(resolve, JSON.parse(d)); } catch(e) { done(reject, e); } });
    });
    req.on('error', e => done(reject, e));
    req.on('timeout', () => { req.destroy(); done(reject, new Error('STAC socket timeout')); });
    req.write(body); req.end();
  });
}

// ── Прямые S3-URLs (fallback без STAC) ────────────────────
// ArcticDEM mosaics v4.1: тайлы 1°×1°, имя n62e068, n61e073 и т.д.
function _buildDirectDemUrls(bbox, res) {
  const BASE = 'https://pgc-opendata-dems.s3.us-east-1.amazonaws.com/arcticdem/mosaics/v4.1';
  const urls = [];
  for (let lat = Math.floor(bbox.minLat); lat <= Math.floor(bbox.maxLat); lat++) {
    for (let lng = Math.floor(bbox.minLng); lng <= Math.floor(bbox.maxLng); lng++) {
      const latS = lat >= 0 ? `n${String(lat).padStart(2,'0')}` : `s${String(-lat).padStart(2,'0')}`;
      const lngS = lng >= 0 ? `e${String(lng).padStart(3,'0')}` : `w${String(-lng).padStart(3,'0')}`;
      const id   = `${latS}${lngS}`;
      urls.push(`/vsicurl/${BASE}/${res}/${id}/${id}_${res}_v4.1_dem.tif`);
    }
  }
  return urls;
}

// ── GDAL ───────────────────────────────────────────────────
const IS_WINDOWS = process.platform === 'win32';
const GDAL_DIRS = [
  'C:\\OSGeo4W\\bin', 'C:\\OSGeo4W64\\bin',
  'C:\\Program Files\\GDAL', 'C:\\Program Files\\OSGeo4W\\bin',
];
const GDAL_DIRS_LINUX = [
  '/usr/bin', '/usr/local/bin', '/opt/local/bin',
];
let _gdalBin = null, _gdalData = null, _projLib = null, _pythonExe = null;

function findGDALBin() {
  if (_gdalBin) return _gdalBin;

  if (!IS_WINDOWS) {
    // Linux / macOS — ищем без .exe
    for (const d of GDAL_DIRS_LINUX) {
      if (fs.existsSync(path.join(d, 'gdalwarp'))) { _gdalBin = d; break; }
    }
    if (!_gdalBin) throw new Error('GDAL не найден. Установите: sudo apt install gdal-bin');
    _gdalData = process.env.GDAL_DATA || '';
    _projLib  = process.env.PROJ_LIB  || '';
    // prefer python version matching gdal bindings (3.12 on Ubuntu 24.04)
    for (const p of ['/usr/bin/python3.12', '/usr/bin/python3.11', '/usr/local/bin/python3', '/usr/bin/python3', 'python3']) {
      if (p.startsWith('/') && !fs.existsSync(p)) continue;
      try {
        const { execFileSync } = require('child_process');
        execFileSync(p, ['-c', 'from osgeo import gdal'], { stdio: 'ignore' });
        _pythonExe = p; break;
      } catch(e) {}
    }
    _pythonExe = _pythonExe || 'python3';
    console.log('[DEM] GDAL bin:', _gdalBin, '| Python:', _pythonExe);
    return _gdalBin;
  }

  // Windows — OSGeo4W
  for (const d of GDAL_DIRS) {
    if (fs.existsSync(path.join(d, 'gdalwarp.exe'))) { _gdalBin = d; break; }
  }
  if (!_gdalBin) {
    for (const base of ['C:\\Program Files', 'C:\\Program Files (x86)']) {
      if (!fs.existsSync(base)) continue;
      try {
        for (const sub of fs.readdirSync(base)) {
          const b = path.join(base, sub, 'bin');
          if (fs.existsSync(path.join(b, 'gdalwarp.exe'))) { _gdalBin = b; break; }
        }
      } catch(e) {}
      if (_gdalBin) break;
    }
  }
  if (!_gdalBin) throw new Error('GDAL не найден. Установите OSGeo4W: https://trac.osgeo.org/osgeo4w/');

  const root = path.resolve(_gdalBin, '..');
  const dataCands = [
    path.join(root,'share','gdal'),
    'C:\\OSGeo4W\\share\\gdal', 'C:\\OSGeo4W64\\share\\gdal',
  ];
  _gdalData = dataCands.find(p => fs.existsSync(path.join(p, 'gcs.csv')))
           || dataCands.find(p => fs.existsSync(p))
           || process.env.GDAL_DATA || '';
  const projCands = [
    path.join(root,'share','proj'),
    'C:\\OSGeo4W\\share\\proj', 'C:\\OSGeo4W64\\share\\proj',
  ];
  _projLib = projCands.find(p => fs.existsSync(path.join(p,'proj.db')))
          || projCands.find(p => fs.existsSync(p))
          || process.env.PROJ_LIB || '';

  const pyPaths = [
    path.join(root, 'apps', 'Python312', 'python.exe'),
    path.join(root, 'apps', 'Python39', 'python.exe'),
    path.join(root, 'bin', 'python3.exe'),
    path.join(root, 'bin', 'python.exe'),
  ];
  _pythonExe = pyPaths.find(p => fs.existsSync(p)) || 'python';

  console.log('[DEM] GDAL bin:', _gdalBin);
  console.log('[DEM] GDAL_DATA:', _gdalData);
  console.log('[DEM] PROJ_LIB:', _projLib);
  console.log('[DEM] Python:', _pythonExe);
  return _gdalBin;
}

function gdal(exe) {
  return path.join(findGDALBin(), IS_WINDOWS ? exe + '.exe' : exe);
}

function gdalEnv() {
  findGDALBin();
  if (!IS_WINDOWS) {
    return {
      ...process.env,
      GDAL_HTTP_CONNECTTIMEOUT: '30',
      GDAL_HTTP_TIMEOUT: '300',
      CPL_VSIL_CURL_ALLOWED_EXTENSIONS: '.tif,.vrt,.tiff',
      GDAL_CACHEMAX: '512',
      VSI_CACHE: 'TRUE',
      VSI_CACHE_SIZE: '104857600',
      PROJ_NETWORK: 'ON',
    };
  }
  const root = path.resolve(_gdalBin, '..');
  return {
    ...process.env,
    PATH: `${_gdalBin};${process.env.PATH}`,
    GDAL_DATA: _gdalData || '',
    PROJ_LIB:  _projLib  || '',
    GDAL_DRIVER_PATH: path.join(_gdalBin, 'gdalplugins'),
    GDAL_HTTP_CONNECTTIMEOUT: '30',
    GDAL_HTTP_TIMEOUT: '300',
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS: '.tif,.vrt,.tiff',
    GDAL_CACHEMAX: '512',
    VSI_CACHE: 'TRUE',
    VSI_CACHE_SIZE: '104857600',
    PROJ_NETWORK: 'ON',
    PYTHONPATH: [
      path.join(root, 'apps', 'Python312', 'lib', 'site-packages'),
      path.join(root, 'apps', 'Python39',  'lib', 'site-packages'),
      path.join(root, 'bin'),
    ].filter(p => fs.existsSync(p)).join(';'),
  };
}

function runGDAL(exe, args) {
  console.log('[DEM]', exe, args.slice(0,5).join(' '));
  return execFileP(gdal(exe), args, {
    env: gdalEnv(), maxBuffer: 400*1024*1024, timeout: 600000,
  });
}

// Как runGDAL, но парсит индикатор прогресса gdalwarp (печатается по умолчанию
// в stdout как "0...10...20...30...40...50...60...70...80...90...100 - done.")
// и вызывает onPct(0..100) по ~5%.
function runGDALProgress(exe, args, onPct) {
  console.log('[DEM]', exe, '(progress)', args.slice(0,5).join(' '));
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(gdal(exe), args, { env: gdalEnv() });
    let errBuf = '';
    let last = -1;
    const parse = (chunk) => {
      const s = chunk.toString();
      const nums = s.match(/\d{1,3}/g);
      if (nums) {
        for (const n of nums) {
          const v = parseInt(n, 10);
          if (v >= 0 && v <= 100 && v >= last + 5) { last = v; try { onPct(v); } catch(_) {} }
        }
      }
    };
    child.stdout.on('data', parse);
    child.stderr.on('data', d => { errBuf += d; });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve({ stdout: '', stderr: errBuf })
      : reject(new Error(errBuf.slice(0, 300) || `${exe} exited ${code}`)));
  });
}

// ── Локальные DEM-тайлы ────────────────────────────────────
let _demTilesDir = path.join(__dirname, 'dem_tiles');

function getDemTilesDir() { return _demTilesDir; }
function setDemTilesDir(dir) { _demTilesDir = path.resolve(dir); }

function _findLocalTiles() {
  if (!fs.existsSync(getDemTilesDir())) return [];
  try {
    return fs.readdirSync(getDemTilesDir())
      .filter(f => /\.(tif|tiff)$/i.test(f))
      .map(f => path.join(getDemTilesDir(), f));
  } catch(e) { return []; }
}

// Парсит bbox из имени файла кэша: dem_<minLng>_<minLat>_<maxLng>_<maxLat>.tif
function _tileBboxFromName(name) {
  const m = name.match(/^dem_(-?[\d.]+)_(-?[\d.]+)_(-?[\d.]+)_(-?[\d.]+)\.tif$/i);
  if (!m) return null;
  return { minLng: +m[1], minLat: +m[2], maxLng: +m[3], maxLat: +m[4] };
}

// Возвращает локальный тайл, который ПОЛНОСТЬЮ покрывает запрошенный bbox (или null)
function _findCoveringLocalTile(bbox) {
  if (!fs.existsSync(getDemTilesDir())) return null;
  const eps = 1e-6;
  let files;
  try { files = fs.readdirSync(getDemTilesDir()).filter(f => /\.tif$/i.test(f)); }
  catch(_) { return null; }
  for (const f of files) {
    const tb = _tileBboxFromName(f);
    if (!tb) continue;
    if (tb.minLng <= bbox.minLng + eps && tb.maxLng >= bbox.maxLng - eps &&
        tb.minLat <= bbox.minLat + eps && tb.maxLat >= bbox.maxLat - eps) {
      return path.join(getDemTilesDir(), f);
    }
  }
  return null;
}

// Получает список тайлов (локальных или удалённых) для bbox
async function _resolveTilesForBbox(bbox) {
  // Только тайлы кэша, которые пересекают область (раньше брались все — и профиль
  // в новом районе получал пустые значения вместо загрузки из ArcticDEM)
  const local = _findLocalTiles().filter(f => {
    const tb = _tileBboxFromName(path.basename(f));
    return !tb || (tb.minLng < bbox.maxLng && tb.maxLng > bbox.minLng && tb.minLat < bbox.maxLat && tb.maxLat > bbox.minLat);
  });
  if (local.length) return local;

  // Нет локальных — обращаемся к STAC/S3 (GDAL читает удалённые COG без полного скачивания)
  for (const col of ['arcticdem-mosaics-v4.1-2m', 'arcticdem-mosaics-v4.1-10m']) {
    try {
      const r = await stacSearch(bbox, col);
      const urls = (r.features || []).map(item => {
        const a = item.assets || {};
        const k = Object.keys(a).find(k => k === 'dem' || k.endsWith('_dem')) || Object.keys(a)[0];
        return a[k]?.href;
      }).filter(Boolean).map(u => u.startsWith('s3://') ? '/vsis3/' + u.slice(5) : '/vsicurl/' + u);
      if (urls.length) return urls;
    } catch(_) {}
  }
  // Fallback: прямые S3-URL по сетке 1°×1°
  return _buildDirectDemUrls(bbox, '2m');
}


// возвращает значение, которое нужно ПРИБАВИТЬ к эллипсоидальной высоте (Terrarium) для BSV-77
// Т.е.: H_bsv77 = h_ellipsoidal + N_correction
async function computeGeoidN(lat, lng) {
  findGDALBin();
  if (!_pythonExe) return null;
  // Автоматическое скачивание grid-файлов отключено (cdn.proj.org недоступен)
  // Python: создаём 3×3 GeoTIFF с нулевыми эллипсоидальными высотами,
  // применяем конвертацию EPSG:4979→EPSG:3855/5773/9518.
  // Результат = ортометрическая высота при h=0 = H = 0 - N → N = -H
  // но нам нужна поправка +|N| для конвертации, поэтому возвращаем значение напрямую
  const py = `
from osgeo import gdal, osr
import sys
gdal.UseExceptions()
lng,lat=${lng},${lat}
drv=gdal.GetDriverByName('MEM')
ds=drv.Create('',3,3,1,gdal.GDT_Float32)
srs=osr.SpatialReference(); srs.ImportFromEPSG(4326)
ds.SetProjection(srs.ExportToWkt())
ds.SetGeoTransform([lng-0.001,0.001,0,lat+0.001,0,-0.001])
ds.GetRasterBand(1).SetNoDataValue(-9999)
ds.GetRasterBand(1).Fill(0)
for dst in ['EPSG:4326+3855','EPSG:4326+5773','EPSG:9518']:
    try:
        wo=gdal.WarpOptions(srcSRS='EPSG:4979',dstSRS=dst,outputBounds=(lng-0.001,lat-0.002,lng+0.002,lat+0.001),width=3,height=3,resampleAlg='bilinear',format='MEM')
        out=gdal.Warp('',ds,options=wo)
        val=float(out.GetRasterBand(1).ReadAsArray()[1,1])
        if abs(val)>0.5:
            print(val); sys.exit(0)
    except Exception as e:
        pass
print('null')
`.trim();
  try {
    const r = await execFileP(_pythonExe, ['-c', py],
      { env: gdalEnv(), timeout: 30000, maxBuffer: 65536 });
    const s = (r.stdout || '').trim();
    if (!s || s === 'null') return null;
    const val = parseFloat(s);
    if (isNaN(val)) return null;
    // val = H при h=0 = -N → поправка для добавления к WGS84: correction = val = -N
    return val;
  } catch(e) {
    console.log('[GEOID N] error:', e.message.slice(0, 100));
    return null;
  }
}

// ── Общий сэмплер высот по ArcticDEM (та же математика, что и в экспорте) ──
// Возвращает { values:[<num|null>...], geoidApplied:bool } или null (нет тайлов/GDAL).
// Метод поправки геоида идентичен processDEM: поле -N (warp Z=0 EPSG:4979→3855/5773/9518),
// прибавляется к сырой WGS84-эллипсоидальной высоте на нативном разрешении.
async function _sampleElevationsAtPoints(points, opts = {}) {
  findGDALBin();
  if (!_pythonExe) return null;
  if (!points || points.length === 0) return { values: [], geoidApplied: false };

  const margin = opts.margin != null ? opts.margin : 0.01;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLng = Math.min(...lngs) - margin, maxLng = Math.max(...lngs) + margin;
  const minLat = Math.min(...lats) - margin, maxLat = Math.max(...lats) + margin;

  const tiles = await _resolveTilesForBbox({ minLat, maxLat, minLng, maxLng });
  if (!tiles.length) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epsamp-'));
  try {
    const vrtFile = path.join(tmpDir, 'combined.vrt');
    const clipped = path.join(tmpDir, 'clipped.tif');

    await runGDAL('gdalbuildvrt', ['-vrtnodata', '-9999', vrtFile, ...tiles]);
    await runGDAL('gdalwarp', [
      '-te', String(minLng), String(minLat), String(maxLng), String(maxLat),
      '-r', 'bilinear', '-dstnodata', '-9999', vrtFile, clipped,
    ]);

    const srcPath = clipped.replace(/\\/g, '/');
    const ptsJson = JSON.stringify(points.map(p => [p.lat, p.lng]));
    const pyCode = `
import sys, json
from osgeo import gdal, osr
import numpy as np
gdal.UseExceptions()
src = gdal.Open(r'${srcPath}')
if src is None:
    print(json.dumps({"values":[None]*${points.length},"geoid":False})); sys.exit(0)
gt = src.GetGeoTransform()
band = src.GetRasterBand(1)
data = band.ReadAsArray().astype(np.float32)
nd = band.GetNoDataValue()

corr = None
mem = gdal.GetDriverByName('MEM').Create('', src.RasterXSize, src.RasterYSize, 1, gdal.GDT_Float32)
mem.SetGeoTransform(gt)
s4979 = osr.SpatialReference(); s4979.ImportFromEPSG(4979); mem.SetProjection(s4979.ExportToWkt())
mb = mem.GetRasterBand(1); mb.Fill(0.0); mb.SetNoDataValue(-9999)
# Целевая СК — составная (WGS-84 + высоты геоида) и та же сетка, что у растра:
# с чисто вертикальной СК gdalwarp меняет размер растра и поправка «съезжает»
_b = (gt[0], gt[3] + gt[5] * src.RasterYSize, gt[0] + gt[1] * src.RasterXSize, gt[3])
for dst in ['EPSG:4326+3855', 'EPSG:4326+5773', 'EPSG:9518']:
    try:
        wo = gdal.WarpOptions(srcSRS='EPSG:4979', dstSRS=dst, outputBounds=_b, width=src.RasterXSize, height=src.RasterYSize, resampleAlg='bilinear', format='MEM')
        out = gdal.Warp('', mem, options=wo)
        c = out.GetRasterBand(1).ReadAsArray().astype(np.float32)
        if float(np.nanmax(np.abs(c))) > 0.5:
            corr = c; break
    except Exception as ex:
        pass

results = []
pts = ${ptsJson}
for lat, lng in pts:
    px = int((lng - gt[0]) / gt[1])
    py = int((lat - gt[3]) / gt[5])
    if 0 <= px < src.RasterXSize and 0 <= py < src.RasterYSize:
        v = float(data[py, px])
        if v <= -9000 or (nd is not None and abs(v - nd) < 1):
            results.append(None)
        else:
            if corr is not None:
                # corr может быть на 1-2 пикселя меньше data из-за округления gdalwarp
                cpx = min(px, corr.shape[1]-1)
                cpy = min(py, corr.shape[0]-1)
                v += float(corr[cpy, cpx])
            results.append(round(v, 2))
    else:
        results.append(None)
print(json.dumps({"values": results, "geoid": corr is not None}))
`;
    const pyFile = path.join(tmpDir, 'query.py');
    fs.writeFileSync(pyFile, pyCode);
    const r = await execFileP(_pythonExe, [pyFile], {
      env: gdalEnv(), timeout: 60000, maxBuffer: 1024 * 1024,
    });

    // Кэшируем вырезку для следующих обращений (тот же кэш, что и у экспорта)
    try {
      if (!fs.existsSync(getDemTilesDir())) fs.mkdirSync(getDemTilesDir(), { recursive: true });
      const cacheKey = [minLng, minLat, maxLng, maxLat].map(v => v.toFixed(3)).join('_');
      const cacheTif = path.join(getDemTilesDir(), `dem_${cacheKey}.tif`);
      if (!fs.existsSync(cacheTif)) fs.copyFileSync(clipped, cacheTif);
    } catch(_) {}

    const parsed = JSON.parse(r.stdout.trim());
    return { values: parsed.values, geoidApplied: !!parsed.geoid };
  } catch(e) {
    console.error('[_sampleElevationsAtPoints]', e.message);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
  }
}

async function getElevationAtPoint(lat, lng) {
  const r = await _sampleElevationsAtPoints([{ lat, lng }], { margin: 0.005 });
  if (!r) throw new Error('no_tiles');
  const v = r.values[0];
  if (v == null) throw new Error('no_elev');
  return {
    elevation: v,
    source: 'arcticdem',
    datum: r.geoidApplied ? 'bsv77' : 'wgs84_ellipsoidal',
  };
}

// ── Профиль высот: пакетный запрос по ArcticDEM + геоид ───
async function getElevationProfile(points) {
  const r = await _sampleElevationsAtPoints(points, { margin: 0.01 });
  if (!r) return null;
  return { values: r.values, geoidApplied: r.geoidApplied };
}

function getDemTilesInfo() {
  if (!fs.existsSync(getDemTilesDir())) return { dir: getDemTilesDir(), tiles: [], exists: false };
  try {
    const tiles = fs.readdirSync(getDemTilesDir())
      .filter(f => /\.(tif|tiff)$/i.test(f))
      .map(f => ({ name: f, size: fs.statSync(path.join(getDemTilesDir(), f)).size }));
    return { dir: getDemTilesDir(), tiles, exists: true };
  } catch(e) { return { dir: getDemTilesDir(), tiles: [], exists: true, error: e.message }; }
}

// ── Спутник ────────────────────────────────────────────────
function lon2tile(lon,z) { return Math.floor((lon+180)/360*Math.pow(2,z)); }
function lat2tile(lat,z) {
  const r=Math.log(Math.tan((90+lat)*Math.PI/360))/(Math.PI/180);
  return Math.floor((1-r/180)*Math.pow(2,z)/2);
}
function tile2lon(x,z) { return x/Math.pow(2,z)*360-180; }
function tile2lat(y,z) {
  const n=Math.PI-2*Math.PI*y/Math.pow(2,z);
  return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));
}

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function _tileHeaders(url) {
  if (url.includes('google.com'))          return { 'User-Agent':UA_BROWSER, 'Referer':'https://maps.google.com/', 'Origin':'https://maps.google.com' };
  if (url.includes('arcgisonline.com') ||
      url.includes('arcgis.com'))          return { 'User-Agent':UA_BROWSER, 'Referer':'https://www.arcgis.com/' };
  if (url.includes('cgkipd.ru'))           return { 'User-Agent':UA_BROWSER, 'Referer':'https://fsgs.cgkipd.ru/' };
  if (url.includes('openstreetmap.org'))   return { 'User-Agent':'Sputnik-4/1.0 (survey app; contact: falconsvc71@gmail.com)', 'Referer':'https://www.openstreetmap.org/' };
  if (url.includes('opentopomap.org'))     return { 'User-Agent':UA_BROWSER, 'Referer':'https://opentopomap.org/' };
  if (url.includes('cartocdn.com'))        return { 'User-Agent':UA_BROWSER, 'Referer':'https://carto.com/' };
  if (url.includes('2gis.com'))            return { 'User-Agent':UA_BROWSER, 'Referer':'https://2gis.ru/' };
  return { 'User-Agent':UA_BROWSER };
}

function fetchTile(z,x,y,urlTemplate,subdomains) {
  let url;
  if (urlTemplate) {
    const s=(subdomains&&subdomains.length)?subdomains[Math.floor(Math.random()*subdomains.length)]:'';
    url=urlTemplate.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{s}',s).replace('{r}','');
  } else {
    url=`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
  const mod=url.startsWith('https')?https:require('http');
  return new Promise((resolve,reject)=>{
    const req=mod.get(url,{
      headers: _tileHeaders(url),
      timeout:20000,
      rejectUnauthorized:false,   // российские CA (Минцифры) не в bundle Node.js
    },res=>{
      const c=[];
      res.on('data',d=>c.push(d));
      res.on('end',()=>res.statusCode===200?resolve(Buffer.concat(c)):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on('error',reject);
    req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});
  });
}

async function buildSatellite(bbox, tmpDir, proj4, epsg, reprojTif, satZoom, satSourceUrl, satSourceSubdomains, satMPP) {
  const {minLat,maxLat,minLng,maxLng} = bbox;

  // Вычисляем размер области в км для решения о зуме
  const latKm  = (maxLat-minLat)*111.32;
  const lonKm  = (maxLng-minLng)*111.32*Math.cos((minLat+maxLat)/2*Math.PI/180);
  console.log(`[SAT] Area: ${latKm.toFixed(1)}x${lonKm.toFixed(1)} km`);

  // Целевая СК
  const targetSrs = proj4 ? proj4 : `EPSG:${epsg||4326}`;

  // Шаг 1: выбираем zoom. Большая подложка в хорошем качестве достигается не
  // понижением зума, а разбиением готового изображения на части (ниже). Поэтому:
  //  • ручной зум уважаем как есть (качество не режем);
  //  • «Авто» — берём максимально детальный зум в пределах AUTO_MAX_PX;
  //  • предохранитель MAX_TILES ограничивает объём загрузки (чтобы не висло вечно).
  const AUTO_MAX_PX = 16000;   // при «Авто» одиночное изображение не крупнее этого
  const MAX_TILES   = 20000;   // максимум тайлов на загрузку (защита от бесконечности)
  const _satDims = (z) => {
    const tx = Math.abs(lon2tile(maxLng, z) - lon2tile(minLng, z)) + 1;
    const ty = Math.abs(lat2tile(minLat, z) - lat2tile(maxLat, z)) + 1;
    return { tx, ty, w: tx * 256, h: ty * 256 };
  };
  let zoom;
  if (satZoom && satZoom > 0) {
    zoom = Math.min(Math.max(satZoom, 5), 19);           // ручной — как есть
  } else {
    zoom = 5;
    for (let z = 17; z >= 5; z--) { const d = _satDims(z); if (d.w <= AUTO_MAX_PX && d.h <= AUTO_MAX_PX) { zoom = z; break; } }
  }
  // Предохранитель по числу тайлов: если на выбранном зуме их слишком много —
  // понижаем зум, пока не уложимся (иначе загрузка/сборка займёт слишком долго).
  while (zoom > 5) { const d = _satDims(zoom); if (d.tx * d.ty <= MAX_TILES) break; zoom--; }
  { const d = _satDims(zoom); console.log(`[SAT] zoom=${zoom}, полное изображение ~${d.w}×${d.h} px, тайлов ${d.tx*d.ty}`); }

  const xMin = lon2tile(minLng,zoom), xMax = lon2tile(maxLng,zoom);
  const yMin = lat2tile(maxLat,zoom), yMax = lat2tile(minLat,zoom);
  const totalTiles = (xMax-xMin+1) * (yMax-yMin+1);
  console.log(`[SAT] zoom=${zoom} tiles=${xMax-xMin+1}x${yMax-yMin+1} (всего ${totalTiles})`);

  // PNG color type byte → channel count
  function _pngBands(buf) {
    // PNG sig(8) + chunk_len(4) + "IHDR"(4) + width(4) + height(4) + bitdepth(1) + colortype(1)
    if (!buf || buf.length < 26) return 3;
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return 3; // not PNG → assume JPEG (3 bands)
    const ct = buf[25]; // color type
    if (ct === 0 || ct === 4) return 1; // grayscale or grayscale+alpha
    if (ct === 6) return 4;             // RGBA
    return 3;                           // RGB or palette
  }

  const tileDir = path.join(tmpDir,'sat_tiles');
  fs.mkdirSync(tileDir, {recursive:true});
  const tileFiles = [];
  let tilesDone = 0, lastLogPct = -1;
  for (let ty2 = yMin; ty2 <= yMax; ty2++) {
    for (let tx2 = xMin; tx2 <= xMax; tx2++) {
      const out = path.join(tileDir, `t_${ty2}_${tx2}.jpg`);
      let tileBuf = null;
      for (let a = 0; a < 3; a++) {
        try { tileBuf = await fetchTile(zoom,tx2,ty2,satSourceUrl,satSourceSubdomains); fs.writeFileSync(out, tileBuf); break; }
        catch(e) { if (a===2) console.warn(`[SAT] tile ${tx2}/${ty2} fail:`,e.message); }
      }
      if (fs.existsSync(out)) tileFiles.push({file:out, tx:tx2, ty:ty2, bands:_pngBands(tileBuf)});
      tilesDone++;
      const pct = Math.floor(tilesDone / totalTiles * 100);
      if (pct >= lastLogPct + 5) {
        lastLogPct = pct;
        console.log(`[SAT] скачано ${tilesDone}/${totalTiles} тайлов (${pct}%)`);
      }
    }
  }
  if (!tileFiles.length) throw new Error('Не удалось скачать тайлы спутника');

  // Шаг 2: собираем VRT в EPSG:3857 (Web Mercator — родная проекция Esri-тайлов)
  // ВАЖНО: тайлы физически в Web Mercator (EPSG:3857), не в EPSG:4326!
  // Использование EPSG:4326 вносит дисторсию → неправильный масштаб пикселей после gdalwarp
  const EARTH_CIRC = 20037508.342789244;  // полуокружность Земли в Web Mercator (метры)
  const mercW = (xMax - xMin + 1) * 256;
  const mercH = (yMax - yMin + 1) * 256;
  // Web Mercator координаты углов тайлового блока
  const mxMin = (xMin / Math.pow(2, zoom)) * 2 * EARTH_CIRC - EARTH_CIRC;
  const mxMax = ((xMax + 1) / Math.pow(2, zoom)) * 2 * EARTH_CIRC - EARTH_CIRC;
  const myMax = EARTH_CIRC - (yMin / Math.pow(2, zoom)) * 2 * EARTH_CIRC;
  const myMin = EARTH_CIRC - ((yMax + 1) / Math.pow(2, zoom)) * 2 * EARTH_CIRC;
  const mpxW  = (mxMax - mxMin) / mercW;
  const mpxH  = (myMax - myMin) / mercH;

  const vrtLines = [
    `<VRTDataset rasterXSize="${mercW}" rasterYSize="${mercH}">`,
    `  <SRS>EPSG:3857</SRS>`,
    `  <GeoTransform>${mxMin}, ${mpxW}, 0, ${myMax}, 0, -${mpxH}</GeoTransform>`,
  ];
  for (const band of [1,2,3]) {
    vrtLines.push(`  <VRTRasterBand dataType="Byte" band="${band}">`);
    for (const {file,tx:tx2,ty:ty2,bands:tileBands} of tileFiles) {
      const xOff=(tx2-xMin)*256, yOff=(ty2-yMin)*256;
      const srcBand = Math.min(band, tileBands || 3);
      vrtLines.push(
        `    <SimpleSource><SourceFilename relativeToVRT="0">${file}</SourceFilename>`,
        `      <SourceBand>${srcBand}</SourceBand>`,
        `      <SrcRect xOff="0" yOff="0" xSize="256" ySize="256"/>`,
        `      <DstRect xOff="${xOff}" yOff="${yOff}" xSize="256" ySize="256"/>`,
        `    </SimpleSource>`);
    }
    vrtLines.push(`  </VRTRasterBand>`);
  }
  vrtLines.push(`</VRTDataset>`);
  const vrtFile = path.join(tmpDir,'sat.vrt');
  fs.writeFileSync(vrtFile, vrtLines.join('\n'));

  // Шаг 3: репроецируем из EPSG:3857 → целевая СК, обрезаем ТОЧНО по extent DEM-растра
  const satTif  = path.join(tmpDir,'sat_reproj.tif');
  const satPrj  = path.join(tmpDir,'satellite.prj');

  let teArgs;
  if (reprojTif && fs.existsSync(reprojTif)) {
    try {
      const {stdout:infoOut} = await execFileP(gdal('gdalinfo'), ['-json', reprojTif],
        {env:gdalEnv(), timeout:30000, maxBuffer:10*1024*1024});
      const demInfo = JSON.parse(infoOut);
      const gt = demInfo.geoTransform;
      const w  = demInfo.size[0], h = demInfo.size[1];
      if (gt) {
        const xMin2 = gt[0];
        const yMax2 = gt[3];
        const xMax2 = gt[0] + gt[1]*w + gt[2]*h;
        const yMin2 = gt[3] + gt[4]*w + gt[5]*h;
        teArgs = ['-te', String(Math.min(xMin2,xMax2)), String(Math.min(yMin2,yMax2)),
                         String(Math.max(xMin2,xMax2)), String(Math.max(yMin2,yMax2)),
                  '-te_srs', targetSrs];
        console.log(`[SAT] DEM extent (target SRS): ${teArgs.slice(1,5).join(' ')}`);
      }
    } catch(e) { console.warn('[SAT] DEM extent fallback:',e.message); }
  }
  if (!teArgs) {
    teArgs = ['-te', String(minLng), String(minLat), String(maxLng), String(maxLat),
              '-te_srs','EPSG:4326'];
  }

  // satMPP>0 → жёстко задаём размер пикселя (метров/пиксель), пиксели квадратные.
  // Нужно для ПО, которое вставляет растр «1 пиксель = 1 единица» (напр. МенуГЕО):
  // при satMPP=1 масштаб вставки получается верным сразу, без ручного домножения.
  const mpp = (satMPP && satMPP > 0) ? satMPP : 0;
  const trArgs = mpp ? ['-tr', String(mpp), String(mpp)] : [];
  await runGDAL('gdalwarp', [
    '-s_srs','EPSG:3857',   // источник — Web Mercator (родная проекция тайлов)
    '-t_srs', targetSrs,
    ...teArgs, ...trArgs,
    '-r','lanczos',
    '-co','COMPRESS=LZW','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',
    vrtFile, satTif,
  ]);
  if (mpp) console.log(`[SAT] фиксированный размер пикселя: ${mpp} м/пиксель`);

  // Шаг 4: геопривязка satTif + при необходимости РАЗБИЕНИЕ на части (для больших
  // площадей в хорошем качестве — чтобы не упираться в предел размера одного JPEG).
  const SECTION_PX = 16000;  // размер одной части подложки по стороне (16000 пкс = 16 км при 1 м/пикс)
  let gt = null, W = null, H = null, wkt = null;
  try {
    const {stdout} = await execFileP(gdal('gdalinfo'), ['-json', satTif],
      {env:gdalEnv(), timeout:60000, maxBuffer:16*1024*1024});
    const info = JSON.parse(stdout);
    gt = info.geoTransform; W = info.size ? info.size[0] : null; H = info.size ? info.size[1] : null;
    try {
      const {stdout:wktOut} = await execFileP(gdal('gdalsrsinfo'), ['-o','wkt', satTif],
        {env:gdalEnv(), timeout:15000, maxBuffer:1*1024*1024});
      wkt = (wktOut && wktOut.trim()) || (info.coordinateSystem && info.coordinateSystem.wkt) || null;
    } catch(e2) { wkt = info.coordinateSystem && info.coordinateSystem.wkt || null; }
  } catch(e) { console.warn('[SAT] gdalinfo fail:', e.message); }

  if (!gt || !W || !H) {
    // Фолбэк: геореференс. GeoTIFF «как есть» (масштаб/привязка внутри файла)
    const out0 = path.join(tmpDir, 'satellite.tif');
    await runGDAL('gdal_translate', ['-of','GTiff','-co','COMPRESS=JPEG','-co','PHOTOMETRIC=YCBCR',
      '-co','TILED=YES','-co','JPEG_QUALITY=95', satTif, out0]);
    return [{ tif: out0, idx:'0_0' }];
  }

  const pixW = Math.abs(gt[1]);
  if (wkt) { try { fs.writeFileSync(satPrj, wkt); } catch(e) {} }

  // Одна часть → ГЕОРЕФЕРЕНС. GeoTIFF (JPEG-сжатие внутри) + world-файл .tfw.
  // Привязка И масштаб хранятся ВНУТРИ .tif — поэтому при вставке в CAD/ГИС
  // подложка сразу встаёт на место с правильным размером, без ручного масштаба.
  const _writeSection = async (xoff, yoff, xs, ys, idx, outTif, outTfw) => {
    await runGDAL('gdal_translate', ['-of','GTiff',
      '-srcwin', String(xoff), String(yoff), String(xs), String(ys),
      '-co','COMPRESS=JPEG','-co','PHOTOMETRIC=YCBCR','-co','TILED=YES','-co','JPEG_QUALITY=95',
      satTif, outTif]);
    const sGt0 = gt[0] + xoff*gt[1] + yoff*gt[2];
    const sGt3 = gt[3] + xoff*gt[4] + yoff*gt[5];
    // world-файл .tfw (на случай ПО, которое читает его, а не теги GeoTIFF)
    const tfw = [ gt[1].toFixed(8), gt[4].toFixed(8), gt[2].toFixed(8), gt[5].toFixed(8),
      (sGt0 + gt[1]*0.5 + gt[2]*0.5).toFixed(4), (sGt3 + gt[4]*0.5 + gt[5]*0.5).toFixed(4) ].join('\r\n');
    fs.writeFileSync(outTfw, tfw);
    return { tif: outTif, tfw: outTfw, idx, pixelSizeM: pixW, imgWidthPx: xs, imgHeightPx: ys,
             gt: [sGt0, gt[1], gt[2], sGt3, gt[4], gt[5]] };
  };

  if (W <= SECTION_PX && H <= SECTION_PX) {
    const sec = await _writeSection(0, 0, W, H, '0_0',
      path.join(tmpDir, 'satellite.tif'), path.join(tmpDir, 'satellite.tfw'));
    if (wkt) sec.prj = satPrj;
    console.log(`[SAT] Done: 1 GeoTIFF ${W}×${H}px, пиксель ${pixW.toFixed(3)} м`);
    return [sec];
  }

  // Несколько частей: сетка окон SECTION_PX × SECTION_PX
  const cols = Math.ceil(W / SECTION_PX), rows = Math.ceil(H / SECTION_PX);
  const sections = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xoff = c * SECTION_PX, yoff = r * SECTION_PX;
      const xs = Math.min(SECTION_PX, W - xoff), ys = Math.min(SECTION_PX, H - yoff);
      const idx = `r${r}_c${c}`;
      const sec = await _writeSection(xoff, yoff, xs, ys, idx,
        path.join(tmpDir, `satellite_${idx}.tif`), path.join(tmpDir, `satellite_${idx}.tfw`));
      if (wkt && n === 0) sec.prj = satPrj;
      sections.push(sec);
      n++;
    }
  }
  console.log(`[SAT] Done: ${sections.length} GeoTIFF-частей (${cols}×${rows})`);
  return sections;
}


// Точка вставки для IMAGEATTACH = НИЖНИЙ-ЛЕВЫЙ угол растра (AutoCAD вставляет
// изображение от нижнего-левого угла, масштабируя вверх-вправо). Берём именно его,
// иначе при масштабировании картинка «уезжает».
function _satLowerLeft(s) {
  // gt = [x0, px, 0, y0, 0, -py]; верх-лево = (gt0, gt3); низ = gt3 + H*gt5
  return { x: s.gt[0], y: s.gt[3] + (s.imgHeightPx || 0) * s.gt[5] };
}
// Текст инструкции по привязке спутниковой подложки (1 или несколько частей).
function _satReadme(sections) {
  const secs = (sections || []).filter(s => s && s.tif && s.gt && s.pixelSizeM && s.imgHeightPx);
  if (!secs.length) return `\r\nСпутник: приложите файлы satellite*.tif (геопривязка внутри файла).\r\n`;
  const scaleF = secs[0].pixelSizeM.toFixed(6);
  let t = `\r\nСПУТНИКОВАЯ ПОДЛОЖКА (${secs.length === 1 ? '1 файл' : secs.length + ' частей'}) — файлы satellite*.tif:\r\n` +
    `  Это ГЕОРЕФЕРЕНС. GeoTIFF — привязка И масштаб хранятся ВНУТРИ файла.\r\n` +
    `  • AutoCAD / Robur / QGIS: просто приложите satellite*.tif (IMAGEATTACH /\r\n` +
    `    вставка растра) — подложка сразу встанет на место с правильным размером,\r\n` +
    `    НИЧЕГО масштабировать вручную не нужно.\r\n`;
  if (Math.abs(secs[0].pixelSizeM - 1) < 1e-6) {
    t += `  • Режим «1 пиксель = 1 метр»: в МенуГЕО масштаб при вставке сразу верный.\r\n`;
  } else {
    t += `  • Для МенуГЕО включите галочку «Подложка 1 пиксель = 1 метр» — иначе масштаб\r\n` +
         `    придётся умножать на ${scaleF}.\r\n`;
  }
  t += `\r\nСправочно (ручная вставка, НИЖНИЙ-ЛЕВЫЙ угол; масштаб ${scaleF}, поворот 0):\r\n`;
  for (const s of secs) { const ll = _satLowerLeft(s); t += `    ${path.basename(s.tif)}:  X=${ll.x.toFixed(3)}  Y=${ll.y.toFixed(3)}   (${s.imgWidthPx}x${s.imgHeightPx} пкс)\r\n`; }
  return t;
}
// Шаги 1–3 выгрузки рельефа: тайлы ArcticDEM (кэш → STAC → S3) → вырезка bbox в WGS-84
// → перевод высот в БСВ-77 (если useGeoid). Общие для выгрузки DXF и расчёта затопления.
// Возвращает { demTif, usedRes } или (cacheOnly) { cacheOnly, cached, file, usedRes }.
async function _fetchDemWgs({ bbox, tmpDir, log, onProgress, cacheOnly, useGeoid }) {
    const {minLat,maxLat,minLng,maxLng}=bbox;
    // 1. Поиск тайлов ArcticDEM: сначала локальный кэш, затем STAC → S3
    onProgress&&onProgress(8,'Поиск тайлов ArcticDEM...');
    let tifUrls=[],usedRes='2m';
    let stacOk=false;

    // 1a. Уже выгруженная территория? Берём из кэша, не качаем заново.
    const cachedCover = _findCoveringLocalTile({minLng,minLat,maxLng,maxLat});
    if (cachedCover) {
      tifUrls=[cachedCover];
      usedRes='кэш';
      stacOk=true;
      log.push('Кэш: территория уже выгружена — '+path.basename(cachedCover));
      onProgress&&onProgress(12,'Использую кэш ArcticDEM (без повторной загрузки)...');
    }

    if (!tifUrls.length) try {
      const r2=await stacSearch(bbox,'arcticdem-mosaics-v4.1-2m');
      if ((r2.features||[]).length){
        usedRes='2m'; stacOk=true;
        tifUrls=r2.features.map(item=>{
          const a=item.assets||{};
          const k=Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
          return a[k]?.href;
        }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
      }
    } catch(e){ log.push('STAC 2m: '+e.message.slice(0,60)); }
    if (!tifUrls.length){
      try {
        const r10=await stacSearch(bbox,'arcticdem-mosaics-v4.1-10m');
        if ((r10.features||[]).length){
          usedRes='10m'; stacOk=true;
          tifUrls=r10.features.map(item=>{
            const a=item.assets||{};
            const k=Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
            return a[k]?.href;
          }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
        }
      } catch(e){ log.push('STAC 10m: '+e.message.slice(0,60)); }
    }
    // Fallback: STAC недоступен — строим URLs прямо по сетке 1°×1°
    if (!tifUrls.length){
      log.push('STAC недоступен — прямые S3 URLs');
      onProgress&&onProgress(8,'Прямое подключение к S3 ArcticDEM...');
      tifUrls=_buildDirectDemUrls(bbox,'2m');
      usedRes='2m';
      if (!tifUrls.length) throw new Error('Не удалось определить тайлы ArcticDEM для выбранной области');
    }
    log.push(`Tiles: ${tifUrls.length} (${usedRes}${stacOk?'':' via S3'})`);

    // 2. VRT + clip
    onProgress&&onProgress(15,`Загрузка ArcticDEM ${usedRes}...`);
    const listF=path.join(tmpDir,'tiles.txt');
    const srcVrt=path.join(tmpDir,'src.vrt');
    fs.writeFileSync(listF,tifUrls.join('\n'));
    await runGDAL('gdalbuildvrt',['-input_file_list',listF,srcVrt]);

    // Прогресс клипа отображаем по ~5%. В режиме «только кэш» клип — единственный
    // тяжёлый шаг → растягиваем на 15..90%, иначе на 15..28% (дальше геоид/DXF).
    const clipFrom = 15, clipTo = cacheOnly ? 90 : 28;
    const clippedTif=path.join(tmpDir,'clipped.tif');
    await runGDALProgress('gdalwarp',[
      '-of','GTiff','-te',String(minLng),String(minLat),String(maxLng),String(maxLat),
      '-te_srs','EPSG:4326','-t_srs','EPSG:4326','-r','bilinear',
      '-co','COMPRESS=LZW','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',srcVrt,clippedTif,
    ], pct => onProgress && onProgress(
      Math.round(clipFrom + (clipTo-clipFrom)*pct/100),
      `Загрузка ArcticDEM ${usedRes}... ${pct}%`
    ));
    log.push('Clip OK');

    // Кэшируем raw WGS84-тайл для последующих запросов профиля высот
    // (пропускаем, если территория уже была взята из кэша — не плодим дубликаты)
    let savedCacheTif = null;
    if (!cachedCover) try {
      if (!fs.existsSync(getDemTilesDir())) fs.mkdirSync(getDemTilesDir(), { recursive: true });
      const cacheKey = [minLng, minLat, maxLng, maxLat].map(v => v.toFixed(3)).join('_');
      const cacheTif = path.join(getDemTilesDir(), `dem_${cacheKey}.tif`);
      if (!fs.existsSync(cacheTif)) fs.copyFileSync(clippedTif, cacheTif);
      savedCacheTif = cacheTif;
    } catch(e) { log.push('Cache skip: ' + e.message.slice(0, 60)); }

    // ── Режим «только кэш»: тайл сохранён, дальше ничего не делаем ──
    if (cacheOnly) {
      onProgress&&onProgress(100,'Тайл ArcticDEM закэширован');
      log.push('Cache-only: готово');
      return { cacheOnly: true, cached: !cachedCover, file: savedCacheTif || clippedTif, usedRes };
    }

    // 3. Геоид
    onProgress&&onProgress(28,useGeoid?'Перевод БСВ-77...':'Подготовка...');
    let demTif=clippedTif;
    if (useGeoid){
      const gTif    = path.join(tmpDir,'geoid.tif');
      const pyFile  = path.join(tmpDir,'apply_geoid.py');
      const srcPath = clippedTif.replace(/\\/g,'/');
      const dstPath = gTif.replace(/\\/g,'/');
      // Python-скрипт: вычисляет поправку как поле -N (gdalwarp Z=0→EPSG:3855),
      // прибавляет к каждому пикселю и ЗАПИСЫВАЕТ с тем же GeoTransform (без сдвига).
      // Это обходит баг: gdalwarp -t_srs EPSG:3855 меняет экстент растра (вертикальная
      // CRS без горизонтальных осей), что приводит к искажению горизонталей при репроекции.
      const pyCode = `
import sys
from osgeo import gdal, osr
import numpy as np
gdal.UseExceptions()
src=gdal.Open(r'${srcPath}')
gt=src.GetGeoTransform(); cols,rows=src.RasterXSize,src.RasterYSize
band=src.GetRasterBand(1); data=band.ReadAsArray().astype(np.float32)
nd=band.GetNoDataValue()
mem=gdal.GetDriverByName('MEM').Create('',cols,rows,1,gdal.GDT_Float32)
mem.SetGeoTransform(gt)
s4979=osr.SpatialReference(); s4979.ImportFromEPSG(4979); mem.SetProjection(s4979.ExportToWkt())
b=mem.GetRasterBand(1); b.Fill(0.0); b.SetNoDataValue(-9999)
ok=False
# Составная целевая СК + та же сетка: с чисто вертикальной СК gdalwarp менял размер
# растра, сложение падало и перевод в БСВ-77 молча пропускался
_b=(gt[0],gt[3]+gt[5]*rows,gt[0]+gt[1]*cols,gt[3])
for dst in ['EPSG:4326+3855','EPSG:4326+5773','EPSG:9518']:
    try:
        wo=gdal.WarpOptions(srcSRS='EPSG:4979',dstSRS=dst,outputBounds=_b,width=cols,height=rows,resampleAlg='bilinear',format='MEM')
        out=gdal.Warp('',mem,options=wo)
        corr=out.GetRasterBand(1).ReadAsArray().astype(np.float32)
        if float(np.nanmax(np.abs(corr)))<0.5: continue
        mask=((data>-9990) if nd is None else (data!=nd)) & (corr>-9000)
        data[mask]+=corr[mask]; ok=True; break
    except: pass
if not ok: print('GEOID_SKIP'); sys.exit(0)
s4326=osr.SpatialReference(); s4326.ImportFromEPSG(4326)
ds=gdal.GetDriverByName('GTiff').Create(r'${dstPath}',cols,rows,1,gdal.GDT_Float32,['COMPRESS=LZW','BIGTIFF=IF_SAFER'])
ds.SetGeoTransform(gt); ds.SetProjection(s4326.ExportToWkt())
ob=ds.GetRasterBand(1); ob.WriteArray(data)
if nd is not None: ob.SetNoDataValue(nd)
ds.FlushCache(); ds=None; print('GEOID_OK')
`.trim();
      let geoidOk=false;
      try{
        fs.writeFileSync(pyFile, pyCode);
        const r=await execFileP(_pythonExe,[pyFile],{env:gdalEnv(),timeout:120000,maxBuffer:1048576});
        const out=(r.stdout||'').trim();
        if(out==='GEOID_OK'){demTif=gTif;log.push('Geoid OK (Python/EGM)');geoidOk=true;}
        else log.push('Geoid skip: '+out);
      }catch(e){log.push('Geoid error: '+e.message.slice(0,80));}
      if(!geoidOk) log.push('Geoid skip (нет grid-файлов)');
    }
    return { demTif, usedRes, geoid: demTif !== clippedTif };
}

// ── Главная функция ────────────────────────────────────────
async function processDEM({bbox,clip,projId,proj4,epsg,projName,format,
                            interval,useGeoid,gridStep,jitterMin,jitterMax,exportSatellite,
                            satelliteOnly,cacheOnly,satZoom,satMPP,satSourceUrl,satSourceSubdomains,onProgress}) {
  gridStep = (gridStep !== undefined && gridStep !== null && gridStep !== '') ? parseInt(gridStep) : 20;
  if (isNaN(gridStep)) gridStep = 20;
  const jMin = parseFloat(jitterMin)||0;
  const jMax = parseFloat(jitterMax)||0;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'arcticdem_'));
  const log    = [];

  try {
    findGDALBin();
    const {minLat,maxLat,minLng,maxLng}=bbox;
    const areaKm2=((maxLat-minLat)*111.32)*((maxLng-minLng)*111.32*Math.cos((minLat+maxLat)/2*Math.PI/180));
    log.push(`Area: ${areaKm2.toFixed(1)} km²`);

    // ── Режим «только спутник»: пропускаем весь DEM-пайплайн ──────────────
    if (satelliteOnly) {
      onProgress&&onProgress(10,'Загрузка спутника...');
      const satRes = await buildSatellite(bbox,tmpDir,proj4,epsg,null,satZoom,satSourceUrl,satSourceSubdomains,satMPP);
      const satFiles=[];
      for (const sec of satRes) {
        if (sec.tif && fs.existsSync(sec.tif)) satFiles.push(sec.tif);
        if (sec.tfw && fs.existsSync(sec.tfw)) satFiles.push(sec.tfw);
        if (sec.prj && fs.existsSync(sec.prj)) satFiles.push(sec.prj);
      }
      onProgress&&onProgress(90,'Упаковка архива...');
      const infoFile=path.join(tmpDir,'readme.txt');
      fs.writeFileSync(infoFile,`ArcticDEM Satellite Export\r\n=========================\r\nДата: ${new Date().toLocaleString('ru')}\r\nСК: ${projName||projId} ${proj4||''}\r\nРежим: только подложка (JPEG + геопривязка)${_satReadme(satRes)}`);
      const zipFile=path.join(tmpDir,'satellite_export.zip');
      const filesToZip=[...satFiles,infoFile].filter(f=>fs.existsSync(f));
      await new Promise((resolve,reject)=>{
        if (IS_WINDOWS){
          const toZip=filesToZip.map(f=>`'${f}'`).join(',');
          exec(`powershell -Command "Compress-Archive -Path ${toZip} -DestinationPath '${zipFile}' -Force"`,(err,_,se)=>err?reject(new Error(se||err.message)):resolve());
        } else {
          execFile('zip',['-j',zipFile,...filesToZip],(err,_,se)=>err?reject(new Error(se||err.message)):resolve());
        }
      });
      return {file:zipFile,tmpDir,log,mime:'application/zip'};
    }

    const fetched = await _fetchDemWgs({ bbox, tmpDir, log, onProgress, cacheOnly, useGeoid });
    if (fetched.cacheOnly) return { cacheOnly: true, tmpDir, log, cached: fetched.cached, file: fetched.file };
    const { demTif, usedRes, geoid } = fetched;

    // 4. Репроекция (+ обрезка по контуру/коридору, если задан clip-полигон)
    onProgress&&onProgress(36,'Перепроецирование...');
    const reprojTif=path.join(tmpDir,'reproj.tif');
    const targetSrs=proj4?proj4:`EPSG:${epsg||4326}`;
    const warpArgs=['-of','GTiff','-t_srs',targetSrs,'-r','bilinear',
      '-co','COMPRESS=LZW','-co','TILED=YES','-co','BIGTIFF=IF_SAFER'];
    // clip: GeoJSON-полигон в WGS-84 ([lng,lat]); gdalwarp сам перепроецирует его в targetSrs
    let cutFile=null;
    if (clip && clip.type==='Polygon' && Array.isArray(clip.coordinates)) {
      try {
        cutFile=path.join(tmpDir,'cutline.geojson');
        fs.writeFileSync(cutFile, JSON.stringify({
          type:'FeatureCollection',
          crs:{type:'name',properties:{name:'urn:ogc:def:crs:OGC:1.3:CRS84'}},
          features:[{type:'Feature',properties:{},geometry:clip}],
        }));
        warpArgs.push('-cutline',cutFile,'-crop_to_cutline');
        log.push('Clip by polygon ON');
      } catch(e){ cutFile=null; log.push('Clip WARN: '+e.message.slice(0,60)); }
    }
    warpArgs.push(demTif,reprojTif);
    try {
      await runGDAL('gdalwarp',warpArgs);
    } catch(e) {
      // Если обрезка по cutline не удалась — повторяем без неё, чтобы экспорт не падал
      if (cutFile) {
        log.push('Clip FAILED, fallback без обрезки: '+e.message.slice(0,60));
        await runGDAL('gdalwarp',['-of','GTiff','-t_srs',targetSrs,'-r','bilinear',
          '-co','COMPRESS=LZW','-co','TILED=YES','-co','BIGTIFF=IF_SAFER',demTif,reprojTif]);
      } else { throw e; }
    }
    log.push('Reproject OK');

    if (format==='geotiff') return {file:reprojTif,tmpDir,log,mime:'image/tiff'};

    // 5. Fillnodata + upsample
    // -md 100 (≈200 м): заполняем пустоты ArcticDEM над озёрами/реками/мелкой водой,
    // иначе в тундре с озёрами растр «дырявый» и горизонтали не строятся.
    onProgress&&onProgress(45,'Улучшение растра...');
    const filledTif=path.join(tmpDir,'filled.tif');
    try{
      await runGDAL('gdal_fillnodata',['-md','100','-si','2',reprojTif,filledTif]);
    }catch(e){ fs.copyFileSync(reprojTif,filledTif); }

    const upTif=path.join(tmpDir,'up.tif');
    try{
      await runGDAL('gdalwarp',['-r','cubicspline','-tr','5','5',
        '-co','COMPRESS=LZW','-co','BIGTIFF=IF_SAFER',filledTif,upTif]);
    }catch(e){ fs.copyFileSync(filledTif,upTif); }
    log.push('Upsample OK');

    // 6. Горизонтали → GPKG.
    // Автоподбор интервала: на плоских участках (у моря) при большом интервале
    // горизонталей может не быть — тогда повторяем с меньшим шагом (2→1→0.5 м).
    const contoursGpkg=path.join(tmpDir,'contours.gpkg');
    const _countContours=async()=>{
      try{
        const {stdout}=await execFileP(gdal('ogrinfo'),['-ro','-so',contoursGpkg,'contours'],
          {env:gdalEnv(),timeout:60000,maxBuffer:4*1024*1024});
        const m=/Feature Count:\s*(\d+)/i.exec(stdout||'');
        return m?parseInt(m[1]):0;
      }catch(e){return 0;}
    };
    // Ряд «круглых» шагов меньше запрошенного (до 0,1 м), не больше 3 попыток сверх заданного
    const reqInterval=parseFloat(interval)||2;
    const _intervals=[reqInterval, ...[20,10,5,2,1,0.5,0.25,0.1].filter(x=>x<reqInterval-1e-9).slice(0,3)];
    let usedInterval=reqInterval, nContours=0;
    for(const iv of _intervals){
      onProgress&&onProgress(55,`Горизонтали ${iv}м...`);
      try{ if(fs.existsSync(contoursGpkg))fs.rmSync(contoursGpkg,{force:true}); }catch(e){}
      await runGDAL('gdal_contour',[
        '-a','elevation','-i',String(iv),'-3d','-nln','contours','-f','GPKG',
        upTif,contoursGpkg,
      ]);
      usedInterval=iv;
      nContours=await _countContours();
      log.push(`Contours @${iv}m: ${nContours}`);
      if(nContours>0)break;
    }
    interval=usedInterval; // Python получит фактический интервал (для подписей)
    if(usedInterval!==reqInterval){
      log.push(`Contours: шаг уменьшен ${reqInterval} → ${usedInterval} м`);
      onProgress&&onProgress(60,`На шаге ${reqInterval} м горизонталей нет (плоский участок) — взят шаг ${usedInterval} м`);
    }
    log.push('Contours OK');

    // 7. Python → DXF R12
    onProgress&&onProgress(68,'Генерация DXF (Python)...');

    // Вычисляем textHeight
    const latM=(maxLat-minLat)*111320;
    const lngM=(maxLng-minLng)*111320*Math.cos((minLat+maxLat)/2*Math.PI/180);
    // Высота подписей — от размера участка; при мелком сечении горизонтали идут плотно,
    // поэтому текст уменьшаем пропорционально шагу (0,5 м → ×0,5, 0,1 м → ×0,25)
    const baseTH=Math.max(2,Math.round(Math.min(latM,lngM)/400));
    const textHeight=Math.max(0.5,Math.round(baseTH*Math.max(0.25,Math.min(1,parseFloat(interval)||2))*10)/10);

    const paramsFile=path.join(tmpDir,'params.json');
    const outDxf=path.join(tmpDir,'result.dxf');
    const pyScript=path.join(__dirname,'dem_export.py');

    fs.writeFileSync(paramsFile,JSON.stringify({
      contours_gpkg: contoursGpkg,
      reproj_tif:    reprojTif,
      output_dxf:    outDxf,
      interval:      interval,
      grid_step_m:   gridStep,
      text_height:   textHeight,
      jitter_min_m:  jMin,
      jitter_max_m:  jMax,
    }));

    // Запускаем Python из OSGeo4W
    const env=gdalEnv();
    const pyResult = await new Promise((resolve,reject)=>{
      exec(`"${_pythonExe}" "${pyScript}" "${paramsFile}"`,
        {env, timeout:600000, maxBuffer:50*1024*1024},
        (err,stdout,stderr)=>{
          console.log('[PY stdout]', stdout.slice(0,500));
          if (stderr) console.log('[PY stderr]', stderr.slice(0,300));
          if (err) reject(new Error(`Python error: ${stderr||err.message}`.slice(0,300)));
          else resolve(stdout);
        });
    });
    log.push('Python DXF OK');

    if (!fs.existsSync(outDxf)||fs.statSync(outDxf).size<500) {
      throw new Error(`DXF не создан или пустой (${fs.existsSync(outDxf)?fs.statSync(outDxf).size:0} bytes)`);
    }
    // Разбираем счётчики из вывода Python: "[PY] DONE: N contours, M labels, K grid points".
    // Если нет ни горизонталей, ни точек высот — в области нет данных рельефа ArcticDEM
    // (вода/пропуск покрытия). Не отдаём молча «пустой» DXF, а сообщаем понятную причину.
    const mDone = /DONE:\s*(\d+)\s+contours,\s*(\d+)\s+labels,\s*(\d+)\s+grid points/i.exec(pyResult||'');
    if (mDone) {
      const nContours = +mDone[1], nPoints = +mDone[3];
      log.push(`contours=${nContours}, points=${nPoints}`);
      if (nContours === 0 && nPoints === 0) {
        // Диагностика: сколько валидных пикселей и диапазон высот в растре
        let stats = '';
        try {
          const { stdout } = await execFileP(gdal('gdalinfo'), ['-stats', upTif],
            { env: gdalEnv(), timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
          const vp = /STATISTICS_VALID_PERCENT=([\d.]+)/i.exec(stdout);
          const mn = /STATISTICS_MINIMUM=(-?[\d.]+)/i.exec(stdout);
          const mx = /STATISTICS_MAXIMUM=(-?[\d.]+)/i.exec(stdout);
          if (vp) stats = ` (валидных пикселей: ${(+vp[1]).toFixed(0)}%` +
            (mn && mx ? `, высоты ${(+mn[1]).toFixed(1)}…${(+mx[1]).toFixed(1)} м)` : ')');
        } catch (e) {}
        throw new Error('В выбранной области нет данных рельефа ArcticDEM' + stats +
          ' — вероятно, это вода (морская акватория/залив) или участок без покрытия. Сместите/уменьшите рамку на сушу.');
      }
    }
    log.push(`DXF size: ${fs.statSync(outDxf).size} bytes`);

    // 8. Спутник
    let satFiles=[];
    let satSections=[];
    if (exportSatellite){
      onProgress&&onProgress(85,'Загрузка спутника...');
      try{
        satSections=await buildSatellite(bbox,tmpDir,proj4,epsg,reprojTif,satZoom,satSourceUrl,satSourceSubdomains,satMPP);
        for (const sec of satSections) {
          if (sec.tif && fs.existsSync(sec.tif)) satFiles.push(sec.tif);
          if (sec.tfw && fs.existsSync(sec.tfw)) satFiles.push(sec.tfw);
          if (sec.prj && fs.existsSync(sec.prj)) satFiles.push(sec.prj);
        }
        log.push(`Satellite: ${satSections.length} частей, ${satFiles.length} файлов`);
      }catch(e){
        log.push('Satellite WARN: '+e.message.slice(0,80));
        console.warn('[DEM] Satellite fail:',e.message);
      }
    }

    // 9. ZIP
    onProgress&&onProgress(94,'Упаковка архива...');
    const prjFile =path.join(tmpDir,'result.prj');
    const infoFile=path.join(tmpDir,'readme.txt');
    if (proj4||epsg) fs.writeFileSync(prjFile,proj4||`EPSG:${epsg}`);
    // Вычисляем scale factor для AutoCAD IMAGEATTACH
    // AutoCAD при вставке: ширина изображения = imgWidth_px * scaleFactor единиц чертежа
    // Нужный scale: scaleFactor = pixelSize_metres (т.к. INSUNITS=6, единицы чертежа = метры)
    // При вставке: Insert point = точка привязки левого верхнего угла из JGW
    //              Scale = pixelSizeM (это и есть правильный масштаб)
    const satScaleInfo = satSections.length ? _satReadme(satSections) : '';

    fs.writeFileSync(infoFile,
      `ArcticDEM Export\r\n` +
      `================\r\n` +
      `Дата: ${new Date().toLocaleString('ru')}\r\n` +
      `СК: ${projName||projId} ${proj4||''}\r\n` +
      `Высоты: ${geoid ? 'БСВ-77 (поправка геоида EGM применена)' : useGeoid ? '⚠ ЭЛЛИПСОИДАЛЬНЫЕ WGS-84 — перевод в БСВ-77 не удался (нет файлов геоида на сервере)' : 'эллипсоидальные WGS-84'}\r\n` +
      `Горизонтали: шаг ${interval}м${interval!==reqInterval?` (запрошено ${reqInterval} м — на этом шаге горизонталей нет, участок плоский)`:''}, источник ArcticDEM ${usedRes}\r\n` +
      `Точки: ${gridStep>0?`сетка ${gridStep}x${gridStep}м`:'без точек (отключены)'}\r\n` +
      `\r\nСлои DXF (R12):\r\n` +
      `  GORIZONTALI  — синий (5), 3D LINE, Z=высота\r\n` +
      `  PODPISI      — жёлтый (2), TEXT, каждая 2-я горизонталь\r\n` +
      `  TOCHKI_VYSOT — зелёный (3), POINT+TEXT, сетка ${gridStep}м\r\n` +
      satScaleInfo
    );

    const zipFile=path.join(tmpDir,'arcticdem_export.zip');
    const filesToZip=[outDxf,prjFile,infoFile,...satFiles].filter(f=>fs.existsSync(f));
    await new Promise((resolve,reject)=>{
      if (IS_WINDOWS) {
        const toZip=filesToZip.map(f=>`'${f}'`).join(',');
        exec(
          `powershell -Command "Compress-Archive -Path ${toZip} -DestinationPath '${zipFile}' -Force"`,
          (err,_,se)=>err?reject(new Error(se||err.message)):resolve()
        );
      } else {
        const args=['-j',zipFile,...filesToZip];
        execFile('zip',args,(err,_,se)=>err?reject(new Error(se||err.message)):resolve());
      }
    });

    return {file:zipFile,tmpDir,log,mime:'application/zip',interval,requestedInterval:reqInterval,geoid};

  } catch(err) {
    try{fs.rmSync(tmpDir,{recursive:true});}catch(e){}
    err.gdal_log=log;
    throw err;
  }
}

// ═══ Зоны затопления (flood_zones.py) ═══════════════════════════════════
// Рельеф (ArcticDEM → БСВ-77) по области держим 30 минут: при смене отметки
// пересчёт идёт без повторной загрузки — только Python по готовому растру.
const _floodDemCache = new Map();   // key bbox → { tmpDir, demTif, usedRes, t }
const FLOOD_CACHE_MS = 30 * 60 * 1000;
process.on('exit', () => { for (const v of _floodDemCache.values()) cleanupTmp(v.tmpDir); });
function _floodCacheSweep() {
  const now = Date.now();
  for (const [k, v] of _floodDemCache) if (now - v.t > FLOOD_CACHE_MS) { cleanupTmp(v.tmpDir); _floodDemCache.delete(k); }
}
// Рельеф области в БСВ-77 (WGS-84 GeoTIFF) из кэша на 30 минут: затопление, анализ рельефа
async function demCached(bbox, onProgress) {
  findGDALBin();
  _floodCacheSweep();
  const key = ['minLng', 'minLat', 'maxLng', 'maxLat'].map(k => Number(bbox[k]).toFixed(5)).join('_');
  let c = _floodDemCache.get(key);
  const log = [];
  if (!c || !fs.existsSync(c.demTif)) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flood_'));
    try {
      const r = await _fetchDemWgs({ bbox, tmpDir, log, onProgress, cacheOnly: false, useGeoid: true });
      c = { tmpDir, demTif: r.demTif, usedRes: r.usedRes, geoid: !!r.geoid };
      _floodDemCache.set(key, c);
    } catch (e) { cleanupTmp(tmpDir); e.gdal_log = log; throw e; }
  }
  c.t = Date.now();
  return c;
}
async function floodZones({ bbox, clip, level, minArea, waterAsFlood, connectedOnly, axis, levels, onProgress }) {
  const c = await demCached(bbox, onProgress);
  onProgress && onProgress(70, 'Расчёт зон затопления...');
  const runDir = fs.mkdtempSync(path.join(c.tmpDir, 'run_'));
  try {
    const paramsFile = path.join(runDir, 'params.json'), outFile = path.join(runDir, 'zones.geojson');
    fs.writeFileSync(paramsFile, JSON.stringify({
      dem_tif: c.demTif, bbox, clip: clip && clip.type === 'Polygon' ? clip : null,
      level, min_area: minArea, water_as_flood: waterAsFlood, connected_only: connectedOnly, out_geojson: outFile,
      axis: Array.isArray(axis) && axis.length >= 2 ? axis : null, levels: Array.isArray(levels) && levels.length === 2 ? levels.map(Number) : null,
    }));
    try {
      await execFileP(_pythonExe, [path.join(__dirname, 'flood_zones.py'), paramsFile],
        { env: gdalEnv(), timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      const msg = String(e.stderr || e.message || '').split(/\r?\n/).filter(l => l && !/Warning|warnings\.warn/.test(l)).pop() || 'ошибка Python';
      throw new Error('Расчёт затопления: ' + msg.replace(/^ERROR:\s*/, '').slice(0, 300));
    }
    const gj = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    gj.stats = Object.assign(gj.stats || {}, { source: c.usedRes, geoid: !!c.geoid });
    onProgress && onProgress(100, 'Готово');
    return gj;
  } finally { cleanupTmp(runDir); }
}

function cleanupTmp(tmpDir){
  try{fs.rmSync(tmpDir,{recursive:true,force:true});}catch(e){}
}

// ── Авто-загрузка геоид-гридов ─────────────────────────────
const GEOID_GRIDS = [
  { file: 'us_nga_egm08_25.tif', url: 'https://cdn.proj.org/us_nga_egm08_25.tif', desc: 'EGM2008 (~56MB)' },
  { file: 'us_nga_egm96_15.tif', url: 'https://cdn.proj.org/us_nga_egm96_15.tif', desc: 'EGM96 (~26MB)' },
];

let _geoidGridsChecked = false;

async function _ensureGeoidGrids() {
  if (!_projLib || _geoidGridsChecked) return;
  _geoidGridsChecked = true;
  for (const { file, url, desc } of GEOID_GRIDS) {
    const target = path.join(_projLib, file);
    if (fs.existsSync(target)) { console.log(`[GEOID] Найден: ${file}`); continue; }
    console.log(`[GEOID] Скачиваю ${file} ${desc}...`);
    try {
      await new Promise((resolve, reject) => {
        const tmpTarget = target + '.tmp';
        const out = fs.createWriteStream(tmpTarget);
        const get = (u, hops) => {
          const mod = u.startsWith('https') ? https : require('http');
          const req = mod.get(u, { timeout: 120000 }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              res.resume();
              if (hops <= 0) return reject(new Error('Too many redirects'));
              return get(res.headers.location, hops - 1);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            res.pipe(out);
            out.on('finish', () => { fs.renameSync(tmpTarget, target); resolve(); });
            out.on('error', reject);
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        };
        get(url, 5);
      });
      console.log(`[GEOID] OK: ${file}`);
    } catch(e) {
      console.log(`[GEOID] Недоступно (${file}): ${e.message.slice(0, 80)}`);
      try { fs.unlinkSync(target + '.tmp'); } catch(_) {}
    }
  }
}

// Анализ рельефа (terrain_analysis.py): уклоны, экспозиция, линии стока, водосбор, сравнение со съёмкой
async function terrainAnalysis(params, onProgress) {
  const c = await demCached(params.bbox, onProgress);
  onProgress && onProgress(70, 'Анализ рельефа...');
  const r = await runPyJson('terrain_analysis.py', { ...params, dem_tif: c.demTif, cache_dir: c.tmpDir }, 600000);
  r.stats = Object.assign(r.stats || {}, { geoid: !!c.geoid, source: c.usedRes });
  onProgress && onProgress(100, 'Готово');
  return r;
}

// Запуск Python-скрипта из папки программы: params → (скрипт пишет JSON в params.out) → объект
async function runPyJson(script, params, timeoutMs = 600000) {
  findGDALBin();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgkpy_'));
  try {
    const pf = path.join(dir, 'params.json'), out = path.join(dir, 'out.json');
    fs.writeFileSync(pf, JSON.stringify({ ...params, out }));
    try {
      await execFileP(_pythonExe, [path.join(__dirname, script), pf], { env: gdalEnv(), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      const msg = String(e.stderr || e.message || '').split(/\r?\n/).filter(l => l && !/Warning|warnings\.warn/.test(l)).pop() || 'ошибка Python';
      throw new Error(msg.replace(/^ERROR:\s*/, '').slice(0, 400));
    }
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } finally { cleanupTmp(dir); }
}

// Проверка «на деле»: считается ли поправка геоида (БСВ-77) в контрольной точке (ХМАО)
async function geoidTest(lat = 61.25, lng = 73.4) {
  let n = null, err = null;
  try { n = await computeGeoidN(lat, lng); } catch (e) { err = e.message; }
  const ok = n != null && Math.abs(n) > 0.5 && Math.abs(n) < 120;
  return { ok, n, lat, lng, python: _pythonExe, projLib: _projLib, error: err,
    hint: ok ? null : `Нет файлов геоида для PROJ. Положите us_nga_egm08_25.tif (EGM2008, ~56 МБ) или us_nga_egm96_15.tif (EGM96) с cdn.proj.org в папку ${_projLib || 'share/proj (OSGeo4W: C:\\OSGeo4W\\share\\proj)'} и перезапустите сервер. Без них высоты остаются эллипсоидальными (WGS-84), а не в БСВ-77.` };
}

async function checkGDAL(){
  try{
    const bin=findGDALBin();
    const {stdout}=await execFileP(gdal('gdalinfo'),['--version'],{env:gdalEnv()});
    const grids = GEOID_GRIDS.map(g => ({
      file: g.file,
      present: _projLib ? fs.existsSync(path.join(_projLib, g.file)) : false,
    }));
    return {available:true,version:stdout.trim(),path:bin,
            gdal_data:_gdalData,python:_pythonExe,proj_lib:_projLib,
            has_proj_db:_projLib?fs.existsSync(path.join(_projLib,'proj.db')):null,
            geoid_grids: grids};
  }catch(e){
    return {available:false,reason:e.message,
            hint:IS_WINDOWS?'Установите OSGeo4W: https://trac.osgeo.org/osgeo4w/':'Установите: sudo apt install gdal-bin'};
  }
}

// Конвертация векторного файла (MIF/GeoJSON) в нативный MapInfo TAB через ogr2ogr.
// Возвращает массив путей созданных файлов (.tab/.map/.id/.dat). Бросает понятную
// ошибку, если GDAL не установлен.
async function convertToTab(srcPath, outTabPath) {
  findGDALBin(); // бросит, если GDAL нет
  // -f "MapInfo File" пишет нативный TAB; кодировку берём из MIF (WindowsCyrillic)
  await execFileP(gdal('ogr2ogr'),
    ['-f', 'MapInfo File', outTabPath, srcPath],
    { env: gdalEnv(), timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const dir = path.dirname(outTabPath);
  const base = path.basename(outTabPath, path.extname(outTabPath));
  const out = [];
  for (const ext of ['.tab', '.map', '.id', '.dat', '.ind']) {
    const p = path.join(dir, base + ext);
    if (fs.existsSync(p)) out.push(p);
  }
  if (!out.length) throw new Error('ogr2ogr не создал TAB-файлы');
  return out;
}

// Конвертация векторного файла (TAB/MIF/SHP…) в GeoJSON (WGS-84) через ogr2ogr.
// Репроецирует из встроенной СК файла в EPSG:4326. Бросает ошибку без GDAL.
// Кол-во объектов и признак «координаты уже географические» в готовом GeoJSON.
function _gjFeatureCount(p) {
  try { const gj = JSON.parse(fs.readFileSync(p, 'utf8')); return (gj.features || []).length; }
  catch (e) { return 0; }
}
function _gjLooksGeographic(p) {
  try {
    const gj = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const f of (gj.features || [])) {
      let c = f && f.geometry && f.geometry.coordinates;
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];   // до первой пары [lng,lat]
      if (Array.isArray(c) && isFinite(c[0]) && isFinite(c[1])) {
        return Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
      }
    }
  } catch (e) {}
  return false;
}
async function _ogrSrcSrs(srcPath) {
  try {
    const { stdout } = await execFileP(gdal('ogrinfo'), ['-so', '-al', srcPath],
      { env: gdalEnv(), timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
    const out = String(stdout || '');
    // 1) Имя проекционной/географической СК (в т.ч. локальной NonEarth)
    const m = out.match(/(PROJCS|GEOGCS|PROJCRS|GEOGCRS|BOUNDCRS|LOCAL_CS|ENGCRS|ENGINEERINGCRS)\s*\[?\s*"([^"]+)"/);
    if (m) return m[2].trim();
    // 2) Явный признак отсутствия привязки (NonEarth / Unknown)
    if (/Layer SRS WKT:\s*\n\s*\(unknown\)/i.test(out) || /NonEarth/i.test(out)) return 'NonEarth (локальная, без географической привязки)';
    // 3) Строка PROJECTION[...]
    const p = out.match(/PROJECTION\s*\[\s*"([^"]+)"/);
    if (p) return p[1].trim();
    return '';
  } catch (e) { return ''; }
}
// Компактная выжимка того, что ogrinfo знает про СК — для диагностики в сообщении.
async function _ogrSrsDump(srcPath) {
  try {
    const { stdout } = await execFileP(gdal('ogrinfo'), ['-so', '-al', srcPath],
      { env: gdalEnv(), timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
    const out = String(stdout || '');
    const i = out.search(/Layer SRS WKT:/i);
    let block = i >= 0 ? out.slice(i).split(/\nGeometry|\nFeature Count|\nExtent/i)[0] : '';
    block = block.replace(/\s+/g, ' ').trim();
    return block.slice(0, 400);
  } catch (e) { return ''; }
}

async function convertToGeoJSON(srcPath, outPath) {
  findGDALBin();
  const env = gdalEnv();
  const run = (args) => execFileP(gdal('ogr2ogr'), args,
    { env, timeout: 120000, maxBuffer: 256 * 1024 * 1024 });

  // 1) С репроекцией в WGS-84 (штатный путь)
  let stderr1 = '';
  try { const r = await run(['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '-skipfailures', outPath, srcPath]); stderr1 = r.stderr || ''; }
  catch (e) { stderr1 = (e.stderr || e.message || ''); }
  if (fs.existsSync(outPath) && _gjFeatureCount(outPath) > 0) return outPath;

  // 2) Репроекция дала 0 объектов — частая причина: исходную СК не удалось
  //    пересчитать в WGS-84, и -skipfailures молча выкинул все объекты.
  //    Пробуем без -t_srs (в исходной СК).
  try { fs.rmSync(outPath, { force: true }); } catch (e) {}
  let stderr2 = '';
  try { const r = await run(['-f', 'GeoJSON', '-skipfailures', outPath, srcPath]); stderr2 = r.stderr || ''; }
  catch (e) { stderr2 = (e.stderr || e.message || ''); }

  if (fs.existsSync(outPath) && _gjFeatureCount(outPath) > 0) {
    // Если координаты уже географические (широта/долгота) — берём как есть.
    if (_gjLooksGeographic(outPath)) return outPath;
    // Иначе набор в проекционной СК, которую GDAL не смог перевести в WGS-84.
    const srs = await _ogrSrcSrs(srcPath);
    const dump = await _ogrSrsDump(srcPath);
    const err = new Error('SRS_MISMATCH');
    err.userMessage = 'Набор в проекционной системе координат, которую не удалось пересчитать в WGS-84'
      + (srs ? ` (исходная СК: ${srs})` : '')
      + '. Экспортируйте из MapInfo в широту/долготу (WGS-84 / Lat-Long) — или пришлите файл, добавлю поддержку этой СК.'
      + (dump ? ` [СК по данным GDAL: ${dump}]` : '');
    throw err;
  }

  // 3) Совсем пусто — вернём диагностику ogr2ogr.
  const diag = String(stderr1 || stderr2 || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const err = new Error('EMPTY');
  err.userMessage = 'GDAL не вернул ни одного объекта из TAB.' + (diag ? ` Сообщение GDAL: ${diag}` : '');
  throw err;
}

// Конвертация БЕЗ репроекции — координаты остаются в исходной СК (для NonEarth:
// локальные метры). Дальше их пересчитывает вызывающий код по выбранной пользователем СК.
async function convertToGeoJSONRaw(srcPath, outPath) {
  findGDALBin();
  await execFileP(gdal('ogr2ogr'), ['-f', 'GeoJSON', '-skipfailures', outPath, srcPath],
    { env: gdalEnv(), timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
  if (!fs.existsSync(outPath)) throw new Error('ogr2ogr не создал GeoJSON');
  return outPath;
}

module.exports = {
  processDEM, floodZones, terrainAnalysis, geoidTest, runPyJson, cleanupTmp, checkGDAL, convertToTab, convertToGeoJSON, convertToGeoJSONRaw,
  getElevationAtPoint, getElevationProfile, getDemTilesInfo, computeGeoidN,
  getDemTilesDir, setDemTilesDir,
  _downloadGeoidGrids: _ensureGeoidGrids,
  _resetGeoidCheck: () => { _geoidGridsChecked = false; },
};
