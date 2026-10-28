// ═══════════════════════════════════════════════════════════
// tour.js — обучение для новых пользователей: пошаговые подсказки
// с подсветкой элементов. Показывается один раз (запоминается в браузере),
// повторно — кнопка «❓» в шапке или F1 → «Пройти обучение заново».
// ═══════════════════════════════════════════════════════════
const TOUR_KEY = 'tour_done_v2';
const TOUR_STEPS = [
  { sel: '.logo', title: '👋 Добро пожаловать в «Спутник»',
    text: 'Короткая экскурсия по главному — 10 шагов, около минуты. Её можно пропустить и пройти позже (кнопка ❓ вверху или клавиша F1).' },
  { sel: '.nt[data-v="map"]', view: 'map', title: '🗂 Вкладки',
    text: 'Все разделы программы — в верхнем меню. Быстрый переход: <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd>. Лишние вкладки администратор может скрыть.' },
  { sel: '#gsearch', view: 'map', title: '🔍 Глобальный поиск',
    text: 'Ищет объекты, базы, людей и технику. Понимает <b>координаты</b>: «61.25 73.4», «61°15\'00" 73°24\'», «983088 3572529», «мск86 …», «ск42 …» — карта перелетит к точке.' },
  { sel: '#map', view: 'map', title: '🗺 Карта: правая кнопка мыши',
    text: 'ПКМ по карте — метки, линии, полигоны, <b>линейка и замер площади</b>, отметка высоты, координаты точки во всех системах. ПКМ по объекту слоя — длина/площадь, редактирование, перенос.' },
  { sel: '#tool-kml', view: 'map', title: '🗂 Слои',
    text: 'Менеджер слоёв: импорт KML, GPX, DXF, MapInfo, CSV/TXT/Excel (с выбором системы координат), стили, подписи, экспорт.' },
  { sel: '#tool-grp-relief', view: 'map', title: '🏔 Рельеф и подложка',
    text: 'Выгрузка горизонталей ArcticDEM в DXF и спутниковой подложки GeoTIFF для AutoCAD — по прямоугольнику, полигону или коридору вдоль линии.' },
  { sel: '.nt[data-v="equipment"]', title: '📋 Таблицы',
    text: 'Во всех таблицах: <b>галочки</b>, Ctrl/Shift+клик, рамка мышью; <b>ПКМ по выделенным</b> — действие сразу для всех; Esc — снять выделение; ПКМ по заголовку — выбор столбцов; ширину столбцов можно тянуть; 📤 — экспорт всего / показанного / выделенного.' },
  { sel: '.nt[data-v="conv"]', title: '🧭 Пересчёт координат',
    text: 'WGS-84, ПЗ-90.11, ГСК-2011, СК-42, СК-95, МСК всех регионов, UTM — одна точка, «во всех системах» или список из Excel/файла с выгрузкой и сохранением слоем на карту.' },
  { sel: '#admin-btn', title: '🛡 Администрирование',
    text: 'Права пользователей, скрытие вкладок и <b>обновление программы</b>: перезапуск сервера, обновление из архива .zip или git, откат на прежнюю версию.' },
  { sel: '#tour-btn', title: '📖 Справка',
    text: 'Кнопка ❓ (или <kbd>F1</kbd>) — справка по каждой вкладке с кнопкой «▶ Показать на экране» и горячие клавиши. Удачной работы!' },
];
let _tourI = 0, _tourSteps = TOUR_STEPS, _tourOnEnd = null;
function tourStart(force) {
  if (!force) { try { if (localStorage.getItem(TOUR_KEY)) return; } catch (e) { return; } }
  tourRun(TOUR_STEPS);
}
// Показать произвольный набор шагов: [{sel, view?, act?, title, text}] — act() выполняется
// перед подсветкой (например, открыть окно «Рельеф»), чтобы показать элемент внутри него.
function tourRun(steps, onEnd) {
  _tourSteps = steps; _tourOnEnd = onEnd || null; _tourI = 0; _tourShow();
}
function tourEnd() {
  if (_tourSteps === TOUR_STEPS) { try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {} }
  const cb = _tourOnEnd; _tourOnEnd = null;
  document.getElementById('tour-hl')?.remove(); document.getElementById('tour-box')?.remove();
  document.removeEventListener('keydown', _tourKey, true);
  if (cb) try { cb(); } catch (e) {}
}
function _tourKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); tourEnd(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); _tourGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); _tourGo(-1); }
}
function _tourGo(d) {
  _tourI += d;
  if (_tourI >= _tourSteps.length) { const main = _tourSteps === TOUR_STEPS; tourEnd(); if (main) toast('Обучение пройдено. ❓ — справка и горячие клавиши', 'ok'); return; }
  if (_tourI < 0) _tourI = 0;
  _tourShow();
}
function _tourShow() {
  const st = _tourSteps[_tourI];
  if (st.view && typeof switchView === 'function' && document.querySelector('.nt.on')?.dataset.v !== st.view) switchView(st.view);
  if (st.act) { try { st.act(); } catch (e) {} }
  setTimeout(() => {
    const el = document.querySelector(st.sel);
    // элемент скрыт (вкладка выключена админом) — пропускаем шаг
    const vis = el && (() => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })();
    if (!vis) { if (_tourI < _tourSteps.length - 1) { _tourI++; _tourShow(); } else tourEnd(); return; }
    let hl = document.getElementById('tour-hl'), box = document.getElementById('tour-box');
    if (!hl) {
      hl = document.createElement('div'); hl.id = 'tour-hl';
      hl.style.cssText = 'position:fixed;z-index:10001;border-radius:8px;box-shadow:0 0 0 3px var(--acc),0 0 0 9999px rgba(15,23,42,.55);pointer-events:none;transition:all .25s';
      document.body.appendChild(hl);
      box = document.createElement('div'); box.id = 'tour-box';
      box.style.cssText = 'position:fixed;z-index:10002;width:340px;max-width:calc(100vw - 24px);background:var(--s);color:var(--tx);border:1.5px solid var(--acc);border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.3);padding:14px 16px;font-size:12px;line-height:1.55;transition:top .25s,left .25s';
      document.body.appendChild(box);
      document.addEventListener('keydown', _tourKey, true);
    }
    { const r0 = el.getBoundingClientRect();   // элемент за краем окна/прокрутки — показать его
      if (r0.width < window.innerWidth * 0.6 && (r0.top < 60 || r0.bottom > window.innerHeight - 20)) el.scrollIntoView({ block: 'center' }); }
    const r = el.getBoundingClientRect(), pad = 4;
    const big = r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.5;   // карта — подсвечиваем рамкой внутри
    Object.assign(hl.style, big
      ? { left: r.left + 40 + 'px', top: r.top + 40 + 'px', width: r.width - 80 + 'px', height: r.height - 80 + 'px' }
      : { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    box.innerHTML = `<style>#tour-box kbd{display:inline-block;padding:0 5px;border:1px solid var(--bd);border-bottom-width:2px;border-radius:4px;background:var(--s2);font:700 10px monospace}</style>
      <div style="font-size:13px;font-weight:800;margin-bottom:6px">${st.title}</div>
      <div>${st.text}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:12px">
        <span style="font-size:10px;color:var(--tx3)">${_tourI + 1} / ${_tourSteps.length}</span>
        <span style="flex:1"></span>
        <button class="btn bs bsm" onclick="tourEnd()">Пропустить</button>
        ${_tourI ? '<button class="btn bs bsm" onclick="_tourGo(-1)">← Назад</button>' : ''}
        <button class="btn bp bsm" onclick="_tourGo(1)">${_tourI === _tourSteps.length - 1 ? 'Готово' : 'Далее →'}</button>
      </div>`;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let left, top;
    if (big) { left = r.left + r.width / 2 - bw / 2; top = r.top + r.height / 2 - bh / 2; }
    else {
      left = Math.min(Math.max(12, r.left), window.innerWidth - bw - 12);
      top = r.bottom + 12 + bh < window.innerHeight ? r.bottom + 12 : Math.max(12, r.top - bh - 12);
    }
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }, st.wait || (st.act ? 450 : st.view ? 250 : 30));
}
// Автозапуска нет: обучение открывается только кнопкой «Пройти обучение» в справке (❓ / F1).
