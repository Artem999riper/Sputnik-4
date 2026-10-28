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
function _sbApply(w, save) {
  const collapsed = w <= 0;
  document.documentElement.style.setProperty('--sw', (collapsed ? 0 : w) + 'px');
  document.body.classList.toggle('sb-collapsed', collapsed);
  if (save) try { localStorage.setItem('sb_width', String(w)); } catch (e) {}
  if (window.map && map.invalidateSize) { clearTimeout(_sbApply.t); _sbApply.t = setTimeout(() => map.invalidateSize(), 60); }
}
function sidebarToggle() {
  const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sw')) || 0;
  if (cur > 0) { try { localStorage.setItem('sb_width_open', String(cur)); } catch (e) {} _sbApply(0, true); }
  else { let w = 260; try { w = +localStorage.getItem('sb_width_open') || 260; } catch (e) {} _sbApply(w, true); }
}
(function () {
  const go = () => {
    const sb = document.getElementById('sidebar'); if (!sb) return;
    let w = null; try { w = localStorage.getItem('sb_width'); } catch (e) {}
    if (w != null && w !== '') _sbApply(+w, false);
    const h = document.createElement('div'); h.id = 'sb-handle'; h.title = 'Тяните — ширина панели; двойной щелчок — свернуть';
    const t = document.createElement('button'); t.id = 'sb-toggle'; t.title = 'Свернуть / развернуть левую панель'; t.onclick = sidebarToggle;
    document.body.appendChild(h); document.body.appendChild(t);
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
// Прячет панели и служебные кнопки; остаются карта, заметки, легенда, масштаб и штамп.
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
  setTimeout(() => { map.invalidateSize(); if (typeof kmlRenderLegend === 'function') kmlRenderLegend(true); }, 200);
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
