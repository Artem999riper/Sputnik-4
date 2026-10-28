// ═══════════════════════════════════════════════════════════
// map-snapshot.js — «🖼 Снимок карты»: текущий вид карты в PNG или PDF.
// Рисуется заново на холсте (без захвата экрана): подложка — тайлы через сервер,
// поверх — всё, что сейчас показано на карте (слои, объёмы, факты, зоны
// затопления, результаты анализа, заметки, подписи), масштаб, север и штамп.
// ═══════════════════════════════════════════════════════════
function mapSnapshotOpen() {
  if (typeof switchView === 'function') switchView('map');
  let last = {}; try { last = JSON.parse(localStorage.getItem('snap_opts') || '{}'); } catch (e) {}
  const obj = typeof currentType !== 'undefined' && currentType === 'site' && currentObj ? currentObj.name : '';
  const ck = (id, l, d) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="snap-${id}" ${(last[id] ?? d) ? 'checked' : ''} style="width:auto;margin:0"> ${l}</label>`;
  showModal('🖼 Снимок карты', `<div style="min-width:min(420px,86vw);display:flex;flex-direction:column;gap:8px">
    <div style="font-size:12px;color:var(--tx2)">Снимается то, что сейчас видно на карте. Подвиньте карту — окно не мешает.</div>
    <div class="fg" style="margin:0"><label>Заголовок</label><input id="snap-title" value="${escAttr(last.title != null ? last.title : obj)}" placeholder="например: Площадка куста 12"></div>
    <div style="display:flex;gap:8px">
      <div class="fg" style="margin:0;flex:1"><label>Чёткость</label><select id="snap-k"><option value="1">обычная (как на экране)</option><option value="2" ${(last.k || 2) == 2 ? 'selected' : ''}>высокая ×2</option><option value="3" ${last.k == 3 ? 'selected' : ''}>очень высокая ×3 (дольше)</option></select></div>
      <div class="fg" style="margin:0;flex:1"><label>Подложка</label><select id="snap-base"><option value="auto">как на карте</option><option value="sat" ${last.base === 'sat' ? 'selected' : ''}>спутник</option><option value="map" ${last.base === 'map' ? 'selected' : ''}>схема</option><option value="none" ${last.base === 'none' ? 'selected' : ''}>без подложки</option></select></div>
    </div>
    ${ck('stamp', 'Штамп ПурГеоКом (заголовок, дата)', true)}${ck('scale', 'Масштабная линейка и север', true)}${ck('labels', 'Подписи объектов', true)}
    <div id="snap-st" style="font-size:11px;color:var(--acc);font-weight:700;min-height:14px"></div></div>`,
    [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '🖨 PDF', cls: 'bs', fn: () => _snapRun('pdf') }, { label: '🖼 PNG', cls: 'bp', fn: () => _snapRun('png') }]);
  document.getElementById('mov').classList.add('side');
}
async function _snapRun(fmt) {
  const st = t => { const e = document.getElementById('snap-st'); if (e) e.textContent = t; };
  const o = { title: document.getElementById('snap-title').value.trim(), k: +document.getElementById('snap-k').value || 2, base: document.getElementById('snap-base').value,
    stamp: document.getElementById('snap-stamp').checked, scale: document.getElementById('snap-scale').checked, labels: document.getElementById('snap-labels').checked };
  try { localStorage.setItem('snap_opts', JSON.stringify(o)); } catch (e) {}
  document.querySelectorAll('#mft .btn').forEach(b => b.disabled = true);
  try {
    st('⏳ Рисую карту…');
    const url = await mapSnapshotImage(o, st);
    const name = `Карта_${(o.title || 'снимок').replace(/[\\/:*?"<>|]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
    if (fmt === 'png') {
      const a = document.createElement('a'); a.href = url; a.download = name + '.png'; document.body.appendChild(a); a.click(); a.remove();
      st('✅ PNG сохранён'); toast('🖼 Снимок сохранён: ' + name + '.png', 'ok');
    } else {
      const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(fr);
      const d = fr.contentDocument;
      d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0}img{width:100%;max-height:190mm;object-fit:contain;display:block}</style></head><body><img src="${url}"></body></html>`); d.close();
      const im = d.images[0]; const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} setTimeout(() => fr.remove(), 60000); };
      if (im.complete) setTimeout(go, 100); else im.onload = () => setTimeout(go, 100);
      st('✅ Открыта печать — выберите «Сохранить как PDF»');
    }
  } catch (e) { console.error('[snapshot]', e); st('❌ ' + e.message); }
  finally { document.querySelectorAll('#mft .btn').forEach(b => b.disabled = false); }
}
// Картинка текущего вида карты (dataURL PNG)
async function mapSnapshotImage(o, st) {
  const k = o.k || 2, sz = map.getSize(), W = Math.round(sz.x * k), H = Math.round(sz.y * k);
  const z0 = map.getZoom(), zz = Math.min(19, Math.round(z0 + Math.log2(k)));
  const sc = Math.pow(2, zz - z0) / k;                     // пикселей мира zz на пиксель холста
  const nw = map.project(map.containerPointToLatLng([0, 0]), zz);
  const P = ll => { const q = map.project(ll, zz); return [(q.x - nw.x) / sc, (q.y - nw.y) / sc]; };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#eef2f0'; g.fillRect(0, 0, W, H);
  // подложка
  let base = o.base;
  if (base === 'auto') { const nm = Object.keys(window._mapBaseLayers || {}).find(n => map.hasLayer(window._mapBaseLayers[n])) || ''; base = /Спутник|Гибрид/i.test(nm) ? 'sat' : 'map'; }
  if (base !== 'none') {
    st && st('⏳ Подложка…');
    const b = map.getBounds();
    try {
      const r = await fetch(`${API}/export-tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: { minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() }, minZoom: zz, maxZoom: zz, source: base }) }).then(x => x.json());
      if (r && r.tiles) await Promise.all(Object.entries(r.tiles).map(([key, b64]) => new Promise(ok => {
        const [, tx, ty] = key.split('/').map(Number), im = new Image();
        im.onload = () => { g.drawImage(im, (tx * 256 - nw.x) / sc, (ty * 256 - nw.y) / sc, 256 / sc + 0.5, 256 / sc + 0.5); ok(); }; im.onerror = ok;
        im.src = (b64.startsWith('/9j') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + b64;
      })));
      if (r && r.error === 'too_many_tiles') toast('Слишком большая область для подложки — уменьшите чёткость', 'warn');
    } catch (e) {}
  }
  st && st('⏳ Объекты…');
  const lw = w => Math.max(1, (w || 2) * k);
  const all = [];
  map.eachLayer(l => all.push(l));
  // растровые результаты (затопление/анализ)
  for (const l of all) if (l instanceof L.ImageOverlay && l._url) {
    await new Promise(ok => { const im = new Image(); im.onload = () => { const bb = l.getBounds(), a = P(bb.getNorthWest()), c = P(bb.getSouthEast()); g.globalAlpha = l.options.opacity ?? 1; g.drawImage(im, a[0], a[1], c[0] - a[0], c[1] - a[1]); g.globalAlpha = 1; ok(); }; im.onerror = ok; im.src = l._url; });
  }
  const ring = lls => { lls.forEach((ll, i) => { const [x, y] = P(ll); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
  const flat = a => a.length && a[0] && a[0].lat != null ? [a] : a.flatMap(flat);
  for (const l of all) {
    if (!(l instanceof L.Path) || !l._map) continue;
    const s = l.options; if (s.opacity === 0 && !s.fill) continue;
    g.setLineDash(s.dashArray ? String(s.dashArray).split(/[ ,]+/).map(v => +v * k) : []);
    g.strokeStyle = s.color || '#3388ff'; g.lineWidth = lw(s.weight); g.lineJoin = g.lineCap = 'round';
    if (l instanceof L.CircleMarker) {
      const [x, y] = P(l.getLatLng()), rad = (l instanceof L.Circle ? l._radius : s.radius || 6) * k;
      g.beginPath(); g.arc(x, y, rad, 0, 7);
      if (s.fill !== false) { g.globalAlpha = s.fillOpacity ?? 0.2; g.fillStyle = s.fillColor || s.color; g.fill(); g.globalAlpha = 1; }
      if (s.stroke !== false) g.stroke();
      continue;
    }
    const rings = flat(l.getLatLngs());
    g.beginPath(); rings.forEach(r => { ring(r); if (l instanceof L.Polygon) g.closePath(); });
    if (l instanceof L.Polygon && s.fill !== false) { g.globalAlpha = s.fillOpacity ?? 0.2; g.fillStyle = s.fillColor || s.color; g.fill('evenodd'); g.globalAlpha = 1; }
    if (s.stroke !== false) { g.globalAlpha = s.opacity ?? 1; g.stroke(); g.globalAlpha = 1; }
  }
  g.setLineDash([]);
  // точки-значки и тексты заметок
  const txt = (t, x, y, size, col, bold = true) => { g.font = `${bold ? 'bold ' : ''}${size}px sans-serif`; g.lineWidth = Math.max(3, size / 4); g.strokeStyle = 'rgba(255,255,255,.95)'; g.fillStyle = col;
    String(t).split('\n').forEach((s, i) => { g.strokeText(s, x, y + i * size * 1.15); g.fillText(s, x, y + i * size * 1.15); }); };
  for (const l of all) {
    if (!(l instanceof L.Marker) || !l._map || !l.getLatLng) continue;
    const p = (l.feature && l.feature.properties) || {}, [x, y] = P(l.getLatLng());
    if (p._note === 'text') { txt(p.name || '', x, y, (+p._size || 16) * k * 1.05, p._color || '#dc2626'); continue; }
    const el = l.getElement && l.getElement();
    if (el && el.querySelector('.kcl')) {         // кружок группировки
      const d = el.querySelector('.kcl'), n = d.textContent, rr = (d.offsetWidth || 30) / 2 * k;
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.fillStyle = d.style.background || '#2563eb'; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = '#fff'; g.stroke();
      g.font = `bold ${12 * k}px sans-serif`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x, y); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      continue;
    }
    // значок: SVG/картинка из маркера, иначе кружок
    const svg = el && el.querySelector('svg');
    if (svg) {
      await new Promise(ok => { const im = new Image(), s = svg.cloneNode(true); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const w = (svg.getBoundingClientRect().width || 24) * k, h = (svg.getBoundingClientRect().height || 24) * k;
        im.onload = () => { g.drawImage(im, x - w / 2, y - h / 2, w, h); ok(); }; im.onerror = ok;
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.outerHTML); });
    } else {
      g.beginPath(); g.arc(x, y, 6 * k, 0, 7); g.fillStyle = p._color || '#2563eb'; g.fill(); g.lineWidth = 2 * k; g.strokeStyle = '#fff'; g.stroke();
    }
  }
  // постоянные подписи (как на экране)
  if (o.labels) document.querySelectorAll('.leaflet-tooltip-pane .leaflet-tooltip').forEach(t => {
    if (getComputedStyle(t).opacity === '0' || t.style.visibility === 'hidden' || !t.textContent.trim() || t.classList.contains('lm-tip')) return;
    const r = t.getBoundingClientRect(), mr = map.getContainer().getBoundingClientRect();
    if (r.right < mr.left || r.left > mr.right || r.bottom < mr.top || r.top > mr.bottom) return;
    const x = (r.left - mr.left) * k, y = (r.top - mr.top) * k, w = r.width * k, h = r.height * k;
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
    g.font = `600 ${11 * k}px sans-serif`; g.fillStyle = '#111827'; g.textBaseline = 'middle';
    t.innerText.split('\n').forEach((s, i, a) => g.fillText(s, x + 6 * k, y + h / 2 + (i - (a.length - 1) / 2) * 13 * k));
    g.textBaseline = 'alphabetic';
  });
  // масштаб и север
  if (o.scale) {
    const c = map.getCenter(), mpp = 156543.034 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z0) / k;
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find(m => m / mpp > 110 * k) || 100000, len = nice / mpp;
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(12 * k, H - 50 * k, len + 28 * k, 38 * k);
    g.fillStyle = '#111'; g.fillRect(26 * k, H - 22 * k, len, 4 * k); g.fillRect(26 * k, H - 28 * k, 2 * k, 10 * k); g.fillRect(26 * k + len - 2 * k, H - 28 * k, 2 * k, 10 * k);
    g.font = `bold ${13 * k}px sans-serif`; g.fillText(nice >= 1000 ? nice / 1000 + ' км' : nice + ' м', 28 * k, H - 31 * k);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(W - 52 * k, 12 * k, 40 * k, 50 * k);
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(W - 32 * k, 18 * k); g.lineTo(W - 43 * k, 44 * k); g.lineTo(W - 32 * k, 38 * k); g.lineTo(W - 21 * k, 44 * k); g.closePath(); g.fill();
    g.font = `bold ${13 * k}px sans-serif`; g.fillText('С', W - 37 * k, 58 * k);
  }
  if (o.stamp) {
    const lines = [o.title, new Date().toLocaleDateString('ru-RU') + (typeof un === 'function' ? ' · ' + un() : '')].filter(Boolean);
    g.font = `bold ${15 * k}px sans-serif`; const w1 = g.measureText('ПурГеоКом').width;
    g.font = `${12 * k}px sans-serif`; const w2 = Math.max(...lines.map(s => g.measureText(s).width));
    const bw = Math.max(w1, w2) + 24 * k, bh = (24 + lines.length * 16) * k;
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = '#9ca3af'; g.lineWidth = 1.5 * k;
    g.fillRect(W - bw - 12 * k, H - bh - 12 * k, bw, bh); g.strokeRect(W - bw - 12 * k, H - bh - 12 * k, bw, bh);
    g.fillStyle = '#111827'; g.font = `bold ${15 * k}px sans-serif`; g.fillText('ПурГеоКом', W - bw, H - bh + 6 * k);
    g.font = `${12 * k}px sans-serif`; lines.forEach((s, i) => { g.fillStyle = i ? '#4b5563' : '#111827'; g.fillText(s, W - bw, H - bh + (24 + i * 16) * k); });
  }
  return cv.toDataURL('image/png');
}
