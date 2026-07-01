// Точки задач (для STATIC_PROBE / THERMOMETRY)

let _tpFilter = 'all';

async function renderTaskPoints(volumeId) {
  if (!state.currentVolume || state.currentVolume.id !== volumeId) {
    state.currentVolume = await api('/volumes/' + volumeId);
  }
  setSubtitle(`${state.currentVolume.site?.name || ''} — ${state.currentVolume.name}`);
  setPageActions(`
    <button class="btn small" onclick="importKmlForBh('${state.currentVolume.site_id}','${volumeId}')" title="Импорт KML">📍 KML</button>
    <button class="btn primary" onclick="addTaskPoint('${volumeId}')">＋ Точка</button>
  `);
  await reloadTaskPoints(volumeId);
}

async function reloadTaskPoints(volumeId) {
  const screen = document.getElementById('screen');
  const all_ = await api('/task-points?volume_id=' + volumeId);
  const filtered = _tpFilter === 'all' ? all_
    : _tpFilter === 'done' ? all_.filter(p => p.completed_date)
    : all_.filter(p => !p.completed_date);
  const doneCount = all_.filter(p => p.completed_date).length;

  screen.innerHTML = `
    <div class="filter-pills">
      <button class="btn small ${_tpFilter === 'all' ? 'active' : ''}" onclick="setTpFilter('all','${volumeId}')">Все (${all_.length})</button>
      <button class="btn small ${_tpFilter === 'todo' ? 'active' : ''}" onclick="setTpFilter('todo','${volumeId}')">Не выполнено (${all_.length - doneCount})</button>
      <button class="btn small ${_tpFilter === 'done' ? 'active' : ''}" onclick="setTpFilter('done','${volumeId}')">Готово (${doneCount})</button>
    </div>
    ${filtered.length ? filtered.map(p => `
      <div class="row-item">
        <div class="main">
          <div class="name">${esc(p.name || '(без имени)')} ${p.completed_date ? `<span class="badge done">✓ ${esc(fmtDate(p.completed_date))}</span>` : '<span class="badge draft">не выполнено</span>'}</div>
          <div class="meta">${p.lat != null ? `${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}` : 'без координат'} · план ${p.planned_depth_m || 0} м</div>
        </div>
        ${p.completed_date
          ? `<button class="btn small" onclick="changeTpDate('${p.uuid}','${volumeId}')">📅</button>
             <button class="btn small" onclick="markTpUndone('${p.uuid}','${volumeId}')">↩</button>`
          : `<button class="btn small success" onclick="markTpDone('${p.uuid}','${volumeId}')">✓</button>`}
        <button class="btn small danger" onclick="delTp('${p.uuid}','${esc(p.name || '')}','${volumeId}')">🗑</button>
      </div>`).join('') : '<div class="empty">Точек нет.</div>'}
  `;
}

function setTpFilter(f, vid) { _tpFilter = f; reloadTaskPoints(vid); }

function addTaskPoint(volumeId) {
  showModal('Новая точка задач', `
    <div class="field"><label>Название</label><input id="tp-name"></div>
    <div class="field-row">
      <div class="field"><label>Широта</label><input id="tp-lat" type="number" step="0.000001"></div>
      <div class="field"><label>Долгота</label><input id="tp-lng" type="number" step="0.000001"></div>
    </div>
    <div class="field"><label>Плановая глубина, м</label><input id="tp-depth" type="number" step="0.1" value="0"></div>
    <div class="field"><label>Примечания</label><textarea id="tp-notes"></textarea></div>
  `, [
    { label: 'Отмена', fn: closeModal },
    { label: 'Создать', cls: 'primary', fn: async () => {
      const u = crypto.randomUUID();
      await api('/task-points/' + u, { method: 'PUT', body: JSON.stringify({
        volume_id: volumeId, site_id: state.currentVolume.site_id,
        name: document.getElementById('tp-name').value.trim(),
        lat: parseFloat(document.getElementById('tp-lat').value) || null,
        lng: parseFloat(document.getElementById('tp-lng').value) || null,
        planned_depth_m: parseFloat(document.getElementById('tp-depth').value) || 0,
        notes: document.getElementById('tp-notes').value,
      }) });
      closeModal();
      reloadTaskPoints(volumeId);
    } },
  ]);
}

function markTpDone(uuid, vid) {
  const date = todayStr();
  api('/task-points/' + uuid + '/complete', { method: 'PATCH', body: JSON.stringify({ completed_date: date }) })
    .then(() => reloadTaskPoints(vid)).catch(e => toast('Ошибка: ' + e.message, 'err'));
}
function changeTpDate(uuid, vid) {
  showModal('Сменить дату выполнения', `
    <div class="field"><label>Дата</label><input id="tp-new-date" type="date" value="${todayStr()}"></div>
  `, [
    { label: 'Отмена', fn: closeModal },
    { label: 'Сохранить', cls: 'primary', fn: async () => {
      const d = document.getElementById('tp-new-date').value;
      if (!d) return toast('Укажите дату', 'warn');
      closeModal();
      try {
        await api('/task-points/' + uuid + '/complete', { method: 'PATCH', body: JSON.stringify({ completed_date: d }) });
        reloadTaskPoints(vid);
      } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
    } },
  ]);
}
function markTpUndone(uuid, vid) {
  api('/task-points/' + uuid + '/complete', { method: 'PATCH', body: JSON.stringify({ completed_date: null }) })
    .then(() => reloadTaskPoints(vid)).catch(e => toast('Ошибка: ' + e.message, 'err'));
}
function delTp(uuid, name, vid) {
  confirm2('Удалить точку?', `Точка «${name}» будет удалена.`, async () => {
    await api('/task-points/' + uuid, { method: 'DELETE' });
    reloadTaskPoints(vid);
  }, { confirmLabel: 'Удалить', danger: true });
}
