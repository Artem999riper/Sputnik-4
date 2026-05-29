// ═══════════════════════════════════════════════════════════
// Профиль высот — рисуем линию, получаем график высот
// Источник: opentopodata.org SRTM 90м (бесплатно, ключ не нужен)
// ═══════════════════════════════════════════════════════════

let _epActive  = false;
let _epPts     = [];      // [L.LatLng, ...]
let _epLine    = null;    // L.polyline
let _epChart   = null;    // Chart.js instance
let _epMarker  = null;    // маркер позиции при ховере на графике
let _epSamples = [];      // [{lat,lng,distM}, ...] интерполированные точки

const ELEV_API = 'https://api.opentopodata.org/v1/srtm90m';

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

// ── Запрос высот ──────────────────────────────────────────
async function _epFetchElevations(samples) {
  const BATCH = 100;
  const elevs = [];
  for (let i = 0; i < samples.length; i += BATCH) {
    const batch = samples.slice(i, i + BATCH);
    const locs = batch.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
    const resp = await fetch(ELEV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: locs }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const j = await resp.json();
    if (!j.results) throw new Error('Нет данных в ответе');
    j.results.forEach(r => elevs.push(r.elevation ?? null));
    if (i + BATCH < samples.length) await new Promise(r => setTimeout(r, 1100)); // rate limit
  }
  return elevs;
}

// ── Основная функция построения ───────────────────────────
async function _epBuild() {
  _epSamples = _epInterpolate(_epPts, 150);
  _epShowPanel(null); // показать панель с лоадером

  let elevs;
  try {
    elevs = await _epFetchElevations(_epSamples);
  } catch(e) {
    document.getElementById('ep-loading').textContent =
      '⚠️ Сервис высот недоступен. Используйте 🏔 Рельеф для точных данных ArcticDEM.';
    console.error('[EP]', e);
    return;
  }

  const data = _epSamples.map((s, i) => ({ distM: s.distM, elev: elevs[i] }))
    .filter(d => d.elev !== null);

  _epShowPanel(data);
  _epRenderChart(data);
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
    `▼ ${minE} м &nbsp; ▲ ${maxE} м &nbsp;·&nbsp; ` +
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
          ticks: { font: { size: 10 }, color: '#6b7280', callback: v => v + ' м' },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
      onHover: (event, items) => {
        if (items.length && _epSamples.length) {
          const idx = items[0].index;
          const s = _epSamples[Math.min(idx, _epSamples.length - 1)];
          if (!s) return;
          const ll = L.latLng(s.lat, s.lng);
          if (_epMarker) {
            _epMarker.setLatLng(ll);
          } else {
            _epMarker = L.circleMarker(ll, {
              radius: 6, color: '#1a56db', fillColor: '#fff',
              fillOpacity: 1, weight: 2,
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
}
