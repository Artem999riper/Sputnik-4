// ═══════════════════════════════════════════════════════════
// field.js — UI вкладки «Полевые материалы» (v2)
// Workflow: объект → объём → загрузка .spk
// ═══════════════════════════════════════════════════════════

let fieldImports = [];
let fieldExpandedSites = {};       // siteId -> bool
let fieldExpandedVolumes = {};     // volId  -> bool
let fieldVolumeBhCache = {};       // volId  -> [boreholes]
let fieldSiteVolumesCache = {};    // siteId -> [volumes]
let fieldSelectedBhs = {};         // volId  -> Set<uuid>
let fieldCollapsedDates = {};      // volId+':'+date -> bool
let fieldPendingVolumeId = null;
let fieldPreviewFile = null;       // File object held during preview dialog
let fieldPreviewVolumeId = null;

const FIELD_WORK_TYPES = {
  SEARCH: 'Поисковая', EXPLORATION: 'Разведочная',
  TRENCH: 'Шурф', GEOLOGICAL: 'Геологическая',
};
const fieldWorkLabel = t => FIELD_WORK_TYPES[t] || t || '—';

async function loadField() {
  try {
    const ir = await fetch(`${API}/field/imports`);
    fieldImports = ir.ok ? await ir.json() : [];
  } catch (e) {
    fieldImports = [];
    toast('⚠️ Не удалось загрузить полевые материалы', 'err');
  }
  renderFieldBySites();
  renderFieldImports();
}

function switchFieldTab(name) {
  document.querySelectorAll('.field-tab-btn').forEach(b => b.classList.remove('on'));
  const btn = document.getElementById('field-tab-btn-' + name);
  if (btn) btn.classList.add('on');
  document.querySelectorAll('.field-tab-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('field-tab-' + name);
  if (pane) pane.style.display = '';
}

// ── Дерево «Объекты → Объёмы → Скважины» ───────────────────
function renderFieldBySites() {
  const box = document.getElementById('field-by-sites-list');
  if (!box) return;
  const list = (sites || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!list.length) {
    box.innerHTML = '<div class="empty"><div class="empty-i">🏗</div>Объектов нет</div>';
    return;
  }
  box.innerHTML = list.map(s => {
    const expanded = fieldExpandedSites[s.id];
    return `
      <div class="field-site-block">
        <div class="field-site-header" onclick="toggleFieldSite('${escAttr(s.id)}')">
          <span class="field-chev">${expanded ? '▾' : '▸'}</span>
          <b>${esc(s.name || s.id)}</b>
        </div>
        ${expanded ? `<div class="field-site-body" id="fld-site-body-${escAttr(s.id)}">${renderFieldVolumesForSite(s.id)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderFieldVolumesForSite(siteId) {
  const cached = fieldSiteVolumesCache[siteId];
  if (cached !== undefined) {
    if (!cached.length) return '<div class="empty" style="padding:8px">Нет объёмов в объекте</div>';
    return `<div id="fld-vols-${escAttr(siteId)}">${cached.map(v => renderFieldVolumeRow(v)).join('')}</div>`;
  }
  return `<div class="field-vols-loading" id="fld-vols-${escAttr(siteId)}">Загрузка…</div>`;
}

async function toggleFieldSite(siteId) {
  fieldExpandedSites[siteId] = !fieldExpandedSites[siteId];
  renderFieldBySites();
  if (fieldExpandedSites[siteId]) {
    try {
      const r = await fetch(`${API}/sites/${siteId}/volumes`);
      const vols = r.ok ? await r.json() : [];
      fieldSiteVolumesCache[siteId] = vols;
      const box = document.getElementById('fld-vols-' + siteId);
      if (!box) return;
      if (!vols.length) {
        box.innerHTML = '<div class="empty" style="padding:8px">Нет объёмов в объекте</div>';
        return;
      }
      box.innerHTML = vols.map(v => renderFieldVolumeRow(v)).join('');
      for (const v of vols) {
        if (fieldExpandedVolumes[v.id]) loadAndRenderVolumeBoreholes(v.id);
      }
    } catch (e) {
      const box = document.getElementById('fld-vols-' + siteId);
      if (box) box.innerHTML = '<div class="empty" style="padding:8px;color:var(--red)">Ошибка загрузки объёмов</div>';
    }
  }
}

function renderFieldVolumeRow(v) {
  const expanded = fieldExpandedVolumes[v.id];
  const cached = fieldVolumeBhCache[v.id];
  const loadedCount = cached ? cached.length : null;
  return `
    <div class="field-volume-row">
      <div class="field-volume-head">
        <span class="field-chev" onclick="toggleFieldVolume('${escAttr(v.id)}')">${expanded ? '▾' : '▸'}</span>
        <div class="field-volume-name" onclick="toggleFieldVolume('${escAttr(v.id)}')">
          <b>${esc(v.name || '—')}</b>
          <span class="field-volume-meta">${v.amount || 0} ${esc(v.unit || '')}${loadedCount != null ? ` · загружено: ${loadedCount}` : ''}</span>
        </div>
        <button class="btn bp bsm field-volume-spk-btn" onclick="triggerSpkUploadForVolume('${escAttr(v.id)}')">📥 Подгрузить .spk</button>
      </div>
      ${expanded ? `<div class="field-volume-bh-list" id="fld-vol-bh-${escAttr(v.id)}">${cached ? renderFieldVolumeBoreholesHtml(cached, v.id) : 'Загрузка…'}</div>` : ''}
    </div>`;
}

async function toggleFieldVolume(volumeId) {
  fieldExpandedVolumes[volumeId] = !fieldExpandedVolumes[volumeId];
  renderFieldBySites();
  for (const sid in fieldExpandedSites) {
    if (fieldExpandedSites[sid]) await toggleFieldSiteRefresh(sid);
  }
  if (fieldExpandedVolumes[volumeId]) await loadAndRenderVolumeBoreholes(volumeId);
}

// Re-fetch volumes for an already-expanded site without toggling
async function toggleFieldSiteRefresh(siteId) {
  try {
    const r = await fetch(`${API}/sites/${siteId}/volumes`);
    const vols = r.ok ? await r.json() : [];
    fieldSiteVolumesCache[siteId] = vols;
    const box = document.getElementById('fld-vols-' + siteId);
    if (!box) return;
    box.innerHTML = vols.length
      ? vols.map(v => renderFieldVolumeRow(v)).join('')
      : '<div class="empty" style="padding:8px">Нет объёмов в объекте</div>';
    for (const v of vols) {
      if (fieldExpandedVolumes[v.id]) loadAndRenderVolumeBoreholes(v.id);
    }
  } catch (e) {}
}

async function loadAndRenderVolumeBoreholes(volumeId) {
  try {
    const r = await fetch(`${API}/field/boreholes/by-volume?volume_id=${encodeURIComponent(volumeId)}`);
    const list = r.ok ? await r.json() : [];
    fieldVolumeBhCache[volumeId] = list;
    const box = document.getElementById('fld-vol-bh-' + volumeId);
    if (box) box.innerHTML = renderFieldVolumeBoreholesHtml(list, volumeId);
  } catch (e) {}
}

function renderFieldVolumeBoreholesHtml(list, volId) {
  if (!list.length) return '<div class="empty" style="padding:8px;font-size:11px">Скважин ещё нет — загрузите .spk</div>';

  const sel = fieldSelectedBhs[volId] || new Set();
  const selCount = sel.size;

  // Группируем по дате
  const byDate = {};
  list.forEach(b => {
    const d = b.drill_date || '—';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(b);
  });
  const dates = Object.keys(byDate).sort().reverse();

  const deleteBtn = selCount > 0
    ? `<button class="btn bd bsm" style="margin:4px 8px 4px 0" onclick="deleteSelectedFieldBhs('${escAttr(volId)}')">🗑 Удалить выбранные (${selCount})</button>`
    : '';
  const clearBtn = selCount > 0
    ? `<button class="btn bs bsm" style="margin:4px 0" onclick="clearFieldBhSelection('${escAttr(volId)}')">✕ Снять выделение</button>`
    : '';

  const groups = dates.map(date => {
    const bhs = byDate[date];
    const dateUuids = bhs.map(b => b.uuid);
    const allChecked = dateUuids.every(u => sel.has(u));
    const collapsed = !!fieldCollapsedDates[volId + ':' + date];
    return `
      <div class="field-date-group">
        <div class="field-date-header">
          <label class="field-date-check" onclick="event.stopPropagation()">
            <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="toggleFieldDateGroup('${escAttr(volId)}','${escAttr(date)}',this.checked)">
          </label>
          <span class="field-date-title" onclick="toggleFieldDateCollapse('${escAttr(volId)}','${escAttr(date)}')">
            <span class="field-chev">${collapsed ? '▸' : '▾'}</span>
            📅 ${esc(date)}
          </span>
          <span class="field-date-count">${bhs.length} скв.</span>
        </div>
        ${collapsed ? '' : bhs.map(b => `
          <div class="field-bh-card ${sel.has(b.uuid) ? 'field-bh-selected' : ''}">
            <label class="field-bh-check">
              <input type="checkbox" ${sel.has(b.uuid) ? 'checked' : ''} onchange="toggleFieldBhSelect('${escAttr(volId)}','${escAttr(b.uuid)}')">
            </label>
            <div class="field-bh-body" onclick="openFieldBoreholeCard('${escAttr(b.uuid)}')">
              <div class="field-bh-head">
                <div class="field-bh-name">${esc(b.name || ('Скв-' + b.uuid.slice(0, 6)))}</div>
                <div class="field-bh-type">${fieldWorkLabel(b.work_type)}</div>
              </div>
              <div class="field-bh-meta">📏 ${b.planned_depth_m || 0} м · ⌀ ${b.diameter_mm || 0} мм</div>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('');

  return `<div class="field-bh-toolbar">${deleteBtn}${clearBtn}</div>${groups}`;
}

function toggleFieldBhSelect(volId, uuid) {
  if (!fieldSelectedBhs[volId]) fieldSelectedBhs[volId] = new Set();
  const s = fieldSelectedBhs[volId];
  if (s.has(uuid)) s.delete(uuid); else s.add(uuid);
  const box = document.getElementById('fld-vol-bh-' + volId);
  if (box && fieldVolumeBhCache[volId]) box.innerHTML = renderFieldVolumeBoreholesHtml(fieldVolumeBhCache[volId], volId);
}

function toggleFieldDateGroup(volId, date, checked) {
  if (!fieldSelectedBhs[volId]) fieldSelectedBhs[volId] = new Set();
  const s = fieldSelectedBhs[volId];
  const list = fieldVolumeBhCache[volId] || [];
  const uuids = list.filter(b => (b.drill_date || '—') === date).map(b => b.uuid);
  uuids.forEach(u => checked ? s.add(u) : s.delete(u));
  const box = document.getElementById('fld-vol-bh-' + volId);
  if (box && fieldVolumeBhCache[volId]) box.innerHTML = renderFieldVolumeBoreholesHtml(fieldVolumeBhCache[volId], volId);
}

function toggleFieldDateCollapse(volId, date) {
  const key = volId + ':' + date;
  fieldCollapsedDates[key] = !fieldCollapsedDates[key];
  const box = document.getElementById('fld-vol-bh-' + volId);
  if (box && fieldVolumeBhCache[volId]) box.innerHTML = renderFieldVolumeBoreholesHtml(fieldVolumeBhCache[volId], volId);
}

function clearFieldBhSelection(volId) {
  delete fieldSelectedBhs[volId];
  const box = document.getElementById('fld-vol-bh-' + volId);
  if (box && fieldVolumeBhCache[volId]) box.innerHTML = renderFieldVolumeBoreholesHtml(fieldVolumeBhCache[volId], volId);
}

async function deleteSelectedFieldBhs(volId) {
  const sel = [...(fieldSelectedBhs[volId] || new Set())];
  if (!sel.length) return;
  if (!confirm(`Удалить ${sel.length} скважин(у) со всеми данными?`)) return;
  let deleted = 0;
  for (const uuid of sel) {
    try {
      const r = await fetch(`${API}/field/boreholes/${uuid}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: un() }),
      });
      if (r.ok) deleted++;
    } catch (e) {}
  }
  delete fieldSelectedBhs[volId];
  toast(`Удалено ${deleted} скважин`, 'ok');
  await loadAndRenderVolumeBoreholes(volId);
  if (typeof refreshCurrent === 'function') refreshCurrent();
  if (typeof repaintMap === 'function') repaintMap();
}

// ── Загрузка .spk в выбранный объём ────────────────────────
function triggerSpkUploadForVolume(volumeId) {
  fieldPendingVolumeId = volumeId;
  const inp = document.getElementById('field-spk-input');
  if (!inp) return;
  inp.value = '';
  inp.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    fieldPreviewFile = file;
    fieldPreviewVolumeId = volumeId;
    await fieldShowSpkPreviewModal(file, volumeId);
  };
  inp.click();
}

async function fieldShowSpkPreviewModal(file, volumeId) {
  const fd = new FormData();
  fd.append('spk', file);
  let preview;
  try {
    const r = await fetch(`${API}/field/preview-spk`, { method: 'POST', body: fd });
    preview = await r.json();
    if (!r.ok) { toast('❌ ' + (preview.error || 'Ошибка чтения архива'), 'err'); return; }
  } catch (e) { toast('Ошибка чтения архива', 'err'); return; }

  const byDate = preview.by_date || {};
  const dates = Object.keys(byDate).sort().reverse();

  const datesHtml = dates.map(date => {
    const bhs = byDate[date];
    return `
      <div class="spk-preview-date">
        <label class="spk-preview-date-lbl">
          <input type="checkbox" class="spk-date-chk" data-date="${escAttr(date)}" checked
                 onchange="fieldPreviewToggleDate('${escAttr(date)}')">
          <b>📅 ${esc(date)}</b>
          <span class="field-date-count">${bhs.length} скв.</span>
        </label>
        <div class="spk-bh-list" id="spk-bh-list-${escAttr(date)}">
          ${bhs.map(b => `
            <label class="spk-bh-row">
              <input type="checkbox" class="spk-bh-chk" data-uuid="${escAttr(b.uuid)}" data-date="${escAttr(date)}" checked>
              <span class="spk-bh-name">${esc(b.name)}</span>
              <span class="spk-bh-meta">${fieldWorkLabel(b.work_type)} · ${b.planned_depth_m} м</span>
            </label>`).join('')}
        </div>
      </div>`;
  }).join('');

  const brigadeHtml = (preview.worker_names && preview.worker_names.length)
    ? `<div class="spk-preview-info">👥 ${esc(preview.worker_names.join(', '))}${preview.machine_name ? ' · 🚜 ' + esc(preview.machine_name) : ''}</div>`
    : '';

  const body = `
    <div class="spk-preview-head">
      <div class="spk-preview-info">📦 ${esc(preview.filename)} · 🕳️ ${preview.total_boreholes} скв. · 📷 ${preview.total_photos} фото</div>
      ${brigadeHtml}
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn bs bsm" onclick="fieldPreviewSelectAll(true)">Выбрать все</button>
        <button class="btn bs bsm" onclick="fieldPreviewSelectAll(false)">Снять все</button>
      </div>
    </div>
    <div class="spk-preview-dates">${datesHtml}</div>`;

  showModal(`📥 Выбор скважин для импорта`, body, [
    { label: 'Импортировать выбранные', cls: 'bp', fn: fieldDoImportFromPreview },
    { label: 'Отмена', cls: 'bs', fn: () => { fieldPreviewFile = null; fieldPreviewVolumeId = null; closeModal(); } },
  ]);
}

function fieldPreviewToggleDate(date) {
  const dateCb = document.querySelector(`.spk-date-chk[data-date="${date}"]`);
  const checked = dateCb ? dateCb.checked : true;
  document.querySelectorAll(`.spk-bh-chk[data-date="${date}"]`).forEach(cb => { cb.checked = checked; });
}

function fieldPreviewSelectAll(checked) {
  document.querySelectorAll('.spk-date-chk, .spk-bh-chk').forEach(cb => { cb.checked = checked; });
}

async function fieldDoImportFromPreview() {
  const file = fieldPreviewFile;
  const volumeId = fieldPreviewVolumeId;
  if (!file || !volumeId) return;

  const selectedUuids = [...document.querySelectorAll('.spk-bh-chk:checked')].map(cb => cb.dataset.uuid);
  if (!selectedUuids.length) { toast('Не выбрано ни одной скважины', 'err'); return; }

  closeModal();
  await fieldUploadSpkToVolume(file, volumeId, selectedUuids);
  fieldPreviewFile = null;
  fieldPreviewVolumeId = null;
}

async function fieldUploadSpkToVolume(file, volumeId, filterUuids) {
  if (!file) return;
  const fd = new FormData();
  fd.append('spk', file);
  fd.append('user_name', un());
  if (filterUuids) fd.append('filter_uuids', JSON.stringify(filterUuids));
  toast(`Импорт ${file.name}…`);
  try {
    const r = await fetch(`${API}/field/import-to-volume?volume_id=${encodeURIComponent(volumeId)}`, {
      method: 'POST', body: fd,
    });
    const data = await r.json();
    if (!r.ok) { toast('❌ ' + (data.error || 'Ошибка импорта'), 'err'); return; }
    toast(`✓ +${data.added} новых · ${data.skipped} обновлено · 📷 ${data.photos_added}`, 'ok');
    document.getElementById('field-spk-input').value = '';
    await loadAndRenderVolumeBoreholes(volumeId);
    await loadField();
    if (typeof refreshCurrent === 'function') refreshCurrent();
    if (typeof repaintMap === 'function') repaintMap();
  } catch (e) { toast('Ошибка загрузки', 'err'); }
}

// ── Список архивов (таб «Все импорты») ─────────────────────
function renderFieldImports() {
  const box = document.getElementById('field-imports-list');
  if (!box) return;
  if (!fieldImports.length) {
    box.innerHTML = '<div class="empty"><div class="empty-i">📥</div>Архивов пока нет — загрузите .spk во вкладке «По объектам»</div>';
    return;
  }
  const toolbar = `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
    <button class="btn bd bsm" onclick="deleteAllFieldImports()">🗑 Удалить все</button>
  </div>`;
  box.innerHTML = toolbar + fieldImports.map(imp => {
    const c = imp.counts || {};
    const m = imp.manifest || {};
    const status = imp.status === 'ok' ? '✓' : (imp.status === 'partial' ? '⚠' : '✗');
    const statusColor = imp.status === 'ok' ? 'var(--grn)' : (imp.status === 'partial' ? 'var(--ylw)' : 'var(--red)');
    const volId = m.volume_id;
    const siteId = m.site_id;
    const volLabel = volId ? (() => {
      const s = (sites || []).find(x => x.id === siteId);
      return ` · 🏗 ${esc(s ? s.name : siteId || '—')}`;
    })() : '';
    return `
      <div class="field-import-row">
        <div class="field-import-status" style="color:${statusColor}">${status}</div>
        <div class="field-import-main">
          <div class="field-import-name">${esc(imp.filename || '—')}</div>
          <div class="field-import-meta">
            ${esc(fmtDT(imp.imported_at))} · +${c.added || 0} новых · ${c.skipped || 0} обновлено${c.errors ? ` · <span style="color:var(--red)">${c.errors} ошибок</span>` : ''}
            ${c.photos_added ? ` · 📷 ${c.photos_added}` : ''}${volLabel}
          </div>
        </div>
        <button class="btn bd bxs" title="Удалить запись" onclick="deleteFieldImport('${esc(imp.id)}')">🗑</button>
      </div>`;
  }).join('');
}

async function deleteFieldImport(id) {
  if (!confirm('Удалить запись об этом импорте?')) return;
  try {
    const r = await fetch(`${API}/field/imports/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast('Ошибка удаления', 'err'); return; }
    fieldImports = fieldImports.filter(x => x.id !== id);
    renderFieldImports();
    toast('Запись удалена', 'ok');
  } catch (e) { toast('Ошибка удаления', 'err'); }
}

async function deleteAllFieldImports() {
  if (!confirm(`Удалить все ${fieldImports.length} записей об импортах?`)) return;
  try {
    const r = await fetch(`${API}/field/imports`, { method: 'DELETE' });
    if (!r.ok) { toast('Ошибка удаления', 'err'); return; }
    fieldImports = [];
    renderFieldImports();
    toast('Все записи удалены', 'ok');
  } catch (e) { toast('Ошибка удаления', 'err'); }
}

// ── Карточка скважины (modal с табами) ─────────────────────
async function openFieldBoreholeCard(uuid) {
  try {
    const r = await fetch(`${API}/field/boreholes/${uuid}`);
    if (!r.ok) { toast('Не удалось загрузить скважину', 'err'); return; }
    const b = await r.json();
    showFieldBoreholeModal(b);
  } catch (e) { toast('Ошибка загрузки', 'err'); }
}

function showFieldBoreholeModal(b) {
  const fmt = v => v == null || v === '' ? '—' : v;
  const samplesByLayer = {};
  (b.samples || []).forEach(s => {
    if (!samplesByLayer[s.layer_uuid]) samplesByLayer[s.layer_uuid] = [];
    samplesByLayer[s.layer_uuid].push(s);
  });

  let brigadeBlock = '';
  try {
    const brig = JSON.parse(b.brigade_info || '{}');
    const memberIds = Array.isArray(brig.members) ? brig.members : [];
    const transportId = brig.transport_id;
    const wn = (pgkWorkers || []).filter(w => memberIds.includes(w.id)).map(w => w.name).join(', ');
    const m = (pgkMachinery || []).find(x => x.id === transportId);
    const machineName = m ? (m.name || m.type || '—') : '';
    if (wn) brigadeBlock += `<div class="mdc-row"><div class="mdc-lbl">Бригада</div><div class="mdc-val">${esc(wn)}</div></div>`;
    if (machineName) brigadeBlock += `<div class="mdc-row"><div class="mdc-lbl">Техника</div><div class="mdc-val">${esc(machineName)}</div></div>`;
  } catch (e) {}

  let volumeBlock = '';
  if (b.volume_id) {
    let volName = b.volume_id;
    for (const vols of Object.values(fieldSiteVolumesCache)) {
      const found = vols.find(v => v.id === b.volume_id);
      if (found) { volName = found.name || b.volume_id; break; }
    }
    volumeBlock = `<div class="mdc-row"><div class="mdc-lbl">Объём</div><div class="mdc-val">${esc(volName)}</div></div>`;
  }

  const tabsHtml = `
    <div class="wdc-tabs">
      <button class="wdc-tab on" data-tab="head" onclick="fbhTab(this,'head')">Шапка</button>
      <button class="wdc-tab" data-tab="layers" onclick="fbhTab(this,'layers')">Слои (${(b.layers || []).length})</button>
      <button class="wdc-tab" data-tab="ugv" onclick="fbhTab(this,'ugv')">УГВ (${(b.ugv || []).length})</button>
      <button class="wdc-tab" data-tab="mmg" onclick="fbhTab(this,'mmg')">ММГ (${(b.mmg || []).length})</button>
      <button class="wdc-tab" data-tab="photos" onclick="fbhTab(this,'photos')">Фото (${(b.photos || []).length})</button>
    </div>`;

  const headHtml = `
    <div class="wdc-panel" data-panel="head">
      <div class="mdc-fields">
        <div class="mdc-row"><div class="mdc-lbl">Объект</div><div class="mdc-val">${esc(((sites || []).find(s => s.id === b.site_id) || {}).name || fmt(b.site_id))}</div></div>
        ${volumeBlock}
        ${brigadeBlock}
        <div class="mdc-row"><div class="mdc-lbl">Тип работ</div><div class="mdc-val">${esc(fieldWorkLabel(b.work_type))}</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Глубина</div><div class="mdc-val">${fmt(b.planned_depth_m)} м</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Диаметр</div><div class="mdc-val">${fmt(b.diameter_mm)} мм</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Дата</div><div class="mdc-val">${esc(fmt(b.drill_date))}</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Координаты</div><div class="mdc-val">${b.lat || '—'}, ${b.lng || '—'}</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Геоморфология</div><div class="mdc-val">${esc(fmt(b.geomorph_desc))}</div></div>
        <div class="mdc-row"><div class="mdc-lbl">Описание</div><div class="mdc-val">${esc(fmt(b.description))}</div></div>
      </div>
    </div>`;

  const layersHtml = `
    <div class="wdc-panel" data-panel="layers" style="display:none">
      ${(b.layers || []).map((l, i) => `
        <div class="field-layer-card">
          <div class="field-layer-head"><b>Слой ${i + 1}</b> · ${esc(fmt(l.soil_type))} · ${esc(fmt(l.state))} · до ${fmt(l.depth_m)} м</div>
          <div class="field-layer-desc">${esc(fmt(l.description))}</div>
          ${(samplesByLayer[l.uuid] || []).length ? `
            <div class="field-samples-list">
              ${(samplesByLayer[l.uuid]).map(s => `<div class="field-sample-row">🧪 ${esc(s.collection_type || '—')} · ${esc(s.packaging || '—')} · ${fmt(s.depth_m)} м</div>`).join('')}
            </div>` : ''}
        </div>`).join('') || '<div class="empty">Слоёв нет</div>'}
    </div>`;

  const ugvHtml = `
    <div class="wdc-panel" data-panel="ugv" style="display:none">
      ${(b.ugv || []).map((u, i) => `<div class="field-row-simple">💧 УГВ${i + 1}: ${fmt(u.depth_m)} м</div>`).join('') || '<div class="empty">УГВ не зафиксированы</div>'}
    </div>`;

  const mmgHtml = `
    <div class="wdc-panel" data-panel="mmg" style="display:none">
      ${(b.mmg || []).map((m, i) => `
        <div class="field-mmg-card">
          <div><b>ММГ${i + 1}</b> · кровля ${fmt(m.top_m)} м · подошва ${fmt(m.bottom_m)} м</div>
          <div class="field-layer-desc">${esc(fmt(m.description))}</div>
        </div>`).join('') || '<div class="empty">ММГ не зафиксированы</div>'}
    </div>`;

  const photosByCat = { vyrabotka: [], drilling: [], core_box: [], journal: [] };
  (b.photos || []).forEach(p => { (photosByCat[p.category] || []).push(p); });
  const catTitle = { vyrabotka: 'Выработка', drilling: 'Бурение', core_box: 'Керн', journal: 'Журнал' };
  const photosHtml = `
    <div class="wdc-panel" data-panel="photos" style="display:none">
      ${Object.keys(photosByCat).map(cat => photosByCat[cat].length ? `
        <h5 style="margin-top:10px">📷 ${catTitle[cat]} (${photosByCat[cat].length})</h5>
        <div class="photo-grid">
          ${photosByCat[cat].map(p => `<img class="photo-thumb" src="${esc(p.file_path)}" onclick="window.open('${escAttr(p.file_path)}','_blank')">`).join('')}
        </div>` : '').join('') || '<div class="empty">Фото нет</div>'}
    </div>`;

  showModal(`🕳️ ${esc(b.name || 'Скважина')}`,
    tabsHtml + headHtml + layersHtml + ugvHtml + mmgHtml + photosHtml,
    [
      { label: 'Удалить', cls: 'bd', fn: () => fbhDelete(b.uuid) },
      { label: 'Закрыть', cls: 'bs', fn: closeModal },
    ]);
}

function fbhTab(btnEl, tab) {
  document.querySelectorAll('.wdc-tab').forEach(t => t.classList.remove('on'));
  btnEl.classList.add('on');
  document.querySelectorAll('.wdc-panel').forEach(p => p.style.display = p.dataset.panel === tab ? '' : 'none');
}

async function fbhDelete(uuid) {
  if (!confirm('Удалить скважину со всеми слоями, пробами, УГВ, ММГ, фото и связанным фактом объёма?')) return;
  try {
    const r = await fetch(`${API}/field/boreholes/${uuid}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_name: un() }),
    });
    if (!r.ok) { toast('Не удалось удалить', 'err'); return; }
    toast('Скважина удалена', 'ok');
    closeModal();
    loadField();
    if (typeof refreshCurrent === 'function') refreshCurrent();
    if (typeof repaintMap === 'function') repaintMap();
  } catch (e) { toast('Ошибка', 'err'); }
}

async function fieldExportRefs() {
  try {
    const r = await fetch(`${API}/field/refs/export`);
    if (!r.ok) { toast('Не удалось экспортировать', 'err'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Справочники сохранены — передайте полевику', 'ok');
  } catch (e) { toast('Ошибка экспорта', 'err'); }
}
