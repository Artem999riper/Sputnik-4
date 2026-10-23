// ═══════════════════════════════════════════════════════════
// shp-reader.js — чтение ESRI Shapefile без GDAL:
//   .shp (геометрия: точки, мультиточки, линии, полигоны, в т.ч. Z/M),
//   .dbf (атрибуты; кодировка из .cpg / байта LDID / автоопределение),
//   .prj (WKT → строка proj4; для Пулково/Красовского без TOWGS84
//         подставляются параметры ГОСТ Р 51794-2008, как в остальной программе).
// ═══════════════════════════════════════════════════════════
const SK42_TOWGS = '23.57,-140.95,-79.8,0,0.35,0.79,-0.22';
const SK95_TOWGS = '24.47,-130.89,-81.56,0,0,0.13,-0.22';
const GSK_TOWGS  = '0.013,-0.092,-0.03,-0.001738,0.003559,-0.004263,0.0074';

// ── .shp ───────────────────────────────────────────────────
function _ringArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[i][0] - r[j][0]) * (r[i][1] + r[j][1]); return s / 2; } // >0 — по часовой
function _inRing(pt, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function readShp(buf) {
  const out = [];
  if (!buf || buf.length < 100 || buf.readInt32BE(0) !== 9994) throw new Error('Файл .shp повреждён или это не Shapefile');
  let off = 100;
  while (off + 8 <= buf.length) {
    const lenW = buf.readInt32BE(off + 4), cOff = off + 8, end = cOff + lenW * 2;
    off = end;
    if (end > buf.length || lenW < 2) { out.push(null); continue; }
    const t = buf.readInt32LE(cOff);
    const hasZ = t === 11 || t === 13 || t === 15 || t === 18;
    try {
      if (t === 0) { out.push(null); continue; }
      if (t === 1 || t === 11 || t === 21) {
        const c = [buf.readDoubleLE(cOff + 4), buf.readDoubleLE(cOff + 12)];
        if (hasZ && end - cOff >= 28) c.push(buf.readDoubleLE(cOff + 20));
        out.push({ type: 'Point', coordinates: c }); continue;
      }
      if (t === 8 || t === 18 || t === 28) {
        const n = buf.readInt32LE(cOff + 36), p0 = cOff + 40, pts = [];
        for (let i = 0; i < n; i++) pts.push([buf.readDoubleLE(p0 + i * 16), buf.readDoubleLE(p0 + i * 16 + 8)]);
        if (hasZ) { const z0 = p0 + n * 16 + 16; for (let i = 0; i < n && z0 + i * 8 + 8 <= end; i++) pts[i].push(buf.readDoubleLE(z0 + i * 8)); }
        out.push(n === 1 ? { type: 'Point', coordinates: pts[0] } : { type: 'MultiPoint', coordinates: pts }); continue;
      }
      if (t === 3 || t === 13 || t === 23 || t === 5 || t === 15 || t === 25) {
        const np = buf.readInt32LE(cOff + 36), n = buf.readInt32LE(cOff + 40);
        const partsOff = cOff + 44, ptsOff = partsOff + np * 4;
        const starts = []; for (let i = 0; i < np; i++) starts.push(buf.readInt32LE(partsOff + i * 4));
        const pts = []; for (let i = 0; i < n; i++) pts.push([buf.readDoubleLE(ptsOff + i * 16), buf.readDoubleLE(ptsOff + i * 16 + 8)]);
        if (hasZ) { const z0 = ptsOff + n * 16 + 16; for (let i = 0; i < n && z0 + i * 8 + 8 <= end; i++) pts[i].push(buf.readDoubleLE(z0 + i * 8)); }
        const parts = starts.map((s, i) => pts.slice(s, i + 1 < np ? starts[i + 1] : n)).filter(p => p.length);
        if (t === 3 || t === 13 || t === 23) {
          out.push(parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts }); continue;
        }
        // Полигоны: внешние кольца по часовой, дыры — против; дыру относим к охватывающему внешнему
        const polys = [], holes = [];
        parts.forEach(r => { if (r.length < 4) return; (_ringArea(r) >= 0 ? polys : holes).push(r); });
        if (!polys.length && holes.length) { holes.forEach(h => polys.push(h.slice().reverse())); holes.length = 0; }
        const P = polys.map(r => [r]);
        holes.forEach(h => { const host = P.find(p => _inRing(h[0], p[0])); if (host) host.push(h); else P.push([h.slice().reverse()]); });
        // GeoJSON: внешнее кольцо — против часовой (RFC 7946)
        P.forEach(p => { p[0].reverse(); for (let i = 1; i < p.length; i++) p[i].reverse(); });
        out.push(!P.length ? null : P.length === 1 ? { type: 'Polygon', coordinates: P[0] } : { type: 'MultiPolygon', coordinates: P });
        continue;
      }
      out.push(null);    // MultiPatch и прочее — не поддерживаем
    } catch (e) { out.push(null); }
  }
  return out;
}

// ── .dbf ───────────────────────────────────────────────────
const _LDID = { 0x57: 'windows-1251', 0xC9: 'windows-1251', 0x26: 'ibm866', 0x65: 'ibm866', 0x03: 'windows-1252', 0x01: 'ibm437' };
function _decoder(enc) { try { return new TextDecoder(enc); } catch (e) { return new TextDecoder('utf-8'); } }
function readDbf(buf, cpg) {
  if (!buf || buf.length < 32) return [];
  const nRec = buf.readUInt32LE(4), hLen = buf.readUInt16LE(8), rLen = buf.readUInt16LE(10);
  let enc = null;
  if (cpg) { const c = String(cpg).trim().toLowerCase(); enc = /1251/.test(c) ? 'windows-1251' : /866/.test(c) ? 'ibm866' : /utf/.test(c) ? 'utf-8' : /1252|8859-1|latin/.test(c) ? 'windows-1252' : null; }
  if (!enc && _LDID[buf[29]]) enc = _LDID[buf[29]];
  const fields = [];
  for (let o = 32; o + 32 <= hLen && buf[o] !== 0x0D; o += 32) {
    fields.push({ name: buf.slice(o, o + 11).toString('latin1').replace(/\0.*$/, '').trim(), type: String.fromCharCode(buf[o + 11]), len: buf[o + 16], dec: buf[o + 17], rawName: buf.slice(o, o + 11) });
  }
  // Кодировка не указана: если текст не валиден как UTF-8 — считаем Windows-1251
  if (!enc) {
    const sample = buf.slice(hLen, Math.min(buf.length, hLen + rLen * 200));
    try { new TextDecoder('utf-8', { fatal: true }).decode(sample); enc = 'utf-8'; } catch (e) { enc = 'windows-1251'; }
  }
  const dec = _decoder(enc);
  fields.forEach(f => { f.name = dec.decode(f.rawName).replace(/\0.*$/, '').trim() || f.name; });
  const recs = [];
  for (let r = 0; r < nRec; r++) {
    const o = hLen + r * rLen;
    if (o + rLen > buf.length) break;
    const row = {};
    let p = o + 1;
    for (const f of fields) {
      const raw = dec.decode(buf.slice(p, p + f.len)).trim();
      p += f.len;
      if (raw === '' || /^\*+$/.test(raw)) { row[f.name] = ''; continue; }
      if (f.type === 'N' || f.type === 'F') { const v = parseFloat(raw); row[f.name] = isFinite(v) ? v : raw; }
      else if (f.type === 'L') row[f.name] = /^[YyTt]/.test(raw);
      else if (f.type === 'D' && /^\d{8}$/.test(raw)) row[f.name] = `${raw.slice(6, 8)}.${raw.slice(4, 6)}.${raw.slice(0, 4)}`;
      else row[f.name] = raw;
    }
    recs.push(row);
  }
  return recs;
}

// ── .prj (WKT) → proj4 ─────────────────────────────────────
function prjToProj4(wkt, proj4) {
  if (!wkt) return null;
  const W = String(wkt);
  const num = re => { const m = W.match(re); return m ? parseFloat(m[1]) : null; };
  const par = n => num(new RegExp('PARAMETER\\s*\\[\\s*"' + n + '"\\s*,\\s*(-?[\\d.eE+-]+)', 'i'));
  const sph = W.match(/SPHEROID\s*\[\s*"([^"]*)"\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  const tw = W.match(/TOWGS84\s*\[([^\]]+)\]/i);
  const name = (W.match(/^\s*(?:PROJCS|GEOGCS)\s*\[\s*"([^"]*)"/i) || [])[1] || '';
  const all = (name + ' ' + (sph ? sph[1] : '')).toLowerCase();
  let ell;
  if (sph) {
    const a = +sph[2], rf = +sph[3];
    if (Math.abs(a - 6378137) < 0.5 && Math.abs(rf - 298.257223563) < 1e-6) ell = '+datum=WGS84';
    else if (Math.abs(a - 6378245) < 0.5) ell = '+ellps=krass';
    else ell = `+a=${a} +rf=${rf}`;
  } else ell = '+datum=WGS84';
  let towgs = '';
  if (ell !== '+datum=WGS84') {
    if (tw) towgs = ' +towgs84=' + tw[1].split(',').map(s => s.trim()).join(',');
    else if (/2011|gsk|гск/.test(all)) towgs = ' +towgs84=' + GSK_TOWGS;
    else if (/95|ск-95|sk-95|sk95/.test(all)) towgs = ' +towgs84=' + SK95_TOWGS;
    else if (ell === '+ellps=krass') towgs = ' +towgs84=' + SK42_TOWGS;     // Пулково-1942, МСК
  }
  if (/^\s*GEOGCS/i.test(W)) return `+proj=longlat ${ell}${towgs} +no_defs`;
  if (/Transverse_Mercator|Gauss/i.test(W)) {
    const lon0 = par('central_meridian') ?? par('longitude_of_center') ?? 0;
    const lat0 = par('latitude_of_origin') ?? 0;
    const k = par('scale_factor') ?? 1;
    const x0 = par('false_easting') ?? 0, y0 = par('false_northing') ?? 0;
    const units = [...W.matchAll(/UNIT\s*\[\s*"[^"]*"\s*,\s*([\d.]+)/gi)];   // последний UNIT — линейные единицы проекции
    const unit = units.length ? parseFloat(units[units.length - 1][1]) : 1;
    const u = unit && Math.abs(unit - 1) > 1e-9 ? ` +to_meter=${unit}` : ' +units=m';
    return `+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=${k} +x_0=${x0} +y_0=${y0} ${ell}${towgs}${u} +no_defs`;
  }
  // Прочие проекции — пусть разберёт сам proj4 (если сможет)
  try { proj4(W, '+proj=longlat +datum=WGS84 +no_defs', [0, 0]); return W; } catch (e) { return null; }
}

module.exports = { readShp, readDbf, prjToProj4 };
