// Список скважин в объёме (split-view: список слева, редактор справа)

let _bhFilter = 'all';
let _bhSearch = '';
let _bhSelectedUuid = null;
let _bhSplitVolumeId = null;
let _bhAllList = [];

async function renderBoreholes(volumeId) {
  _bhSplitVolumeId = volumeId;
  _bhSelectedUuid = null;
  if (!state.currentVolume || state.currentVolume.id !== volumeId) {
    state.currentVolume = await api('/volumes/' + volumeId);
  }
  setSubtitle(`${state.currentVolume.site?.name || ''} — ${state.currentVolume.name}`);
  setPageActions(`
    <button class="btn small" onclick="importKmlForBh('${state.currentVolume.site_id}','${volumeId}')" title="Импорт KML">📍 KML</button>
    <button class="btn primary" onclick="addBorehole('${volumeId}')">＋ Скважина</button>
  `);

  const screen = document.getElementById('screen');
  screen.innerHTML = `
    <div class="split-view">
      <div class="split-left">
        <div class="split-left-header">
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <input type="search" id="bh-search" placeholder="🔍 Поиск…" value="${esc(_bhSearch)}"
              style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn small ${_bhFilter === 'all' ? 'active' : ''}" onclick="setBhFilter('all')" style="border-radius:12px">Все</button>
            <button class="btn small ${_bhFilter === 'draft' ? 'active' : ''}" onclick="setBhFilter('draft')" style="border-radius:12px">Черновики</button>
            <button class="btn small ${_bhFilter === 'done' ? 'active' : ''}" onclick="setBhFilter('done')" style="border-radius:12px">Готовы</button>
          </div>
        </div>
        <div class="split-left-body" id="bh-split-list"></div>
      </div>
      <div class="split-right" id="split-editor">
        <div class="empty" style="margin-top:80px">← Выберите скважину из списка</div>
      </div>
    </div>`;

  document.getElementById('bh-search').oninput = (e) => {
    _bhSearch = e.target.value.trim();
    clearTimeout(window._bhSrch);
    window._bhSrch = setTimeout(() => reloadBhList(), 200);
  };

  await reloadBhList();
}

async function reloadBhList() {
  const volumeId = _bhSplitVolumeId;
  const params = new URLSearchParams({ volume_id: volumeId });
  if (_bhFilter !== 'all') params.set('status', _bhFilter);
  if (_bhSearch) params.set('q', _bhSearch);
  const list = await api('/boreholes?' + params);
  _bhAllList = await api('/boreholes?volume_id=' + volumeId);

  const el = document.getElementById('bh-split-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="empty" style="padding:20px">Скважин нет.</div>'; return; }
  el.innerHTML = list.map(bh => `
    <div class="split-bh-item${_bhSelectedUuid === bh.uuid ? ' selected' : ''}" onclick="openBhInSplit('${bh.uuid}')">
      <div style="flex:1;min-width:0">
        <div class="bh-name">${esc(bh.name || '(без имени)')} <span class="badge ${bh.status}">${bh.status === 'done' ? '✓' : '…'}</span></div>
        <div class="bh-meta">${bh.drill_date ? fmtDate(bh.drill_date) + ' · ' : ''}${bh.planned_depth_m || 0} м · 📷${bh.photos_count}</div>
      </div>
      <button class="btn small" style="color:var(--error);border-color:transparent;padding:3px 6px;flex-shrink:0"
        onclick="event.stopPropagation();delBh('${bh.uuid}','${esc(bh.name || '')}')">🗑</button>
    </div>`).join('');
}

async function openBhInSplit(uuid) {
  _bhSelectedUuid = uuid;
  // Подсветим выбранный
  document.querySelectorAll('.split-bh-item').forEach(el => {
    el.classList.toggle('selected', el.onclick?.toString().includes(`'${uuid}'`));
  });
  // Очистить и показать loader
  const editor = document.getElementById('split-editor');
  if (editor) editor.innerHTML = '<div class="empty">Загрузка…</div>';
  // renderBoreholeEdit сам найдёт #split-editor и отрендерится туда
  try {
    await renderBoreholeEdit(uuid, _bhSplitVolumeId);
  } catch (e) {
    if (editor) editor.innerHTML = `<div class="empty" style="color:var(--error)">Ошибка: ${esc(e.message)}</div>`;
  }
}

function setBhFilter(f) { _bhFilter = f; reloadBhList(); }

async function addBorehole(volumeId) {
  const uuid = crypto.randomUUID();
  const v = state.currentVolume;
  let brigade = null;
  try { brigade = await api('/brigade/current'); } catch (e) {}
  await api('/boreholes/' + uuid, { method: 'PUT', body: JSON.stringify({
    site_id: v.site_id, volume_id: volumeId,
    name: 'Скв-' + (Math.floor(Math.random() * 900) + 100),
    drill_date: todayStr(),
    work_type: 'SEARCH',
    brigade_id: brigade?.id || null,
    brigade_snapshot: brigade ? {
      transportLabel: brigade.transport ? `${brigade.transport.name}${brigade.transport.plate ? ' (' + brigade.transport.plate + ')' : ''}` : '',
      memberNames: (brigade.members || []).map(m => m.name),
      transportId: brigade.transport_id || null,
      memberIds: (brigade.members || []).map(m => m.id),
    } : null,
  }) });
  await reloadBhList();
  openBhInSplit(uuid);
}

function delBh(uuid, name) {
  confirm2('Удалить скважину?', `Скважина «${name}» и её слои/пробы/фото будут удалены.`, async () => {
    try {
      await api('/boreholes/' + uuid, { method: 'DELETE' });
      toast('Удалено', 'ok');
      if (_bhSelectedUuid === uuid) {
        _bhSelectedUuid = null;
        const editor = document.getElementById('split-editor');
        if (editor) editor.innerHTML = '<div class="empty" style="margin-top:80px">← Выберите скважину из списка</div>';
      }
      reloadBhList();
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  }, { confirmLabel: 'Удалить', danger: true });
}

function importKmlForBh(siteId, volumeId) {
  pickFile('.kml', async (file) => {
    const fd = new FormData();
    fd.append('kml', file);
    try {
      const r = await upload('/kml/parse', fd);
      if (!r.points?.length) return toast('Точки не найдены', 'warn');
      const mode = (state.currentVolume?.kind === 'DRILLING') ? 'boreholes' : 'task_points';
      const modeLabel = mode === 'boreholes' ? 'скважин' : 'точек задач';
      const list = r.points.map((p, i) => `<label style="display:block"><input type="checkbox" data-i="${i}" checked> ${esc(p.name)} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})</label>`).join('');
      showModal(`Точки из KML (${r.points.length})`,
        `<div style="margin-bottom:8px;font-size:13px;color:var(--text2)">Будет создано: <b>${modeLabel}</b></div>
         <div style="max-height:300px;overflow-y:auto">${list}</div>`,
        [
          { label: 'Отмена', fn: closeModal },
          { label: 'Создать', cls: 'primary', fn: async () => {
            const checked = [...document.querySelectorAll('.modal input[type=checkbox]:checked')].map(cb => r.points[cb.dataset.i]);
            closeModal();
            try {
              if (mode === 'boreholes') {
                for (const p of checked) {
                  const u = crypto.randomUUID();
                  await api('/boreholes/' + u, { method: 'PUT', body: JSON.stringify({
                    site_id: siteId, volume_id: volumeId,
                    name: p.name, manual_lat: p.lat, manual_lng: p.lng,
                    drill_date: todayStr(),
                  }) });
                }
                toast('Создано скважин: ' + checked.length, 'ok');
              } else {
                await api('/task-points/bulk', { method: 'POST', body: JSON.stringify({
                  volume_id: volumeId, site_id: siteId,
                  points: checked.map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
                }) });
                toast('Создано точек: ' + checked.length, 'ok');
              }
              reloadBhList();
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          } },
        ]);
    } catch (e) { toast('Ошибка KML: ' + e.message, 'err'); }
  });
}
