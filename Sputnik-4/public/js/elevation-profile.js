// ═══════════════════════════════════════════════════════════
// Профиль высот — рисуем линию, получаем график высот
// Источник: AWS Terrarium Terrain-RGB (бесплатно, ключ не нужен)
// ═══════════════════════════════════════════════════════════

let _epActive       = false;
let _epPts          = [];   // [L.LatLng, ...]
let _epLine         = null; // L.polyline
let _epChart        = null; // Chart.js instance
let _epMarker       = null; // маркер позиции при ховере на графике
let _epSamples      = [];   // [{lat,lng,distM}, ...] интерполированные точки
let _epChartSamples = [];   // [{lat,lng,distM,elev}, ...] параллельно данным графика
let _epUnitLabel    = 'м';  // подпись единиц в тултипе графика (БСВ-77 / WGS84 элл.)
let _epWaterSpans   = [];   // [{i0,i1,distStart,distEnd,level}, ...] участки пересечения воды (OSM)
const _epWaterCache = new Map(); // bbox-ключ → массив колец [[lng,lat],...]

// ── Terrarium Terrain-RGB tiles (AWS, бесплатно, без ключа) ──
// elevation = R*256 + G + B/256 - 32768  (метры)
const _TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const _TERRARIUM_Z   = 10;   // ~152 м/пкс — достаточно для профиля
const _tileCache     = new Map();

function _latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y, z };
}

function _tilePixel(lat, lng, z, tileX, tileY) {
  const n = Math.pow(2, z);
  const px = (lng + 180) / 360 * n - tileX;
  const latRad = lat * Math.PI / 180;
  const py = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - tileY;
  return { px: Math.floor(px * 256), py: Math.floor(py * 256) };
}

async function _fetchTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (_tileCache.has(key)) return _tileCache.get(key);
  const url = _TERRARIUM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        resolve(ctx.getImageData(0, 0, 256, 256));
      } catch(e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _tileCache.set(key, promise);
  return promise;
}

async function _epFetchElevations(samples) {
  // Группируем точки по тайлам
  const tileGroups = new Map();
  samples.forEach((s, i) => {
    const { x, y, z } = _latLngToTile(s.lat, s.lng, _TERRARIUM_Z);
    const key = `${z}/${x}/${y}`;
    if (!tileGroups.has(key)) tileGroups.set(key, { z, x, y, indices: [] });
    tileGroups.get(key).indices.push(i);
  });

  const elevs = new Array(samples.length).fill(null);

  await Promise.all([...tileGroups.values()].map(async ({ z, x, y, indices }) => {
    const imageData = await _fetchTile(z, x, y);
    if (!imageData) return;
    indices.forEach(i => {
      const s = samples[i];
      const { px, py } = _tilePixel(s.lat, s.lng, z, x, y);
      const cx = Math.max(0, Math.min(255, px));
      const cy = Math.max(0, Math.min(255, py));
      const offset = (cy * 256 + cx) * 4;
      const R = imageData.data[offset];
      const G = imageData.data[offset + 1];
      const B = imageData.data[offset + 2];
      elevs[i] = R * 256 + G + B / 256 - 32768;
    });
  }));

  return elevs;
}

// ── Открыть инструмент ─────────────────────────────────────
function openElevationProfile() {
  const _panel = document.getElementById('ep-panel');
  if (_epActive || (_panel && _panel.classList.contains('open'))) { closeElevationProfile(); return; }
  _epActive = true;
  _epPts = [];
  if (_epLine) { try { map.removeLayer(_epLine); } catch(e) {} _epLine = null; }
  setTool('elev');
  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  if (bnr) {
    document.getElementById('bnr-t').textContent = 'Кликайте точки. Двойной клик или ПКМ — построить профиль.';
    bnr.className = 'show';
  }
  map.on('click',       _epClick);
  map.on('dblclick',    _epFinish);
  map.on('contextmenu', _epFinish);
  document.addEventListener('keydown', _epKeydown);
}

// ── Клик — добавить точку ──────────────────────────────────
function _epClick(e) {
  _epPts.push(e.latlng);
  _epRedrawLine();
}

function _epRedrawLine() {
  if (_epLine) { try { map.removeLayer(_epLine); } catch(e) {} }
  if (_epPts.length < 1) return;
  _epLine = L.polyline(_epPts, {
    color: '#f59e0b', weight: 2.5, dashArray: '6 4',
  }).addTo(map);
}

// ── Завершить рисование ────────────────────────────────────
function _epFinish(e) {
  if (e && e.originalEvent) e.originalEvent.preventDefault();
  _epActive = false;   // фаза рисования завершена; ПКМ снова работает
  map.off('click',       _epClick);
  map.off('dblclick',    _epFinish);
  map.off('contextmenu', _epFinish);
  document.removeEventListener('keydown', _epKeydown);
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) bnr.className = '';

  if (_epPts.length < 2) {
    toast('Нужно минимум 2 точки', 'err');
    _epActive = false;
    setTool('view');
    return;
  }
  _epBuild();
}

function _epKeydown(e) {
  if (e.key === 'Escape') {
    map.off('click',       _epClick);
    map.off('dblclick',    _epFinish);
    map.off('contextmenu', _epFinish);
    document.removeEventListener('keydown', _epKeydown);
    map.getContainer().style.cursor = '';
    const bnr = document.getElementById('bnr');
    if (bnr) bnr.className = '';
    _epActive = false;
    setTool('view');
    if (_epLine) { try { map.removeLayer(_epLine); } catch(e2) {} _epLine = null; }
  }
}

// ── Интерполяция точек вдоль линии ────────────────────────
function _epHaversineM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function _epInterpolate(pts, maxPoints) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = _epHaversineM(pts[i-1], pts[i]);
    segments.push({ from: pts[i-1], to: pts[i], dist: d });
    total += d;
  }
  const step = Math.max(30, total / maxPoints);
  const result = [];
  let cumDist = 0;
  result.push({ lat: pts[0].lat, lng: pts[0].lng, distM: 0 });
  let nextTarget = step;
  for (const seg of segments) {
    const steps = Math.ceil(seg.dist / step);
    for (let s = 1; s <= steps; s++) {
      const frac = s * step / seg.dist;
      if (frac > 1) break;
      const d = cumDist + s * step;
      if (d >= nextTarget - 0.1) {
        result.push({
          lat: seg.from.lat + frac * (seg.to.lat - seg.from.lat),
          lng: seg.from.lng + frac * (seg.to.lng - seg.from.lng),
          distM: d,
        });
        nextTarget += step;
      }
    }
    cumDist += seg.dist;
  }
  // Всегда добавить последнюю точку
  const last = pts[pts.length - 1];
  if (!result.length || result[result.length-1].distM < total - 1) {
    result.push({ lat: last.lat, lng: last.lng, distM: total });
  }
  return result;
}

// ── Поправка геоида (сервер) ──────────────────────────────
async function _epGetGeoidCorrection(lat, lng) {
  try {
    const r = await fetch(`/api/dem/geoid-n?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
    const j = await r.json();
    return (j && j.n != null) ? j.n : null;
  } catch(_) { return null; }
}

// ── Основная функция построения ───────────────────────────
async function _epBuild() {
  _epSamples = _epInterpolate(_epPts, 150);
  _epWaterSpans = [];
  _epShowPanel(null);

  // 1) Пробуем сервер (ArcticDEM + геоид — точнее Terrarium, без артефактов на воде)
  let serverElevs = null;
  let usedBsv77 = false;
  try {
    const r = await fetch('/api/elevation/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_epSamples.map(s => ({ lat: s.lat, lng: s.lng }))),
    });
    const j = await r.json();
    if (j && Array.isArray(j.values) && j.values.some(v => v != null)) {
      serverElevs = j.values;
      usedBsv77 = !!j.geoidApplied;   // честно: БСВ-77 только если поправка реально применена
    }
  } catch(_) {}

  if (serverElevs) {
    _epChartSamples = _epSamples
      .map((s, i) => {
        if (serverElevs[i] == null) return null;
        return { lat: s.lat, lng: s.lng, distM: s.distM, elev: serverElevs[i] };
      })
      .filter(Boolean);
    _epUnitLabel = usedBsv77 ? 'м БСВ-77' : 'м WGS84 элл.';
    _epShowPanel(_epChartSamples, usedBsv77);
    _epRenderChart(_epChartSamples);
    _epMarkWater(); // неблокирующий поиск уреза воды (OSM)
    return;
  }

  // 2) Fallback — Terrarium тайлы + поправка геоида
  let elevs;
  try {
    elevs = await _epFetchElevations(_epSamples);
  } catch(e) {
    document.getElementById('ep-loading').textContent = '⚠️ Ошибка загрузки высот. Проверьте соединение.';
    console.error('[EP]', e);
    return;
  }

  const mid = _epSamples[Math.floor(_epSamples.length / 2)];
  const geoidCorr = await _epGetGeoidCorrection(mid.lat, mid.lng);

  _epChartSamples = _epSamples
    .map((s, i) => {
      if (elevs[i] == null) return null;
      const raw = elevs[i];
      const isWater = geoidCorr != null && Math.abs(raw) < 2 && Math.abs(geoidCorr) > 10;
      const elev = isWater ? 0 : (geoidCorr != null ? raw + geoidCorr : raw);
      return { lat: s.lat, lng: s.lng, distM: s.distM, elev };
    })
    .filter(Boolean);

  _epUnitLabel = geoidCorr != null ? 'м БСВ-77' : 'м WGS84 элл.';
  _epShowPanel(_epChartSamples, geoidCorr != null);
  _epRenderChart(_epChartSamples);
  _epMarkWater(); // неблокирующий поиск уреза воды (OSM)
}

// ── Показать / обновить панель ────────────────────────────
function _epShowPanel(data, bsv77) {
  const panel = document.getElementById('ep-panel');
  if (!panel) return;
  panel.classList.add('open');

  const loading = document.getElementById('ep-loading');
  const canvas  = document.getElementById('ep-canvas');
  const stats   = document.getElementById('ep-stats');

  if (!data) {
    loading.style.display = 'block';
    loading.textContent = '⏳ Загрузка высот…';
    canvas.style.display = 'none';
    stats.innerHTML = '';
    return;
  }

  loading.style.display = 'none';
  canvas.style.display = 'block';

  if (data.length === 0) { stats.innerHTML = 'Нет данных'; return; }

  const totalKm = (data[data.length-1].distM / 1000).toFixed(2);
  const elevValues = data.map(d => d.elev).filter(v => v != null);
  const minE = Math.min(...elevValues).toFixed(0);
  const maxE = Math.max(...elevValues).toFixed(0);
  let gain = 0, loss = 0;
  for (let i = 1; i < data.length; i++) {
    const d = data[i].elev - data[i-1].elev;
    if (d > 0) gain += d; else loss -= d;
  }
  const datum = bsv77 ? 'БСВ-77' : 'WGS84 элл.';
  stats.innerHTML =
    `<b>${totalKm} км</b> &nbsp;·&nbsp; ` +
    `▼ ${minE} &nbsp; ▲ ${maxE} м ${datum} &nbsp;·&nbsp; ` +
    `<span style="color:#16a34a">+${gain.toFixed(0)}</span> / ` +
    `<span style="color:#dc2626">-${loss.toFixed(0)}</span> м`;
}

// ── Chart.js ──────────────────────────────────────────────
function _epChartMove(e) {
  if (!_epChart || !_epChartSamples.length) return;
  const items = _epChart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
  if (!items.length) return;
  const idx = Math.min(items[0].index, _epChartSamples.length - 1);
  const s = _epChartSamples[idx];
  const ll = L.latLng(s.lat, s.lng);
  if (_epMarker) {
    _epMarker.setLatLng(ll);
  } else {
    _epMarker = L.circleMarker(ll, {
      radius: 8, color: '#e02424', fillColor: '#fff', fillOpacity: 1, weight: 3,
    }).addTo(map);
  }
}
function _epChartLeave() {
  if (_epMarker) { try { map.removeLayer(_epMarker); } catch(e2) {} _epMarker = null; }
}

function _epRenderChart(data) {
  const canvas = document.getElementById('ep-canvas');
  // Удалить старые слушатели
  canvas.removeEventListener('mousemove', _epChartMove);
  canvas.removeEventListener('mouseleave', _epChartLeave);

  const ctx = canvas.getContext('2d');
  if (_epChart) { _epChart.destroy(); _epChart = null; }

  const labels = data.map(d => d.distM < 1000
    ? Math.round(d.distM) + ' м'
    : (d.distM / 1000).toFixed(2) + ' км');
  const values = data.map(d => d.elev);

  // Плагин-оверлей: ориентировочный урез воды по участкам OSM
  const waterOverlay = {
    id: 'epWaterOverlay',
    afterDatasetsDraw(chart) {
      if (!_epWaterSpans.length) return;
      const { ctx: c, chartArea: ca, scales } = chart;
      const xS = scales.x, yS = scales.y;
      if (!xS || !yS) return;
      c.save();
      c.beginPath();
      c.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
      c.clip();
      for (const sp of _epWaterSpans) {
        const x0 = xS.getPixelForValue(sp.i0);
        const x1 = xS.getPixelForValue(sp.i1);
        const y  = yS.getPixelForValue(sp.level);
        // полупрозрачная заливка участка
        c.fillStyle = 'rgba(14,165,233,0.15)';
        c.fillRect(x0, ca.top, Math.max(2, x1 - x0), ca.bottom - ca.top);
        // линия уреза
        c.strokeStyle = '#0ea5e9';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x0, y);
        c.lineTo(x1, y);
        c.stroke();
        // подпись
        c.fillStyle = '#0369a1';
        c.font = '600 10px sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'bottom';
        c.fillText(`урез ${sp.level.toFixed(1)}`, x0 + 2, y - 2);
      }
      c.restore();
    },
  };

  _epChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        fill: true,
        borderColor: '#1a56db',
        backgroundColor: 'rgba(26,86,219,0.12)',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
      }],
    },
    plugins: [waterOverlay],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => `${ctx.raw != null ? ctx.raw.toFixed(0) : '—'} ${_epUnitLabel}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#6b7280' },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          ticks: { font: { size: 10 }, color: '#6b7280', callback: v => v + ' м' },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
    },
  });

  // Используем нативные события — нет мигания от Chart.js onHover
  canvas.addEventListener('mousemove', _epChartMove);
  canvas.addEventListener('mouseleave', _epChartLeave);
}

// ── Отметка высоты по ПКМ ─────────────────────────────────
let _elevPopup = null;

async function showElevationAtPoint(latlng) {
  if (_elevPopup) { _elevPopup.remove(); _elevPopup = null; }

  _elevPopup = L.popup({ closeButton: true, autoClose: false, closeOnClick: false, className: 'elev-popup' })
    .setLatLng(latlng)
    .setContent('<div class="popup" style="min-width:130px"><div class="popup-n">📍 Высота поверхности</div><div style="padding:4px 0;color:var(--tx2)">⏳ Загрузка…</div></div>')
    .openOn(map);

  // Пробуем сервер (ArcticDEM + БСВ-77)
  let elevation = null, label = '', src = '';
  try {
    const resp = await fetch(`/api/elevation/point?lat=${latlng.lat.toFixed(7)}&lng=${latlng.lng.toFixed(7)}`);
    const j = await resp.json();
    if (j.elevation != null) {
      elevation = j.elevation;
      label = j.datum === 'bsv77' ? 'м БСВ-77 (ArcticDEM 2м)' : 'м WGS84 (ArcticDEM)';
      src = 'arcticdem';
    }
  } catch(_) {}

  // Fallback — Terrarium тайлы + поправка геоида от сервера
  if (elevation == null) {
    try {
      const { x, y, z } = _latLngToTile(latlng.lat, latlng.lng, 12);
      const imageData = await _fetchTile(z, x, y);
      if (imageData) {
        const { px, py } = _tilePixel(latlng.lat, latlng.lng, z, x, y);
        const cx = Math.max(0, Math.min(255, px)), cy = Math.max(0, Math.min(255, py));
        const off = (cy * 256 + cx) * 4;
        const R = imageData.data[off], G = imageData.data[off+1], B = imageData.data[off+2];
        const rawElev = R * 256 + G + B / 256 - 32768;
        // Поправка геоида: Terrarium выше 60°N хранит эллипсоидальные высоты.
        // Исключение: водные пиксели Terrarium кодируются как ~0 м (ортометр. уровень воды),
        // а не как эллипсоидальная высота. Если rawElev≈0 при большой поправке — водный объект:
        // применять поправку некорректно (0_ортом + N ≠ реальная BSV-77 высоты воды).
        const geoidN = await _epGetGeoidCorrection(latlng.lat, latlng.lng);
        const isWaterPx = geoidN != null && Math.abs(rawElev) < 2 && Math.abs(geoidN) > 10;
        if (geoidN != null && !isWaterPx) {
          elevation = rawElev + geoidN;
          label = 'м БСВ-77';
        } else if (isWaterPx) {
          elevation = 0;
          label = 'м (уровень воды)';
        } else {
          elevation = rawElev;
          label = 'м (WGS84 элл.)';
        }
        src = 'terrarium';
      }
    } catch(_) {}
  }

  if (elevation == null) {
    _elevPopup.setContent('<div class="popup"><div class="popup-n">⚠️ Нет данных</div></div>');
    return;
  }

  const elevStr = elevation.toFixed(1);
  const coordStr = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  _elevPopup.setContent(`
    <div class="popup" style="min-width:140px">
      <div class="popup-n">📍 Высота поверхности</div>
      <div style="font-size:16px;font-weight:800;color:var(--acc);margin:5px 0 2px">${elevStr} ${label}</div>
      <div class="popup-s">${coordStr}</div>
    </div>
  `);
}

// ── Закрыть ───────────────────────────────────────────────
function closeElevationProfile() {
  _epActive = false;
  map.off('click',       _epClick);
  map.off('dblclick',    _epFinish);
  map.off('contextmenu', _epFinish);
  document.removeEventListener('keydown', _epKeydown);
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr');
  if (bnr) bnr.className = '';

  if (_epLine)   { try { map.removeLayer(_epLine);   } catch(e) {} _epLine = null; }
  if (_epMarker) { try { map.removeLayer(_epMarker); } catch(e) {} _epMarker = null; }
  if (_epChart)  {
    const cv = document.getElementById('ep-canvas');
    if (cv) { cv.removeEventListener('mousemove', _epChartMove); cv.removeEventListener('mouseleave', _epChartLeave); }
    _epChart.destroy(); _epChart = null;
  }

  const panel = document.getElementById('ep-panel');
  if (panel) panel.classList.remove('open');
  setTool('view');
  _epPts = [];
  _epSamples = [];
  _epChartSamples = [];
  _epWaterSpans = [];
}

// ═══════════════════════════════════════════════════════════
// УРЕЗ ВОДЫ — ориентировочная отметка по данным OSM (Overpass)
// ═══════════════════════════════════════════════════════════

// ── Запрос водных полигонов OSM в области трассы ───────────
async function _epFetchWaterPolygons(samples) {
  if (!samples || samples.length < 2) return [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const s of samples) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lng < minLng) minLng = s.lng;
    if (s.lng > maxLng) maxLng = s.lng;
  }
  const pad = 0.003; // ~300 м запас, чтобы захватить берег
  minLat -= pad; maxLat += pad; minLng -= pad; maxLng += pad;
  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;

  const key = bbox;
  if (_epWaterCache.has(key)) return _epWaterCache.get(key);

  const query =
    `[out:json][timeout:25];` +
    `(` +
      `way["natural"="water"](${bbox});` +
      `way["landuse"="reservoir"](${bbox});` +
      `way["waterway"="riverbank"](${bbox});` +
      `way["water"](${bbox});` +
    `);` +
    `out geom;`;

  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!r.ok) throw new Error('overpass ' + r.status);
    const j = await r.json();
    const rings = [];
    for (const el of (j.elements || [])) {
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        rings.push(el.geometry.map(g => [g.lon, g.lat]));
      }
    }
    _epWaterCache.set(key, rings);
    return rings;
  } catch (e) {
    console.warn('[EP water] Overpass недоступен:', e.message);
    return [];
  }
}

// ── Точка внутри кольца (ray casting), [lng,lat] ──────────
function _epPointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xk = ring[k][0], yk = ring[k][1];
    const intersect = ((yi > lat) !== (yk > lat)) &&
      (lng < (xk - xi) * (lat - yi) / ((yk - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Сгруппировать непрерывные «водные» участки ────────────
function _epComputeWaterSpans(rings) {
  const spans = [];
  if (!rings.length || !_epChartSamples.length) return spans;

  const flags = _epChartSamples.map(s =>
    rings.some(ring => _epPointInRing(s.lng, s.lat, ring)));

  let i = 0;
  while (i < flags.length) {
    if (!flags[i]) { i++; continue; }
    let j = i;
    while (j + 1 < flags.length && flags[j + 1]) j++;
    // медиана высот участка — устойчивая оценка уровня воды
    const elevs = _epChartSamples.slice(i, j + 1).map(s => s.elev).sort((a, b) => a - b);
    const level = elevs[Math.floor(elevs.length / 2)];
    spans.push({
      i0: i, i1: j,
      distStart: _epChartSamples[i].distM,
      distEnd:   _epChartSamples[j].distM,
      level,
    });
    i = j + 1;
  }
  return spans;
}

// ── Найти воду и обновить график/статистику ───────────────
async function _epMarkWater() {
  const rings = await _epFetchWaterPolygons(_epChartSamples);
  // Профиль мог быть перестроен/закрыт, пока шёл запрос
  if (!_epChartSamples.length) return;
  _epWaterSpans = _epComputeWaterSpans(rings);
  if (!_epWaterSpans.length) return;
  _epRenderChart(_epChartSamples);
  const stats = document.getElementById('ep-stats');
  if (stats && !/пересеч\. воды/.test(stats.innerHTML)) {
    stats.innerHTML += ` &nbsp;·&nbsp; <span style="color:#0ea5e9">🌊 ${_epWaterSpans.length} пересеч. воды</span>`;
  }
}

// ═══════════════════════════════════════════════════════════
// ЭКСПОРТ ПРОФИЛЯ В DXF
// ═══════════════════════════════════════════════════════════

const _EP_WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const _EP_MSK_Z3 = '+proj=tmerc +lat_0=0 +lon_0=66.05 +k=1 +x_0=3500000 +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs';
const _EP_MSK_Z4 = '+proj=tmerc +lat_0=0 +lon_0=72.05 +k=1 +x_0=4500000 +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs';

function _epToCRS(lat, lng, crs) {
  if (crs === 'wgs84') return { x: lng, y: lat };
  if (crs === 'gsk2011') {
    const r = wgsToGsk(lat, lng);
    return { x: r.easting, y: r.northing };
  }
  if (crs === 'msk86_z3') {
    const [x, y] = proj4(_EP_WGS84, _EP_MSK_Z3, [lng, lat]);
    return { x, y };
  }
  if (crs === 'msk86_z4') {
    const [x, y] = proj4(_EP_WGS84, _EP_MSK_Z4, [lng, lat]);
    return { x, y };
  }
  // msk86 — auto zone
  const r = wgsToMsk(lat, lng);
  return { x: r.easting, y: r.northing };
}

function _epBuildDXF({ samples, crs, step, mh, mv, waterSpans }) {
  waterSpans = waterSpans || [];
  const vex = mh / mv;
  const G = (code, val) => code.toString().padStart(3, ' ') + '\n' + val + '\n';

  // ── CRS coordinates for plan ────────────────────────────
  const crsPts = samples.map(s => _epToCRS(s.lat, s.lng, crs));

  // Linearly interpolate CRS position and elevation at chainage sd
  const interpAt = (sd) => {
    if (sd <= samples[0].distM) return { x: crsPts[0].x, y: crsPts[0].y, elev: samples[0].elev };
    const last = samples.length - 1;
    if (sd >= samples[last].distM) return { x: crsPts[last].x, y: crsPts[last].y, elev: samples[last].elev };
    for (let i = 0; i < last; i++) {
      if (samples[i].distM <= sd && samples[i+1].distM >= sd) {
        const frac = (sd - samples[i].distM) / (samples[i+1].distM - samples[i].distM);
        return {
          x:    crsPts[i].x     + frac * (crsPts[i+1].x     - crsPts[i].x),
          y:    crsPts[i].y     + frac * (crsPts[i+1].y     - crsPts[i].y),
          elev: samples[i].elev + frac * (samples[i+1].elev  - samples[i].elev),
        };
      }
    }
    return { x: crsPts[last].x, y: crsPts[last].y, elev: samples[last].elev };
  };
  // Unit tangent direction at chainage sd (for perpendicular tick)
  const dirAt = (sd) => {
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].distM <= sd && samples[i+1].distM >= sd) {
        const dx = crsPts[i+1].x - crsPts[i].x, dy = crsPts[i+1].y - crsPts[i].y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        return { tx: dx/len, ty: dy/len };
      }
    }
    const last = samples.length - 1;
    const dx = crsPts[last].x - crsPts[last-1].x, dy = crsPts[last].y - crsPts[last-1].y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    return { tx: dx/len, ty: dy/len };
  };

  // ── Elevation stats ─────────────────────────────────────
  const elevs   = samples.map(s => s.elev);
  const minElev = Math.min(...elevs);
  const maxElev = Math.max(...elevs);
  const elevRange = maxElev - minElev || 1;
  const totalDist = samples.at(-1).distM;

  // ── Auto grid step for elevation ────────────────────────
  const rawGrid = elevRange / 6;
  const gridStep = [1, 2, 5, 10, 25, 50, 100, 250, 500].find(v => v >= rawGrid) || 100;

  // ── Adaptive text height (≈6% of station step) ──────────
  const textH = step * 0.06;
  const tickLen = step * 0.04;

  // ── Profile block origin (below entire trasse bounding box) ─
  const profGap = elevRange * vex * 2.0;
  const ox   = crsPts[0].x;
  const minY = Math.min(...crsPts.map(p => p.y));
  const oy   = minY - profGap;

  let s = '';

  // ── HEADER ────────────────────────────────────────────
  s += G(0,'SECTION') + G(2,'HEADER');
  s += G(9,'$ACADVER')  + G(1,'AC1009');
  s += G(9,'$INSUNITS') + G(70,'6');
  s += G(9,'$TEXTSIZE') + G(40, textH.toFixed(3));
  s += G(0,'ENDSEC');

  // ── TABLES ────────────────────────────────────────────
  s += G(0,'SECTION') + G(2,'TABLES');

  // LTYPE
  s += G(0,'TABLE') + G(2,'LTYPE') + G(70,'2');
  s += G(0,'LTYPE') + G(2,'CONTINUOUS') + G(70,'64') + G(3,'Solid') + G(72,'65') + G(73,'0') + G(40,'0.000');
  s += G(0,'LTYPE') + G(2,'DASHED')     + G(70,'64') + G(3,'Dashed')+ G(72,'65') + G(73,'2') + G(40,'0.375') + G(49,'0.25') + G(49,'-0.125');
  s += G(0,'ENDTAB');

  // LAYER
  const layerDefs = [
    { name: 'ТРАССА',  color: 5, lt: 'CONTINUOUS' },
    { name: 'ПИКЕТЫ',  color: 2, lt: 'CONTINUOUS' },
    { name: 'ПРОФИЛЬ', color: 3, lt: 'CONTINUOUS' },
    { name: 'СЕТКА',   color: 8, lt: 'DASHED'     },
    { name: 'ПОДПИСИ', color: 2, lt: 'CONTINUOUS' },
    { name: 'УРЕЗ_ВОДЫ', color: 4, lt: 'CONTINUOUS' },
  ];
  s += G(0,'TABLE') + G(2,'LAYER') + G(70, String(layerDefs.length));
  for (const l of layerDefs) {
    s += G(0,'LAYER') + G(2,l.name) + G(70,'0') + G(62,String(l.color)) + G(6,l.lt);
  }
  s += G(0,'ENDTAB');

  // STYLE
  s += G(0,'TABLE') + G(2,'STYLE') + G(70,'1');
  s += G(0,'STYLE') + G(2,'STANDARD') + G(70,'0') + G(40,'0.000') + G(41,'1.000')
     + G(50,'0.0') + G(71,'0') + G(42, textH.toFixed(3)) + G(3,'txt') + G(4,'');
  s += G(0,'ENDTAB');

  s += G(0,'ENDSEC');

  // ── ENTITIES ─────────────────────────────────────────
  s += G(0,'SECTION') + G(2,'ENTITIES');

  const emitText = (x, y, txt, layer, color, h, angle, align) => {
    const xs = x.toFixed(3), ys = y.toFixed(3);
    return G(0,'TEXT') + G(8,layer) + G(62,String(color))
         + G(10,xs) + G(20,ys) + G(30,'0.000')
         + G(40,(h||textH).toFixed(3)) + G(1,txt)
         + G(50,(angle||0).toFixed(1)) + G(72,String(align||0))
         + G(11,xs) + G(21,ys) + G(31,'0.000');
  };
  const emitLine = (x1,y1,x2,y2,layer,color) =>
    G(0,'LINE') + G(8,layer) + G(62,String(color))
    + G(10,x1.toFixed(3)) + G(20,y1.toFixed(3)) + G(30,'0.000')
    + G(11,x2.toFixed(3)) + G(21,y2.toFixed(3)) + G(31,'0.000');

  // ── ТРАССА: route polyline in CRS ──────────────────
  s += G(0,'POLYLINE') + G(8,'ТРАССА') + G(62,'5') + G(66,'1') + G(70,'0')
     + G(10,'0.000') + G(20,'0.000') + G(30,'0.000');
  for (const p of crsPts) {
    s += G(0,'VERTEX') + G(8,'ТРАССА') + G(62,'5')
       + G(10,p.x.toFixed(3)) + G(20,p.y.toFixed(3)) + G(30,'0.000') + G(70,'0');
  }
  s += G(0,'SEQEND') + G(8,'ТРАССА');

  // ── ПИКЕТЫ: station ticks + labels ─────────────────
  // Build list of station distances
  const stationDists = [];
  for (let d = 0; d <= totalDist + 1; d += step) stationDists.push(Math.min(d, totalDist));
  if (stationDists.at(-1) < totalDist) stationDists.push(totalDist);

  for (const sd of stationDists) {
    const { x: px, y: py, elev: stationElev } = interpAt(sd);
    const { tx, ty } = dirAt(sd);
    const nx = -ty, ny = tx; // perpendicular-left normal

    // Tick mark on plan
    s += emitLine(px + nx*tickLen, py + ny*tickLen, px - nx*tickLen, py - ny*tickLen, 'ПИКЕТЫ', 2);

    // Label: "ПКx" or "ПКx+yyy"
    const pk = Math.floor(sd / 1000);
    const rem = Math.round(sd % 1000);
    const label = rem === 0 ? `ПК${pk}` : `ПК${pk}+${String(rem).padStart(3, '0')}`;
    s += emitText(px + nx * tickLen * 2.5, py + ny * tickLen * 2.5,
                  label, 'ПИКЕТЫ', 2, textH, 0, 1);
    s += emitText(px + nx * tickLen * 2.5, py + ny * tickLen * 2.5 + textH * 1.4,
                  stationElev.toFixed(1) + ' м', 'ПОДПИСИ', 2, textH * 0.75, 0, 1);

    // Profile section: vertical grid line + labels
    const profX    = ox + sd;
    const profYbot = oy;
    const profYtop = oy + elevRange * vex * 1.1;
    s += emitLine(profX, profYbot, profX, profYtop, 'СЕТКА', 8);
    s += emitText(profX, profYbot - textH * 1.5, label, 'ПИКЕТЫ', 2, textH, 0, 1);
    s += emitText(profX, profYbot + (stationElev - minElev) * vex + textH * 0.6,
                  stationElev.toFixed(1), 'ПОДПИСИ', 2, textH * 0.8, 90, 0);
  }

  // ── ПРОФИЛЬ: cross-section curve ───────────────────
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    const ax = ox + a.distM, ay = oy + (a.elev - minElev) * vex;
    const bx = ox + b.distM, by = oy + (b.elev - minElev) * vex;
    s += emitLine(ax, ay, bx, by, 'ПРОФИЛЬ', 3);
  }
  // Baseline
  s += emitLine(ox, oy, ox + totalDist, oy, 'ПРОФИЛЬ', 3);

  // ── УРЕЗ_ВОДЫ: ориентировочный уровень воды (OSM) ──
  for (const sp of waterSpans) {
    const wy = oy + (sp.level - minElev) * vex;
    // линия уреза в блоке профиля
    s += emitLine(ox + sp.distStart, wy, ox + sp.distEnd, wy, 'УРЕЗ_ВОДЫ', 4);
    // подпись над серединой участка
    const wmid = ox + (sp.distStart + sp.distEnd) / 2;
    s += emitText(wmid, wy + textH * 0.4, `Урез ${sp.level.toFixed(1)}`, 'УРЕЗ_ВОДЫ', 4, textH * 0.8, 0, 1);
    // подсветка пересечения на трассе (план)
    const i0 = Math.max(0, sp.i0|0), i1 = Math.min(crsPts.length - 1, sp.i1|0);
    if (i1 > i0) {
      s += G(0,'POLYLINE') + G(8,'УРЕЗ_ВОДЫ') + G(62,'4') + G(66,'1') + G(70,'0')
         + G(10,'0.000') + G(20,'0.000') + G(30,'0.000');
      for (let i = i0; i <= i1; i++) {
        s += G(0,'VERTEX') + G(8,'УРЕЗ_ВОДЫ') + G(62,'4')
           + G(10,crsPts[i].x.toFixed(3)) + G(20,crsPts[i].y.toFixed(3)) + G(30,'0.000') + G(70,'0');
      }
      s += G(0,'SEQEND') + G(8,'УРЕЗ_ВОДЫ');
    }
  }

  // ── СЕТКА: horizontal elevation grid ───────────────
  const gridStart = Math.floor(minElev / gridStep) * gridStep;
  const gridEnd   = Math.ceil(maxElev / gridStep) * gridStep;
  for (let e = gridStart; e <= gridEnd; e += gridStep) {
    const gy = oy + (e - minElev) * vex;
    s += emitLine(ox, gy, ox + totalDist, gy, 'СЕТКА', 8);
    // Elevation label on left
    s += emitText(ox - textH * 0.5, gy, `${e} м`, 'ПОДПИСИ', 2, textH * 0.8, 0, 2);
  }

  // ── ПОДПИСИ: title & datum ─────────────────────────
  const crsLabel = { wgs84:'WGS-84', msk86:'МСК-86', msk86_z3:'МСК-86 з.3', msk86_z4:'МСК-86 з.4', gsk2011:'ГСК-2011' }[crs] || crs;
  const datum = _epUnitLabel || 'м';
  const totalKm = (totalDist / 1000).toFixed(2);
  s += emitText(ox, crsPts[0].y + textH * 3,
    `Продольный профиль | ${totalKm} км | ${datum} | ${crsLabel} | М гор 1:${mh} | М верт 1:${mv} | увел. ${vex.toFixed(1)}×`,
    'ПОДПИСИ', 2, textH * 0.9, 0, 0);

  // ── Scale labels beside profile (rotated 90°, left margin) ─
  // Elevation grid labels sit at ox − 0.5·textH (right-aligned); leave gap
  const scaleMidY = oy + elevRange * vex * 0.5;
  s += emitText(ox - textH * 5.5, scaleMidY,
    `М гор 1:${mh}`, 'ПОДПИСИ', 2, textH * 0.85, 90, 1);
  s += emitText(ox - textH * 7.5, scaleMidY,
    `М верт 1:${mv}`, 'ПОДПИСИ', 2, textH * 0.85, 90, 1);
  // Exaggeration factor below the baseline, under station labels
  s += emitText(ox, oy - textH * 4.5,
    `Увел. верт. ×${vex.toFixed(1)}`, 'ПОДПИСИ', 2, textH * 0.75, 0, 0);

  s += G(0,'ENDSEC');
  s += G(0,'EOF');
  return s;
}

function _epShowExportModal() {
  return new Promise(resolve => {
    const body = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="font-weight:600;margin-bottom:6px">Система координат (трасса)</div>
          <label style="display:block;padding:2px 0"><input type="radio" name="ep-crs" value="msk86" checked> МСК-86 (авто зона)</label>
          <label style="display:block;padding:2px 0"><input type="radio" name="ep-crs" value="msk86_z3"> МСК-86 Зона 3 (ЦМ=66°)</label>
          <label style="display:block;padding:2px 0"><input type="radio" name="ep-crs" value="msk86_z4"> МСК-86 Зона 4 (ЦМ=72°)</label>
          <label style="display:block;padding:2px 0"><input type="radio" name="ep-crs" value="gsk2011"> ГСК-2011</label>
          <label style="display:block;padding:2px 0"><input type="radio" name="ep-crs" value="wgs84"> WGS-84 (градусы)</label>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:4px">Шаг пикетов, м</div>
            <input id="ep-step" type="number" min="10" step="10" value="100"
              style="width:100%;font-size:12px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          </div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:4px">Масштаб гориз. 1:</div>
            <input id="ep-mh" type="number" min="100" step="100" value="5000"
              style="width:100%;font-size:12px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          </div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:4px">Масштаб верт. 1:</div>
            <input id="ep-mv" type="number" min="10" step="10" value="500"
              style="width:100%;font-size:12px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
          </div>
        </div>
      </div>`;
    showModal('📐 Экспорт профиля в DXF', body, [
      { label: 'Отмена', cls: 'bs', fn: () => { closeModal(); resolve(null); } },
      { label: 'Скачать DXF', cls: 'bp', fn: () => {
        const crs  = document.querySelector('input[name="ep-crs"]:checked')?.value || 'msk86';
        const step = Math.max(10,  parseInt(document.getElementById('ep-step').value, 10) || 100);
        const mh   = Math.max(100, parseInt(document.getElementById('ep-mh').value,   10) || 5000);
        const mv   = Math.max(10,  parseInt(document.getElementById('ep-mv').value,    10) || 500);
        closeModal(); resolve({ crs, step, mh, mv });
      }},
    ]);
  });
}

async function exportProfileDXF() {
  if (!_epChartSamples.length) { toast('Сначала постройте профиль', 'err'); return; }
  const opts = await _epShowExportModal();
  if (!opts) return;
  try {
    const dxf = _epBuildDXF({ samples: _epChartSamples, ...opts, waterSpans: _epWaterSpans });
    const totalKm = (_epChartSamples.at(-1).distM / 1000).toFixed(1);
    _dxfDownload(dxf, `профиль_${totalKm}км.dxf`);
    toast('DXF профиля скачан', 'ok');
  } catch (e) {
    console.error('[EP DXF]', e);
    toast('Ошибка построения DXF', 'err');
  }
}
