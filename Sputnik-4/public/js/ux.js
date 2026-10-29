// ═══════════════════════════════════════════════════════════
// ux.js — удобство интерфейса:
//   • группы «🏔 Рельеф ▾» / «🧰 Инструменты ▾» на нижней панели карты;
//   • окна инструментов карты — сбоку, без размытия карты;
//   • значок связи с сервером в шапке (и плашка, если связи нет);
//   • «Закрыть без сохранения?» для окон с несохранёнными изменениями;
//   • ширина левой панели — перетаскиванием, сворачивание;
//   • заглушки-«скелетоны» при загрузке;
//   • режим «🖥 Показ заказчику».
// ═══════════════════════════════════════════════════════════

// ── Группы нижней панели ───────────────────────────────────
function mtbMenu(btn, g) {
  const pop = document.getElementById('mtb-pop'); if (!pop) return;
  if (pop.classList.contains('open') && pop.dataset.g === g) { mtbClose(); return; }
  pop.dataset.g = g;
  pop.querySelectorAll('.mtp-g').forEach(x => x.classList.toggle('on', x.dataset.g === g));
  pop.classList.add('open');
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  pop.style.top = Math.max(8, r.top - h - 8) + 'px';
  setTimeout(() => document.addEventListener('click', _mtbOutside, true), 0);
}
function mtbClose() { const pop = document.getElementById('mtb-pop'); if (pop) pop.classList.remove('open'); document.removeEventListener('click', _mtbOutside, true); }
function _mtbOutside(e) { if (!e.target.closest('#mtb-pop,#tool-grp-relief,#tool-grp-tools')) mtbClose(); }
// Кнопка группы подсвечена, если включён один из её инструментов
function _mtbSync() {
  [['tool-grp-relief', 'relief'], ['tool-grp-tools', 'tools']].forEach(([id, g]) => {
    const b = document.getElementById(id); if (!b) return;
    b.classList.toggle('on', !!document.querySelector(`#mtb-pop .mtp-g[data-g="${g}"] .mtp-i.on`));
  });
}
(function () {
  const go = () => {
    const pop = document.getElementById('mtb-pop'); if (!pop) return;
    new MutationObserver(_mtbSync).observe(pop, { subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') mtbClose(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ── Окна: сбоку у инструментов карты, «Закрыть без сохранения?», скелетоны ──
const UX_SIDE = /^(🏔 Выгрузка рельефа|🎨 Стиль слоя|🎨 Цвет для|📋 Объекты слоя|✏️ Редактировать —|📐 Замер|📏 Замер|↔ Шторка|🔤 Текст заметки|📌 |🔢 Метка|🏷 Переименовать \d)/;
const UX_SAVE = /Сохран|Применит|Добав|Создат|Записат|Готово|Засчитать|Изменить|Перенести/;
let _uxDirty = false;
(function () {
  if (typeof showModal !== 'function') return;
  const orig = showModal;
  window.showModal = showModal = function (title, body, buttons) {
    _uxDirty = false;
    // «Отмена»/«Закрыть» с несохранёнными изменениями — сначала спросить
    const btns = (buttons || []).map(b => /^(Отмена|Закрыть)$/.test(String(b.label || '').trim()) && typeof b.fn === 'function'
      ? { ...b, fn: () => modalUserClose(b.fn) } : b);
    const r = orig.call(this, title, body, btns);
    if (UX_SIDE.test(String(title || ''))) document.getElementById('mov').classList.add('side');
    return r;
  };
  const mark = e => { if (e.isTrusted && e.target.closest && e.target.closest('#mbd') && !e.target.closest('[data-nodirty]') && e.target.type !== 'search') _uxDirty = true; };
  document.addEventListener('input', mark, true);
  document.addEventListener('change', mark, true);
})();
function _uxHasSave() { return [...document.querySelectorAll('#mft .btn')].some(b => UX_SAVE.test(b.textContent)); }
// Закрытие окна пользователем (✕, Esc, «Отмена»): если есть несохранённое — спросить
async function modalUserClose(fn) {
  const mov = document.getElementById('mov');
  if (!mov || !mov.classList.contains('open')) { if (fn) fn(); return; }
  if (_uxDirty && _uxHasSave()) {
    if (!await confirmDlg('В окне есть несохранённые изменения.\nЗакрыть без сохранения?', { title: 'Несохранённые изменения', okLabel: 'Закрыть без сохранения', cancelLabel: 'Вернуться' })) return;
  }
  _uxDirty = false;
  if (fn) fn(); else closeModal();
}
// Заглушка загрузки: n серых полосок
function skel(n = 3, h = 14) {
  return `<div class="skel">${Array.from({ length: n }, (_, i) => `<div class="skel-l" style="height:${h}px;width:${[92, 78, 85, 64, 88][i % 5]}%"></div>`).join('')}</div>`;
}

// ── Связь с сервером ───────────────────────────────────────
// Значок в шапке: 🟢 на связи / 🔴 нет связи. Плашка — если связи нет дольше 5 с.
const NET = { ok: true, since: Date.now(), t: null };
function _netSet(ok) {
  if (ok === NET.ok) return;
  NET.ok = ok; NET.since = Date.now();
  const d = document.getElementById('net-dot');
  if (d) { d.className = ok ? 'on' : 'off'; d.title = ok ? 'Связь с сервером есть' : 'Нет связи с сервером — изменения не сохраняются'; }
  clearTimeout(NET.t);
  const bar = document.getElementById('net-bar');
  if (ok) { if (bar && bar.classList.contains('show')) { bar.classList.remove('show'); toast('🟢 Связь с сервером восстановлена', 'ok'); } }
  else NET.t = setTimeout(() => { if (!NET.ok && bar) bar.classList.add('show'); }, 5000);
}
async function _netPing() {
  try {
    const r = await fetch(`${API}/version`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    _netSet(r.ok);
  } catch (e) { _netSet(false); }
}
(function () {
  const go = () => {
    const logo = document.querySelector('.logo');
    if (logo && !document.getElementById('net-dot')) {
      const d = document.createElement('span'); d.id = 'net-dot'; d.className = 'on'; d.title = 'Связь с сервером есть';
      d.onclick = () => { _netPing(); toast(NET.ok ? '🟢 Связь с сервером есть' : '🔴 Нет связи с сервером', NET.ok ? 'ok' : 'err'); };
      logo.appendChild(d);
    }
    if (!document.getElementById('net-bar')) {
      const b = document.createElement('div'); b.id = 'net-bar';
      b.innerHTML = '🔴 Нет связи с сервером — изменения сейчас не сохраняются. Проверьте сеть и окно сервера. <button onclick="_netPing()">Проверить</button>';
      document.body.appendChild(b);
    }
    setInterval(_netPing, 15000);
    addEventListener('online', _netPing); addEventListener('offline', () => _netSet(false));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  // любой неудачный запрос к API — быстрая перепроверка
  const of = window.fetch;
  window.fetch = function (u, o) {
    const p = of.apply(this, arguments);
    if (typeof u === 'string' && u.includes('/api/')) p.then(r => { if (!NET.ok && r.ok) _netSet(true); }, () => _netPing());
    return p;
  };
})();

// ── Левая панель: ширина перетаскиванием, сворачивание ─────
// Свёрнутая панель — узкая полоска ⟩ у левого края (страницы сдвинуты на её ширину,
// поэтому полоска ничего не закрывает). Кнопка ⟨ «свернуть» — в шапке панели.
const SB_RAIL = 14;
function _sbApply(w, save) {
  const collapsed = w <= 0;
  document.documentElement.style.setProperty('--sw', (collapsed ? SB_RAIL : w) + 'px');
  document.body.classList.toggle('sb-collapsed', collapsed);
  if (save) try { localStorage.setItem('sb_width', String(w)); } catch (e) {}
  if (mapReady() && map.invalidateSize) { clearTimeout(_sbApply.t); _sbApply.t = setTimeout(() => map.invalidateSize(), 60); }
}
function sidebarToggle() {
  if (!document.body.classList.contains('sb-collapsed')) {
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sw')) || 260;
    try { localStorage.setItem('sb_width_open', String(cur)); } catch (e) {} _sbApply(0, true);
  } else { let w = 260; try { w = +localStorage.getItem('sb_width_open') || 260; } catch (e) {} _sbApply(w, true); }
}
(function () {
  const go = () => {
    const sb = document.getElementById('sidebar'); if (!sb) return;
    let w = null; try { w = localStorage.getItem('sb_width'); } catch (e) {}
    if (w != null && w !== '') _sbApply(+w, false);
    const h = document.createElement('div'); h.id = 'sb-handle'; h.title = 'Тяните — ширина панели; двойной щелчок — свернуть';
    const t = document.createElement('div'); t.id = 'sb-toggle'; t.title = 'Развернуть левую панель'; t.onclick = sidebarToggle;
    document.body.appendChild(h); document.body.appendChild(t);
    const btns = sb.querySelector('.sbh > div > div');
    if (btns) { const c = document.createElement('button'); c.id = 'sb-collapse'; c.className = 'btn bs bxs'; c.textContent = '⟨';
      c.title = 'Свернуть левую панель'; c.onclick = sidebarToggle; btns.appendChild(c); }
    h.addEventListener('dblclick', sidebarToggle);
    h.addEventListener('mousedown', e => {
      e.preventDefault(); document.body.classList.add('sb-resizing');
      const mv = ev => _sbApply(Math.max(180, Math.min(560, ev.clientX)), false);
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('sb-resizing');
        _sbApply(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sw')) || 260, true); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ── Режим «Показ заказчику» ────────────────────────────────
// Прячет панели и служебные кнопки; остаются карта, заметки, масштаб и штамп.
const PRES = { on: false, scale: null, stamp: null };
function presentToggle() { if (PRES.on) presentOff(); else presentOn(); }
function presentOn() {
  if (typeof switchView === 'function') switchView('map');
  if (typeof closeModal === 'function') closeModal();
  PRES.on = true; document.body.classList.add('present');
  PRES.sw = getComputedStyle(document.documentElement).getPropertyValue('--sw');
  document.documentElement.style.setProperty('--sw', '0px');
  if (!PRES.scale) PRES.scale = L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 160 });
  PRES.scale.addTo(map);
  PRES.stamp = L.control({ position: 'bottomright' });
  PRES.stamp.onAdd = () => {
    const d = L.DomUtil.create('div', 'pres-stamp');
    const obj = typeof currentType !== 'undefined' && currentType === 'site' && currentObj ? currentObj.name : '';
    d.innerHTML = `<b>ПурГеоКом</b>${obj ? `<div>${esc(obj)}</div>` : ''}<div style="color:#6b7280">${new Date().toLocaleDateString('ru-RU')}</div>`;
    return d;
  };
  PRES.stamp.addTo(map);
  const x = document.createElement('button'); x.id = 'pres-exit'; x.textContent = '✕ Выйти из показа (Esc)'; x.onclick = presentOff;
  document.body.appendChild(x);
  document.addEventListener('keydown', _presKey, true);
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  setTimeout(() => map.invalidateSize(), 200);
}
function presentOff() {
  if (!PRES.on) return;
  PRES.on = false; document.body.classList.remove('present');
  document.documentElement.style.setProperty('--sw', PRES.sw || '260px');
  if (PRES.scale) PRES.scale.remove();
  if (PRES.stamp) { PRES.stamp.remove(); PRES.stamp = null; }
  const x = document.getElementById('pres-exit'); if (x) x.remove();
  document.removeEventListener('keydown', _presKey, true);
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
  setTimeout(() => map.invalidateSize(), 200);
}
function _presKey(e) {
  if (e.key !== 'Escape' || document.getElementById('mov')?.classList.contains('open')) return;
  if (typeof MN !== 'undefined' && MN.mode) return;      // в заметках Esc — их выход
  e.preventDefault(); e.stopImmediatePropagation(); presentOff();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && PRES.on) { /* вышли из полноэкранного — режим показа остаётся */ } });

// ═══ Отмена правок слоёв (Ctrl+Z) ══════════════════════════════════════
// Любое сохранение геометрии/атрибутов слоя (PUT /api/layers/:id с geojson) запоминает
// прежнее состояние в общем стеке отмены (undoStack, Ctrl+Z → undoLast). Охватывает
// правку вершин, таблицу атрибутов, удаление/перенос объектов, «выполнено», заметки…
const _luBase = {};          // id слоя → последний известный серверный geojson
(function () {
  const of = window.fetch;
  window.fetch = async function (u, o) {
    const m = typeof u === 'string' && o && o.method === 'PUT' && typeof o.body === 'string' ? u.match(/\/api\/layers\/([^/?]+)$/) : null;
    if (!m || !o.body.includes('"geojson"') || (o.headers && o.headers['X-No-Undo'])) return of.apply(this, arguments);
    const id = decodeURIComponent(m[1]);
    let prev = _luBase[id];
    if (prev == null) { try { const r = await of(`${API}/layers/${encodeURIComponent(id)}`); if (r.ok) prev = (await r.json()).geojson; } catch (e) {} }
    const res = await of.apply(this, arguments);
    if (res.ok) {
      let body = null; try { body = JSON.parse(o.body); } catch (e) {}
      if (body && typeof body.geojson === 'string') {
        _luBase[id] = body.geojson;
        if (prev != null && prev !== body.geojson && typeof undoStack !== 'undefined') {
          undoStack.push({ label: `изменение слоя «${body.name || ''}»`, fn: () => _luRestore(id, { ...body, geojson: prev }) });
          if (undoStack.length > 50) undoStack.shift();
        }
      }
    }
    return res;
  };
})();
async function _luRestore(id, body) {
  const r = await fetch(`${API}/layers/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-No-Undo': '1' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('save');
  _luBase[id] = body.geojson;
  const l = (layers || []).find(x => x.id === id); if (l) l.geojson = body.geojson;
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(id);
  try { renderLayerGroups(); if (typeof kmlPanelOpen !== 'undefined' && kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  try { if (typeof KAT !== 'undefined' && KAT.layerId === id) _katRender(); } catch (e) {}
}

// ═══ Боковые окна: положение и «свернуть» сохраняются при обновлении окна ══
const _sideState = {};       // заголовок → {left, top, collapsed}
(function () {
  const prevShow = window.showModal;
  window.showModal = showModal = function (title, body, buttons) {
    const m = document.getElementById('modal'), mov = document.getElementById('mov');
    const cur = document.getElementById('mtit') ? document.getElementById('mtit').textContent : '';
    if (mov && mov.classList.contains('open') && mov.classList.contains('side') && cur && m.style.left)
      _sideState[cur] = { left: m.style.left, top: m.style.top, collapsed: m.classList.contains('mcol') };
    const r = prevShow.apply(this, arguments);
    m.classList.remove('mcol');
    // «свернуть» — только у боковых окон; для них же возвращаем прежнее место
    setTimeout(() => {
      const side = mov.classList.contains('side'), hd = document.querySelector('#modal .mhd');
      let b = document.getElementById('m-col');
      if (side && hd && !b) { b = document.createElement('button'); b.id = 'm-col'; b.className = 'ph-x'; b.title = 'Свернуть / развернуть окно'; b.textContent = '▁';
        b.onclick = e => { e.stopPropagation(); m.classList.toggle('mcol'); b.textContent = m.classList.contains('mcol') ? '▢' : '▁'; };
        hd.insertBefore(b, hd.querySelector('.ph-x')); }
      if (b) b.style.display = side ? '' : 'none';
      const st = side && _sideState[String(title)];
      if (st) { m.style.position = 'fixed'; m.style.left = st.left; m.style.top = st.top; m.style.transform = 'none'; m.style.margin = '0';
        if (st.collapsed) { m.classList.add('mcol'); if (b) b.textContent = '▢'; } }
    }, 0);
    return r;
  };
})();

// ═══ Перетащить файл на карту → импорт ═════════════════════════════════
(function () {
  const go = () => {
    const el = document.getElementById('map'); if (!el) return;
    let n = 0;
    const ok = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    el.addEventListener('dragenter', e => { if (!ok(e)) return; e.preventDefault(); n++; document.body.classList.add('drop-on'); });
    el.addEventListener('dragover', e => { if (ok(e)) e.preventDefault(); });
    el.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; document.body.classList.remove('drop-on'); } });
    el.addEventListener('drop', e => {
      if (!ok(e)) return;
      e.preventDefault(); n = 0; document.body.classList.remove('drop-on');
      const files = [...e.dataTransfer.files];
      const bad = files.filter(f => !/\.(kml|kmz|gpx|dxf|shp|dbf|prj|cpg|shx|csv|txt|xlsx|xls|tab|map|id|dat|zip|geojson|json)$/i.test(f.name));
      if (bad.length === files.length) { toast('Этот файл не импортируется в слои: ' + bad.map(f => f.name).join(', '), 'err'); return; }
      if (typeof importLayer === 'function') importLayer({ target: { files: files.filter(f => !bad.includes(f)), value: '' } });
    });
    const hint = document.createElement('div'); hint.id = 'drop-hint'; hint.innerHTML = '📥 Отпустите файл — импорт в слои<br><small>KML, SHP, DXF, CSV, Excel, MapInfo, GPX, ZIP</small>';
    document.body.appendChild(hint);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ═══ Длина и площадь у курсора при рисовании ═══════════════════════════
const _lm = { tip: null, raf: 0 };
function _lmState() {
  // [точки, это полигон?] для активного инструмента рисования
  if (typeof _kdActive !== 'undefined' && _kdActive) return [_kdPts, _kdActive === 'polygon'];
  if (typeof _demVertMode !== 'undefined' && _demVertMode && _demDrawing) return [_demVerts || [], _demVertMode === 'polygon'];
  if (typeof _ksActive !== 'undefined' && _ksActive) return [_ksPts, true];
  if (typeof _epActive !== 'undefined' && _epActive) return [_epPts, false];
  if (typeof FL !== 'undefined' && FL.axisDraw) return [_flAxPts || [], false];
  if (typeof drawMode !== 'undefined' && drawMode && typeof drawPts !== 'undefined') return [drawPts.map(p => Array.isArray(p) ? L.latLng(p[0], p[1]) : p), drawMode === 'polygon'];
  return null;
}
const _lmFmtL = m => m >= 1000 ? (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' км' : m.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' м';
const _lmFmtA = a => a >= 1e6 ? (a / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' км²' : a >= 1e4 ? (a / 1e4).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' га' : Math.round(a).toLocaleString('ru-RU') + ' м²';
function _lmMove(e) {
  const st = typeof uiSet === 'function' && !uiSet('liveMeasure') ? null : _lmState();
  if (!st || !st[0].length) { if (_lm.tip) { map.removeLayer(_lm.tip); _lm.tip = null; } return; }
  _lm.ll = e.latlng;                 // берём последнее положение курсора
  if (_lm.raf) return;
  _lm.raf = requestAnimationFrame(() => {
    _lm.raf = 0;
    const ll = _lm.ll, st2 = _lmState(); if (!st2 || !st2[0].length) return;
    const pts = st2[0].map(p => L.latLng(p.lat, p.lng)).concat([ll]);
    const D = (a, b) => typeof _geoDist === 'function' ? _geoDist(a, b) : map.distance(a, b);
    const seg = D(pts[pts.length - 2], ll);
    let len = 0; for (let i = 1; i < pts.length; i++) len += D(pts[i - 1], pts[i]);
    let html = `отрезок <b>${_lmFmtL(seg)}</b>`;
    if (pts.length > 2) html += `<br>всего ${_lmFmtL(len)}`;
    if (st2[1] && pts.length >= 3 && typeof _geoArea === 'function') html += `<br>площадь <b>${_lmFmtA(_geoArea(pts))}</b> · периметр ${_lmFmtL(len + D(ll, pts[0]))}`;
    if (!_lm.tip) _lm.tip = L.tooltip({ permanent: true, direction: 'right', offset: [16, 0], className: 'lm-tip', interactive: false }).setLatLng(ll).setContent(html).addTo(map);
    else _lm.tip.setLatLng(ll).setContent(html);
  });
}
(function () {
  const go = () => { if (!mapReady()) return setTimeout(go, 500); map.on('mousemove', _lmMove); map.on('mouseout', () => { if (_lm.tip) { map.removeLayer(_lm.tip); _lm.tip = null; } }); };
  setTimeout(go, 600);
})();

// ═══ Подписи без наложения ═════════════════════════════════════════════
// Постоянные подписи объектов (.mlbl) скрываются, если залезают на уже показанные;
// при приближении появляются снова.
function labelDeclutter() {
  const els = [...document.querySelectorAll('.leaflet-tooltip.mlbl.leaflet-tooltip-top, .leaflet-tooltip.mlbl')];
  if (els.length < 2 || (typeof uiSet === 'function' && !uiSet('declutter'))) { els.forEach(e => e.classList.remove('lbl-hide')); return; }
  els.forEach(e => e.classList.remove('lbl-hide'));
  const placed = [];
  for (const el of els) {
    if (el.style.visibility === 'hidden' || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    if (placed.some(p => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)) el.classList.add('lbl-hide');
    else placed.push(r);
  }
}
(function () {
  let t = null; const sched = () => { clearTimeout(t); t = setTimeout(labelDeclutter, 120); };
  const go = () => { if (!mapReady()) return setTimeout(go, 500); map.on('zoomend moveend layeradd', sched); };
  setTimeout(go, 600);
})();

// ═══ Кто сейчас редактирует ════════════════════════════════════════════
// Открыли на правку объект — сервер узнаёт об этом (ключ, имя), каждые 20 с
// подтверждаем. Если тот же объект открыт у другого человека — в окне жёлтая
// плашка «Сейчас это же редактирует: …»; придёт кто-то новый — сообщение.
const ED = { key: null, label: '', title: '', timer: null, others: [], where: 'modal' };
async function _edPost(action, key) {
  try {
    const r = await fetch(`${API}/editing`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action, cid: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : 'anon', name: typeof un === 'function' ? un() : '' }) });
    return r.ok ? r.json() : { others: [] };
  } catch (e) { return { others: [] }; }
}
async function editBegin(key, label, where) {
  if (ED.key === key) return;
  editEnd();
  ED.key = key; ED.label = label || ''; ED.where = where || 'modal'; ED.warned = false;
  ED.title = (document.getElementById('mtit') || {}).textContent || '';
  const j = await _edPost('begin', key);
  if (ED.key !== key) return;
  ED.others = j.others || []; _edShow();
  ED.timer = setInterval(() => { if (ED.key) _edPost('beat', ED.key).then(x => { ED.others = x.others || []; _edShow(); }); }, 20000);
}
function editEnd() {
  if (!ED.key) return;
  const k = ED.key; ED.key = null; ED.others = []; clearInterval(ED.timer); ED.timer = null;
  document.querySelectorAll('.ed-who').forEach(e => e.remove());
  _edPost('end', k);
}
function _edShow() {
  document.querySelectorAll('.ed-who').forEach(e => e.remove());
  if (!ED.key || !ED.others.length) return;
  const names = [...new Set(ED.others.map(o => o.name || 'Пользователь'))].join(', ');
  const d = document.createElement('div'); d.className = 'ed-who';
  d.innerHTML = `✋ Сейчас ${ED.label ? esc(ED.label) + ' ' : 'это же '}редактирует: <b>${esc(names)}</b> — сохраняйте по очереди, иначе последнее сохранение перезапишет чужие правки.`;
  if (ED.where === 'none') { if (!ED.warned) { ED.warned = true; toast(`✋ Этот объект сейчас редактирует: ${names}`, 'warn'); } return; }
  const host = ED.where === 'kat' ? document.querySelector('#kat-panel .kat-hd') : document.getElementById('mbd');
  if (host) { if (ED.where === 'kat') host.after(d); else host.prepend(d); }
}
function onEditingEvent(ev) {
  if (!ED.key || ev.key !== ED.key) return;
  const me = typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : 'anon';
  const others = (ev.who || []).filter(x => x.cid !== me);
  const newcomers = others.filter(x => !ED.others.some(o => o.cid === x.cid));
  ED.others = others; _edShow();
  if (newcomers.length) toast(`✋ ${newcomers.map(x => x.name).join(', ')} тоже открыл(а) ${ED.label || 'этот объект'} на правку`, 'warn');
}
// Ключи правки: оборачиваем функции открытия окон редактирования
(function () {
  const wrap = (name, keyOf, labelOf, where) => {
    const f = window[name]; if (typeof f !== 'function') return;
    window[name] = function () {
      const r = f.apply(this, arguments);
      const args = arguments;
      Promise.resolve(r).then(() => setTimeout(() => { const k = keyOf.apply(null, args); if (k) editBegin(k, labelOf ? labelOf.apply(null, args) : '', where); }, 50));
      return r;
    };
  };
  const lname = id => ((typeof layers !== 'undefined' ? layers : []).find(l => l.id === id) || {}).name || '';
  const go = () => {
    wrap('kmlOpenStyleModal', id => 'layer:' + id, id => `стиль слоя «${lname(id)}»`);
    wrap('kmlEditFeature', (lid, i) => `feat:${lid}:${i}`, (lid) => `объект слоя «${lname(lid)}»`);
    wrap('kmlAttrTable', id => 'layer:' + id, id => `слой «${lname(id)}»`, 'kat');
    wrap('kmlEditGeometry', (lid, i) => `feat:${lid}:${i}`, (lid) => `объект слоя «${lname(lid)}»`, 'none');
    wrap('pgkEditWorker', id => 'worker:' + id, () => 'этого сотрудника');
    wrap('pgkEditMach', id => 'mach:' + id, () => 'эту технику');
    wrap('pgkEditEquip', id => 'equip:' + id, () => 'это оборудование');
    wrap('openEditSiteModal', id => 'site:' + id, () => 'этот объект');
    wrap('openEditBaseModal', id => 'base:' + id, () => 'эту базу');
    // конец правки: закрыли окно / открыли другое / закрыли таблицу или редактор вершин
    const cm = window.closeModal;
    window.closeModal = closeModal = function () { if (ED.key && ED.where === 'modal') editEnd(); return cm.apply(this, arguments); };
    const sm = window.showModal;
    window.showModal = showModal = function (title) { if (ED.key && ED.where === 'modal' && String(title) !== ED.title) editEnd(); return sm.apply(this, arguments); };
    const ks = window._kgeStop;
    if (ks) window._kgeStop = _kgeStop = function () { if (ED.where === 'none') editEnd(); return ks.apply(this, arguments); };
    const kc = window.kmlAttrTableClose;
    if (kc) window.kmlAttrTableClose = kmlAttrTableClose = function () { if (ED.where === 'kat') editEnd(); return kc.apply(this, arguments); };
    addEventListener('beforeunload', () => { if (ED.key) navigator.sendBeacon && navigator.sendBeacon(`${API}/editing`, new Blob([JSON.stringify({ key: ED.key, action: 'end', cid: CLIENT_ID })], { type: 'application/json' })); });
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go);
})();
