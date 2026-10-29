// ═══════════════════════════════════════════════════════════
// kml-deco.js — оформление линий слоя (включается в «Стиль слоя»):
//   • стрелки направления вдоль линии (профили, трассы, водотоки);
//   • подпись линии по её изгибу (река, трасса).
// Слои KML рисуются на холсте, поэтому поверх каждой линии кладём
// невидимую SVG-линию и пишем по ней <textPath> — текст следует изгибу.
// ═══════════════════════════════════════════════════════════
const KDECO = {};          // id слоя → { grp, g, onAdd, onRemove, upd }
let _kdecoRenderer = null;
function _kdecoR() {
  if (!map.getPane('kmlDecoPane')) { map.createPane('kmlDecoPane'); map.getPane('kmlDecoPane').style.zIndex = 460; map.getPane('kmlDecoPane').style.pointerEvents = 'none'; }
  return _kdecoRenderer || (_kdecoRenderer = L.svg({ pane: 'kmlDecoPane', padding: 0.5 }));
}
function kmlDecoOff(id) {
  const d = KDECO[id]; if (!d) return;
  d.g.off('add', d.onAdd); d.g.off('remove', d.onRemove); map.off('zoomend', d.upd);
  _kdecoClear(d);
  try { map.removeLayer(d.grp); } catch (e) {}
  delete KDECO[id];
}
function kmlDecorate(l, g) {
  kmlDecoOff(l.id);
  const st = (typeof kmlStyleOf === 'function' && kmlStyleOf(l)) || {};
  if (!st.arrows && !st.lineLabels) return;
  const lines = [];
  (typeof _kaFeatures === 'function' ? _kaFeatures(l) : []).forEach(f => {
    if (!f || !f.geometry || (f.properties || {})._hidden) return;
    const gm = f.geometry, nm = typeof kmlLabelText === 'function' ? kmlLabelText(l, f.properties) : ((f.properties || {}).name || '');
    const parts = gm.type === 'LineString' ? [gm.coordinates] : gm.type === 'MultiLineString' ? gm.coordinates : [];
    parts.forEach(c => { if (c && c.length >= 2) lines.push({ ll: c.map(p => [p[1], p[0]]), name: String(nm || ''), color: (typeof _kmlFeatColor === 'function' && _kmlFeatColor(l, f.properties)) || l.color || '#1a56db' }); });
  });
  if (!lines.length) return;
  const grp = L.layerGroup();
  const items = lines.map(x => {
    const pl = L.polyline(x.ll, { renderer: _kdecoR(), opacity: 0, weight: 1, interactive: false, noClip: true });
    // для подписи — путь слева направо, чтобы текст не был вверх ногами
    const rev = st.lineLabels && x.ll[0][1] > x.ll[x.ll.length - 1][1];
    const plL = st.lineLabels ? (rev ? L.polyline(x.ll.slice().reverse(), { renderer: _kdecoR(), opacity: 0, weight: 1, interactive: false, noClip: true }) : pl) : null;
    grp.addLayer(pl); if (plL && plL !== pl) grp.addLayer(plL);
    return { x, pl, plL };
  });
  const size = (st.labelSize || 12);
  const upd = () => {
    if (!map.hasLayer(grp)) return;
    items.forEach(it => {
      if (st.arrows) _kdecoText(it.pl, 'a', () => {
        const len = it.pl._path.getTotalLength ? it.pl._path.getTotalLength() : 0;
        const gap = Math.max(40, +st.arrowGap || 90), n = Math.max(1, Math.floor(len / gap));
        return { text: Array(n).fill('➤').join(' '.repeat(Math.max(1, Math.round(gap / 16)))), color: it.x.color, size: 13, offset: '50%', anchor: 'middle', dy: 4.5 };
      });
      if (st.lineLabels && it.x.name) _kdecoText(it.plL, 'n', () => ({ text: it.x.name, color: it.x.color, size, offset: _kdecoMid(it.plL), anchor: 'middle', dy: -5, halo: true, bold: true }));
    });
  };
  const onAdd = () => { grp.addTo(map); setTimeout(upd, 0); };
  const onRemove = () => { _kdecoClear(KDECO[l.id]); try { map.removeLayer(grp); } catch (e) {} };
  g.on('add', onAdd); g.on('remove', onRemove); map.on('zoomend', upd);
  KDECO[l.id] = { grp, g, onAdd, onRemove, upd, items };
  if (map.hasLayer(g)) onAdd();
}
// середина самого длинного участка линии (в % длины) — там подпись не ломается на изломах
function _kdecoMid(pl) {
  const pts = (pl.getLatLngs() || []).map(ll => map.latLngToLayerPoint(ll));
  if (pts.length < 3) return '50%';
  let tot = 0, best = 0, at = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); if (d > best) { best = d; at = tot + d / 2; } tot += d; }
  return tot ? (at / tot * 100).toFixed(1) + '%' : '50%';
}
// убрать надписи слоя (SVG-текст лежит рядом с путями, Leaflet его сам не удаляет)
function _kdecoClear(d) {
  if (!d || !d.items) return;
  d.items.forEach(it => [it.pl, it.plL].forEach(pl => { const id = pl && pl._path && pl._path.id; if (id) document.querySelectorAll(`text[data-k^="${id}-"]`).forEach(t => t.remove()); }));
}
// текст по пути линии (SVG textPath), k — тип (стрелки/подпись), mk() → параметры
let _kdecoSeq = 0;
function _kdecoText(pl, k, mk) {
  const path = pl && pl._path; if (!path) return;
  if (!path.id) path.id = 'kdeco' + (++_kdecoSeq);
  const svg = path.ownerSVGElement; if (!svg) return;
  const key = path.id + '-' + k;
  let t = svg.querySelector(`text[data-k="${key}"]`);
  const o = mk(); if (!o || !o.text) { if (t) t.remove(); return; }
  if (!t) {
    t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('data-k', key);
    const tp = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
    tp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + path.id); tp.setAttribute('href', '#' + path.id);
    t.appendChild(tp); path.parentNode.appendChild(t);
  }
  t.setAttribute('font-size', o.size); t.setAttribute('fill', o.color); t.setAttribute('dy', o.dy || 0);
  t.setAttribute('font-weight', o.bold ? '700' : '400'); t.setAttribute('font-family', 'sans-serif');
  t.setAttribute('class', o.halo ? 'kdeco-halo' : 'kdeco-arrow');
  const tp = t.firstChild; tp.setAttribute('startOffset', o.offset || '0'); tp.setAttribute('text-anchor', o.anchor || 'start');
  if (tp.textContent !== o.text) tp.textContent = o.text;
}
