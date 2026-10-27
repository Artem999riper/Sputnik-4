// ═══════════════════════════════════════════════════════════
// flood.js — зоны затопления: область + отметка уровня воды (БСВ-77) →
// синяя заливка всего, что ниже отметки (рельеф ArcticDEM, расчёт на сервере,
// flood_zones.py). Зоны выгружаются в DXF/KML/MIF… или сохраняются слоем.
// Область рисуется теми же инструментами, что и в «Рельефе» (_demBbox/_demClip).
// ═══════════════════════════════════════════════════════════
const FL = Object.assign({ level: '', minArea: 100, water: true, connected: false },
  (() => { try { return JSON.parse(localStorage.getItem('flood_opts') || '{}'); } catch (e) { return {}; } })(),
  { area: '', result: null, busy: false, layer: null, kmlName: '' });
function _flSave() { try { localStorage.setItem('flood_opts', JSON.stringify({ level: FL.level, minArea: FL.minArea, water: FL.water, connected: FL.connected })); } catch (e) {} }
const _flLevel = () => parseFloat(String(FL.level).replace(',', '.'));
const _flHa = m2 => m2 >= 1e6 ? (m2 / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' км²' : (m2 / 1e4).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' га';
const _flNum = (v, d = 2) => v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d });

function openFloodPanel() {
  if (typeof demCancelDraw === 'function') demCancelDraw();
  const b = _demBbox, r = FL.result, st = r && r.stats;
  const card = (on, fn, ic, t, sub) => `<div class="dw-card${on ? ' on' : ''}" onclick="${fn}"><div class="dw-ic">${ic}</div><div><b>${t}</b><div class="dw-sub">${sub}</div></div></div>`;
  const km2 = b ? _dwAreaKm2(b) : 0;
  const areaInfo = !b ? '<span style="color:var(--tx3)">Область ещё не выбрана</span>'
    : `✅ ${FL.kmlName ? 'Полигон «' + esc(FL.kmlName) + '»' : _demClip ? 'Полигон' : 'Прямоугольник'} ≈ ${km2.toFixed(km2 < 1 ? 3 : 1)} км²`;
  const lv = _flLevel();
  const slider = st && st.dem_min != null && st.dem_max != null && st.dem_max > st.dem_min
    ? `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:11px;color:var(--tx3)">
        <span>${_flNum(st.dem_min, 1)}</span>
        <input id="fl-slider" type="range" min="${Math.floor(st.dem_min * 10) / 10}" max="${Math.ceil(st.dem_max * 10) / 10}" step="0.1" value="${Number.isFinite(lv) ? lv : st.dem_min}" style="flex:1"
          oninput="document.getElementById('fl-level').value=this.value" onchange="_flSetLevel(this.value,true)">
        <span>${_flNum(st.dem_max, 1)}</span></div>
       <div style="font-size:10px;color:var(--tx3)">Высоты в области: ${_flNum(st.dem_min, 1)} … ${_flNum(st.dem_max, 1)} м — двигайте ползунок, пересчёт сразу.</div>` : '';
  const res = !r ? '' : `<div class="dw-info" style="border-color:#93c5fd;background:color-mix(in srgb,#2563eb 8%,var(--s2))">
      🌊 При отметке <b>${_flNum(st.level)} м</b>: затоплено <b>${_flHa(st.flood_m2 || 0)}</b>${st.area_total_m2 ? ` (${_flNum(100 * st.flood_m2 / st.area_total_m2, 1)}% области)` : ''},
      зон: <b>${st.zones}</b>${st.depth_max != null ? `, наибольшая глубина <b>${_flNum(st.depth_max)} м</b>` : ''}.
      ${st.truncated ? `<br>Показаны ${st.zones} крупнейших зон из ${st.zones + st.truncated}.` : ''}
      ${st.dropped_small ? `<br><span style="color:var(--tx3)">Не показано мелких зон (меньше ${_flNum(FL.minArea, 0)} м²): ${st.dropped_small}.</span>` : ''}
      ${st.dropped_isolated ? `<br><span style="color:var(--tx3)">Отброшено замкнутых понижений, не связанных с водой: ${st.dropped_isolated}.</span>` : ''}
      ${st.water_pct > 1 ? `<br><span style="color:var(--tx3)">Нет данных рельефа (вода) на ${_flNum(st.water_pct, 1)}% области${FL.water ? ' — считаются затопленными' : ''}.</span>` : ''}
      ${st.geoid === false ? `<br><b style="color:var(--red)">⚠️ Не удалось перевести высоты в БСВ-77 (нет файлов геоида на сервере) — высоты эллипсоидальные, зоны неточные. Администратору: раздел «Рельеф» → «Служебное».</b>` : ''}
    </div>`;
  showModal('🌊 Зона затопления', `<div style="min-width:min(520px,86vw)">
    <div class="dw-h">1. Область расчёта</div>
    <div class="dw-grid">
      ${card(FL.area === 'rect', "_flArea('rect')", '▭', 'Прямоугольник', 'два угла на карте')}
      ${card(FL.area === 'polygon', "_flArea('polygon')", '⬠', 'Полигон', 'вершины на карте')}
      ${card(FL.area === 'kml', "_flArea('kml')", '🗂', 'Полигон из слоя', 'щёлкните по контуру на карте')}
    </div>
    <div class="dw-info">${areaInfo}</div>
    <div class="dw-h" style="margin-top:14px">2. Отметка уровня воды, м (БСВ-77)</div>
    <div style="display:flex;gap:4px;align-items:center">
      <button class="btn bs bsm" onclick="_flStep(-0.5)">−0,5</button><button class="btn bs bsm" onclick="_flStep(-0.1)">−0,1</button>
      <input id="fl-level" type="text" inputmode="decimal" placeholder="например 12,5" value="${esc(String(FL.level))}" style="flex:1;font-size:15px;font-weight:700;text-align:center"
        onchange="_flSetLevel(this.value)" onkeydown="if(event.key==='Enter'){_flSetLevel(this.value);floodRun()}">
      <button class="btn bs bsm" onclick="_flStep(0.1)">+0,1</button><button class="btn bs bsm" onclick="_flStep(0.5)">+0,5</button>
    </div>
    ${slider}
    <details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--acc);font-weight:700">Дополнительно</summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;font-size:12px">
        <label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0">Не показывать зоны меньше
          <input type="number" min="0" step="50" value="${FL.minArea}" style="width:90px" onchange="FL.minArea=Math.max(0,+this.value||0);_flSave()"> м²</label>
        <label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" ${FL.water ? 'checked' : ''} style="width:auto;margin:0" onchange="FL.water=this.checked;_flSave()">
          Водоёмы (нет данных рельефа) считать затопленными</label>
        <label style="display:flex;gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" ${FL.connected ? 'checked' : ''} style="width:auto;margin:0" onchange="FL.connected=this.checked;_flSave()">
          Только зоны, связанные с водой или краем области (без замкнутых понижений)</label>
      </div></details>
    <div id="fl-status" style="font-size:11px;color:var(--acc);font-weight:700;margin-top:8px;min-height:14px">${FL.busy ? '⏳ Расчёт…' : ''}</div>
    ${res}
  </div>`, [
    { label: 'Закрыть', cls: 'bs', fn: () => { _flPickStop(); closeModal(); } },
    ...(r && r.features.length ? [{ label: '💾 В слой', cls: 'bs', fn: floodSaveLayer }, { label: '📐 В DXF…', cls: 'bs', fn: () => floodExport() }] : []),
    ...(r ? [{ label: '✕ Убрать', cls: 'bs', fn: floodClear }] : []),
    { label: '🌊 Рассчитать', cls: 'bp', fn: floodRun },
  ]);
  document.getElementById('mov').classList.add('side');
}
function _flSetLevel(v, run) {
  FL.level = String(v).replace(',', '.').trim(); _flSave();
  const el = document.getElementById('fl-level'); if (el) el.value = FL.level;
  if (run) floodRun();
}
function _flStep(d) {
  const cur = Number.isFinite(_flLevel()) ? _flLevel() : (FL.result && FL.result.stats.dem_min != null ? Math.round(FL.result.stats.dem_min) : 0);
  _flSetLevel(Math.round((cur + d) * 10) / 10, !!FL.result);
}

// ── Область ────────────────────────────────────────────────
// Рисуем инструментами «Рельефа»; по окончании _demFinalize вызывает window._floodAreaCb
function _flArea(kind) {
  FL.kmlName = '';
  if (kind === 'kml') { _flPick(); return; }
  FL.area = kind;
  window._floodAreaCb = () => { FL.result = null; _flDraw(); openFloodPanel(); _flFit(); };
  if (kind === 'rect') demStartDraw(); else demStartPolygon();
}
let _flPickFn = null, _flPickKey = null;
function _flPick() {
  const all = [];
  (layers || []).filter(_dwOnMap).forEach(l => _dwPolys(l).forEach(p => { if (!p.hidden) all.push({ l, p }); }));
  if (!all.length) { toast('На карте не показано ни одного слоя с полигонами — включите нужный слой', 'warn'); return; }
  closeModal();
  const inRing = (lng, lat, r) => { let ins = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xa, ya] = r[a], [xb, yb] = r[b]; if (((ya > lat) !== (yb > lat)) && lng < (xb - xa) * (lat - ya) / (yb - ya) + xa) ins = !ins; } return ins; };
  const bnr = document.getElementById('bnr'), t = document.getElementById('bnr-t');
  if (t) t.textContent = '🌊 Щёлкните по полигону — он станет областью расчёта · Esc — отмена';
  if (bnr) { bnr.className = 'show draw'; bnr.style.display = 'flex'; }
  const el = map.getContainer(); el.style.cursor = 'pointer';
  _flPickFn = ev => {
    if (ev.target.closest && ev.target.closest('.leaflet-control,#bnr')) return;
    ev.stopPropagation(); ev.preventDefault();
    const ll = map.mouseEventToLatLng(ev);
    const hit = all.filter(h => inRing(ll.lng, ll.lat, h.p.ring)).sort((a, b) => _dwRingArea(a.p.ring) - _dwRingArea(b.p.ring))[0];
    if (!hit) { toast('Здесь нет полигона', 'warn'); return; }
    const ring = hit.p.ring;
    demClearDraw();
    _demBbox = { minLat: Math.min(...ring.map(c => c[1])), maxLat: Math.max(...ring.map(c => c[1])), minLng: Math.min(...ring.map(c => c[0])), maxLng: Math.max(...ring.map(c => c[0])) };
    _demClip = { type: 'Polygon', coordinates: [ring.map(c => [c[0], c[1]])] };
    FL.area = 'kml'; FL.kmlName = hit.p.name; FL.result = null;
    _flPickStop(); _flDraw(); openFloodPanel(); _flFit();
  };
  _flPickKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); _flPickStop(); openFloodPanel(); } };
  el.addEventListener('click', _flPickFn, true);
  document.addEventListener('keydown', _flPickKey, true);
}
function _flPickStop() {
  if (!_flPickFn) return;
  const el = map.getContainer();
  el.removeEventListener('click', _flPickFn, true); document.removeEventListener('keydown', _flPickKey, true);
  _flPickFn = _flPickKey = null; el.style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
}

// ── Расчёт ─────────────────────────────────────────────────
async function floodRun() {
  const inp = document.getElementById('fl-level'); if (inp) _flSetLevel(inp.value);
  if (!_demBbox) { toast('Сначала выберите область расчёта', 'err'); return; }
  const level = _flLevel();
  if (!Number.isFinite(level)) { toast('Введите отметку уровня воды, м (БСВ-77)', 'err'); inp && inp.focus(); return; }
  if (FL.busy) return;
  FL.busy = true;
  const stEl = () => document.getElementById('fl-status');
  if (stEl()) stEl().textContent = '⏳ Расчёт…';
  document.querySelectorAll('#mft .btn').forEach(b => b.disabled = true);
  const sse = new EventSource(`${location.origin}/api/events`);
  sse.onmessage = e => { try { const d = JSON.parse(e.data); if ((d.type === 'flood_progress' || d.type === 'dem_progress') && stEl()) stEl().textContent = `⏳ ${d.text} (${d.pct}%)`; } catch (x) {} };
  try {
    const r = await fetch(`${API}/dem/flood`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: _demBbox, clip: _demClip || null, level, minArea: FL.minArea, waterAsFlood: FL.water, connectedOnly: FL.connected }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
    const first = !FL.result;
    FL.result = j;
    _flDraw();
    if (first) setTimeout(_flFit, 50);
    if (!j.features.length) toast(`При отметке ${_flNum(level)} м затопленных зон нет`, 'warn');
  } catch (e) {
    toast('❌ ' + e.message, 'err');
  } finally {
    sse.close(); FL.busy = false;
    if (document.getElementById('fl-level')) openFloodPanel();
  }
}
// Показать область расчёта в свободной от окна части карты
function _flFit() {
  const b = _demBbox; if (!b || typeof _dwFit !== 'function') return;
  _dwFit([[[b.minLng, b.minLat], [b.maxLng, b.maxLat]]]);
}
// Синяя заливка на карте; щелчок по зоне — её параметры и выгрузка
function _flDraw() {
  if (FL.layer) { try { map.removeLayer(FL.layer); } catch (e) {} FL.layer = null; }
  const r = FL.result; if (!r || !r.features.length) return;
  FL.layer = L.geoJSON(r, {
    style: { color: '#1d4ed8', weight: 1, opacity: 0.9, fillColor: '#2563eb', fillOpacity: 0.45 },
    onEachFeature: (f, ly) => {
      const p = f.properties;
      ly.bindTooltip(`<b>${esc(p.name)}</b><br>${_flHa(p.area_m2)}${p.depth_max != null ? `<br>глубина до ${_flNum(p.depth_max)} м (средн. ${_flNum(p.depth_mean)} м)` : ''}`, { sticky: true });
      const menu = e => {
        L.DomEvent.stopPropagation(e);
        const oe = e.originalEvent; if (oe) oe.preventDefault();
        window._ctxKeepUntil = Date.now() + 400;
        ly.closeTooltip();      // тот же клик не должен сразу закрыть меню
        showCtx(oe.clientX, oe.clientY, [
          { i: '🌊', l: `<b>${esc(p.name)}</b> <span style="color:var(--tx3);font-weight:400">${_flHa(p.area_m2)}</span>`, f: null, html: true },
          { sep: true },
          { i: '📐', l: 'Выгрузить эту зону (DXF…)', f: () => floodExport(f) },
          { i: '📐', l: 'Выгрузить все зоны (DXF…)', f: () => floodExport() },
          { i: '🔍', l: 'Приблизить', f: () => map.flyToBounds(ly.getBounds(), { padding: [60, 60], maxZoom: 17 }) },
        ]);
      };
      ly.on('click', menu); ly.on('contextmenu', menu);
    },
  }).addTo(map);
}
function floodClear() {
  if (FL.layer) { try { map.removeLayer(FL.layer); } catch (e) {} FL.layer = null; }
  FL.result = null; openFloodPanel();
}

// ── Выгрузка и сохранение ──────────────────────────────────
// Точка подписи внутри полигона: ближайшая к центру из сетки точек внутри контура
function _flLabelPt(ring) {
  const xs = ring.map(c => c[0]), ys = ring.map(c => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const ins = (x, y) => { let r = false; for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) { const [xa, ya] = ring[a], [xb, yb] = ring[b]; if (((ya > y) !== (yb > y)) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) r = !r; } return r; };
  if (ins(cx, cy)) return [cx, cy];
  let best = null, bd = Infinity;
  for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) {
    const x = x0 + (x1 - x0) * i / 16, y = y0 + (y1 - y0) * j / 16;
    if (ins(x, y)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
  }
  return best || ring[0];
}
function _flParts(feats) {
  const lv = _flLevel();
  const z = g => g.type === 'Polygon' ? g.coordinates.map(r => r.map(c => [c[0], c[1], lv]))
    : g.coordinates.map(p => p.map(r => r.map(c => [c[0], c[1], lv])));
  const polys = feats.map(f => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: f.geometry.type, coordinates: z(f.geometry) } }));
  const labels = feats.map(f => {
    const p = f.properties, outer = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]
      : f.geometry.coordinates.slice().sort((a, b) => _dwRingArea(b[0]) - _dwRingArea(a[0]))[0][0];
    return { type: 'Feature', properties: { name: `${p.name}: ${_flHa(p.area_m2)}${p.depth_max != null ? ', h до ' + _flNum(p.depth_max) + ' м' : ''}` },
      geometry: { type: 'Point', coordinates: _flLabelPt(outer) } };
  });
  const bnd = _demClip ? _demClip : { type: 'Polygon', coordinates: [[[_demBbox.minLng, _demBbox.minLat], [_demBbox.maxLng, _demBbox.minLat], [_demBbox.maxLng, _demBbox.maxLat], [_demBbox.minLng, _demBbox.maxLat], [_demBbox.minLng, _demBbox.minLat]]] };
  return [
    { name: 'ЗОНА_ЗАТОПЛЕНИЯ', color: '#2563eb', features: polys },
    { name: 'ЗАТОПЛЕНИЕ_ПОДПИСИ', color: '#1d4ed8', features: labels },
    { name: 'ГРАНИЦА_РАСЧЁТА', color: '#ef4444', features: _demBbox ? [{ type: 'Feature', properties: { name: '' }, geometry: bnd }] : [] },
  ];
}
function floodExport(one) {
  const r = FL.result; if (!r || !r.features.length) { toast('Сначала рассчитайте зоны', 'warn'); return; }
  const lv = _flNum(_flLevel()).replace(',', '_');
  const choices = [];
  if (one) choices.push({ key: 'one', label: `Только ${esc(one.properties.name)} (${_flHa(one.properties.area_m2)})`, parts: _flParts([one]) });
  choices.push({ key: 'all', label: `Все зоны затопления (${r.features.length})`, parts: _flParts(r.features) });
  kmlExportDialog(choices, `Затопление_${lv}м_БСВ77`);
}
async function floodSaveLayer() {
  const r = FL.result; if (!r || !r.features.length) return;
  const lv = _flLevel();
  const name = `Затопление ${_flNum(lv)} м БСВ-77`;
  const feats = r.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: {
    name: f.properties.name, 'Площадь, га': +(f.properties.area_m2 / 1e4).toFixed(3),
    'Глубина макс., м': f.properties.depth_max, 'Глубина средн., м': f.properties.depth_mean, 'Отметка БСВ-77, м': lv } }));
  try {
    const res = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: '#2563eb', geojson: JSON.stringify({ type: 'FeatureCollection', features: feats }) }) });
    if (!res.ok) return;
    layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
    try { renderLP(); renderLayerGroups(); } catch (e) {}
    try { if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
    toast(`💾 Сохранено слоем «${name}»`, 'ok');
  } catch (e) { toast('Не удалось сохранить слой', 'err'); }
}
