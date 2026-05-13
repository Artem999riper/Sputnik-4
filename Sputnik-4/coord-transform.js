// ═══════════════════════════════════════════════════════════
// coord-transform.js — WGS-84 → МСК-86 / ГСК-2011 (Гаусс-Крюгер)
// Портирован из Sputnik-4-Android/.../CoordTransform.kt
// ═══════════════════════════════════════════════════════════

const D2R = Math.PI / 180;

// Эллипсоиды
const KRASSOVSKY = { a: 6378245.0,  f: 1 / 298.3 };
const WGS84      = { a: 6378137.0,  f: 1 / 298.257223563 };
const GSK2011    = { a: 6378136.5,  f: 1 / 298.2564151 };  // ПЗ-90.11 / ГСК-2011

// Helmert WGS-84 → СК-42 (для МСК-86)
const HELMERT_SK42 = {
  dx: 23.92, dy: -141.27, dz: -80.9,
  wxAs: 0.0, wyAs: -0.35, wzAs: -0.82,  // arc-sec
  scalePpm: -0.12,
};

function llhToEcef(latRad, lngRad, h, a, f) {
  const e2 = 2 * f - f * f;
  const n = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  return [
    (n + h) * Math.cos(latRad) * Math.cos(lngRad),
    (n + h) * Math.cos(latRad) * Math.sin(lngRad),
    (n * (1 - e2) + h) * Math.sin(latRad),
  ];
}

function ecefToLlh(x, y, z, a, f) {
  const e2 = 2 * f - f * f;
  const p = Math.sqrt(x * x + y * y);
  const lng = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 8; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * n * Math.sin(lat), p);
  }
  return [lat, lng];
}

function helmertWgs84ToSk42([x1, y1, z1]) {
  const wx = (HELMERT_SK42.wxAs / 3600) * D2R;
  const wy = (HELMERT_SK42.wyAs / 3600) * D2R;
  const wz = (HELMERT_SK42.wzAs / 3600) * D2R;
  const s = HELMERT_SK42.scalePpm * 1e-6;
  return [
    HELMERT_SK42.dx + (1 + s) * (x1 + wz * y1 - wy * z1),
    HELMERT_SK42.dy + (1 + s) * (-wz * x1 + y1 + wx * z1),
    HELMERT_SK42.dz + (1 + s) * (wy * x1 - wx * y1 + z1),
  ];
}

/**
 * Гаусс-Крюгер прямая (на любом эллипсоиде), ряд 6-го порядка.
 * Возвращает {north, east} в метрах.
 */
function gaussKruger(lat, lng, lng0, falseEasting, ellipsoid) {
  const { a, f } = ellipsoid;
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const t = Math.tan(lat);
  const eta2 = ePrime2 * Math.cos(lat) ** 2;
  const l = lng - lng0;
  const cosL = Math.cos(lat);

  const m0 = a * (1 - e2);
  const a0 = 1 + 3/4*e2 + 45/64*e2**2 + 175/256*e2**3 + 11025/16384*e2**4;
  const a2 = 3/4*e2 + 15/16*e2**2 + 525/512*e2**3 + 2205/2048*e2**4;
  const a4 = 15/64*e2**2 + 105/256*e2**3 + 2205/4096*e2**4;
  const a6 = 35/512*e2**3 + 315/2048*e2**4;
  const arc = m0 * (a0*lat - a2/2*Math.sin(2*lat) + a4/4*Math.sin(4*lat) - a6/6*Math.sin(6*lat));

  const north = arc
    + n/2 * Math.sin(lat) * cosL**2 * l**2
    + n/24 * Math.sin(lat) * cosL**3 * (5 - t**2 + 9*eta2 + 4*eta2**2) * l**4
    + n/720 * Math.sin(lat) * cosL**5 * (61 - 58*t**2 + t**4 + 270*eta2 - 330*t**2*eta2) * l**6;

  const east = falseEasting
    + n * cosL * l
    + n/6 * cosL**3 * (1 - t**2 + eta2) * l**3
    + n/120 * cosL**5 * (5 - 18*t**2 + t**4 + 14*eta2 - 58*t**2*eta2) * l**5;

  return { north, east };
}

/**
 * WGS-84 (lat, lng в градусах) → МСК-86 зоны 3/4. Возвращает {x, y} в метрах
 * (x = Easting, y = Northing — как принято в DXF/AutoCAD).
 */
function wgs84ToMsk86(latDeg, lngDeg, zone) {
  if (zone !== 3 && zone !== 4) throw new Error('МСК-86 поддерживает только зоны 3 и 4');
  const lng0Deg = zone === 3 ? 70.5 : 73.5;
  const falseEasting = zone === 3 ? 3_300_000 : 4_300_000;
  const ecef84 = llhToEcef(latDeg * D2R, lngDeg * D2R, 0, WGS84.a, WGS84.f);
  const ecefK = helmertWgs84ToSk42(ecef84);
  const [latK, lngK] = ecefToLlh(ecefK[0], ecefK[1], ecefK[2], KRASSOVSKY.a, KRASSOVSKY.f);
  const gk = gaussKruger(latK, lngK, lng0Deg * D2R, falseEasting, KRASSOVSKY);
  return { x: gk.east, y: gk.north };
}

/**
 * WGS-84 → ГСК-2011, 6-градусные зоны (UTM-style). CM зоны N: (6N - 3)°.
 * False easting: 500 000 + 1 000 000 * zoneNumber (зональная схема СК-95/ГСК-2011).
 */
function wgs84ToGsk2011(latDeg, lngDeg, zone) {
  const lng0Deg = 6 * zone - 3;
  const falseEasting = 500_000 + 1_000_000 * zone;
  // Сдвиг WGS-84 → ГСК-2011 на практике < 1 м — для DXF-экспорта пренебрегаем.
  const gk = gaussKruger(latDeg * D2R, lngDeg * D2R, lng0Deg * D2R, falseEasting, GSK2011);
  return { x: gk.east, y: gk.north };
}

/** МСК-86: зона 3 покрывает долготы 69-72°, зона 4 — 72-75°. */
function pickMsk86Zone(centerLngDeg) {
  return centerLngDeg < 72 ? 3 : 4;
}

/** ГСК-2011: зона = floor((lng + 3) / 6) + 1, для 0..180°E. */
function pickGsk2011Zone(centerLngDeg) {
  return Math.max(1, Math.min(60, Math.floor((centerLngDeg + 3) / 6) + 1));
}

/**
 * Унифицированная фабрика трансформации.
 * crs: 'wgs84' | 'msk86' | 'gsk2011'. Для msk86/gsk2011 zone определяется по centerLng.
 * Возвращает функцию (lng, lat) → [x, y].
 */
function makeTransform(crs, centerLng) {
  if (crs === 'wgs84' || !crs) {
    return (lng, lat) => [lng, lat];
  }
  if (crs === 'msk86') {
    const zone = pickMsk86Zone(centerLng);
    return (lng, lat) => {
      const r = wgs84ToMsk86(lat, lng, zone);
      return [r.x, r.y];
    };
  }
  if (crs === 'gsk2011') {
    const zone = pickGsk2011Zone(centerLng);
    return (lng, lat) => {
      const r = wgs84ToGsk2011(lat, lng, zone);
      return [r.x, r.y];
    };
  }
  throw new Error('Неизвестная СК: ' + crs);
}

module.exports = {
  wgs84ToMsk86,
  wgs84ToGsk2011,
  pickMsk86Zone,
  pickGsk2011Zone,
  makeTransform,
};
