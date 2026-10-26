// ═══════════════════════════════════════════════════════════
// dem-wizard.js — пошаговая выгрузка рельефа и подложки:
//   1. Область (прямоугольник / полигон / линия+буфер / по KML)
//   2. Что выгружать (рельеф+подложка / только рельеф / только подложка)
//   3. Система координат и параметры рельефа
//   4. Подложка (источник, детализация, размер пикселя)
//   5. Проверка и выгрузка
// БСВ-77 и «1 пиксель = 1 метр» включены по умолчанию. Служебное (кэш тайлов,
// папка, геоид) — только администратору.
// ═══════════════════════════════════════════════════════════
const DW = Object.assign({
  step: 1, area: '', what: 'both', projId: '', projUser: false, zone: '',
  interval: 2, grid: 20, jMin: 0.5, jMax: 2, buffer: 100,
  satSource: 'esri', satZoom: 0, satMPP: 1, kml: [],      // kml: [{layerId, idx, name, ring}]
}, (() => { try { const s = JSON.parse(localStorage.getItem('dem_wizard') || '{}'); delete s.step; delete s.kml; delete s.area; return s; } catch (e) { return {}; } })());
try { if (localStorage.getItem('dem_sat_1m') === '0' && !('satMPP' in JSON.parse(localStorage.getItem('dem_wizard') || '{}'))) DW.satMPP = 0; } catch (e) {}
function _dwSave() { try { const { step, kml, area, ...rest } = DW; localStorage.setItem('dem_wizard', JSON.stringify(rest)); } catch (e) {} }
const DW_STEPS = [['area', 'Область'], ['what', 'Что выгрузить'], ['params', 'Параметры'], ['sat', 'Подложка'], ['go', 'Выгрузка']];
const _dwHasRelief = () => DW.what !== 'sat' && DW.what !== 'cache';
const _dwHasSat = () => DW.what === 'both' || DW.what === 'sat';
const _dwStepOn = i => !(i === 4 && !_dwHasSat()) && !(i === 3 && DW.what === 'cache');
const _dwAreaReady = () => DW.area === 'kml' ? DW.kml.length > 0 : !!_demBbox;
const _dwLat = () => DW.area === 'kml' && DW.kml.length ? DW.kml[0].ring.reduce((s, c) => s + c[1], 0) / DW.kml[0].ring.length : _demBbox ? (_demBbox.minLat + _demBbox.maxLat) / 2 : 61;
const _dwRes = z => 156543.034 * Math.cos(_dwLat() * Math.PI / 180) / Math.pow(2, z);   // м/пиксель снимка
// Габарит выгрузки (для КМЛ — по всем выбранным полигонам)
function _dwBbox() {
  if (DW.area !== 'kml') return _demBbox;
  if (!DW.kml.length) return null;
  const pts = DW.kml.flatMap(k => k.ring);
  return { minLat: Math.min(...pts.map(p => p[1])), maxLat: Math.max(...pts.map(p => p[1])), minLng: Math.min(...pts.map(p => p[0])), maxLng: Math.max(...pts.map(p => p[0])) };
}
function _dwAreaKm2(b) { if (!b) return 0; const h = (b.maxLat - b.minLat) * 111320, w = (b.maxLng - b.minLng) * 111320 * Math.cos((b.minLat + b.maxLat) / 2 * Math.PI / 180); return h * w / 1e6; }

// ── Окно ───────────────────────────────────────────────────
function openDEMPanel(step) {
  if (step) DW.step = step;
  if (!_dwStepOn(DW.step)) DW.step = 1;
  const card = (on, onclick, icon, title, sub) => `<div class="dw-card${on ? ' on' : ''}" onclick="${onclick}"><div class="dw-ic">${icon}</div><div><b>${title}</b><div class="dw-sub">${sub}</div></div></div>`;
  const steps = DW_STEPS.map(([k, l], i) => _dwStepOn(i + 1) ? `<div class="dw-st${DW.step === i + 1 ? ' on' : i + 1 < DW.step ? ' done' : ''}" onclick="_dwGo(${i + 1})">${i + 1}. ${l}</div>` : '').filter(Boolean).join('<span class="dw-arr">›</span>');
  let body = '';
  const b = _dwBbox(), km2 = _dwAreaKm2(b);
  const areaInfo = !_dwAreaReady() ? '<span style="color:var(--tx3)">Область ещё не выбрана</span>'
    : DW.area === 'kml' ? `✅ Полигонов KML: <b>${DW.kml.length}</b> (${DW.kml.slice(0, 4).map(k => esc(k.name)).join(', ')}${DW.kml.length > 4 ? '…' : ''}) · габарит ≈ ${km2.toFixed(1)} км²`
    : `✅ ${({ rect: 'Прямоугольник', polygon: 'Полигон', line: 'Коридор вдоль линии', last: 'Предыдущая область' })[DW.area] || 'Область'} ≈ ${km2.toFixed(km2 < 1 ? 3 : 1)} км²${_demClip ? ' · обрезка по контуру' : ''}`;

  if (DW.step === 1) {
    body = `<div class="dw-h">Какую область выгрузить?</div>
      <div class="dw-grid">
        ${card(DW.area === 'rect', "_dwArea('rect')", '▭', 'Прямоугольник', 'два угла на карте')}
        ${card(DW.area === 'polygon', "_dwArea('polygon')", '⬠', 'Полигон', 'вершины на карте, обрезка по контуру')}
        ${card(DW.area === 'line', "_dwArea('line')", '〰', 'Линия + буфер', 'коридор вдоль трассы')}
        ${card(DW.area === 'kml', "_dwArea('kml')", '🗂', 'По KML', 'полигоны слоёв: на карте или списком')}
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:12px">
        <label style="display:${DW.area === 'kml' ? 'none' : 'flex'};gap:6px;align-items:center;text-transform:none;font-weight:500;margin:0">Буфер линии, м: <input id="dem-buffer" type="number" min="1" step="10" value="${DW.buffer}" style="width:90px" onchange="DW.buffer=+this.value||100;_dwSave()"></label>
        ${_demLastBbox ? `<button class="btn bs bsm" onclick="_dwArea('last')">↩ Предыдущая область</button>` : ''}
        ${_dwAreaReady() ? `<button class="btn bs bsm" onclick="demClearDraw();DW.area='';DW.kml=[];_dwKmlShow();openDEMPanel(1)">✕ Сбросить</button>` : ''}
      </div>
      <div class="dw-info">${areaInfo}</div>
      ${DW.area === 'kml' ? _dwKmlListHtml() : ''}`;
  } else if (DW.step === 2) {
    body = `<div class="dw-h">Что выгрузить?</div>
      <div class="dw-grid">
        ${card(DW.what === 'both', "DW.what='both';_dwSave();openDEMPanel(2)", '🏔🛰', 'Рельеф + подложка', 'DXF с горизонталями и точками + спутниковый GeoTIFF')}
        ${card(DW.what === 'relief', "DW.what='relief';_dwSave();openDEMPanel(2)", '🏔', 'Только рельеф', 'DXF: горизонтали и отметки высот (БСВ-77)')}
        ${card(DW.what === 'sat', "DW.what='sat';_dwSave();openDEMPanel(2)", '🛰', 'Только подложка', 'спутниковый снимок GeoTIFF с привязкой')}
        ${isAdminClient() ? card(DW.what === 'cache', "DW.what='cache';_dwSave();openDEMPanel(2)", '📦', 'Только кэш ArcticDEM', 'служебное: скачать тайлы рельефа заранее') : ''}
      </div>`;
  } else if (DW.step === 3) {
    body = `<div class="dw-h">Система координат${_dwHasRelief() ? ' и параметры рельефа' : ''}</div>
      <div class="fgr">
        <div class="fg s2"><label>Система координат</label>
          <select id="dem-proj" onchange="DW.projId=this.value;DW.projUser=true;DW.zone='';_dwSave();_demUpdateZoneSelect()" style="width:100%">${DEM_PROJECTIONS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}</select>
          <div id="dem-zone-wrap" style="display:none;margin-top:5px;align-items:center;gap:6px"><span style="font-size:11px;color:var(--tx2);white-space:nowrap">Зона:</span>
            <select id="dem-zone" onchange="DW.zone=this.value;_dwSave()" style="flex:1"><option value="">Авто (по центру области)</option></select></div>
          ${DW.area === 'kml' ? '<div style="font-size:10px;color:var(--tx3);margin-top:3px">Для «Авто» зона подбирается отдельно для каждого полигона.</div>' : ''}
        </div>
        ${_dwHasRelief() ? `
        <div class="fg"><label>Шаг горизонталей, м</label><input id="dem-interval" type="number" min="0.1" step="0.5" value="${DW.interval}" onchange="DW.interval=+this.value||2;_dwSave()"></div>
        <div class="fg"><label>Шаг сетки отметок, м <span style="text-transform:none;font-weight:400;color:var(--tx3)">(0 — без точек)</span></label>
          <input id="dem-grid-step" type="number" min="0" step="1" list="dw-grid-list" value="${DW.grid}" onchange="DW.grid=Math.max(0,parseInt(this.value)||0);_dwSave()">
          <datalist id="dw-grid-list"><option value="5"><option value="10"><option value="20"><option value="25"><option value="50"><option value="100"><option value="0"></datalist></div>
        <div class="fg s2"><details><summary style="cursor:pointer;font-size:11px;color:var(--acc);font-weight:700">Дополнительно: разброс точек в плане (имитация пикетажа)</summary>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px">от <input id="dem-jitter-min" type="number" min="0" step="0.1" value="${DW.jMin}" style="width:80px" onchange="DW.jMin=+this.value||0;_dwSave()">
            до <input id="dem-jitter-max" type="number" min="0" step="0.1" value="${DW.jMax}" style="width:80px" onchange="DW.jMax=+this.value||0;_dwSave()"> м
            <span style="color:var(--tx3);font-size:10px">0 / 0 — строгая сетка</span></div></details></div>
        <div class="fg s2" style="font-size:11px;color:var(--tx3)">Высоты — в Балтийской системе (БСВ-77, по геоиду EGM2008).</div>` : ''}
      </div>
      ${isAdminClient() ? _dwAdminHtml() : ''}`;
  } else if (DW.step === 4) {
    const zs = [14, 15, 16, 17, 18, 19];
    body = `<div class="dw-h">Спутниковая подложка</div>
      <div class="fgr">
        <div class="fg s2"><label>Источник снимков</label><select id="dem-sat-source" onchange="DW.satSource=this.value;_dwSave()" style="width:100%">${DEM_SAT_SOURCES.map(s => `<option value="${s.id}" ${DW.satSource === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        <div class="fg s2"><label>Детализация снимка</label><select id="dem-sat-zoom" onchange="DW.satZoom=+this.value;_dwSave();openDEMPanel(4)" style="width:100%">
          <option value="0" ${!DW.satZoom ? 'selected' : ''}>Авто — подобрать под размер области</option>
          ${zs.map(z => `<option value="${z}" ${DW.satZoom === z ? 'selected' : ''}>z${z} — ~${_dwRes(z).toFixed(_dwRes(z) < 1 ? 2 : 1)} м/пиксель${z === 17 ? ' (подробно)' : z >= 18 ? ' (максимум, есть не везде)' : ''}</option>`).join('')}
        </select></div>
        <div class="fg s2"><label>Размер пикселя готовой подложки</label><select id="dem-sat-mpp" onchange="DW.satMPP=+this.value;_dwSave();openDEMPanel(4)" style="width:100%">
          <option value="1" ${DW.satMPP === 1 ? 'selected' : ''}>1 м — для МенуГЕО/AutoCAD: масштаб при вставке сразу верный</option>
          <option value="0.5" ${DW.satMPP === 0.5 ? 'selected' : ''}>0,5 м — детальнее (в МенуГЕО масштаб вставки ×0,5)</option>
          <option value="0.25" ${DW.satMPP === 0.25 ? 'selected' : ''}>0,25 м — очень детально (масштаб ×0,25)</option>
          <option value="0" ${!DW.satMPP ? 'selected' : ''}>Как в снимке (без пересчёта)</option>
        </select></div>
      </div>
      <div class="dw-info">${_dwSatNote()}</div>`;
  } else {
    body = `<div class="dw-h">Проверьте и выгрузите</div>${_dwSummaryHtml()}
      <div id="dem-progress" style="display:none;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--acc);margin-bottom:5px" id="dem-progress-text">⏳ Подготовка...</div>
        <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div id="dem-progress-bar" style="height:6px;background:var(--acc);border-radius:3px;width:0%;transition:width .4s"></div></div>
      </div>`;
  }
  const last = DW.step === 5;
  showModal('🏔 Выгрузка рельефа и подложки', `<div class="dw-steps">${steps}</div><div class="dw-body">${body}</div>`, [
    { label: 'Закрыть', cls: 'bs', fn: () => { demCancelDraw(); _dwKmlPickStop(); closeModal(); } },
    ...(DW.step > 1 ? [{ label: '← Назад', cls: 'bs', fn: () => _dwGo(_dwPrev()) }] : []),
    last ? { label: '⬇️ Выгрузить', cls: 'bp', fn: _dwExport } : { label: 'Далее →', cls: 'bp', fn: () => _dwGo(_dwNext()) },
  ]);
  if (DW.step === 3) {
    _demAppendUtmOption();
    const after = () => { _demAppendMskOptions(); const s = document.getElementById('dem-proj'); if (s) { if (!DW.projId) DW.projId = _dwSuggestProj(); s.value = DW.projId; if (s.value !== DW.projId) s.selectedIndex = 0; } _demUpdateZoneSelect(); const z = document.getElementById('dem-zone'); if (z) z.value = DW.zone || ''; };
    if (typeof loadMskFull === 'function') loadMskFull().then(after).catch(after); else after();
    if (isAdminClient()) { setTimeout(demRefreshTileCache, 100); setTimeout(_demLoadTilesDir, 120); setTimeout(demCheckGeoid, 140); }
  }
}
function _dwNext() { let s = DW.step + 1; while (s <= 5 && !_dwStepOn(s)) s++; return Math.min(5, s); }
function _dwPrev() { let s = DW.step - 1; while (s > 1 && !_dwStepOn(s)) s--; return Math.max(1, s); }
function _dwGo(s) {
  if (s > 1 && !_dwAreaReady()) { toast('Сначала выберите область', 'err'); s = 1; }
  if (!_dwStepOn(s)) s = s > DW.step ? _dwNext() : _dwPrev();
  DW.step = s; openDEMPanel();
}
// СК по умолчанию: ГСК-2011 в зоне по центру области (как раньше)
function _dwSuggestProj() {
  const b = _dwBbox(); if (!b) return DEM_PROJECTIONS[0].id;
  const lng = (b.minLng + b.maxLng) / 2;
  return lng < 72 ? 'gsk2011_z12' : lng < 78 ? 'gsk2011_z13' : lng < 84 ? 'gsk2011_z14' : 'gsk2011_z15';
}
function _dwArea(kind) {
  if (kind === 'kml') { DW.area = 'kml'; demClearDraw(); _dwKmlShow(); openDEMPanel(1); return; }
  DW.kml = []; _dwKmlShow();
  if (kind === 'last') { DW.area = 'last'; demRestoreLast(); if (!DW.projUser) DW.projId = ''; setTimeout(() => openDEMPanel(2), 80); return; }
  DW.area = kind;
  if (kind === 'rect') demStartDraw(); else if (kind === 'polygon') demStartPolygon(); else demStartLine();
}
// Вызывается после рисования области (вместо старого окна) — сразу к шагу 2
function _demFinalize(b) {
  _demDrawing = false;
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
  if (!DW.projUser) DW.projId = '';
  openDEMPanel(2);
}

// ── По KML: выбор полигонов списком или щелчками на карте ──
// Полигоны слоя (нумерация как в _demPolysOfLayer) + признак «объект скрыт»
function _dwPolys(l) {
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return []; }
  const out = [];
  (gj.features || []).forEach((f, i) => {
    const g = f && f.geometry; if (!g) return;
    const nm = (f.properties && (f.properties.name || f.properties.Name || f.properties['НАЗВ'])) || `Полигон ${i + 1}`;
    const hidden = !!(f.properties && f.properties._hidden);
    if (g.type === 'Polygon') out.push({ name: String(nm), ring: g.coordinates[0], hidden });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((pp, k) => out.push({ name: `${nm}${g.coordinates.length > 1 ? ' (' + (k + 1) + ')' : ''}`, ring: pp[0], hidden }));
  });
  return out.filter(p => p.ring && p.ring.length >= 4);
}
// Слой сейчас нарисован на карте (включён, его группа/объект активны, подходит масштаб)
function _dwOnMap(l) {
  const g = typeof lGroups === 'object' && lGroups ? lGroups[l.id] : null;
  return !!(g && map.hasLayer(g));
}
function _dwKmlListHtml() {
  const all = (layers || []).map(l => ({ l, polys: _dwPolys(l), on: _dwOnMap(l) })).filter(x => x.polys.length);
  if (!all.length) return '<div class="dw-info" style="color:var(--red)">Нет слоёв с полигонами — импортируйте или нарисуйте контуры.</div>';
  const isSel = (l, i) => DW.kml.some(k => k.layerId === l.id && k.idx === i);
  const item = c => `<details ${c.polys.some((p, i) => isSel(c.l, i)) ? 'open' : ''}><summary style="cursor:pointer;font-size:12px;font-weight:700;padding:3px 0">${esc(c.l.name)} <span style="color:var(--tx3);font-weight:400">— ${c.polys.length} полиг.</span>
          <button class="btn bs bxs" onclick="event.preventDefault();_dwKmlAllOf('${escAttr(c.l.id)}')">все</button></summary>
        ${c.polys.map((p, i) => `<label style="display:flex;gap:6px;align-items:center;padding:2px 0 2px 14px;font-size:12px;text-transform:none;font-weight:500;margin:0"><input type="checkbox" ${isSel(c.l, i) ? 'checked' : ''} onchange="_dwKmlToggle('${escAttr(c.l.id)}',${i},this.checked)" style="width:auto;margin:0"> ${esc(p.name)}${p.hidden ? ' <span style="color:var(--tx3)">(скрыт)</span>' : ''}</label>`).join('')}</details>`;
  const shown = all.filter(c => c.on), off = all.filter(c => !c.on);
  return `<div style="display:flex;gap:6px;align-items:center;margin:8px 0 4px">
      <button class="btn bp bsm" onclick="_dwKmlPick()">🗺 Указать полигоны на карте</button>
      <span style="font-size:11px;color:var(--tx3)">или отметьте в списке:</span></div>
    <div style="max-height:220px;overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs);padding:4px 8px">
      ${shown.length ? shown.map(item).join('') : '<div style="font-size:11px;color:var(--tx3);padding:4px 0">Ни один слой с полигонами сейчас не показан на карте.</div>'}
      ${off.length ? `<details style="margin-top:4px;border-top:1px solid var(--bd);padding-top:4px" ${off.some(c => c.polys.some((p, i) => isSel(c.l, i))) ? 'open' : ''}><summary style="cursor:pointer;font-size:11px;color:var(--tx3);font-weight:700">Скрытые слои (${off.length})</summary><div style="padding-left:8px">${off.map(item).join('')}</div></details>` : ''}
    </div>`;
}
function _dwKmlToggle(layerId, idx, on) {
  DW.kml = DW.kml.filter(k => !(k.layerId === layerId && k.idx === idx));
  if (on) { const l = layers.find(x => x.id === layerId); const p = _dwPolys(l)[idx]; if (p) DW.kml.push({ layerId, idx, name: p.name, ring: p.ring }); }
  _dwKmlShow(); openDEMPanel(1);
}
function _dwKmlAllOf(layerId) {
  const l = layers.find(x => x.id === layerId); if (!l) return;
  _dwPolys(l).forEach((p, i) => { if (!p.hidden && !DW.kml.some(k => k.layerId === layerId && k.idx === i)) DW.kml.push({ layerId, idx: i, name: p.name, ring: p.ring }); });
  _dwKmlShow(); openDEMPanel(1);
}
let _dwKmlLayer = null;
function _dwKmlShow() {
  if (_dwKmlLayer) { try { map.removeLayer(_dwKmlLayer); } catch (e) {} _dwKmlLayer = null; }
  if (!DW.kml.length) return;
  _dwKmlLayer = L.layerGroup(DW.kml.map(k => L.polygon(k.ring.map(c => [c[1], c[0]]), { color: '#f59e0b', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.25, interactive: false }))).addTo(map);
}
// Режим щелчков по карте: щелчок по полигону показанного на карте слоя — выбрать/снять
// (скрытые слои и скрытые объекты не участвуют)
let _dwPickFn = null, _dwPickKey = null, _dwPickCtx = null;
function _dwKmlPick() {
  closeModal();
  const all = [];
  (layers || []).filter(_dwOnMap).forEach(l => _dwPolys(l).forEach((p, i) => { if (!p.hidden) all.push({ l, i, p }); }));
  if (!all.length) { toast('На карте не показано ни одного слоя с полигонами — включите слой или выберите из списка', 'warn'); openDEMPanel(1); return; }
  const inRing = (lng, lat, r) => { let ins = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xa, ya] = r[a], [xb, yb] = r[b]; if (((ya > lat) !== (yb > lat)) && lng < (xb - xa) * (lat - ya) / (yb - ya) + xa) ins = !ins; } return ins; };
  const bnr = document.getElementById('bnr'), t = document.getElementById('bnr-t');
  const upd = () => { if (t) t.innerHTML = `🗂 Щёлкайте по полигонам — выбрать / снять · выбрано: <b>${DW.kml.length}</b> · <button class="btn bsm" style="background:#16a34a;color:#fff;border:none" onclick="_dwKmlPickStop(true)">Готово (Enter)</button>`; };
  if (t) t.onclick = e => e.stopPropagation();
  if (bnr) { bnr.className = 'show draw'; bnr.style.display = 'flex'; } upd();
  map.getContainer().style.cursor = 'pointer';
  const el = map.getContainer();
  _dwPickFn = ev => {
    if (ev.target.closest && ev.target.closest('.leaflet-control,#bnr')) return;
    ev.stopPropagation(); ev.preventDefault();
    const ll = map.mouseEventToLatLng(ev);
    const hit = all.filter(h => inRing(ll.lng, ll.lat, h.p.ring));
    if (!hit.length) { toast('Здесь нет полигона', 'warn'); return; }
    const h = hit.sort((a, b) => _dwRingArea(a.p.ring) - _dwRingArea(b.p.ring))[0];    // самый маленький (вложенный)
    const was = DW.kml.some(k => k.layerId === h.l.id && k.idx === h.i);
    DW.kml = DW.kml.filter(k => !(k.layerId === h.l.id && k.idx === h.i));
    if (!was) DW.kml.push({ layerId: h.l.id, idx: h.i, name: h.p.name, ring: h.p.ring });
    _dwKmlShow(); upd();
  };
  _dwPickKey = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); _dwKmlPickStop(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); _dwKmlPickStop(true); } };
  _dwPickCtx = e => { e.preventDefault(); e.stopPropagation(); _dwKmlPickStop(true); };
  el.addEventListener('click', _dwPickFn, true);
  el.addEventListener('contextmenu', _dwPickCtx, true);
  document.addEventListener('keydown', _dwPickKey, true);
}
function _dwRingArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s); }
function _dwKmlPickStop(reopen) {
  if (!_dwPickFn) return;
  const el = map.getContainer();
  el.removeEventListener('click', _dwPickFn, true); el.removeEventListener('contextmenu', _dwPickCtx, true);
  document.removeEventListener('keydown', _dwPickKey, true);
  _dwPickFn = _dwPickKey = _dwPickCtx = null;
  el.style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
  if (reopen) { if (!DW.projUser) DW.projId = ''; openDEMPanel(DW.kml.length ? 2 : 1); }
}

// ── Подсказки и сводка ─────────────────────────────────────
function _dwSatNote() {
  const b = _dwBbox(); if (!b) return '';
  const est = _demSatEstimate(b), z = DW.satZoom || est.zoom, src = _dwRes(z);
  const wM = (b.maxLng - b.minLng) * 111320 * Math.cos((b.minLat + b.maxLat) / 2 * Math.PI / 180), hM = (b.maxLat - b.minLat) * 111320;
  const mpp = DW.satMPP || src, px = Math.round(wM / mpp) * Math.round(hM / mpp);
  const parts = Math.ceil(wM / mpp / 16000) * Math.ceil(hM / mpp / 16000);
  const msg = [`Снимок z${z}: ~${src.toFixed(2)} м/пиксель${DW.satZoom ? '' : ' (Авто)'} → подложка ${mpp === src ? 'как в снимке' : mpp + ' м/пиксель'}, ≈ ${Math.round(wM / mpp)} × ${Math.round(hM / mpp)} пикселей${parts > 1 ? `, <b>${parts} частей</b>` : ''}.`];
  if (DW.satMPP && src < DW.satMPP * 0.9) msg.push(`⚠️ Снимок детальнее (${src.toFixed(2)} м), чем пиксель подложки (${DW.satMPP} м) — часть деталей потеряется, картинка будет мягче. Для чёткости выберите размер пикселя ${src < 0.4 ? '0,25' : '0,5'} м.`);
  if (DW.satMPP && src > DW.satMPP * 1.5) msg.push(`ℹ️ Снимок грубее пикселя подложки — поднимите детализацию до z${Math.min(19, z + Math.ceil(Math.log2(src / DW.satMPP)))} для резкости.`);
  if (px > 400e6) msg.push('⚠️ Очень большая подложка — выгрузка займёт много времени.');
  return msg.join('<br>');
}
function _dwSummaryHtml() {
  const b = _dwBbox(), km2 = _dwAreaKm2(b);
  const pid = DW.projId || _dwSuggestProj(), projSel = DEM_PROJECTIONS.find(p => p.id === pid);
  const projName = projSel ? projSel.label : String(pid).replace('mskfull:', 'МСК-').replace('utmauto', 'UTM (авто зона)');
  const row = (k, v) => `<tr><td style="color:var(--tx3);padding:3px 10px 3px 0;white-space:nowrap">${k}</td><td style="padding:3px 0">${v}</td></tr>`;
  return `<table style="font-size:12px;border-collapse:collapse">
    ${row('Область', DW.area === 'kml' ? `по KML: ${DW.kml.length} полиг. (каждый — своя папка в архиве)` : `${({ rect: 'прямоугольник', polygon: 'полигон', line: 'линия + буфер ' + DW.buffer + ' м', last: 'предыдущая' })[DW.area] || ''}, ≈ ${km2.toFixed(km2 < 1 ? 3 : 1)} км²`)}
    ${row('Выгрузить', ({ both: 'рельеф + подложка', relief: 'только рельеф', sat: 'только подложка', cache: 'только кэш ArcticDEM' })[DW.what])}
    ${DW.what !== 'cache' ? row('Система координат', esc(projName) + (DW.zone ? `, зона ${DW.zone}` : ', зона — авто')) : ''}
    ${_dwHasRelief() ? row('Рельеф', `горизонтали через ${DW.interval} м, ${DW.grid ? 'отметки через ' + DW.grid + ' м' : 'без отметок'}, высоты БСВ-77`) : ''}
    ${_dwHasSat() ? row('Подложка', `${(DEM_SAT_SOURCES.find(s => s.id === DW.satSource) || {}).label || ''}, ${DW.satZoom ? 'z' + DW.satZoom : 'детализация авто'}, ${DW.satMPP ? DW.satMPP + ' м/пиксель' : 'пиксель как в снимке'}`) : ''}
  </table>${km2 > 100 ? '<div class="dw-info">⚠️ Большая область — выгрузка может занять несколько минут.</div>' : ''}`;
}
function _dwAdminHtml() {
  return `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--tx3);font-weight:700">🛡 Служебное (видно только администратору): кэш тайлов, геоид</summary>
    <div id="dem-geoid-status" style="font-size:10px;margin-top:6px;padding:5px 8px;border-radius:var(--rs);background:var(--s2);border:1px solid var(--bd)"><span style="color:var(--tx3)">⏳ Проверяю геоид-гриды...</span></div>
    <div id="dem-tile-cache" style="font-size:10px;margin-top:4px;padding:5px 8px;border-radius:var(--rs);background:var(--s2);border:1px solid var(--bd)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span id="dem-tile-cache-info" style="color:var(--tx3)">⏳ Кэш тайлов...</span>
        <div style="display:flex;gap:4px"><button onclick="demToggleTileCoverage()" id="dem-tile-show-btn" class="btn bs bxs" style="display:none">🗺 Показать</button>
          <button onclick="demClearTileCacheBbox()" id="dem-tile-cache-bbox-btn" class="btn bs bxs" style="display:none">🗑 По рамке</button>
          <button onclick="demClearTileCache()" id="dem-tile-cache-btn" class="btn bs bxs" style="display:none">🗑 Всё</button></div></div>
      <div style="margin-top:5px;border-top:1px solid var(--bd);padding-top:5px"><div style="display:flex;align-items:center;gap:4px"><span style="color:var(--tx3)">📁 Папка:</span>
        <span id="dem-tiles-dir-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">—</span>
        <button onclick="demToggleTilesDirEdit()" class="btn bs bxs">✏️ Изменить</button></div>
        <div id="dem-tiles-dir-edit" style="display:none;margin-top:5px"><div style="display:flex;gap:4px"><input id="dem-tiles-dir-input" type="text" style="flex:1;font-size:10px"><button onclick="demSaveTilesDir()" class="btn bp bxs">Сохранить</button></div></div></div>
    </div></details>`;
}

// ── Выгрузка ───────────────────────────────────────────────
function _dwParams() {
  const so = DEM_SAT_SOURCES.find(s => s.id === DW.satSource) || DEM_SAT_SOURCES[0];
  return { interval: DW.interval, gridStep: DW.grid, jitterMin: DW.jMin, jitterMax: DW.jMax, useGeoid: true,
    exportSatellite: _dwHasSat(), satelliteOnly: DW.what === 'sat', cacheOnly: DW.what === 'cache',
    satZoom: DW.satZoom || 0, satMPP: DW.satMPP || 0, satSourceUrl: so.url, satSourceSubdomains: so.subdomains };
}
async function _dwExport() {
  if (!_dwAreaReady()) { toast('Сначала выберите область', 'err'); return; }
  const projId = DW.projId || _dwSuggestProj(), forcedZone = parseInt(DW.zone) || 0;
  if (DW.area === 'kml') {
    window._demBatchCfg = { params: _dwParams(), projId, forcedZone };
    const polys = DW.kml.map(k => ({ name: k.name, ring: k.ring }));
    const lname = [...new Set(DW.kml.map(k => (layers.find(l => l.id === k.layerId) || {}).name).filter(Boolean))].join(', ') || 'KML';
    return _demRunBatch({ name: lname }, polys);
  }
  const proj = DEM_PROJECTIONS.find(p => p.id === projId) || _demBuildMskProj(projId, forcedZone) || _demBuildUtmProj(projId, forcedZone);
  if (!proj) { toast('Выберите систему координат', 'err'); _dwGo(3); return; }
  const P = _dwParams();
  const pw = document.getElementById('dem-progress'), pt = document.getElementById('dem-progress-text'), pb = document.getElementById('dem-progress-bar');
  if (pw) pw.style.display = 'block';
  const setP = (pct, text) => { if (pt) pt.textContent = text; if (pb) pb.style.width = pct + '%'; };
  const btns = document.querySelectorAll('#mft .btn'); btns.forEach(b => b.disabled = true);
  const sse = new EventSource(`${location.origin}/api/events`);
  sse.onmessage = e => { try { const d = JSON.parse(e.data); if (d.type === 'dem_progress') setP(d.pct, d.text); } catch (x) {} };
  try {
    setP(5, '⏳ Запрос к ArcticDEM...');
    const res = await fetch(`${API}/dem/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: _demBbox, clip: _demClip || null, projId: proj.id, proj4: proj.proj4 || null, epsg: proj.epsg || null, projName: proj.name || null, format: 'dxf', ...P }) });
    sse.close();
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Ошибка сервера'); }
    if (P.cacheOnly) { const j = await res.json().catch(() => ({})); setP(100, '✅ Тайл закэширован'); toast(j.cached === false ? '📦 Уже было в кэше' : '✅ Тайл ArcticDEM добавлен в кэш', 'ok'); btns.forEach(b => b.disabled = false); return; }
    setP(95, '⏳ Получение файла...');
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = P.satelliteOnly ? `Satellite_${date}_${proj.name || proj.id}_z${P.satZoom || 'auto'}.zip` : `ArcticDEM_${date}_${proj.name || proj.id}_${P.interval}m.zip`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setP(100, '✅ Файл готов'); toast('✅ Выгружено: ' + a.download, 'ok');
    btns.forEach(b => b.disabled = false);
  } catch (err) {
    sse.close(); setP(0, '❌ ' + err.message); btns.forEach(b => b.disabled = false); toast('❌ ' + err.message, 'err');
  }
}
// Из меню слоя: «Рельеф по полигонам слоя» → мастер, область «По KML» с полигонами слоя
function demWizardKml(layerId) {
  DW.area = 'kml'; DW.kml = [];
  const l = (layers || []).find(x => x.id === layerId);
  if (l) _dwPolys(l).forEach((p, i) => !p.hidden && DW.kml.push({ layerId, idx: i, name: p.name, ring: p.ring }));
  demClearDraw(); _dwKmlShow(); if (!DW.projUser) DW.projId = '';
  openDEMPanel(1);
}
