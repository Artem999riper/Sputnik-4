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
  ['hoverHL', true, 'Подсветка объекта при наведении на строку', 'Таблица атрибутов, «Объекты слоя», поиск: навели на строку — объект обводится на карте', 'Карта'],
  ['totals', true, 'Итоги под таблицами', 'Под числовыми столбцами — сумма и среднее по показанным и выделенным строкам', 'Таблицы и окна'],
  ['compact', false, 'Компактные таблицы', 'Ниже строки — больше помещается на экран', 'Таблицы и окна'],
  ['zebra', false, 'Полосатые строки таблиц', 'Чередовать фон строк', 'Таблицы и окна'],
  ['nomotion', false, 'Без анимаций', 'Окна и панели появляются сразу', 'Таблицы и окна'],
];
const UIS = (() => { try { return JSON.parse(localStorage.getItem('ui_settings') || '{}') || {}; } catch (e) { return {}; } })();
// Общие настройки сервера (задаёт админ): { values, lock, version, by, at }.
// Порядок: запрещено менять → общее; иначе личное → общее → по умолчанию.
let UIS_SRV = (() => { try { return JSON.parse(localStorage.getItem('ui_srv') || 'null') || { values: {}, lock: false, version: 0 }; } catch (e) { return { values: {}, lock: false, version: 0 }; } })();
// запрет не действует на админа — он настраивает и применяет заново
const _uisLocked = k => !!(UIS_SRV.lock && k in UIS_SRV.values) && !(typeof isAdminClient === 'function' && isAdminClient());
function uiSet(k) {
  if (_uisLocked(k)) return UIS_SRV.values[k];
  if (k in UIS) return UIS[k];
  if (k in UIS_SRV.values) return UIS_SRV.values[k];
  const d = UIS_DEF.find(x => x[0] === k); return d ? d[1] : undefined;
}
function uiSetSave(k, v) {
  if (_uisLocked(k)) { toast('🔒 Эту настройку задал админ для всех', 'warn'); _uisRender(); return; }
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
  if (k === 'grid' && typeof mapGridRender === 'function') mapGridRender();
  if (k === 'hoverHL' && typeof _hvClear === 'function') _hvClear();
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
// подтянуть общие настройки с сервера; новая версия — личные сбрасываются на общие
async function uiServerLoad(live) {
  let j; try { j = await fetch(`${API}/ui-settings`).then(r => r.json()); } catch (e) { return; }
  if (!j || typeof j.version !== 'number') return;
  let seen = 0; try { seen = +localStorage.getItem('ui_srv_ver') || 0; } catch (e) {}
  const fresh = j.version > seen;
  UIS_SRV = { values: j.values || {}, lock: !!j.lock, version: j.version, by: j.by || '', at: j.at || '' };
  try { localStorage.setItem('ui_srv', JSON.stringify(UIS_SRV)); localStorage.setItem('ui_srv_ver', String(j.version)); } catch (e) {}
  if (fresh) {
    for (const k of Object.keys(UIS_SRV.values)) delete UIS[k];
    try { localStorage.setItem('ui_settings', JSON.stringify(UIS)); } catch (e) {}
    if ('mlbl' in UIS_SRV.values && typeof applyMlblSize === 'function') applyMlblSize(UIS_SRV.values.mlbl);
  }
  if (_uisLocked('mlbl') && typeof applyMlblSize === 'function') applyMlblSize(UIS_SRV.values.mlbl);
  _uisApply(); ['declutter', 'cluster', 'totals'].forEach(k => { try { _uisApply(k); } catch (e) {} });
  if (document.getElementById('settings-panel')?.style.display === 'block') _uisRender();
  if (live && fresh) toast(`⚙ ${UIS_SRV.by ? UIS_SRV.by + ' (админ)' : 'Админ'} обновил настройки интерфейса для всех`, 'ok');
}
async function uiServerApply() {
  const lock = !!document.getElementById('uis-lock')?.checked;
  const values = {};
  UIS_DEF.forEach(([k]) => { values[k] = uiSet(k); });
  values.theme = uiSet('theme') || 'light';
  values.grid = uiSet('grid') || 'none';
  try { values.mlbl = +localStorage.getItem('mlbl_size') || 13; } catch (e) { values.mlbl = 13; }
  const msg = lock ? 'Применить ваши настройки ко всем и запретить пользователям их менять?' : 'Применить ваши настройки ко всем? Личные настройки пользователей сбросятся на эти (потом каждый сможет поменять у себя).';
  if (!await confirmDlg(msg, { title: '⚙ Настройки для всех', okLabel: 'Применить ко всем', danger: false })) return;
  const r = await fetch(`${API}/ui-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values, lock }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || 'Ошибка', 'err'); return; }
  await uiServerLoad(false); toast('📢 Настройки применены ко всем', 'ok');
}
async function uiServerClear() {
  if (!await confirmDlg('Снять общие настройки? У каждого останутся его личные.', { title: '⚙ Настройки для всех', okLabel: 'Снять', danger: false })) return;
  const r = await fetch(`${API}/ui-settings`, { method: 'DELETE' });
  if (!r.ok) { toast('Только для админа', 'err'); return; }
  await uiServerLoad(false); toast('Общие настройки сняты', 'ok');
}
function _uisRender() {
  const p = document.getElementById('settings-panel'); if (!p) return;
  const mlbl = (() => { try { return localStorage.getItem('mlbl_size') || '13'; } catch (e) { return '13'; } })();
  const th = uiSet('theme') || 'light';
  let html = `<h4>Настройки интерфейса</h4><div class="sett-sec" style="border-top:none;margin-top:0;padding-top:0">Вид</div>
    <div class="sett-theme">${[['light', '☀️ Светлая'], ['dark', '🌙 Тёмная'], ['auto', '🖥 Как в системе']].map(([k, l]) =>
      `<button class="${th === k ? 'on' : ''}" ${_uisLocked('theme') ? 'disabled title="🔒 задано админом"' : ''} onclick="uiSetSave('theme','${k}');_uisRender()">${l}</button>`).join('')}</div>`, sec = 'Вид';
  const lk = k => _uisLocked(k) ? ' <span title="Задано админом для всех" style="font-size:10px">🔒</span>' : '';
  for (const [k, , l, hint, s] of UIS_DEF) {
    if (s !== sec) {
      sec = s; html += `<div class="sett-sec">${esc(s)}</div>`;
      if (s === 'Карта') html += `<div class="sett-row"><label>Размер подписей</label>
        <input type="range" id="mlbl-size-slider" min="9" max="22" value="${mlbl}" oninput="applyMlblSize(this.value)" style="width:90px" ${_uisLocked('mlbl') ? 'disabled' : ''}>
        <span id="mlbl-size-val">${mlbl}</span>px</div>
        <div class="sett-row"><label title="Подписанная сетка поверх карты; попадает и в «Снимок карты»">Сетка координат</label>
        <select onchange="uiSetSave('grid',this.value)" style="width:auto;font-size:11px" ${_uisLocked('grid') ? 'disabled' : ''}>${[['none', 'нет'], ['wgs', 'WGS-84 (°′″)'], ['msk', 'МСК (метры)']].map(([k, t]) => `<option value="${k}" ${(uiSet('grid') || 'none') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    }
    html += `<label class="sett-chk" title="${escAttr(hint)}"><input type="checkbox" ${uiSet(k) ? 'checked' : ''} ${_uisLocked(k) ? 'disabled' : ''} onchange="uiSetSave('${k}',this.checked)"> ${esc(l)}${lk(k)}</label>`;
  }
  const sv = UIS_SRV, has = Object.keys(sv.values || {}).length > 0;
  const when = sv.at ? new Date(sv.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  if (has) html += `<div class="uis-srv">${sv.lock ? '🔒' : '📢'} Общие настройки${sv.by ? ` от ${esc(sv.by)}` : ''}${when ? `, ${when}` : ''}${sv.lock ? ' — менять нельзя' : ' — у себя можно поменять'}</div>`;
  if (typeof isAdminClient === 'function' && isAdminClient()) html += `<div class="sett-sec">Для всех пользователей (админ)</div>
    <label class="sett-chk" title="Пользователи не смогут поменять эти настройки у себя"><input type="checkbox" id="uis-lock" ${sv.lock ? 'checked' : ''}> запретить пользователям менять</label>
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px">
      <button class="btn bp bsm" onclick="uiServerApply()" title="Тема, размер подписей и все галочки выше станут общими для сервера">📢 Применить мои настройки ко всем</button>
      ${has ? '<button class="btn bs bsm" onclick="uiServerClear()">✕ Снять общие настройки</button>' : ''}
    </div>`;
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
    uiServerLoad(false);
    const orig = window.toggleSettingsPanel;
    window.toggleSettingsPanel = toggleSettingsPanel = function () {
      _uisRender();
      return orig.apply(this, arguments);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
