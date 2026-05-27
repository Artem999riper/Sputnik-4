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
    let geoidApplied = false;
    if (useGeoid){
      const gTif=path.join(tmpDir,'geoid.tif');
      try{
        await runGDAL('gdalwarp',['-s_srs','EPSG:4979','-t_srs','EPSG:9518',
          '-r','bilinear','-co','COMPRESS=LZW',clippedTif,gTif]);
        demTif=gTif; geoidApplied=true; log.push('Geoid OK');
      }catch(e){log.push('Geoid skip');}
    }

    // 4. Репроекция
    onProgress&&onProgress(36,'Перепроецирование...');
    const reprojTif=path.join(tmpDir,'reproj.tif');
    const targetSrs=proj4?proj4:`EPSG:${epsg||4326}`;
    // При геоид-коррекции источник имеет EPSG:9518 (compound 3D CRS).
    // Явно задаём -s_srs EPSG:4326 (2D), чтобы gdalwarp не пытался делать
    // вертикальную трансформацию в целевую СК (МСК, ГСК2011 и др.).
    const reprojArgs=['-of','GTiff','-t_srs',targetSrs,'-r','bilinear',
      '-co','COMPRESS=LZW','-co','TILED=YES'];
    if(geoidApplied) reprojArgs.push('-s_srs','EPSG:4326');
    reprojArgs.push(demTif,reprojTif);
    await runGDAL('gdalwarp',reprojArgs);
    log.push('Reproject OK');

    if (format==='geotiff') return {file:reprojTif,tmpDir,log,mime:'image/tiff'};

    // 5. Fillnodata + upsample
    onProgress&&onProgress(45,'Улучшение растра...');
    const filledTif=path.join(tmpDir,'filled.tif');
    try{
      await runGDAL('gdal_fillnodata',['-md','10','-si','2',reprojTif,filledTif]);
    }catch(e){ fs.copyFileSync(reprojTif,filledTif); }

    const upTif=path.join(tmpDir,'up.tif');
    try{
      await runGDAL('gdalwarp',['-r','cubicspline','-tr','5','5',
        '-co','COMPRESS=LZW',filledTif,upTif]);
    }catch(e){ fs.copyFileSync(filledTif,upTif); }
    log.push('Upsample OK');

    // 6. Горизонтали → GPKG
    onProgress&&onProgress(55,`Горизонтали ${interval}м...`);
    const contoursGpkg=path.join(tmpDir,'contours.gpkg');
    await runGDAL('gdal_contour',[
      '-a','elevation','-i',String(interval),'-3d','-nln','contours','-f','GPKG',
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

// ── Поправка геоида N через Python OSR ────────────────────
// Возвращает N (м) или null. N = WGS84_эллипсоид - БСВ-77_ортометр
async function _computeGeoidN(lon, lat, tmpDir) {
  const pyScript = `
import sys, os, math

def geoid_lookup(lon, lat):
    # EGM96 approx geoid undulation (meters, +-5m accuracy) for Russia/Arctic
    # Grid: lat 40-80N step 5deg (9 rows), lon 10-180E step 10deg (18 cols)
    LAT0, DLAT, NLAT = 40.0, 5.0, 9
    LON0, DLON, NLON = 10.0, 10.0, 18
    T = [
        # 40N
        [30,38,35,28,22,18,14,12, 8, 5, 3, 2,-2,-8,-14,-18,-20,-21],
        # 45N
        [22,32,30,23,18,14,10, 7, 3, 0,-1,-2,-5,-10,-16,-19,-21,-22],
        # 50N
        [18,28,26,20,15,10, 6, 2,-2,-5,-5,-5,-7,-12,-17,-20,-21,-22],
        # 55N
        [14,22,20,15,10, 5, 3,-1,-5,-7,-6,-6,-8,-12,-18,-20,-21,-22],
        # 60N
        [10,18,18,14, 8, 2,-2,-6,-9,-11,-11,-11,-14,-16,-20,-21,-21,-21],
        # 65N
        [ 6,14,14,10, 4,-4,-8,-15,-16,-15,-14,-14,-16,-18,-22,-22,-21,-21],
        # 70N
        [ 4,10,10, 8, 2,-5,-13,-19,-20,-19,-18,-17,-18,-19,-22,-22,-21,-21],
        # 75N
        [ 2, 6, 6, 5, 0,-7,-14,-20,-22,-22,-21,-20,-20,-20,-22,-22,-21,-21],
        # 80N
        [ 2, 4, 4, 3,-1,-7,-12,-18,-22,-23,-22,-21,-20,-20,-22,-22,-21,-21],
    ]
    lat = max(40.0, min(79.99, lat))
    lon = ((lon + 180.0) % 360.0) - 180.0
    lon = max(10.0, min(179.99, lon))
    fi = (lat - LAT0) / DLAT
    fj = (lon - LON0) / DLON
    i0 = int(fi); i1 = min(i0 + 1, NLAT - 1)
    j0 = int(fj); j1 = min(j0 + 1, NLON - 1)
    di = fi - i0; dj = fj - j0
    v = (T[i0][j0]*(1-di)*(1-dj) + T[i0][j1]*(1-di)*dj +
         T[i1][j0]*di*(1-dj)     + T[i1][j1]*di*dj)
    return round(v, 2)

os.environ.setdefault('PROJ_NETWORK', 'ON')
lon_pt = float(sys.argv[1])
lat_pt = float(sys.argv[2])

n_osr = None
try:
    import warnings
    warnings.filterwarnings('ignore')
    from osgeo import osr
    for epsg in [3855, 5773]:
        try:
            src = osr.SpatialReference()
            src.ImportFromEPSG(4979)
            src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            tgt = osr.SpatialReference()
            tgt.ImportFromEPSG(epsg)
            tgt.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            ct = osr.CoordinateTransformation(src, tgt)
            x, y, h = ct.TransformPoint(lon_pt, lat_pt, 0.0)
            n_val = -h
            if abs(n_val) > 0.5:
                n_osr = n_val
                break
        except Exception as e:
            sys.stderr.write(f'epsg {epsg}: {e}\\n')
except Exception as e:
    sys.stderr.write(f'osr import: {e}\\n')

if n_osr is not None:
    print(f'{n_osr:.4f}')
else:
    n_fb = geoid_lookup(lon_pt, lat_pt)
    sys.stderr.write(f'OSR no grid, EGM96 table: N={n_fb}\\n')
    print(f'{n_fb:.4f}')
`;
  const pyF = path.join(tmpDir, 'get_geoid_n.py');
  fs.writeFileSync(pyF, pyScript);
  return new Promise(resolve => {
    exec(`"${_pythonExe}" "${pyF}" "${lon}" "${lat}"`,
      { env: { ...gdalEnv(), PROJ_NETWORK: 'ON' }, timeout: 20000, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        if (stderr) console.log('[FLOOD] geoidN stderr:', stderr.slice(0, 300));
        const n = parseFloat((stdout || '').trim());
        resolve((!err && !isNaN(n) && Math.abs(n) > 0.1) ? n : null);
      });
  });
}

// ── Ядро расчёта затопления ────────────────────────────────
async function _floodCore(bbox, waterLevelM, tmpDir, onProgress) {
  const {minLat,maxLat,minLng,maxLng} = bbox;

  // 1. Тайлы ArcticDEM
  onProgress(5, 'Поиск тайлов ArcticDEM...');
  let tifUrls = [], usedRes = '10m';
  try {
    const r2 = await stacSearch(bbox, 'arcticdem-mosaics-v4.1-2m');
    if ((r2.features||[]).length) {
      usedRes = '2m';
      tifUrls = r2.features.map(item => {
        const a = item.assets||{};
        const k = Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
        return a[k]?.href;
      }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
    }
  } catch(e) { console.log('[FLOOD] STAC 2m:', e.message.slice(0,60)); }
  if (!tifUrls.length) {
    try {
      const r10 = await stacSearch(bbox, 'arcticdem-mosaics-v4.1-10m');
      if ((r10.features||[]).length) {
        usedRes = '10m';
        tifUrls = r10.features.map(item => {
          const a = item.assets||{};
          const k = Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
          return a[k]?.href;
        }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
      }
    } catch(e) { console.log('[FLOOD] STAC 10m:', e.message.slice(0,60)); }
  }
  if (!tifUrls.length) {
    console.log('[FLOOD] STAC недоступен — прямые S3 URLs');
    tifUrls = _buildDirectDemUrls(bbox, '10m');
    usedRes = '10m';
  }
  if (!tifUrls.length) throw new Error('Не удалось определить тайлы ArcticDEM для выбранной области');
  console.log(`[FLOOD] Tiles: ${tifUrls.length} (${usedRes})`);

  // 2. VRT + clip в EPSG:4326
  onProgress(28, `Загрузка ArcticDEM ${usedRes}...`);
  const listF    = path.join(tmpDir, 'tiles.txt');
  const srcVrt   = path.join(tmpDir, 'src.vrt');
  const clipPath = path.join(tmpDir, 'clip.tif');
  fs.writeFileSync(listF, tifUrls.join('\n'));
  await runGDAL('gdalbuildvrt', ['-input_file_list', listF, srcVrt]);
  await runGDAL('gdalwarp', [
    '-te', String(minLng), String(minLat), String(maxLng), String(maxLat),
    '-te_srs', 'EPSG:4326', '-t_srs', 'EPSG:4326', '-r', 'bilinear',
    '-co', 'COMPRESS=LZW', srcVrt, clipPath,
  ]);

  // 3. gdal_calc: маска ≤ waterLevelM (WGS84 эллипсоидальная высота)
  onProgress(65, `Маска затопления ≤${waterLevelM}м...`);
  const maskPath = path.join(tmpDir, 'mask.tif');

  await new Promise((resolve, reject) => {
    const pyCalcScript = `
import sys
import numpy as np
from osgeo import gdal
gdal.UseExceptions()

ds = gdal.Open(sys.argv[1])
band = ds.GetRasterBand(1)
arr = band.ReadAsArray().astype(np.float64)
nodata = band.GetNoDataValue()

invalid = np.zeros(arr.shape, dtype=bool)
if nodata is not None:
    invalid |= np.isclose(arr, nodata, atol=0.01)
invalid |= (arr < -9000)

valid_vals = arr[~invalid]
water = float(sys.argv[2])
print(f"[MASK] nodata={nodata}, valid_pixels={valid_vals.size}, water={water}m")
if valid_vals.size > 0:
    print(f"[MASK] elev min={valid_vals.min():.2f} max={valid_vals.max():.2f} mean={valid_vals.mean():.2f}")
else:
    print("[MASK] WARNING: no valid pixels - geoid conversion may have failed")

mask = np.zeros(arr.shape, dtype=np.uint8)
mask[(arr <= water) & ~invalid] = 1
flood_px = int(mask.sum())
print(f"[MASK] flooded_pixels={flood_px} of {valid_vals.size} valid ({100*flood_px/max(1,valid_vals.size):.1f}%)")

driver = gdal.GetDriverByName('GTiff')
out = driver.Create(sys.argv[3], ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Byte, ['COMPRESS=LZW'])
out.SetGeoTransform(ds.GetGeoTransform())
out.SetProjection(ds.GetProjection())
b = out.GetRasterBand(1)
b.SetNoDataValue(0)
b.WriteArray(mask)
out.FlushCache()
out = None; ds = None
`;
    const pyFile = path.join(tmpDir, 'calc_mask.py');
    fs.writeFileSync(pyFile, pyCalcScript);
    exec(`"${_pythonExe}" "${pyFile}" "${clipPath}" "${waterLevelM}" "${maskPath}"`,
      { env: gdalEnv(), timeout: 120000, maxBuffer: 20*1024*1024 },
      (err, stdout, stderr) => {
        if (stdout) console.log('[FLOOD mask]', stdout.trim());
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
  });

  // 4. gdal_polygonize → GeoJSON
  onProgress(80, 'Полигонизация...');
  const rawGj  = path.join(tmpDir, 'flood_raw.geojson');
  const simpGj = path.join(tmpDir, 'flood.geojson');

  await new Promise((resolve, reject) => {
    const pyPoly = `
import sys
from osgeo import gdal, ogr
src = gdal.Open(sys.argv[1])
band = src.GetRasterBand(1)
drv = ogr.GetDriverByName('GeoJSON')
import os; os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True) if os.path.dirname(sys.argv[2]) else None
if os.path.exists(sys.argv[2]): os.remove(sys.argv[2])
dst = drv.CreateDataSource(sys.argv[2])
lyr = dst.CreateLayer('flood', srs=None)
gdal.Polygonize(band, band, lyr, -1, [], callback=None)
count = lyr.GetFeatureCount()
dst.FlushCache()
dst = None; src = None
print('done', count)
`;
    const pyFile2 = path.join(tmpDir, 'polygonize.py');
    fs.writeFileSync(pyFile2, pyPoly);
    exec(`"${_pythonExe}" "${pyFile2}" "${maskPath}" "${rawGj}"`,
      { env: gdalEnv(), timeout: 180000, maxBuffer: 100*1024*1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
  });

  // 5. Упрощение геометрии через ogr2ogr
  onProgress(90, 'Упрощение...');
  try {
    await runGDAL('ogr2ogr', ['-f', 'GeoJSON', '-simplify', '0.0001', simpGj, rawGj]);
  } catch(e) {
    fs.copyFileSync(rawGj, simpGj);
  }

  return simpGj;
}

// ── Симуляция затопления ───────────────────────────────────
async function computeFloodZone(bbox, waterLevelM, onProgress) {
  onProgress = onProgress || (() => {});
  findGDALBin();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'flood_'));

  try {
    const simpGj = await _floodCore(bbox, waterLevelM, tmpDir, onProgress);
    onProgress(98, 'Готово');
    const gj = JSON.parse(fs.readFileSync(simpGj, 'utf8'));
    if (gj.features) {
      gj.features = gj.features.filter(f => {
        const c = f.geometry?.coordinates;
        return c && c.length > 0 && c[0].length > 4;
      });
    }
    return gj;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
  }
}

// ── Экспорт зоны затопления в DXF ─────────────────────────
async function computeFloodZoneDxf(bbox, waterLevelM, waterLevelBsv77, proj4Str, epsg, projName, onProgress) {
  onProgress = onProgress || (() => {});
  findGDALBin();
  const { buildLayersDXF, saveDXF } = require('./dxf-writer');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flooddxf_'));

  try {
    const simpGj = await _floodCore(bbox, waterLevelM, tmpDir, onProgress);

    // Перепроецирование GeoJSON в целевую СК
    onProgress(91, 'Перепроецирование...');
    const reprojGj = path.join(tmpDir, 'flood_reproj.geojson');
    const srsArg = proj4Str || (epsg ? `EPSG:${epsg}` : 'EPSG:4326');
    try {
      await runGDAL('ogr2ogr', [
        '-f', 'GeoJSON', '-s_srs', 'EPSG:4326', '-t_srs', srsArg, reprojGj, simpGj,
      ]);
    } catch(e) {
      console.log('[FLOOD DXF] Перепроецирование не удалось:', e.message.slice(0, 80));
      fs.copyFileSync(simpGj, reprojGj);
    }

    // Читаем GeoJSON, добавляем Z = waterLevelBsv77, фильтруем мелкий шум
    onProgress(94, 'Создание DXF...');
    const gj = JSON.parse(fs.readFileSync(reprojGj, 'utf8'));
    const zVal = waterLevelBsv77;
    function addZ(c) {
      if (!Array.isArray(c) || !c.length) return c;
      if (typeof c[0] === 'number') return [c[0], c[1], zVal];
      return c.map(addZ);
    }
    if (gj.features) {
      gj.features = gj.features
        .filter(f => { const c = f.geometry?.coordinates; return c && c.length > 0 && c[0].length > 4; })
        .map(f => { if (f.geometry?.coordinates) f.geometry.coordinates = addZ(f.geometry.coordinates); return f; });
    }

    const dxfStr = buildLayersDXF({
      layers: [{ name: 'ГРАНИЦА_ЗАТОПЛЕНИЯ', color: 5, geojson: gj }],
      transform: (x, y) => [x, y],
    });
    const safeProj = (projName || 'export').replace(/[^\w\-]/g, '_');
    const dxfPath  = path.join(tmpDir, `flood_${safeProj}.dxf`);
    saveDXF(dxfPath, dxfStr);

    const infoPath = path.join(tmpDir, 'flood_readme.txt');
    fs.writeFileSync(infoPath,
      `Зона затопления ArcticDEM\r\n` +
      `==========================\r\n` +
      `Дата: ${new Date().toLocaleString('ru')}\r\n` +
      `Уровень воды: ${waterLevelBsv77} м БСВ-77 (${waterLevelM} м WGS84 эллипсоид)\r\n` +
      `СК: ${projName || (epsg ? 'EPSG:' + epsg : 'WGS84')}\r\n` +
      `\r\nСлои DXF (R12):\r\n` +
      `  ГРАНИЦА_ЗАТОПЛЕНИЯ — синий (5), контуры зоны затопления, Z = уровень воды БСВ-77\r\n`
    );

    onProgress(97, 'Упаковка ZIP...');
    const zipPath = path.join(tmpDir, 'flood_dxf.zip');
    const filesToZip = [dxfPath, infoPath].filter(f => fs.existsSync(f));
    await new Promise((resolve, reject) => {
      if (IS_WINDOWS) {
        const toZip = filesToZip.map(f => `'${f}'`).join(',');
        exec(
          `powershell -Command "Compress-Archive -Path ${toZip} -DestinationPath '${zipPath}' -Force"`,
          (err, _, se) => err ? reject(new Error(se || err.message)) : resolve()
        );
      } else {
        execFile('zip', ['-j', zipPath, ...filesToZip], (err, _, se) => err ? reject(new Error(se || err.message)) : resolve());
      }
    });

    return { file: zipPath, tmpDir, mime: 'application/zip' };
  } catch(e) {
    cleanupTmp(tmpDir);
    throw e;
  }
}

// ── Предзагрузка DEM (шаги 1-2): скачать + обрезать + вычислить N геоида
// Возвращает {tmpDir, geoidN}. tmpDir нужно очистить после использования.
async function preloadFloodDem(bbox, onProgress) {
  onProgress = onProgress || (() => {});
  findGDALBin();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flood_'));
  const {minLat,maxLat,minLng,maxLng} = bbox;

  try {
    // 1. Тайлы ArcticDEM
    onProgress(5, 'Поиск тайлов ArcticDEM...');
    let tifUrls = [], usedRes = '10m';
    try {
      const r2 = await stacSearch(bbox, 'arcticdem-mosaics-v4.1-2m');
      if ((r2.features||[]).length) {
        usedRes = '2m';
        tifUrls = r2.features.map(item => {
          const a = item.assets||{};
          const k = Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
          return a[k]?.href;
        }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
      }
    } catch(e) { console.log('[FLOOD] STAC 2m:', e.message.slice(0,60)); }
    if (!tifUrls.length) {
      try {
        const r10 = await stacSearch(bbox, 'arcticdem-mosaics-v4.1-10m');
        if ((r10.features||[]).length) {
          usedRes = '10m';
          tifUrls = r10.features.map(item => {
            const a = item.assets||{};
            const k = Object.keys(a).find(k=>k==='dem'||k.endsWith('_dem'))||Object.keys(a)[0];
            return a[k]?.href;
          }).filter(Boolean).map(u=>u.startsWith('s3://')?'/vsis3/'+u.slice(5):'/vsicurl/'+u);
        }
      } catch(e) { console.log('[FLOOD] STAC 10m:', e.message.slice(0,60)); }
    }
    if (!tifUrls.length) {
      console.log('[FLOOD] STAC недоступен — прямые S3 URLs');
      tifUrls = _buildDirectDemUrls(bbox, '10m');
      usedRes = '10m';
    }
    if (!tifUrls.length) throw new Error('Не удалось определить тайлы ArcticDEM для выбранной области');
    console.log(`[FLOOD] Preload tiles: ${tifUrls.length} (${usedRes})`);

    // 2. VRT + clip в EPSG:4326
    onProgress(28, `Загрузка ArcticDEM ${usedRes}...`);
    const listF    = path.join(tmpDir, 'tiles.txt');
    const srcVrt   = path.join(tmpDir, 'src.vrt');
    const clipPath = path.join(tmpDir, 'clip.tif');
    fs.writeFileSync(listF, tifUrls.join('\n'));
    await runGDAL('gdalbuildvrt', ['-input_file_list', listF, srcVrt]);
    await runGDAL('gdalwarp', [
      '-te', String(minLng), String(minLat), String(maxLng), String(maxLat),
      '-te_srs', 'EPSG:4326', '-t_srs', 'EPSG:4326', '-r', 'bilinear',
      '-co', 'COMPRESS=LZW', srcVrt, clipPath,
    ]);

    // 3. N геоида для центра области
    onProgress(90, 'Определение геоида...');
    const latC = (minLat + maxLat) / 2;
    const lngC = (minLng + maxLng) / 2;
    let geoidN = null;
    try { geoidN = await _computeGeoidN(lngC, latC, tmpDir); } catch(e) {}
    console.log(`[FLOOD] Preload done, geoidN=${geoidN}`);

    onProgress(100, 'Данные загружены');
    return { tmpDir, geoidN };
  } catch(e) {
    cleanupTmp(tmpDir);
    throw e;
  }
}

// ── Расчёт затопления по уже загруженным данным (шаги 3-5)
// tmpDir должен содержать clip.tif от preloadFloodDem
async function computeFloodFromPreload(tmpDir, waterLevelM, onProgress) {
  onProgress = onProgress || (() => {});
  const clipPath = path.join(tmpDir, 'clip.tif');
  if (!fs.existsSync(clipPath)) throw new Error('Данные не найдены — выполните предзагрузку заново');

  // Маска ≤ waterLevelM
  onProgress(30, `Маска затопления ≤${waterLevelM}м...`);
  const maskPath = path.join(tmpDir, 'mask.tif');

  await new Promise((resolve, reject) => {
    const pyCalcScript = `
import sys
import numpy as np
from osgeo import gdal
gdal.UseExceptions()

ds = gdal.Open(sys.argv[1])
band = ds.GetRasterBand(1)
arr = band.ReadAsArray().astype(np.float64)
nodata = band.GetNoDataValue()

invalid = np.zeros(arr.shape, dtype=bool)
if nodata is not None:
    invalid |= np.isclose(arr, nodata, atol=0.01)
invalid |= (arr < -9000)

valid_vals = arr[~invalid]
water = float(sys.argv[2])
print(f"[MASK] nodata={nodata}, valid_pixels={valid_vals.size}, water={water}m")
if valid_vals.size > 0:
    print(f"[MASK] elev min={valid_vals.min():.2f} max={valid_vals.max():.2f} mean={valid_vals.mean():.2f}")
else:
    print("[MASK] WARNING: no valid pixels")

mask = np.zeros(arr.shape, dtype=np.uint8)
mask[(arr <= water) & ~invalid] = 1
flood_px = int(mask.sum())
print(f"[MASK] flooded_pixels={flood_px} of {valid_vals.size} valid ({100*flood_px/max(1,valid_vals.size):.1f}%)")

driver = gdal.GetDriverByName('GTiff')
out = driver.Create(sys.argv[3], ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Byte, ['COMPRESS=LZW'])
out.SetGeoTransform(ds.GetGeoTransform())
out.SetProjection(ds.GetProjection())
b = out.GetRasterBand(1)
b.SetNoDataValue(0)
b.WriteArray(mask)
out.FlushCache()
out = None; ds = None
`;
    const pyFile = path.join(tmpDir, 'calc_mask2.py');
    fs.writeFileSync(pyFile, pyCalcScript);
    exec(`"${_pythonExe}" "${pyFile}" "${clipPath}" "${waterLevelM}" "${maskPath}"`,
      { env: gdalEnv(), timeout: 120000, maxBuffer: 20*1024*1024 },
      (err, stdout, stderr) => {
        if (stdout) console.log('[FLOOD mask]', stdout.trim());
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
  });

  // Полигонизация
  onProgress(65, 'Полигонизация...');
  const rawGj  = path.join(tmpDir, 'flood_raw2.geojson');
  const simpGj = path.join(tmpDir, 'flood2.geojson');

  await new Promise((resolve, reject) => {
    const pyPoly = `
import sys
from osgeo import gdal, ogr
src = gdal.Open(sys.argv[1])
band = src.GetRasterBand(1)
drv = ogr.GetDriverByName('GeoJSON')
import os
if os.path.exists(sys.argv[2]): os.remove(sys.argv[2])
dst = drv.CreateDataSource(sys.argv[2])
lyr = dst.CreateLayer('flood', srs=None)
gdal.Polygonize(band, band, lyr, -1, [], callback=None)
count = lyr.GetFeatureCount()
dst.FlushCache()
dst = None; src = None
print('done', count)
`;
    const pyFile2 = path.join(tmpDir, 'polygonize2.py');
    fs.writeFileSync(pyFile2, pyPoly);
    exec(`"${_pythonExe}" "${pyFile2}" "${maskPath}" "${rawGj}"`,
      { env: gdalEnv(), timeout: 180000, maxBuffer: 100*1024*1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
  });

  // Упрощение
  onProgress(85, 'Упрощение...');
  try {
    await runGDAL('ogr2ogr', ['-f', 'GeoJSON', '-simplify', '0.0001', simpGj, rawGj]);
  } catch(e) {
    fs.copyFileSync(rawGj, simpGj);
  }

  onProgress(98, 'Готово');
  const gj = JSON.parse(fs.readFileSync(simpGj, 'utf8'));
  if (gj.features) {
    gj.features = gj.features.filter(f => {
      const c = f.geometry?.coordinates;
      return c && c.length > 0 && c[0].length > 4;
    });
  }
  return gj;
}

// ── Публичная функция для получения N геоида ──────────────
async function computeGeoidN(lat, lng) {
  findGDALBin();
  if (!_pythonExe) return null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geoid_'));
  try {
    return await _computeGeoidN(lng, lat, tmpDir);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
}

module.exports = {processDEM,cleanupTmp,checkGDAL,computeFloodZone,computeFloodZoneDxf,computeGeoidN,preloadFloodDem,computeFloodFromPreload};
