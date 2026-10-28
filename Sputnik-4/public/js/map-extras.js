// ═══════════════════════════════════════════════════════════
// map-extras.js — закладки видов карты, подсветка объекта при наведении
// на строку, мини-карта обзора, запрос по атрибутам слоя.
// ═══════════════════════════════════════════════════════════

// ═══ 🔖 Закладки видов карты (общие для всех) ══════════════════════════
const BM = { list: [] };
async function bookmarksLoad() { try { BM.list = await fetch(`${API}/bookmarks`).then(r => r.json()); } catch (e) {} return BM.list; }
function bookmarkGo(id) {
  const b = BM.list.find(x => x.id === id); if (!b) return;
  map.flyTo([b.lat, b.lng], b.zoom, { duration: 0.7 });
}
async function bookmarksOpen(ev) {
  await bookmarksLoad();
  document.getElementById('bm-pop')?.remove();
  const box = document.createElement('div'); box.id = 'bm-pop';
  box.innerHTML = `<div class="bm-hd">🔖 Закладки карты <small>общие для всех</small><button onclick="document.getElementById('bm-pop').remove()">✕</button></div>
    <div class="bm-list">${BM.list.length ? BM.list.map((b, i) => `<div class="bm-row" data-id="${escAttr(b.id)}">
      <span class="bm-go" onclick="bookmarkGo('${escAttr(b.id)}')" title="${escAttr(`масштаб ${Math.round(b.zoom)}${b.created_by ? ' · ' + b.created_by : ''}`)}">${i < 9 ? `<kbd>Alt+Shift+${i + 1}</kbd>` : ''}${esc(b.name)}</span>
      <button title="Запомнить сюда текущий вид" onclick="bookmarkUpdate('${escAttr(b.id)}')">⟳</button>
      <button title="Переименовать" onclick="bookmarkRename('${escAttr(b.id)}')">✏</button>
      <button title="Удалить" onclick="bookmarkDel('${escAttr(b.id)}')">🗑</button></div>`).join('') : '<div class="bm-empty">Пока нет закладок</div>'}</div>
    <button class="btn bp bsm" style="width:100%;justify-content:center" onclick="bookmarkAdd()">＋ Запомнить этот вид</button>`;
  document.body.appendChild(box);
  const out = e => { if (!box.contains(e.target) && !e.target.closest('.bm-btn,#tool-bm')) { box.remove(); document.removeEventListener('mousedown', out, true); } };
  setTimeout(() => document.addEventListener('mousedown', out, true), 0);
}
async function bookmarkAdd() {
  const name = (prompt('Название закладки (например «Карьер 1Г», «Весь участок»):') || '').trim(); if (!name) return;
  const c = map.getCenter();
  await fetch(`${API}/bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, lat: c.lat, lng: c.lng, zoom: map.getZoom(), user_name: un() }) });
  toast(`🔖 «${name}» сохранена`, 'ok'); bookmarksOpen();
}
async function bookmarkUpdate(id) {
  const c = map.getCenter();
  await fetch(`${API}/bookmarks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }) });
  toast('Вид закладки обновлён', 'ok'); bookmarksOpen();
}
async function bookmarkRename(id) {
  const b = BM.list.find(x => x.id === id); if (!b) return;
  const name = (prompt('Новое название:', b.name) || '').trim(); if (!name || name === b.name) return;
  await fetch(`${API}/bookmarks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  bookmarksOpen();
}
async function bookmarkDel(id) {
  const b = BM.list.find(x => x.id === id); if (!b) return;
  await fetch(`${API}/bookmarks/${id}`, { method: 'DELETE' });
  bookmarksOpen();
  TK.undoBar(`Закладка «${b.name}» удалена`, async () => {
    await fetch(`${API}/bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); bookmarksLoad();
  });
}
// Alt+Shift+1…9 — перейти к закладке (Alt+цифра — вкладки)
document.addEventListener('keydown', e => {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || !/^Digit[1-9]$/.test(e.code)) return;
  if (!document.getElementById('map') || document.querySelector('.nt.on')?.dataset.v !== 'map') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const go = () => { const b = BM.list[+e.code.slice(5) - 1]; if (b) { bookmarkGo(b.id); toast('🔖 ' + b.name, 'ok'); } };
  if (BM.list.length) go(); else bookmarksLoad().then(go);
}, true);
(function () {
  const go = () => {
    if (!window.map) return setTimeout(go, 400);
    const C = L.Control.extend({ options: { position: 'topright' }, onAdd() {
      const d = L.DomUtil.create('div', 'leaflet-bar bm-btn');
      d.innerHTML = '<a href="#" title="Закладки видов карты (Alt+Shift+1…9)">🔖</a>';
      L.DomEvent.disableClickPropagation(d);
      d.querySelector('a').onclick = e => { e.preventDefault(); document.getElementById('bm-pop') ? document.getElementById('bm-pop').remove() : bookmarksOpen(); };
      return d; } });
    new C().addTo(map);
    bookmarksLoad();
  };
  setTimeout(go, 700);
})();

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

// ═══ Мини-карта обзора ═════════════════════════════════════════════════
// В углу — уменьшенная карта с рамкой текущего вида: щелчок или перетаскивание
// рамки двигает основную карту. Подложка — та же, что на карте.
const MM = { ctl: null, map: null, rect: null, tiles: null, busy: false, small: false };
function minimapOn() {
  if (MM.ctl || !window.map) return;
  try { MM.small = localStorage.getItem('minimap_small') === '1'; } catch (e) {}
  const C = L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
    const d = L.DomUtil.create('div', 'mm-box' + (MM.small ? ' small' : ''));
    d.innerHTML = '<div class="mm-map"></div><button class="mm-tg" title="Свернуть / развернуть мини-карту">▾</button>';
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    return d; } });
  MM.ctl = new C().addTo(map);
  const box = MM.ctl.getContainer(), el = box.querySelector('.mm-map');
  box.querySelector('.mm-tg').onclick = () => { MM.small = !MM.small; box.classList.toggle('small', MM.small); try { localStorage.setItem('minimap_small', MM.small ? '1' : '0'); } catch (e) {} setTimeout(() => { MM.map.invalidateSize(); _mmSync(); }, 50); };
  MM.map = L.map(el, { attributionControl: false, zoomControl: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, inertia: false });
  _mmTiles();
  MM.rect = L.rectangle(map.getBounds(), { color: '#ef4444', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(MM.map);
  MM.map.on('click', e => map.panTo(e.latlng));
  MM.map.on('dragend', () => { MM.busy = true; map.panTo(MM.map.getCenter()); setTimeout(() => { MM.busy = false; }, 400); });
  MM.map.on('drag', () => { const c = MM.map.getCenter(), b = map.getBounds(), dl = c.lat - b.getCenter().lat, dn = c.lng - b.getCenter().lng;
    MM.rect.setBounds([[b.getSouth() + dl, b.getWest() + dn], [b.getNorth() + dl, b.getEast() + dn]]); });
  map.on('move zoomend', _mmSync); map.on('baselayerchange', _mmTiles);
  _mmSync();
}
function minimapOff() {
  if (!MM.ctl) return;
  map.off('move zoomend', _mmSync); map.off('baselayerchange', _mmTiles);
  try { MM.map.remove(); } catch (e) {} MM.ctl.remove();
  MM.ctl = MM.map = MM.rect = MM.tiles = null;
}
function _mmTiles() {
  if (!MM.map) return;
  const base = Object.values(window._mapBaseLayers || {}).find(l => map.hasLayer(l)) || Object.values(window._mapBaseLayers || {})[0];
  if (MM.tiles) MM.map.removeLayer(MM.tiles);
  if (base && base._url) MM.tiles = L.tileLayer(base._url, Object.assign({}, base.options, { attribution: '' })).addTo(MM.map);
}
function _mmSync() {
  if (!MM.map || MM.busy) return;
  const z = Math.max(0, map.getZoom() - (MM.small ? 6 : 5));
  MM.map.setView(map.getCenter(), z, { animate: false });
  MM.rect.setBounds(map.getBounds());
}
(function () {
  const go = () => { if (!window.map) return setTimeout(go, 400); if (typeof uiSet !== 'function' || uiSet('minimap')) minimapOn(); };
  setTimeout(go, 900);
})();

// ═══ 🔎 Запрос по атрибутам ════════════════════════════════════════════
// «глубина > 5 И статус = выполнено»: найденное — оранжевым на карте,
// можно открыть в таблице атрибутов, приблизить, сохранить новым слоем.
const AQ = { layerId: null, conds: [{ f: '', op: '=', v: '' }], any: false, res: null, prev: null };
const AQ_OPS = [['=', '='], ['!=', '≠'], ['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤'], ['~', 'содержит'], ['!~', 'не содержит'], ['^', 'начинается с'], ['empty', 'пусто'], ['nempty', 'не пусто']];
function attrQueryOpen(layerId) {
  const l = (layers || []).find(x => x.id === (layerId || AQ.layerId)) || (layers || [])[0];
  if (!l) { toast('Нет слоёв', 'warn'); return; }
  if (AQ.layerId !== l.id) { AQ.layerId = l.id; AQ.conds = [{ f: '', op: '=', v: '' }]; AQ.res = null; _aqClear(); }
  const feats = _kaFeatsCached(l), fields = kmlFields(l, feats);
  const fopt = cur => `<option value="">— поле —</option>${fields.map(k => `<option ${k === cur ? 'selected' : ''}>${esc(k)}</option>`).join('')}
    <option value="#area" ${cur === '#area' ? 'selected' : ''}>⬡ Площадь, м²</option><option value="#len" ${cur === '#len' ? 'selected' : ''}>〰 Длина, м</option>
    <option value="#type" ${cur === '#type' ? 'selected' : ''}>Тип геометрии</option><option value="#done" ${cur === '#done' ? 'selected' : ''}>✅ Выполнено (да/нет)</option>`;
  const vals = k => { if (!k || k.startsWith('#')) return k === '#type' ? ['Point', 'LineString', 'Polygon'] : k === '#done' ? ['да', 'нет'] : [];
    const s = new Set(); for (const f of feats) { const v = (f.properties || {})[k]; if (v != null && v !== '') s.add(String(v)); if (s.size > 200) break; } return [...s].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })); };
  showModal('🔎 Запрос по атрибутам', `<div style="min-width:min(520px,88vw);display:flex;flex-direction:column;gap:8px;font-size:12px">
    <div class="fg" style="margin:0"><label>Слой</label><select id="aq-l" onchange="attrQueryOpen(this.value)">${layers.map(x => `<option value="${escAttr(x.id)}" ${x.id === l.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:10px;align-items:center">Условия выполняются:
      <label style="display:flex;gap:4px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="radio" name="aq-any" ${AQ.any ? '' : 'checked'} onchange="AQ.any=false" style="width:auto;margin:0"> все (И)</label>
      <label style="display:flex;gap:4px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="radio" name="aq-any" ${AQ.any ? 'checked' : ''} onchange="AQ.any=true" style="width:auto;margin:0"> любое (ИЛИ)</label></div>
    ${AQ.conds.map((c, i) => `<div class="aq-row">
      <select onchange="AQ.conds[${i}].f=this.value;attrQueryOpen()">${fopt(c.f)}</select>
      <select onchange="AQ.conds[${i}].op=this.value;attrQueryOpen()" style="max-width:120px">${AQ_OPS.map(([k, t]) => `<option value="${k}" ${c.op === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${/empty/.test(c.op) ? '<span style="flex:1"></span>' : `<input list="aq-dl${i}" value="${escAttr(c.v)}" oninput="AQ.conds[${i}].v=this.value" onkeydown="if(event.key==='Enter')attrQueryRun()" placeholder="значение" style="flex:1;min-width:80px">
        <datalist id="aq-dl${i}">${vals(c.f).map(v => `<option value="${escAttr(v)}">`).join('')}</datalist>`}
      ${AQ.conds.length > 1 ? `<button class="btn bs bxs" onclick="AQ.conds.splice(${i},1);attrQueryOpen()" title="Убрать условие">✕</button>` : ''}</div>`).join('')}
    <div><button class="btn bs bxs" onclick="AQ.conds.push({f:'',op:'=',v:''});attrQueryOpen()">＋ Условие</button></div>
    <div id="aq-st" style="min-height:16px">${AQ.res ? _aqStat() : ''}</div></div>`, [
    { label: 'Закрыть', cls: 'bs', fn: () => { _aqClear(); closeModal(); } },
    { label: '📋 В таблице', cls: 'bs', fn: attrQueryTable },
    { label: '💾 Новым слоем', cls: 'bs', fn: attrQuerySave },
    { label: '▶ Найти', cls: 'bp', fn: attrQueryRun },
  ]);
  document.getElementById('mov').classList.add('side');
}
function _aqVal(f, k) {
  if (k === '#area') { const g = f.geometry; return g && /Polygon/.test(g.type) ? _katSize(f).v : null; }
  if (k === '#len') { const g = f.geometry; return g && /LineString/.test(g.type) ? _katSize(f).v : null; }
  if (k === '#type') return f.geometry ? f.geometry.type.replace(/^Multi/, '') : '';
  if (k === '#done') return (f.properties || {})._done ? 'да' : 'нет';
  return (f.properties || {})[k];
}
function _aqTest(f, c) {
  const raw = _aqVal(f, c.f), s = raw == null ? '' : String(raw).trim(), v = String(c.v || '').trim();
  const sl = s.toLowerCase(), vl = v.toLowerCase();
  const n = _kaNum(s), nv = _kaNum(v), num = Number.isFinite(n) && Number.isFinite(nv);
  switch (c.op) {
    case 'empty': return s === '';
    case 'nempty': return s !== '';
    case '=': return num ? n === nv : sl === vl;
    case '!=': return num ? n !== nv : sl !== vl;
    case '>': return num ? n > nv : s !== '' && sl.localeCompare(vl, 'ru', { numeric: true }) > 0;
    case '>=': return num ? n >= nv : s !== '' && sl.localeCompare(vl, 'ru', { numeric: true }) >= 0;
    case '<': return num ? n < nv : s !== '' && sl.localeCompare(vl, 'ru', { numeric: true }) < 0;
    case '<=': return num ? n <= nv : s !== '' && sl.localeCompare(vl, 'ru', { numeric: true }) <= 0;
    case '~': return sl.includes(vl);
    case '!~': return !sl.includes(vl);
    case '^': return sl.startsWith(vl);
  }
  return false;
}
function attrQueryRun() {
  const l = (layers || []).find(x => x.id === AQ.layerId); if (!l) return;
  const conds = AQ.conds.filter(c => c.f && (/empty/.test(c.op) || String(c.v).trim() !== ''));
  if (!conds.length) { toast('Задайте хотя бы одно условие', 'warn'); return; }
  const feats = _kaFeatsCached(l);
  const idx = [];
  feats.forEach((f, i) => { const ok = AQ.any ? conds.some(c => _aqTest(f, c)) : conds.every(c => _aqTest(f, c)); if (ok) idx.push(i); });
  AQ.res = { idx, total: feats.length, layerId: l.id };
  _aqClear(true);
  AQ.prev = L.geoJSON({ type: 'FeatureCollection', features: idx.map(i => feats[i]).filter(f => f && f.geometry) }, { interactive: false,
    style: { color: '#f97316', weight: 4, fillColor: '#f97316', fillOpacity: 0.3 },
    pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 8, color: '#f97316', weight: 3, fillOpacity: 0.5, interactive: false }) }).addTo(map);
  const st = document.getElementById('aq-st'); if (st) st.innerHTML = _aqStat();
  if (idx.length) attrQueryZoom();
}
function _aqStat() {
  const r = AQ.res; if (!r) return '';
  return r.idx.length ? `✅ Найдено <b>${r.idx.length}</b> из ${r.total} — на карте оранжевым. <a href="#" onclick="event.preventDefault();attrQueryZoom()">приблизить</a>` : '⚠️ Ничего не найдено';
}
function attrQueryZoom() { try { const b = AQ.prev.getBounds(); if (b.isValid()) map.flyToBounds(b, { padding: [40, 40], maxZoom: 17, duration: 0.6 }); } catch (e) {} }
function _aqClear(keep) { if (AQ.prev) { try { map.removeLayer(AQ.prev); } catch (e) {} AQ.prev = null; } if (!keep) AQ.res = null; }
function attrQueryTable() {
  if (!AQ.res) attrQueryRun(); if (!AQ.res || !AQ.res.idx.length) return;
  kmlAttrTable(AQ.res.layerId);
  KAT.only = new Set(AQ.res.idx); _katRender();
}
async function attrQuerySave() {
  if (!AQ.res) attrQueryRun(); if (!AQ.res || !AQ.res.idx.length) { toast('Нечего сохранять', 'warn'); return; }
  const l = layers.find(x => x.id === AQ.res.layerId); const feats = _kaFeatsCached(l);
  const name = (prompt('Название нового слоя:', `${l.name} — отбор`) || '').trim(); if (!name) return;
  const r = await fetch(`${API}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color: '#f97316', geojson: JSON.stringify({ type: 'FeatureCollection', features: AQ.res.idx.map(i => feats[i]) }) }) });
  if (!r.ok) { toast('Ошибка сохранения', 'err'); return; }
  _aqClear(); closeModal();
  layers = await fetch(`${API}/layers`).then(x => x.json()).catch(() => layers);
  try { renderLP(); renderLayerGroups(); if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  toast(`💾 Слой «${name}» создан (${AQ.res ? AQ.res.idx.length : ''})`, 'ok');
}
