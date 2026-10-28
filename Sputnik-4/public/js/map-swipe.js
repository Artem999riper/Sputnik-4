// ═══════════════════════════════════════════════════════════
// map-swipe.js — «шторка»: справа от линии — другая подложка (сравнить Esri и
// Google, старый и новый снимок, карту и спутник). Линию тянут мышью.
// ═══════════════════════════════════════════════════════════
const MSW = { on: false, layer: null, x: 0.5, name: '', div: null };
function mapSwipeOpen() {
  if (MSW.on) { mapSwipeClose(); return; }
  const names = Object.keys(window._mapBaseLayers || {});
  const cur = names.find(n => map.hasLayer(window._mapBaseLayers[n])) || '';
  const def = names.find(n => n !== cur && /Google/.test(n)) || names.find(n => n !== cur) || '';
  showModal('↔ Шторка: сравнить подложки', `<div style="font-size:12px;min-width:min(380px,86vw)">
    <div style="margin-bottom:6px">Слева — текущая подложка: <b>${esc(cur || '—')}</b></div>
    <div class="fg" style="margin:0"><label>Справа показать</label><select id="msw-r" style="width:100%">${names.filter(n => n !== cur).map(n => `<option ${n === def ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div style="font-size:11px;color:var(--tx3);margin-top:6px">Тяните вертикальную линию мышью. Повторное нажатие «↔ Шторка» или ✕ на линии — убрать.</div></div>`,
    [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '↔ Показать', cls: 'bp', fn: () => { const n = document.getElementById('msw-r').value; closeModal(); mapSwipeStart(n, cur); } }]);
}
function mapSwipeStart(rightName, leftName) {
  const src = (window._mapBaseLayers || {})[rightName]; if (!src) return;
  mapSwipeClose();
  if (!map.getPane('swipePane')) { map.createPane('swipePane'); map.getPane('swipePane').style.zIndex = 250; map.getPane('swipePane').style.pointerEvents = 'none'; }
  MSW.layer = L.tileLayer(src._url, { ...src.options, pane: 'swipePane' }).addTo(map);
  MSW.on = true; MSW.name = rightName;
  const d = document.createElement('div'); d.id = 'msw-bar';
  d.innerHTML = `<div class="msw-line"></div><div class="msw-knob" title="Тяните">↔</div>
    <div class="msw-lbl msw-l">${esc(leftName || '')}</div><div class="msw-lbl msw-r">${esc(rightName)}</div>
    <button class="msw-x" title="Убрать шторку" onclick="mapSwipeClose()">✕</button>`;
  map.getContainer().appendChild(d); MSW.div = d;
  L.DomEvent.disableClickPropagation(d);
  const drag = e => { const r = map.getContainer().getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; MSW.x = Math.max(0.02, Math.min(0.98, cx / r.width)); _mswUpdate(); e.preventDefault(); };
  const up = () => { document.removeEventListener('mousemove', drag); document.removeEventListener('mouseup', up); document.removeEventListener('touchmove', drag); document.removeEventListener('touchend', up); map.dragging.enable(); };
  const down = e => { map.dragging.disable(); document.addEventListener('mousemove', drag); document.addEventListener('mouseup', up); document.addEventListener('touchmove', drag, { passive: false }); document.addEventListener('touchend', up); e.preventDefault(); e.stopPropagation(); };
  d.querySelector('.msw-knob').addEventListener('mousedown', down); d.querySelector('.msw-line').addEventListener('mousedown', down);
  d.querySelector('.msw-knob').addEventListener('touchstart', down, { passive: false });
  map.on('move zoom resize', _mswUpdate);
  // смена основной подложки — обновить подпись слева
  map.on('baselayerchange', _mswBase);
  _mswUpdate();
  const b = document.getElementById('tool-swipe'); if (b) b.classList.add('on');
}
function _mswBase(e) { const l = MSW.div && MSW.div.querySelector('.msw-l'); if (l) l.textContent = e.name || ''; }
function _mswUpdate() {
  if (!MSW.on) return;
  const sz = map.getSize(), x = Math.round(sz.x * MSW.x);
  const nw = map.containerPointToLayerPoint([x, 0]), se = map.containerPointToLayerPoint([sz.x, sz.y]);
  map.getPane('swipePane').style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${nw.x}px)`;
  if (MSW.div) MSW.div.style.left = x + 'px';
}
function mapSwipeClose() {
  if (MSW.layer) { try { map.removeLayer(MSW.layer); } catch (e) {} MSW.layer = null; }
  if (MSW.div) { MSW.div.remove(); MSW.div = null; }
  if (MSW.on) { map.off('move zoom resize', _mswUpdate); map.off('baselayerchange', _mswBase); }
  MSW.on = false;
  const p = map && map.getPane('swipePane'); if (p) p.style.clip = '';
  const b = document.getElementById('tool-swipe'); if (b) b.classList.remove('on');
}
