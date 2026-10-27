const path = require('path');
const fs   = require('fs');
const { v4: uuid } = require('uuid');
const { all, get, run } = require('../database');
const { required, wrap } = require('./validate');
const { trashAndDelete, broadcast } = require('./realtime');
const proj4 = require('proj4');

// ── DXF IMPORT HELPERS ─────────────────────────────────────
const _DXF_WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
// Имя файла для скачивания: ASCII-запасное + UTF-8 (RFC 5987) — кириллица в заголовке иначе даёт ошибку
function _attach(res, name) {
  const ascii = String(name).replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'file';
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
}
function _dxfMskProj(zone) {
  const lon_0 = 60.05 + 6 * (zone - 1), x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
function _dxfGskProj(zone) {
  const lon_0 = zone * 6 - 3, x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=0 +a=6378136.5 +rf=298.2564151 +towgs84=0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074 +units=m +no_defs`;
}
// Региональные МСК: МСК-66 (Свердловская, y_0=-5911057.63) и МСК-72 (Тюменская, y_0=-6000000).
// Зона — по префиксу X (восток): floor(x / 1e6). Параметры совпадают с coords.js на фронте.
function _dxfMsk66Proj(zone, w) {
  const lon_0 = 60.05 + w * (zone - 1), x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5911057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
function _dxfMsk72Proj(zone, w) {
  const lon_0 = 63.05 + w * (zone - 1), x_0 = zone * 1000000 + 500000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
// МСК-11 (Республика Коми): 9 трёхградусных зон, ЦМ зоны 1 = 41°02′,
// ложный восток = N·1e6 + 400000, y_0 = -6211057.628.
function _dxfMsk11Proj(zone, w) {
  const lon_0 = 41.03333333 + 3 * (zone - 1), x_0 = zone * 1000000 + 400000;
  return `+proj=tmerc +lat_0=0 +lon_0=${lon_0} +k=1 +x_0=${x_0} +y_0=-6211057.628 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs`;
}
const _DXF_MSK_REGIONAL = {
  msk66_3: { proj: _dxfMsk66Proj, w: 3 },
  msk72_3: { proj: _dxfMsk72Proj, w: 3 },
  msk72_6: { proj: _dxfMsk72Proj, w: 6 },
  msk11_3: { proj: _dxfMsk11Proj, w: 3 },
};
// Полный справочник МСК (все регионы РФ, 2001/2008) — из public/msk-zones.json.
let _MSK_FULL = null;
try { _MSK_FULL = require('../public/msk-zones.json'); } catch (e) { _MSK_FULL = null; }
// crs = "mskfull:<регион>:<датум>"; зона — по префиксу восточной координаты sampleX.
function _mskFullProjStr(crs, sampleX) {
  if (!_MSK_FULL || !_MSK_FULL.regions) return null;
  const parts = String(crs).split(':');       // ['mskfull', reg, datum]
  const zones = _MSK_FULL.regions[parts[1]];
  if (!zones || !zones.length) return null;
  const zoneNo = Math.max(1, Math.floor((sampleX || 0) / 1e6));
  const zrec = zones.find(z => Math.floor(z.x0 / 1e6) === zoneNo) || zones[0];
  const tw = (_MSK_FULL.datums && _MSK_FULL.datums[parts[2]]) || (_MSK_FULL.datums && _MSK_FULL.datums['2008']) ||
             [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];
  const ellps = _MSK_FULL.ellps || 'krass';
  return `+proj=tmerc +lat_0=0 +lon_0=${zrec.lon} +k=1 +x_0=${zrec.x0} +y_0=${zrec.y0} +ellps=${ellps} +towgs84=${tw.join(',')} +units=m +no_defs`;
}

function parseDXF(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const val  = lines[i + 1] ? lines[i + 1].trim() : '';
    if (!isNaN(code)) pairs.push([code, val]);
  }

  const dxfLayers = new Map();
  let inEntities = false;
  const ENTITY_TYPES = new Set(['POINT','LINE','ARC','CIRCLE','ELLIPSE','SPLINE','HATCH','LWPOLYLINE','POLYLINE','VERTEX','SEQEND','TEXT','MTEXT','ATTRIB','INSERT']);
  let i = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === 0 && val === 'SECTION') {
      i++;
      if (pairs[i] && pairs[i][0] === 2) {
        inEntities = pairs[i][1] === 'ENTITIES';
        i++;
      }
      continue;
    }
    if (code === 0 && val === 'ENDSEC') { inEntities = false; i++; continue; }
    if (!inEntities) { i++; continue; }

    if (code === 0 && ENTITY_TYPES.has(val)) {
      const type = val;
      const codes = [];
      i++;
      while (i < pairs.length && pairs[i][0] !== 0) { codes.push(pairs[i]); i++; }
      const layerName = codes.find(([c]) => c === 8)?.[1] || '0';
      const entity = { type, layer: layerName, codes };

      if (type === 'POLYLINE') {
        entity.vertices = [];
        while (i < pairs.length) {
          if (pairs[i][0] !== 0) { i++; continue; }
          if (pairs[i][1] === 'VERTEX') {
            i++;
            const vc = [];
            while (i < pairs.length && pairs[i][0] !== 0) { vc.push(pairs[i]); i++; }
            entity.vertices.push(vc);
          } else if (pairs[i][1] === 'SEQEND') {
            i++;
            while (i < pairs.length && pairs[i][0] !== 0) i++;
            break;
          } else { break; }
        }
      }
      // INSERT: собираем прикреплённые ATTRIB в сам блок (не как отдельные объекты).
      // Атрибуты идут сразу после INSERT и завершаются SEQEND.
      if (type === 'INSERT') {
        entity.attribs = [];
        while (i < pairs.length) {
          if (pairs[i][0] !== 0) { i++; continue; }
          if (pairs[i][1] === 'ATTRIB') {
            i++;
            const ac = [];
            while (i < pairs.length && pairs[i][0] !== 0) { ac.push(pairs[i]); i++; }
            const tag = ac.find(([cc]) => cc === 2)?.[1] || '';
            const txt = (ac.find(([cc]) => cc === 1)?.[1] || '')
              .replace(/\\[pPfFhHwWqQaAlLkKoOcCtTb];?|[{}]/g, '').trim();
            if (txt) entity.attribs.push({ tag, text: txt });
          } else if (pairs[i][1] === 'SEQEND') {
            i++;
            while (i < pairs.length && pairs[i][0] !== 0) i++;
            break;
          } else { break; } // следующий объект — атрибутов у блока больше нет
        }
      }
      if (type !== 'SEQEND' && type !== 'VERTEX') {
        if (!dxfLayers.has(layerName)) dxfLayers.set(layerName, []);
        dxfLayers.get(layerName).push(entity);
      }
    } else { i++; }
  }
  return dxfLayers;
}

function _dxfFindFirstX(dxfLayers) {
  for (const entities of dxfLayers.values()) {
    for (const ent of entities) {
      const p = ent.codes.find(([c]) => c === 10);
      if (p) { const x = parseFloat(p[1]); if (isFinite(x) && Math.abs(x) > 1000) return x; }
    }
  }
  return 3500000;
}

// Определяет, какая из двух координат — восток (easting), а какая — север (northing).
// Нужно из-за российской традиции (X=север, Y=восток): в NonEarth-наборах порядок
// столбцов часто перепутан. Восток МСК/ГСК имеет префикс зоны и ≈ zone*1e6+500000.
function _orderEN(a, b, crs) {
  // UTM: восток 166000–834000 (без префикса зоны), порядок берём как в источнике.
  if (typeof crs === 'string' && crs.indexOf('utm:') === 0) return [a, b];
  let x0 = null;
  if (crs === 'msk86_z3') x0 = 3500000;
  else if (crs === 'msk86_z4') x0 = 4500000;
  if (x0 != null) return Math.abs(a - x0) <= Math.abs(b - x0) ? [a, b] : [b, a];
  // Авто/региональные: восток — координата, чей остаток по 1e6 ближе к 500000
  // (x_0 = zone*1e6+500000), и целый префикс даёт правдоподобную зону 1..32.
  const score = v => {
    const av = Math.abs(v), z = Math.floor(av / 1e6);
    let s = Math.abs((av % 1e6) - 500000);          // отклонение от *,500000
    if (z < 1 || z > 32) s += 1e6;                   // штраф за неправдоподобную зону
    return s;
  };
  return score(a) <= score(b) ? [a, b] : [b, a];
}
// Рекурсивный пересчёт всех координат GeoJSON функцией fn(x,y)->[lng,lat].
function _reprojectCoords(coords, fn) {
  if (typeof coords[0] === 'number') {
    const [lng, lat] = fn(coords[0], coords[1]);
    return coords.length > 2 ? [lng, lat, coords[2]] : [lng, lat];
  }
  return coords.map(c => _reprojectCoords(c, fn));
}
function _reprojectGeoJSON(gj, fn) {
  const feats = gj && gj.type === 'FeatureCollection' ? (gj.features || []) : (gj && gj.type === 'Feature' ? [gj] : []);
  for (const f of feats) {
    if (f && f.geometry && Array.isArray(f.geometry.coordinates)) {
      f.geometry.coordinates = _reprojectCoords(f.geometry.coordinates, fn);
    }
  }
}
// Первая координатная пара [x, y] набора — для определения зоны/порядка осей.
function _firstPoint(gj) {
  const feats = gj && gj.type === 'FeatureCollection' ? (gj.features || []) : [gj];
  for (const f of feats) {
    let c = f && f.geometry && f.geometry.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && isFinite(c[0]) && isFinite(c[1])) return [c[0], c[1]];
  }
  return null;
}

// Датумы для Гаусса-Крюгера (как во вкладке «Пересчёт»)
const _GK_DATUM = {
  sk42: '+ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22',
  sk95: '+ellps=krass +towgs84=24.47,-130.89,-81.56,0,0,0.13,-0.22',
  gsk:  '+a=6378136.5 +rf=298.2564151 +towgs84=0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074',
};
function makeDxfInverseTransform(crs, sampleX) {
  if (crs === 'wgs84') return (x, y) => [x, y];
  const sx = sampleX || 3500000;
  // СК-42 / СК-95 / ГСК-2011 в Гауссе-Крюгере (6°): зона — первые цифры восточной координаты
  if (typeof crs === 'string' && crs.indexOf('gk:') === 0 && _GK_DATUM[crs.slice(3)]) {
    const dat = _GK_DATUM[crs.slice(3)];
    const cache = {};
    return (x, y) => {
      const z = Math.floor(x / 1e6);
      if (!(z >= 1 && z <= 60)) return [NaN, NaN];
      const ps = cache[z] || (cache[z] = `+proj=tmerc +lat_0=0 +lon_0=${6 * z - 3} +k=1 +x_0=${z * 1e6 + 500000} +y_0=0 ${dat} +units=m +no_defs`);
      return proj4(ps, _DXF_WGS84, [x, y]);
    };
  }
  if (crs === 'geo:sk42') return (x, y) => proj4(`+proj=longlat ${_GK_DATUM.sk42} +no_defs`, _DXF_WGS84, [x, y]);
  // Произвольная строка proj4 (например, из .prj)
  if (typeof crs === 'string' && /^\+proj=|^(PROJCS|GEOGCS)\[/i.test(crs)) return (x, y) => proj4(crs, _DXF_WGS84, [x, y]);
  // Полный справочник МСК: crs вида "mskfull:<регион>:<датум>"
  if (typeof crs === 'string' && crs.indexOf('mskfull:') === 0) {
    const projStr = _mskFullProjStr(crs, sx);
    if (!projStr) throw new Error('Неизвестный регион МСК: ' + crs);
    return (x, y) => { const [lng, lat] = proj4(projStr, _DXF_WGS84, [x, y]); return [lng, lat]; };
  }
  // UTM (север), зона задана явно: crs вида "utm:<zone>"
  if (typeof crs === 'string' && crs.indexOf('utm:') === 0) {
    const zone = parseInt(crs.split(':')[1], 10);
    if (!(zone >= 1 && zone <= 60)) throw new Error('Неверная зона UTM: ' + crs);
    const projStr = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
    return (x, y) => { const [lng, lat] = proj4(projStr, _DXF_WGS84, [x, y]); return [lng, lat]; };
  }
  // Региональные МСК-66 / МСК-72 — зона по префиксу X (восток)
  const reg = _DXF_MSK_REGIONAL[crs];
  if (reg) {
    const zone = Math.max(1, Math.floor(sx / 1e6));
    const projStr = reg.proj(zone, reg.w);
    return (x, y) => { const [lng, lat] = proj4(projStr, _DXF_WGS84, [x, y]); return [lng, lat]; };
  }
  let zone;
  if      (crs === 'msk86_z3') zone = 3;
  else if (crs === 'msk86_z4') zone = 4;
  else if (crs === 'msk86')    zone = Math.round(sx / 1e6);
  else                          zone = Math.floor(sx / 1e6); // gsk2011
  const projStr = crs === 'gsk2011' ? _dxfGskProj(zone) : _dxfMskProj(zone);
  return (x, y) => { const [lng, lat] = proj4(projStr, _DXF_WGS84, [x, y]); return [lng, lat]; };
}

// Раскрыть «bulge» (выпуклость вершины полилинии) в точки дуги.
// Возвращает промежуточные точки между p1 и p2 (без самих концов).
function _bulgeArcPoints(x1, y1, x2, y2, bulge) {
  const theta = 4 * Math.atan(bulge);              // полный угол дуги (со знаком)
  const dx = x2 - x1, dy = y2 - y1;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9 || !isFinite(theta) || Math.abs(theta) < 1e-6) return [];
  const R = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const apoth = Math.sqrt(Math.max(0, R * R - (chord / 2) * (chord / 2)));
  const nx = -dy / chord, ny = dx / chord;         // нормаль к хорде
  const sign = (bulge > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx + nx * apoth * sign;
  const cy = my + ny * apoth * sign;
  let a1 = Math.atan2(y1 - cy, x1 - cx);
  let a2 = Math.atan2(y2 - cy, x2 - cx);
  if (bulge > 0 && a2 < a1) a2 += 2 * Math.PI;     // CCW
  if (bulge < 0 && a2 > a1) a2 -= 2 * Math.PI;     // CW
  const sweep = a2 - a1;
  const nSeg = Math.max(2, Math.ceil(Math.abs(sweep) / (5 * Math.PI / 180)));
  const out = [];
  for (let k = 1; k < nSeg; k++) {
    const a = a1 + sweep * k / nSeg;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

// Превратить вершины [{x,y,bulge}] в плотную ломаную (в координатах DXF),
// раскрывая дуги по bulge.
function _densifyVerts(verts, closed) {
  const out = [];
  const n = verts.length;
  const lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    out.push([a.x, a.y]);
    if (a.bulge && Math.abs(a.bulge) > 1e-9)
      for (const p of _bulgeArcPoints(a.x, a.y, b.x, b.y, a.bulge)) out.push(p);
  }
  if (!closed) out.push([verts[n - 1].x, verts[n - 1].y]);
  return out;
}

function dxfEntitiesToFeatures(entities, inv) {
  const features = [];
  const gF = (c, code) => { const p = c.find(([k]) => k === code); return p ? parseFloat(p[1]) : 0; };
  const gAll = (c, code) => c.filter(([k]) => k === code).map(([, v]) => parseFloat(v));
  const gS = (c, code) => { const p = c.find(([k]) => k === code); return p ? p[1] : ''; };
  const safeInv = (x, y) => { try { const r = inv(x, y); return (isFinite(r[0]) && isFinite(r[1])) ? r : null; } catch (_) { return null; } };

  for (const ent of entities) {
    const c = ent.codes;
    const name = gS(c, 1);
    switch (ent.type) {
      case 'POINT': {
        const xy = safeInv(gF(c, 10), gF(c, 20));
        if (xy) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:xy }, properties:{ name } });
        break;
      }
      case 'INSERT': {
        // Блок → ОДНА точка в позиции вставки; атрибуты (ATTRIB) — в имя/описание,
        // а не отдельными объектами.
        const xy = safeInv(gF(c, 10), gF(c, 20));
        if (!xy) break;
        const blockName = gS(c, 2); // имя блока
        const attribs = ent.attribs || [];
        const attrVals = attribs.map(a => a.text).filter(Boolean);
        const props = { name: attrVals.join(' · ') || name || blockName || '' };
        if (attribs.length) {
          props.description = attribs.map(a => (a.tag ? a.tag + ': ' : '') + a.text).join('\n');
          attribs.forEach(a => { if (a.tag && props[a.tag] === undefined) props[a.tag] = a.text; });
        }
        if (blockName) props.block = blockName;
        features.push({ type:'Feature', geometry:{ type:'Point', coordinates:xy }, properties:props });
        break;
      }
      case 'LINE': {
        const a = safeInv(gF(c, 10), gF(c, 20)), b = safeInv(gF(c, 11), gF(c, 21));
        if (a && b) features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:[a, b] }, properties:{ name } });
        break;
      }
      case 'LWPOLYLINE': {
        // Считываем вершины по порядку, сохраняя bulge (код 42) каждой вершины
        const verts = [];
        let cur = null;
        for (const [k, v] of c) {
          if (k === 10) { if (cur) verts.push(cur); cur = { x: parseFloat(v), y: 0, bulge: 0 }; }
          else if (k === 20 && cur) cur.y = parseFloat(v);
          else if (k === 42 && cur) cur.bulge = parseFloat(v);
        }
        if (cur) verts.push(cur);
        if (verts.length < 2) break;
        const closed = !!(gF(c, 70) & 0x01);
        const pts = _densifyVerts(verts, closed && verts.length >= 3)
          .map(([x, y]) => safeInv(x, y)).filter(Boolean);
        if (pts.length < 2) break;
        if (closed && pts.length >= 3) {
          pts.push(pts[0]);
          features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[pts] }, properties:{ name } });
        } else {
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:pts }, properties:{ name } });
        }
        break;
      }
      case 'POLYLINE': {
        if (!ent.vertices || ent.vertices.length < 2) break;
        const verts = ent.vertices.map(vc => ({
          x: parseFloat(vc.find(([k]) => k === 10)?.[1] || 0),
          y: parseFloat(vc.find(([k]) => k === 20)?.[1] || 0),
          bulge: parseFloat(vc.find(([k]) => k === 42)?.[1] || 0),
        }));
        const closed = !!(gF(c, 70) & 0x01);
        const pts = _densifyVerts(verts, closed && verts.length >= 3)
          .map(([x, y]) => safeInv(x, y)).filter(Boolean);
        if (pts.length < 2) break;
        if (closed && pts.length >= 3) {
          pts.push(pts[0]);
          features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[pts] }, properties:{ name } });
        } else {
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:pts }, properties:{ name } });
        }
        break;
      }
      case 'ARC': {
        // Approximate arc as line segments (≤5° per segment)
        const cx = gF(c, 10), cy = gF(c, 20), r = gF(c, 40);
        if (r <= 0) break;
        let a0 = gF(c, 50), a1 = gF(c, 51);
        if (a1 <= a0) a1 += 360; // arcs are CCW
        const span = a1 - a0;
        const nSeg = Math.max(8, Math.ceil(span / 5));
        const arcPts = [];
        for (let j = 0; j <= nSeg; j++) {
          const ang = (a0 + span * j / nSeg) * Math.PI / 180;
          const xy = safeInv(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
          if (xy) arcPts.push(xy);
        }
        if (arcPts.length >= 2)
          features.push({ type:'Feature', geometry:{ type:'LineString', coordinates:arcPts }, properties:{ name } });
        break;
      }
      case 'CIRCLE': {
        const cx = gF(c, 10), cy = gF(c, 20), r = gF(c, 40);
        if (r <= 0) break;
        const ring = [];
        for (let j = 0; j <= 72; j++) { const a = j / 72 * 2 * Math.PI; const xy = safeInv(cx + r * Math.cos(a), cy + r * Math.sin(a)); if (xy) ring.push(xy); }
        if (ring.length >= 4) features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[ring] }, properties:{ name, radius: r } });
        break;
      }
      case 'ELLIPSE': {
        // центр 10/20, конец большой полуоси 11/21 (относительно центра), отношение осей 40, параметры 41/42
        const cx = gF(c, 10), cy = gF(c, 20), mx = gF(c, 11), my = gF(c, 21), ratio = gF(c, 40) || 1;
        let t0 = gF(c, 41), t1 = gF(c, 42); if (!t1 && !t0) t1 = 2 * Math.PI; if (t1 <= t0) t1 += 2 * Math.PI;
        const full = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6, n = Math.max(16, Math.ceil((t1 - t0) / (Math.PI / 36)));
        const pts = [];
        for (let j = 0; j <= n; j++) { const t = t0 + (t1 - t0) * j / n; const xy = safeInv(cx + Math.cos(t) * mx - Math.sin(t) * ratio * my, cy + Math.cos(t) * my + Math.sin(t) * ratio * mx); if (xy) pts.push(xy); }
        if (pts.length >= 2) features.push({ type:'Feature', geometry: full ? { type:'Polygon', coordinates:[pts] } : { type:'LineString', coordinates:pts }, properties:{ name } });
        break;
      }
      case 'SPLINE': {
        const pts = _dxfSplinePoints(c).map(([x, y]) => safeInv(x, y)).filter(Boolean);
        if (pts.length >= 2) {
          const closed = !!(gF(c, 70) & 1) && pts.length >= 3;
          if (closed) pts.push(pts[0]);
          features.push({ type:'Feature', geometry: closed ? { type:'Polygon', coordinates:[pts] } : { type:'LineString', coordinates:pts }, properties:{ name } });
        }
        break;
      }
      case 'HATCH': {
        // Контуры штриховки → полигон (внешний контур + отверстия)
        const rings = _dxfHatchRings(c).map(r => r.map(([x, y]) => safeInv(x, y)).filter(Boolean)).filter(r => r.length >= 3);
        rings.forEach(r => { const a = r[0], b = r[r.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) r.push(a); });
        if (rings.length) features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:rings }, properties:{ name, hatch: gS(c, 2) } });
        break;
      }
      case 'TEXT': case 'MTEXT': case 'ATTRIB': {
        // Text / block-attribute label → named Point
        const txt = (gS(c, 1) || '').replace(/\\[pPfFhHwWqQaAlLkKoOcCtTb];?|[{}]/g, '').trim();
        const xy = safeInv(gF(c, 10), gF(c, 20));
        if (xy) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:xy }, properties:{ name: txt } });
        break;
      }
    }
  }
  return features;
}

// SPLINE: B-сплайн по контрольным точкам/узлам (алгоритм де Бура); если есть точки
// интерполяции (11/21) — используем их как есть.
function _dxfSplinePoints(c) {
  const fit = [], ctrl = [], knots = [], w = [];
  let pend = null;
  for (const [k, v] of c) {
    if (k === 10) { pend = [parseFloat(v), 0]; ctrl.push(pend); }
    else if (k === 20 && pend) pend[1] = parseFloat(v);
    else if (k === 11) fit.push([parseFloat(v), 0]);
    else if (k === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
    else if (k === 40) knots.push(parseFloat(v));
    else if (k === 41) w.push(parseFloat(v));
  }
  const deg = (c.find(([k]) => k === 71) || [0, 3])[1] * 1 || 3;
  if (ctrl.length < deg + 1 || knots.length !== ctrl.length + deg + 1) {
    if (fit.length < 3) return fit.length >= 2 ? fit : ctrl;
    // Сплайн задан точками интерполяции — сглаживаем кривой Катмулла-Рома через них
    const P = [fit[0], ...fit, fit[fit.length - 1]], out = [];
    for (let i = 1; i < P.length - 2; i++) for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t, [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
    out.push(fit[fit.length - 1]);
    return out;
  }
  const W = ctrl.map((_, i) => w[i] || 1);
  const t0 = knots[deg], t1 = knots[knots.length - deg - 1], N = Math.max(ctrl.length * 8, 32), out = [];
  for (let s = 0; s <= N; s++) {
    let t = t0 + (t1 - t0) * s / N; if (s === N) t -= 1e-10;
    let kk = deg; while (kk < knots.length - deg - 2 && t >= knots[kk + 1]) kk++;
    const d = []; for (let j = 0; j <= deg; j++) { const p = ctrl[kk - deg + j], ww = W[kk - deg + j]; d.push([p[0] * ww, p[1] * ww, ww]); }
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const i = kk - deg + j, den = knots[i + deg - r + 1] - knots[i], a = den ? (t - knots[i]) / den : 0;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
    }
    out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
  }
  return out;
}
// HATCH: контуры (полилинейные и из рёбер «линия/дуга») в кольца точек
function _dxfHatchRings(c) {
  const rings = [];
  let i = c.findIndex(([k]) => k === 91);
  if (i < 0) return rings;
  const nPaths = parseInt(c[i][1], 10); i++;
  const next = code => { while (i < c.length && c[i][0] !== code) i++; return i < c.length ? c[i++][1] : null; };
  for (let p = 0; p < nPaths && i < c.length; p++) {
    const flag = parseInt(next(92), 10) || 0, ring = [];
    if (flag & 2) {
      const hasBulge = parseInt(next(72), 10) || 0; next(73);
      const n = parseInt(next(93), 10) || 0, verts = [];
      for (let v = 0; v < n; v++) { const x = parseFloat(next(10)), y = parseFloat(next(20)); const b = hasBulge ? parseFloat(next(42)) || 0 : 0; verts.push({ x, y, bulge: b }); }
      _densifyVerts(verts, true).forEach(pt => ring.push(pt));
    } else {
      const nE = parseInt(next(93), 10) || 0;
      for (let e = 0; e < nE; e++) {
        const et = parseInt(next(72), 10);
        if (et === 1) { const x1 = +next(10), y1 = +next(20), x2 = +next(11), y2 = +next(21); if (!ring.length) ring.push([x1, y1]); ring.push([x2, y2]); }
        else if (et === 2) {
          const cx = +next(10), cy = +next(20), r = +next(40); let a0 = +next(50), a1 = +next(51); const ccw = (+next(73)) !== 0;
          if (!ccw) { a0 = -a0; a1 = -a1; } if (a1 < a0) a1 += 360;
          const n = Math.max(8, Math.ceil((a1 - a0) / 5));
          for (let j = 0; j <= n; j++) { const a = (a0 + (a1 - a0) * j / n) * Math.PI / 180; ring.push([cx + r * Math.cos(ccw ? a : -a), cy + r * Math.sin(ccw ? a : -a)]); }
        } else break;   // эллипс/сплайн в контуре штриховки — пропускаем контур
      }
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

module.exports = (app, getDb, L, { upload, demProcessor, BACKUP_DIR, doBackup, getBackupSettings, setBackupSettings, performAutoBackup }) => {
  const db = () => getDb();

  // Инициализация пути к dem_tiles из сохранённых настроек
  if (demProcessor && demProcessor.setDemTilesDir) {
    try {
      const saved = get(db(), "SELECT value FROM app_settings WHERE key='dem_tiles_dir'");
      if (saved) demProcessor.setDemTilesDir(saved.value.replace(/^"|"$/g, ''));
    } catch(_) {}
  }

  // ── APP SETTINGS (shared key-value store) ──────────────────
  app.get('/api/app-settings/:key', wrap((req, res) => {
    const row = get(db(), 'SELECT value FROM app_settings WHERE key=?', [req.params.key]);
    if (!row) return res.json({ value: null });
    try { res.json({ value: JSON.parse(row.value) }); } catch(e) { res.json({ value: row.value }); }
  }));

  app.put('/api/app-settings/:key', wrap((req, res) => {
    const { value } = req.body;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    run(db(), 'INSERT OR REPLACE INTO app_settings(key,value)VALUES(?,?)', [req.params.key, str]);
    res.json({ ok: true });
  }));

  // ── KML LAYERS (global) ────────────────────────────────────
  app.get('/api/layers', wrap((req, res) =>
    res.json(all(db(), 'SELECT * FROM kml_layers ORDER BY created_at DESC'))
  ));

  app.post('/api/layers', wrap((req, res) => {
    const err = required(['name', 'geojson'], req.body);
    if (err) return res.status(400).json({ error: err });
    const id = uuid();
    const { name, geojson, color, symbol, group_id, line_dash } = req.body;
    run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
      [id, name, geojson, color || '#1a56db', symbol || '', group_id || '', line_dash || 'solid']);
    res.json({ id });
  }));

  app.get('/api/layers/:id', wrap((req, res) => {
    const l = get(db(), 'SELECT * FROM kml_layers WHERE id=?', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Not found' });
    res.json(l);
  }));

  app.put('/api/layers/:id', wrap((req, res) => {
    const err = required(['name'], req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, color, visible, symbol, group_id, line_dash, geojson, min_zoom, max_zoom, size, show_labels, fill_opacity } = req.body;
    const vis  = visible === false ? 0 : (visible ? 1 : 0);
    // Поля, которых нет в запросе, не сбрасываем (напр. «показать подписи» шлёт не всё)
    const existing = get(db(), 'SELECT fill_opacity,min_zoom,max_zoom,size FROM kml_layers WHERE id=?', [req.params.id]);
    const minZ = min_zoom != null ? parseInt(min_zoom) : (existing && existing.min_zoom != null ? existing.min_zoom : 0);
    const maxZ = max_zoom != null ? parseInt(max_zoom) : (existing && existing.max_zoom != null ? existing.max_zoom : 20);
    const sz   = size != null ? parseFloat(size) : (existing && existing.size != null ? existing.size : 1);
    const lbl  = show_labels ? 1 : 0;
    const fillOp = fill_opacity != null ? Math.max(0, Math.min(1, parseFloat(fill_opacity)))
      : (existing && existing.fill_opacity != null ? existing.fill_opacity : 0.2);
    if (geojson !== undefined) {
      run(db(), 'UPDATE kml_layers SET name=?,color=?,visible=?,symbol=?,group_id=?,line_dash=?,min_zoom=?,max_zoom=?,size=?,geojson=?,show_labels=?,fill_opacity=? WHERE id=?',
        [name, color || '#1a56db', vis, symbol || '', group_id || '', line_dash || 'solid', minZ, maxZ, sz, geojson, lbl, fillOp, req.params.id]);
    } else {
      run(db(), 'UPDATE kml_layers SET name=?,color=?,visible=?,symbol=?,group_id=?,line_dash=?,min_zoom=?,max_zoom=?,size=?,show_labels=?,fill_opacity=? WHERE id=?',
        [name, color || '#1a56db', vis, symbol || '', group_id || '', line_dash || 'solid', minZ, maxZ, sz, lbl, fillOp, req.params.id]);
    }
    res.json({ success: true });
  }));

  // Стиль слоя по атрибутам: { colorBy, mode, colors, classes, labelField, labelSize }
  app.put('/api/layers/:id/style', wrap((req, res) => {
    const st = req.body && req.body.style;
    const txt = st == null ? null : JSON.stringify(st);
    if (txt && txt.length > 200000) return res.status(400).json({ error: 'Слишком большой стиль' });
    if (!get(db(), 'SELECT id FROM kml_layers WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
    run(db(), 'UPDATE kml_layers SET style_json=? WHERE id=?', [txt, req.params.id]);
    res.json({ success: true });
  }));

  // Узкий эндпоинт только для видимости слоя (гейтится правом layerToggleGlobal
  // отдельно от общей правки слоёв). Полный PUT остаётся для стиля/геометрии.
  app.patch('/api/layers/:id/visible', wrap((req, res) => {
    const vis = req.body && req.body.visible ? 1 : 0;
    run(db(), 'UPDATE kml_layers SET visible=? WHERE id=?', [vis, req.params.id]);
    res.json({ ok: true, visible: vis });
  }));

  app.delete('/api/layers/:id', wrap((req, res) => {
    const _restore = trashAndDelete(db(), 'kml_layers', req.params.id);
    if (!_restore) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, _restore });
  }));

  // ── ACTIVITY LOG ───────────────────────────────────────────
  app.get('/api/log', wrap((req, res) => {
    const { user, today } = req.query;
    let sql = `SELECT l.*,s.name as site_name,b.name as base_name FROM activity_log l
      LEFT JOIN sites s ON l.site_id=s.id LEFT JOIN bases b ON l.base_id=b.id`;
    const p = [], where = [];
    if (user) { where.push('l.user_name=?'); p.push(user); }
    if (today === '1') { where.push("date(l.created_at)=date('now')"); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY l.created_at DESC LIMIT 200';
    res.json(all(db(), sql, p));
  }));

  app.get('/api/log/users', wrap((req, res) =>
    res.json(all(db(), 'SELECT DISTINCT user_name FROM activity_log ORDER BY user_name').map(r => r.user_name))
  ));

  // ── GLOBAL SEARCH ──────────────────────────────────────────
  app.get('/api/search', wrap((req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ sites: [], bases: [], workers: [], machinery: [], tasks: [] });
    const like = '%' + q + '%';
    const d = db();
    res.json({
      sites:     all(d, 'SELECT id,name,client,status,completion_percent FROM sites WHERE name LIKE ? OR client LIKE ? OR address LIKE ? LIMIT 8', [like, like, like]),
      bases:     all(d, 'SELECT id,name,lat,lng FROM bases WHERE name LIKE ? OR description LIKE ? LIMIT 8', [like, like]),
      workers:   all(d, 'SELECT id,name,role,phone,base_id FROM pgk_workers WHERE name LIKE ? OR role LIKE ? OR phone LIKE ? LIMIT 8', [like, like, like]),
      machinery: all(d, 'SELECT id,name,type,plate_number,base_id,status FROM pgk_machinery WHERE name LIKE ? OR plate_number LIKE ? OR type LIKE ? LIMIT 8', [like, like, like]),
      tasks:     all(d, 'SELECT t.id,t.title,t.status,t.due_date,s.name as site_name FROM site_tasks t LEFT JOIN sites s ON t.site_id=s.id WHERE t.title LIKE ? OR t.description LIKE ? OR t.responsible LIKE ? LIMIT 8', [like, like, like]),
    });
  }));

  // ── PERSONNEL REPORT ───────────────────────────────────────
  app.get('/api/report/personnel', wrap((req, res) => {
    const d = db();
    const workers   = all(d, 'SELECT w.*, b.name as base_name, b.lat as base_lat, b.lng as base_lng FROM pgk_workers w LEFT JOIN bases b ON w.base_id=b.id ORDER BY b.name, w.name');
    const machinery = all(d, 'SELECT * FROM pgk_machinery ORDER BY base_id, name');
    const bases     = all(d, 'SELECT * FROM bases');
    const report = bases.map(b => ({
      base: b,
      workers: workers.filter(w => w.base_id === b.id).map(w => {
        const days = w.start_date ? Math.floor((Date.now() - new Date(w.start_date)) / 86400000) : null;
        const machine = machinery.find(m => m.id === w.machine_id);
        return { ...w, days_in_field: days, machine_name: machine ? machine.name : null };
      }),
      machinery: machinery.filter(m => m.base_id === b.id),
    }));
    res.json({ report, no_base: workers.filter(w => !w.base_id), total_workers: workers.length, total_machinery: machinery.length });
  }));

  // ── PHOTOS ─────────────────────────────────────────────────
  app.get('/api/photos', wrap((req, res) => {
    const entity_type = req.query.entity_type || req.query.ref_type;
    const entity_id   = req.query.entity_id   || req.query.ref_id;
    if (!entity_type || !entity_id) return res.json([]);
    res.json(all(db(), 'SELECT * FROM photos WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC', [entity_type, entity_id]));
  }));

  app.post('/api/photos/upload', (req, res) => {
    if (!upload) return res.status(503).json({ error: 'multer not installed' });
    upload.single('photo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const { entity_type, entity_id, caption } = req.body;
      const id = uuid();
      try {
        run(db(), 'INSERT INTO photos(id,entity_type,entity_id,filename,caption)VALUES(?,?,?,?,?)',
          [id, entity_type, entity_id, req.file.filename, caption || '']);
        res.json({ id, url: '/photos/' + req.file.filename });
      } catch(e) {
        console.error('[API Error] POST /api/photos/upload', e.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
      }
    });
  });

  app.delete('/api/photos/:id', wrap((req, res) => {
    const ph = get(db(), 'SELECT * FROM photos WHERE id=?', [req.params.id]);
    if (ph) { try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'photos', ph.filename)); } catch(e) {} }
    run(db(), 'DELETE FROM photos WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  }));

  // ── BACKUP ─────────────────────────────────────────────────
  app.get('/api/backups', wrap((req, res) => {
    const files = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'))
          .map(f => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, date: st.mtime }; })
          .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20)
      : [];
    res.json(files);
  }));

  app.post('/api/backups/create', wrap(async (req, res) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fname = `backup_${ts}.db`;
    try {
      const size = await doBackup(path.join(BACKUP_DIR, fname));
      res.json({ ok: true, name: fname, size });
    } catch (e) {
      console.error('[backup] create failed:', e.message);
      res.status(500).json({ error: 'Бэкап не создан: ' + e.message });
    }
  }));

  // ── BACKUP SETTINGS ────────────────────────────────────────
  app.get('/api/backups/settings', wrap((req, res) => {
    res.json(getBackupSettings ? getBackupSettings() : { interval_hours: 2, max_count: 10 });
  }));

  app.put('/api/backups/settings', wrap((req, res) => {
    if (!setBackupSettings) return res.status(501).json({ error: 'Не доступно' });
    const { interval_hours, max_count } = req.body;
    const ih = (interval_hours != null) ? parseFloat(interval_hours) : null;
    const mc = (max_count != null) ? parseInt(max_count) : null;
    if (ih != null && (isNaN(ih) || ih < 0 || ih > 168))
      return res.status(400).json({ error: 'interval_hours: 0–168' });
    if (mc != null && (isNaN(mc) || mc < 1 || mc > 200))
      return res.status(400).json({ error: 'max_count: 1–200' });
    setBackupSettings({ interval_hours: ih, max_count: mc });
    res.json({ ok: true, ...getBackupSettings() });
  }));

  app.post('/api/backups/run-auto', wrap(async (req, res) => {
    if (!performAutoBackup) return res.status(501).json({ error: 'Не доступно' });
    const r = await performAutoBackup();
    if (r && r.ok === false) return res.status(500).json({ error: 'Автобэкап не создан: ' + r.error });
    res.json({ ok: true, ...(r || {}) });
  }));

  app.post('/api/backups/restore/:name', wrap((req, res) => {
    const src = path.join(BACKUP_DIR, req.params.name);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Not found' });
    fs.copyFileSync(src, path.join(__dirname, '..', 'survey.db'));
    try { fs.unlinkSync(path.join(__dirname, '..', 'survey.db-wal')); } catch(e) {}
    try { fs.unlinkSync(path.join(__dirname, '..', 'survey.db-shm')); } catch(e) {}
    if (fs.existsSync(src + '-wal')) fs.copyFileSync(src + '-wal', path.join(__dirname, '..', 'survey.db-wal'));
    res.json({ ok: true, message: 'Восстановлено. Перезапустите сервер.' });
  }));

  // ── LAYER EXPORT (DXF) ─────────────────────────────────────
  const { buildLayersDXF, saveDXF } = require('../dxf-writer');
  const { buildLayersMIF, encodeCp1251 } = require('../mif-writer');
  const { makeTransform, pickMsk86Zone, pickGsk2011Zone, mskFullZone } = require('../coord-transform');

  function geojsonBboxCenter(layers) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity, found = false;
    function visit(coord) {
      if (!Array.isArray(coord)) return;
      if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
        const [lng, lat] = coord;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        found = true;
      } else { coord.forEach(visit); }
    }
    for (const l of layers) {
      let gj = l.geojson;
      if (typeof gj === 'string') { try { gj = JSON.parse(gj); } catch (e) { continue; } }
      if (!gj) continue;
      const feats = gj.type === 'FeatureCollection' ? (gj.features || [])
        : gj.type === 'Feature' ? [gj] : [];
      feats.forEach(f => f && f.geometry && visit(f.geometry.coordinates));
    }
    if (!found) return { centerLng: 72, centerLat: 65 };
    return { centerLng: (minLng + maxLng) / 2, centerLat: (minLat + maxLat) / 2 };
  }

  function hexToDxfColor(hex) {
    if (!hex || typeof hex !== 'string') return 7;
    const h = hex.replace('#', '');
    if (h.length < 3) return 7;
    const r = parseInt(h.slice(0, 2), 16), g_ = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (r > 200 && g_ < 100 && b < 100) return 1;
    if (r < 100 && g_ > 150 && b < 100) return 3;
    if (r < 100 && g_ < 100 && b > 150) return 5;
    if (r > 200 && g_ > 200 && b < 100) return 2;
    if (r < 100 && g_ > 150 && b > 150) return 4;
    if (r > 200 && g_ < 100 && b > 150) return 6;
    return 7;
  }

  // ── KML export helper ──────────────────────────────────────
  function buildLayersKML(rows) {
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    function hexToKmlColor(hex, a) {
      const h = (hex||'#1a56db').replace('#','').padStart(6,'0');
      const aa = (a||255).toString(16).padStart(2,'0');
      return `${aa}${h.slice(4,6)}${h.slice(2,4)}${h.slice(0,2)}`;
    }
    function ringCoords(ring) {
      return ring.map(c=>`${c[0]},${c[1]},0`).join(' ');
    }
    function geoToKml(geo) {
      if (!geo) return '';
      const alt = '<altitudeMode>clampToGround</altitudeMode>';
      if (geo.type==='Point') {
        const [ln,lt]=geo.coordinates;
        return `<Point>${alt}<coordinates>${ln},${lt},0</coordinates></Point>`;
      }
      if (geo.type==='LineString') {
        return `<LineString>${alt}<coordinates>${ringCoords(geo.coordinates)}</coordinates></LineString>`;
      }
      if (geo.type==='MultiLineString') {
        const parts=geo.coordinates.map(l=>`<LineString>${alt}<coordinates>${ringCoords(l)}</coordinates></LineString>`);
        return `<MultiGeometry>${parts.join('')}</MultiGeometry>`;
      }
      if (geo.type==='Polygon') {
        const outer=`<outerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(geo.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>`;
        const inner=geo.coordinates.slice(1).map(r=>`<innerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
        return `<Polygon>${outer}${inner}</Polygon>`;
      }
      if (geo.type==='MultiPolygon') {
        const polys=geo.coordinates.map(poly=>{
          const outer=`<outerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(poly[0])}</coordinates></LinearRing></outerBoundaryIs>`;
          const inner=poly.slice(1).map(r=>`<innerBoundaryIs><LinearRing>${alt}<coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
          return `<Polygon>${outer}${inner}</Polygon>`;
        });
        return `<MultiGeometry>${polys.join('')}</MultiGeometry>`;
      }
      return '';
    }
    const styles = rows.map((r,i)=>{
      const lc=hexToKmlColor(r.color,255), fc=hexToKmlColor(r.color,80);
      return `<Style id="s${i}">
  <IconStyle><color>${lc}</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
  <LineStyle><color>${lc}</color><width>2.5</width></LineStyle>
  <PolyStyle><color>${fc}</color></PolyStyle>
  <LabelStyle><color>${lc}</color><scale>0.85</scale></LabelStyle>
</Style>`;
    }).join('\n');
    const folders = rows.map((r,i)=>{
      let gj; try{gj=JSON.parse(r.geojson);}catch(_){gj=null;}
      const features=(gj?.features||[gj]).filter(Boolean);
      const marks=features.map((f,fi)=>{
        const g=geoToKml(f?.geometry);
        if(!g)return '';
        const nm=esc(f?.properties?.name||f?.properties?.Name||`Объект ${fi+1}`);
        const desc=f?.properties?.description||f?.properties?.Description||'';
        return `<Placemark><name>${nm}</name>${desc?`<description>${esc(desc)}</description>`:''}<styleUrl>#s${i}</styleUrl>${g}</Placemark>`;
      }).filter(Boolean).join('\n');
      return `<Folder><name>${esc(r.name||'Слой')}</name>${marks}</Folder>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>Экспорт слоёв</name>\n${styles}\n${folders}\n</Document>\n</kml>`;
  }

  // Набор для экспорта: слои из базы (layerIds) или переданные объекты (inline:
  // [{name,color,geojson}]) — для экспорта отдельного объекта / выделения из меню ПКМ.
  const _exportRows = (req) => {
    const b = req.body || {};
    if (Array.isArray(b.inline) && b.inline.length)
      return b.inline.map((l, i) => ({ id: 'inline' + i, name: String(l.name || 'Объекты'), color: l.color || '#1a56db',
        geojson: typeof l.geojson === 'string' ? l.geojson : JSON.stringify(l.geojson || { type: 'FeatureCollection', features: [] }) }));
    if (!Array.isArray(b.layerIds) || !b.layerIds.length) return null;
    return all(db(), `SELECT id, name, geojson, color FROM kml_layers WHERE id IN (${b.layerIds.map(() => '?').join(',')})`, b.layerIds);
  };

  app.post('/api/layers/export-kml', wrap((req, res) => {
    const rows = _exportRows(req);
    if (!rows) return res.status(400).json({ error: 'layerIds required' });
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });
    const kml = buildLayersKML(rows);
    res.setHeader('Content-Type','application/vnd.google-earth.kml+xml; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="layers.kml"');
    res.send(kml);
  }));

  app.post('/api/layers/import-dxf', wrap((req, res) => {
    const { dxfText, crs, preview, onlyLayers, merge, mergeName, dry } = req.body || {};
    if (!dxfText) return res.status(400).json({ error: 'dxfText required' });
    const dxfLayers = parseDXF(dxfText);
    if (!dxfLayers.size) return res.status(422).json({ error: 'Нет слоёв в DXF' });
    // Предпросмотр: список слоёв DXF и состав объектов — для выбора перед импортом
    if (preview) {
      const list = [];
      for (const [name, ents] of dxfLayers) {
        const types = {};
        ents.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
        list.push({ name, count: ents.length, types });
      }
      return res.json({ layers: list, sampleX: _dxfFindFirstX(dxfLayers) });
    }
    if (Array.isArray(onlyLayers)) for (const k of [...dxfLayers.keys()]) if (!onlyLayers.includes(k)) dxfLayers.delete(k);
    if (!dxfLayers.size) return res.status(422).json({ error: 'Не выбрано ни одного слоя' });
    const sampleX = _dxfFindFirstX(dxfLayers);
    let inv;
    try { inv = makeDxfInverseTransform(crs || 'msk86', sampleX); }
    catch (e) { return res.status(400).json({ error: 'Неизвестная СК: ' + crs }); }
    const COLORS = ['#1a56db','#e02424','#057a55','#d97706','#7e3af2','#0694a2'];
    const created = [];
    let ci = 0;
    // dry: только разобрать — куда сохранить, пользователь выберет в окне «Куда загрузить»
    if (dry) {
      const groups = [];
      for (const [layerName, entities] of dxfLayers) {
        const features = dxfEntitiesToFeatures(entities, inv);
        if (features.length) groups.push({ name: layerName, features: features.map(f => ({ ...f, properties: { ...f.properties, 'Слой DXF': layerName } })) });
      }
      if (!groups.length) return res.status(422).json({ error: 'Нет геометрии в DXF' });
      return res.json({ groups });
    }
    if (merge) {
      // Все выбранные слои DXF → один слой карты (слой DXF сохраняется в атрибуте «Слой DXF»)
      const all = [];
      for (const [layerName, entities] of dxfLayers) dxfEntitiesToFeatures(entities, inv).forEach(f => { f.properties = { ...f.properties, 'Слой DXF': layerName }; all.push(f); });
      if (!all.length) return res.status(422).json({ error: 'Нет геометрии в DXF' });
      const id = uuid();
      run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
        [id, String(mergeName || 'DXF').slice(0, 200), JSON.stringify({ type:'FeatureCollection', features: all }), COLORS[0], '', '', 'solid']);
      return res.json({ layers: [{ id, name: mergeName || 'DXF', features: all.length }] });
    }
    for (const [layerName, entities] of dxfLayers) {
      const features = dxfEntitiesToFeatures(entities, inv);
      if (!features.length) continue;
      const id = uuid();
      const color = COLORS[ci++ % COLORS.length];
      run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
        [id, layerName, JSON.stringify({ type:'FeatureCollection', features }), color, '', '', 'solid']);
      created.push({ id, name: layerName, features: features.length });
    }
    if (!created.length) return res.status(422).json({ error: 'Нет геометрии в DXF' });
    res.json({ layers: created });
  }));

  // ── Импорт ESRI Shapefile (.shp/.dbf/.prj/.cpg или .zip) — без GDAL ─────
  // Ответы: {layers:[…]} | 409 {needCrs:true} (нет .prj) | 200 {notShp:true} (в архиве нет .shp)
  let _shpUpload = (req, res, next) => next();
  try { const _m = require('multer'); _shpUpload = _m({ storage: _m.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } }).array('files', 64); } catch (e) {}
  app.post('/api/layers/import-shp', _shpUpload, wrap((req, res) => {
    const { readShp, readDbf, prjToProj4 } = require('../shp-reader');
    const decode = s => { try { return Buffer.from(String(s || 'file'), 'latin1').toString('utf8'); } catch (e) { return String(s || 'file'); } };
    const sets = {};   // base → {shp, dbf, prj, cpg}
    const put = (name, buf) => {
      const m = name.match(/^(.*?)\.(shp|dbf|prj|cpg|shx|qpj)$/i); if (!m) return;
      const base = m[1].split(/[\\/]/).pop(), ext = m[2].toLowerCase();
      (sets[base] = sets[base] || {})[ext] = buf;
    };
    for (const f of (req.files || [])) {
      const nm = decode(f.originalname);
      if (/\.zip$/i.test(nm)) {
        try { const AdmZip = require('adm-zip'); new AdmZip(f.buffer).getEntries().forEach(en => { if (!en.isDirectory) put(en.entryName, en.getData()); }); }
        catch (e) { return res.status(400).json({ error: 'Не удалось распаковать архив' }); }
      } else put(nm, f.buffer);
    }
    const bases = Object.keys(sets).filter(b => sets[b].shp);
    if (!bases.length) return res.json({ notShp: true });
    const reqCrs = (req.body && typeof req.body.crs === 'string') ? req.body.crs : '';
    const swap = req.body && (req.body.swap === '1' || req.body.swap === 'true');
    const dry = req.body && (req.body.dry === '1' || req.body.dry === 'true');
    const groups = [];
    if (!reqCrs && bases.some(b => !sets[b].prj)) return res.status(409).json({ needCrs: true, error: 'В наборе нет файла .prj — укажите систему координат' });
    const COLORS = ['#1a56db','#e02424','#057a55','#d97706','#7e3af2','#0694a2'];
    const created = [], warn = [];
    bases.forEach((b, bi) => {
      const S = sets[b];
      let geoms; try { geoms = readShp(S.shp); } catch (e) { warn.push(`${b}: ${e.message}`); return; }
      const attrs = S.dbf ? readDbf(S.dbf, S.cpg ? S.cpg.toString('latin1') : null) : [];
      const projStr = reqCrs ? null : prjToProj4(S.prj.toString('utf8'), proj4);
      if (!reqCrs && !projStr) { warn.push(`${b}: не удалось разобрать .prj — выберите СК вручную`); return; }
      const first = geoms.find(Boolean);
      const sampleX = first ? (function f(c) { return typeof c[0] === 'number' ? c[0] : f(c[0]); })(first.coordinates) : 3500000;
      const geo = projStr && /^\+proj=longlat/.test(projStr) && /datum=WGS84/.test(projStr);
      let inv;
      try {
        if (geo) inv = (x, y) => [x, y];
        else if (projStr) inv = (x, y) => proj4(projStr, _DXF_WGS84, [x, y]);
        else { const raw = makeDxfInverseTransform(reqCrs, swap ? undefined : sampleX); inv = swap ? (x, y) => raw(y, x) : raw; }
      } catch (e) { warn.push(`${b}: неизвестная СК`); return; }
      const features = [];
      geoms.forEach((g, i) => {
        if (!g) return;
        const gj = { type: 'Feature', geometry: g, properties: { ...(attrs[i] || {}) } };
        try { _reprojectGeoJSON(gj, (x, y) => inv(x, y)); } catch (e) { return; }
        const p = gj.properties;
        if (!p.name) { const k = Object.keys(p).find(k => /^(name|имя|наим|назв|label|подпись|номер|num)/i.test(k)); if (k) p.name = String(p[k]); }
        features.push(gj);
      });
      if (!features.length) { warn.push(`${b}: нет объектов`); return; }
      if (dry) { groups.push({ name: b, features }); return; }
      const id = uuid();
      run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
        [id, b, JSON.stringify({ type: 'FeatureCollection', features }), COLORS[bi % COLORS.length], '', '', 'solid']);
      created.push({ id, name: b, features: features.length, crs: projStr ? (projStr.length > 120 ? 'WKT' : projStr) : reqCrs });
    });
    if (dry) { if (!groups.length) return res.status(422).json({ error: warn.join('; ') || 'Нет объектов' }); return res.json({ groups, warnings: warn }); }
    if (!created.length) return res.status(422).json({ error: warn.join('; ') || 'Нет объектов' });
    res.json({ layers: created, warnings: warn });
  }));

  // ── Импорт MapInfo TAB → слой KML (через ogr2ogr) ──────────
  // Принимает несколько файлов набора (.tab/.map/.id/.dat) или ZIP с ними.
  let _tabUpload = (req, res, next) => next();
  try {
    const _multer = require('multer');
    _tabUpload = _multer({ storage: _multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }).array('files', 16);
  } catch (e) {}
  app.post('/api/layers/import-tab', _tabUpload, wrap(async (req, res) => {
    if (!demProcessor || !demProcessor.convertToGeoJSON)
      return res.status(501).json({ error: 'Импорт TAB недоступен: на сервере нет GDAL/OSGeo4W' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Файлы не переданы' });

    const tmpDir = path.join(__dirname, '..', 'public', 'uploads', `_tabimp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} };
    try {
      const AdmZip = require('adm-zip');
      // Собираем все части набора в память (raw). Имена multipart приходят как
      // latin1 — декодируем в UTF-8, иначе кириллица «ломается» (мохито) и GDAL
      // не открывает файлы. ZIP распаковываем и добавляем его содержимое.
      const decode = s => { try { return Buffer.from(String(s || 'file'), 'latin1').toString('utf8'); } catch (e) { return String(s || 'file'); } };
      const entries = []; // { name, buffer }
      for (const f of files) {
        const nm = decode(f.originalname);
        if (/\.zip$/i.test(nm)) {
          const zdir = path.join(tmpDir, '_zip_' + Math.random().toString(36).slice(2));
          fs.mkdirSync(zdir, { recursive: true });
          try { new AdmZip(f.buffer).extractAllTo(zdir, true); } catch (e) {}
          const collect = d => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) collect(p); else entries.push({ name: n, buffer: fs.readFileSync(p) }); } };
          collect(zdir);
        } else {
          entries.push({ name: nm, buffer: f.buffer });
        }
      }
      // Переписываем набор под безопасными ASCII-именами с ОБЩИМ базовым именем
      // (imp0.tab/.map/.id/.dat), сохраняя исходное имя набора для названия слоя.
      const baseMap = {}; let gi = 0; const origBase = {};
      for (const e of entries) {
        const ext = ((e.name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
        const base = e.name.replace(/\.[^.]+$/, '');
        if (!(base in baseMap)) { baseMap[base] = 'imp' + (gi++); origBase[baseMap[base]] = base; }
        fs.writeFileSync(path.join(tmpDir, baseMap[base] + (ext ? '.' + ext : '')), e.buffer);
      }
      // Ищем .tab среди переписанных наборов
      let tabSafe = null;
      for (const sb of Object.values(baseMap)) { if (fs.existsSync(path.join(tmpDir, sb + '.tab'))) { tabSafe = sb; break; } }
      if (!tabSafe) { cleanup(); return res.status(400).json({ error: 'Не найден .tab. Загрузите весь набор (.tab, .map, .id, .dat) вместе или ZIP-архив с ними.' }); }
      const tabPath = path.join(tmpDir, tabSafe + '.tab');

      // Диагностика: перечень записанных частей набора с размерами
      const partsInfo = fs.readdirSync(tmpDir)
        .filter(n => /\.(tab|map|id|dat|ind)$/i.test(n))
        .map(n => `${n}=${fs.statSync(path.join(tmpDir, n)).size}б`).join(', ');

      const outGj = path.join(tmpDir, 'out.geojson');
      const reqCrs = (req.body && typeof req.body.crs === 'string') ? req.body.crs : '';
      let gj;

      if (reqCrs && reqCrs !== 'wgs84') {
        // Пользователь указал СК исходных метров (NonEarth/проекционная):
        // читаем координаты «как есть» и пересчитываем их сами в WGS-84.
        try { await demProcessor.convertToGeoJSONRaw(tabPath, outGj); }
        catch (e) { cleanup(); return res.status(501).json({ error: 'Не удалось прочитать TAB (нужен GDAL). Получено: ' + (partsInfo || 'нет') + '.' }); }
        try { gj = JSON.parse(fs.readFileSync(outGj, 'utf8')); } catch (e) { cleanup(); return res.status(422).json({ error: 'GeoJSON из TAB не разобран' }); }
        const forceSwap = req.body && (req.body.swap === '1' || req.body.swap === 'true');
        // Определяем восток первой точки (с учётом возможной перестановки X/Y)
        const p0 = _firstPoint(gj);
        let sampleE = 3500000;
        if (p0) sampleE = forceSwap ? p0[1] : _orderEN(p0[0], p0[1], reqCrs)[0];
        let rawInv;
        try { rawInv = makeDxfInverseTransform(reqCrs, sampleE || 3500000); }
        catch (e) { cleanup(); return res.status(400).json({ error: 'Неизвестная СК: ' + reqCrs }); }
        const inv = (c0, c1) => {
          const [e, n] = forceSwap ? [c1, c0] : _orderEN(c0, c1, reqCrs);
          return rawInv(e, n);
        };
        _reprojectGeoJSON(gj, inv);
        cleanup();
      } else {
        try { await demProcessor.convertToGeoJSON(tabPath, outGj); }
        catch (e) {
          const msg = (e.message || '');
          cleanup();
          // NonEarth / проекционная без пересчёта → просим клиент выбрать СК метров
          if (e.message === 'SRS_MISMATCH') {
            return res.status(422).json({ error: e.userMessage + ' Получено: ' + (partsInfo || 'нет') + '.', needCrs: true });
          }
          // Прочие понятные сообщения от конвертера
          if (e.userMessage) return res.status(422).json({ error: e.userMessage + ' Получено: ' + (partsInfo || 'нет') + '.' });
          // Частая причина — загружены не все файлы набора или .dat пустой
          const short = /Open\(\) failed for .*\.dat/i.test(msg)
            ? 'Не удалось открыть .DAT. Загрузите ВЕСЬ набор одним разом: .tab, .map, .id, .dat (и .ind, если есть). Получено: ' + (partsInfo || 'нет частей') + '.'
            : ('Не удалось прочитать TAB (нужен GDAL/OSGeo4W). Получено: ' + (partsInfo || 'нет') + '. ' + msg.slice(0, 200));
          return res.status(501).json({ error: short });
        }
        try { gj = JSON.parse(fs.readFileSync(outGj, 'utf8')); } catch (e) { cleanup(); return res.status(422).json({ error: 'GeoJSON из TAB не разобран' }); }
        cleanup();
      }
      const feats = (gj && gj.features) || [];
      if (!feats.length) return res.status(422).json({ error: 'В TAB нет объектов' });

      const name = (origBase[tabSafe] || 'MapInfo').replace(/\.tab$/i, '');
      if (req.body && (req.body.dry === '1' || req.body.dry === 'true')) return res.json({ groups: [{ name, features: feats }] });
      const id = uuid();
      run(db(), 'INSERT INTO kml_layers(id,name,geojson,color,visible,symbol,group_id,line_dash)VALUES(?,?,?,?,1,?,?,?)',
        [id, name, JSON.stringify(gj), '#1a56db', '', '', 'solid']);
      res.json({ layer: { id, name, features: feats.length } });
    } catch (e) { cleanup(); res.status(500).json({ error: 'Ошибка импорта TAB: ' + (e.message || '') }); }
  }));

  app.post('/api/layers/export-dxf', wrap(async (req, res) => {
    const { crs, filename } = req.body || {};
    const d = db();
    const rows = _exportRows(req);
    if (!rows) return res.status(400).json({ error: 'layerIds required' });
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });

    const { centerLng } = geojsonBboxCenter(rows);
    const crsKey = crs || 'wgs84';
    const transform = makeTransform(crsKey, centerLng);

    let zoneInfo = '';
    if (crsKey === 'msk86') zoneInfo = `_z${pickMsk86Zone(centerLng)}`;
    else if (crsKey === 'msk86_z3') zoneInfo = '_z3';
    else if (crsKey === 'msk86_z4') zoneInfo = '_z4';
    else if (crsKey === 'gsk2011') zoneInfo = `_z${pickGsk2011Zone(centerLng)}`;
    else if (typeof crsKey === 'string' && crsKey.indexOf('mskfull:') === 0) { const _p = crsKey.split(':'); const _z = mskFullZone(crsKey, centerLng); zoneInfo = `_MSK${_p[1]}${_z ? '_z' + _z : ''}`; }
    else if (crsKey === 'utmauto' || (typeof crsKey === 'string' && crsKey.indexOf('utm:') === 0)) { const _z = crsKey === 'utmauto' ? (Math.floor((((centerLng % 360) + 540) % 360) / 6) + 1) : parseInt(crsKey.split(':')[1], 10); zoneInfo = `_UTM${_z}N`; }

    const layers = rows.map(r => ({
      name: r.name,
      color: hexToDxfColor(r.color),
      geojson: r.geojson,
    }));
    const dxfStr = buildLayersDXF({ layers, transform });

    const safeName = (filename || `layers_${crsKey}${zoneInfo}.dxf`)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const tmpPath = path.join(__dirname, '..', 'public', 'uploads', `_dxf_${Date.now()}_${Math.random().toString(36).slice(2)}.dxf`);
    saveDXF(tmpPath, dxfStr);
    const stat = fs.statSync(tmpPath);
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Length', stat.size);
    _attach(res, safeName);
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(tmpPath); } catch (e) {} });
    stream.on('error', () => { try { fs.unlinkSync(tmpPath); } catch (e) {} });
  }));

  // ── Экспорт слоёв в MapInfo (MIF/MID, в ZIP) ───────────────
  app.post('/api/layers/export-mif', wrap((req, res) => {
    const { crs } = req.body || {};
    const d = db();
    const rows = _exportRows(req);
    if (!rows) return res.status(400).json({ error: 'layerIds required' });
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });

    const { centerLng } = geojsonBboxCenter(rows);
    const crsKey = crs || 'wgs84';
    const transform = makeTransform(crsKey, centerLng);
    const isGeo = crsKey === 'wgs84';

    let zoneInfo = '';
    if (crsKey === 'msk86') zoneInfo = `_z${pickMsk86Zone(centerLng)}`;
    else if (crsKey === 'msk86_z3') zoneInfo = '_z3';
    else if (crsKey === 'msk86_z4') zoneInfo = '_z4';
    else if (crsKey === 'gsk2011') zoneInfo = `_z${pickGsk2011Zone(centerLng)}`;
    else if (typeof crsKey === 'string' && crsKey.indexOf('mskfull:') === 0) { const _p = crsKey.split(':'); const _z = mskFullZone(crsKey, centerLng); zoneInfo = `_MSK${_p[1]}${_z ? '_z' + _z : ''}`; }
    else if (crsKey === 'utmauto' || (typeof crsKey === 'string' && crsKey.indexOf('utm:') === 0)) { const _z = crsKey === 'utmauto' ? (Math.floor((((centerLng % 360) + 540) % 360) / 6) + 1) : parseInt(crsKey.split(':')[1], 10); zoneInfo = `_UTM${_z}N`; }

    const { mif, mid } = buildLayersMIF({ layers: rows, transform, isGeo });
    const base = `layers_${crsKey}${zoneInfo}`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile(base + '.mif', encodeCp1251(mif));
    zip.addFile(base + '.mid', encodeCp1251(mid));
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', buf.length);
    _attach(res, `${base}.zip`);
    res.send(buf);
  }));

  // ── Экспорт слоёв в MapInfo TAB (нативный, через ogr2ogr) ──
  app.post('/api/layers/export-tab', wrap(async (req, res) => {
    const { crs } = req.body || {};
    const d = db();
    const rows = _exportRows(req);
    if (!rows) return res.status(400).json({ error: 'layerIds required' });
    if (!rows.length) return res.status(404).json({ error: 'Слои не найдены' });
    if (!demProcessor || !demProcessor.convertToTab)
      return res.status(501).json({ error: 'Экспорт в TAB недоступен на сервере' });

    const { centerLng } = geojsonBboxCenter(rows);
    const crsKey = crs || 'wgs84';
    const transform = makeTransform(crsKey, centerLng);
    const isGeo = crsKey === 'wgs84';

    let zoneInfo = '';
    if (crsKey === 'msk86') zoneInfo = `_z${pickMsk86Zone(centerLng)}`;
    else if (crsKey === 'msk86_z3') zoneInfo = '_z3';
    else if (crsKey === 'msk86_z4') zoneInfo = '_z4';
    else if (crsKey === 'gsk2011') zoneInfo = `_z${pickGsk2011Zone(centerLng)}`;
    else if (typeof crsKey === 'string' && crsKey.indexOf('mskfull:') === 0) { const _p = crsKey.split(':'); const _z = mskFullZone(crsKey, centerLng); zoneInfo = `_MSK${_p[1]}${_z ? '_z' + _z : ''}`; }
    else if (crsKey === 'utmauto' || (typeof crsKey === 'string' && crsKey.indexOf('utm:') === 0)) { const _z = crsKey === 'utmauto' ? (Math.floor((((centerLng % 360) + 540) % 360) / 6) + 1) : parseInt(crsKey.split(':')[1], 10); zoneInfo = `_UTM${_z}N`; }

    const base = `layers_${crsKey}${zoneInfo}`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const { mif, mid } = buildLayersMIF({ layers: rows, transform, isGeo });

    // Временная папка: MIF/MID → ogr2ogr → TAB-набор
    const tmpDir = path.join(__dirname, '..', 'public', 'uploads', `_tab_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} };
    try {
      fs.writeFileSync(path.join(tmpDir, base + '.mif'), encodeCp1251(mif));
      fs.writeFileSync(path.join(tmpDir, base + '.mid'), encodeCp1251(mid));
      let tabFiles;
      try {
        tabFiles = await demProcessor.convertToTab(path.join(tmpDir, base + '.mif'), path.join(tmpDir, base + '.tab'));
      } catch (e) {
        cleanup();
        return res.status(501).json({ error: 'Для .TAB нужен установленный GDAL/OSGeo4W (как для выгрузки рельефа). ' + (e.message || '') });
      }
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      tabFiles.forEach(fp => zip.addLocalFile(fp));
      const buf = zip.toBuffer();
      cleanup();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', buf.length);
      _attach(res, `${base}_tab.zip`);
      res.send(buf);
    } catch (e) {
      cleanup();
      res.status(500).json({ error: 'Ошибка экспорта TAB: ' + (e.message || '') });
    }
  }));

  // ── DEM EXPORT ─────────────────────────────────────────────
  app.get('/api/dem/status', async (req, res) => {
    if (!demProcessor) return res.json({ available: false, reason: 'dem-processor не загружен' });
    res.json(await demProcessor.checkGDAL());
  });

  // Диагностика и ручной запуск скачивания геоид-гридов
  app.post('/api/dem/download-geoid-grids', async (req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'no processor' });
    demProcessor._resetGeoidCheck();
    const before = await demProcessor.checkGDAL();
    await demProcessor._downloadGeoidGrids();
    const after = await demProcessor.checkGDAL();
    res.json({ before: before.geoid_grids, after: after.geoid_grids });
  });

  app.get('/api/dem/tiles-info', (req, res) => {
    if (!demProcessor) return res.json({ dir: '', tiles: [], exists: false });
    res.json(demProcessor.getDemTilesInfo());
  });

  // GET /api/dem/tiles-bbox — bbox каждого кэшированного тайла (из имени файла)
  app.get('/api/dem/tiles-bbox', (req, res) => {
    if (!demProcessor) return res.json([]);
    const info = demProcessor.getDemTilesInfo();
    const result = (info.tiles || []).map(t => {
      const m = t.name.match(/^dem_([-\d.]+)_([-\d.]+)_([-\d.]+)_([-\d.]+)\.tif$/i);
      if (!m) return null;
      return {
        file: t.name,
        size: t.size,
        bbox: { minLng: parseFloat(m[1]), minLat: parseFloat(m[2]), maxLng: parseFloat(m[3]), maxLat: parseFloat(m[4]) },
      };
    }).filter(Boolean);
    res.json(result);
  });

  app.delete('/api/dem/tiles', (req, res) => {
    if (!demProcessor) return res.json({ deleted: 0 });
    const info = demProcessor.getDemTilesInfo();
    let deleted = 0;
    for (const t of (info.tiles || [])) {
      try { fs.unlinkSync(require('path').join(info.dir, t.name)); deleted++; } catch(_) {}
    }
    res.json({ deleted });
  });

  // POST /api/dem/tiles/clear-bbox — удалить только кэш-тайлы, ПЕРЕСЕКАЮЩИЕ рамку
  app.post('/api/dem/tiles/clear-bbox', (req, res) => {
    if (!demProcessor) return res.json({ deleted: 0, names: [] });
    const b = req.body && req.body.bbox;
    if (!b || b.minLng == null || b.minLat == null || b.maxLng == null || b.maxLat == null)
      return res.status(400).json({ error: 'bbox required' });
    const sMinLng = Math.min(+b.minLng, +b.maxLng), sMaxLng = Math.max(+b.minLng, +b.maxLng);
    const sMinLat = Math.min(+b.minLat, +b.maxLat), sMaxLat = Math.max(+b.minLat, +b.maxLat);
    const info = demProcessor.getDemTilesInfo();
    const names = [];
    for (const t of (info.tiles || [])) {
      const m = t.name.match(/^dem_([-\d.]+)_([-\d.]+)_([-\d.]+)_([-\d.]+)\.tif$/i);
      if (!m) continue;
      const tMinLng = +m[1], tMinLat = +m[2], tMaxLng = +m[3], tMaxLat = +m[4];
      // пересечение прямоугольников по обеим осям
      const overlap = !(tMaxLng < sMinLng || tMinLng > sMaxLng || tMaxLat < sMinLat || tMinLat > sMaxLat);
      if (!overlap) continue;
      try { fs.unlinkSync(require('path').join(info.dir, t.name)); names.push(t.name); } catch(_) {}
    }
    res.json({ deleted: names.length, names });
  });

  // GET /api/dem/tiles-dir — текущий путь к папке тайлов
  app.get('/api/dem/tiles-dir', (req, res) => {
    const dir = demProcessor ? demProcessor.getDemTilesDir() : '';
    res.json({ dir });
  });

  // PUT /api/dem/tiles-dir — сменить путь, создать папку, сохранить в настройках
  app.put('/api/dem/tiles-dir', wrap((req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'dem-processor не загружен' });
    const rawDir = (req.body.dir || '').trim();
    if (!rawDir) return res.status(400).json({ error: 'Путь не указан' });
    const resolved = path.resolve(rawDir);
    try {
      if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    } catch(e) {
      return res.status(400).json({ error: `Не удалось создать папку: ${e.message}` });
    }
    demProcessor.setDemTilesDir(resolved);
    run(db(), "INSERT OR REPLACE INTO app_settings(key,value) VALUES('dem_tiles_dir',?)", [resolved]);
    res.json({ ok: true, dir: resolved });
  }));

  app.get('/api/elevation/point', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat и lng обязательны' });
    if (!demProcessor || !demProcessor.getElevationAtPoint) return res.json({ elevation: null, error: 'no_processor' });
    try {
      const result = await demProcessor.getElevationAtPoint(lat, lng);
      res.json(result);
    } catch(e) {
      res.json({ elevation: null, error: e.message });
    }
  });

  // POST /api/elevation/profile  body: [{lat,lng}, ...]
  // Возвращает { values:[<число|null>...], geoidApplied:bool } или null если нет тайлов
  app.post('/api/elevation/profile', async (req, res) => {
    if (!demProcessor || !demProcessor.getElevationProfile) return res.json(null);
    const points = req.body;
    if (!Array.isArray(points) || points.length === 0) return res.status(400).json({ error: 'points required' });
    try {
      const elevs = await demProcessor.getElevationProfile(points);
      res.json(elevs);
    } catch(e) {
      console.error('[/api/elevation/profile]', e.message);
      res.json(null);
    }
  });

  app.get('/api/dem/geoid-n', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat и lng обязательны' });
    if (!demProcessor || !demProcessor.computeGeoidN) return res.json({ n: null });
    try {
      const n = await demProcessor.computeGeoidN(lat, lng);
      res.json({ n });
    } catch(e) {
      res.json({ n: null });
    }
  });

  app.post('/api/dem/export', async (req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'DEM процессор не доступен' });
    const { bbox, clip, projId, proj4, epsg, projName, format, interval, useGeoid, gridStep, jitterMin, jitterMax, exportSatellite, satelliteOnly, cacheOnly, satZoom, satMPP, satSourceUrl, satSourceSubdomains } = req.body;
    if (!bbox || !bbox.minLat) return res.status(400).json({ error: 'Не указана область (bbox)' });
    let tmpDir = null;
    try {
      const result = await demProcessor.processDEM({
        bbox, clip, projId, proj4, epsg, projName,
        format: format || 'dxf',
        interval: parseFloat(interval) || 2,
        useGeoid: useGeoid !== false,
        gridStep: (gridStep !== undefined && gridStep !== null && gridStep !== '') ? parseInt(gridStep) : 20,
        jitterMin: parseFloat(jitterMin) || 0,
        jitterMax: parseFloat(jitterMax) || 0,
        exportSatellite: exportSatellite !== false,
        satelliteOnly: !!satelliteOnly,
        cacheOnly: !!cacheOnly,
        satZoom: parseInt(satZoom) || 0,
        satMPP: parseFloat(satMPP) || 0,
        satSourceUrl: satSourceUrl || null,
        satSourceSubdomains: satSourceSubdomains || [],
        onProgress: (pct, text) => {
          console.log(`[DEM] ${pct}% - ${text}`);
          broadcast({ type: 'dem_progress', pct, text });
        },
      });
      tmpDir = result.tmpDir;

      // Режим «только кэш»: файл не отдаём, отвечаем JSON
      if (result.cacheOnly) {
        demProcessor.cleanupTmp(tmpDir);
        return res.json({ ok: true, cacheOnly: true, cached: result.cached });
      }

      const stat = fs.statSync(result.file);
      res.setHeader('Content-Type', result.mime || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(result.file)}"`);
      if (result.interval != null) { res.setHeader('X-Dem-Interval', String(result.interval)); res.setHeader('X-Dem-Interval-Requested', String(result.requestedInterval)); }
      if (result.geoid != null) res.setHeader('X-Dem-Geoid', result.geoid ? '1' : '0');
      run(db(), `INSERT INTO app_settings(key,value) VALUES('dem_export_count',1)
        ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)`, []);
      const stream = fs.createReadStream(result.file);
      stream.pipe(res);
      stream.on('end', () => demProcessor.cleanupTmp(tmpDir));
      stream.on('error', (err) => { demProcessor.cleanupTmp(tmpDir); console.error('[DEM] Stream error:', err); });
    } catch (err) {
      if (tmpDir) demProcessor.cleanupTmp(tmpDir);
      res.status(500).json({
        error: err.message || 'Ошибка обработки DEM',
        hint: (err.message.includes('GDAL') || err.message.includes('gdalwarp'))
          ? 'Проверьте установку GDAL (OSGeo4W).' : null,
      });
    }
  });

  // ── Зоны затопления: область + отметка БСВ-77 → GeoJSON-полигоны (WGS-84) ──
  // body: { bbox, clip?, level, minArea?, waterAsFlood?, connectedOnly? }
  app.post('/api/dem/flood', async (req, res) => {
    if (!demProcessor || !demProcessor.floodZones) return res.status(503).json({ error: 'DEM процессор не доступен' });
    const b = req.body || {};
    const bb = b.bbox || {};
    if (![bb.minLat, bb.maxLat, bb.minLng, bb.maxLng].every(v => Number.isFinite(+v)) || +bb.minLat >= +bb.maxLat || +bb.minLng >= +bb.maxLng)
      return res.status(400).json({ error: 'Не указана область расчёта' });
    const level = parseFloat(String(b.level).replace(',', '.'));
    if (!Number.isFinite(level) || level < -500 || level > 9000) return res.status(400).json({ error: 'Укажите отметку уровня воды (м, БСВ-77)' });
    const bbox = { minLat: +bb.minLat, maxLat: +bb.maxLat, minLng: +bb.minLng, maxLng: +bb.maxLng };
    const km2 = (bbox.maxLat - bbox.minLat) * 111.32 * (bbox.maxLng - bbox.minLng) * 111.32 * Math.cos((bbox.minLat + bbox.maxLat) / 2 * Math.PI / 180);
    if (km2 > 2500) return res.status(400).json({ error: `Область слишком большая (${Math.round(km2)} км²) — не больше 2500 км²` });
    try {
      const gj = await demProcessor.floodZones({
        bbox, clip: b.clip || null, level,
        minArea: Math.max(0, parseFloat(b.minArea) || 0),
        waterAsFlood: b.waterAsFlood !== false, connectedOnly: !!b.connectedOnly,
        onProgress: (pct, text) => broadcast({ type: 'flood_progress', pct, text }),
      });
      res.json(gj);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Ошибка расчёта затопления' });
    }
  });

  // ── Пакетная выгрузка рельефа: несколько участков (полигонов слоя) → один ZIP ──
  // body: { items:[{name,bbox,clip,proj4,projId,epsg,projName}], ...общие параметры как у /dem/export }
  // Участки обрабатываются по очереди; каждый — в своей папке архива; ошибки — в «Отчёт.txt».
  app.post('/api/dem/export-batch', async (req, res) => {
    if (!demProcessor) return res.status(503).json({ error: 'DEM процессор не доступен' });
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.filter(it => it && it.bbox && it.bbox.minLat != null) : [];
    if (!items.length) return res.status(400).json({ error: 'Нет участков для выгрузки' });
    if (items.length > 200) return res.status(400).json({ error: 'Слишком много участков (макс. 200)' });
    const AdmZip = require('adm-zip');
    const out = new AdmZip();
    const report = [`Пакетная выгрузка рельефа — ${new Date().toLocaleString('ru-RU')}`, `Участков: ${items.length}`, ''];
    const used = new Set();
    const safe = n => { let s0 = String(n || 'Участок').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'Участок', s1 = s0, k = 2; while (used.has(s1.toLowerCase())) s1 = `${s0}_${k++}`; used.add(s1.toLowerCase()); return s1; };
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], folder = safe(it.name || `Участок ${i + 1}`);
      const pref = `Участок ${i + 1}/${items.length} «${folder}»`;
      let tmpDir = null;
      try {
        broadcast({ type: 'dem_progress', pct: Math.round(i / items.length * 100), text: `${pref}: начинаю…` });
        const r = await demProcessor.processDEM({
          bbox: it.bbox, clip: it.clip || null, projId: it.projId, proj4: it.proj4, epsg: it.epsg, projName: it.projName,
          format: 'dxf', interval: parseFloat(b.interval) || 2, useGeoid: b.useGeoid !== false,
          gridStep: (b.gridStep !== undefined && b.gridStep !== null && b.gridStep !== '') ? parseInt(b.gridStep) : 20,
          jitterMin: parseFloat(b.jitterMin) || 0, jitterMax: parseFloat(b.jitterMax) || 0,
          exportSatellite: b.exportSatellite !== false, satelliteOnly: !!b.satelliteOnly, cacheOnly: false,
          satZoom: parseInt(b.satZoom) || 0, satMPP: parseFloat(b.satMPP) || 0,
          satSourceUrl: b.satSourceUrl || null, satSourceSubdomains: b.satSourceSubdomains || [],
          onProgress: (pct, text) => broadcast({ type: 'dem_progress', pct: Math.round((i + pct / 100) / items.length * 100), text: `${pref}: ${text}` }),
        });
        tmpDir = r.tmpDir;
        if (/\.zip$/i.test(r.file)) new AdmZip(r.file).getEntries().forEach(en => { if (!en.isDirectory) out.addFile(`${folder}/${en.entryName}`, en.getData()); });
        else out.addLocalFile(r.file, folder);
        report.push(`✅ ${folder} — ${it.projName || it.projId || ''}` +
          (r.interval != null && r.interval !== r.requestedInterval ? ` · шаг горизонталей ${r.interval} м вместо ${r.requestedInterval} м (плоский участок)` : '') +
          (r.geoid === false ? ' · ⚠ высоты НЕ в БСВ-77 (нет файлов геоида)' : ''));
        ok++;
      } catch (e) {
        report.push(`❌ ${folder} — ${e.message || e}`);
        console.error('[DEM batch]', folder, e.message);
      } finally { if (tmpDir) demProcessor.cleanupTmp(tmpDir); }
    }
    if (!ok) return res.status(500).json({ error: 'Ни один участок не выгружен:\n' + report.slice(3).join('\n') });
    report.push('', `Выгружено: ${ok} из ${items.length}`);
    out.addFile('Отчёт.txt', Buffer.from('\uFEFF' + report.join('\r\n'), 'utf8'));
    broadcast({ type: 'dem_progress', pct: 100, text: `Готово: ${ok} из ${items.length}` });
    const buf = out.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `attachment; filename="dem_batch.zip"`);
    res.end(buf);
  });

  // ── Офлайн тайлы для HTML-экспорта ───────────────────────
  app.post('/api/export-tiles', async (req, res) => {
    const { bbox, minZoom, maxZoom, source } = req.body || {};
    if (!bbox || minZoom == null || maxZoom == null)
      return res.status(400).json({ error: 'bad_params' });

    function lng2t(lng, z) { return Math.floor((lng + 180) / 360 * (1 << z)); }
    function lat2t(lat, z) {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
    }

    const list = [];
    for (let z = Math.max(0, minZoom); z <= Math.min(20, maxZoom); z++) {
      const x1 = lng2t(bbox.minLng, z), x2 = lng2t(bbox.maxLng, z);
      const y1 = lat2t(bbox.maxLat, z), y2 = lat2t(bbox.minLat, z);
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
          list.push({ z, x, y });
    }

    const MAX = 1500;
    if (list.length > MAX)
      return res.json({ error: 'too_many_tiles', count: list.length, max: MAX });

    const isSat = source === 'sat';
    const tiles = {};
    const BATCH = 8;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(list.slice(i, i + BATCH).map(async ({ z, x, y }) => {
        const url = isSat
          ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
          : `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return;
          const buf = await r.arrayBuffer();
          tiles[`${z}/${x}/${y}`] = Buffer.from(buf).toString('base64');
        } catch (e) { /* skip failed tile */ }
      }));
    }

    res.json({ tiles, count: Object.keys(tiles).length });
  });
};
// Для автотестов (tests/): внутренние функции разбора DXF и пересчёта
module.exports._test = { parseDXF, dxfEntitiesToFeatures, makeDxfInverseTransform, _dxfSplinePoints, _dxfHatchRings };
