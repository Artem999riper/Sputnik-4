// ═══════════════════════════════════════════════════════════
// kml-edit.js — редактирование геометрии объектов слоёв (линии, полигоны,
// мульти-; точки — перетаскиванием). Перетаскивание вершин с привязкой к
// вершинам других объектов, «ромбики» на серединах сторон — добавить
// вершину, двойной клик — удалить, Ctrl+Z — шаг назад, Enter — сохранить,
// Esc — выйти без сохранения. Живая длина / площадь в баннере.
// ═══════════════════════════════════════════════════════════
let _kgeActive = false, _kge = null;   // {layerId, fIdx, geom, orig, parts, undo:[], markers:[], preview, hidden}

function kmlEditGeometry(layerId, fIdx) {
  const l = layers.find(x => x.id === layerId); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { toast('Ошибка разбора слоя', 'err'); return; }
  const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = feats[fIdx]; if (!f || !f.geometry) { toast('Объект не найден', 'err'); return; }
  if (!/^(Point|LineString|Polygon|MultiLineString|MultiPolygon)$/.test(f.geometry.type)) { toast('Этот тип геометрии не редактируется', 'warn'); return; }
  if (_kgeActive) _kgeStop(false);
  if (typeof switchView === 'function') switchView('map');
  _kge = { layerId, fIdx, geom: JSON.parse(JSON.stringify(f.geometry)), orig: JSON.stringify(f.geometry), undo: [], markers: [], preview: null, hidden: [] };
  _kgeActive = true;
  // Приглушить исходный объект на карте, чтобы не мешал
  try {
    (lGroups[layerId] && lGroups[layerId].eachLayer ? lGroups[layerId] : { eachLayer() {} }).eachLayer(sub => {
      if (sub.feature && JSON.stringify(sub.feature.geometry) === _kge.orig) {
        if (sub.setStyle) { _kge.hidden.push([sub, { opacity: sub.options.opacity, fillOpacity: sub.options.fillOpacity }]); sub.setStyle({ opacity: 0.15, fillOpacity: 0.03 }); }
        else if (sub.setOpacity) { _kge.hidden.push([sub, null]); sub.setOpacity(0.3); }
      }
    });
  } catch (e) {}
  const n = _kgeCountVerts();
  if (n > 3000) toast(`В объекте ${n} вершин — редактирование может тормозить`, 'warn');
  document.addEventListener('keydown', _kgeKey, true);
  _kgeRender();
}

// Части геометрии, которые редактируются: [{arr, closed, min}]
function _kgeParts() {
  const g = _kge.geom, P = [];
  const ring = r => { if (r.length > 1) { const a = r[0], b = r[r.length - 1]; if (a[0] === b[0] && a[1] === b[1]) r.pop(); } P.push({ arr: r, closed: true, min: 3 }); };
  if (g.type === 'Point') P.push({ arr: [g.coordinates], closed: false, min: 1, point: true });
  else if (g.type === 'LineString') P.push({ arr: g.coordinates, closed: false, min: 2 });
  else if (g.type === 'MultiLineString') g.coordinates.forEach(c => P.push({ arr: c, closed: false, min: 2 }));
  else if (g.type === 'Polygon') g.coordinates.forEach(ring);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach(ring));
  return P;
}
function _kgeCountVerts() { return _kgeParts().reduce((s, p) => s + p.arr.length, 0); }
// Геометрия с замкнутыми кольцами (для показа и сохранения)
function _kgeClosed() {
  const g = JSON.parse(JSON.stringify(_kge.geom));
  const close = r => { if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([...r[0]]); };
  if (g.type === 'Polygon') g.coordinates.forEach(close);
  if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(close));
  return g;
}
function _kgePush() { _kge.undo.push(JSON.stringify(_kge.geom)); if (_kge.undo.length > 60) _kge.undo.shift(); }
function _kgeUndo() {
  if (!_kge || !_kge.undo.length) { toast('Нечего отменять', 'warn'); return; }
  _kge.geom = JSON.parse(_kge.undo.pop()); _kgeRender();
}

function _kgeIcon(kind) {
  const s = kind === 'mid' ? 10 : 14;
  const html = kind === 'mid'
    ? '<div style="width:10px;height:10px;background:rgba(255,255,255,.85);border:2px solid #e11d48;transform:rotate(45deg);cursor:copy;box-sizing:border-box"></div>'
    : '<div style="width:14px;height:14px;background:#fff;border:2.5px solid #e11d48;border-radius:50%;cursor:move;box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box"></div>';
  return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html });
}
function _kgeSnap(ll) {
  if (typeof _snapToKml !== 'function') return ll;
  const s = _snapToKml(ll, 12);
  return s && s.snapped ? L.latLng(s.lat, s.lng) : ll;
}
function _kgeRender() {
  _kge.markers.forEach(m => { try { map.removeLayer(m); } catch (e) {} }); _kge.markers = [];
  if (_kge.preview) { try { map.removeLayer(_kge.preview); } catch (e) {} }
  const g = _kgeClosed();
  _kge.preview = L.geoJSON({ type: 'Feature', geometry: g }, {
    style: { color: '#e11d48', weight: 2.5, dashArray: '6 4', fillColor: '#e11d48', fillOpacity: 0.12, interactive: false },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 0, opacity: 0 }),
  }).addTo(map);
  const parts = _kgeParts();
  parts.forEach(part => {
    const A = part.arr;
    A.forEach((c, i) => {
      const mk = L.marker([c[1], c[0]], { draggable: true, icon: _kgeIcon('v'), zIndexOffset: 1000 }).addTo(map);
      mk.on('dragstart', () => _kgePush());
      mk.on('drag', () => { const ll = mk.getLatLng(); c[0] = ll.lng; c[1] = ll.lat; _kgeLive(); });
      mk.on('dragend', () => { const ll = _kgeSnap(mk.getLatLng()); c[0] = ll.lng; c[1] = ll.lat; _kgeRender(); });
      mk.on('dblclick', ev => {
        L.DomEvent.stop(ev);
        if (A.length <= part.min) { toast(part.closed ? 'В контуре минимум 3 вершины' : 'В линии минимум 2 точки', 'warn'); return; }
        _kgePush(); A.splice(i, 1); _kgeRender();
      });
      mk.on('contextmenu', ev => { L.DomEvent.stop(ev); _kgeMenu(ev, { part, i }); });
      _kge.markers.push(mk);
    });
    // «Ромбики» на серединах сторон: потянуть или щёлкнуть — новая вершина
    if (part.point) return;
    const segs = part.closed ? A.length : A.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = A[i], b = A[(i + 1) % A.length];
      const mid = L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], { draggable: true, icon: _kgeIcon('mid'), zIndexOffset: 900 }).addTo(map);
      let nc = null;
      mid.on('dragstart', () => { _kgePush(); const ll = mid.getLatLng(); nc = [ll.lng, ll.lat]; A.splice(i + 1, 0, nc); });
      mid.on('drag', () => { const ll = mid.getLatLng(); nc[0] = ll.lng; nc[1] = ll.lat; _kgeLive(); });
      mid.on('dragend', () => { const ll = _kgeSnap(mid.getLatLng()); nc[0] = ll.lng; nc[1] = ll.lat; _kgeRender(); });
      mid.on('click', ev => { L.DomEvent.stop(ev); _kgePush(); const ll = mid.getLatLng(); A.splice(i + 1, 0, [ll.lng, ll.lat]); _kgeRender(); });
      _kge.markers.push(mid);
    }
  });
  _kgeBanner();
}
// Быстрое обновление контура во время перетаскивания (без пересоздания маркеров)
function _kgeLive() {
  if (_kge.preview) { try { map.removeLayer(_kge.preview); } catch (e) {} }
  _kge.preview = L.geoJSON({ type: 'Feature', geometry: _kgeClosed() }, {
    style: { color: '#e11d48', weight: 2.5, dashArray: '6 4', fillColor: '#e11d48', fillOpacity: 0.12, interactive: false },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 0, opacity: 0 }),
  }).addTo(map);
  _kgeBanner();
}
function _kgeMeasureText() {
  const g = _kgeClosed(), ll = c => L.latLng(c[1], c[0]);
  try {
    if (/LineString/.test(g.type)) {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      return 'длина ' + _fmtDist(lines.reduce((s, c) => s + _geoLength(c.map(ll)), 0));
    }
    if (/Polygon/.test(g.type)) {
      let a = 0, p = 0;
      (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(poly => poly.forEach((r, ri) => {
        const pts = r.map(ll); pts.pop(); p += _geoLength([...pts, pts[0]]); const s = _geoArea(pts); a += ri ? -s : s;
      }));
      return `периметр ${_fmtDist(p)} · площадь ${_fmtArea(a)}`;
    }
  } catch (e) {}
  return '';
}
function _kgeBanner() {
  const bnr = document.getElementById('bnr'); if (!bnr) return;
  bnr.className = 'show draw'; bnr.style.display = 'flex';
  const t = document.getElementById('bnr-t');
  t.innerHTML = `✏️ Тяните вершины · ◆ — добавить · двойной клик — удалить · <b>${esc(_kgeMeasureText())}</b>
    <button class="btn bsm" style="margin-left:8px;background:#16a34a;color:#fff;border:none" onclick="_kgeStop(true)">💾 Сохранить (Enter)</button>
    <button class="btn bsm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)" onclick="_kgeUndo()" title="Ctrl+Z">↩</button>
    <button class="btn bsm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)" onclick="_kgeStop(false)">Отмена (Esc)</button>`;
  const x = bnr.querySelector(':scope > button'); if (x) x.style.display = 'none';
}
function _kgeKey(e) {
  if (!_kgeActive) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); _kgeStop(false); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); _kgeStop(true); }
  else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.stopImmediatePropagation(); _kgeUndo(); }
}
// ПКМ по карте во время редактирования
function _kgeRClick(e) {
  if (e.originalEvent) e.originalEvent.preventDefault();
  _kgeMenu(e, null);
}
function _kgeMenu(ev, at) {
  const oe = ev.originalEvent || ev, x = oe.clientX, y = oe.clientY, latlng = ev.latlng;
  const items = [
    { i: '💾', l: 'Сохранить и выйти', f: () => _kgeStop(true) },
    { i: '↩', l: 'Шаг назад (Ctrl+Z)', f: _kgeUndo },
  ];
  if (at && at.part.arr.length > at.part.min) items.push({ i: '❌', l: 'Удалить эту вершину', f: () => { _kgePush(); at.part.arr.splice(at.i, 1); _kgeRender(); } });
  if (at && !at.part.closed && !at.part.point && (at.i === 0 || at.i === at.part.arr.length - 1))
    items.push({ i: '➕', l: 'Продолжить линию от этой точки', f: () => _kgeExtend(at.part, at.i === 0) });
  if (!at && latlng) {
    items.push({ i: '➕', l: 'Добавить вершину здесь', f: () => _kgeInsertNear(latlng) });
    const parts = _kgeParts().filter(p => !p.point);
    if (parts.length) items.push({ i: '❌', l: 'Удалить ближайшую вершину', f: () => _kgeDeleteNear(latlng) });
  }
  items.push({ i: '📐', l: 'Длина / площадь', f: () => measureGeometry(_kgeClosed(), 'Редактируемый объект') });
  items.push({ sep: true }, { i: '✕', l: 'Выйти без сохранения', cls: 'cxi-red', f: () => _kgeStop(false) });
  showCtx(x, y, items);
}
function _kgeInsertNear(latlng) {
  const T = map.latLngToContainerPoint(latlng);
  let best = null, bd = Infinity;
  _kgeParts().filter(p => !p.point).forEach(p => {
    const A = p.arr, segs = p.closed ? A.length : A.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = map.latLngToContainerPoint([A[i][1], A[i][0]]), b = map.latLngToContainerPoint([A[(i + 1) % A.length][1], A[(i + 1) % A.length][0]]);
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((T.x - a.x) * dx + (T.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + t * dx - T.x, a.y + t * dy - T.y);
      if (d < bd) { bd = d; best = { p, i }; }
    }
  });
  if (!best) return;
  _kgePush(); best.p.arr.splice(best.i + 1, 0, [latlng.lng, latlng.lat]); _kgeRender();
}
function _kgeDeleteNear(latlng) {
  const T = map.latLngToContainerPoint(latlng);
  let best = null, bd = Infinity;
  _kgeParts().filter(p => !p.point).forEach(p => p.arr.forEach((c, i) => {
    const q = map.latLngToContainerPoint([c[1], c[0]]), d = Math.hypot(q.x - T.x, q.y - T.y);
    if (d < bd) { bd = d; best = { p, i }; }
  }));
  if (!best) return;
  if (best.p.arr.length <= best.p.min) { toast('Слишком мало вершин', 'warn'); return; }
  _kgePush(); best.p.arr.splice(best.i, 1); _kgeRender();
}
// Продолжить линию: клики по карте добавляют точки в начало/конец, ПКМ/Enter — закончить
function _kgeExtend(part, atStart) {
  toast('Кликайте новые точки линии · ПКМ — закончить', 'ok');
  const add = e => { _kgePush(); const ll = _kgeSnap(e.latlng); atStart ? part.arr.unshift([ll.lng, ll.lat]) : part.arr.push([ll.lng, ll.lat]); _kgeRender(); };
  map.on('click', add);
  _kge.extendOff = () => { map.off('click', add); _kge.extendOff = null; };
  const stop = () => { if (_kge && _kge.extendOff) _kge.extendOff(); map.off('contextmenu', stop); };
  setTimeout(() => map.once('contextmenu', stop), 50);
}
async function _kgeStop(save) {
  if (!_kgeActive || !_kge) return;
  const k = _kge;
  if (k.extendOff) k.extendOff();
  if (save && JSON.stringify(_kgeClosed()) !== JSON.stringify(JSON.parse(k.orig))) {
    const l = layers.find(x => x.id === k.layerId);
    try {
      const gj = JSON.parse(l.geojson);
      const feats = gj.type === 'FeatureCollection' ? gj.features : [gj];
      const before = JSON.stringify(feats[k.fIdx].geometry);
      feats[k.fIdx].geometry = _kgeClosed();
      const save1 = async str => {
        await fetch(`${API}/layers/${k.layerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: l.name, color: l.color, visible: l.visible ? 1 : 0, symbol: l.symbol || '', group_id: l.group_id || '',
            line_dash: l.line_dash || 'solid', min_zoom: l.min_zoom, max_zoom: l.max_zoom, size: l.size, show_labels: !!l.show_labels, geojson: str }) });
        l.geojson = str;
        if (typeof renderLayerGroups === 'function') renderLayerGroups();
      };
      await save1(JSON.stringify(gj));
      // ↩ Отменить — вернуть прежнюю геометрию объекта
      TK.undoBar('Геометрия сохранена', async () => {
        const g2 = JSON.parse(l.geojson); const f2 = g2.type === 'FeatureCollection' ? g2.features : [g2];
        if (f2[k.fIdx]) f2[k.fIdx].geometry = JSON.parse(before);
        await save1(JSON.stringify(g2));
      });
    } catch (e) { toast('Не удалось сохранить: ' + e.message, 'err'); }
  }
  k.markers.forEach(m => { try { map.removeLayer(m); } catch (e) {} });
  if (k.preview) { try { map.removeLayer(k.preview); } catch (e) {} }
  k.hidden.forEach(([sub, st]) => { try { st ? sub.setStyle(st) : sub.setOpacity(1); } catch (e) {} });
  _kgeActive = false; _kge = null;
  document.removeEventListener('keydown', _kgeKey, true);
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = ''; bnr.style.display = 'none'; const x = bnr.querySelector(':scope > button'); if (x) x.style.display = ''; }
  if (!save) toast('Изменения не сохранены', 'ok');
}
