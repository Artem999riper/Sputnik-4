// ═══════════════════════════════════════════════════════════
// kml-select.js — выделение объектов слоёв мышью:
//   • Shift + протянуть ЛКМ — рамка: попавшие объекты добавляются в выделение,
//     а если все они уже выделены — выделение с них снимается;
//   • Shift + щелчок по объекту — выделить / снять;
//   • выделенное подсвечивается; панель внизу «Выделено: N · Действия · ✕»;
//   • ПКМ по карте при выделении — те же действия (меню _ksMenu из kml-manager.js);
//   • Esc — снять выделение.
// ═══════════════════════════════════════════════════════════
const KSEL = { m: new Map(), hl: null, box: null, t: 0 };   // m: gid слоя → Set(индекс объекта)
const kselCount = () => [...KSEL.m.values()].reduce((s, x) => s + x.size, 0);
const kselHas = (gid, i) => !!(KSEL.m.get(gid) && KSEL.m.get(gid).has(i));
function _kselRec(gid) {
  const isSite = String(gid).startsWith('s_'), lid = isSite ? String(gid).slice(2) : gid;
  return { isSite, rec: isSite ? (typeof siteLayerCache !== 'undefined' ? siteLayerCache[lid] : null) : (layers || []).find(x => x.id === lid) };
}
function _kselGj(rec) {
  let gj; try { gj = JSON.parse(rec.geojson); } catch (e) { return null; }
  if (!gj.features) gj = gj.type === 'Feature' ? { type: 'FeatureCollection', features: [gj] } : { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: gj, properties: {} }] };
  return gj;
}
// выделение → формат _ksSel (entries с актуальным geojson), для меню действий
function kselToKs() {
  const entries = []; let total = 0, lines = 0, polys = 0;
  for (const [gid, set] of KSEL.m) {
    const { isSite, rec } = _kselRec(gid); if (!rec || !rec.geojson || !set.size) continue;
    const gj = _kselGj(rec); if (!gj) continue;
    const idxs = [...set].filter(i => gj.features[i]).sort((a, b) => a - b); if (!idxs.length) continue;
    idxs.forEach(i => { const t = gj.features[i].geometry && gj.features[i].geometry.type; if (t === 'LineString') lines++; else if (t === 'Polygon') polys++; });
    entries.push({ gid, isSite, rec, gj, idxs }); total += idxs.length;
  }
  return { entries, total, lines, polys };
}
// подсветка выделенного
function kselRender() {
  if (KSEL.hl) { try { map.removeLayer(KSEL.hl); } catch (e) {} KSEL.hl = null; }
  const ks = kselToKs();
  if (ks.total) {
    if (!map.getPane('kselPane')) { map.createPane('kselPane'); map.getPane('kselPane').style.zIndex = 590; map.getPane('kselPane').style.pointerEvents = 'none'; }
    const feats = []; ks.entries.forEach(en => en.idxs.forEach(i => { const f = en.gj.features[i]; if (f && f.geometry) feats.push(f); }));
    KSEL.hl = L.geoJSON({ type: 'FeatureCollection', features: feats }, { pane: 'kselPane', interactive: false,
      style: { color: '#f59e0b', weight: 6, opacity: 0.85, fillColor: '#fbbf24', fillOpacity: 0.22 },
      pointToLayer: (_, ll) => L.circleMarker(ll, { pane: 'kselPane', radius: 15, color: '#f59e0b', weight: 4, fillColor: '#fde68a', fillOpacity: 0.35, interactive: false }) }).addTo(map);
  }
  _kselBar(ks.total);
}
function _kselBar(n) {
  let b = document.getElementById('ksel-bar');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'ksel-bar'; document.body.appendChild(b); }
  b.innerHTML = `<span>⬚ Выделено: <b>${n}</b></span>
    <button onclick="kselMenu(event)">⚙️ Действия ▾</button>
    <button onclick="kselClear()" title="Снять выделение (Esc)">✕</button>
    <small>Shift + рамка / щелчок — добавить или снять</small>`;
}
function kselToggle(gid, i, on) {
  const s = KSEL.m.get(gid) || new Set();
  const want = on == null ? !s.has(i) : on;
  if (want) s.add(i); else s.delete(i);
  if (s.size) KSEL.m.set(gid, s); else KSEL.m.delete(gid);
}
function kselClear() { KSEL.m.clear(); kselRender(); }
// меню действий над выделенным
function kselMenu(ev, cx, cy) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const ks = kselToKs(); if (!ks.total) return;
  _ksSel = ks;
  if (cx == null) { const r = ev.currentTarget.getBoundingClientRect(); cx = r.left; cy = r.top - 8; }
  _ksMenu(cx, cy);
  // меню над панелью — поднять, если не помещается снизу
  setTimeout(() => { const c = document.getElementById('ctx'); if (c && c.getBoundingClientRect().bottom > innerHeight - 4) c.style.top = Math.max(4, cy - c.offsetHeight) + 'px'; }, 0);
}
// рамка: собрать объекты и добавить (или снять, если все уже выделены)
function _kselApplyBox(bounds) {
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const poly = [[sw.lat, sw.lng], [ne.lat, sw.lng], [ne.lat, ne.lng], [sw.lat, ne.lng]];
  const hit = _ksCollect(poly);
  if (!hit.total) { toast('В рамке нет объектов', 'warn'); return; }
  const all = hit.entries.every(en => en.idxs.every(i => kselHas(en.gid, i)));
  hit.entries.forEach(en => en.idxs.forEach(i => kselToggle(en.gid, i, !all)));
  kselRender();
  toast(all ? `Снято выделение: ${hit.total}` : `Выделено: +${hit.total} (всего ${kselCount()})`, 'ok');
}
(function () {
  const go = () => {
    if (!window.map) return setTimeout(go, 400);
    try { map.boxZoom.disable(); } catch (e) {}     // Shift+рамка — наше выделение, а не приближение
    const el = map.getContainer();
    el.addEventListener('mousedown', e => {
      if (!e.shiftKey || e.button !== 0) return;
      if (e.target.closest('.leaflet-control, #vmk-bar, #ksel-bar')) return;
      const start = { x: e.clientX, y: e.clientY }; let moved = false;
      map.dragging.disable();
      const r0 = el.getBoundingClientRect();
      const mv = ev => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        moved = true;
        if (!KSEL.box) { KSEL.box = document.createElement('div'); KSEL.box.className = 'ksel-box'; el.appendChild(KSEL.box); }
        const x1 = Math.min(start.x, ev.clientX) - r0.left, y1 = Math.min(start.y, ev.clientY) - r0.top;
        Object.assign(KSEL.box.style, { left: x1 + 'px', top: y1 + 'px', width: Math.abs(ev.clientX - start.x) + 'px', height: Math.abs(ev.clientY - start.y) + 'px' });
      };
      const up = ev => {
        document.removeEventListener('mousemove', mv, true); document.removeEventListener('mouseup', up, true);
        map.dragging.enable();
        if (KSEL.box) { KSEL.box.remove(); KSEL.box = null; }
        if (!moved) return;                      // это щелчок — обработает объект (Shift+щелчок)
        KSEL.t = Date.now();                     // погасить «хвостовой» click
        const a = map.containerPointToLatLng([start.x - r0.left, start.y - r0.top]), b = map.containerPointToLatLng([ev.clientX - r0.left, ev.clientY - r0.top]);
        _kselApplyBox(L.latLngBounds(a, b));
      };
      document.addEventListener('mousemove', mv, true); document.addEventListener('mouseup', up, true);
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !kselCount()) return;
      if (document.getElementById('mov')?.classList.contains('open') || document.querySelector('#ctx.show')) return;
      if (typeof VMK !== 'undefined' && VMK.on) return;
      kselClear();
    });
    // слои перерисовались (правка, отметка, удаление) — убрать исчезнувшие индексы и обновить подсветку
    const orig = window.renderLayerGroups;
    if (typeof orig === 'function') window.renderLayerGroups = renderLayerGroups = function () { const r = orig.apply(this, arguments); if (kselCount()) setTimeout(kselRender, 0); return r; };
  };
  setTimeout(go, 700);
})();
// Shift+щелчок по объекту (вызывается из kml-manager)
function kselClickFeature(gid, idx) {
  if (Date.now() - KSEL.t < 400) return;
  kselToggle(gid, idx); kselRender();
}
