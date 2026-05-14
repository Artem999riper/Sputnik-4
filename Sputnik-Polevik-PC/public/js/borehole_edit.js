// Редактор скважины: 5 табов

window._bh = null;             // текущая скважина (черновик в памяти)
window._bhVolumeId = null;
window._activeTab = 'header';
window._customSoilTypes = [];
window._customSoilStates = [];

async function renderBoreholeEdit(uuid, volumeId) {
  _bhVolumeId = volumeId;
  const [bh, kmlPoints, customTypes, customStates] = await Promise.all([
    api('/boreholes/' + uuid),
    api('/kml-points').catch(() => []),
    api('/custom-soil-types').catch(() => []),
    api('/custom-soil-states').catch(() => []),
  ]);
  _bh = bh;
  _customSoilTypes = customTypes;
  _customSoilStates = customStates;

  setSubtitle(bh.name || '(без имени)');
  setPageActions(`
    <button class="btn" id="bh-save">💾 Сохранить</button>
    ${bh.status === 'draft'
      ? '<button class="btn success" id="bh-finalize">✓ Завершить</button>'
      : '<button class="btn warn" id="bh-reopen">↻ Вернуть в черновик</button>'}
  `);

  const screen = document.getElementById('screen');
  screen.innerHTML = `
    <div class="tabs">
      <button class="tab-btn ${_activeTab === 'header' ? 'active' : ''}" onclick="switchBhTab('header')">Шапка</button>
      <button class="tab-btn ${_activeTab === 'layers' ? 'active' : ''}" onclick="switchBhTab('layers')">Слои + пробы (${bh.soil_layers.length})</button>
      <button class="tab-btn ${_activeTab === 'ugv' ? 'active' : ''}" onclick="switchBhTab('ugv')">УГВ (${bh.ugv.length})</button>
      <button class="tab-btn ${_activeTab === 'mmg' ? 'active' : ''}" onclick="switchBhTab('mmg')">ММГ (${bh.mmg.length})</button>
      <button class="tab-btn ${_activeTab === 'photos' ? 'active' : ''}" onclick="switchBhTab('photos')">Фото (${bh.photos.length})</button>
    </div>
    <div id="tab-pane"></div>
  `;
  renderActiveTab(kmlPoints);

  document.getElementById('bh-save').onclick = saveBh;
  if (bh.status === 'draft') document.getElementById('bh-finalize').onclick = finalizeBh;
  else document.getElementById('bh-reopen').onclick = reopenBh;
}

function switchBhTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderActiveTab();
}

async function renderActiveTab(kmlPoints) {
  const pane = document.getElementById('tab-pane');
  if (!kmlPoints) kmlPoints = await api('/kml-points').catch(() => []);
  if (_activeTab === 'header')  renderHeaderTab(pane, kmlPoints);
  if (_activeTab === 'layers')  renderLayersTab(pane);
  if (_activeTab === 'ugv')     renderUgvTab(pane);
  if (_activeTab === 'mmg')     renderMmgTab(pane);
  if (_activeTab === 'photos')  renderPhotosTab(pane);
}

// ── HEADER ──
function renderHeaderTab(pane, kmlPoints) {
  const b = _bh;
  const kmlOpts = kmlPoints
    .filter(k => !state.currentVolume || !k.site_id || k.site_id === state.currentVolume.site_id)
    .map(k => `<option value="${k.id}" ${k.id === b.kml_point_id ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
  const wOpts = Object.entries(WORK_TYPES).map(([k, v]) => `<option value="${k}" ${k === b.work_type ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const snap = b.brigade_snapshot ? (typeof b.brigade_snapshot === 'string' ? JSON.parse(b.brigade_snapshot || '{}') : b.brigade_snapshot) : null;

  pane.innerHTML = `
    <div class="field"><label>Название скважины</label>
      <input id="hd-name" value="${esc(b.name || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Дата бурения</label><input id="hd-date" type="date" value="${esc(b.drill_date || '')}"></div>
      <div class="field"><label>Тип работ</label><select id="hd-work">${wOpts}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Плановая глубина, м</label><input id="hd-depth" type="number" step="0.1" value="${b.planned_depth_m || 0}"></div>
      <div class="field"><label>Диаметр, мм</label><input id="hd-diam" type="number" step="1" value="${b.diameter_mm || 0}"></div>
    </div>
    <div class="field"><label>KML-точка (или вручную координаты)</label>
      <select id="hd-kml" onchange="bhKmlChanged()"><option value="">— нет —</option>${kmlOpts}</select></div>
    <div class="field-row">
      <div class="field"><label>Широта (manual)</label><input id="hd-lat" type="number" step="0.000001" value="${b.manual_lat ?? ''}"></div>
      <div class="field"><label>Долгота (manual)</label><input id="hd-lng" type="number" step="0.000001" value="${b.manual_lng ?? ''}"></div>
    </div>
    <div class="field"><label>Геоморфология</label><textarea id="hd-geo">${esc(b.geomorph_desc || '')}</textarea></div>
    <div class="field"><label>Описание / примечания</label><textarea id="hd-desc">${esc(b.description || '')}</textarea></div>
    <div class="field"><label>Длина обсадной колонны, м</label><input id="hd-cas" type="number" step="0.1" value="${b.casing_length_m || 0}"></div>
    ${snap ? `<div class="field" style="background:var(--surface2);padding:10px;border-radius:6px">
      <label>Бригада-снимок</label>
      <div style="font-size:12px;color:var(--text2)">${esc((snap.memberNames || []).join(', '))} — ${esc(snap.transportLabel || '')}</div>
    </div>` : ''}
  `;
}

function bhKmlChanged() {
  const id = document.getElementById('hd-kml').value;
  if (!id) return;
  api('/kml-points').then(pts => {
    const p = pts.find(x => x.id === id);
    if (p) {
      document.getElementById('hd-lat').value = p.lat;
      document.getElementById('hd-lng').value = p.lng;
    }
  });
}

function readHeader() {
  return {
    name:            document.getElementById('hd-name').value.trim(),
    drill_date:      document.getElementById('hd-date').value || null,
    work_type:       document.getElementById('hd-work').value,
    planned_depth_m: parseFloat(document.getElementById('hd-depth').value) || 0,
    diameter_mm:     parseFloat(document.getElementById('hd-diam').value) || 0,
    kml_point_id:    document.getElementById('hd-kml').value || null,
    manual_lat:      document.getElementById('hd-lat').value ? parseFloat(document.getElementById('hd-lat').value) : null,
    manual_lng:      document.getElementById('hd-lng').value ? parseFloat(document.getElementById('hd-lng').value) : null,
    geomorph_desc:   document.getElementById('hd-geo').value,
    description:     document.getElementById('hd-desc').value,
    casing_length_m: parseFloat(document.getElementById('hd-cas').value) || 0,
  };
}

// ── LAYERS ──
function renderLayersTab(pane) {
  const layers = _bh.soil_layers;
  pane.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
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
  return all.map(t => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('') +
    `<option value="__custom__">+ своё…</option>`;
}
function frozenOptions(current) {
  return ['', ...FROZEN_STATES].map(t => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

function layerCardHtml(l, i) {
  return `
  <div class="layer-card" data-li="${i}">
    <div class="layer-hdr">
      <div class="ord">Слой ${i + 1}</div>
      <div>
        <button class="btn small" onclick="addSample(${i})">＋ Проба</button>
        <button class="btn small danger" onclick="delLayer(${i})">🗑 Слой</button>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Тип грунта</label>
        <select onchange="layerFieldChange(${i},'soil_type',this.value)">${soilTypeOptions(l.soil_type)}</select></div>
      <div class="field"><label>Состояние</label>
        <select onchange="layerFieldChange(${i},'state',this.value)">${soilStateOptions(l.state)}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Глубина подошвы, м</label>
        <input type="number" step="0.01" value="${l.depth_m || 0}" onchange="layerFieldChange(${i},'depth_m',this.value)"></div>
      <div class="field"><label>Мерзлота</label>
        <select onchange="layerFieldChange(${i},'frozen_state',this.value)">${frozenOptions(l.frozen_state || '')}</select></div>
    </div>
    <div class="field"><label>Описание</label>
      <textarea onchange="layerFieldChange(${i},'description',this.value)">${esc(l.description || '')}</textarea></div>
    <div>${(l.samples || []).map((s, si) => sampleCardHtml(s, i, si)).join('')}</div>
  </div>`;
}

function sampleCardHtml(s, li, si) {
  const ctOpts = COLLECTION_TYPES.map(t => `<option ${t === s.collection_type ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `
  <div class="sample-card" data-si="${si}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <b>Проба ${si + 1}</b>
      <button class="btn small danger" style="padding:2px 6px;font-size:11px" onclick="delSample(${li},${si})">🗑</button>
    </div>
    <div class="field-row">
      <div class="field"><label>Тип отбора</label>
        <select onchange="sampleFieldChange(${li},${si},'collection_type',this.value)"><option value="">—</option>${ctOpts}</select></div>
      <div class="field"><label>Упаковка</label>
        <input value="${esc(s.packaging || '')}" onchange="sampleFieldChange(${li},${si},'packaging',this.value)"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Глубина, м</label>
        <input type="number" step="0.01" value="${s.depth_m ?? ''}" onchange="sampleFieldChange(${li},${si},'depth_m',this.value)"></div>
      <div class="field"><label>от</label>
        <input type="number" step="0.01" value="${s.depth_top_m ?? ''}" onchange="sampleFieldChange(${li},${si},'depth_top_m',this.value)"></div>
      <div class="field"><label>до</label>
        <input type="number" step="0.01" value="${s.depth_bottom_m ?? ''}" onchange="sampleFieldChange(${li},${si},'depth_bottom_m',this.value)"></div>
    </div>
  </div>`;
}

function addLayer() {
  _bh.soil_layers.push({ uuid: crypto.randomUUID(), order_idx: _bh.soil_layers.length,
    soil_type: SOIL_TYPES_DEFAULT[0], state: '', description: '', depth_m: 0,
    frozen_state: '', samples: [] });
  renderLayersTab(document.getElementById('tab-pane'));
}
function delLayer(i) {
  _bh.soil_layers.splice(i, 1);
  renderLayersTab(document.getElementById('tab-pane'));
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
}
function addSample(li) {
  _bh.soil_layers[li].samples = _bh.soil_layers[li].samples || [];
  _bh.soil_layers[li].samples.push({ uuid: crypto.randomUUID(), collection_type: 'Монолит', packaging: '', depth_m: null });
  renderLayersTab(document.getElementById('tab-pane'));
}
function delSample(li, si) {
  _bh.soil_layers[li].samples.splice(si, 1);
  renderLayersTab(document.getElementById('tab-pane'));
}
function sampleFieldChange(li, si, field, val) {
  const s = _bh.soil_layers[li].samples[si];
  s[field] = ['depth_m', 'depth_top_m', 'depth_bottom_m'].includes(field)
    ? (val === '' ? null : parseFloat(val)) : val;
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
            <input type="number" step="0.01" value="${u.depth_m || 0}" onchange="_bh.ugv[${i}].depth_m=parseFloat(this.value)||0">
          </div>
        </div>
        <button class="btn small danger" onclick="_bh.ugv.splice(${i},1);renderUgvTab(document.getElementById('tab-pane'))">🗑</button>
      </div>`).join('') : '<div class="empty">Отметок УГВ нет</div>'}
  `;
}
function addUgv() {
  _bh.ugv.push({ uuid: crypto.randomUUID(), order_idx: _bh.ugv.length, depth_m: 0 });
  renderUgvTab(document.getElementById('tab-pane'));
}

// ── MMG ──
function renderMmgTab(pane) {
  const list = _bh.mmg;
  pane.innerHTML = `
    <button class="btn primary small" onclick="addMmg()" style="margin-bottom:12px">＋ ММГ</button>
    ${list.length ? list.map((m, i) => `
      <div class="layer-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>ММГ ${i + 1}</b>
          <button class="btn small danger" onclick="_bh.mmg.splice(${i},1);renderMmgTab(document.getElementById('tab-pane'))">🗑</button>
        </div>
        <div class="field-row">
          <div class="field"><label>От, м</label><input type="number" step="0.01" value="${m.top_m || 0}" onchange="_bh.mmg[${i}].top_m=parseFloat(this.value)||0"></div>
          <div class="field"><label>До, м</label><input type="number" step="0.01" value="${m.bottom_m || 0}" onchange="_bh.mmg[${i}].bottom_m=parseFloat(this.value)||0"></div>
        </div>
        <div class="field"><label>Описание</label><textarea onchange="_bh.mmg[${i}].description=this.value">${esc(m.description || '')}</textarea></div>
      </div>`).join('') : '<div class="empty">ММГ-отметок нет</div>'}
  `;
}
function addMmg() {
  _bh.mmg.push({ uuid: crypto.randomUUID(), order_idx: _bh.mmg.length, top_m: 0, bottom_m: 0, description: '' });
  renderMmgTab(document.getElementById('tab-pane'));
}

// ── SAVE / FINALIZE ──
async function saveBh() {
  if (!_bh) return;
  const headerData = (_activeTab === 'header') ? readHeader() : {};
  const body = { ..._bh, ...headerData };
  try {
    const r = await api('/boreholes/' + _bh.uuid, { method: 'PUT', body: JSON.stringify(body) });
    _bh = r.borehole;
    toast('Сохранено', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}

async function finalizeBh() {
  await saveBh();
  try {
    await api('/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', body: JSON.stringify({}) });
    toast('Скважина завершена', 'ok');
    navBack();
  } catch (e) {
    if (e.message === 'validation' || /validation/i.test(e.message)) {
      // получили issues
      try {
        const r = await fetch(API + '/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json();
        confirm2('Есть незаполненные данные', (j.issues || []).join('\n• '), async () => {
          await api('/boreholes/' + _bh.uuid + '/finalize', { method: 'POST', body: JSON.stringify({ force: true }) });
          toast('Скважина завершена с предупреждениями', 'warn');
          navBack();
        }, { confirmLabel: 'Всё равно завершить', danger: false });
      } catch (_) { toast('Ошибка: ' + e.message, 'err'); }
    } else toast('Ошибка: ' + e.message, 'err');
  }
}

async function reopenBh() {
  await api('/boreholes/' + _bh.uuid + '/reopen', { method: 'POST' });
  toast('Возвращено в черновик', 'ok');
  renderBoreholeEdit(_bh.uuid, _bhVolumeId);
}
