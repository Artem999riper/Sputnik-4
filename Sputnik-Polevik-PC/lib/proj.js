// Координатные преобразования WGS-84 ↔ МСК-86 (зоны 3, 4)
// для Камчатского/Сахалинского региона. Параметры взяты из
// Android CoordTransform.kt.

let proj4;
try { proj4 = require('proj4'); } catch (e) { proj4 = null; }

const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

// МСК-86 zone 3 (центральный меридиан 141°E)
const MSK86_Z3 =
  '+proj=tmerc +lat_0=0 +lon_0=141 +k=1 +x_0=3300000 +y_0=-5500000 ' +
  '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,-0.35,-0.79,-0.22 +units=m +no_defs';
// МСК-86 zone 4 (центральный меридиан 144°E)
const MSK86_Z4 =
  '+proj=tmerc +lat_0=0 +lon_0=144 +k=1 +x_0=4300000 +y_0=-5500000 ' +
  '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,-0.35,-0.79,-0.22 +units=m +no_defs';

function toMsk(lat, lng, zone) {
  if (!proj4) return null;
  const def = zone === 4 ? MSK86_Z4 : MSK86_Z3;
  try {
    const [x, y] = proj4(WGS84, def, [Number(lng), Number(lat)]);
    return { x, y };
  } catch (e) { return null; }
}

function toWgs(x, y, zone) {
  if (!proj4) return null;
  const def = zone === 4 ? MSK86_Z4 : MSK86_Z3;
  try {
    const [lng, lat] = proj4(def, WGS84, [Number(x), Number(y)]);
    return { lat, lng };
  } catch (e) { return null; }
}

// Парсер координаты:
// "55.5042" → 55.5042
// "55°30'15.5\"" / "55 30 15.5" → 55.504306
// "N 55 30 15.5" → 55.504306; "S ..." → отрицательное
function parseCoord(input) {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  let s = String(input).trim();
  if (!s) return null;
  let sign = 1;
  if (/^[Ssю]/i.test(s) || /^[Ww]/i.test(s)) { sign = -1; s = s.slice(1).trim(); }
  else if (/^[NnEeВвС]/i.test(s)) { s = s.slice(1).trim(); }
  if (s.endsWith('S') || s.endsWith('s') || s.endsWith('W') || s.endsWith('w')) {
    sign = -1; s = s.slice(0, -1).trim();
  } else if (/[NnEe]$/.test(s)) { s = s.slice(0, -1).trim(); }
  s = s.replace(',', '.');
  const dec = parseFloat(s);
  if (Number.isFinite(dec) && /^-?\d+(\.\d+)?$/.test(s.replace(/^-/, ''))) return sign * dec;
  // DMS
  const parts = s.split(/[°'"’″\s]+/).filter(Boolean).map(parseFloat).filter(Number.isFinite);
  if (!parts.length) return null;
  const [d = 0, m = 0, sec = 0] = parts;
  return sign * (Math.abs(d) + m / 60 + sec / 3600) * (d < 0 ? -1 : 1);
}

function formatDms(deg, isLat) {
  if (!Number.isFinite(deg)) return '';
  const sfx = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const sec = (mFloat - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${sec.toFixed(2).padStart(5, '0')}" ${sfx}`;
}

module.exports = { toMsk, toWgs, parseCoord, formatDms };
