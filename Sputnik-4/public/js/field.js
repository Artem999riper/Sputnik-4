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
  if (!await confirmDlg(`Удалить ${sel.length} скважин(у) со всеми данными?`)) return;
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
          ${bhs.map(b => {
            const isUpdate = b.duplicateStatus === 'update';
            const statusBadge = isUpdate
              ? `<span style="color:var(--acc);font-size:10px;font-weight:700">♻️ обновление</span>`
              : `<span style="color:var(--grn,#15803d);font-size:10px;font-weight:700">🆕</span>`;
            const updateChk = isUpdate
              ? `<label style="font-size:11px;color:var(--tx3);margin-left:4px">
                   <input type="checkbox" class="spk-update-chk" data-uuid="${escAttr(b.uuid)}" checked> данные
                 </label>`
              : '';
            const photoChk = (isUpdate && b.existingPhotoCount > 0)
              ? `<label style="font-size:11px;color:var(--tx3);margin-left:4px">
                   <input type="checkbox" class="spk-photo-chk" data-uuid="${escAttr(b.uuid)}"> 📷 заменить ${b.existingPhotoCount} фото
                 </label>`
              : '';
            return `
            <label class="spk-bh-row" style="flex-wrap:wrap;gap:2px">
              <input type="checkbox" class="spk-bh-chk" data-uuid="${escAttr(b.uuid)}" data-date="${escAttr(date)}" checked>
              <span class="spk-bh-name">${esc(b.name)}</span>
              <span class="spk-bh-meta">${fieldWorkLabel(b.work_type)} · ${b.planned_depth_m} м</span>
              ${statusBadge}${updateChk}${photoChk}
            </label>`;
          }).join('')}
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

  const updateDataUuids = [...document.querySelectorAll('.spk-update-chk:checked')].map(cb => cb.dataset.uuid);
  const replacePhotoUuids = [...document.querySelectorAll('.spk-photo-chk:checked')].map(cb => cb.dataset.uuid);

  closeModal();
  await fieldUploadSpkToVolume(file, volumeId, selectedUuids, updateDataUuids, replacePhotoUuids);
  fieldPreviewFile = null;
  fieldPreviewVolumeId = null;
}

async function fieldUploadSpkToVolume(file, volumeId, filterUuids, updateDataUuids, replacePhotoUuids) {
  if (!file) return;
  const fd = new FormData();
  fd.append('spk', file);
  fd.append('user_name', un());
  if (filterUuids) fd.append('filter_uuids', JSON.stringify(filterUuids));
  if (updateDataUuids) fd.append('update_data_uuids', JSON.stringify(updateDataUuids));
  if (replacePhotoUuids) fd.append('replace_photo_uuids', JSON.stringify(replacePhotoUuids));
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
  if (!await confirmDlg('Удалить запись об этом импорте?')) return;
  try {
    const r = await fetch(`${API}/field/imports/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast('Ошибка удаления', 'err'); return; }
    fieldImports = fieldImports.filter(x => x.id !== id);
    renderFieldImports();
    toast('Запись удалена', 'ok');
  } catch (e) { toast('Ошибка удаления', 'err'); }
}

async function deleteAllFieldImports() {
  if (!await confirmDlg(`Удалить все ${fieldImports.length} записей об импортах?`)) return;
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
              ${(samplesByLayer[l.uuid]).map(s => {
                const depthStr = s.depth_top_m != null && s.depth_bottom_m != null
                  ? `${fmt(s.depth_top_m)}–${fmt(s.depth_bottom_m)} м`
                  : s.depth_m != null ? `${fmt(s.depth_m)} м` : '—';
                return `<div class="field-sample-row">🧪 ${esc(s.collection_type || '—')} · ${esc(s.packaging || '—')} · ${depthStr}</div>`;
              }).join('')}
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
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <select id="fbh-photo-cat" style="padding:4px 6px">
          <option value="vyrabotka">Выработка</option>
          <option value="drilling">Бурение</option>
          <option value="core_box">Керн</option>
          <option value="journal">Журнал</option>
        </select>
        <input id="fbh-photo-input" type="file" accept="image/jpeg,image/png" multiple style="display:none"
               onchange="fbhUploadPhotos('${escAttr(b.uuid)}')">
        <button class="bp" onclick="document.getElementById('fbh-photo-input').click()">➕ Добавить фото</button>
        <span id="fbh-photo-status" style="font-size:12px;color:#666"></span>
      </div>
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
      { label: '📁 Проводник', cls: 'bs', fn: () => fbhOpenFolder(b.uuid) },
      { label: '✏️ Редактировать', cls: 'bs', fn: () => fbhEditCard(b) },
      { label: 'Закрыть', cls: 'bs', fn: closeModal },
    ]);
}

function fbhTab(btnEl, tab) {
  document.querySelectorAll('.wdc-tab').forEach(t => t.classList.remove('on'));
  btnEl.classList.add('on');
  document.querySelectorAll('.wdc-panel').forEach(p => p.style.display = p.dataset.panel === tab ? '' : 'none');
}

async function fbhUploadPhotos(bhUuid) {
  const input = document.getElementById('fbh-photo-input');
  const status = document.getElementById('fbh-photo-status');
  const catSel = document.getElementById('fbh-photo-cat');
  if (!input || !input.files || !input.files.length) return;
  const fd = new FormData();
  for (const f of input.files) fd.append('photos', f);
  fd.append('category', catSel ? catSel.value : 'vyrabotka');
  fd.append('user_name', un());
  if (status) status.textContent = 'Загрузка…';
  try {
    const r = await fetch(`${API}/field/boreholes/${bhUuid}/photos`, { method: 'POST', body: fd });
    if (!r.ok) { toast('Ошибка загрузки', 'err'); if (status) status.textContent = ''; return; }
    const data = await r.json();
    toast(`Добавлено фото: ${(data.added || []).length}`, 'ok');
    input.value = '';
    closeModal();
    openFieldBoreholeCard(bhUuid);
  } catch (e) {
    toast('Ошибка загрузки', 'err');
    if (status) status.textContent = '';
  }
}

async function fbhDelete(uuid) {
  if (!await confirmDlg('Удалить скважину со всеми слоями, пробами, УГВ, ММГ, фото и связанным фактом объёма?')) return;
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

async function fbhOpenFolder(uuid) {
  try {
    const r = await fetch(`${API}/field/boreholes/${uuid}/open-folder`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) { toast('Не удалось открыть папку: ' + (j.error || ''), 'err'); return; }
    toast('Папка открыта: ' + (j.path || ''), 'ok');
  } catch (e) { toast('Ошибка открытия папки', 'err'); }
}

function fbhEditCard(b) {
  const fld = (id, lbl, val, type='text') =>
    `<div class="fg"><label>${lbl}</label><input id="${id}" type="${type}" value="${escAttr(val == null ? '' : val)}"></div>`;
  const ta = (id, lbl, val) =>
    `<div class="fg s2"><label>${lbl}</label><textarea id="${id}" rows="2">${esc(val == null ? '' : val)}</textarea></div>`;
  const layersHtml = (b.layers || []).map((l, i) => `
    <div class="field-layer-card" style="margin-bottom:6px;padding:6px;background:var(--s2);border-radius:6px">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px">Слой ${i + 1}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <div class="fg"><label>Тип грунта</label><input id="fl-type-${i}" value="${escAttr(l.soil_type||'')}"></div>
        <div class="fg"><label>Состояние</label><input id="fl-state-${i}" value="${escAttr(l.state||'')}"></div>
        <div class="fg"><label>До (м)</label><input id="fl-depth-${i}" type="number" step="0.01" value="${l.depth_m||''}"></div>
        <div class="fg"><label>Описание</label><input id="fl-desc-${i}" value="${escAttr(l.description||'')}"></div>
      </div>
    </div>`).join('');
  const ugvHtml = (b.ugv || []).map((u, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <span style="font-size:11px;min-width:40px">УГВ ${i + 1}</span>
      <div class="fg" style="margin:0;flex:1"><label>Глубина (м)</label><input id="fu-depth-${i}" type="number" step="0.01" value="${u.depth_m||''}"></div>
      <div class="fg" style="margin:0;flex:2"><label>Описание</label><input id="fu-desc-${i}" value="${escAttr(u.description||'')}"></div>
    </div>`).join('');

  showModal(`✏️ Редактировать: ${esc(b.name || 'Скважина')}`,
    `<div class="fgr fone" style="max-height:65vh;overflow-y:auto">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${fld('fe-name','Название',b.name)}
        ${fld('fe-date','Дата бурения',b.drill_date||'','date')}
        ${fld('fe-depth','Плановая глубина (м)',b.planned_depth_m||'','number')}
        ${fld('fe-diam','Диаметр (мм)',b.diameter_mm||'','number')}
      </div>
      ${ta('fe-geomorph','Геоморфология',b.geomorph_desc)}
      ${ta('fe-desc','Описание',b.description)}
      ${b.layers && b.layers.length ? `<h5 style="margin:10px 0 5px">Слои (${b.layers.length})</h5>${layersHtml}` : ''}
      ${b.ugv && b.ugv.length ? `<h5 style="margin:10px 0 5px">УГВ (${b.ugv.length})</h5>${ugvHtml}` : ''}
    </div>`,
    [
      { label: 'Отмена', cls: 'bs', fn: closeModal },
      { label: '💾 Сохранить', cls: 'bp', fn: async () => {
        const layers = (b.layers || []).map((l, i) => ({
          uuid: l.uuid,
          soil_type: document.getElementById(`fl-type-${i}`)?.value || '',
          state: document.getElementById(`fl-state-${i}`)?.value || '',
          depth_m: parseFloat(document.getElementById(`fl-depth-${i}`)?.value) || 0,
          description: document.getElementById(`fl-desc-${i}`)?.value || '',
          frozenness: l.frozenness || '', color: l.color || '', ice_content: l.ice_content || '',
        }));
        const ugv = (b.ugv || []).map((u, i) => ({
          uuid: u.uuid,
          depth_m: parseFloat(document.getElementById(`fu-depth-${i}`)?.value) || 0,
          description: document.getElementById(`fu-desc-${i}`)?.value || '',
        }));
        const body = {
          name: document.getElementById('fe-name')?.value || b.name,
          drill_date: document.getElementById('fe-date')?.value || b.drill_date,
          planned_depth_m: parseFloat(document.getElementById('fe-depth')?.value) || b.planned_depth_m,
          diameter_mm: parseFloat(document.getElementById('fe-diam')?.value) || b.diameter_mm,
          geomorph_desc: document.getElementById('fe-geomorph')?.value,
          description: document.getElementById('fe-desc')?.value,
          layers, ugv,
        };
        try {
          const r = await fetch(`${API}/field/boreholes/${b.uuid}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (!r.ok) { toast('Ошибка сохранения', 'err'); return; }
          toast('Сохранено', 'ok');
          closeModal();
          openFieldBoreholeCard(b.uuid);
        } catch (e) { toast('Ошибка', 'err'); }
      }},
    ]);
}

// ── Excel-экспорт всех полевых материалов ──────────────────
async function fieldExportExcel() {
  if (typeof XLSX === 'undefined') { toast('Библиотека XLSX не загружена', 'err'); return; }
  toast('Готовим Excel…');
  let data;
  try {
    const r = await fetch(`${API}/field/export-data`);
    if (!r.ok) { toast('Ошибка получения данных', 'err'); return; }
    data = await r.json();
  } catch (e) { toast('Ошибка получения данных', 'err'); return; }

  // Стили (миррор pgk.js)
  const border = {
    top: { style: 'thin', color: { rgb: '808080' } }, bottom: { style: 'thin', color: { rgb: '808080' } },
    left: { style: 'thin', color: { rgb: '808080' } }, right: { style: 'thin', color: { rgb: '808080' } },
  };
  const baseAlign = { horizontal: 'center', vertical: 'center', wrapText: true };
  const titleStyle = { font: { bold: true, sz: 14 }, alignment: baseAlign, fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } }, border };
  const headerStyle = { font: { bold: true, sz: 11 }, alignment: baseAlign, fill: { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } }, border };
  const bodyStyle = (alt) => ({ font: { sz: 11 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? 'DDEBF7' : 'FFFFFF' } }, border });

  function colLetter(c) { let s = '', n = c; do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
  function ref(r, c) { return colLetter(c) + (r + 1); }
  function setStyle(ws, cellRef, style) { if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }; ws[cellRef].s = style; }

  function bhMap() {
    const m = {};
    (data.boreholes || []).forEach(b => { m[b.uuid] = b; });
    return m;
  }
  const bhById = bhMap();
  const photoCount = {};
  (data.photos || []).forEach(p => { photoCount[p.borehole_uuid] = p.cnt; });

  function fmtCoords(b) {
    if (b.lat == null || b.lng == null) return '';
    return `${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}`;
  }
  function bhLabel(uuid) {
    const b = bhById[uuid];
    return b ? (b.name || `Скв-${uuid.slice(0, 6)}`) : uuid.slice(0, 8);
  }
  function siteOf(uuid) { return bhById[uuid]?.site_name || '—'; }

  function buildSheet(title, cols, rows, widths) {
    const aoa = [[title], [], cols];
    rows.forEach(row => aoa.push(row));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
    ws['!freeze'] = { ySplit: 3 };
    setStyle(ws, ref(0, 0), titleStyle);
    for (let c = 0; c < cols.length; c++) setStyle(ws, ref(2, c), headerStyle);
    for (let r = 0; r < rows.length; r++) {
      const alt = r % 2 === 1;
      for (let c = 0; c < cols.length; c++) setStyle(ws, ref(r + 3, c), bodyStyle(alt));
    }
    return ws;
  }

  // Лист 1 — Сводка
  const summaryCols = ['№', 'Объект', 'Объём', 'Скважина', 'Дата', 'Тип работ', 'Глубина план, м', 'Диаметр, мм', 'Координаты', 'Слоёв', 'Проб', 'Фото', 'УГВ', 'ММГ', 'Импортирована'];
  const layersByBh = {}, samplesByBh = {}, ugvByBh = {}, mmgByBh = {};
  (data.layers || []).forEach(l => { (layersByBh[l.borehole_uuid] = layersByBh[l.borehole_uuid] || []).push(l); });
  (data.samples || []).forEach(s => { (samplesByBh[s.borehole_uuid] = samplesByBh[s.borehole_uuid] || []).push(s); });
  (data.ugv || []).forEach(u => { (ugvByBh[u.borehole_uuid] = ugvByBh[u.borehole_uuid] || []).push(u); });
  (data.mmg || []).forEach(m => { (mmgByBh[m.borehole_uuid] = mmgByBh[m.borehole_uuid] || []).push(m); });

  const summaryRows = (data.boreholes || []).map((b, i) => [
    i + 1, b.site_name || '—', b.volume_name || '—', b.name || `Скв-${b.uuid.slice(0, 6)}`,
    b.drill_date || '—', b.work_type || '—',
    b.planned_depth_m || 0, b.diameter_mm || 0, fmtCoords(b),
    (layersByBh[b.uuid] || []).length, (samplesByBh[b.uuid] || []).length,
    photoCount[b.uuid] || 0, (ugvByBh[b.uuid] || []).length, (mmgByBh[b.uuid] || []).length,
    b.imported_at ? b.imported_at.slice(0, 10) : '',
  ]);

  // Лист 2 — Слои
  const layerCols = ['№', 'Объект', 'Скважина', '№ слоя', 'Тип грунта', 'Состояние', 'Глубина, м', 'Описание'];
  const layerRows = (data.layers || []).map((l, i) => [
    i + 1, siteOf(l.borehole_uuid), bhLabel(l.borehole_uuid),
    l.order_idx + 1, l.soil_type || '—', l.state || '', l.depth_m || 0, l.description || '',
  ]);

  // Лист 3 — Пробы
  const sampleCols = ['№', 'Объект', 'Скважина', 'Слой', 'Глубина пробы, м', 'Тип отбора', 'Упаковка'];
  const sampleRows = (data.samples || []).map((s, i) => [
    i + 1, siteOf(s.borehole_uuid), bhLabel(s.borehole_uuid),
    s.layer_soil_type || '—', s.depth_m || 0, s.collection_type || '', s.packaging || '',
  ]);

  // Лист 4 — УГВ
  const ugvCols = ['№', 'Объект', 'Скважина', '№ замера', 'Глубина УГВ, м', 'Дата бурения'];
  const ugvRows = (data.ugv || []).map((u, i) => [
    i + 1, siteOf(u.borehole_uuid), bhLabel(u.borehole_uuid),
    u.order_idx + 1, u.depth_m || 0, bhById[u.borehole_uuid]?.drill_date || '',
  ]);

  // Лист 5 — ММГ
  const mmgCols = ['№', 'Объект', 'Скважина', 'Кровля, м', 'Подошва, м', 'Описание'];
  const mmgRows = (data.mmg || []).map((m, i) => [
    i + 1, siteOf(m.borehole_uuid), bhLabel(m.borehole_uuid),
    m.top_m || 0, m.bottom_m || 0, m.description || '',
  ]);

  // Лист 6 — Импорты
  const importCols = ['№', 'Дата импорта', 'Файл', 'Кем', 'Новых скв.', 'Обновлено', 'Фото добавлено', 'Статус'];
  const importRows = (data.imports || []).map((imp, i) => {
    let counts = {}; try { counts = JSON.parse(imp.counts_json || '{}'); } catch (e) {}
    return [
      i + 1, (imp.imported_at || '').replace('T', ' ').slice(0, 16), imp.filename || '—',
      imp.imported_by || '—', counts.added || 0, counts.skipped || 0,
      counts.photos_added || 0, imp.status || '—',
    ];
  });

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('ru-RU');
  XLSX.utils.book_append_sheet(wb, buildSheet(`Сводка скважин — ${today}`, summaryCols, summaryRows,
    [5, 22, 18, 22, 12, 14, 14, 12, 24, 8, 8, 8, 8, 8, 13]), 'Сводка');
  XLSX.utils.book_append_sheet(wb, buildSheet(`Слои грунта — ${today}`, layerCols, layerRows,
    [5, 22, 22, 8, 18, 14, 12, 40]), 'Слои грунта');
  XLSX.utils.book_append_sheet(wb, buildSheet(`Пробы — ${today}`, sampleCols, sampleRows,
    [5, 22, 22, 18, 14, 16, 14]), 'Пробы');
  XLSX.utils.book_append_sheet(wb, buildSheet(`Уровень грунтовых вод — ${today}`, ugvCols, ugvRows,
    [5, 22, 22, 10, 14, 14]), 'УГВ');
  XLSX.utils.book_append_sheet(wb, buildSheet(`Многолетнемёрзлые грунты — ${today}`, mmgCols, mmgRows,
    [5, 22, 22, 12, 12, 40]), 'ММГ');
  XLSX.utils.book_append_sheet(wb, buildSheet(`История импортов — ${today}`, importCols, importRows,
    [5, 18, 32, 18, 10, 10, 14, 10]), 'Импорты');

  const fname = `Полевые_материалы_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast(`✓ ${fname}`, 'ok');
}

async function fieldExportRefs() {
  const sitesList = (typeof sites !== 'undefined' ? sites : []).filter(s => s.name);
  const sitesHtml = sitesList.length
    ? sitesList.map(s =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer">
          <input type="checkbox" class="refs-site-cb" value="${escAttr(s.id)}" checked> ${esc(s.name)}
        </label>`).join('')
    : `<span style="color:var(--tx3);font-size:11px">Нет активных объектов</span>`;

  showModal('⬇️ Экспорт справочников',
    `<div class="fgr">
      <div style="font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Включить в файл:</div>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer">
        <input type="checkbox" id="refs-cb-workers" checked>
        <span>Работники</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer">
        <input type="checkbox" id="refs-cb-transport" checked>
        <span>Техника</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer">
        <input type="checkbox" id="refs-cb-sites" checked onchange="
          var s=document.getElementById('refs-sites-sect');
          s.style.opacity=this.checked?'1':'0.4';
          s.style.pointerEvents=this.checked?'':'none'">
        <span>Объекты и KML-точки</span>
      </label>
      <div id="refs-sites-sect" style="margin-top:4px;padding-left:22px;border-left:2px solid var(--bd)">
        <div style="font-size:11px;font-weight:600;color:var(--tx2);margin-bottom:4px">Какие объекты:</div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:2px 0">
          <input type="radio" name="refs-site-sel" value="all" checked
            onchange="document.getElementById('refs-sites-list').style.display='none'">
          Все активные
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:2px 0">
          <input type="radio" name="refs-site-sel" value="pick"
            onchange="document.getElementById('refs-sites-list').style.display=''">
          Выбрать вручную
        </label>
        <div id="refs-sites-list" style="display:none;max-height:160px;overflow-y:auto;margin-top:6px;padding-left:14px">
          ${sitesHtml}
        </div>
      </div>
    </div>`,
    [
      {label:'Отмена', cls:'bs', fn:closeModal},
      {label:'⬇️ Скачать', cls:'bp', fn: async () => {
        const incWorkers   = document.getElementById('refs-cb-workers').checked;
        const incTransport = document.getElementById('refs-cb-transport').checked;
        const incSites     = document.getElementById('refs-cb-sites').checked;
        const siteMode     = document.querySelector('input[name="refs-site-sel"]:checked')?.value;
        const selSites     = siteMode === 'pick'
          ? [...document.querySelectorAll('.refs-site-cb:checked')].map(cb => cb.value)
          : null;
        closeModal();
        try {
          const r = await fetch(`${API}/field/refs/export`);
          if (!r.ok) { toast('Не удалось получить справочники', 'err'); return; }
          const data = await r.json();
          const out = { version: data.version, exported_at: new Date().toISOString() };
          out.workers   = incWorkers   ? (data.workers   || []) : [];
          out.transport = incTransport ? (data.transport || []) : [];
          if (incSites) {
            out.sites = selSites
              ? (data.sites || []).filter(s => selSites.includes(s.id))
              : (data.sites || []);
            const siteSet = new Set(out.sites.map(s => s.id));
            out.kml_points = (data.kml_points || []).filter(p => siteSet.has(p.site_id));
          } else {
            out.sites = [];
            out.kml_points = [];
          }
          const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `refs_${new Date().toISOString().slice(0,10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast('Справочники сохранены — передайте полевику', 'ok');
        } catch(e) { toast('Ошибка экспорта', 'err'); }
      }}
    ]);
}
