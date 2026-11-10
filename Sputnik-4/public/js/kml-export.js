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
// или {pick:true, preIds:[…]} — несколько слоёв, выбираются в списке с поиском
// (одно окно и для ПКМ → «💾 Экспорт…», и для «📤 Экспорт» в панели «Слои»)
async function kmlExportDialog(choices, defName) {
  choices = choices.filter(c => c.pick || c.parts.some(p => p.features.length));
  if (!choices.length) { toast('Нечего экспортировать', 'warn'); return; }
  let last = {}; try { last = JSON.parse(localStorage.getItem('kex_last') || '{}'); } catch (e) {}
  const fmt0 = last.fmt || 'dxf';
  try { if (typeof loadMskFull === 'function') await loadMskFull(); await crsLibLoad(); } catch (e) {}
  const crsHtml = crspHtml('kex', crspRecall('export') || { sys: 'msk', zone: 'auto' }, { onChange: '_kexCrsInfo' }) + '<div id="kex-crs-info" class="crsp-hint" style="margin-top:4px"></div>';
  window._kexChoices = choices;
  const pick = choices.find(c => c.pick), pre = new Set((pick && pick.preIds) || []);
  const pickHtml = pick ? `<div id="kex-pick" style="margin:4px 0 0 22px;${choices[0] === pick ? '' : 'display:none'}">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
        <input type="search" placeholder="🔍 Поиск слоя…" oninput="_kexPickFilter(this.value)" style="flex:1;font-size:12px;padding:4px 8px">
        <button class="btn bs bxs" type="button" onclick="_kexPickAll(true)">Все</button><button class="btn bs bxs" type="button" onclick="_kexPickAll(false)">Никакие</button></div>
      <div id="kex-pick-l" onchange="_kexPickCount()" style="max-height:200px;overflow:auto;border:1px solid var(--bd);border-radius:6px;padding:4px 8px">
        ${(layers || []).map(l => `<label class="kex-lr" data-n="${escAttr(String(l.name || '').toLowerCase())}" style="display:flex;gap:6px;align-items:center;padding:2px 0;font-size:12px;text-transform:none;font-weight:500;margin:0;cursor:pointer">
          <input type="checkbox" class="kex-lcb" value="${escAttr(l.id)}" ${pre.has(l.id) ? 'checked' : ''} style="width:auto;margin:0">
          <span style="width:11px;height:11px;border-radius:3px;background:${escAttr(l.color || '#666')};flex-shrink:0"></span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.name || '')}</span>
          <span style="color:var(--tx3);font-size:10px">${typeof _kmlFeatureCount === 'function' ? _kmlFeatureCount(l) : ''}</span></label>`).join('')}
      </div></div>` : '';
  showModal('📤 Экспорт', `<div style="display:flex;flex-direction:column;gap:10px;min-width:min(520px,86vw)">
    <div><div style="font-weight:700;font-size:12px;margin-bottom:4px">Что выгрузить</div>
      ${choices.map((c, i) => `<label style="display:flex;gap:6px;align-items:center;padding:2px 0;font-size:12px;text-transform:none;font-weight:500"><input type="radio" name="kex-what" value="${i}" ${i === 0 ? 'checked' : ''} onchange="_kexWhat()" style="width:auto;margin:0"> ${c.label}
        <span style="color:var(--tx3);font-size:10px" ${c.pick ? 'id="kex-pick-n"' : ''}>— ${c.pick ? '' : c.parts.reduce((s, p) => s + p.features.length, 0) + ' объект(ов)'}</span></label>`).join('')}${pickHtml}</div>
    <div><div style="font-weight:700;font-size:12px;margin-bottom:4px">Формат</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px">
      ${KEX_FMT.map(([k, n, d]) => `<label class="kex-card" style="display:flex;gap:6px;align-items:center;padding:6px 8px;border:1.5px solid ${k === fmt0 ? 'var(--acc)' : 'var(--bd)'};border-radius:var(--rs);cursor:pointer;background:var(--s2);text-transform:none;margin:0">
        <input type="radio" name="kex-fmt" value="${k}" ${k === fmt0 ? 'checked' : ''} onchange="_kexFmt()" style="width:auto;margin:0"><div><div style="font-weight:700;font-size:12px">${n}</div><div style="font-size:10px;color:var(--tx3);font-weight:400">${d}</div></div></label>`).join('')}</div></div>
    <div id="kex-crs-row"><div style="font-weight:700;font-size:12px;margin-bottom:4px">Система координат</div>${crsHtml}</div>
    <div class="fg" style="margin:0"><label>Имя файла</label><input id="kex-name" value="${escAttr(String(defName || 'export').replace(/[\\/:*?"<>|]+/g, '_'))}"></div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '📤 Скачать', cls: 'bp', fn: () => {
    const c = _kexChoice();
    if (!c.parts.some(p => p.features.length)) { toast('Отметьте хотя бы один непустой слой', 'warn'); return; }
    const fmt = (document.querySelector('input[name="kex-fmt"]:checked') || {}).value || 'dxf';
    const st = crspRead('kex'); crspRemember('export', st);
    let R; try { const [lng, lat] = crsGeoCenter(c.parts.flatMap(p => p.features)); R = crsExportResolve(st, lng, lat); } catch (e) { toast(e.message, 'err'); return; }
    const name = (document.getElementById('kex-name').value || 'export').trim().replace(/[\\/:*?"<>|]+/g, '_');
    try { localStorage.setItem('kex_last', JSON.stringify({ fmt })); } catch (e) {}
    closeModal();
    _kexRun(c.parts, fmt, R, name);
  } }]);
  setTimeout(() => { _kexFmt(); _kexPickCount(); _kexCrsInfo(); }, 30);
}
// выбранный вариант «что выгрузить»; для списка слоёв — части по отмеченным слоям
function _kexChoice() {
  const c = (window._kexChoices || [])[+(document.querySelector('input[name="kex-what"]:checked') || {}).value || 0];
  if (!c || !c.pick) return c;
  const parts = [...document.querySelectorAll('.kex-lcb:checked')].map(cb => {
    const l = (layers || []).find(x => x.id === cb.value); if (!l) return null;
    let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return null; }
    return { name: l.name, color: l.color, features: (gj.features || (gj.type === 'Feature' ? [gj] : [])).filter(f => f && f.geometry) };
  }).filter(Boolean);
  return { ...c, parts };
}
function _kexWhat() {
  const c = (window._kexChoices || [])[+(document.querySelector('input[name="kex-what"]:checked') || {}).value || 0];
  const el = document.getElementById('kex-pick'); if (el) el.style.display = c && c.pick ? '' : 'none';
  _kexCrsInfo();
}
function _kexPickCount() {
  const el = document.getElementById('kex-pick-n'); if (!el) return;
  const cbs = [...document.querySelectorAll('.kex-lcb:checked')];
  const n = cbs.reduce((s, cb) => { const l = (layers || []).find(x => x.id === cb.value); return s + (l && typeof _kmlFeatureCount === 'function' ? _kmlFeatureCount(l) : 0); }, 0);
  el.textContent = `— слоёв ${cbs.length}, объектов ${n}`;
  _kexCrsInfo();
}
function _kexPickFilter(q) {
  q = String(q || '').trim().toLowerCase();
  document.querySelectorAll('#kex-pick-l .kex-lr').forEach(r => { r.style.display = !q || r.dataset.n.includes(q) ? 'flex' : 'none'; });
}
function _kexPickAll(on) {
  document.querySelectorAll('#kex-pick-l .kex-lr').forEach(r => { if (r.style.display !== 'none') r.querySelector('input').checked = on; });
  _kexPickCount();
}
// какая зона получится для выбранного «что выгрузить»
function _kexCrsInfo() {
  const el = document.getElementById('kex-crs-info'); if (!el) return;
  try {
    const c = _kexChoice(); if (!c) return;
    if (!c.parts.some(p => p.features.length)) { el.textContent = ''; return; }
    const [lng, lat] = crsGeoCenter(c.parts.flatMap(p => p.features));
    el.textContent = 'В файле: ' + crsExportResolve(crspRead('kex'), lng, lat).name;
  } catch (e) { el.textContent = '⚠ ' + e.message; }
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
async function _kexRun(parts, fmt, R, name) {
  const crs = R.crs;
  const inline = parts.filter(p => p.features.length).map(p => ({ name: p.name, color: p.color, geojson: { type: 'FeatureCollection', features: p.features } }));
  const all = inline.flatMap(p => p.geojson.features);
  if (fmt === 'geojson') { _kexDownload(new Blob([JSON.stringify({ type: 'FeatureCollection', features: all }, null, 1)], { type: 'application/geo+json' }), name + '.geojson'); toast('GeoJSON сохранён', 'ok'); return; }
  if (fmt === 'gpx') { _kexDownload(new Blob([_kexGpx(all, name)], { type: 'application/gpx+xml' }), name + '.gpx'); toast('GPX сохранён', 'ok'); return; }
  if (fmt === 'csv') { const t = _kexCsv(inline, R); if (t) { _kexDownload(new Blob(['﻿' + t], { type: 'text/csv;charset=utf-8' }), name + '.csv'); toast('CSV сохранён', 'ok'); } return; }
  const ep = { dxf: 'export-dxf', kml: 'export-kml', mif: 'export-mif', tab: 'export-tab' }[fmt];
  const ext = { dxf: '.dxf', kml: '.kml', mif: '_mif.zip', tab: '_tab.zip' }[fmt];
  toast('Готовим файл…');
  try {
    const r = await fetch(`${API}/layers/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inline, crs, crsName: R.name, filename: name + '.dxf' }) });
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
function _kexCsv(inline, R) {
  const pts = [];
  inline.forEach(p => p.geojson.features.forEach((f, fi) => {
    const g = f.geometry; if (!g) return;
    const nm = (f.properties || {}).name || `Объект ${fi + 1}`;
    const walk = (c, part) => { if (typeof c[0] === 'number') pts.push({ layer: p.name, nm, type: g.type, part, c }); else c.forEach((cc, i) => walk(cc, typeof cc[0] === 'number' ? part : (part ? part + '.' : '') + (i + 1))); };
    walk(g.type === 'Polygon' ? g.coordinates.map(r => r.slice(0, -1)) : g.type === 'MultiPolygon' ? g.coordinates.map(pp => pp.map(r => r.slice(0, -1))) : g.coordinates, '');
  }));
  if (!pts.length) { toast('Нет координат', 'warn'); return null; }
  const proj = R.proj, geo = R.geo, wgs = !proj;
  const head = ['Слой', 'Объект', 'Тип', 'Часть', '№', geo ? 'Широта' : 'X (север)', geo ? 'Долгота' : 'Y (восток)', 'H'];
  const counter = {};
  const rows = pts.map(q => {
    const key = q.layer + '|' + q.nm + '|' + q.part; counter[key] = (counter[key] || 0) + 1;
    let a, b;
    if (wgs) { a = q.c[1].toFixed(8); b = q.c[0].toFixed(8); }
    else { const r = proj4('+proj=longlat +datum=WGS84 +no_defs', proj, [q.c[0], q.c[1]]); a = r[1].toFixed(geo ? 8 : 3); b = r[0].toFixed(geo ? 8 : 3); }
    return [q.layer, q.nm, q.type, q.part, counter[key], a, b, q.c[2] != null ? q.c[2] : ''];
  });
  const cell = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + `\r\n\r\nСистема координат;${R.name}`;
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
  choices.push({ pick: true, label: 'Несколько слоёв (выбрать в списке)', preIds: [l.id] });
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
