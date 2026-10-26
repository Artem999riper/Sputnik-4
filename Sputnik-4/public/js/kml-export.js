// ═══════════════════════════════════════════════════════════
// kml-export.js — экспорт из меню ПКМ: объект, весь слой или выделенное
// (область) → DXF, KML, MapInfo MIF/MID, TAB, GeoJSON, GPX, CSV координат.
// DXF/KML/MIF/TAB — на сервере (как экспорт слоёв), остальное — в браузере.
// ═══════════════════════════════════════════════════════════
const KEX_FMT = [
  ['dxf', 'DXF', 'AutoCAD, МенуГЕО', true],
  ['kml', 'KML', 'Google Earth, QGIS', false],
  ['mif', 'MIF/MID', 'MapInfo', true],
  ['tab', 'TAB', 'MapInfo (нужен GDAL)', true],
  ['geojson', 'GeoJSON', 'QGIS, веб', false],
  ['gpx', 'GPX', 'навигаторы, GPS', false],
  ['csv', 'CSV', 'координаты вершин для Excel', true],
];
// Варианты «что выгружать»: [{key,label,parts:[{name,color,features}]}]
function kmlExportDialog(choices, defName) {
  choices = choices.filter(c => c.parts.some(p => p.features.length));
  if (!choices.length) { toast('Нечего экспортировать', 'warn'); return; }
  let last = {}; try { last = JSON.parse(localStorage.getItem('kex_last') || '{}'); } catch (e) {}
  const fmt0 = last.fmt || 'dxf';
  const crsHtml = `
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="wgs84"> WGS-84 (градусы)</label>
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="msk86" checked> МСК-86 (авто зона)</label>
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="msk86_z3"> МСК-86 зона 3</label>
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="msk86_z4"> МСК-86 зона 4</label>
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="gsk2011"> ГСК-2011 (6° зоны)</label>
    <label style="display:block;padding:2px 0"><input type="radio" name="kex-crs" value="utmauto"> UTM / WGS-84 (авто зона)</label>
    ${typeof _mskFullPickerHtml === 'function' ? _mskFullPickerHtml('kex', '2px') : ''}`;
  showModal('📤 Экспорт', `<div style="display:flex;flex-direction:column;gap:10px;min-width:min(520px,86vw)">
    <div><div style="font-weight:700;font-size:12px;margin-bottom:4px">Что выгрузить</div>
      ${choices.map((c, i) => `<label style="display:flex;gap:6px;align-items:center;padding:2px 0;font-size:12px;text-transform:none;font-weight:500"><input type="radio" name="kex-what" value="${i}" ${i === 0 ? 'checked' : ''} style="width:auto;margin:0"> ${c.label}
        <span style="color:var(--tx3);font-size:10px">— ${c.parts.reduce((s, p) => s + p.features.length, 0)} объект(ов)</span></label>`).join('')}</div>
    <div><div style="font-weight:700;font-size:12px;margin-bottom:4px">Формат</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px">
      ${KEX_FMT.map(([k, n, d]) => `<label class="kex-card" style="display:flex;gap:6px;align-items:center;padding:6px 8px;border:1.5px solid ${k === fmt0 ? 'var(--acc)' : 'var(--bd)'};border-radius:var(--rs);cursor:pointer;background:var(--s2);text-transform:none;margin:0">
        <input type="radio" name="kex-fmt" value="${k}" ${k === fmt0 ? 'checked' : ''} onchange="_kexFmt()" style="width:auto;margin:0"><div><div style="font-weight:700;font-size:12px">${n}</div><div style="font-size:10px;color:var(--tx3);font-weight:400">${d}</div></div></label>`).join('')}</div></div>
    <div id="kex-crs-row"><div style="font-weight:700;font-size:12px;margin-bottom:4px">Система координат</div>${crsHtml}</div>
    <div class="fg" style="margin:0"><label>Имя файла</label><input id="kex-name" value="${escAttr(String(defName || 'export').replace(/[\\/:*?"<>|]+/g, '_'))}"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '📤 Скачать', cls: 'bp', fn: () => {
    const c = choices[+(document.querySelector('input[name="kex-what"]:checked') || {}).value || 0];
    const fmt = (document.querySelector('input[name="kex-fmt"]:checked') || {}).value || 'dxf';
    const crs = typeof _mskReadCrs === 'function' ? _mskReadCrs('kex', 'wgs84') : 'wgs84';
    const name = (document.getElementById('kex-name').value || 'export').trim().replace(/[\\/:*?"<>|]+/g, '_');
    try { localStorage.setItem('kex_last', JSON.stringify({ fmt, crs })); } catch (e) {}
    closeModal();
    _kexRun(c.parts, fmt, crs, name);
  } }]);
  // последняя СК
  setTimeout(() => {
    const cc = last.crs || ''; const b = cc.startsWith('mskfull:') ? 'mskfull' : cc;
    const r = document.querySelector(`input[name="kex-crs"][value="${b}"]`); if (r) r.checked = true;
    if (b === 'mskfull') { const [, rg, dt] = cc.split(':'); const a = document.getElementById('kex-mskreg'), d = document.getElementById('kex-mskdatum'); if (a && rg) a.value = rg; if (d && dt) d.value = dt; }
    _kexFmt();
  }, 30);
  if (typeof loadMskFull === 'function') loadMskFull().then(() => { const s = document.getElementById('kex-mskreg'); if (s && !s.options.length && typeof _mskRegionOptionsHtml === 'function') s.innerHTML = _mskRegionOptionsHtml(); }).catch(() => {});
}
function _kexFmt() {
  const fmt = (document.querySelector('input[name="kex-fmt"]:checked') || {}).value;
  const meta = KEX_FMT.find(f => f[0] === fmt);
  const row = document.getElementById('kex-crs-row'); if (row) row.style.display = meta && meta[3] ? '' : 'none';
  document.querySelectorAll('.kex-card').forEach(c => { c.style.borderColor = c.querySelector('input').checked ? 'var(--acc)' : 'var(--bd)'; });
}
function _kexDownload(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function _kexRun(parts, fmt, crs, name) {
  const inline = parts.filter(p => p.features.length).map(p => ({ name: p.name, color: p.color, geojson: { type: 'FeatureCollection', features: p.features } }));
  const all = inline.flatMap(p => p.geojson.features);
  if (fmt === 'geojson') { _kexDownload(new Blob([JSON.stringify({ type: 'FeatureCollection', features: all }, null, 1)], { type: 'application/geo+json' }), name + '.geojson'); toast('GeoJSON сохранён', 'ok'); return; }
  if (fmt === 'gpx') { _kexDownload(new Blob([_kexGpx(all, name)], { type: 'application/gpx+xml' }), name + '.gpx'); toast('GPX сохранён', 'ok'); return; }
  if (fmt === 'csv') { const t = _kexCsv(inline, crs); if (t) { _kexDownload(new Blob(['﻿' + t], { type: 'text/csv;charset=utf-8' }), name + '.csv'); toast('CSV сохранён', 'ok'); } return; }
  const ep = { dxf: 'export-dxf', kml: 'export-kml', mif: 'export-mif', tab: 'export-tab' }[fmt];
  const ext = { dxf: '.dxf', kml: '.kml', mif: '_mif.zip', tab: '_tab.zip' }[fmt];
  toast('Готовим файл…');
  try {
    const r = await fetch(`${API}/layers/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inline, crs, filename: name + '.dxf' }) });
    if (!r.ok) return;   // ошибку показал общий обработчик
    _kexDownload(await r.blob(), name + ext);
    toast('Файл сохранён', 'ok');
  } catch (e) { toast('Ошибка экспорта', 'err'); }
}
function _kexGpx(feats, name) {
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pt = c => `lat="${c[1].toFixed(8)}" lon="${c[0].toFixed(8)}"`;
  let w = '', t = '';
  feats.forEach(f => {
    const g = f.geometry, n = x((f.properties || {}).name);
    if (!g) return;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates
      : g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
    if (g.type === 'Point') w += `<wpt ${pt(g.coordinates)}><name>${n}</name></wpt>\n`;
    else if (g.type === 'MultiPoint') g.coordinates.forEach(c => { w += `<wpt ${pt(c)}><name>${n}</name></wpt>\n`; });
    lines.forEach(l => { t += `<trk><name>${n}</name><trkseg>${l.map(c => `<trkpt ${pt(c)}/>`).join('')}</trkseg></trk>\n`; });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sputnik" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${x(name)}</name></metadata>\n${w}${t}</gpx>`;
}
// Проекция для CSV — одна зона на весь набор (как в DXF), по центру набора
function _kexProj(crs, clng) {
  if (crs === 'wgs84') return null;
  if (crs === 'msk86') return _mskProj(_mskZone(clng));
  if (crs === 'msk86_z3') return _mskProj(3);
  if (crs === 'msk86_z4') return _mskProj(4);
  if (crs === 'gsk2011') return _gskProj(_gskZone(clng));
  if (crs === 'utmauto') return _utmProj(utmZoneFromLng(clng));
  if (String(crs).startsWith('mskfull:')) {
    const [, reg, dat] = crs.split(':'); const z = _mskFullPickZone(reg, clng); if (!z) return null;
    const tw = (MSK_FULL.datums && MSK_FULL.datums[dat || '2008']) || MSK_FULL.datums['2008'];
    return `+proj=tmerc +lat_0=0 +lon_0=${z.lon} +k=1 +x_0=${z.x0} +y_0=${z.y0} +ellps=${MSK_FULL.ellps || 'krass'} +towgs84=${tw.join(',')} +units=m +no_defs`;
  }
  return null;
}
function _kexCsv(inline, crs) {
  const pts = [];
  inline.forEach(p => p.geojson.features.forEach((f, fi) => {
    const g = f.geometry; if (!g) return;
    const nm = (f.properties || {}).name || `Объект ${fi + 1}`;
    const walk = (c, part) => { if (typeof c[0] === 'number') pts.push({ layer: p.name, nm, type: g.type, part, c }); else c.forEach((cc, i) => walk(cc, typeof cc[0] === 'number' ? part : (part ? part + '.' : '') + (i + 1))); };
    walk(g.type === 'Polygon' ? g.coordinates.map(r => r.slice(0, -1)) : g.type === 'MultiPolygon' ? g.coordinates.map(pp => pp.map(r => r.slice(0, -1))) : g.coordinates, '');
  }));
  if (!pts.length) { toast('Нет координат', 'warn'); return null; }
  const clng = pts.reduce((s, q) => s + q.c[0], 0) / pts.length;
  const proj = _kexProj(crs, clng);
  const geo = !proj;
  const head = ['Слой', 'Объект', 'Тип', 'Часть', '№', geo ? 'Широта' : 'X (север)', geo ? 'Долгота' : 'Y (восток)', 'H'];
  const counter = {};
  const rows = pts.map(q => {
    const key = q.layer + '|' + q.nm + '|' + q.part; counter[key] = (counter[key] || 0) + 1;
    let a, b;
    if (geo) { a = q.c[1].toFixed(8); b = q.c[0].toFixed(8); }
    else { const r = proj4('+proj=longlat +datum=WGS84 +no_defs', proj, [q.c[0], q.c[1]]); a = r[1].toFixed(3); b = r[0].toFixed(3); }
    return [q.layer, q.nm, q.type, q.part, counter[key], a, b, q.c[2] != null ? q.c[2] : ''];
  });
  const cell = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + `\r\n\r\nСистема координат;${geo ? 'WGS-84' : crs}`;
}

// ── Точки входа ────────────────────────────────────────────────────────
function kmlExportFeature(layerId, fIdx) {
  const l = (layers || []).find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  const feats = gj.features || [], f = feats[fIdx];
  const nm = (f && f.properties && (f.properties.name || f.properties.Name)) || 'Объект';
  const choices = [];
  if (f) choices.push({ label: `Этот объект «${esc(nm)}»`, parts: [{ name: l.name, color: l.color, features: [f] }] });
  choices.push({ label: `Весь слой «${esc(l.name)}»`, parts: [{ name: l.name, color: l.color, features: feats }] });
  const sel = _kexSelectionParts();
  if (sel) choices.push(sel);
  kmlExportDialog(choices, f ? nm : l.name);
}
// Выделенные областью объекты (ПКМ по карте → «Выделить объекты»)
function _kexSelectionParts() {
  if (typeof _ksSel === 'undefined' || !_ksSel || !_ksSel.entries) return null;
  const parts = _ksSel.entries.map(en => ({ name: (en.rec && en.rec.name) || 'Объекты', color: en.rec && en.rec.color, features: en.idxs.map(i => (en.gj.features || [])[i]).filter(Boolean) }));
  const n = parts.reduce((s, p) => s + p.features.length, 0);
  return n ? { label: `Выделенные областью объекты`, parts } : null;
}
function kmlExportSelection() { const s = _kexSelectionParts(); if (s) kmlExportDialog([s], 'Выделенное'); }
