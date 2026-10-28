// ═══════════════════════════════════════════════════════════
// kml-cluster.js — группировка точек слоя при отдалении: если в слое много точек
// (от 200), при мелком масштабе близкие точки собираются в кружок с числом;
// щелчок по кружку — приблизить. С масштаба 16 — все точки как есть.
// Точки остаются в слое (поиск, меню, таблица атрибутов работают), убираются
// только с карты; вне видимой области не рисуются вовсе — карта не тормозит.
// ═══════════════════════════════════════════════════════════
const KCL = {};                  // id слоя → { g, markers, grp, upd }
const KCL_MIN = 200, KCL_CELL = 64, KCL_FULL_ZOOM = 16;
function kmlCluster(id, g, color) {
  kmlClusterOff(id);
  if (typeof uiSet === 'function' && !uiSet('cluster')) return;   // выключено в ⚙ настройках
  const markers = g.getLayers().filter(x => typeof x.getLatLng === 'function');
  if (markers.length < KCL_MIN) return;
  const st = { g, markers, color: color || '#1a56db', grp: L.layerGroup() };
  let t = null;
  st.upd = () => { clearTimeout(t); t = setTimeout(() => _kclUpdate(st), 30); };
  st.onAdd = () => { st.grp.addTo(map); st.upd(); };
  st.onRemove = () => { st.grp.clearLayers(); try { map.removeLayer(st.grp); } catch (e) {} };
  g.on('add', st.onAdd); g.on('remove', st.onRemove);
  map.on('zoomend moveend', st.upd);
  KCL[id] = st;
  if (map.hasLayer(g)) st.onAdd();
}
function kmlClusterOff(id) {
  const st = KCL[id]; if (!st) return;
  map.off('zoomend moveend', st.upd);
  st.g.off('add', st.onAdd); st.g.off('remove', st.onRemove);
  st.onRemove();
  if (map.hasLayer(st.g)) st.markers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });   // вернуть спрятанные точки
  delete KCL[id];
}
function _kclUpdate(st) {
  if (!map.hasLayer(st.g)) { st.grp.clearLayers(); return; }
  const z = map.getZoom(), b = map.getBounds().pad(0.25);
  st.grp.clearLayers();
  const show = m => { if (!map.hasLayer(m)) map.addLayer(m); };
  const hide = m => { if (map.hasLayer(m)) map.removeLayer(m); };
  const cells = new Map();
  for (const m of st.markers) {
    const ll = m.getLatLng();
    if (!b.contains(ll)) { hide(m); continue; }
    if (z >= KCL_FULL_ZOOM) { show(m); continue; }
    const p = map.latLngToContainerPoint(ll), k = Math.floor(p.x / KCL_CELL) + ':' + Math.floor(p.y / KCL_CELL);
    (cells.get(k) || cells.set(k, []).get(k)).push(m);
  }
  if (z >= KCL_FULL_ZOOM) return;
  for (const list of cells.values()) {
    if (list.length === 1) { show(list[0]); continue; }
    list.forEach(hide);
    let la = 0, ln = 0; list.forEach(m => { const q = m.getLatLng(); la += q.lat; ln += q.lng; });
    const n = list.length, s = n < 10 ? 28 : n < 100 ? 34 : n < 1000 ? 40 : 46;
    const c = L.marker([la / n, ln / n], { icon: L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div class="kcl" style="width:${s}px;height:${s}px;background:${st.color}">${n}</div>` }), keyboard: false, zIndexOffset: 500 });
    c.on('click', e => { L.DomEvent.stopPropagation(e); map.fitBounds(L.latLngBounds(list.map(m => m.getLatLng())).pad(0.2), { maxZoom: KCL_FULL_ZOOM }); });
    c.bindTooltip(`${n} точек — щёлкните, чтобы приблизить`, { direction: 'top' });
    st.grp.addLayer(c);
  }
}
