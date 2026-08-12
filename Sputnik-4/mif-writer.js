// ═══════════════════════════════════════════════════════════
// mif-writer.js — экспорт слоёв в MapInfo Interchange Format
// (MIF/MID). Текстовый формат, MapInfo импортирует напрямую.
// Точки/линии/полигоны + атрибуты (Name, Layer). Цвет из слоя/объекта.
// ═══════════════════════════════════════════════════════════

// hex → целое RGB MapInfo (R*65536+G*256+B)
function miColor(hex) {
  hex = String(hex || '#1a56db').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  return r * 65536 + g * 256 + b;
}

// Кодирование строки в Windows-1251 (Charset "WindowsCyrillic") — без внешних
// зависимостей; корректно передаёт кириллицу в русский MapInfo.
function encodeCp1251(str) {
  const s = String(str == null ? '' : str);
  const out = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    let b;
    if (cp < 0x80) b = cp;
    else if (cp >= 0x0410 && cp <= 0x044F) b = cp - 0x0410 + 0xC0; // А-я
    else if (cp === 0x0401) b = 0xA8;      // Ё
    else if (cp === 0x0451) b = 0xB8;      // ё
    else if (cp === 0x2116) b = 0xB9;      // №
    else if (cp === 0x00B0) b = 0xB0;      // °
    else if (cp === 0x2013 || cp === 0x2014) b = 0x2D; // – — → -
    else b = 0x3F;                          // прочее → ?
    out[i] = b;
  }
  return out;
}

// Строит { mif, mid } (строки). isGeo=true → WGS-84 (градусы), иначе метры.
function buildLayersMIF({ layers, transform, isGeo }) {
  const coordSys = isGeo
    ? 'CoordSys Earth Projection 1, 104'   // Longitude/Latitude, WGS-84
    : 'CoordSys NonEarth Units "m"';        // проекция в метрах (МСК/ГСК)
  const NL = '\r\n';
  const head = [
    'Version 300',
    'Charset "WindowsCyrillic"',
    'Delimiter ","',
    coordSys,
    'Columns 2',
    '  Name Char(254)',
    '  Layer Char(100)',
    'Data',
    '',
  ].join(NL);

  const prec = isGeo ? 8 : 3;
  const T = (lng, lat) => { const p = transform(lng, lat); return `${p[0].toFixed(prec)} ${p[1].toFixed(prec)}`; };
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';

  const objs = [];
  const mids = [];
  const push = (objText, name, layerName) => { objs.push(objText); mids.push(q(name) + ',' + q(layerName)); };

  const pline = (coords, color) => {
    const pts = (coords || []).map(c => '  ' + T(c[0], c[1]));
    return `Pline ${pts.length}${NL}${pts.join(NL)}${NL}    Pen (2,2,${color})`;
  };
  const region = (rings, color) => {
    const valid = (rings || []).filter(r => r && r.length >= 3);
    let s = `Region ${valid.length}`;
    for (const ring of valid) {
      const pts = ring.map(c => '  ' + T(c[0], c[1]));
      s += `${NL}  ${pts.length}${NL}${pts.join(NL)}`;
    }
    return s + `${NL}    Pen (2,2,${color})${NL}    Brush (1,0,16777215)`;
  };

  function emit(geom, name, layerName, color) {
    if (!geom) return;
    const t = geom.type, c = geom.coordinates;
    if (t === 'GeometryCollection') { (geom.geometries || []).forEach(g => emit(g, name, layerName, color)); return; }
    if (!c) return;
    if (t === 'Point') push(`Point ${T(c[0], c[1])}${NL}    Symbol (34,${color},12)`, name, layerName);
    else if (t === 'MultiPoint') c.forEach(pt => push(`Point ${T(pt[0], pt[1])}${NL}    Symbol (34,${color},12)`, name, layerName));
    else if (t === 'LineString') push(pline(c, color), name, layerName);
    else if (t === 'MultiLineString') c.forEach(l => push(pline(l, color), name, layerName));
    else if (t === 'Polygon') push(region(c, color), name, layerName);
    else if (t === 'MultiPolygon') c.forEach(p => push(region(p, color), name, layerName));
  }

  for (const lay of (layers || [])) {
    let gj; try { gj = JSON.parse(lay.geojson); } catch (e) { continue; }
    const feats = gj.type === 'FeatureCollection' ? (gj.features || []) : (gj.type === 'Feature' ? [gj] : []);
    for (const f of feats) {
      if (!f || !f.geometry) continue;
      const props = f.properties || {};
      const name = props.name || props.Name || props.label || '';
      const color = miColor(props._color || lay.color);
      emit(f.geometry, name, lay.name, color);
    }
  }

  const mif = head + objs.join(NL) + (objs.length ? NL : '');
  const mid = mids.join(NL) + (mids.length ? NL : '');
  return { mif, mid, count: mids.length };
}

module.exports = { buildLayersMIF, encodeCp1251, miColor };
