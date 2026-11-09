// ═══════════════════════════════════════════════════════════
// map-assist.js — мелкие удобства карты:
//   • подсветка при наведении: строка слоя / объекта в панели «Слои», строка таблицы
//     атрибутов → объект мигает на карте (kmlHoverLayer / kmlHoverFeature / kmlHoverOff);
//   • щелчок по линии или полигону (без включённого инструмента) — длина,
//     площадь и периметр во всплывающем окне (kmlMeasurePopup);
//   • Ctrl+V на карте — координаты из буфера: «61.0045 73.0102», «61°00′16″ 73°00′37″»
//     → перелёт и метка; большие числа (X Y в МСК и т. п.) → «Метка по координатам».
// ═══════════════════════════════════════════════════════════
const MA = { hl: null, t: 0, key: '' };

// ── подсветка при наведении ──
function _maHlDraw(gj, key) {
  if (MA.key === key && MA.hl) return;
  kmlHoverOff(true); MA.key = key;
  try {
    if (!map.getPane('hoverPane')) { map.createPane('hoverPane'); map.getPane('hoverPane').style.zIndex = 620; map.getPane('hoverPane').style.pointerEvents = 'none'; }
    MA.hl = L.geoJSON(gj, { pane: 'hoverPane', interactive: false,
      style: { color: '#f97316', weight: 5, opacity: 0.95, fillColor: '#fb923c', fillOpacity: 0.25, className: 'ma-blink' },
      pointToLayer: (_, ll) => L.circleMarker(ll, { pane: 'hoverPane', radius: 13, color: '#f97316', weight: 4, fillColor: '#fdba74', fillOpacity: 0.35, interactive: false, className: 'ma-blink' }) }).addTo(map);
  } catch (e) { MA.hl = null; }
}
function _maFeats(lid) {
  const l = (layers || []).find(x => x.id === lid); if (!l) return null;
  try { const gj = JSON.parse(l.geojson); return gj.type === 'FeatureCollection' ? gj.features || [] : [gj]; } catch (e) { return null; }
}
function kmlHoverLayer(lid) {
  clearTimeout(MA.t);
  MA.t = setTimeout(() => {
    const fs = _maFeats(lid); if (!fs || !fs.length) return;
    // большой слой — только рамка, чтобы не тормозить
    if (fs.length > 1500) {
      const g = lGroups[lid]; let b = null; try { b = g && g.getBounds(); } catch (e) {}
      if (!b || !b.isValid()) return;
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      _maHlDraw({ type: 'Polygon', coordinates: [[[sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat]]] }, 'L' + lid);
    } else _maHlDraw({ type: 'FeatureCollection', features: fs.filter(f => f && f.geometry && !(f.properties && f.properties._hidden)) }, 'L' + lid);
  }, 120);
}
function kmlHoverFeature(lid, idx) {
  clearTimeout(MA.t);
  MA.t = setTimeout(() => { const fs = _maFeats(lid), f = fs && fs[idx]; if (f && f.geometry) _maHlDraw(f, 'F' + lid + ':' + idx); }, 60);
}
function kmlHoverOff(now) {
  clearTimeout(MA.t);
  if (MA.hl) { try { map.removeLayer(MA.hl); } catch (e) {} MA.hl = null; }
  MA.key = '';
}

// ── длина / площадь по щелчку ──
function _maToolActive() {
  const c = map.getContainer().style.cursor;
  if (c && c !== 'grab' && c !== '') return true;
  return (typeof VPP !== 'undefined' && VPP.on) || (typeof VSEG !== 'undefined' && VSEG.on) || (typeof VMK !== 'undefined' && VMK.on)
    || (typeof _ksActive !== 'undefined' && _ksActive) || (typeof _kdActive !== 'undefined' && _kdActive) || (typeof _epActive !== 'undefined' && _epActive)
    || (typeof _kmvActive !== 'undefined' && _kmvActive) || (typeof MN !== 'undefined' && MN.mode) || (typeof _kmlPlacingLayerId !== 'undefined' && _kmlPlacingLayerId);
}
const _maLen = m => m >= 1000 ? `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} км` : `${m.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м`;
const _maArea = a => a >= 1e4 ? `${(a / 1e4).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} га (${Math.round(a).toLocaleString('ru-RU')} м²)` : `${a.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`;
function kmlMeasurePopup(latlng, f, l) {
  const g = f && f.geometry; if (!g || !/LineString|Polygon/.test(g.type) || _maToolActive()) return;
  const ll = c => L.latLng(c[1], c[0]);
  const ring = r => { const p = r.map(ll); if (p.length > 1 && p[0].equals(p[p.length - 1])) p.pop(); return p; };
  let len = 0, area = null;
  try {
    if (g.type === 'LineString') len = _geoLength(g.coordinates.map(ll));
    else if (g.type === 'MultiLineString') g.coordinates.forEach(c => { len += _geoLength(c.map(ll)); });
    else {
      area = 0;
      (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(poly => poly.forEach((r, ri) => {
        const p = ring(r); len += _geoLength([...p, p[0]]); const a = _geoArea(p); area += ri ? -a : a;
      }));
    }
  } catch (e) { return; }
  const p = f.properties || {}, nm = p.name || p.Name || p['название'] || '';
  const txt = area != null ? `Площадь ${_maArea(area)}; периметр ${_maLen(len)}` : `Длина ${_maLen(len)}`;
  const html = `<div class="ma-pop"><b>${esc(nm || 'Объект')}</b> <span style="color:var(--tx3)">${esc(l ? l.name : '')}</span>
    ${area != null ? `<div>⬡ Площадь: <b>${_maArea(area)}</b></div><div>Периметр: <b>${_maLen(len)}</b></div>` : `<div>〰 Длина: <b>${_maLen(len)}</b></div>`}
    <a href="#" onclick="event.preventDefault();navigator.clipboard.writeText(${escAttr(JSON.stringify(txt))}).then(()=>toast('Скопировано','ok'))">📋 Копировать</a></div>`;
  L.popup({ maxWidth: 320, autoPanPadding: [40, 40] }).setLatLng(latlng).setContent(html).openOn(map);
}

// ── Ctrl+V: координаты из буфера ──
// «61.0045 73.0102», «61,0045; 73,0102», «N61°00'16.2" E73°00'36.7"», «61 00 16.2 73 00 36.7»
function maParseCoords(t) {
  t = String(t || '').trim().replace(/[′’']/g, "'").replace(/[″”"]/g, '"').replace(/\s+/g, ' ');
  if (!t || t.length > 200) return null;
  // градусы-минуты-секунды
  const dms = [...t.matchAll(/([NSСЮEWВЗ])?\s*(-?\d{1,3})(?:[°º:\s]\s*(\d{1,2}(?:[.,]\d+)?)['\s:]?\s*(?:(\d{1,2}(?:[.,]\d+)?)"?)?)\s*([NSСЮEWВЗ])?/gi)]
    .filter(m => m[3] != null);
  if (dms.length === 2) {
    const v = dms.map(m => { const h = (m[1] || m[5] || '').toUpperCase(); let x = Math.abs(+m[2]) + (+String(m[3]).replace(',', '.')) / 60 + (m[4] ? +String(m[4]).replace(',', '.') / 3600 : 0); if (+m[2] < 0 || /[SЮWЗ]/.test(h)) x = -x; return { x, h }; });
    let [a, b] = v;
    if (/[EWВЗ]/.test(a.h) || /[NSСЮ]/.test(b.h)) [a, b] = [b, a];
    if (Math.abs(a.x) <= 90 && Math.abs(b.x) <= 180) return { lat: a.x, lng: b.x };
  }
  // «61.0045 73.0102», «61,0045; 73,0102», «7290000.5 5512345.6» (дробная часть — точка или запятая)
  let n2 = null;
  const m = t.match(/(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)/);
  if (m) n2 = [+m[1].replace(',', '.'), +m[2].replace(',', '.')];
  else {
    const nums = (t.replace(/(\d)\s(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length !== 2) return null; n2 = nums;
  }
  const [a, b] = n2;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return Math.abs(a) > 82 && Math.abs(b) <= 90 ? { lat: b, lng: a } : { lat: a, lng: b };
  if (Math.abs(a) > 1000 && Math.abs(b) > 1000) return { x: a, y: b };   // плоские: X (север) Y (восток)
  return null;
}
let _maPasteMk = null;
async function maPasteCoords(text) {
  const c = maParseCoords(text); if (!c) return false;
  if (c.lat != null) {
    if (typeof switchView === 'function' && !document.querySelector('.nt.on[data-v="map"]')) switchView('map');
    map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    if (_maPasteMk) try { map.removeLayer(_maPasteMk); } catch (e) {}
    const s = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
    _maPasteMk = L.marker([c.lat, c.lng]).addTo(map).bindPopup(`<div class="ma-pop"><b>📋 Из буфера</b><div>${s}</div>
      <a href="#" onclick="event.preventDefault();map.closePopup();openCoordMarkerModal(L.latLng(${c.lat},${c.lng}))">📍 Поставить метку в слой…</a><br>
      <a href="#" onclick="event.preventDefault();cvOpenPoint(${c.lat},${c.lng})">🧭 Во всех системах координат</a><br>
      <a href="#" onclick="event.preventDefault();try{map.removeLayer(_maPasteMk)}catch(e){}">✕ Убрать</a></div>`).openPopup();
    toast(`Перелёт: ${s}`, 'ok');
    return true;
  }
  // X Y — система не известна: «Метка по координатам» с последней выбранной системой
  await openCoordMarkerModal();
  const n = document.getElementById('cm-north'), e = document.getElementById('cm-east');
  if (n && e) { n.value = c.x; e.value = c.y; try { cmUpdatePreview(); } catch (_) {} }
  const pf = document.getElementById('cm-proj-fields');
  toast(pf && pf.style.display !== 'none' ? 'Проверьте систему координат и нажмите «Добавить»' : 'Это плоские координаты — выберите систему (МСК, СК-42…), значения уже вставлены', 'ok');
  return true;
}
document.addEventListener('paste', e => {
  const tg = e.target;
  if (tg && (/INPUT|TEXTAREA|SELECT/.test(tg.tagName) || tg.isContentEditable)) return;
  if (document.getElementById('mov')?.classList.contains('open')) return;
  if (document.getElementById('kat-panel')?.contains(document.activeElement)) return;   // таблица атрибутов — своя вставка
  const mapView = document.querySelector('.nt.on')?.dataset.v === 'map' || document.getElementById('map')?.contains(document.activeElement);
  if (!mapView) return;
  const t = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (maParseCoords(t)) { e.preventDefault(); maPasteCoords(t); }
});
