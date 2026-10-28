// ═══════════════════════════════════════════════════════════
// map-extras.js — подсветка объекта на карте при наведении на строку
// (таблица атрибутов, «Объекты слоя», результаты поиска).
// ═══════════════════════════════════════════════════════════

// ═══ Подсветка объекта при наведении на строку ═════════════════════════
// Таблица атрибутов слоя и «Объекты слоя»: навели на строку — объект
// на карте обводится, без щелчка. Выключается в ⚙ настройках.
const HV = { layer: null, key: null };
function _hvShow(f, key) {
  if (HV.key === key) return;
  _hvClear(); if (!f || !f.geometry || !window.map) return;
  HV.key = key;
  HV.layer = L.geoJSON(f, { interactive: false, style: { color: '#06b6d4', weight: 5, opacity: 0.95, fillColor: '#06b6d4', fillOpacity: 0.18, dashArray: '' },
    pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 14, color: '#06b6d4', weight: 4, fillOpacity: 0.12, interactive: false }) }).addTo(map);
}
function _hvClear() { if (HV.layer) { try { map.removeLayer(HV.layer); } catch (e) {} } HV.layer = null; HV.key = null; }
document.addEventListener('mouseover', e => {
  if (typeof uiSet === 'function' && !uiSet('hoverHL')) return;
  const t = e.target.closest && e.target.closest('#kat-panel tr[data-i], #kfl-list .kfl-row[data-fidx], .gs-kml[data-lid]');
  if (!t) { if (HV.key) _hvClear(); return; }
  let l, i;
  if (t.matches('#kat-panel tr')) { l = typeof _katLayer === 'function' && _katLayer(); i = +t.dataset.i; }
  else if (t.matches('.kfl-row')) { l = (layers || []).find(x => x.id === window._kflLayerId); i = +t.dataset.fidx; }
  else { l = (layers || []).find(x => x.id === t.dataset.lid); i = +t.dataset.idx; }
  if (!l) return;
  const feats = typeof _kaFeatsCached === 'function' ? _kaFeatsCached(l) : _kaFeatures(l);
  _hvShow(feats[i], l.id + ':' + i);
});
(function () {
  const go = () => {
    if (typeof kmlOpenFeatureList !== 'function') return setTimeout(go, 400);
    const orig = kmlOpenFeatureList;
    window.kmlOpenFeatureList = kmlOpenFeatureList = function (id) { window._kflLayerId = id; return orig.apply(this, arguments); };
  };
  go();
})();
