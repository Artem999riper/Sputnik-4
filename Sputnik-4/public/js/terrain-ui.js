// ═══════════════════════════════════════════════════════════
// terrain-ui.js — «🧭 Анализ рельефа» (сервер: terrain_analysis.py):
//   уклоны (с контурами крутых участков), экспозиция склонов, линии стока
//   (тальвеги), водосбор точки, сравнение со своей съёмкой (разница, объёмы).
// Область — как в «Затоплении» (прямоугольник, полигон, контур из слоя).
// ═══════════════════════════════════════════════════════════
const TA = Object.assign({ mode: 'slope', steep: 10, thr: '', layer: '', hfield: '' },
  (() => { try { return JSON.parse(localStorage.getItem('terrain_opts') || '{}'); } catch (e) { return {}; } })(),
  { res: null, busy: false, ov: null, vec: null, area: '', name: '', point: null });
function _taSave() { try { const { mode, steep, thr, layer, hfield } = TA; localStorage.setItem('terrain_opts', JSON.stringify({ mode, steep, thr, layer, hfield })); } catch (e) {} }
const TA_MODES = [
  ['slope', '📐', 'Уклоны', 'крутизна склонов по классам, контуры крутых участков'],
  ['aspect', '🧭', 'Экспозиция', 'куда «смотрят» склоны: С, В, Ю, З…'],
  ['flow', '💧', 'Линии стока', 'куда стекает вода (тальвеги), площадь водосбора'],
  ['watershed', '🏞', 'Водосбор точки', 'что стекает в выбранное место (труба, створ)'],
  ['compare', '⚖️', 'Сравнить со съёмкой', 'точки нивелировки/тахеометра против ArcticDEM'],
];
function openTerrainPanel() {
  const b = _demBbox, r = TA.res;
  const card = (on, fn, ic, t, sub) => `<div class="dw-card${on ? ' on' : ''}" onclick="${fn}"><div class="dw-ic">${ic}</div><div><b>${t}</b><div class="dw-sub">${sub}</div></div></div>`;
  const km2 = b ? _dwAreaKm2(b) : 0;
  const ptLayers = (layers || []).filter(l => /"Point"/.test(l.geojson || ''));
  const lay = ptLayers.find(l => l.id === TA.layer) || ptLayers[0];
  const fields = lay && typeof kmlFields === 'function' ? kmlFields(lay) : [];
  let opts = '';
  if (TA.mode === 'slope') opts = `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0">Контуры крутых участков: уклон от <input id="ta-steep" type="number" min="1" max="60" step="1" value="${TA.steep}" style="width:64px"> °</label>`;
  if (TA.mode === 'flow') opts = `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0">Показывать сток с водосбором от <input id="ta-thr" type="text" inputmode="decimal" placeholder="авто" value="${esc(String(TA.thr || ''))}" style="width:70px"> км²</label>
      <div style="font-size:10px;color:var(--tx3)">Меньше число — больше мелких ручьёв. «Авто» — 1% площади области.</div>`;
  if (TA.mode === 'watershed') opts = `<div style="display:flex;gap:6px;align-items:center;font-size:12px"><button class="btn ${TA.point ? 'bs' : 'bp'} bsm" onclick="_taPickPoint()">📍 ${TA.point ? 'Другая точка' : 'Указать точку на карте'}</button>
      <span style="color:var(--tx3)">${TA.point ? TA.point.map(v => v.toFixed(5)).reverse().join(', ') : 'место, для которого нужен водосбор (точка притянется к тальвегу)'}</span></div>`;
  if (TA.mode === 'compare') opts = ptLayers.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
      <div class="fg" style="margin:0;flex:1;min-width:160px"><label>Слой с точками съёмки</label><select id="ta-layer" onchange="TA.layer=this.value;_taSave();openTerrainPanel()">${ptLayers.map(l => `<option value="${escAttr(l.id)}" ${l === lay ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="fg" style="margin:0;flex:1;min-width:140px"><label>Высота (БСВ-77)</label><select id="ta-h"><option value="">координата Z</option>${fields.map(f => `<option ${f === TA.hfield ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div></div>
      <div style="font-size:10px;color:var(--tx3)">Точки с высотами импортируйте в «Слоях» (CSV/DXF/Excel, нужная СК). Область — вокруг точек или выберите вручную.</div>`
    : '<div class="dw-info" style="color:var(--red)">Нет слоёв с точками — импортируйте съёмку в «Слоях» (CSV/DXF с высотами).</div>';
  const st = r && r.stats;
  let res = '';
  if (r) {
    const leg = (r.legend || []).map(c => `<div style="display:flex;gap:6px;align-items:center"><span style="width:14px;height:12px;border-radius:2px;background:${c.color};border:1px solid rgba(0,0,0,.2)"></span>
      <span style="flex:1">${esc(c.label)}</span><span style="color:var(--tx3)">${c.pct != null ? c.pct + '%' : ''}${c.area_ha != null ? ' · ' + c.area_ha.toLocaleString('ru-RU') + ' га' : ''}</span></div>`).join('');
    const n = (v, d = 2) => v == null ? '—' : (+v).toLocaleString('ru-RU', { maximumFractionDigits: d });
    const info = { slope: `Средний уклон <b>${n(st.mean, 1)}°</b>, наибольший ${n(st.max, 1)}°. Контуров круче ${n(st.steep, 0)}°: <b>${(r.zones || {}).features ? r.zones.features.length : 0}</b>.`,
      aspect: 'Экспозиция склонов (на карте — цветом).',
      flow: `Линий стока: <b>${st.count}</b> (водосбор от ${n(st.threshold_km2, 3)} км²), площадь области ${n(st.area_km2, 2)} км². Толще — больше водосбор.`,
      watershed: `Водосбор: <b>${n(st.area_km2, 3)} км²</b> (${n(st.area_km2 * 100, 1)} га), отметка в створе ${n(st.outlet_h)} м, наивысшая точка ${n(st.max_h)} м.`,
      compare: `Точек: <b>${st.n}</b>. Разница «съёмка − ArcticDEM»: средняя <b>${n(st.mean)} м</b>, медиана ${n(st.median)}, СКО ${n(st.std)}, RMS ${n(st.rms)}, от ${n(st.min)} до ${n(st.max)} м.
        ${st.area_ha ? `<br>В контуре точек (${n(st.area_ha, 2)} га): съёмка выше ArcticDEM — <b>${n(st.fill, 0)} м³</b>, ниже — <b>${n(-st.cut, 0)} м³</b>.` : ''}
        ${r.overlay ? `<br>Картограмма: красный — съёмка выше, синий — ниже (шкала ±${n(r.overlay.limit)} м).` : ''}` }[TA.res.mode] || '';
    res = `<div class="dw-info" style="margin-top:8px">${info}${st.res ? `<span style="color:var(--tx3)"> Сетка ${n(st.res, 1)} м.</span>` : ''}
      ${st.geoid === false ? '<br><b style="color:var(--red)">⚠️ Высоты не в БСВ-77 (нет файлов геоида на сервере).</b>' : ''}
      ${leg ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:6px;font-size:11px">${leg}</div>` : ''}</div>`;
  }
  const vecN = r ? _taVec(r).length : 0;
  showModal('🧭 Анализ рельефа', `<div style="min-width:min(540px,88vw)">
    <div class="dw-h">1. Область</div>
    <div class="dw-grid">
      ${card(TA.area === 'rect', "_taArea('rect')", '▭', 'Прямоугольник', 'два угла на карте')}
      ${card(TA.area === 'polygon', "_taArea('polygon')", '⬠', 'Полигон', 'вершины на карте')}
      ${card(TA.area === 'kml', "_taArea('kml')", '🗂', 'Контур из слоя', 'щёлкните по полигону')}
      ${TA.mode === 'compare' ? card(TA.area === 'pts', "_taArea('pts')", '⚖️', 'Вокруг точек съёмки', 'рамка по слою точек') : ''}
    </div>
    <div class="dw-info">${b ? `✅ ${TA.name ? '«' + esc(TA.name) + '»' : _demClip ? 'Полигон' : 'Прямоугольник'} ≈ ${km2.toFixed(km2 < 1 ? 3 : 1)} км²` : '<span style="color:var(--tx3)">Область ещё не выбрана</span>'}</div>
    <div class="dw-h" style="margin-top:14px">2. Что посчитать</div>
    <div class="dw-grid">${TA_MODES.map(([k, ic, t, sub]) => card(TA.mode === k, `TA.mode='${k}';_taSave();_taClear();openTerrainPanel()`, ic, t, sub)).join('')}</div>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${opts}</div>
    <div id="ta-st" style="font-size:11px;color:var(--acc);font-weight:700;margin-top:8px;min-height:14px">${TA.busy ? '⏳ Расчёт…' : ''}</div>
    ${res}</div>`, [
    { label: 'Закрыть', cls: 'bs', fn: closeModal },
    ...(r ? [{ label: '✕ Убрать', cls: 'bs', fn: () => { _taClear(); openTerrainPanel(); } }] : []),
    ...(vecN ? [{ label: '💾 В слой', cls: 'bs', fn: _taSaveLayer }, { label: '📐 Экспорт…', cls: 'bs', fn: _taExport }] : []),
    { label: '▶ Рассчитать', cls: 'bp', fn: terrainRun },
  ]);
  document.getElementById('mov').classList.add('side');
}
function _taArea(kind) {
  TA.name = '';
  if (kind === 'kml') { _flPick(nm => { if (nm) { TA.area = 'kml'; TA.name = nm; _taClear(); } openTerrainPanel(); if (nm) _flFit(); }); return; }
  if (kind === 'pts') {
    const l = (layers || []).find(x => x.id === (document.getElementById('ta-layer') || {}).value) || (layers || []).find(x => /"Point"/.test(x.geojson || ''));
    const pts = _taPoints(l, '').map(q => [q[0], q[1]]); if (pts.length < 2) { toast('В слое мало точек', 'warn'); return; }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), px = (Math.max(...xs) - Math.min(...xs)) * 0.1 + 0.0005, py = (Math.max(...ys) - Math.min(...ys)) * 0.1 + 0.0003;
    demClearDraw();
    _demBbox = { minLng: Math.min(...xs) - px, maxLng: Math.max(...xs) + px, minLat: Math.min(...ys) - py, maxLat: Math.max(...ys) + py }; _demClip = null;
    TA.area = 'pts'; TA.name = 'вокруг точек «' + l.name + '»'; _taClear(); openTerrainPanel(); _flFit(); return;
  }
  TA.area = kind;
  window._floodAreaCb = () => { _taClear(); openTerrainPanel(); _flFit(); };
  if (kind === 'rect') demStartDraw(); else demStartPolygon();
}
function _taPoints(l, field) {
  if (!l) return [];
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return []; }
  const out = [];
  (gj.features || []).forEach(f => {
    const g = f && f.geometry; if (!g || g.type !== 'Point' || (f.properties || {})._hidden) return;
    const c = g.coordinates;
    const h = field ? (typeof _kaNum === 'function' ? _kaNum((f.properties || {})[field]) : parseFloat((f.properties || {})[field])) : c[2];
    out.push([c[0], c[1], Number.isFinite(+h) && h !== '' && h != null ? +h : null, (f.properties || {}).name || '']);
  });
  return out;
}
let _taPickFn = null;
function _taPickPoint() {
  if (!_demBbox) { toast('Сначала выберите область', 'err'); return; }
  closeModal();
  const bnr = document.getElementById('bnr'), t = document.getElementById('bnr-t');
  if (t) t.textContent = '🏞 Щёлкните место (створ, трубу), для которого нужен водосбор · Esc — отмена';
  if (bnr) { bnr.className = 'show draw'; bnr.style.display = 'flex'; }
  map.getContainer().style.cursor = 'crosshair';
  _taPickFn = e => { map.off('click', _taPickFn); _taPickFn = null; map.getContainer().style.cursor = ''; if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
    TA.point = [e.latlng.lng, e.latlng.lat]; terrainRun(); };
  map.on('click', _taPickFn);
}
async function terrainRun() {
  if (!_demBbox) { toast('Сначала выберите область', 'err'); return; }
  const body = { mode: TA.mode, bbox: _demBbox, clip: _demClip || null };
  const steep = document.getElementById('ta-steep'); if (steep) { TA.steep = +steep.value || 10; body.steep = TA.steep; }
  const thr = document.getElementById('ta-thr'); if (thr) { TA.thr = thr.value.replace(',', '.'); body.threshold_km2 = parseFloat(TA.thr) || 0; }
  if (TA.mode === 'watershed') { if (!TA.point) { _taPickPoint(); return; } body.point = TA.point; }
  if (TA.mode === 'compare') {
    const l = (layers || []).find(x => x.id === (document.getElementById('ta-layer') || {}).value) || (layers || []).find(x => x.id === TA.layer);
    TA.hfield = (document.getElementById('ta-h') || {}).value || ''; TA.layer = l ? l.id : '';
    const pts = _taPoints(l, TA.hfield).filter(q => q[2] != null);
    if (pts.length < 3) { toast(TA.hfield ? `В поле «${TA.hfield}» нет высот` : 'У точек нет высоты Z — выберите поле с высотой', 'err'); return; }
    body.points = pts.map(q => q.slice(0, 3)); TA.ptNames = pts.map(q => q[3]);
  }
  _taSave();
  TA.busy = true; if (document.getElementById('ta-st')) document.getElementById('ta-st').textContent = '⏳ Расчёт…';
  document.querySelectorAll('#mft .btn').forEach(b => b.disabled = true);
  const sse = new EventSource(`${location.origin}/api/events?aux=1`);
  sse.onmessage = e => { try { const d = JSON.parse(e.data); const el = document.getElementById('ta-st'); if (el && (d.type === 'flood_progress' || (d.type === 'dem_progress' && !d.job))) el.textContent = `⏳ ${d.text} (${d.pct}%)`; } catch (x) {} };
  try {
    const r = await fetch(`${API}/dem/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
    j.mode = TA.mode; TA.res = j;
    _taDraw();
  } catch (e) { toast('❌ ' + e.message, 'err'); }
  finally { sse.close(); TA.busy = false; openTerrainPanel(); }
}
function _taClear() {
  if (TA.ov) { try { map.removeLayer(TA.ov); } catch (e) {} TA.ov = null; }
  if (TA.vec) { try { map.removeLayer(TA.vec); } catch (e) {} TA.vec = null; }
  TA.res = null;
}
// Векторные результаты (для слоя/экспорта)
function _taVec(r) {
  if (r.zones) return r.zones.features;
  if (r.lines) return r.lines.features;
  if (r.polygon) return r.polygon.features;
  if (r.points) return r.points.features.map((f, i) => ({ ...f, properties: { name: (TA.ptNames || [])[i] || `Т${i + 1}`, ...f.properties } }));
  return [];
}
function _taDraw() {
  const r = TA.res; if (!r) return;
  if (TA.ov) { try { map.removeLayer(TA.ov); } catch (e) {} } if (TA.vec) { try { map.removeLayer(TA.vec); } catch (e) {} }
  if (r.overlay && r.overlay.png) TA.ov = L.imageOverlay('data:image/png;base64,' + r.overlay.png, r.overlay.bounds, { opacity: 0.85, interactive: false }).addTo(map);
  const feats = _taVec(r);
  const dzColor = dz => dz == null ? '#9ca3af' : dz > 0.5 ? '#dc2626' : dz > 0.15 ? '#f87171' : dz < -0.5 ? '#2563eb' : dz < -0.15 ? '#60a5fa' : '#16a34a';
  TA.vec = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
    style: f => r.lines ? { color: '#0284c7', weight: [0, 1.5, 2.5, 4][(f.properties || {}).class || 1], opacity: 0.95 }
      : r.polygon ? { color: '#0369a1', weight: 3, fillColor: '#38bdf8', fillOpacity: 0.25 }
      : { color: '#b91c1c', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5 4' },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#fff', weight: 1.5, fillColor: dzColor(f.properties.dz), fillOpacity: 1 }),
    onEachFeature: (f, ly) => { const p = f.properties || {};
      ly.bindTooltip(r.points ? `${esc(p.name || '')}<br>съёмка ${p.h} м · ArcticDEM ${p.dem ?? '—'} м<br><b>разница ${p.dz == null ? '—' : (p.dz > 0 ? '+' : '') + p.dz + ' м'}</b>`
        : r.lines ? `Сток · водосбор ${p.catchment_km2} км²` : r.polygon ? `Водосбор ${(r.stats.area_km2 || 0).toLocaleString('ru-RU')} км²` : `${esc(p.name || '')} · ${p.area_ha} га`, { sticky: true }); },
  }).addTo(map);
  if (r.outlet) L.circleMarker([r.outlet[1], r.outlet[0]], { radius: 8, color: '#fff', weight: 2, fillColor: '#0369a1', fillOpacity: 1 }).bindTooltip('створ').addTo(TA.vec);
}
function _taName() {
  const r = TA.res, n = r.stats || {};
  return { slope: `Уклоны ≥ ${n.steep}°`, aspect: 'Экспозиция', flow: 'Линии стока', watershed: `Водосбор ${(n.area_km2 || 0).toLocaleString('ru-RU')} км²`, compare: 'Съёмка − ArcticDEM' }[r.mode] || 'Анализ рельефа';
}
async function _taSaveLayer() {
  const feats = _taVec(TA.res); if (!feats.length) return;
  const name = (prompt('Название слоя:', _taName()) || '').trim(); if (!name) return;
  const color = { slope: '#dc2626', flow: '#0284c7', watershed: '#0369a1', compare: '#16a34a' }[TA.res.mode] || '#2563eb';
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color, geojson: JSON.stringify({ type: 'FeatureCollection', features: feats }) }) });
  if (!r.ok) return;
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  try { renderLP(); renderLayerGroups(); } catch (e) {}
  toast(`💾 Слой «${name}» создан`, 'ok');
}
function _taExport() {
  const feats = _taVec(TA.res); if (!feats.length) return;
  const pts = TA.res.points;
  const parts = pts
    ? [{ name: 'СЪЁМКА_МИНУС_ARCTICDEM', color: '#16a34a', features: feats.map(f => ({ ...f, properties: { ...f.properties, name: `${f.properties.name || ''} ${f.properties.dz == null ? '' : (f.properties.dz > 0 ? '+' : '') + f.properties.dz}`.trim() } })) }]
    : [{ name: { slope: 'КРУТЫЕ_УЧАСТКИ', flow: 'ЛИНИИ_СТОКА', watershed: 'ВОДОСБОР' }[TA.res.mode] || 'АНАЛИЗ', color: '#0284c7', features: feats }];
  kmlExportDialog([{ key: 'all', label: _taName(), parts }], _taName().replace(/[^\wа-яё0-9.,-]+/gi, '_'));
}
