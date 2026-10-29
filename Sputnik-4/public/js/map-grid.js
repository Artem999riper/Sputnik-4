// ═══════════════════════════════════════════════════════════
// map-grid.js — 1) швы между квадратами подложки: браузер при некоторых
//    масштабах оставляет щель в 1 px между тайлами (белая «сетка», которая
//    масштабируется с картой). Каждый тайл делаем на 1 px больше — щели нет.
//    2) Сетка координат с подписями (⚙ Настройки → «Сетка координат»):
//    WGS-84 (градусы/минуты) или МСК выбранного региона (метры). Шаг — по
//    масштабу, линии ~ через 120–250 px. Попадает и в «Снимок карты».
// ═══════════════════════════════════════════════════════════
(function () {
  if (typeof L === 'undefined' || !L.GridLayer) return;
  const orig = L.GridLayer.prototype._initTile;
  L.GridLayer.include({
    _initTile(tile) {
      orig.call(this, tile);
      const s = this.getTileSize();
      tile.style.width = (s.x + 2) + 'px';    // перекрытие 2 px — при масштабе браузера 90/110 % 1 px мало
      tile.style.height = (s.y + 2) + 'px';
    },
  });
})();

// Фон под подложкой — в тон снимку: если где-то и останется щель между квадратами,
// она будет тёмной и незаметной, а не белой полосой (спутник — тёмный фон, схема — светлый)
(function () {
  const go = () => {
    if (!window.map || !window._mapBaseLayers) return setTimeout(go, 500);
    const set = () => {
      const base = Object.entries(window._mapBaseLayers).find(([, l]) => map.hasLayer(l));
      const dark = base && /Спутник|Гибрид/i.test(base[0]);
      map.getContainer().style.background = dark ? '#2f3a2c' : '';
    };
    map.on('baselayerchange', set); set();
  };
  setTimeout(go, 600);
})();

const MGRID = { layer: null, kind: 'none' };
const _MG_WGS = [10, 5, 2, 1, 30 / 60, 15 / 60, 10 / 60, 5 / 60, 2 / 60, 1 / 60, 30 / 3600, 15 / 3600, 10 / 3600, 5 / 3600, 2 / 3600, 1 / 3600];
const _MG_M = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
function _mgDeg(v, lat) {
  const a = Math.abs(v), d = Math.floor(a + 1e-9), mf = (a - d) * 60, m = Math.floor(mf + 1e-6), s = Math.round((mf - m) * 60);
  const h = lat ? (v >= 0 ? 'с.ш.' : 'ю.ш.') : (v >= 0 ? 'в.д.' : 'з.д.');
  return `${d}°${m || s ? String(m).padStart(2, '0') + '′' : ''}${s ? String(s).padStart(2, '0') + '″' : ''} ${h}`;
}
// проекция МСК для текущего места (как в строке координат: регион из списка, зона — по долготе)
function _mgMskProj(lng) {
  try {
    if (typeof MSK_FULL !== 'undefined' && MSK_FULL && MSK_FULL.regions && typeof _mskFullPickZone === 'function') {
      const z = _mskFullPickZone(coordMskRegion, lng);
      if (z) { const tw = (MSK_FULL.datums && MSK_FULL.datums['2008']) || [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];
        return { proj: `+proj=tmerc +lat_0=0 +lon_0=${z.lon} +k=1 +x_0=${z.x0} +y_0=${z.y0} +ellps=${MSK_FULL.ellps || 'krass'} +towgs84=${tw.join(',')} +units=m +no_defs`, name: `МСК-${coordMskRegion}` }; }
    }
    if (typeof _mskProj === 'function' && typeof _mskZone === 'function') return { proj: _mskProj(_mskZone(lng)), name: 'МСК' };
  } catch (e) {}
  return null;
}
function mapGridRender() {
  if (!window.map) return;
  if (!MGRID.layer) MGRID.layer = L.layerGroup();
  MGRID.layer.clearLayers();
  const kind = typeof uiSet === 'function' ? (uiSet('grid') || 'none') : 'none';
  if (kind === 'none') { if (map.hasLayer(MGRID.layer)) map.removeLayer(MGRID.layer); return; }
  if (!map.getPane('gridPane')) { map.createPane('gridPane'); map.getPane('gridPane').style.zIndex = 380; map.getPane('gridPane').style.pointerEvents = 'none'; }
  if (!map.hasLayer(MGRID.layer)) MGRID.layer.addTo(map);
  const b = map.getBounds(), sz = map.getSize();
  const st = { pane: 'gridPane', color: document.documentElement.dataset.theme === 'dark' ? '#e2e8f0' : '#0f172a', weight: 1, opacity: 0.55, interactive: false, dashArray: '4 4' };
  const lbl = (ll, text, dir) => MGRID.layer.addLayer(L.tooltip({ permanent: true, direction: dir, className: 'mgrid-lbl', interactive: false, offset: [0, 0] }).setLatLng(ll).setContent(text));
  if (kind === 'wgs') {
    const span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
    const step = _MG_WGS.find(s => span / s >= 3 && span / s <= 12) || _MG_WGS[_MG_WGS.length - 1];
    const x0 = Math.floor(b.getWest() / step) * step, y0 = Math.floor(b.getSouth() / step) * step;
    for (let x = x0; x <= b.getEast() + 1e-9; x += step) {
      MGRID.layer.addLayer(L.polyline([[b.getSouth() - 1, x], [b.getNorth() + 1, x]], st));
      if (x >= b.getWest()) lbl([b.getNorth(), x], _mgDeg(x, false), 'bottom');
    }
    for (let y = y0; y <= b.getNorth() + 1e-9; y += step) {
      MGRID.layer.addLayer(L.polyline([[y, b.getWest() - 1], [y, b.getEast() + 1]], st));
      if (y >= b.getSouth()) lbl([y, b.getWest()], _mgDeg(y, true), 'right');
    }
    return;
  }
  // МСК: прямоугольная сетка в метрах — на карте это слегка изогнутые линии
  const c = map.getCenter(), P = _mgMskProj(c.lng); if (!P || typeof proj4 === 'undefined') return;
  const fwd = (lat, lng) => proj4('EPSG:4326', P.proj, [lng, lat]), inv = (n, e) => { const r = proj4(P.proj, 'EPSG:4326', [e, n]); return [r[1], r[0]]; };
  const cs = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getWest()], [b.getSouth(), b.getEast()], [b.getNorth(), b.getEast()], [c.lat, c.lng]].map(p => fwd(p[0], p[1]));
  const E0 = Math.min(...cs.map(p => p[0])), E1 = Math.max(...cs.map(p => p[0])), N0 = Math.min(...cs.map(p => p[1])), N1 = Math.max(...cs.map(p => p[1]));
  const mPerPx = (E1 - E0) / sz.x;
  const step = _MG_M.find(s => s / mPerPx >= 110 && s / mPerPx <= 300) || _MG_M.slice().reverse().find(s => s / mPerPx >= 110) || _MG_M[0];
  const K = 12, fmtK = v => (Math.round(v) % 1000 === 0 ? (Math.round(v) / 1000).toLocaleString('ru-RU') + ' км' : Math.round(v).toLocaleString('ru-RU'));
  for (let e = Math.floor(E0 / step) * step; e <= E1; e += step) {
    const pts = []; for (let k = 0; k <= K; k++) pts.push(inv(N0 + (N1 - N0) * k / K, e));
    MGRID.layer.addLayer(L.polyline(pts, st));
    const top = inv(N1, e); if (top[1] >= b.getWest() && top[1] <= b.getEast()) lbl([b.getNorth(), top[1]], 'Y ' + fmtK(e), 'bottom');
  }
  for (let n = Math.floor(N0 / step) * step; n <= N1; n += step) {
    const pts = []; for (let k = 0; k <= K; k++) pts.push(inv(n, E0 + (E1 - E0) * k / K));
    MGRID.layer.addLayer(L.polyline(pts, st));
    const lf = inv(n, E0); if (lf[0] >= b.getSouth() && lf[0] <= b.getNorth()) lbl([lf[0], b.getWest()], 'X ' + fmtK(n), 'right');
  }
  lbl(map.containerPointToLatLng([sz.x - 60, sz.y - 70]), `${P.name} · шаг ${step >= 1000 ? step / 1000 + ' км' : step + ' м'}`, 'left');
}
(function () {
  const go = () => {
    if (!window.map) return setTimeout(go, 400);
    let t = null; map.on('moveend zoomend resize', () => { clearTimeout(t); t = setTimeout(mapGridRender, 80); });
    mapGridRender();
  };
  setTimeout(go, 800);
})();
