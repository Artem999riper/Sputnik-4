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
const proj4   = require('proj4');
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
// Используем региональный эндпоинт us-west-2 — именно там лежит bucket pgc-opendata-dems.
function _normS3Url(u) {
  if (!u) return null;
  if (u.startsWith('s3://')) {
    // s3://bucket/path → https://bucket.s3.us-west-2.amazonaws.com/path
    const rest = u.slice(5);
    const slash = rest.indexOf('/');
    if (slash < 0) return null;
    const bucket = rest.slice(0, slash), key = rest.slice(slash + 1);
    return '/vsicurl/https://' + bucket + '.s3.us-west-2.amazonaws.com/' + key;
  }
  // Заменяем любой регион на us-west-2
  u = u.replace(/\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//, '.s3.us-west-2.amazonaws.com/');
  return u.startsWith('/vsicurl/') ? u : '/vsicurl/' + u;
}

function _buildDirectDemUrls(bbox, res) {
  const BASE = 'https://pgc-opendata-dems.s3.us-west-2.amazonaws.com/arcticdem/mosaics/v4.1';
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

// Генерирует S3 URLs для ArcticDEM v4.1 2m тайлов (50km×50km в EPSG:3413).
// Константы сетки калиброваны по тайлу 55_61_1_2 (bbox [2049900,1399900,2100100,1450100]):
//   x_origin = -3350000 m, y_origin = -4650000 m, ячейка = 100km, подтайл = 50km
proj4.defs('EPSG:3413', '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +datum=WGS84 +units=m +no_defs');

function _build2mTileUrls(bbox) {
  const BASE = 'https://pgc-opendata-dems.s3.us-west-2.amazonaws.com/arcticdem/mosaics/v4.1/2m';
  const X_ORIGIN = -3350000, Y_ORIGIN = -4650000, CELL = 100000, SUBCELL = 50000;

  // Проецируем четыре угла bbox в EPSG:3413
  const corners = [
    [bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.minLat],
    [bbox.minLng, bbox.maxLat], [bbox.maxLng, bbox.maxLat],
  ].map(([lng, lat]) => proj4('EPSG:4326', 'EPSG:3413', [lng, lat]));

  const px = corners.map(c => c[0]), py = corners.map(c => c[1]);
  const xMin = Math.min(...px), xMax = Math.max(...px);
  const yMin = Math.min(...py), yMax = Math.max(...py);

  const colMin = Math.max(1, Math.floor((xMin - X_ORIGIN) / CELL) + 1);
  const colMax = Math.floor((xMax - X_ORIGIN) / CELL) + 1;
  const rowMin = Math.max(1, Math.floor((yMin - Y_ORIGIN) / CELL) + 1);
  const rowMax = Math.floor((yMax - Y_ORIGIN) / CELL) + 1;

  const urls = [];
  for (let col = colMin; col <= colMax; col++) {
    for (let row = rowMin; row <= rowMax; row++) {
      const cell = `${col}_${row}`;
      for (let sc = 1; sc <= 2; sc++) {
        for (let sr = 1; sr <= 2; sr++) {
          // EPSG:3413 bounds этого подтайла
          const sx0 = X_ORIGIN + (col - 1) * CELL + (sc - 1) * SUBCELL;
          const sx1 = sx0 + SUBCELL;
          const sy0 = Y_ORIGIN + (row - 1) * CELL + (sr - 1) * SUBCELL;
          const sy1 = sy0 + SUBCELL;
          // Добавляем только если подтайл перекрывается с bbox
          if (sx0 < xMax && sx1 > xMin && sy0 < yMax && sy1 > yMin) {
            urls.push(`${BASE}/${cell}/${cell}_${sc}_${sr}_2m_v4.1_dem.tif`);
          }
        }
      }
    }
  }
  console.log(`[DEM] 2m тайлов для bbox: ${urls.length}`);
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
  }).then(r => {
    const se = r.stderr || '';
    if (se.trim() && !se.includes('FutureWarning') && !se.includes('DeprecationWarning'))
      console.log(`[DEM stderr ${exe}]`, se.slice(0, 400));
    return r;
  });
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

function fetchTile(z,x,y) {
  return new Promise((resolve,reject)=>{
    const url=`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    const req=https.get(url,{
      headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.arcgis.com/'},timeout:20000,
    },res=>{
      const c=[];
      res.on('data',d=>c.push(d));
      res.on('end',()=>res.statusCode===200?resolve(Buffer.concat(c)):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on('error',reject);
    req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});
  });
}

// Скачивает через HTTP CONNECT proxy — без внешних зависимостей (только net + tls)
function _downloadViaProxy(url, localPath, proxyStr) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const tls = require('tls');
    let proxy;
    try { proxy = new URL(proxyStr); } catch(e) { return reject(new Error('Invalid HTTPS_PROXY: ' + proxyStr)); }
    const target = new URL(url);
    const pPort = parseInt(proxy.port) || 8080;

    const conn = net.createConnection({ host: proxy.hostname, port: pPort });
    conn.setTimeout(30000);
    conn.on('timeout', () => { conn.destroy(); reject(new Error('Proxy connection timeout')); });
    conn.on('error', reject);
    conn.on('connect', () => {
      const auth = proxy.username
        ? 'Proxy-Authorization: Basic ' + Buffer.from(proxy.username + ':' + decodeURIComponent(proxy.password || '')).toString('base64') + '\r\n'
        : '';
      conn.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n${auth}\r\n`);
    });

    let headerBuf = '';
    const onHeader = (chunk) => {
      headerBuf += chunk.toString('binary');
      const end = headerBuf.indexOf('\r\n\r\n');
      if (end < 0) return;
      conn.removeListener('data', onHeader);
      if (!headerBuf.includes(' 200 ')) {
        conn.destroy();
        return reject(new Error('Proxy CONNECT rejected: ' + headerBuf.split('\r\n')[0]));
      }
      const tlsSock = tls.connect({ socket: conn, servername: target.hostname, rejectUnauthorized: false });
      tlsSock.on('error', reject);
      tlsSock.on('secureConnect', () => {
        tlsSock.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.hostname}\r\nConnection: close\r\n\r\n`);
        let respBuf = Buffer.alloc(0);
        let hdrDone = false;
        let statusCode = 0;
        let out = null;
        tlsSock.on('data', (d) => {
          if (hdrDone) { if (out) out.write(d); return; }
          respBuf = Buffer.concat([respBuf, d]);
          const hEnd = respBuf.indexOf('\r\n\r\n');
          if (hEnd < 0) return;
          const hStr = respBuf.slice(0, hEnd).toString();
          const m = hStr.match(/HTTP\/\S+\s+(\d+)/);
          statusCode = m ? parseInt(m[1]) : 0;
          if (statusCode === 301 || statusCode === 302) {
            const loc = (hStr.match(/[Ll]ocation:\s*(\S+)/) || [])[1];
            tlsSock.destroy(); conn.destroy();
            return loc ? _downloadDemTile(loc, localPath).then(resolve).catch(reject)
                       : reject(new Error('Redirect without Location via proxy'));
          }
          if (statusCode !== 200) {
            tlsSock.destroy(); conn.destroy();
            return reject(new Error('HTTP ' + statusCode + ' via proxy for ' + url));
          }
          hdrDone = true;
          out = fs.createWriteStream(localPath);
          out.on('error', reject);
          const body = respBuf.slice(hEnd + 4);
          if (body.length) out.write(body);
        });
        tlsSock.on('end', () => { if (out) out.end(resolve); else if (hdrDone) resolve(); });
      });
    };
    conn.on('data', onHeader);
  });
}

// Быстрая проверка: может ли GDAL открыть URL через vsicurl (≤10 сек).
// Возвращает true если S3 доступен напрямую (COG range-запросы — быстро).
async function _canVsiCurl(vsicurlUrl) {
  try {
    findGDALBin();
    const env = { ...gdalEnv(), GDAL_HTTP_CONNECTTIMEOUT: '8', GDAL_HTTP_TIMEOUT: '10' };
    await execFileP(gdal('gdalinfo'), [vsicurlUrl], { env, timeout: 15000, maxBuffer: 2*1024*1024 });
    return true;
  } catch(e) { return false; }
}

// Скачивает DEM тайл через Node.js (следует редиректам), обходя GDAL vsicurl.
// Если установлен HTTPS_PROXY — маршрутизирует через HTTP CONNECT tunnel.
function _downloadDemTile(url, localPath, maxRedirects) {
  if (maxRedirects === undefined) maxRedirects = 8;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxyUrl && url.startsWith('https://')) {
    console.log('[DEM] Прокси:', proxyUrl.replace(/\/\/([^:@/]+:[^@/]+)@/, '//*:*@'));
    return _downloadViaProxy(url, localPath, proxyUrl);
  }
  return new Promise(function(resolve, reject) {
    function doGet(u, hops) {
      const mod = u.startsWith('https') ? https : require('http');
      const req = mod.get(u, { timeout: 120000 }, function(res) {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          if (hops <= 0) { reject(new Error('Too many redirects: ' + u)); return; }
          // S3 должен вернуть Location; если нет — убираем регион из URL (типичный S3-редирект)
          let loc = res.headers.location;
          if (!loc) {
            const region = res.headers['x-amz-bucket-region'] || 'us-west-2';
            loc = u.replace(/\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//, `.s3.${region}.amazonaws.com/`);
            console.log(`[FLOOD] 301 без Location, регион из заголовка: ${region}, URL: ${loc}`);
          } else {
            console.log('[FLOOD] 301 → ', loc);
          }
          doGet(loc, hops - 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode + ' for ' + u));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        const fname = path.basename(localPath);
        let received = 0, lastPct = -1;
        const out = fs.createWriteStream(localPath);
        res.on('data', chunk => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor(received / total * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              lastPct = pct;
              const mb = (received / 1048576).toFixed(1);
              const tot = (total / 1048576).toFixed(1);
              process.stdout.write(`\r[DEM] ${fname}: ${pct}% (${mb}/${tot} МБ)`);
            }
          }
        });
        res.pipe(out);
        out.on('finish', () => {
          if (total > 0) process.stdout.write(`\r[DEM] ${fname}: 100% (${(total/1048576).toFixed(1)} МБ) ✓\n`);
          resolve();
        });
        out.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', function() { req.destroy(); reject(new Error('timeout: ' + u)); });
    }
    doGet(url, maxRedirects);
  });
}

// Возвращает список .tif файлов из локальной папки dem_tiles/
const DEM_TILES_DIR = path.join(__dirname, 'dem_tiles');

function _findLocalTiles() {
  if (!fs.existsSync(DEM_TILES_DIR)) return [];
  try {
    return fs.readdirSync(DEM_TILES_DIR)
      .filter(f => /\.(tif|tiff)$/i.test(f))
      .map(f => path.join(DEM_TILES_DIR, f));
  } catch(e) { return []; }
}

// Скачивает тайл с кэшированием в dem_tiles/.
// Если файл уже есть в кэше — возвращает его путь без скачивания.
// После успешного скачивания сохраняет копию в dem_tiles/ для следующего раза.
async function _downloadWithCache(url, tmpDir) {
  const fname = path.basename(url);
  const cached = path.join(DEM_TILES_DIR, fname);
  if (fs.existsSync(cached)) {
    console.log(`[DEM] Кэш: ${fname}`);
    return cached;
  }
  const tmp = path.join(tmpDir, fname);
  await _downloadDemTile(url, tmp);
  // Сохраняем в кэш
  try {
    fs.mkdirSync(DEM_TILES_DIR, { recursive: true });
    fs.copyFileSync(tmp, cached);
    console.log(`[DEM] Сохранено в кэш: ${fname}`);
  } catch(e) {
    console.log(`[DEM] Не удалось сохранить в кэш: ${e.message}`);
  }
  return tmp;
}

async function buildSatellite(bbox, tmpDir, proj4, epsg, reprojTif) {
  const {minLat,maxLat,minLng,maxLng} = bbox;

  // Вычисляем размер области в км для решения о зуме
  const latKm  = (maxLat-minLat)*111.32;
  const lonKm  = (maxLng-minLng)*111.32*Math.cos((minLat+maxLat)/2*Math.PI/180);
  console.log(`[SAT] Area: ${latKm.toFixed(1)}x${lonKm.toFixed(1)} km`);

  // Целевая СК
  const targetSrs = proj4 ? proj4 : `EPSG:${epsg||4326}`;

  // Шаг 1: скачиваем тайлы для всего bbox сразу (не секциями — один проход)
  // Выбираем zoom так чтобы итоговый растр не превышал 6000×6000 px
  let zoom = 14;
  for (let z = 17; z >= 8; z--) {
    const tx = Math.abs(lon2tile(maxLng,z) - lon2tile(minLng,z)) + 1;
    const ty = Math.abs(lat2tile(minLat,z) - lat2tile(maxLat,z)) + 1;
    if (tx*256 <= 6000 && ty*256 <= 6000) { zoom = z; break; }
  }

  const xMin = lon2tile(minLng,zoom), xMax = lon2tile(maxLng,zoom);
  const yMin = lat2tile(maxLat,zoom), yMax = lat2tile(minLat,zoom);
  console.log(`[SAT] zoom=${zoom} tiles=${xMax-xMin+1}x${yMax-yMin+1}`);

  const tileDir = path.join(tmpDir,'sat_tiles');
  fs.mkdirSync(tileDir, {recursive:true});
  const tileFiles = [];
  for (let ty2 = yMin; ty2 <= yMax; ty2++) {
    for (let tx2 = xMin; tx2 <= xMax; tx2++) {
      const out = path.join(tileDir, `t_${ty2}_${tx2}.jpg`);
      for (let a = 0; a < 3; a++) {
        try { fs.writeFileSync(out, await fetchTile(zoom,tx2,ty2)); break; }
        catch(e) { if (a===2) console.warn(`[SAT] tile ${tx2}/${ty2} fail:`,e.message); }
      }
      if (fs.existsSync(out)) tileFiles.push({file:out, tx:tx2, ty:ty2});
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
    for (const {file,tx:tx2,ty:ty2} of tileFiles) {
      const xOff=(tx2-xMin)*256, yOff=(ty2-yMin)*256;
      vrtLines.push(
        `    <SimpleSource><SourceFilename relativeToVRT="0">${file}</SourceFilename>`,
        `      <SourceBand>${band}</SourceBand>`,
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
  const satJpeg = path.join(tmpDir,'satellite.jpg');
  const satJgw  = path.join(tmpDir,'satellite.jgw');
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

  await runGDAL('gdalwarp', [
    '-s_srs','EPSG:3857',   // источник — Web Mercator (родная проекция тайлов)
    '-t_srs', targetSrs,
    ...teArgs,
    '-r','lanczos',
    '-co','COMPRESS=LZW','-co','TILED=YES',
    vrtFile, satTif,
  ]);

  // Шаг 4: конвертируем в JPEG
  await runGDAL('gdal_translate', ['-of','JPEG','-co','QUALITY=90', satTif, satJpeg]);

  // Шаг 5: JGW + PRJ по точному GeoTransform репроецированного TIF
  const result = {jpeg:satJpeg, idx:'0_0', pixelSizeM:null, imgWidthPx:null};
  try {
    const {stdout} = await execFileP(gdal('gdalinfo'), ['-json', satTif],
      {env:gdalEnv(), timeout:30000, maxBuffer:10*1024*1024});
    const info = JSON.parse(stdout);
    const gt = info.geoTransform;
    if (gt) {
      // Размер пикселя в метрах (для метрических СК = gt[1])
      const pixW = Math.abs(gt[1]);
      const pixH = Math.abs(gt[5]);
      result.pixelSizeM = pixW;
      result.imgWidthPx  = info.size ? info.size[0] : null;
      result.imgHeightPx = info.size ? info.size[1] : null;
      result.gt = gt;

      const jgwContent = [
        gt[1].toFixed(6),
        gt[4].toFixed(6),
        gt[2].toFixed(6),
        gt[5].toFixed(6),
        (gt[0] + gt[1]*0.5 + gt[2]*0.5).toFixed(3),
        (gt[3] + gt[4]*0.5 + gt[5]*0.5).toFixed(3),
      ].join('\r\n');
      fs.writeFileSync(satJgw, jgwContent);
      result.jgw = satJgw;
      console.log(`[SAT] pixel size: ${pixW.toFixed(4)} x ${pixH.toFixed(4)} m, image: ${result.imgWidthPx}x${result.imgHeightPx}px`);
    }
    // PRJ — WKT для AutoCAD
    try {
      const {stdout:wktOut} = await execFileP(gdal('gdalsrsinfo'), ['-o','wkt', satTif],
        {env:gdalEnv(), timeout:15000, maxBuffer:1*1024*1024});
      if (wktOut && wktOut.trim()) { fs.writeFileSync(satPrj, wktOut.trim()); result.prj = satPrj; }
    } catch(e2) {
      if (info.coordinateSystem?.wkt) { fs.writeFileSync(satPrj, info.coordinateSystem.wkt); result.prj = satPrj; }
    }
  } catch(e) { console.warn('[SAT] jgw fail:',e.message); }

  console.log(`[SAT] Done: satellite.jpg + jgw + prj`);
  return [result];
}


// ── Главная функция ────────────────────────────────────────
async function processDEM({bbox,projId,proj4,epsg,projName,format,
                            interval,useGeoid,gridStep,jitterMin,jitterMax,exportSatellite,onProgress}) {
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
    if (areaKm2>2000) throw new Error(`Слишком большая область: ${areaKm2.toFixed(0)} км². Макс 2000.`);
    log.push(`Area: ${areaKm2.toFixed(1)} km²`);

    // 1. Поиск тайлов ArcticDEM: STAC → прямые S3-URLs как fallback
    onProgress&&onProgress(8,'Поиск тайлов ArcticDEM...');
    let tifUrls=[],usedRes='2m';
    let stacOk=false;
    try {
      const r2=await stacSearch(bbox,'arcticdem-mosaics-v4.1-2m');
      if ((r2.features||[]).length){
        usedRes='2m'; stacOk=true;
        tifUrls=r2.features.map(item=>{
          const a=item.assets||{};
          const k=Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
          return a[k]?.href;
        }).filter(Boolean).map(_normS3Url).filter(Boolean);
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
          }).filter(Boolean).map(_normS3Url).filter(Boolean);
        }
      } catch(e){ log.push('STAC 10m: '+e.message.slice(0,60)); }
    }
    // Fallback: STAC недоступен
    if (!tifUrls.length){
      // Сначала — локальные тайлы из dem_tiles/
      const localFiles = _findLocalTiles();
      if (localFiles.length) {
        log.push(`Локальные тайлы: ${localFiles.length}`);
        onProgress&&onProgress(15, `Используем ${localFiles.length} локальных тайлов...`);
        tifUrls = localFiles;
        usedRes = 'local';
      } else {
        log.push('STAC недоступен — пробуем vsicurl COG, затем полное скачивание');
        const urls2m = _build2mTileUrls(bbox);
        const vsUrls2m = urls2m.map(u => '/vsicurl/' + u);

        // Быстрый путь: vsicurl COG (GDAL читает только нужный bbox)
        if (vsUrls2m.length) {
          onProgress&&onProgress(8,'Проверка прямого доступа к ArcticDEM COG...');
          const vsOk = await _canVsiCurl(vsUrls2m[0]);
          if (vsOk) {
            tifUrls = vsUrls2m; usedRes = '2m';
            log.push('vsicurl 2m COG OK');
            onProgress&&onProgress(15,'ArcticDEM 2m COG: прямой доступ ✓');
          } else {
            log.push('vsicurl недоступен — полное скачивание');
          }
        }

        // Медленный путь: полное скачивание файлов
        if (!tifUrls.length) {
        onProgress&&onProgress(8,'Скачивание тайлов ArcticDEM 2m...');
        const downloaded=[];
        for (let i=0;i<urls2m.length;i++){
          const url=urls2m[i];
          const lp=path.join(tmpDir,path.basename(url));
          try{ const p = await _downloadWithCache(url,tmpDir); downloaded.push(p); log.push(path.basename(url)+' OK'); }
          catch(e){ log.push(path.basename(url)+' fail: '+e.message.slice(0,40)); }
        }
        if (downloaded.length){
          tifUrls=downloaded; usedRes='2m';
        } else {
          // fallback 10m
          log.push('2m недоступны — пробуем 10m');
          onProgress&&onProgress(8,'Скачивание тайлов ArcticDEM 10m...');
          const BASE='https://pgc-opendata-dems.s3.us-west-2.amazonaws.com/arcticdem/mosaics/v4.1';
          for (let lat=Math.floor(minLat);lat<=Math.floor(maxLat);lat++){
            for (let lng=Math.floor(minLng);lng<=Math.floor(maxLng);lng++){
              const latS=lat>=0?`n${String(lat).padStart(2,'0')}`:`s${String(-lat).padStart(2,'0')}`;
              const lngS=lng>=0?`e${String(lng).padStart(3,'0')}`:`w${String(-lng).padStart(3,'0')}`;
              const id=`${latS}${lngS}`;
              const url10=`${BASE}/10m/${id}/${id}_10m_v4.1_dem.tif`;
              try{ const p = await _downloadWithCache(url10,tmpDir); downloaded.push(p); log.push(`${id} 10m OK`); }
              catch(e){ log.push(`${id} fail: ${e.message.slice(0,40)}`); }
            }
          }
          if (!downloaded.length) throw new Error('Не удалось скачать тайлы ArcticDEM. Установите HTTPS_PROXY или поместите .tif файлы в папку dem_tiles/');
          tifUrls=downloaded; usedRes='10m';
        }
        } // конец медленного пути
      }
    }
    log.push(`Tiles: ${tifUrls.length} (${usedRes}${stacOk?'':' via S3'})`);

    // 2. VRT + clip
    onProgress&&onProgress(15,`Загрузка ArcticDEM ${usedRes}...`);
    const listF=path.join(tmpDir,'tiles.txt');
    const srcVrt=path.join(tmpDir,'src.vrt');
    fs.writeFileSync(listF,tifUrls.join('\n'));
    await runGDAL('gdalbuildvrt',['-input_file_list',listF,srcVrt]);

    const clippedTif=path.join(tmpDir,'clipped.tif');
    await runGDAL('gdalwarp',[
      '-of','GTiff','-te',String(minLng),String(minLat),String(maxLng),String(maxLat),
      '-te_srs','EPSG:4326','-t_srs','EPSG:4326','-r','bilinear',
      '-co','COMPRESS=LZW','-co','TILED=YES',srcVrt,clippedTif,
    ]);
    log.push('Clip OK');

    // 3. Геоид
    onProgress&&onProgress(28,useGeoid?'Перевод БСВ-77...':'Подготовка...');
    let demTif=clippedTif;
    if (useGeoid){
      const gTif=path.join(tmpDir,'geoid.tif');
      try{
        await runGDAL('gdalwarp',['-s_srs','EPSG:4979','-t_srs','EPSG:9518',
          '-r','bilinear','-co','COMPRESS=LZW',clippedTif,gTif]);
        demTif=gTif; log.push('Geoid OK');
      }catch(e){log.push('Geoid skip');}
    }

    // 4. Репроекция
    onProgress&&onProgress(36,'Перепроецирование...');
    const reprojTif=path.join(tmpDir,'reproj.tif');
    const targetSrs=proj4?proj4:`EPSG:${epsg||4326}`;
    await runGDAL('gdalwarp',[
      '-of','GTiff','-t_srs',targetSrs,'-r','bilinear',
      '-co','COMPRESS=LZW','-co','TILED=YES',demTif,reprojTif,
    ]);
    log.push('Reproject OK');

    if (format==='geotiff') return {file:reprojTif,tmpDir,log,mime:'image/tiff'};

    // 5. Fillnodata + resample
    onProgress&&onProgress(45,'Улучшение растра...');
    const filledTif=path.join(tmpDir,'filled.tif');
    try{
      await runGDAL('gdal_fillnodata',['-md','10','-si','2',reprojTif,filledTif]);
    }catch(e){ fs.copyFileSync(reprojTif,filledTif); }

    // Ресамплинг только для грубых данных (>5м): 10m→5m upsample.
    // При 2m источнике (-tr 5 5 это downsample) cubicspline в GDAL 4.0 даёт all-NoData.
    // Используем bilinear — безопасен для обоих направлений.
    const upTif=path.join(tmpDir,'up.tif');
    try{
      const info = await execFileP(gdal('gdalinfo'),['-json',filledTif],
        {env:gdalEnv(),maxBuffer:2*1024*1024,timeout:30000});
      const gi = JSON.parse(info.stdout||'{}');
      const pixW = Math.abs((gi.geoTransform||[0,10])[1]);
      if (pixW > 5.5) {
        // Источник грубее 5м (10m, 20m) — уплотняем до 5м
        await runGDAL('gdalwarp',['-r','bilinear','-tr','5','5',
          '-co','COMPRESS=LZW',filledTif,upTif]);
        log.push('Upsample 5m OK');
      } else {
        // Источник уже ≤5м (2m ArcticDEM) — ресамплинг не нужен
        fs.copyFileSync(filledTif,upTif);
        log.push(`Upsample skip (pix=${pixW.toFixed(1)}m)`);
      }
    }catch(e){
      fs.copyFileSync(filledTif,upTif);
      log.push('Upsample fallback');
    }

    // 6. Горизонтали → SHP (GPKG в GDAL 4.0 молча создаёт пустой слой)
    onProgress&&onProgress(55,`Горизонтали ${interval}м...`);
    const contoursGpkg=path.join(tmpDir,'contours.shp');
    await runGDAL('gdal_contour',[
      '-a','elevation','-i',String(interval),'-3d',
      upTif,contoursGpkg,
    ]);
    log.push('Contours OK');

    // 7. Python → DXF R12
    onProgress&&onProgress(68,'Генерация DXF (Python)...');

    // Вычисляем textHeight
    const latM=(maxLat-minLat)*111320;
    const lngM=(maxLng-minLng)*111320*Math.cos((minLat+maxLat)/2*Math.PI/180);
    const textHeight=Math.max(2,Math.round(Math.min(latM,lngM)/400));

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
    log.push(`DXF size: ${fs.statSync(outDxf).size} bytes`);

    // 8. Спутник
    let satFiles=[];
    let satPixelSizeM=null, satImgW=null, satImgH=null, satGt=null;
    if (exportSatellite){
      onProgress&&onProgress(85,'Загрузка спутника...');
      try{
        const satSections=await buildSatellite(bbox,tmpDir,proj4,epsg,reprojTif);
        for (const sec of satSections) {
          if (sec.jpeg && fs.existsSync(sec.jpeg)) satFiles.push(sec.jpeg);
          if (sec.jgw  && fs.existsSync(sec.jgw))  satFiles.push(sec.jgw);
          if (sec.prj  && fs.existsSync(sec.prj))  satFiles.push(sec.prj);
          // Сохраняем метаданные для readme
          if (sec.pixelSizeM) { satPixelSizeM=sec.pixelSizeM; satImgW=sec.imgWidthPx; satImgH=sec.imgHeightPx; satGt=sec.gt; }
        }
        log.push(`Satellite: ${satFiles.length} files, px=${satPixelSizeM?.toFixed(4)}m`);
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
    let satScaleInfo = '';
    if (satPixelSizeM && satImgW && satGt) {
      const scaleF = satPixelSizeM.toFixed(6);
      const insX   = (satGt[0] + satGt[1]*0.5 + satGt[2]*0.5).toFixed(3);
      const insY   = (satGt[3] + satGt[4]*0.5 + satGt[5]*0.5).toFixed(3);
      satScaleInfo =
        `\r\nСпутник в AutoCAD — точная инструкция:\r\n` +
        `  1. Распакуйте архив — satellite.jpg, satellite.jgw, satellite.prj должны\r\n` +
        `     лежать В ОДНОЙ ПАПКЕ с одинаковым именем\r\n` +
        `  2. Insert → Raster Image Reference (IMAGEATTACH) → satellite.jpg\r\n` +
        `  3. В диалоге IMAGEATTACH:\r\n` +
        `       Insertion point: X=${insX}  Y=${insY}  Z=0\r\n` +
        `       Scale factor:    ${scaleF}\r\n` +
        `       (или оставьте "Specify on-screen" и введите scale=${scaleF})\r\n` +
        `  4. ЛИБО просто нажмите OK с дефолтами и введите в командной строке:\r\n` +
        `       SCALE → выберите изображение → base point 0,0 → scale factor ${scaleF}\r\n` +
        `\r\n` +
        `  Размер растра: ${satImgW}x${satImgH} пикс, пиксель = ${scaleF} м\r\n` +
        `  Файлы: satellite.jpg + satellite.jgw (геопривязка) + satellite.prj (СК)\r\n`;
    } else {
      satScaleInfo =
        `\r\nСпутник в AutoCAD:\r\n` +
        `  Insert → Raster Image Reference → satellite.jpg\r\n` +
        `  Scale factor = размер_пикселя_в_метрах (см. satellite.jgw строка 1)\r\n`;
    }

    fs.writeFileSync(infoFile,
      `ArcticDEM Export\r\n` +
      `================\r\n` +
      `Дата: ${new Date().toLocaleString('ru')}\r\n` +
      `СК: ${projName||projId} ${proj4||''}\r\n` +
      `Горизонтали: шаг ${interval}м, источник ArcticDEM ${usedRes}\r\n` +
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

    return {file:zipFile,tmpDir,log,mime:'application/zip'};

  } catch(err) {
    try{fs.rmSync(tmpDir,{recursive:true});}catch(e){}
    err.gdal_log=log;
    throw err;
  }
}

function cleanupTmp(tmpDir){
  try{fs.rmSync(tmpDir,{recursive:true,force:true});}catch(e){}
}

async function checkGDAL(){
  try{
    const bin=findGDALBin();
    const {stdout}=await execFileP(gdal('gdalinfo'),['--version'],{env:gdalEnv()});
    return {available:true,version:stdout.trim(),path:bin,
            gdal_data:_gdalData,python:_pythonExe,
            has_proj_db:_projLib?fs.existsSync(path.join(_projLib,'proj.db')):null};
  }catch(e){
    return {available:false,reason:e.message,
            hint:IS_WINDOWS?'Установите OSGeo4W: https://trac.osgeo.org/osgeo4w/':'Установите: sudo apt install gdal-bin'};
  }
}

// ── Симуляция зоны затопления ──────────────────────────────
async function computeFloodZone(bbox, waterLevelM, onProgress) {
  findGDALBin(); // инициализирует _pythonExe, _gdalBin
  const env = gdalEnv();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flood_'));

  // Найти gdal_calc.py и gdal_polygonize.py
  function findPyScript(name) {
    const candidates = IS_WINDOWS
      ? [
          path.join(_gdalBin, name),
          path.join(path.resolve(_gdalBin, '..'), 'apps', 'Python312', 'Scripts', name),
          path.join(path.resolve(_gdalBin, '..'), 'apps', 'Python39',  'Scripts', name),
          path.join(_gdalBin, '..', 'bin', name),
        ]
      : [
          path.join('/usr/bin', name),
          path.join('/usr/local/bin', name),
          path.join(_gdalBin, name),
        ];
    const found = candidates.find(p => { try { return fs.existsSync(p); } catch(e) { return false; } });
    if (!found) throw new Error(`Не найден скрипт ${name}. Установите python3-gdal (Linux) или убедитесь, что OSGeo4W полный (Windows).`);
    return found;
  }

  try {
    // 1. Тайлы ArcticDEM: локальные → vsicurl COG (быстро) → полное скачивание (медленно)
    onProgress(5, 'Поиск тайлов ArcticDEM...');

    let localTilePaths = _findLocalTiles();

    if (localTilePaths.length) {
      console.log(`[FLOOD] Найдено ${localTilePaths.length} локальных тайлов в dem_tiles/`);
      onProgress(28, `Используем ${localTilePaths.length} локальных тайлов...`);
    } else {
      const urls2m = _build2mTileUrls(bbox);
      const vsUrls2m = urls2m.map(u => '/vsicurl/' + u);

      // Быстрый путь: GDAL vsicurl (COG range-запросы, скачивает только нужный bbox)
      if (vsUrls2m.length) {
        onProgress(6, 'Проверка прямого доступа к ArcticDEM...');
        const vsOk = await _canVsiCurl(vsUrls2m[0]);
        if (vsOk) {
          console.log('[FLOOD] vsicurl OK — используем COG range-запросы (быстро)');
          localTilePaths = vsUrls2m;
          onProgress(28, `ArcticDEM 2m: COG доступ (${vsUrls2m.length} тайл(а))`);
        } else {
          console.log('[FLOOD] vsicurl недоступен — полное скачивание');
        }
      }

      // Медленный путь: полное скачивание (если vsicurl не работает)
      if (!localTilePaths.length) {
      // Скачать с S3 через Node.js: сначала 2m (правильные PS-координаты), потом 10m
      onProgress(5, 'Скачивание тайлов ArcticDEM 2m...');
      let used2m = false;

      for (let i = 0; i < urls2m.length; i++) {
        const url = urls2m[i];
        const fname = path.basename(url);
        const localPath = path.join(tmpDir, fname);
        onProgress(5 + Math.round(22 * i / Math.max(urls2m.length, 1)), `Загрузка ${fname}…`);
        console.log('[FLOOD] 2m:', url);
        try {
          const p = await _downloadWithCache(url, tmpDir);
          localTilePaths.push(p);
          console.log(`[FLOOD] OK: ${fname}`);
          used2m = true;
        } catch(e) {
          console.log(`[FLOOD] 2m skip ${fname}: ${e.message}`);
        }
      }

      // Если 2m недоступны — fallback на 10m (1°×1° lat/lng сетка)
      if (!used2m) {
        onProgress(10, 'Скачивание тайлов ArcticDEM 10m...');
        const BASE = 'https://pgc-opendata-dems.s3.us-west-2.amazonaws.com/arcticdem/mosaics/v4.1';
        const tileDefs = [];
        for (let lat = Math.floor(bbox.minLat); lat <= Math.floor(bbox.maxLat); lat++) {
          for (let lng = Math.floor(bbox.minLng); lng <= Math.floor(bbox.maxLng); lng++) {
            const latS = lat >= 0 ? `n${String(lat).padStart(2,'0')}` : `s${String(-lat).padStart(2,'0')}`;
            const lngS = lng >= 0 ? `e${String(lng).padStart(3,'0')}` : `w${String(-lng).padStart(3,'0')}`;
            tileDefs.push(`${latS}${lngS}`);
          }
        }
        for (let i = 0; i < tileDefs.length; i++) {
          const id = tileDefs[i];
          onProgress(10 + Math.round(17 * i / Math.max(tileDefs.length, 1)), `Загрузка ${id}…`);
          const url = `${BASE}/10m/${id}/${id}_10m_v4.1_dem.tif`;
          console.log('[FLOOD] 10m:', url);
          try {
            const p = await _downloadWithCache(url, tmpDir);
            localTilePaths.push(p);
            console.log(`[FLOOD] OK: ${id} (10m)`);
          } catch(e) {
            console.log(`[FLOOD] 10m skip ${id}: ${e.message}`);
          }
        }
      }

      if (!localTilePaths.length) {
        const hint2m = urls2m.slice(0, 4).map(u => path.basename(u)).join(', ');
        throw new Error(
          'Не удалось скачать тайлы ArcticDEM.\n\n' +
          'Способы решения:\n' +
          '1. Установите HTTPS_PROXY=http://host:port и перезапустите сервер\n' +
          '2. Скачайте .tif файлы через VPN и положите в папку dem_tiles/\n\n' +
          'Нужные файлы (2m): ' + hint2m
        );
      }
      } // конец медленного пути
    }

    const listFile = path.join(tmpDir, 'tiles.txt');
    const vrtPath  = path.join(tmpDir, 'dem.vrt');
    const clipPath = path.join(tmpDir, 'dem_clip.tif');
    const maskPath = path.join(tmpDir, 'flood_mask.tif');
    const gjPath   = path.join(tmpDir, 'flood.geojson');
    const gjsPath  = path.join(tmpDir, 'flood_s.geojson');

    fs.writeFileSync(listFile, localTilePaths.join('\n'));

    onProgress(32, 'Сборка VRT...');
    await runGDAL('gdalbuildvrt', ['-input_file_list', listFile, vrtPath]);

    onProgress(42, 'Обрезка по области...');
    await runGDAL('gdalwarp', [
      '-of', 'GTiff',
      '-te', String(bbox.minLng), String(bbox.minLat), String(bbox.maxLng), String(bbox.maxLat),
      '-te_srs', 'EPSG:4326', '-t_srs', 'EPSG:4326', '-r', 'bilinear',
      '-co', 'COMPRESS=LZW', '-co', 'TILED=YES',
      vrtPath, clipPath,
    ]);

    // Перевод в БСВ-77 (EGM2008, EPSG:9518): ArcticDEM даёт эллипсоидальные высоты WGS-84,
    // пользователь вводит отметку в балтийской системе — нужно привести растр к той же шкале
    onProgress(52, 'Перевод высот в БСВ-77...');
    const geoidPath = path.join(tmpDir, 'dem_bsv77.tif');
    let demForCalc = clipPath;
    try {
      await runGDAL('gdalwarp', [
        '-s_srs', 'EPSG:4979', '-t_srs', 'EPSG:9518',
        '-r', 'bilinear', '-co', 'COMPRESS=LZW',
        clipPath, geoidPath,
      ]);
      demForCalc = geoidPath;
      console.log('[FLOOD] Геоид БСВ-77 OK');
    } catch(e) {
      console.log('[FLOOD] Геоид пропущен:', e.message.slice(0, 100));
    }

    onProgress(62, 'Вычисление маски затопления...');
    const calcScript = findPyScript('gdal_calc.py');
    await new Promise((resolve, reject) => {
      const calc = `((A>=-9000)*(A<=${waterLevelM})).astype(int)`;
      const cmd = `"${_pythonExe}" "${calcScript}" -A "${demForCalc}" --outfile="${maskPath}" --calc="${calc}" --type=Byte --NoDataValue=0 --overwrite`;
      exec(cmd, { env, timeout: 300000, maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (stderr) console.log('[FLOOD calc stderr]', stderr.slice(0, 300));
        if (err) reject(new Error(`gdal_calc error: ${(stderr || err.message).slice(0, 300)}`));
        else resolve();
      });
    });

    onProgress(77, 'Векторизация...');
    const polyScript = findPyScript('gdal_polygonize.py');
    await new Promise((resolve, reject) => {
      const cmd = `"${_pythonExe}" "${polyScript}" "${maskPath}" -f GeoJSON "${gjPath}" flood DN`;
      exec(cmd, { env, timeout: 120000, maxBuffer: 200 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (stderr) console.log('[FLOOD poly stderr]', stderr.slice(0, 300));
        if (err) reject(new Error(`gdal_polygonize error: ${(stderr || err.message).slice(0, 300)}`));
        else resolve();
      });
    });

    onProgress(90, 'Упрощение геометрии...');
    await runGDAL('ogr2ogr', ['-f', 'GeoJSON', gjsPath, gjPath, '-simplify', '0.00005']);

    onProgress(97, 'Чтение результата...');
    const gj = JSON.parse(fs.readFileSync(gjsPath, 'utf8'));
    if (gj.features) {
      gj.features = gj.features.filter(f => f.properties && f.properties.DN === 1);
    }
    return gj;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

function getDemTilesInfo() {
  if (!fs.existsSync(DEM_TILES_DIR)) return { dir: DEM_TILES_DIR, tiles: [], exists: false };
  try {
    const tiles = fs.readdirSync(DEM_TILES_DIR)
      .filter(f => /\.(tif|tiff)$/i.test(f))
      .map(f => {
        const fp = path.join(DEM_TILES_DIR, f);
        return { name: f, sizeMb: Math.round(fs.statSync(fp).size / 1048576) };
      });
    return { dir: DEM_TILES_DIR, tiles, exists: true };
  } catch(e) { return { dir: DEM_TILES_DIR, tiles: [], exists: true, error: e.message }; }
}

module.exports = {processDEM,cleanupTmp,checkGDAL,computeFloodZone,getDemTilesInfo};
