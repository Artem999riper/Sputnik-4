// ═══════════════════════════════════════════════════════════
// ui-settings.js — панель «⚙ Настройки интерфейса» (кнопка в шапке).
// Значения хранятся в браузере (localStorage), у каждого пользователя свои.
// Другие модули спрашивают uiSet('ключ').
// ═══════════════════════════════════════════════════════════
const UIS_DEF = [
  // [ключ, по умолчанию, подпись, подсказка, раздел]
  ['dimMap', true, 'Приглушать подложку в тёмной теме', 'Спутник и схема чуть темнее, чтобы не слепили', 'Вид'],
  ['cluster', true, 'Группировать точки слоёв', 'В слоях от 200 точек при отдалении близкие точки собираются в кружок с числом', 'Карта'],
  ['declutter', true, 'Скрывать наложенные подписи', 'Подписи, которые залезают на соседние, прячутся до приближения', 'Карта'],
  ['liveMeasure', true, 'Длина и площадь у курсора при рисовании', 'Подсказка у курсора: отрезок, всего, площадь', 'Карта'],
  ['coords', true, 'Строка координат внизу карты', 'Координаты под курсором и масштаб', 'Карта'],
  ['minimap', true, 'Мини-карта обзора в углу', 'Уменьшенная карта с рамкой текущего вида; щелчок по ней — перейти', 'Карта'],
  ['hoverHL', true, 'Подсветка объекта при наведении на строку', 'Таблица атрибутов, «Объекты слоя», поиск: навели на строку — объект обводится на карте', 'Карта'],
  ['totals', true, 'Итоги под таблицами', 'Под числовыми столбцами — сумма и среднее по показанным и выделенным строкам', 'Таблицы и окна'],
  ['compact', false, 'Компактные таблицы', 'Ниже строки — больше помещается на экран', 'Таблицы и окна'],
  ['zebra', false, 'Полосатые строки таблиц', 'Чередовать фон строк', 'Таблицы и окна'],
  ['nomotion', false, 'Без анимаций', 'Окна и панели появляются сразу', 'Таблицы и окна'],
];
const UIS = (() => { try { return JSON.parse(localStorage.getItem('ui_settings') || '{}') || {}; } catch (e) { return {}; } })();
function uiSet(k) { if (k in UIS) return UIS[k]; const d = UIS_DEF.find(x => x[0] === k); return d ? d[1] : undefined; }
function uiSetSave(k, v) {
  UIS[k] = v;
  try { localStorage.setItem('ui_settings', JSON.stringify(UIS)); } catch (e) {}
  _uisApply(k);
}
function _uisApply(k) {
  const b = document.body; if (!b) return;
  if (!k || k === 'compact') b.classList.toggle('ui-compact', !!uiSet('compact'));
  if (!k || k === 'zebra') b.classList.toggle('ui-zebra', !!uiSet('zebra'));
  if (!k || k === 'nomotion') b.classList.toggle('ui-nomotion', !!uiSet('nomotion'));
  if (!k || k === 'coords') b.classList.toggle('ui-nocoords', !uiSet('coords'));
  if (!k || k === 'theme') _uisTheme();
  if (!k || k === 'dimMap') document.documentElement.classList.toggle('dim-map', !!uiSet('dimMap'));
  if (k === 'totals' && typeof TK !== 'undefined' && TK.totalsAll) TK.totalsAll();
  if (k === 'hoverHL' && typeof _hvClear === 'function') _hvClear();
  if (k === 'minimap' && typeof minimapOn === 'function') uiSet('minimap') ? minimapOn() : minimapOff();
  if (k === 'declutter' && typeof labelDeclutter === 'function') labelDeclutter();
  if (k === 'liveMeasure' && !uiSet('liveMeasure') && typeof _lm !== 'undefined' && _lm.tip) { map.removeLayer(_lm.tip); _lm.tip = null; }
  if (k === 'cluster' && typeof lGroups !== 'undefined') {
    for (const id in lGroups) {
      if (uiSet('cluster')) { const la = (layers || []).find(l => l.id === id); kmlCluster(id, lGroups[id], la && la.color); }
      else kmlClusterOff(id);
    }
  }
}
// тема: светлая / тёмная / как в системе
function _uisTheme() {
  let t = uiSet('theme') || 'light';
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (uiSet('theme') === 'auto') _uisTheme(); }); } catch (e) {}
function _uisRender() {
  const p = document.getElementById('settings-panel'); if (!p) return;
  const mlbl = (() => { try { return localStorage.getItem('mlbl_size') || '13'; } catch (e) { return '13'; } })();
  const th = uiSet('theme') || 'light';
  let html = `<h4>Настройки интерфейса</h4><div class="sett-sec" style="border-top:none;margin-top:0;padding-top:0">Вид</div>
    <div class="sett-theme">${[['light', '☀️ Светлая'], ['dark', '🌙 Тёмная'], ['auto', '🖥 Как в системе']].map(([k, l]) =>
      `<button class="${th === k ? 'on' : ''}" onclick="uiSetSave('theme','${k}');_uisRender()">${l}</button>`).join('')}</div>`, sec = 'Вид';
  for (const [k, , l, hint, s] of UIS_DEF) {
    if (s !== sec) {
      sec = s; html += `<div class="sett-sec">${esc(s)}</div>`;
      if (s === 'Карта') html += `<div class="sett-row"><label>Размер подписей</label>
        <input type="range" id="mlbl-size-slider" min="9" max="22" value="${mlbl}" oninput="applyMlblSize(this.value)" style="width:90px">
        <span id="mlbl-size-val">${mlbl}</span>px</div>`;
    }
    html += `<label class="sett-chk" title="${escAttr(hint)}"><input type="checkbox" ${uiSet(k) ? 'checked' : ''} onchange="uiSetSave('${k}',this.checked)"> ${esc(l)}</label>`;
  }
  html += `<div class="sett-sec">Сброс</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      <button class="btn bs bsm" onclick="uiResetPanels()" title="Ширина левой панели, положение и свёрнутость боковых окон">↺ Панели и окна — как было</button>
      <button class="btn bs bsm" onclick="uiResetTables()" title="Скрытые столбцы, ширина столбцов, фильтры по столбцам">↺ Столбцы таблиц — как было</button>
    </div>`;
  p.innerHTML = html;
}
function uiResetPanels() {
  try { ['sb_width', 'sb_width_open'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  if (typeof _sbApply === 'function') _sbApply(260, false);
  if (typeof _sideState !== 'undefined') for (const k in _sideState) delete _sideState[k];
  toast('Панели и окна — по умолчанию', 'ok');
}
function uiResetTables() {
  try { Object.keys(localStorage).filter(k => /^(cols_hidden_|colw_)/.test(k) || k === 'eq_hidden_cols').forEach(k => localStorage.removeItem(k)); } catch (e) {}
  if (typeof TK !== 'undefined') TK.cf = {};
  const v = document.querySelector('.nt.on')?.dataset.v;
  if (v && typeof switchView === 'function') try { switchView(v); } catch (e) {}
  toast('Столбцы таблиц — по умолчанию', 'ok');
}
// кнопка ⚙ — перерисовать панель при каждом открытии
(function () {
  const go = () => {
    _uisApply();
    const orig = window.toggleSettingsPanel;
    window.toggleSettingsPanel = toggleSettingsPanel = function () {
      _uisRender();
      return orig.apply(this, arguments);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
