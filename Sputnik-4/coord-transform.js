// ═══════════════════════════════════════════════════════════
// coord-transform.js — WGS-84 → МСК-86 / ГСК-2011
// Использует proj4 с теми же строками, что coords.js на фронте
// (верифицировано: погрешность < 0.3 м для МСК, < 0.2 м для ГСК)
// ═══════════════════════════════════════════════════════════

const proj4 = require('proj4');

const _WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

// МСК-86/89: зоны с ЦМ = 60.05 + 6*(N-1)
function _mskProj(zone) {
  const lon_0 = 60.05 + 6 * (zone - 1);
  const x_0   = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5811057.63` +
         ` +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}

function _mskZone(lon) {
  return Math.round((lon - 60.05) / 6) + 1;
}

// ГСК-2011: ЦМ = 6*N-3
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

/**
 * WGS-84 → МСК-86. Возвращает { northing, easting, zone }.
 * Аргументы в градусах, результат в метрах.
 */
function wgs84ToMsk86(latDeg, lngDeg) {
  const zone = _mskZone(lngDeg);
  const [easting, northing] = proj4(_WGS84, _mskProj(zone), [lngDeg, latDeg]);
  return { northing, easting, zone };
}

/**
 * WGS-84 → ГСК-2011. Возвращает { northing, easting, zone }.
 */
function wgs84ToGsk2011(latDeg, lngDeg) {
  const zone = _gskZone(lngDeg);
  const [easting, northing] = proj4(_WGS84, _gskProj(zone), [lngDeg, latDeg]);
  return { northing, easting, zone };
}

/** Зона МСК по долготе центра bbox. */
function pickMsk86Zone(centerLngDeg) {
  return _mskZone(centerLngDeg);
}

/** Зона ГСК-2011 по долготе центра bbox. */
function pickGsk2011Zone(centerLngDeg) {
  return _gskZone(centerLngDeg);
}

// Полный справочник МСК (все регионы, 2001/2008) — из public/msk-zones.json.
let _MSK_FULL = null;
try { _MSK_FULL = require('./public/msk-zones.json'); } catch (e) { _MSK_FULL = null; }
// Зона региона по долготе (ближайший осевой меридиан).
function _mskFullPickZone(reg, lng) {
  const zs = _MSK_FULL && _MSK_FULL.regions && _MSK_FULL.regions[reg];
  if (!zs || !zs.length) return null;
  let best = zs[0], bd = Infinity;
  for (const z of zs) { const d = Math.abs(z.lon - lng); if (d < bd) { bd = d; best = z; } }
  return best;
}
// Строит proj-строку МСК для crs "mskfull:<регион>:<датум>" и долготы центра области.
function _mskFullProjStr(crs, centerLng) {
  if (!_MSK_FULL || !_MSK_FULL.regions) return null;
  const parts = String(crs).split(':');            // ['mskfull', reg, datum]
  const z = _mskFullPickZone(parts[1], isFinite(centerLng) ? centerLng : 0);
  if (!z) return null;
  const tw = (_MSK_FULL.datums && _MSK_FULL.datums[parts[2]]) || (_MSK_FULL.datums && _MSK_FULL.datums['2008']) ||
             [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];
  const ellps = _MSK_FULL.ellps || 'krass';
  return { proj: `+proj=tmerc +lat_0=0 +lon_0=${z.lon} +k=1 +x_0=${z.x0} +y_0=${z.y0} +ellps=${ellps} +towgs84=${tw.join(',')} +units=m +no_defs`, zone: z.z };
}
// Номер зоны МСК для имени файла (или null).
function mskFullZone(crs, centerLng) {
  const d = _mskFullProjStr(crs, centerLng);
  return d ? d.zone : null;
}

/**
 * Фабрика трансформации (lng, lat) → [x, y].
 * crs: 'wgs84' | 'msk86' | 'msk86_z3' | 'msk86_z4' | 'gsk2011' | 'mskfull:<регион>:<датум>'
 * centerLng используется для выбора зоны у 'mskfull' (одна зона на весь экспорт).
 */
function makeTransform(crs, centerLng) {
  if (crs === 'wgs84' || !crs) {
    return (lng, lat) => [lng, lat];
  }
  if (typeof crs === 'string' && crs.indexOf('mskfull:') === 0) {
    const d = _mskFullProjStr(crs, centerLng);
    if (!d) throw new Error('Неизвестный регион МСК: ' + crs);
    return (lng, lat) => { const [e, n] = proj4(_WGS84, d.proj, [lng, lat]); return [e, n]; };
  }
  if (crs === 'msk86') {
    return (lng, lat) => {
      const r = wgs84ToMsk86(lat, lng);
      return [r.easting, r.northing];
    };
  }
  if (crs === 'msk86_z3') {
    return (lng, lat) => {
      const [easting, northing] = proj4(_WGS84, _mskProj(3), [lng, lat]);
      return [easting, northing];
    };
  }
  if (crs === 'msk86_z4') {
    return (lng, lat) => {
      const [easting, northing] = proj4(_WGS84, _mskProj(4), [lng, lat]);
      return [easting, northing];
    };
  }
  if (crs === 'gsk2011') {
    return (lng, lat) => {
      const r = wgs84ToGsk2011(lat, lng);
      return [r.easting, r.northing];
    };
  }
  throw new Error('Неизвестная СК: ' + crs);
}

module.exports = {
  wgs84ToMsk86,
  wgs84ToGsk2011,
  pickMsk86Zone,
  pickGsk2011Zone,
  mskFullZone,
  makeTransform,
};
