// Главная — дашборд со статистикой

async function renderHome() {
  const screen = document.getElementById('screen');
  let counts = {};
  try { counts = await api('/refs/counts'); } catch (e) {}
  let issues = [];
  try { issues = await api('/validation/issues'); } catch (e) {}
  let brigade = null;
  try { brigade = await api('/brigade/current'); } catch (e) {}

  setPageActions(issues.length
    ? `<button class="warning-bell" onclick="showValidationIssues()">⚠️ ${issues.length} проблем</button>`
    : '');

  const memberNames = brigade?.members?.map(m => m.name).join(', ') || null;
  const tName = brigade?.transport?.name || null;

  screen.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:18px;font-weight:700">Добро пожаловать</h3>

    <div class="dash-grid">
      <div class="dash-card" style="cursor:pointer" onclick="nav('sites')">
        <div class="dc-val">${counts.sites || 0}</div>
        <div class="dc-label">Объектов</div>
      </div>
      <div class="dash-card" style="cursor:pointer" onclick="nav('sites')">
        <div class="dc-val">${counts.volumes || 0}</div>
        <div class="dc-label">Объёмов работ</div>
      </div>
      <div class="dash-card" style="cursor:pointer" onclick="nav('sites')">
        <div class="dc-val">${counts.boreholes || 0}</div>
        <div class="dc-label">Скважин всего</div>
      </div>
      <div class="dash-card" style="cursor:pointer;border-color:var(--success)" onclick="nav('sites')">
        <div class="dc-val" style="color:var(--success)">${counts.done_boreholes || 0}</div>
        <div class="dc-label">Скважин завершено</div>
      </div>
      <div class="dash-card" style="cursor:pointer" onclick="nav('refs')">
        <div class="dc-val">${counts.workers || 0}</div>
        <div class="dc-label">Работников в справочнике</div>
      </div>
    </div>

    ${brigade ? `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:20px">
      <div style="font-weight:700;margin-bottom:8px">👥 Активная бригада</div>
      ${tName ? `<div style="font-size:13px;color:var(--text2)">🚚 ${esc(tName)}</div>` : ''}
      ${memberNames ? `<div style="font-size:13px;color:var(--text2)">👤 ${esc(memberNames)}</div>` : ''}
      <button class="btn small" style="margin-top:10px" onclick="nav('brigade')">Изменить бригаду</button>
    </div>` : `
    <div style="background:#fff3e0;border:1px solid var(--warning);border-radius:var(--radius);padding:14px;margin-bottom:20px">
      <b>Бригада не задана.</b> Укажите состав перед началом работы.
      <br><button class="btn primary small" style="margin-top:8px" onclick="nav('brigade')">Задать бригаду</button>
    </div>`}

    ${issues.length ? `
    <div style="background:#fff3e0;border:1px solid var(--warning);border-radius:var(--radius);padding:14px;margin-bottom:20px">
      <b>⚠️ ${issues.length} скважин с проблемами</b>
      <br><button class="btn warn small" style="margin-top:8px" onclick="showValidationIssues()">Показать</button>
    </div>` : ''}

    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
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
        await api('/reset', { method: 'POST' });
        toast('Все данные сброшены', 'ok');
        nav('home', {}, { replace: true });
      } catch (e) { toast('Ошибка сброса: ' + e.message, 'err'); }
    },
    { confirmLabel: 'Сбросить', danger: true });
}
