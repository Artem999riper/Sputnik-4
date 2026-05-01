// ═══════════════════════════════════════════════════════════
// field.js — UI вкладки «Полевые материалы»
// ═══════════════════════════════════════════════════════════

let fieldImports = [];
let fieldBoreholes = [];

async function loadField() {
  try {
    const [ir, br] = await Promise.all([
      fetch(`${API}/field/imports`),
      fetch(`${API}/field/boreholes`),
    ]);
    fieldImports   = ir.ok ? await ir.json() : [];
    fieldBoreholes = br.ok ? await br.json() : [];
  } catch (e) {
    fieldImports = [];
    fieldBoreholes = [];
    toast('⚠️ Не удалось загрузить полевые материалы', 'err');
  }
  renderFieldSiteFilter();
  renderFieldImports();
  renderFieldBoreholes();
}

function renderFieldSiteFilter() {
  const sel = document.getElementById('field-site-filter');
  if (!sel) return;
  const cur = sel.value;
  const siteIds = [...new Set(fieldBoreholes.map(b => b.site_id).filter(Boolean))];
  const opts = ['<option value="">Все объекты</option>'];
  siteIds.forEach(sid => {
    const s = (sites || []).find(x => x.id === sid);
    opts.push(`<option value="${escAttr(sid)}">${esc(s ? s.name : sid)}</option>`);
  });
  sel.innerHTML = opts.join('');
  sel.value = cur;
}

function renderFieldImports() {
  const box = document.getElementById('field-imports-list');
  if (!box) return;
  if (!fieldImports.length) {
    box.innerHTML = '<div class="empty"><div class="empty-i">📥</div>Архивов пока нет — загрузите .spk</div>';
    return;
  }
  box.innerHTML = fieldImports.map(imp => {
    const c = imp.counts || {};
    const status = imp.status === 'ok' ? '✓' : (imp.status === 'partial' ? '⚠' : '✗');
    const statusColor = imp.status === 'ok' ? 'var(--grn)' : (imp.status === 'partial' ? 'var(--ylw)' : 'var(--red)');
    return `
      <div class="field-import-row">
        <div class="field-import-status" style="color:${statusColor}">${status}</div>
        <div class="field-import-main">
          <div class="field-import-name">${esc(imp.filename || '—')}</div>
          <div class="field-import-meta">
            ${esc(fmtDT(imp.imported_at))} ·
            +${c.added || 0} добавлено · ${c.skipped || 0} пропущено${c.errors ? ` · <span style="color:var(--red)">${c.errors} ошибок</span>` : ''}
            ${c.photos_added ? ` · 📷 ${c.photos_added}` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderFieldBoreholes() {
  const box = document.getElementById('field-bh-list');
  if (!box) return;
  const siteFilter = (document.getElementById('field-site-filter') || {}).value || '';
  const list = siteFilter ? fieldBoreholes.filter(b => b.site_id === siteFilter) : fieldBoreholes;
  if (!list.length) {
    box.innerHTML = '<div class="empty"><div class="empty-i">🕳️</div>Скважины не загружены</div>';
    return;
  }
  box.innerHTML = list.map(b => {
    const s = (sites || []).find(x => x.id === b.site_id);
    return `
      <div class="field-bh-card" onclick="openFieldBoreholeCard('${escAttr(b.uuid)}')">
        <div class="field-bh-head">
          <div class="field-bh-name">${esc(b.name || ('Скв-' + b.uuid.slice(0, 6)))}</div>
          <div class="field-bh-type">${esc(b.work_type || '—')}</div>
        </div>
        <div class="field-bh-meta">
          📅 ${esc(b.drill_date || '—')} ·
          📏 ${b.planned_depth_m || 0} м ·
          ⌀ ${b.diameter_mm || 0} мм
          ${s ? ` · 📍 ${esc(s.name)}` : ''}
        </div>
      </div>`;
  }).join('');
}

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
        <div class="mdc-row"><div class="mdc-lbl">Тип работ</div><div class="mdc-val">${esc(fmt(b.work_type))}</div></div>
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
  if (!confirm('Удалить скважину со всеми слоями, пробами, УГВ, ММГ и фото?')) return;
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

async function fieldUploadSpk(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('spk', file);
  fd.append('user_name', un());
  toast(`Загрузка ${file.name}...`);
  try {
    const r = await fetch(`${API}/field/import`, { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) { toast('❌ ' + (data.error || 'Ошибка импорта'), 'err'); return; }
    toast(`✓ +${data.added} скважин · ${data.skipped} пропущено · 📷 ${data.photos_added}`, 'ok');
    document.getElementById('field-spk-input').value = '';
    loadField();
  } catch (e) { toast('Ошибка загрузки', 'err'); }
}
