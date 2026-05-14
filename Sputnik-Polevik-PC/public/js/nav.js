// Простая навигация по «экранам»

const SCREENS = {
  home: { title: '🛰️ Спутник-Полевик', render: () => renderHome() },
  refs: { title: 'Справочники', render: () => renderRefs() },
  brigade: { title: 'Бригада', render: () => renderBrigade() },
  sites: { title: 'Объекты', render: () => renderSites() },
  volumes: { title: 'Объёмы', render: ({ siteId }) => renderVolumes(siteId) },
  boreholes: { title: 'Скважины', render: ({ volumeId }) => renderBoreholes(volumeId) },
  task_points: { title: 'Точки задач', render: ({ volumeId }) => renderTaskPoints(volumeId) },
  borehole_edit: { title: 'Скважина', render: ({ uuid, volumeId }) => renderBoreholeEdit(uuid, volumeId) },
  export: { title: 'Экспорт .spk', render: () => renderExport() },
  vedomost: { title: 'Ведомости Excel', render: () => renderVedomost() },
  summary: { title: 'Сводка', render: () => renderSummary() },
};

window.nav = function (key, params = {}, opts = {}) {
  const s = SCREENS[key];
  if (!s) { console.error('Unknown screen', key); return; }
  if (!opts.replace) state.history.push({ key, params });
  document.getElementById('page-title').innerHTML = s.title;
  document.getElementById('page-subtitle').innerHTML = '';
  document.getElementById('page-actions').innerHTML = '';
  document.getElementById('screen').innerHTML = '<div class="empty">Загрузка…</div>';
  const back = document.querySelector('.back-btn');
  back.style.visibility = state.history.length > 1 ? 'visible' : 'hidden';
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
