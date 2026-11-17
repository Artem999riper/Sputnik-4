// ═══════════════════════════════════════════════════════════
// well-tools.js — скважины и точки:
//   • 📍 Расставить точки: вдоль линии с шагом (с пикетажем) или по сетке внутри
//     полигона / по его контуру — в новый или существующий слой, с нумерацией;
//     ПКМ по линии или полигону на карте → «Расставить точки…».
//   • ⛰ Отметка из рельефа: высота ArcticDEM (БСВ-77, с поправкой геоида) в точке
//     каждого объекта → в поле таблицы атрибутов («🛠 Инструменты»).
// ═══════════════════════════════════════════════════════════
const WP = { lid: null, idx: null, prev: null, pts: [] };

// плоская система вокруг точки (м): для расстановки на участке в десятки км — с точностью до сантиметров
function _wpProj(lat0, lng0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  return { fw: c => [(c[0] - lng0) * kx, (c[1] - lat0) * ky], bw: p => [lng0 + p[0] / kx, lat0 + p[1] / ky] };
}
function _wpFeat() { const l = (layers || []).find(x => x.id === WP.lid); return l ? { l, f: _kaFeatures(l)[WP.idx] } : {}; }
function _wpLine(g) { return g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.slice().sort((a, b) => b.length - a.length)[0] : null; }
function _wpRings(g) { return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null; }

// точки вдоль линии: [{c:[lng,lat], s: пикет, м}]
function wpAlongLine(coords, step, start, withEnd) {
  const out = []; if (!coords || coords.length < 2 || !(step > 0)) return out;
  const ll = c => ({ lat: c[1], lng: c[0] });
  const seg = []; let tot = 0;
  for (let i = 1; i < coords.length; i++) { const d = _geoDist(ll(coords[i - 1]), ll(coords[i])); seg.push(d); tot += d; }
  const at = s => { let acc = 0; for (let i = 0; i < seg.length; i++) { if (s <= acc + seg[i] || i === seg.length - 1) { const t = seg[i] ? Math.max(0, Math.min(1, (s - acc) / seg[i])) : 0; const a = coords[i], b = coords[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; } acc += seg[i]; } return coords[coords.length - 1]; };
  let s = Math.max(0, start || 0), n = 0;
  for (; s <= tot + 1e-6 && n < 20000; s += step, n++) out.push({ c: at(s), s });
  if (withEnd && (!out.length || tot - out[out.length - 1].s > 0.01)) out.push({ c: coords[coords.length - 1].slice(0, 2), s: tot });
  return out;
}
// точки внутри полигона по сетке (dx × dy м, поворот angle° от севера по часовой, отступ от границы margin м)
function wpGridInPoly(rings, dx, dy, angle, margin) {
  const out = []; if (!rings || !rings.length || !(dx > 0) || !(dy > 0)) return out;
  const all = [].concat(...rings.map(r => r[0]));
  const lat0 = all.reduce((s, c) => s + c[1], 0) / all.length, lng0 = all.reduce((s, c) => s + c[0], 0) / all.length;
  const P = _wpProj(lat0, lng0), a = (angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const rot = p => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca], unrot = p => [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];
  const polys = rings.map(pr => pr.map(r => r.map(c => rot(P.fw(c)))));
  const inRing = (x, y, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  const dSeg = (x, y, A, B) => { const dx2 = B[0] - A[0], dy2 = B[1] - A[1], L2 = dx2 * dx2 + dy2 * dy2; const t = L2 ? Math.max(0, Math.min(1, ((x - A[0]) * dx2 + (y - A[1]) * dy2) / L2)) : 0; return Math.hypot(x - A[0] - t * dx2, y - A[1] - t * dy2); };
  const inside = (x, y) => polys.some(pr => inRing(x, y, pr[0]) && !pr.slice(1).some(h => inRing(x, y, h)));
  const farFromEdge = (x, y) => !margin || polys.every(pr => pr.every(r => r.every((c, i) => !i || dSeg(x, y, r[i - 1], c) >= margin)));
  const xs = [].concat(...polys.map(pr => pr[0].map(c => c[0]))), ys = [].concat(...polys.map(pr => pr[0].map(c => c[1])));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ox = x0 + ((x1 - x0) % dx) / 2, oy = y1 - ((y1 - y0) % dy) / 2;    // сетка по центру
  let n = 0;
  for (let y = oy; y >= y0 - 1e-6; y -= dy) for (let x = ox; x <= x1 + 1e-6; x += dx) {
    if (++n > 400000 || out.length >= 20000) return out;
    if (inside(x, y) && farFromEdge(x, y)) out.push({ c: P.bw(unrot([x, y])) });
  }
  return out;
}

function wpOpen(lid, idx) {
  WP.lid = lid; WP.idx = idx;
  const { l, f } = _wpFeat(); if (!f || !f.geometry) return;
  const isLine = !!_wpLine(f.geometry), isPoly = !!_wpRings(f.geometry);
  if (!isLine && !isPoly) { toast('Нужна линия или полигон', 'warn'); return; }
  const fname = (f.properties || {}).name || (isLine ? 'линия' : 'полигон');
  const ptLayers = (layers || []).filter(x => x.id !== lid && !/"(Multi)?(LineString|Polygon)"/.test((x.geojson || '').slice(0, 20000)));
  const sv = WP.last || {};
  showModal(`📍 Расставить точки — «${fname}»`, `<div style="width:100%;font-size:12px">
    <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 8px;align-items:center">
      ${isPoly ? `<label>Как</label><select id="wp-mode"><option value="grid">сеткой внутри</option><option value="edge">по контуру</option></select>` : '<input type="hidden" id="wp-mode" value="line">'}
      <label id="wp-stl">Шаг, м</label><div style="display:flex;gap:6px;align-items:center"><input id="wp-dx" type="number" min="0.1" step="any" value="${sv.dx || 50}" style="width:80px"><span id="wp-dyw" style="display:none">× <input id="wp-dy" type="number" min="0.1" step="any" value="${sv.dy || sv.dx || 50}" style="width:80px"> м</span></div>
      <label id="wp-al" style="display:none">Поворот сетки</label><div id="wp-aw" style="display:none"><input id="wp-ang" type="number" step="any" value="${sv.ang || 0}" style="width:70px">° <button class="btn bs bxs" onclick="wpAutoAngle()" title="По самой длинной стороне полигона">по длинной стороне</button></div>
      <label id="wp-ml" style="display:none">Отступ от границы</label><div id="wp-mw" style="display:none"><input id="wp-mg" type="number" min="0" step="any" value="${sv.mg || 0}" style="width:70px"> м</div>
      <label id="wp-s0l">${isLine ? 'Первая точка с' : 'Начать с'}</label><div id="wp-s0w"><input id="wp-s0" type="number" min="0" step="any" value="0" style="width:80px"> м от начала</div>
      <span id="wp-el"></span><label id="wp-ew"><input type="checkbox" id="wp-end" checked> поставить точку и в конце</label>
      <label>Названия</label><div style="display:flex;gap:6px;align-items:center"><input id="wp-tpl" value="${escAttr(sv.tpl || 'Скв-{n}')}" style="width:120px"> с № <input id="wp-n0" type="number" value="${sv.n0 || 1}" style="width:60px"></div>
      <label>Куда</label><select id="wp-dst"><option value="_new">новый слой</option>${ptLayers.map(x => `<option value="${escAttr(x.id)}">${esc(x.name)}</option>`).join('')}</select>
      <label id="wp-nnl">Название слоя</label><input id="wp-nn" value="${escAttr('Скважины — ' + fname)}">
    </div>
    <div id="wp-info" style="margin-top:10px;padding:6px 8px;background:var(--s2);border-radius:6px"></div>
    <div style="margin-top:6px;color:var(--tx3);font-size:11px">Точки видны на карте оранжевым. ${isLine ? 'У каждой точки — поле «ПК» (пикет от начала линии) и «расстояние, м».' : ''} Поля из «🧩 Шаблона полей» слоя добавятся сами.</div></div>`,
    [{ label: '📍 Расставить', cls: 'bp', fn: () => wpApply() }, { label: 'Отмена', cls: 'bs', fn: () => { wpPreviewOff(); closeModal(); } }]);
  document.getElementById('mov').classList.add('side');    // карта не затемнена — точки видны
  clearInterval(WP.watch);
  WP.watch = setInterval(() => { if (!document.getElementById('mov').classList.contains('open') || !document.getElementById('wp-info')) { wpPreviewOff(); clearInterval(WP.watch); } }, 400);
  setTimeout(() => {
    document.querySelectorAll('#mbd input,#mbd select').forEach(e => { e.oninput = wpPreview; e.onchange = wpPreview; });
    if (sv.mode && isPoly) { const m = document.getElementById('wp-mode'); if (m && [...m.options].some(o => o.value === sv.mode)) m.value = sv.mode; }
    wpPreview();
  }, 30);
}
function wpAutoAngle() {
  const { f } = _wpFeat(); const rs = f && _wpRings(f.geometry); if (!rs) return;
  const r = rs[0][0], ll = c => ({ lat: c[1], lng: c[0] }); let best = 0, ang = 0;
  for (let i = 1; i < r.length; i++) { const d = _geoDist(ll(r[i - 1]), ll(r[i])); if (d > best) { best = d; const kx = Math.cos(r[i][1] * Math.PI / 180); ang = Math.atan2((r[i][0] - r[i - 1][0]) * kx, r[i][1] - r[i - 1][1]) * 180 / Math.PI; } }
  ang = ((ang % 90) + 90) % 90; document.getElementById('wp-ang').value = Math.round(ang * 10) / 10; wpPreview();
}
function _wpRead() {
  const v = id => document.getElementById(id), n = id => parseFloat(String(v(id).value).replace(',', '.'));
  return { mode: v('wp-mode').value, dx: n('wp-dx'), dy: n('wp-dy'), ang: n('wp-ang') || 0, mg: n('wp-mg') || 0, s0: n('wp-s0') || 0, end: v('wp-end').checked,
    tpl: v('wp-tpl').value || '{n}', n0: parseInt(v('wp-n0').value) || 1, dst: v('wp-dst').value, nn: v('wp-nn').value.trim() };
}
function _wpCompute(o) {
  const { f } = _wpFeat(); if (!f) return [];
  if (o.mode === 'line') return wpAlongLine(_wpLine(f.geometry), o.dx, o.s0, o.end);
  const rs = _wpRings(f.geometry);
  if (o.mode === 'edge') { const r = rs.slice().sort((a, b) => b[0].length - a[0].length)[0][0]; const pts = wpAlongLine(r, o.dx, o.s0, false); return pts.filter((p, i) => !(i === pts.length - 1 && pts.length > 1 && _geoDist({ lat: p.c[1], lng: p.c[0] }, { lat: pts[0].c[1], lng: pts[0].c[0] }) < o.dx * 0.3)); }
  return wpGridInPoly(rs, o.dx, o.dy || o.dx, o.ang, o.mg);
}
function wpPreviewOff() { if (WP.prev) { try { map.removeLayer(WP.prev); } catch (e) {} WP.prev = null; } }
function wpPreview() {
  const o = _wpRead(), grid = o.mode === 'grid', line = o.mode === 'line';
  const sh = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; };
  sh('wp-dyw', grid); sh('wp-al', grid); sh('wp-aw', grid); sh('wp-ml', grid); sh('wp-mw', grid);
  sh('wp-s0l', !grid); sh('wp-s0w', !grid); sh('wp-el', line); sh('wp-ew', line);
  document.getElementById('wp-stl').textContent = grid ? 'Сетка, м' : 'Шаг, м';
  sh('wp-nnl', o.dst === '_new'); sh('wp-nn', o.dst === '_new');
  const info = document.getElementById('wp-info');
  if (!(o.dx > 0) || (grid && !(o.dy > 0))) { info.innerHTML = '<span style="color:var(--red)">Укажите шаг</span>'; return; }
  const pts = _wpCompute(o); WP.pts = pts;
  wpPreviewOff();
  if (pts.length && pts.length <= 5000) {
    WP.prev = L.layerGroup(pts.map(p => L.circleMarker([p.c[1], p.c[0]], { radius: 4, color: '#ea580c', weight: 2, fillColor: '#fdba74', fillOpacity: 0.9, interactive: false }))).addTo(map);
  }
  const nm = k => o.tpl.includes('{n}') ? o.tpl.split('{n}').join(String(o.n0 + k)) : o.tpl + (o.n0 + k);
  info.innerHTML = pts.length ? `Будет точек: <b>${pts.length}</b> — ${esc(nm(0))} … ${esc(nm(pts.length - 1))}${pts.length > 5000 ? ' <span style="color:#b45309">(на карте не показаны — слишком много)</span>' : ''}${pts.length >= 20000 ? '<br><span style="color:var(--red)">Больше 20 000 — увеличьте шаг</span>' : ''}`
    : '<span style="color:#b45309">Ни одной точки — уменьшите шаг или отступ</span>';
}
async function wpApply() {
  const o = _wpRead(), pts = WP.pts || [];
  if (!pts.length) { toast('Нет точек', 'warn'); return; }
  if (pts.length >= 20000) { toast('Слишком много точек — увеличьте шаг', 'err'); return; }
  WP.last = { mode: o.mode, dx: o.dx, dy: o.dy, ang: o.ang, mg: o.mg, tpl: o.tpl, n0: o.n0 };
  let ll;
  if (o.dst === '_new') {
    const nm = o.nn || 'Скважины';
    const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nm, geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }), color: '#ea580c', symbol: 'point', visible: 1, group_id: '', line_dash: 'solid' }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) { toast('Не удалось создать слой', 'err'); return; }
    ll = { id: j.id, name: nm, geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }), color: '#ea580c', symbol: 'point', visible: 1, group_id: '', line_dash: 'solid', size: 1, show_labels: 0 };
    layers.unshift(ll);
  } else { ll = (layers || []).find(x => x.id === o.dst); if (!ll) { toast('Слой не найден', 'err'); return; } }
  let gj; try { gj = JSON.parse(ll.geojson); } catch (e) { gj = null; }
  if (!gj || gj.type !== 'FeatureCollection') gj = { type: 'FeatureCollection', features: [] };
  const name = k => o.tpl.includes('{n}') ? o.tpl.split('{n}').join(String(o.n0 + k)) : o.tpl + (o.n0 + k);
  pts.forEach((p, k) => {
    const props = { name: name(k) };
    if (o.mode === 'line') { props['ПК'] = typeof pkFmt === 'function' ? pkFmt(p.s) : String(Math.round(p.s * 100) / 100); props['расстояние, м'] = Math.round(p.s * 100) / 100; }
    if (typeof kmlApplyTpl === 'function') kmlApplyTpl(ll, props);
    gj.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [+p.c[0].toFixed(8), +p.c[1].toFixed(8)] }, properties: props });
  });
  wpPreviewOff(); closeModal();
  await _kmlSaveGeojson(ll, gj);
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(ll.id);
  try { renderLayerGroups(); } catch (e) {} try { if (kmlPanelOpen) renderKmlPanel(); } catch (e) {} try { renderLP(); } catch (e) {}
  toast(`📍 Расставлено точек: ${pts.length} → «${ll.name}»`, 'ok');
}

// ═══ ⛰ Отметка из рельефа (ArcticDEM, БСВ-77) ═══
function wellElevOpen() {
  const l = _katLayer(); if (!l) return;
  const sc = _katScope(), feats = _kaFeatures(l);
  const pts = sc.idxs.filter(i => feats[i] && feats[i].geometry && feats[i].geometry.type === 'Point');
  if (!pts.length) { toast('Среди строк нет точек', 'warn'); return; }
  const flds = _katFieldsOf(l), def = flds.find(f => /отметк|абс|^h$|высот/i.test(f)) || 'отметка устья';
  showModal('⛰ Отметка из рельефа', `<div style="width:100%;font-size:12px">
    <div style="display:grid;grid-template-columns:110px 1fr;gap:6px 8px;align-items:center">
      <label>Поле</label><input id="we-f" list="we-dl" value="${escAttr(def)}">${_katDl('we-dl', l)}
      <label>Знаков после ,</label><input id="we-d" type="number" min="0" max="3" value="2" style="width:60px">
      <span></span><label><input type="checkbox" id="we-e"> только где поле пустое</label>
    </div>
    <div style="margin-top:8px"><b>Для:</b> ${pts.length} точ.${pts.length < sc.idxs.length ? ` (линии и полигоны пропускаются: ${sc.idxs.length - pts.length})` : ''} — ${esc(sc.what)}</div>
    <div style="margin-top:6px;color:var(--tx3);font-size:11px;line-height:1.5">Высота ArcticDEM (2 м) в точке, в Балтийской системе БСВ-77 (поправка геоида). Тайлы рельефа скачиваются сами, если их ещё нет на сервере. Точность — как у модели рельефа (±1–2 м, на снегу и в лесу хуже): для планирования, не вместо нивелирования.</div></div>`,
    [{ label: '⛰ Получить отметки', cls: 'bp', fn: () => _wellElevRun(pts) }, { label: 'Отмена', cls: 'bs', fn: closeModal }]);
}
async function _wellElevRun(idxs) {
  const l = _katLayer(); if (!l) return;
  const f = (document.getElementById('we-f').value || '').trim(), dec = Math.max(0, Math.min(3, +document.getElementById('we-d').value || 0)), onlyEmpty = document.getElementById('we-e').checked;
  if (!f || f.startsWith('_')) { toast('Укажите поле', 'err'); return; }
  closeModal();
  const feats = _kaFeatures(l);
  const todo = idxs.filter(i => !onlyEmpty || ((feats[i].properties || {})[f] ?? '') === '');
  if (!todo.length) { toast('Все отметки уже заполнены', 'ok'); return; }
  // группы по ~5×5 км — сервер вырезает рельеф по рамке группы
  const groups = new Map();
  todo.forEach(i => { const [lng, lat] = feats[i].geometry.coordinates; const k = Math.floor(lat / 0.045) + ':' + Math.floor(lng / 0.09); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const parts = []; groups.forEach(g => { for (let k = 0; k < g.length; k += 400) parts.push(g.slice(k, k + 400)); });
  const res = {}; let done = 0, geoid = true, fail = 0;
  const tid = 'we-prog';
  let pg = document.getElementById(tid);
  if (!pg) { pg = document.createElement('div'); pg.id = tid; pg.className = 'toast ok'; (document.getElementById('toasts') || document.body).appendChild(pg); }
  for (let pi = 0; pi < parts.length; pi++) {
    pg.textContent = `⛰ Отметки из рельефа: ${done} из ${todo.length}… (первый раз может занять минуту — качаются тайлы)`;
    try {
      const pts = parts[pi].map(i => ({ lat: feats[i].geometry.coordinates[1], lng: feats[i].geometry.coordinates[0] }));
      const r = await fetch(`${API}/elevation/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pts) }).then(x => x.json());
      if (!r || !Array.isArray(r.values)) { fail += parts[pi].length; }
      else { if (!r.geoidApplied) geoid = false; parts[pi].forEach((i, k) => { const v = r.values[k]; if (v != null && Number.isFinite(+v)) res[i] = Math.round(+v * 10 ** dec) / 10 ** dec; else fail++; }); }
    } catch (e) { fail += parts[pi].length; }
    done += parts[pi].length;
  }
  try { const t = document.getElementById(tid); t && t.remove(); } catch (e) {}
  const n = Object.keys(res).length;
  if (!n) { toast('Не удалось получить отметки — нет рельефа в этом месте или GDAL на сервере не настроен', 'err'); return; }
  await _katSave(l, fs => Object.keys(res).forEach(i => { if (!fs[i]) return; fs[i].properties = fs[i].properties || {}; fs[i].properties[f] = res[i]; }), null);
  toast(`⛰ Отметки записаны в «${f}»: ${n}${fail ? `, нет данных: ${fail}` : ''}${geoid ? ' (БСВ-77)' : ' — ⚠ без поправки геоида (высоты над эллипсоидом)'}`, geoid ? 'ok' : 'warn');
}
