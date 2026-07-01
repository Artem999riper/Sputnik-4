// Редактор скважины: 5 табов

window._bh = null;
window._bhVolumeId = null;
window._activeTab = 'header';
window._customSoilTypes = [];
window._customSoilStates = [];

let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveBh(true), 1200);
}

async function renderBoreholeEdit(uuid, volumeId) {
  _bhVolumeId = volumeId;
  // Всегда открываем шапку при переходе к новой скважине
  if (_bh?.uuid !== uuid) _activeTab = 'header';
  const [bh, customTypes, customStates, brigade] = await Promise.all([
    api('/boreholes/' + uuid),
    api('/custom-soil-types').catch(() => []),
    api('/custom-soil-states').catch(() => []),
    api('/brigade/current').catch(() => null),
  ]);
  // Если снимок бригады не сохранён, но бригада существует — подставляем
  if (!bh.brigade_snapshot && brigade) {
    bh.brigade_snapshot = {
      transportLabel: brigade.transport
        ? `${brigade.transport.name}${brigade.transport.plate ? ' (' + brigade.transport.plate + ')' : ''}`
        : '',
      memberNames: (brigade.members || []).map(m => m.name),
      transportId: brigade.transport_id || null,
      memberIds: (brigade.members || []).map(m => m.id),
    };
    bh.brigade_id = brigade.id;
  }
  _bh = bh;
  _customSoilTypes = customTypes;
  _customSoilStates = customStates;

  // Определяем контейнер: split-editor (если есть) или #screen
  const splitPane = document.getElementById('split-editor');
  const container = splitPane || document.getElementById('screen');
  const inSplit = !!splitPane;

  if (inSplit) {
    setSubtitle(bh.name || '(без имени)');
    // В split-режиме кнопки рендерим inline внутри панели
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <div style="font-weight:700;font-size:15px">${esc(bh.name || '(без имени)')}</div>
        <div style="display:flex;gap:8px">
          ${bh.status === 'draft'
            ? '<button class="btn success" id="bh-finalize">✓ Завершить</button>'
            : '<button class="btn warn" id="bh-reopen">↻ Черновик</button>'}
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${_activeTab === 'header' ? 'active' : ''}" onclick="switchBhTab('header')">Шапка</button>
        <button class="tab-btn ${_activeTab === 'layers' ? 'active' : ''}" onclick="switchBhTab('layers')">Слои + пробы (${bh.soil_layers.length})</button>
        <button class="tab-btn ${_activeTab === 'photos' ? 'active' : ''}" onclick="switchBhTab('photos')">Фото (${bh.photos.length})</button>
      </div>
      <div id="tab-pane"></div>
    `;
  } else {
    setSubtitle(bh.name || '(без имени)');
    setPageActions(`
      ${bh.status === 'draft'
        ? '<button class="btn success" id="bh-finalize">✓ Завершить</button>'
        : '<button class="btn warn" id="bh-reopen">↻ Черновик</button>'}
    `);
    container.innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${_activeTab === 'header' ? 'active' : ''}" onclick="switchBhTab('header')">Шапка</button>
        <button class="tab-btn ${_activeTab === 'layers' ? 'active' : ''}" onclick="switchBhTab('layers')">Слои + пробы (${bh.soil_layers.length})</button>
        <button class="tab-btn ${_activeTab === 'photos' ? 'active' : ''}" onclick="switchBhTab('photos')">Фото (${bh.photos.length})</button>
      </div>
      <div id="tab-pane"></div>
    `;
  }
  renderActiveTab();

  if (bh.status === 'draft') document.getElementById('bh-finalize').onclick = finalizeBh;
  else document.getElementById('bh-reopen').onclick = reopenBh;
}

function switchBhTab(tab) {
  if (_activeTab === 'header') { const h = readHeader(); Object.assign(_bh, h); }
  _activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderActiveTab();
}

async function renderActiveTab() {
  const pane = document.getElementById('tab-pane');
  if (_activeTab === 'header')  renderHeaderTab(pane);
  if (_activeTab === 'layers')  renderLayersTab(pane);
  if (_activeTab === 'photos')  renderPhotosTab(pane);
}

// ── HEADER ──
function renderHeaderTab(pane) {
  const b = _bh;
  const wOpts = Object.entries(WORK_TYPES).map(([k, v]) => `<option value="${k}" ${k === b.work_type ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const snap = b.brigade_snapshot ? (typeof b.brigade_snapshot === 'string' ? JSON.parse(b.brigade_snapshot || '{}') : b.brigade_snapshot) : null;

  pane.innerHTML = `
    <div class="field"><label>Название скважины</label>
      <input id="hd-name" value="${esc(b.name || '')}" oninput="scheduleSave()"></div>
    <div class="field-row">
      <div class="field"><label>Дата бурения</label><input id="hd-date" type="date" value="${esc(b.drill_date || '')}" onchange="scheduleSave()"></div>
      <div class="field"><label>Тип работ</label><select id="hd-work" onchange="scheduleSave()">${wOpts}</select></div>
    </div>
    <div class="field"><label>Плановая глубина, м</label><input id="hd-depth" type="number" step="0.1" value="${b.planned_depth_m || 0}" oninput="scheduleSave()"></div>
    <div class="field-row">
      <div class="field"><label>Широта</label><input id="hd-lat" type="number" step="0.000001" value="${b.manual_lat ?? ''}" oninput="scheduleSave()"></div>
      <div class="field"><label>Долгота</label><input id="hd-lng" type="number" step="0.000001" value="${b.manual_lng ?? ''}" oninput="scheduleSave()"></div>
    </div>
    <div class="field"><label>Длина обсадной колонны, м</label><input id="hd-cas" type="number" step="0.1" value="${b.casing_length_m || 0}" oninput="scheduleSave()"></div>
    <div class="field" style="background:var(--surface2);padding:8px;border-radius:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label style="margin:0">Бригада</label>
        <button class="btn small" onclick="changeBrigade()">✏️ Сменить</button>
      </div>
      ${snap
        ? `<div style="font-size:12px;color:var(--text2)">${esc((snap.memberNames || []).join(', '))}${snap.transportLabel ? ' — ' + esc(snap.transportLabel) : ''}</div>`
        : `<div style="font-size:12px;color:var(--text2)">Не указана</div>`}
    </div>
  `;
}

function readHeader() {
  return {
    name:            document.getElementById('hd-name')?.value.trim() || _bh.name,
    drill_date:      document.getElementById('hd-date')?.value || null,
    work_type:       document.getElementById('hd-work')?.value,
    planned_depth_m: parseFloat(document.getElementById('hd-depth')?.value) || 0,
    kml_point_id:    null,
    manual_lat:      document.getElementById('hd-lat')?.value ? parseFloat(document.getElementById('hd-lat').value) : null,
    manual_lng:      document.getElementById('hd-lng')?.value ? parseFloat(document.getElementById('hd-lng').value) : null,
    casing_length_m: parseFloat(document.getElementById('hd-cas')?.value) || 0,
  };
}

async function changeBrigade() {
  const brigades = await api('/brigades').catch(() => []);
  if (!brigades.length) return toast('Нет сохранённых карточек бригады', 'warn');

  showModal('Выбрать бригаду', `
    <div style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto">
      ${brigades.map(b => {
        const snap = { transportLabel: b.transport ? `${b.transport.name}${b.transport.plate ? ' (' + b.transport.plate + ')' : ''}` : '', memberNames: (b.members || []).map(m => m.name), transportId: b.transport_id || null, memberIds: (b.members || []).map(m => m.id) };
        const isActive = b.id === _bh.brigade_id;
        return `<button class="btn${isActive ? ' primary' : ''}" style="text-align:left;padding:8px 12px" onclick="applyBrigade('${esc(b.id)}',${JSON.stringify(JSON.stringify(snap))})">
          <div style="font-weight:600">${esc(b.label || '(бригада)')}</div>
          <div style="font-size:11px;opacity:.7">${esc((snap.memberNames).join(', '))}${snap.transportLabel ? ' — ' + esc(snap.transportLabel) : ''}</div>
        </button>`;
      }).join('')}
    </div>
  `, [{ label: 'Отмена', fn: closeModal }]);
}

async function applyBrigade(brigadeId, snapJson) {
  closeModal();
  const snap = JSON.parse(snapJson);
  _bh.brigade_id = brigadeId;
  _bh.brigade_snapshot = snap;
  await saveBh(false);
  renderHeaderTab(document.getElementById('tab-pane'));
  toast('Бригада обновлена', 'ok');
}

// ── LAYERS ──
function renderLayersTab(pane) {
  const layers = _bh.soil_layers;
  pane.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn primary small" onclick="addLayer()">＋ Слой</button>
    </div>
    <div id="layers-list">${layers.length ? layers.map((l, i) => layerCardHtml(l, i)).join('')
                                              : '<div class="empty">Слоёв нет</div>'}</div>
  `;
}

function soilTypeOptions(current) {
  const all = [...SOIL_TYPES_DEFAULT, ..._customSoilTypes.filter(t => !SOIL_TYPES_DEFAULT.includes(t))];
  return all.map(t => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('') +
    `<option value="__custom__">+ свой…</option>`;
}
function soilStateOptions(current) {
  const all = [...SOIL_STATES_DEFAULT, ..._customSoilStates.filter(t => !SOIL_STATES_DEFAULT.includes(t))];
  return `<option value="" ${!current ? 'selected' : ''}>—</option>` +
    all.map(t => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('') +
    `<option value="__custom__">+ своё…</option>`;
}
function frozenOptions(current) {
  return ['', ...FROZEN_STATES].map(t => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('');
}
function packagingOptions(current) {
  const cur = current || PACKAGING_TYPES[0];
  return PACKAGING_TYPES.map(t => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

function layerCardHtml(l, i) {
  return `
  <div class="layer-card" data-li="${i}">
    <div class="layer-hdr">
      <span class="layer-ord">Слой ${i + 1}</span>
      <div style="display:flex;gap:4px">
        <button class="btn small" onclick="addSample(${i})">＋ Проба</button>
        <button class="btn small danger" onclick="delLayer(${i})">🗑</button>
      </div>
    </div>
    <div class="layer-fields">
      <div class="field-s"><label>Тип грунта</label>
        <select onchange="layerFieldChange(${i},'soil_type',this.value)">${soilTypeOptions(l.soil_type)}</select></div>
      <div class="field-s"><label>Состояние</label>
        <select onchange="layerFieldChange(${i},'state',this.value)">${soilStateOptions(l.state)}</select></div>
      <div class="field-s"><label>Подошва, м</label>
        <input type="number" step="0.01" value="${l.depth_m || 0}" style="width:80px" onchange="layerFieldChange(${i},'depth_m',this.value)"></div>
      <div class="field-s"><label>Мерзлота</label>
        <select onchange="layerFieldChange(${i},'frozen_state',this.value)">${frozenOptions(l.frozen_state || '')}</select></div>
    </div>
    <div class="samples-list">${(l.samples || []).map((s, si) => sampleCardHtml(s, i, si)).join('')}</div>
  </div>`;
}

function sampleCardHtml(s, li, si) {
  const ctOpts = COLLECTION_TYPES.map(t => `<option ${t === s.collection_type ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `
  <div class="sample-card">
    <div class="sample-hdr">
      <span>Проба ${si + 1}</span>
      <button class="btn small danger" onclick="delSample(${li},${si})">🗑</button>
    </div>
    <div class="layer-fields">
      <div class="field-s"><label>Тип отбора</label>
        <select onchange="sampleFieldChange(${li},${si},'collection_type',this.value)"><option value="">—</option>${ctOpts}</select></div>
      <div class="field-s"><label>Упаковка</label>
        <select onchange="sampleFieldChange(${li},${si},'packaging',this.value)">${packagingOptions(s.packaging)}</select></div>
      <div class="field-s"><label>От, м</label>
        <input type="number" step="0.01" value="${s.depth_top_m ?? ''}" style="width:70px" onchange="sampleFieldChange(${li},${si},'depth_top_m',this.value)"></div>
      <div class="field-s"><label>До, м</label>
        <input type="number" step="0.01" value="${s.depth_bottom_m ?? ''}" style="width:70px" onchange="sampleFieldChange(${li},${si},'depth_bottom_m',this.value)"></div>
    </div>
  </div>`;
}

function addLayer() {
  _bh.soil_layers.push({ uuid: crypto.randomUUID(), order_idx: _bh.soil_layers.length,
    soil_type: SOIL_TYPES_DEFAULT[0], state: '', description: '', depth_m: 0,
    frozen_state: '', samples: [] });
  renderLayersTab(document.getElementById('tab-pane'));
  scheduleSave();
}
function delLayer(i) {
  _bh.soil_layers.splice(i, 1);
  renderLayersTab(document.getElementById('tab-pane'));
  scheduleSave();
}
function layerFieldChange(i, field, val) {
  if (val === '__custom__') {
    prompt2('Свой ' + (field === 'soil_type' ? 'тип грунта' : 'состояние'), 'Название', '', async (name) => {
      if (field === 'soil_type') { await api('/custom-soil-types', { method: 'POST', body: JSON.stringify({ name }) }); _customSoilTypes.push(name); _bh.soil_layers[i].soil_type = name; }
      else                       { await api('/custom-soil-states', { method: 'POST', body: JSON.stringify({ name }) }); _customSoilStates.push(name); _bh.soil_layers[i].state = name; }
      renderLayersTab(document.getElementById('tab-pane'));
    });
    return;
  }
  _bh.soil_layers[i][field] = (field === 'depth_m') ? parseFloat(val) || 0 : val;
  scheduleSave();
}
function addSample(li) {
  _bh.soil_layers[li].samples = _bh.soil_layers[li].samples || [];
  _bh.soil_layers[li].samples.push({ uuid: crypto.randomUUID(), collection_type: 'Монолит', packaging: PACKAGING_TYPES[0], depth_m: null, depth_top_m: null, depth_bottom_m: null });
  renderLayersTab(document.getElementById('tab-pane'));
  scheduleSave();
}
function delSample(li, si) {
  _bh.soil_layers[li].samples.splice(si, 1);
  renderLayersTab(document.getElementById('tab-pane'));
  scheduleSave();
}
function sampleFieldChange(li, si, field, val) {
  const s = _bh.soil_layers[li].samples[si];
  s[field] = ['depth_m', 'depth_top_m', 'depth_bottom_m'].includes(field)
    ? (val === '' ? null : parseFloat(val)) : val;
  scheduleSave();
}

// ── UGV ──
function renderUgvTab(pane) {
  const list = _bh.ugv;
  pane.innerHTML = `
    <button class="btn primary small" onclick="addUgv()" style="margin-bottom:12px">＋ Отметка УГВ</button>
    ${list.length ? list.map((u, i) => `
      <div class="row-item">
        <div class="main">
          <div class="field" style="margin:0"><label>Глубина УГВ ${i + 1}, м</label>
            <input type="number" step="0.01" value="${u.depth_m || 0}" onchange="_bh.ugv[${i}].depth_m=parseFloat(this.value)||0;scheduleSave()">
          </div>
        </div>
        <button class="btn small danger" onclick="_bh.ugv.splice(${i},1);renderUgvTab(document.getElementById('tab-pane'));scheduleSave()">🗑</button>
      </div>`).join('') : '<div class="empty">Отметок УГВ нет</div>'}
  `;
}
function addUgv() {
  _bh.ugv.push({ uuid: crypto.randomUUID(), order_idx: _bh.ugv.length, depth_m: 0 });
  renderUgvTab(document.getElementById('tab-pane'));
  scheduleSave();
}

// ── MMG ──
function renderMmgTab(pane) {
  const list = _bh.mmg;
  pane.innerHTML = `
    <button class="btn primary small" onclick="addMmg()" style="margin-bottom:12px">＋ ММГ</button>
    ${list.length ? list.map((m, i) => `
      <div class="layer-card">
        <div class="layer-hdr">
          <span class="layer-ord">ММГ ${i + 1}</span>
          <button class="btn small danger" onclick="_bh.mmg.splice(${i},1);renderMmgTab(document.getElementById('tab-pane'));scheduleSave()">🗑</button>
        </div>
        <div class="layer-fields">
          <div class="field-s"><label>От, м</label><input type="number" step="0.01" value="${m.top_m || 0}" style="width:80px" onchange="_bh.mmg[${i}].top_m=parseFloat(this.value)||0;scheduleSave()"></div>
          <div class="field-s"><label>До, м</label><input type="number" step="0.01" value="${m.bottom_m || 0}" style="width:80px" onchange="_bh.mmg[${i}].bottom_m=parseFloat(this.value)||0;scheduleSave()"></div>
        </div>
        <div class="field"><label>Описание</label><textarea rows="2" onchange="_bh.mmg[${i}].description=this.value;scheduleSave()">${esc(m.description || '')}</textarea></div>
      </div>`).join('') : '<div class="empty">ММГ-отметок нет</div>'}
  `;
}
function addMmg() {
  _bh.mmg.push({ uuid: crypto.randomUUID(), order_idx: _bh.mmg.length, top_m: 0, bottom_m: 0, description: '' });
  renderMmgTab(document.getElementById('tab-pane'));
  scheduleSave();
}

// ── SAVE / FINALIZE ──
async function saveBh(silent = false) {
  if (!_bh) return;
  const headerData = (_activeTab === 'header') ? readHeader() : {};
  const body = { ..._bh, ...headerData };
  try {
    const r = await api('/boreholes/' + _bh.uuid, { method: 'PUT', body: JSON.stringify(body) });
    _bh = r.borehole;
    if (!silent) toast('Сохранено', 'ok');
  } catch (e) { if (!silent) toast('Ошибка: ' + e.message, 'err'); }
}

function _afterBhAction() {
  if (document.getElementById('split-editor')) {
    // Обновляем список и редактор в split-режиме
    if (typeof reloadBhList === 'function') reloadBhList();
    renderBoreholeEdit(_bh.uuid, _bhVolumeId);
  } else {
    navBack();
  }
}

async function finalizeBh() {
  clearTimeout(_saveTimer);
  await saveBh(true);
  try {
    await api('/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', body: JSON.stringify({}) });
    toast('Скважина завершена', 'ok');
    _afterBhAction();
  } catch (e) {
    if (/validation/i.test(e.message)) {
      try {
        const r = await fetch(API + '/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json();
        confirm2('Есть незаполненные данные', (j.issues || []).join('\n• '), async () => {
          await api('/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', body: JSON.stringify({ force: true }) });
          toast('Скважина завершена с предупреждениями', 'warn');
          _afterBhAction();
        }, { confirmLabel: 'Всё равно завершить', danger: false });
      } catch (_) { toast('Ошибка: ' + e.message, 'err'); }
    } else toast('Ошибка: ' + e.message, 'err');
  }
}

async function reopenBh() {
  await api('/boreholes/' + _bh.uuid + '/reopen', { method: 'POST' });
  toast('Возвращено в черновик', 'ok');
  if (typeof reloadBhList === 'function') reloadBhList();
  renderBoreholeEdit(_bh.uuid, _bhVolumeId);
}
