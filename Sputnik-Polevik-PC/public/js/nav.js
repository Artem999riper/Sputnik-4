// Навигация по «экранам» с поддержкой sidebar

const SCREENS = {
  home:         { title: '🛰️ Спутник-Полевик', render: () => renderHome() },
  refs:         { title: 'Справочники', render: () => renderRefs() },
  brigade:      { title: 'Бригада', render: () => renderBrigade() },
  sites:        { title: 'Объекты', render: () => renderSites() },
  volumes:      { title: 'Объёмы', render: ({ siteId }) => renderVolumes(siteId) },
  boreholes:    { title: 'Скважины', render: ({ volumeId }) => renderBoreholes(volumeId) },
  task_points:  { title: 'Точки задач', render: ({ volumeId }) => renderTaskPoints(volumeId) },
  borehole_edit:{ title: 'Скважина', render: ({ uuid, volumeId }) => renderBoreholeEdit(uuid, volumeId) },
  export:       { title: 'Экспорт .spk', render: () => renderExport() },
  vedomost:     { title: 'Ведомости Excel', render: () => renderVedomost() },
  summary:      { title: 'Сводка', render: () => renderSummary() },
};

// Группировка экранов → nav-item [data-screen]
const SCREEN_NAV_GROUP = {
  home: 'home',
  refs: 'refs',
  brigade: 'brigade',
  sites: 'sites', volumes: 'sites', boreholes: 'sites', task_points: 'sites', borehole_edit: 'sites',
  export: 'export',
  vedomost: 'vedomost',
  summary: 'summary',
};

// Экраны, которые являются «листьями» навигации (показывают кнопку Назад)
const DRILLDOWN_SCREENS = new Set(['volumes', 'boreholes', 'task_points', 'borehole_edit']);

window.nav = function (key, params = {}, opts = {}) {
  const s = SCREENS[key];
  if (!s) { console.error('Unknown screen', key); return; }
  if (!opts.replace) state.history.push({ key, params });
  document.getElementById('page-title').innerHTML = s.title;
  document.getElementById('page-subtitle').innerHTML = '';
  document.getElementById('page-actions').innerHTML = '';
  document.getElementById('screen').innerHTML = '<div class="empty">Загрузка…</div>';

  // Показываем кнопку Назад только при drill-down навигации
  const back = document.querySelector('.back-btn');
  const showBack = state.history.length > 1 && DRILLDOWN_SCREENS.has(key);
  back.style.visibility = showBack ? 'visible' : 'hidden';

  // Подсвечиваем активный пункт sidebar
  const group = SCREEN_NAV_GROUP[key] || '';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === group);
  });

  Promise.resolve(s.render(params)).catch(e => {
    document.getElementById('screen').innerHTML = `<div class="empty" style="color:var(--error)">Ошибка: ${esc(e.message)}</div>`;
  });
};

window.navBack = function () {
  if (state.history.length > 1) {
    state.history.pop();
    const prev = state.history.pop();
    nav(prev.key, prev.params);
  }
};

window.setSubtitle = function (s) { document.getElementById('page-subtitle').textContent = s || ''; };
window.setPageActions = function (html) { document.getElementById('page-actions').innerHTML = html; };

// Обновляем виджет бригады в sidebar
window.updateSidebarBrigade = async function () {
  const el = document.getElementById('sidebar-brigade-info');
  if (!el) return;
  try {
    const b = await api('/brigade/current');
    if (!b) { el.textContent = 'не задана'; return; }
    const tName = b.transport?.name || '';
    const tPlate = b.transport?.plate || '';
    const memberNames = b.members?.map(m => m.name).join(', ') || '—';
    el.innerHTML = (tName ? `🚚 ${esc(tName)}${tPlate ? ' (' + esc(tPlate) + ')' : ''}<br>` : '') +
      `👤 ${esc(memberNames)}`;
  } catch (_) { el.textContent = 'не задана'; }
};

// Инициализируем виджет бригады при старте
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateSidebarBrigade, 500);
});
