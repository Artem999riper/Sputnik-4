// ═══════════════════════════════════════════════════════════
// map-notes.js — заметки на карте для показа заказчику: текст, стрелки,
// выноски. Хранятся обычным слоем KML «Заметки» (style_json.notes=true):
//   текст   — Point {name, _note:'text', _color, _size}
//   стрелка — MultiLineString (линия + 2 «уса» наконечника), _note:'arrow'
//   выноска — LineString (от точки к подписи, _note:'callout') + текст в конце
// Поэтому заметки выгружаются в DXF/KML/MIF как обычные объекты и попадают
// на карту в «Отчёте для заказчика».
// ═══════════════════════════════════════════════════════════
const MN = Object.assign({ color: '#dc2626', size: 16 }, (() => { try { return JSON.parse(localStorage.getItem('map_notes') || '{}'); } catch (e) { return {}; } })(),
  { mode: null, pts: [], tmp: null });
function _mnSave() { try { localStorage.setItem('map_notes', JSON.stringify({ color: MN.color, size: MN.size })); } catch (e) {} }

// Иконка текста заметки (используется при отрисовке слоя в kml-manager)
function mapNoteIcon(p) {
  const sz = Math.max(9, Math.min(48, +p._size || 16)), c = p._color || '#dc2626';
  const txt = esc(String(p.name || '')).replace(/\n/g, '<br>');
  return L.divIcon({ className: 'mn-text', iconSize: null, iconAnchor: [0, sz * 0.6],
    html: `<div style="color:${c};font-size:${sz}px;font-weight:800;white-space:nowrap;line-height:1.15;text-shadow:-2px -2px 0 #fff,2px -2px 0 #fff,-2px 2px 0 #fff,2px 2px 0 #fff,0 0 4px #fff">${txt}</div>` });
}
async function _mnLayer() {
  let l = (layers || []).find(x => { const st = typeof kmlStyleOf === 'function' ? kmlStyleOf(x) : null; return st && st.notes; });
  if (l) return l;
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Заметки', color: '#dc2626', geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }) }) });
  const j = await r.json();
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  l = layers.find(x => x.id === j.id);
  if (l && typeof kmlSaveStyle === 'function') await kmlSaveStyle(l, { notes: true });
  try { renderLP(); } catch (e) {}
  return l;
}
async function _mnAdd(features) {
  const l = await _mnLayer(); if (!l) return;
  let gj; try { gj = JSON.parse(l.geojson); } catch (e) { gj = { type: 'FeatureCollection', features: [] }; }
  gj.features = (gj.features || []).concat(features);
  await _kmlSaveGeojson(l, gj);
  if (!l.visible) { l.visible = 1; }
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(l.id);
  renderLayerGroups();
}

function mapNotesOpen() {
  if (MN.mode) { mapNotesStop(); return; }
  MN.mode = 'idle';
  const bnr = document.getElementById('bnr');
  if (bnr) { bnr.className = 'show draw'; bnr.style.display = 'flex'; }
  _mnBar();
  const b = document.getElementById('tool-notes'); if (b) b.classList.add('on');
  map.on('click', _mnClick);
  map.on('mousemove', _mnMove);
  document.addEventListener('keydown', _mnKey, true);
}
function _mnBar() {
  const t = document.getElementById('bnr-t'); if (!t) return;
  const btn = (m, l) => `<button class="btn bsm" style="${MN.mode === m ? 'background:#fff;color:#111' : 'background:rgba(255,255,255,.15);color:#fff'};border:1px solid rgba(255,255,255,.4)" onclick="event.stopPropagation();_mnMode('${m}')">${l}</button>`;
  const hint = { idle: 'выберите инструмент', text: 'щёлкните, где поставить текст', arrow: MN.pts.length ? 'щёлкните, куда указывает стрелка' : 'щёлкните начало стрелки',
    callout: MN.pts.length ? 'щёлкните, где будет подпись' : 'щёлкните точку, к которой выноска' }[MN.mode] || '';
  t.innerHTML = `✏️ Заметки: ${btn('text', '🔤 Текст')} ${btn('arrow', '➡ Стрелка')} ${btn('callout', '💬 Выноска')}
    <input type="color" value="${MN.color}" title="Цвет" style="width:28px;height:22px;padding:0;border:none;vertical-align:middle" onclick="event.stopPropagation()" onchange="MN.color=this.value;_mnSave()">
    <select title="Размер текста" style="font-size:11px;padding:1px 2px" onclick="event.stopPropagation()" onchange="MN.size=+this.value;_mnSave()">${[12, 14, 16, 20, 24, 32].map(z => `<option ${MN.size === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
    <span style="opacity:.85">· ${hint} · Esc — выход</span>`;
  t.onclick = e => e.stopPropagation();
}
function _mnMode(m) { MN.mode = m; MN.pts = []; _mnTmpClear(); map.getContainer().style.cursor = 'crosshair'; _mnBar(); }
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
  if (!MN.mode || MN.mode === 'idle') return;
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
  if (e.key !== 'Escape' || !MN.mode || document.getElementById('mov')?.classList.contains('open')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (MN.pts.length) { MN.pts = []; _mnTmpClear(); _mnBar(); } else mapNotesStop();
}
function mapNotesStop() {
  MN.mode = null; MN.pts = []; _mnTmpClear();
  map.off('click', _mnClick); map.off('mousemove', _mnMove);
  document.removeEventListener('keydown', _mnKey, true);
  map.getContainer().style.cursor = '';
  const bnr = document.getElementById('bnr'); if (bnr) { bnr.className = ''; bnr.style.display = 'none'; }
  const b = document.getElementById('tool-notes'); if (b) b.classList.remove('on');
}
