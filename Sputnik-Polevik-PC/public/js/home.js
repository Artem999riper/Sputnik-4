// Главное меню

async function renderHome() {
  const screen = document.getElementById('screen');
  let counts = {};
  try { counts = await api('/refs/counts'); } catch (e) {}
  let issues = [];
  try { issues = await api('/validation/issues'); } catch (e) {}

  setPageActions(issues.length
    ? `<button class="warning-bell" onclick="showValidationIssues()">⚠️ ${issues.length}</button>`
    : '');

  screen.innerHTML = `
    <div class="center-emoji">🛰️</div>
    <div class="app-title">Спутник Полевик</div>
    <div class="app-subtitle">Геологические полевые материалы</div>

    <div class="menu-card" onclick="nav('refs')">
      <div class="icon">📥</div>
      <div class="text"><div class="title">Справочники</div>
        <div class="subtitle">Импорт refs.json от оператора · работников: ${counts.workers || 0}, объектов: ${counts.sites || 0}</div></div>
      <div class="chev">›</div>
    </div>
    <div class="menu-card" onclick="nav('brigade')">
      <div class="icon">👥</div>
      <div class="text"><div class="title">Бригада</div>
        <div class="subtitle">Состав и транспорт</div></div>
      <div class="chev">›</div>
    </div>
    <div class="menu-card" onclick="nav('sites')">
      <div class="icon">🏗️</div>
      <div class="text"><div class="title">Объекты / Скважины</div>
        <div class="subtitle">Объёмы: ${counts.volumes || 0} · скважин: ${counts.boreholes || 0} (завершено ${counts.done_boreholes || 0})</div></div>
      <div class="chev">›</div>
    </div>
    <div class="menu-card" onclick="nav('export')">
      <div class="icon">📦</div>
      <div class="text"><div class="title">Экспорт .spk</div>
        <div class="subtitle">Архив для оператора (совместим с Android)</div></div>
      <div class="chev">›</div>
    </div>
    <div class="menu-card" onclick="nav('vedomost')">
      <div class="icon">📊</div>
      <div class="text"><div class="title">Ведомости Excel</div>
        <div class="subtitle">Образцы и объёмы</div></div>
      <div class="chev">›</div>
    </div>
    <div class="menu-card" onclick="nav('summary')">
      <div class="icon">📄</div>
      <div class="text"><div class="title">Сводка</div>
        <div class="subtitle">Текстовый отчёт за период (Word)</div></div>
      <div class="chev">›</div>
    </div>

    <div style="margin-top:32px;text-align:center">
      <button class="btn small" onclick="confirmReset()" style="color:var(--error);border-color:var(--error)">🗑️ Сбросить все данные</button>
    </div>
  `;
  // home — корень: чистим историю
  state.history = [{ key: 'home', params: {} }];
  document.querySelector('.back-btn').style.visibility = 'hidden';
}

async function showValidationIssues() {
  const issues = await api('/validation/issues');
  if (!issues.length) { toast('Все скважины заполнены', 'ok'); return; }
  showModal('Незаполненные данные',
    '<div style="max-height:60vh;overflow-y:auto">' +
    issues.map(i => `<div style="padding:6px 0;border-bottom:1px dashed var(--border)">
      <b>${esc(i.name)}</b>: ${i.issues.map(esc).join(', ')}</div>`).join('') +
    '</div>',
    [{ label: 'OK', cls: 'primary', fn: closeModal }]);
}

function confirmReset() {
  confirm2('Сбросить все данные?',
    'Будут удалены все скважины, справочники, бригада, объекты, точки задач и фото. Действие нельзя отменить.',
    async () => {
      try {
        // Очистка через несколько эндпоинтов; проще — через отдельный (не делали).
        // Поэтому удаляем через DELETE по таблицам — нет такого. Сделаем простой POST /api/reset.
        await api('/reset', { method: 'POST' });
        toast('Все данные сброшены', 'ok');
        nav('home', {}, { replace: true });
      } catch (e) { toast('Ошибка сброса: ' + e.message, 'err'); }
    },
    { confirmLabel: 'Сбросить', danger: true });
}
