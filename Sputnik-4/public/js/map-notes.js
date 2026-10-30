// ═══════════════════════════════════════════════════════════
// map-notes.js — заметки на карте для показа заказчику: текст, стрелки,
// выноски. Хранятся слоями KML с пометкой style_json.notes=true — их может быть
// несколько (слой выбирается на панели заметок), показываются во вкладке
// «✏️ Заметки» панели слоёв, а не среди обычных слоёв:
//   текст   — Point {name, _note:'text', _color, _size}
//   стрелка — MultiLineString (линия + 2 «уса» наконечника), _note:'arrow'
//   выноска — LineString (от точки к подписи, _note:'callout') + текст в конце
//   рисунок — LineString от руки (карандаш), _note:'draw', _w — толщина
// Поэтому заметки выгружаются в DXF/KML/MIF как обычные объекты и попадают
// на карту в «Отчёте для заказчика».
// ═══════════════════════════════════════════════════════════
const MN = Object.assign({ color: '#dc2626', size: 16, width: 4 }, (() => { try { return JSON.parse(localStorage.getItem('map_notes') || '{}'); } catch (e) { return {}; } })(),
  { mode: null, pts: [], tmp: null, stroke: null });
function _mnSave() { try { localStorage.setItem('map_notes', JSON.stringify({ color: MN.color, size: MN.size, width: MN.width, layerId: MN.layerId })); } catch (e) {} }

// Иконка текста заметки (используется при отрисовке слоя в kml-manager)
function mapNoteIcon(p) {
  const sz = Math.max(9, Math.min(48, +p._size || 16)), c = p._color || '#dc2626';
  const txt = esc(String(p.name || '')).replace(/\n/g, '<br>');
  return L.divIcon({ className: 'mn-text', iconSize: null, iconAnchor: [0, sz * 0.6],
    html: `<div style="color:${c};font-size:${sz}px;font-weight:800;white-space:nowrap;line-height:1.15;text-shadow:-2px -2px 0 #fff,2px -2px 0 #fff,-2px 2px 0 #fff,2px 2px 0 #fff,0 0 4px #fff">${txt}</div>` });
}
// слои заметок (style_json.notes=true); рисуем в выбранный — MN.layerId
const mnLayers = () => (layers || []).filter(x => !x.site_id && typeof _kmlIsNote === 'function' && _kmlIsNote(x) && !_kmlIsVol(x));
function _mnCur() {
  const ls = mnLayers();
  return ls.find(x => x.id === MN.layerId) || ls[0] || null;
}
async function _mnCreateLayer(name) {
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Заметки', color: '#dc2626', geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }) }) });
  if (!r.ok) { toast('Не удалось создать слой', 'err'); return null; }
  const j = await r.json();
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  const l = layers.find(x => x.id === j.id);
  if (l && typeof kmlSaveStyle === 'function') await kmlSaveStyle(l, Object.assign({}, kmlStyleOf(l) || {}, { notes: true }));
  if (l) { MN.layerId = l.id; _mnSave(); }
  try { renderLP(); } catch (e) {}
  try { if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  return l;
}
async function _mnLayer() { return _mnCur() || await _mnCreateLayer('Заметки'); }
// новый слой заметок: спросить название
function mapNotesNewLayer(after) {
  const n = mnLayers().length;
  showModal('✏️ Новый слой заметок', `<div class="fg"><label>Название слоя</label><input id="mn-ln" value="${n ? 'Заметки ' + (n + 1) : 'Заметки'}" placeholder="Например: Для заказчика 30.10 / Подъезды"></div>
    <div style="font-size:10px;color:var(--tx3);margin-top:3px">Новые заметки будут рисоваться в этот слой. Сменить слой — список «Слой» на панели заметок.</div>`,
    [{ label: 'Отмена', cls: 'bs', fn: () => { closeModal(); if (MN.mode) _mnBar(); } },
     { label: 'Создать', cls: 'bp', fn: async () => { const nm = v('mn-ln').trim(); if (!nm) return; closeModal(); const l = await _mnCreateLayer(nm); if (l) toast(`Заметки рисуются в «${l.name}»`, 'ok'); if (MN.mode) _mnBar(); if (after) after(l); } }]);
  setTimeout(() => { const i = document.getElementById('mn-ln'); if (i) { i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') document.querySelector('#mft .btn.bp').click(); }; } }, 50);
}
function mapNotesPick(id) {
  if (id === '__new') { mapNotesNewLayer(); return; }
  MN.layerId = id; _mnSave(); if (MN.mode) _mnBar();
  try { if (kmlPanelOpen && _kmlTab === 'notes') renderKmlPanel(); } catch (e) {}
}
// рисовать в этот слой (из вкладки «Заметки»)
function mapNotesDrawTo(id) {
  MN.layerId = id; _mnSave();
  const l = (layers || []).find(x => x.id === id); if (l && !l.visible) kmlToggleVis(id, 1);
  if (!MN.mode) mapNotesOpen(); else _mnBar();
  try { if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
}
// обычный слой ↔ слой заметок
async function mapNotesSetLayerKind(id, on) {
  const l = (layers || []).find(x => x.id === id); if (!l) return;
  const st = Object.assign({}, kmlStyleOf(l) || {});
  if (on) st.notes = true; else delete st.notes;
  if (!await kmlSaveStyle(l, st)) { toast('Не удалось изменить слой', 'err'); return; }
  toast(on ? `«${l.name}» — теперь во вкладке «✏️ Заметки»` : `«${l.name}» — теперь среди обычных слоёв`, 'ok');
  try { renderKmlPanel(); } catch (e) {}
}
async function _mnAdd(features) {
  const l = await _mnLayer(); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { gj = { type: 'FeatureCollection', features: [] }; }
  gj.features = (gj.features || []).concat(features);
  if (!l.visible) l.visible = 1;
  await _kmlSaveGeojson(l, gj);
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  renderLayerGroups();
  try { if (kmlPanelOpen && _kmlTab === 'notes') renderKmlPanel(); } catch (e) {}
}

// ── Вкладка «✏️ Заметки» в панели слоёв ──
function mnKmlRenderCats() {
  const el = document.getElementById('kml-cats'); if (!el) return;
  const ls = mnLayers(), cur = _mnCur();
  el.innerHTML = `<div class="kml-cat-row active">
      <input type="checkbox" ${ls.some(l => l.visible) ? 'checked' : ''} onchange="mnKmlBulkVis(this.checked)" style="cursor:pointer;flex-shrink:0">
      <span class="kml-cat-label">✏️ Все заметки</span><span class="kml-cat-count">${ls.length}</span></div>
    <div class="kml-cat-actions">
      <button class="btn bp bxs" onclick="mapNotesOpen()">${MN.mode ? '⏹ Закончить рисование' : '✏️ Рисовать заметки'}</button>
      <button class="btn bs bxs" onclick="mapNotesNewLayer()">＋ Новый слой заметок</button>
    </div>
    <div class="vl-hint" style="padding:6px 8px">${cur ? `Рисуется в: <b>${esc(cur.name)}</b>. ` : ''}Слой для рисования — кнопка ✏️ у слоя или список «Слой» на панели заметок. Любой слой можно перенести сюда: ПКМ → «✏️ Перенести в заметки».</div>`;
}
function mnKmlRenderPane() {
  const el = document.getElementById('kml-layers-pane'); if (!el) return;
  const ls = mnLayers(), cur = _mnCur();
  if (!ls.length) {
    el.innerHTML = `<div class="kml-empty"><div style="font-size:28px;margin-bottom:6px">✏️</div><div>Заметок пока нет</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:4px">«✏️ Рисовать заметки» слева или «🧰 Инструменты ▾ → Заметки» внизу карты</div></div>`;
    return;
  }
  const rows = ls.map(l => _kmlLayerRowHtml(l, {
    noPin: true, cls: cur && cur.id === l.id ? 'mn-cur' : '',
    name: `${cur && cur.id === l.id ? '<span title="Новые заметки рисуются сюда">✏️</span> ' : ''}${esc(l.name)}`,
    btns: `<button class="kml-icon-btn ${cur && cur.id === l.id && MN.mode ? 'on' : ''}" onclick="mapNotesDrawTo('${escAttr(l.id)}')" title="Рисовать заметки в этот слой">✏️</button>`,
  })).join('');
  el.innerHTML = `<div style="flex:1">${rows}</div><div class="kml-pane-footer" style="display:flex;align-items:center;gap:8px">
    <span>Показано ${ls.filter(l => l.visible).length} / ${ls.length}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--tx3)">2× клик — переименовать</span></div>`;
}
async function mnKmlBulkVis(on) {
  for (const l of mnLayers().filter(x => !!x.visible !== on)) { try { await kmlToggleVis(l.id, on ? 1 : 0); } catch (e) {} }
  renderKmlPanel();
}

function mapNotesOpen() {
  if (MN.mode) { mapNotesStop(); return; }
  MN.mode = 'idle';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = 'show draw'; bnr.style.display = 'flex'; }
  _mnBar();
  const b = document.getElementById('tool-notes'); if (b) b.classList.add('on');
  try { if (kmlPanelOpen && _kmlTab === 'notes') renderKmlPanel(); } catch (e) {}
  map.on('click', _mnClick);
  map.on('mousemove', _mnMove);
  document.addEventListener('keydown', _mnKey, true);
  const el = map.getContainer();
  el.addEventListener('mousedown', _mnDown, true); el.addEventListener('touchstart', _mnDown, { capture: true, passive: false });
  document.addEventListener('mousemove', _mnDrag); document.addEventListener('touchmove', _mnDrag, { passive: false });
  document.addEventListener('mouseup', _mnUp); document.addEventListener('touchend', _mnUp);
}
function _mnBar() {
  const t = document.getElementById('bnr-t'); if (!t) return;
  const btn = (m, l) => `<button class="btn bsm" style="${MN.mode === m ? 'background:#fff;color:#111' : 'background:rgba(255,255,255,.15);color:#fff'};border:1px solid rgba(255,255,255,.4)" onclick="event.stopPropagation();_mnMode('${m}')">${l}</button>`;
  const hint = { idle: 'выберите инструмент', draw: 'ведите мышью с нажатой кнопкой — карта не двигается', text: 'щёлкните, где поставить текст', arrow: MN.pts.length ? 'щёлкните, куда указывает стрелка' : 'щёлкните начало стрелки',
    callout: MN.pts.length ? 'щёлкните, где будет подпись' : 'щёлкните точку, к которой выноска' }[MN.mode] || '';
  const ls = mnLayers(), cur = _mnCur();
  const lsel = `<select title="Слой, в который рисуются заметки" style="font-size:11px;padding:1px 2px;max-width:150px" onclick="event.stopPropagation()" onchange="mapNotesPick(this.value)">
    ${ls.length ? ls.map(l => `<option value="${escAttr(l.id)}" ${cur && cur.id === l.id ? 'selected' : ''}>🗂 ${esc(l.name)}</option>`).join('') : '<option value="">🗂 Заметки (будет создан)</option>'}
    <option value="__new">＋ Новый слой…</option></select>`;
  t.innerHTML = `✏️ Заметки ${lsel}: ${btn('draw', '✍️ Рисовать')} ${btn('text', '🔤 Текст')} ${btn('arrow', '➡ Стрелка')} ${btn('callout', '💬 Выноска')}
    <input type="color" value="${MN.color}" title="Цвет" style="width:28px;height:22px;padding:0;border:none;vertical-align:middle" onclick="event.stopPropagation()" onchange="MN.color=this.value;_mnSave()">
    ${MN.mode === 'draw' ? `<select title="Толщина линии" style="font-size:11px;padding:1px 2px" onclick="event.stopPropagation()" onchange="MN.width=+this.value;_mnSave()">${[[2, 'тонко'], [4, 'средне'], [7, 'толсто'], [12, 'маркер']].map(([w, n]) => `<option value="${w}" ${MN.width === w ? 'selected' : ''}>${n}</option>`).join('')}</select>`
      : `<select title="Размер текста" style="font-size:11px;padding:1px 2px" onclick="event.stopPropagation()" onchange="MN.size=+this.value;_mnSave()">${[12, 14, 16, 20, 24, 32].map(z => `<option ${MN.size === z ? 'selected' : ''}>${z}</option>`).join('')}</select>`}
    <span style="opacity:.85">· ${hint} · Ctrl+Z — убрать последнее · Esc — выход</span>`;
  t.onclick = e => e.stopPropagation();
}
function _mnMode(m) {
  MN.mode = m; MN.pts = []; _mnTmpClear(); map.getContainer().style.cursor = 'crosshair'; _mnBar();
  // карандаш: перетаскивание карты выключено, пока рисуем
  if (m === 'draw') map.dragging.disable(); else map.dragging.enable();
}

// ── Карандаш: штрих от нажатия до отпускания кнопки мыши (или пальца) ──
function _mnDown(e) {
  if (MN.mode !== 'draw') return;
  const t = e.touches ? e.touches[0] : e;
  if (e.button > 0 || (e.target.closest && e.target.closest('.leaflet-control,#bnr'))) return;
  e.preventDefault(); e.stopPropagation();
  MN.stroke = [map.mouseEventToLatLng(t)];
  _mnTmpClear();
  MN.tmp = L.polyline(MN.stroke, { color: MN.color, weight: MN.width, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
}
function _mnDrag(e) {
  if (!MN.stroke) return;
  const t = e.touches ? e.touches[0] : e;
  const ll = map.mouseEventToLatLng(t), last = MN.stroke[MN.stroke.length - 1];
  if (map.latLngToContainerPoint(ll).distanceTo(map.latLngToContainerPoint(last)) < 2) return;
  MN.stroke.push(ll); MN.tmp.setLatLngs(MN.stroke);
  e.preventDefault();
}
// Упрощение штриха (Дуглас — Пекер, допуск ~1,5 пикселя), чтобы не хранить тысячи точек
function _mnSimplify(lls) {
  const P = lls.map(ll => map.latLngToContainerPoint(ll)), keep = new Uint8Array(P.length);
  keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, l = Math.hypot(dx, dy) || 1;
      const d = Math.abs(dy * P[i].x - dx * P[i].y + P[b].x * P[a].y - P[b].y * P[a].x) / l;
      if (d > md) { md = d; mi = i; }
    }
    if (md > 1.5) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return lls.filter((_, i) => keep[i]);
}
async function _mnUp() {
  if (!MN.stroke) return;
  const s = MN.stroke; MN.stroke = null;
  if (s.length < 2) { _mnTmpClear(); return; }
  const c = x => [+x.lng.toFixed(7), +x.lat.toFixed(7)];
  await _mnAdd([{ type: 'Feature', properties: { name: '', _note: 'draw', _color: MN.color, _w: MN.width }, geometry: { type: 'LineString', coordinates: _mnSimplify(s).map(c) } }]);
  _mnTmpClear();
}
function _mnTmpClear() { if (MN.tmp) { try { map.removeLayer(MN.tmp); } catch (e) {} MN.tmp = null; } }
function _mnMove(e) {
  if (!MN.pts.length || (MN.mode !== 'arrow' && MN.mode !== 'callout')) return;
  _mnTmpClear();
  MN.tmp = L.polyline([MN.pts[0], e.latlng], { color: MN.color, weight: 3, dashArray: '6 4', interactive: false }).addTo(map);
}
// Наконечник стрелки: два «уса» длиной 18% линии (не больше 40 пикселей на экране)
function _mnArrow(a, b) {
  const A = map.latLngToLayerPoint(a), B = map.latLngToLayerPoint(b);
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, h = Math.min(40, Math.max(10, len * 0.18));
  const ux = dx / len, uy = dy / len, ang = Math.PI / 7;
  const w = s => map.layerPointToLatLng(L.point(B.x - h * (ux * Math.cos(ang) - s * uy * Math.sin(ang)), B.y - h * (uy * Math.cos(ang) + s * ux * Math.sin(ang))));
  const c = ll => [+ll.lng.toFixed(7), +ll.lat.toFixed(7)];
  return { type: 'MultiLineString', coordinates: [[c(a), c(b)], [c(w(1)), c(b), c(w(-1))]] };
}
async function _mnAskText(def) {
  return new Promise(res => {
    showModal('🔤 Текст заметки', `<textarea id="mn-t" rows="3" style="width:100%" placeholder="Например: Площадка под базу / Подъезд зимой">${esc(def || '')}</textarea>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px">Ctrl+Enter — сохранить. Новая строка — Enter.</div>`,
      [{ label: 'Отмена', cls: 'bs', fn: () => { closeModal(); res(null); } }, { label: 'Готово', cls: 'bp', fn: () => { const v = document.getElementById('mn-t').value.trim(); closeModal(); res(v || null); } }]);
    setTimeout(() => { const t = document.getElementById('mn-t'); if (t) { t.focus(); t.onkeydown = e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); document.querySelector('#mft .btn.bp').click(); } }; } }, 50);
  });
}
async function _mnClick(e) {
  if (!MN.mode || MN.mode === 'idle' || MN.mode === 'draw') return;
  const ll = typeof mapSnapLL === 'function' ? mapSnapLL(e.latlng, e) : e.latlng;
  const c = x => [+x.lng.toFixed(7), +x.lat.toFixed(7)];
  if (MN.mode === 'text') {
    const t = await _mnAskText(); if (!t) return;
    await _mnAdd([{ type: 'Feature', properties: { name: t, _note: 'text', _color: MN.color, _size: MN.size }, geometry: { type: 'Point', coordinates: c(ll) } }]);
    return;
  }
  MN.pts.push(ll);
  if (MN.pts.length < 2) { _mnBar(); return; }
  const [a, b] = MN.pts; MN.pts = []; _mnTmpClear(); _mnBar();
  if (MN.mode === 'arrow') {
    await _mnAdd([{ type: 'Feature', properties: { name: '', _note: 'arrow', _color: MN.color }, geometry: _mnArrow(a, b) }]);
  } else {
    const t = await _mnAskText(); if (!t) return;
    await _mnAdd([
      { type: 'Feature', properties: { name: '', _note: 'callout', _color: MN.color }, geometry: { type: 'LineString', coordinates: [c(a), c(b)] } },
      { type: 'Feature', properties: { name: t, _note: 'text', _color: MN.color, _size: MN.size }, geometry: { type: 'Point', coordinates: c(b) } },
    ]);
  }
}
function _mnKey(e) {
  if (MN.mode === 'draw' && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'я')) { e.preventDefault(); e.stopImmediatePropagation(); mapNotesUndo(); return; }
  if (e.key !== 'Escape' || !MN.mode || document.getElementById('mov')?.classList.contains('open')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (MN.stroke) { MN.stroke = null; _mnTmpClear(); return; }
  if (MN.pts.length) { MN.pts = []; _mnTmpClear(); _mnBar(); } else mapNotesStop();
}
function mapNotesStop() {
  MN.mode = null; MN.pts = []; MN.stroke = null; _mnTmpClear();
  map.off('click', _mnClick); map.off('mousemove', _mnMove);
  document.removeEventListener('keydown', _mnKey, true);
  const el = map.getContainer();
  el.removeEventListener('mousedown', _mnDown, true); el.removeEventListener('touchstart', _mnDown, true);
  document.removeEventListener('mousemove', _mnDrag); document.removeEventListener('touchmove', _mnDrag);
  document.removeEventListener('mouseup', _mnUp); document.removeEventListener('touchend', _mnUp);
  map.dragging.enable();
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
  const b = document.getElementById('tool-notes'); if (b) b.classList.remove('on');
  try { if (kmlPanelOpen && _kmlTab === 'notes') renderKmlPanel(); } catch (e) {}
}

// Ctrl+Z в режиме заметок — убрать последнюю добавленную заметку
async function mapNotesUndo() {
  const l = _mnCur();
  if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { return; }
  if (!(gj.features || []).length) return;
  const last = gj.features.pop();
  // выноска = линия + текст: убираем обе части
  if (last.properties && last.properties._note === 'text' && gj.features.length && (gj.features[gj.features.length - 1].properties || {})._note === 'callout') gj.features.pop();
  await _kmlSaveGeojson(l, gj);
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  renderLayerGroups(); toast('↩ Последняя заметка убрана', 'ok');
}
