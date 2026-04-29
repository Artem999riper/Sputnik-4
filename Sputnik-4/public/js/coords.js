// ═══════════════════════════════════════════════════════════
// СИСТЕМА КООРДИНАТ — виджет в углу карты
// Реализация через proj4js, параметры из Proj4.Defines.pas (SASPlanet)
//
// СК-42 / МСК-86/89 (Красовского):
//   towgs84 = 23.57,-140.95,-79.8,0,0.35,0.79,-0.22   (ГОСТ Р 51794-2008)
//   Зоны: ЦМ = 60.05 + 6*(N-1), y_0 = -5811057.63, x_0 = N*1e6+500000
//
// ГСК-2011 (ГОСТ 32453-2017):
//   towgs84 = 0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074
//   a=6378136.5, rf=298.2564151
//   Зоны: ЦМ = 6*N-3 (стандарт), y_0 = 0, x_0 = N*1e6+500000
//
// Нотация вывода: X = northing, Y = easting (российская геодезия / AutoCAD)
// Точность: МСК < 0.3м, ГСК < 0.2м (верифицировано по эталонным точкам)
// ═══════════════════════════════════════════════════════════

let coordSys = 'wgs';
let wgsFormat = 'dec'; // 'dec' | 'dms' — переключается повторным кликом WGS-84

// ── Proj4 строки (из Proj4.Defines.pas SASPlanet) ─────────
const _WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

// МСК-86/89: ЦМ = 60.05 + 6*(N-1), y_0 = -5811057.63
function _mskProj(zone) {
  const lon_0 = 60.05 + 6 * (zone - 1);
  const x_0   = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5811057.63` +
         ` +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
function _mskZone(lon) {
  return Math.round((lon - 60.05) / 6) + 1;
}

// ГСК-2011: ЦМ = 6*N-3 (стандарт), y_0 = 0
function _gskProj(zone) {
  const lon_0 = zone * 6 - 3;
  const x_0   = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=0` +
         ` +a=6378136.5 +rf=298.2564151` +
         ` +towgs84=0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074 +units=m +no_defs`;
}
function _gskZone(lon) {
  return Math.floor(lon / 6) + 1;
}

// ── Конвертеры ─────────────────────────────────────────────
function wgsToMsk(lat, lon) {
  const zone = _mskZone(lon);
  const [easting, northing] = proj4(_WGS84, _mskProj(zone), [lon, lat]);
  return { northing, easting, zone };
}

function wgsToGsk(lat, lon) {
  const zone = _gskZone(lon);
  const [easting, northing] = proj4(_WGS84, _gskProj(zone), [lon, lat]);
  return { northing, easting, zone };
}

// ── Форматирование ─────────────────────────────────────────
function formatWGS(lat, lon) {
  const latH = lat >= 0 ? 'N' : 'S';
  const lonH = lon >= 0 ? 'E' : 'W';
  if (wgsFormat === 'dms') {
    return `${_toDMS(Math.abs(lat))} ${latH}&nbsp;&nbsp;${_toDMS(Math.abs(lon))} ${lonH}`;
  }
  return `${Math.abs(lat).toFixed(6)}° ${latH}&nbsp;&nbsp;${Math.abs(lon).toFixed(6)}° ${lonH}`;
}
function _toDMS(deg) {
  const d = Math.floor(deg);
  const mFloat = (deg - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(2);
  return `${d}°${String(m).padStart(2,'0')}′${String(s).padStart(5,'0')}″`;
}

function formatProjected(c) {
  return `<span style="color:var(--tx3);font-size:10px">(зона ${c.zone})</span>&nbsp;` +
         `X:&nbsp;<b>${c.northing.toFixed(2)}</b>&nbsp;&nbsp;` +
         `Y:&nbsp;<b>${c.easting.toFixed(2)}</b>`;
}

// ── Виджет ─────────────────────────────────────────────────
function initCoordsWidget() {
  if (typeof proj4 === 'undefined') {
    console.warn('coords.js: proj4 not loaded');
    return;
  }

  const wrap = document.createElement('div');
  wrap.id = 'coord-widget';
  wrap.innerHTML = `
    <div id="coord-sys-btns">
      <button class="csb on" data-s="wgs" onclick="setCoordSys('wgs')">WGS-84</button>
      <button class="csb"    data-s="msk" onclick="setCoordSys('msk')">МСК-86/89</button>
      <button class="csb"    data-s="gsk" onclick="setCoordSys('gsk')">ГСК-2011</button>
    </div>
    <div id="coord-display">— наведите курсор на карту —</div>
  `;
  document.body.appendChild(wrap);

  const style = document.createElement('style');
  style.textContent = `
    #coord-widget {
      position: fixed;
      bottom: 28px;
      left: calc(var(--sw) + 10px);
      z-index: 1200;
      background: rgba(255,255,255,0.93);
      border: 1px solid var(--bd);
      border-radius: 7px;
      box-shadow: var(--shm);
      padding: 5px 10px 5px 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--tx2);
      pointer-events: auto;
      backdrop-filter: blur(4px);
      user-select: none;
    }
    #coord-sys-btns { display: flex; gap: 2px; flex-shrink: 0; }
    .csb {
      background: var(--s2);
      border: 1.5px solid var(--bd);
      border-radius: 4px;
      font-family: inherit;
      font-size: 10px;
      font-weight: 700;
      color: var(--tx3);
      padding: 2px 7px;
      cursor: pointer;
      transition: all .15s;
      white-space: nowrap;
    }
    .csb:hover { border-color: var(--acc); color: var(--acc); }
    .csb.on    { background: var(--acc); border-color: var(--acc); color: #fff; }
    #coord-display {
      font-size: 11.5px;
      font-weight: 500;
      color: var(--tx);
      font-variant-numeric: tabular-nums;
      min-width: 300px;
      letter-spacing: 0.01em;
    }
    #coord-display b { font-weight: 700; }
  `;
  document.head.appendChild(style);
  updateCoordWidgetVisibility();
}

function updateCoordWidgetVisibility() {
  const widget = document.getElementById('coord-widget');
  if (!widget) return;
  const pages = ['pgk-page','kam-page','smg-page','gruz-page','gtasks-page','dash-page'];
  const anyOpen = pages.some(id => {
    const el = document.getElementById(id);
    return el && el.classList.contains('show');
  });
  widget.style.display = anyOpen ? 'none' : 'flex';
}

function setCoordSys(sys) {
  if (sys === 'wgs' && coordSys === 'wgs') {
    wgsFormat = wgsFormat === 'dec' ? 'dms' : 'dec';
    const btn = document.querySelector('.csb[data-s="wgs"]');
    if (btn) btn.textContent = wgsFormat === 'dms' ? 'WGS-84 °′″' : 'WGS-84';
    return;
  }
  coordSys = sys;
  document.querySelectorAll('.csb').forEach(b => b.classList.toggle('on', b.dataset.s === sys));
}

function onMapMouseMove(e) {
  const disp = document.getElementById('coord-display');
  if (!disp) return;
  const { lat, lng } = e.latlng;
  try {
    if      (coordSys === 'wgs') disp.innerHTML = formatWGS(lat, lng);
    else if (coordSys === 'msk') disp.innerHTML = formatProjected(wgsToMsk(lat, lng));
    else if (coordSys === 'gsk') disp.innerHTML = formatProjected(wgsToGsk(lat, lng));
  } catch(err) {
    disp.textContent = 'Ошибка конвертации';
  }
}

function attachCoordsToMap() {
  if (!window.map) { setTimeout(attachCoordsToMap, 300); return; }
  map.on('mousemove', onMapMouseMove);
  map.on('mouseout', () => {
    const disp = document.getElementById('coord-display');
    if (disp) disp.innerHTML = '— наведите курсор на карту —';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCoordsWidget();
  attachCoordsToMap();
  const observer = new MutationObserver(updateCoordWidgetVisibility);
  ['pgk-page','kam-page','smg-page','gruz-page','gtasks-page','dash-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
});
