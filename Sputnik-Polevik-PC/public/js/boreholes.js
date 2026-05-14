// Список скважин в объёме

let _bhFilter = 'all';
let _bhSearch = '';

async function renderBoreholes(volumeId) {
  if (!state.currentVolume || state.currentVolume.id !== volumeId) {
    state.currentVolume = await api('/volumes/' + volumeId);
  }
  setSubtitle(`${state.currentVolume.site?.name || ''} — ${state.currentVolume.name}`);
  setPageActions(`
    <button class="btn small" onclick="importKmlForBh('${state.currentVolume.site_id}','${volumeId}')" title="Импорт KML">📍 KML</button>
    <button class="btn primary" onclick="addBorehole('${volumeId}')">＋ Скважина</button>
  `);
  await reloadBoreholes(volumeId);
}

async function reloadBoreholes(volumeId) {
  const screen = document.getElementById('screen');
  const params = new URLSearchParams({ volume_id: volumeId });
  if (_bhFilter !== 'all') params.set('status', _bhFilter);
  if (_bhSearch) params.set('q', _bhSearch);
  const list = await api('/boreholes?' + params);
  // Загружаем общие counts для фильтра
  const all_ = await api('/boreholes?volume_id=' + volumeId);
  const draftCount = all_.filter(b => b.status === 'draft').length;
  const doneCount  = all_.filter(b => b.status === 'done').length;

  screen.innerHTML = `
    <div class="search-bar">
      <input type="search" placeholder="🔍 Поиск по названию…" value="${esc(_bhSearch)}" id="bh-search">
    </div>
    <div class="filter-pills">
      <button class="btn small ${_bhFilter === 'all' ? 'active' : ''}" onclick="setBhFilter('all','${state.currentVolume.id}')">Все (${all_.length})</button>
      <button class="btn small ${_bhFilter === 'draft' ? 'active' : ''}" onclick="setBhFilter('draft','${state.currentVolume.id}')">Черновики (${draftCount})</button>
      <button class="btn small ${_bhFilter === 'done' ? 'active' : ''}" onclick="setBhFilter('done','${state.currentVolume.id}')">Готовы (${doneCount})</button>
    </div>
    <div id="bh-list">${list.length ? list.map(bh => `
      <div class="row-item clickable" onclick="nav('borehole_edit',{uuid:'${bh.uuid}',volumeId:'${state.currentVolume.id}'})">
        <div class="main">
          <div class="name">${esc(bh.name || '(без имени)')} <span class="badge ${bh.status}">${bh.status === 'done' ? '✓ готов' : 'черновик'}</span></div>
          <div class="meta">${bh.drill_date ? esc(bh.drill_date) + ' · ' : ''}глубина ${bh.planned_depth_m || 0} м · слоёв ${bh.layers_count}, фото ${bh.photos_count}</div>
        </div>
        <button class="btn small danger" onclick="event.stopPropagation();delBh('${bh.uuid}','${esc(bh.name || '')}')">🗑</button>
      </div>`).join('') : '<div class="empty">Скважин нет.</div>'}</div>
  `;

  document.getElementById('bh-search').oninput = (e) => {
    _bhSearch = e.target.value.trim();
    clearTimeout(window._bhSrch);
    window._bhSrch = setTimeout(() => reloadBoreholes(volumeId), 200);
  };
}

function setBhFilter(f, vid) { _bhFilter = f; reloadBoreholes(vid); }

async function addBorehole(volumeId) {
  // Создаём «пустую» скважину и сразу открываем редактор
  const uuid = crypto.randomUUID();
  const v = state.currentVolume;
  // Подгружаем текущую бригаду
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
    } : null,
  }) });
  nav('borehole_edit', { uuid, volumeId });
}

function delBh(uuid, name) {
  confirm2('Удалить скважину?', `Скважина «${name}» и её слои/пробы/фото будут удалены.`, async () => {
    try { await api('/boreholes/' + uuid, { method: 'DELETE' }); toast('Удалено', 'ok'); reloadBoreholes(state.currentVolume.id); }
    catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  }, { confirmLabel: 'Удалить', danger: true });
}

function importKmlForBh(siteId, volumeId) {
  pickFile('.kml', async (file) => {
    const fd = new FormData();
    fd.append('kml', file);
    try {
      // Парсим KML, спрашиваем что создать
      const r = await upload('/kml/parse', fd);
      if (!r.points?.length) return toast('Точки не найдены', 'warn');
      const list = r.points.map((p, i) => `<label style="display:block"><input type="checkbox" data-i="${i}" checked> ${esc(p.name)} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})</label>`).join('');
      showModal(`Точки из KML (${r.points.length})`,
        `<div style="max-height:300px;overflow-y:auto">${list}</div>
         <div class="field" style="margin-top:10px">
           <label>Создать как</label>
           <select id="kml-mode">
             <option value="boreholes">Скважины</option>
             <option value="task_points">Точки задач</option>
           </select></div>`,
        [
          { label: 'Отмена', fn: closeModal },
          { label: 'Создать', cls: 'primary', fn: async () => {
            const checked = [...document.querySelectorAll('.modal input[type=checkbox]:checked')].map(cb => r.points[cb.dataset.i]);
            const mode = document.getElementById('kml-mode').value;
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
              reloadBoreholes(volumeId);
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          } },
        ]);
    } catch (e) { toast('Ошибка KML: ' + e.message, 'err'); }
  });
}
