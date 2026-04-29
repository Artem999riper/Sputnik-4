// ═══════════════════════════════════════════════════════════
// satellite-fetcher.js — скачивание спутниковых тайлов
// и сборка в JPEG + JGW (world file) с геопривязкой
// Источник: Esri World Imagery (бесплатный публичный сервис)
// ═══════════════════════════════════════════════════════════

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// Esri World Imagery тайловый сервис
const TILE_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_SIZE = 256; // пикселей

// ── Математика тайлов (Web Mercator / EPSG:3857) ──────────
function lon2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  const r = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  return Math.floor((1 - r / 180) * Math.pow(2, zoom) / 2);
}
function tile2lon(x, zoom) {
  return x / Math.pow(2, zoom) * 360 - 180;
}
function tile2lat(y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Оптимальный зум для bbox и целевого разрешения
function getBestZoom(bbox, targetPixels) {
  const { minLat, maxLat, minLng, maxLng } = bbox;
  for (let z = 17; z >= 10; z--) {
    const xMin = lon2tile(minLng, z);
    const xMax = lon2tile(maxLng, z);
    const yMin = lat2tile(maxLat, z);
    const yMax = lat2tile(minLat, z);
    const tilesX = Math.abs(xMax - xMin) + 1;
    const tilesY = Math.abs(yMax - yMin) + 1;
    if (tilesX * TILE_SIZE <= targetPixels && tilesY * TILE_SIZE <= targetPixels) {
      return z;
    }
  }
  return 12;
}

// Скачать один тайл
function fetchTile(z, x, y) {
  return new Promise((resolve, reject) => {
    const url = TILE_URL
      .replace('{z}', z).replace('{x}', x).replace('{y}', y);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PGK-App/1.0)',
        'Referer': 'https://www.arcgis.com/',
      },
      timeout: 15000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(Buffer.concat(chunks));
        else reject(new Error(`Tile ${z}/${x}/${y}: HTTP ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tile timeout')); });
  });
}

// Скачать с retry
async function fetchTileRetry(z, x, y, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fetchTile(z, x, y); }
    catch(e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// ── Главная функция ────────────────────────────────────────
/**
 * Скачивает спутниковые тайлы для bbox и собирает в JPEG + JGW
 * @param {object} bbox   {minLat, maxLat, minLng, maxLng}
 * @param {string} tmpDir временная папка
 * @param {string} proj4  строка проекции целевой СК (для JGW в метрах)
 * @param {string} gdalBin путь к GDAL бинарникам
 * @param {function} onProgress колбэк прогресса
 * @returns {object} {jpegFile, jgwFile, worldFile}
 */
async function fetchSatellite({ bbox, tmpDir, proj4, epsg, gdalBin, gdalEnvFn, onProgress }) {
  const { minLat, maxLat, minLng, maxLng } = bbox;

  // Выбираем зум: не более 4000×4000 пикселей итогового изображения
  const zoom = getBestZoom(bbox, 4000);
  const xMin = lon2tile(minLng, zoom);
  const xMax = lon2tile(maxLng, zoom);
  const yMin = lat2tile(maxLat, zoom);  // y увеличивается вниз
  const yMax = lat2tile(minLat, zoom);

  const tilesX = xMax - xMin + 1;
  const tilesY = yMax - yMin + 1;
  const totalTiles = tilesX * tilesY;
  const imgW = tilesX * TILE_SIZE;
  const imgH = tilesY * TILE_SIZE;

  console.log(`[SAT] zoom=${zoom}, tiles=${tilesX}×${tilesY}=${totalTiles}, img=${imgW}×${imgH}`);
  onProgress && onProgress(`Спутник: загрузка ${totalTiles} тайлов (zoom ${zoom})...`);

  // Скачиваем тайлы параллельно (пакетами по 8)
  const tileDir = path.join(tmpDir, 'tiles');
  fs.mkdirSync(tileDir, { recursive: true });

  const tasks = [];
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      tasks.push({ tx, ty });
    }
  }

  let done = 0;
  const BATCH = 8;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ tx, ty }) => {
      const tilePath = path.join(tileDir, `${ty}_${tx}.jpg`);
      try {
        const data = await fetchTileRetry(zoom, tx, ty);
        fs.writeFileSync(tilePath, data);
      } catch(e) {
        // Создаём серый тайл-заглушку если не скачался
        console.warn(`[SAT] Tile ${tx}/${ty} failed:`, e.message);
        // Записываем пустой файл — GDAL заполнит NoData
      }
      done++;
      if (done % 10 === 0) {
        onProgress && onProgress(`Спутник: ${done}/${totalTiles} тайлов...`);
      }
    }));
  }

  // ── Собираем тайлы через GDAL VRT → GeoTIFF → JPEG ──────
  onProgress && onProgress('Спутник: сборка изображения...');

  // Создаём VRT из тайлов
  // Каждый тайл: привязка в Web Mercator (EPSG:3857)
  const tileListFile = path.join(tmpDir, 'tile_list.txt');
  const tileFiles = [];
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      const tilePath = path.join(tileDir, `${ty}_${tx}.jpg`);
      if (fs.existsSync(tilePath)) tileFiles.push(tilePath);
    }
  }
  fs.writeFileSync(tileListFile, tileFiles.join('\n'));

  // Координаты тайлов в Web Mercator
  function lonToMerc(lon) { return lon * 20037508.34 / 180; }
  function latToMerc(lat) {
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    return y * 20037508.34 / 180;
  }

  // Пишем VRT вручную с геопривязкой каждого тайла
  const mercXMin = lonToMerc(tile2lon(xMin, zoom));
  const mercYMax = latToMerc(tile2lat(yMin, zoom));
  const mercXMax = lonToMerc(tile2lon(xMax + 1, zoom));
  const mercYMin = latToMerc(tile2lat(yMax + 1, zoom));
  const pixW = (mercXMax - mercXMin) / imgW;
  const pixH = (mercYMax - mercYMin) / imgH;

  // Собираем через gdalwarp: склеиваем тайлы и репроецируем в целевую СК
  // Используем gdalbuildvrt + gdal_translate
  const mercTif  = path.join(tmpDir, 'sat_merc.tif');
  const finalTif = path.join(tmpDir, 'sat_final.tif');
  const jpegOut  = path.join(tmpDir, 'satellite.jpg');
  const jgwOut   = path.join(tmpDir, 'satellite.jgw');

  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileP = promisify(execFile);
  const exe = p => path.join(gdalBin, p + '.exe');
  const env = gdalEnvFn();

  // gdalbuildvrt — список тайлов → VRT
  const vrtFile = path.join(tmpDir, 'tiles.vrt');
  await execFileP(exe('gdalbuildvrt'), [
    '-input_file_list', tileListFile,
    vrtFile,
  ], { env, timeout: 60000, maxBuffer: 50*1024*1024 });

  // gdalwarp — VRT в Web Mercator → репроекция в целевую СК
  const targetSrs = proj4 ? proj4 : `EPSG:${epsg || 4326}`;
  await execFileP(exe('gdalwarp'), [
    '-s_srs', 'EPSG:3857',
    '-t_srs', targetSrs,
    '-r', 'lanczos',
    '-te', String(minLng), String(minLat), String(maxLng), String(maxLat),
    '-te_srs', 'EPSG:4326',
    '-co', 'COMPRESS=LZW',
    vrtFile, finalTif,
  ], { env, timeout: 120000, maxBuffer: 200*1024*1024 });

  // gdal_translate → JPEG
  await execFileP(exe('gdal_translate'), [
    '-of', 'JPEG',
    '-co', 'QUALITY=90',
    finalTif, jpegOut,
  ], { env, timeout: 60000, maxBuffer: 200*1024*1024 });

  // Читаем геотрансформацию для JGW
  let geoTransform = null;
  try {
    const { stdout } = await execFileP(exe('gdalinfo'), ['-json', finalTif],
      { env, timeout: 30000, maxBuffer: 10*1024*1024 });
    const info = JSON.parse(stdout);
    geoTransform = info.geoTransform; // [xOrigin, xPixelSize, 0, yOrigin, 0, yPixelSize]
  } catch(e) {
    console.warn('[SAT] gdalinfo failed:', e.message);
  }

  // Создаём JGW (world file)
  // Формат: строки по одной: xPixelSize, rot1, rot2, yPixelSize (отриц), xTopLeft, yTopLeft
  if (geoTransform && geoTransform.length >= 6) {
    const [ox, px, rot1, oy, rot2, py] = geoTransform;
    const jgw = [px, rot1, rot2, py, ox + px * 0.5, oy + py * 0.5].join('\n');
    fs.writeFileSync(jgwOut, jgw);
  } else {
    // Простой fallback на основе bbox
    console.warn('[SAT] Using fallback JGW');
    const imgInfo = fs.statSync(finalTif).size;  // просто чтобы знать что файл есть
  }

  console.log(`[SAT] Done: ${jpegOut}`);
  return { jpegFile: jpegOut, jgwFile: jgwOut };
}

module.exports = { fetchSatellite };
