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
  if (_epActive) { closeElevationProfile(); return; }
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

// ── Основная функция построения ───────────────────────────
async function _epBuild() {
  _epSamples = _epInterpolate(_epPts, 150);
  _epShowPanel(null); // показать панель с лоадером

  let elevs;
  try {
    elevs = await _epFetchElevations(_epSamples);
  } catch(e) {
    document.getElementById('ep-loading').textContent = '⚠️ Ошибка загрузки высот. Проверьте соединение.';
    console.error('[EP]', e);
    return;
  }

  _epChartSamples = _epSamples
    .map((s, i) => ({ lat: s.lat, lng: s.lng, distM: s.distM, elev: elevs[i] }))
    .filter(d => d.elev !== null);

  _epShowPanel(_epChartSamples);
  _epRenderChart(_epChartSamples);
}

// ── Показать / обновить панель ────────────────────────────
function _epShowPanel(data) {
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
  stats.innerHTML =
    `<b>${totalKm} км</b> &nbsp;·&nbsp; ` +
    `▼ ${minE} м &nbsp; ▲ ${maxE} м БСВ-77 &nbsp;·&nbsp; ` +
    `<span style="color:#16a34a">+${gain.toFixed(0)}</span> / ` +
    `<span style="color:#dc2626">-${loss.toFixed(0)}</span> м`;
}

// ── Chart.js ──────────────────────────────────────────────
function _epRenderChart(data) {
  const ctx = document.getElementById('ep-canvas').getContext('2d');
  if (_epChart) { _epChart.destroy(); _epChart = null; }

  const labels = data.map(d => d.distM < 1000
    ? Math.round(d.distM) + ' м'
    : (d.distM / 1000).toFixed(2) + ' км');
  const values = data.map(d => d.elev);

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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => `${ctx.raw != null ? ctx.raw.toFixed(0) : '—'} м`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 8,
            font: { size: 10 },
            color: '#6b7280',
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          ticks: { font: { size: 10 }, color: '#6b7280', callback: v => v + ' м БСВ' },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
      onHover: (event, items) => {
        if (items.length && _epChartSamples.length) {
          const idx = Math.min(items[0].index, _epChartSamples.length - 1);
          const s = _epChartSamples[idx];
          if (!s) return;
          const ll = L.latLng(s.lat, s.lng);
          if (_epMarker) {
            _epMarker.setLatLng(ll);
          } else {
            _epMarker = L.circleMarker(ll, {
              radius: 8, color: '#e02424', fillColor: '#fff',
              fillOpacity: 1, weight: 3,
            }).addTo(map);
          }
        } else {
          if (_epMarker) { try { map.removeLayer(_epMarker); } catch(e) {} _epMarker = null; }
        }
      },
    },
  });
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
  if (_epChart)  { _epChart.destroy(); _epChart = null; }

  const panel = document.getElementById('ep-panel');
  if (panel) panel.classList.remove('open');
  setTool('view');
  _epPts = [];
  _epSamples = [];
  _epChartSamples = [];
}
