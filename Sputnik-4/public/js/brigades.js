// ═══════════════════════════════════════════════════════════
// brigades.js — Страница «Бригады»
// ═══════════════════════════════════════════════════════════

let pgkBrigades = [];

async function loadBrigades() {
  const pb = document.getElementById('brigades-page');
  if (!pb) return;
  try {
    const [brR, wR, mR, bR, sR] = await Promise.all([
      fetch(`${API}/pgk/brigades`),
      fetch(`${API}/pgk/workers`),
      fetch(`${API}/pgk/machinery`),
      fetch(`${API}/bases`),
      fetch(`${API}/sites`)
    ]);
    if (brR.ok) pgkBrigades = await brR.json(); else pgkBrigades = [];
    if (wR.ok)  window.pgkWorkers   = await wR.json();
    if (mR.ok)  window.pgkMachinery = await mR.json();
    if (bR.ok)  window.bases        = await bR.json();
    if (sR.ok)  window.sites        = await sR.json();
  } catch (e) {
    pgkBrigades = [];
  }
  // Resolve display data from global caches
  pgkBrigades.forEach(br => {
    br.members = (br.member_ids || []).map(id => {
      const w = (window.pgkWorkers || []).find(x => x.id === id);
      if (!w) return { id, name: id, role: '', start_date: null, days: 0 };
      const days = w.start_date ? Math.max(0, Math.floor((Date.now() - new Date(w.start_date)) / 86400000)) : 0;
      return { id, name: w.name, role: w.role || '', start_date: w.start_date, days };
    });
    br.base_names = (br.base_ids || []).map(id => {
      const b = (window.bases || []).find(x => x.id === id);
      return b ? b.name : id;
    });
    br.site_names = (br.site_ids || []).map(id => {
      const s = (window.sites || []).find(x => x.id === id);
      return s ? s.name : id;
    });
    if (br.machine_driver_id) {
      const drv = (window.pgkWorkers || []).find(x => x.id === br.machine_driver_id);
      br.driver_name = drv ? drv.name : null;
    }
  });
  renderBrigades();
}

function renderBrigades() {
  const pb = document.getElementById('brigades-page');
  if (!pb) return;

  const cards = pgkBrigades.map(br => {
    const bid = escAttr(br.id);
    const mach = br.machine_name
      ? `<span style="font-size:12px;color:var(--tx2)">🚛 ${esc(br.machine_name)}${br.machine_plate ? ' · <b>' + esc(br.machine_plate) + '</b>' : ''}${br.driver_name ? ' · 👤 ' + esc(br.driver_name) : ''}</span>`
      : `<span style="font-size:12px;color:var(--tx3)">— машина не назначена</span>`;

    const empty = (txt) => `<span style="color:var(--tx3);font-size:12px;padding-left:4px">— ${txt}</span>`;

    const members = (br.members || []).length
      ? `<div class="br-list">` + br.members.map(m =>
          `<div class="br-list-item"><span class="br-list-icon">👤</span><span class="br-list-main">${esc(m.name)}${m.role ? ` <span class="br-list-meta">${esc(m.role)}</span>` : ''}</span>${m.start_date ? `<span class="br-list-days" title="с ${fmt(m.start_date)}">📅 ${m.days} дн.</span>` : `<span class="br-list-home">🏠 дома</span>`}</div>`
        ).join('') + `</div>`
      : empty('нет членов');

    const basesHtml = (br.base_names || []).length
      ? `<div class="br-list">` + br.base_names.map(n =>
          `<div class="br-list-item br-list-base">
            <span class="br-list-icon">🏕</span>
            <span class="br-list-name">${esc(n)}</span>
          </div>`
        ).join('') + `</div>`
      : empty('нет баз');

    const sitesHtml = (br.site_names || []).length
      ? `<div class="br-list">` + br.site_names.map(n =>
          `<div class="br-list-item br-list-site">
            <span class="br-list-icon">📍</span>
            <span class="br-list-name">${esc(n)}</span>
          </div>`
        ).join('') + `</div>`
      : empty('нет объектов');

    const notes = br.notes ? `<div style="font-size:11px;color:var(--tx3);margin-top:6px;border-top:1px solid var(--bd);padding-top:6px">${esc(br.notes)}</div>` : '';

    return `<div class="br-card">
      <div class="br-card-header">
        <span class="br-card-name">${esc(br.name)}</span>
        <div class="br-card-actions">
          <button class="btn bs bsm" onclick="openBrigadeModal('${bid}')" title="Редактировать">✏️</button>
          <button class="btn bs bsm" onclick="deleteBrigade('${bid}')" title="Удалить" style="color:var(--err)">🗑</button>
        </div>
      </div>
      <div style="margin:6px 0 4px">${mach}</div>
      <div class="br-section-label">👷 Члены бригады (${(br.members||[]).length})</div>
      ${members}
      <div class="br-section-label" style="margin-top:8px">🏕 Базы (${(br.base_names||[]).length})</div>
      ${basesHtml}
      <div class="br-section-label" style="margin-top:8px">📍 Объекты (${(br.site_names||[]).length})</div>
      ${sitesHtml}
      ${notes}
    </div>`;
  }).join('');

  pb.innerHTML = `<div class="br-outer">
    <div class="br-toolbar">
      <span style="font-size:15px;font-weight:800">👥 Бригады</span>
      <span style="font-size:13px;color:var(--tx3)">Всего: <b>${pgkBrigades.length}</b></span>
      <button class="btn bp bsm" style="margin-left:auto" onclick="openBrigadeModal()">＋ Создать</button>
    </div>
    ${pgkBrigades.length ? `<div class="br-grid">${cards}</div>` : `<div style="text-align:center;padding:60px 0;color:var(--tx3);font-size:14px">Бригад пока нет.<br><button class="btn bp" style="margin-top:16px" onclick="openBrigadeModal()">＋ Создать первую</button></div>`}
  </div>`;
}

function brFilterCheckList(input, listSel) {
  const q = input.value.toLowerCase().trim();
  document.querySelectorAll(listSel + ' > label').forEach(lbl => {
    lbl.style.display = (!q || (lbl.dataset.search || '').includes(q)) ? '' : 'none';
  });
}

function openBrigadeModal(id) {
  const br = id ? pgkBrigades.find(x => x.id === id) : null;
  const isEdit = !!br;

  const machOpts = `<option value="">— не назначена —</option>` +
    (window.pgkMachinery || []).map(m => {
      const drv = m.driver_id ? (window.pgkWorkers || []).find(w => w.id === m.driver_id) : null;
      const drvLabel = drv ? ' · 👤 ' + drv.name : '';
      const sel = br && br.machine_id === m.id ? 'selected' : '';
      return `<option value="${escAttr(m.id)}" ${sel}>${esc(m.name)}${m.plate_number ? ' · ' + esc(m.plate_number) : ''}${esc(drvLabel)}</option>`;
    }).join('');

  const selWorkerIds = br ? (br.member_ids || []) : [];
  const workerCheckboxes = (window.pgkWorkers || []).map(w => {
    const search = (w.name + ' ' + (w.role || '')).toLowerCase();
    return `<label class="br-check" data-search="${escAttr(search)}"><input type="checkbox" name="members" value="${escAttr(w.id)}" ${selWorkerIds.includes(w.id) ? 'checked' : ''}> ${esc(w.name)}${w.role ? ' <span style="color:var(--tx3);font-size:11px">' + esc(w.role) + '</span>' : ''}</label>`;
  }).join('');

  const selBaseIds = br ? (br.base_ids || []) : [];
  const baseCheckboxes = (window.bases || []).map(b => {
    const search = (b.name || '').toLowerCase();
    return `<label class="br-check" data-search="${escAttr(search)}"><input type="checkbox" name="bases" value="${escAttr(b.id)}" ${selBaseIds.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`;
  }).join('');

  const selSiteIds = br ? (br.site_ids || []) : [];
  const siteCheckboxes = (window.sites || []).map(s => {
    const search = (s.name || '').toLowerCase();
    return `<label class="br-check" data-search="${escAttr(search)}"><input type="checkbox" name="sites" value="${escAttr(s.id)}" ${selSiteIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`;
  }).join('');

  const body = `<div class="fgr fone">
    <div class="fg">
      <label>Название <span style="color:red">*</span></label>
      <input id="br-name" class="form-input" value="${br ? escAttr(br.name) : ''}" placeholder="Бригада 1">
    </div>
    <div class="fg">
      <label>Машина</label>
      <select id="br-machine" class="form-input">${machOpts}</select>
    </div>
    <div class="fg">
      <label>Члены бригады</label>
      <input type="search" class="br-search" placeholder="🔍 Поиск по имени или должности..." oninput="brFilterCheckList(this,'#br-list-members')">
      <div class="br-check-list" id="br-list-members">${workerCheckboxes || '<span style="color:var(--tx3)">Нет сотрудников</span>'}</div>
    </div>
    <div class="fg">
      <label>Базы</label>
      <input type="search" class="br-search" placeholder="🔍 Поиск базы..." oninput="brFilterCheckList(this,'#br-list-bases')">
      <div class="br-check-list" id="br-list-bases">${baseCheckboxes || '<span style="color:var(--tx3)">Нет баз</span>'}</div>
    </div>
    <div class="fg">
      <label>Объекты</label>
      <input type="search" class="br-search" placeholder="🔍 Поиск объекта..." oninput="brFilterCheckList(this,'#br-list-sites')">
      <div class="br-check-list" id="br-list-sites">${siteCheckboxes || '<span style="color:var(--tx3)">Нет объектов</span>'}</div>
    </div>
    <div class="fg">
      <label>Примечания</label>
      <textarea id="br-notes" class="form-input" rows="2" placeholder="Доп. информация">${br ? esc(br.notes || '') : ''}</textarea>
    </div>
  </div>`;

  const saveId = id || null;
  showModal(
    isEdit ? 'Редактировать бригаду' : 'Новая бригада',
    body,
    [
      { cls: 'bs', label: 'Отмена', fn: closeModal },
      { cls: 'bp', label: isEdit ? 'Сохранить' : 'Создать', fn: () => saveBrigade(saveId) }
    ]
  );
}

async function saveBrigade(id) {
  const name = document.getElementById('br-name').value.trim();
  if (!name) { toast('Укажите название бригады', 'err'); return; }

  const machine_id = document.getElementById('br-machine').value || null;
  const notes = document.getElementById('br-notes').value.trim();

  const member_ids = [...document.querySelectorAll('input[name="members"]:checked')].map(el => el.value);
  const base_ids   = [...document.querySelectorAll('input[name="bases"]:checked')].map(el => el.value);
  const site_ids   = [...document.querySelectorAll('input[name="sites"]:checked')].map(el => el.value);

  const body = { name, machine_id, notes, member_ids, base_ids, site_ids };
  try {
    const r = await fetch(`${API}/pgk/brigades${id ? '/' + id : ''}`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    closeModal();
    await loadBrigades();
    toast(id ? 'Бригада обновлена' : 'Бригада создана', 'ok');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'err');
  }
}

async function deleteBrigade(id) {
  if (!confirm('Удалить бригаду?')) return;
  await apiDelUndo(`/pgk/brigades/${id}`, 'Бригада удалена', loadBrigades);
}

// ── Styles injected once ──────────────────────────────────
(function injectBrigadeStyles() {
  if (document.getElementById('brigade-styles')) return;
  const s = document.createElement('style');
  s.id = 'brigade-styles';
  s.textContent = `
.br-outer { padding:14px 18px; width:100%; box-sizing:border-box; }
.br-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.br-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
.br-card { background:var(--s1); border:1.5px solid var(--bd); border-radius:10px; padding:14px 16px; }
.br-card-header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; }
.br-card-name { font-weight:800; font-size:15px; }
.br-card-actions { display:flex; gap:4px; flex-shrink:0; }
.br-section-label { font-size:11px; font-weight:700; color:var(--tx3); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.br-list { display:flex; flex-direction:column; gap:3px; margin-bottom:2px; }
.br-list-item { display:flex; align-items:center; gap:6px; font-size:12px; padding:4px 8px; background:var(--s2); border:1px solid var(--bd); border-radius:6px; min-height:24px; }
.br-list-icon { flex-shrink:0; font-size:13px; line-height:1; }
.br-list-name { font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.br-list-main { font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.br-list-meta { color:var(--tx2); font-size:11px; font-weight:400; }
.br-list-days { flex-shrink:0; color:#15803d; font-size:11px; font-weight:600; white-space:nowrap; }
.br-list-home { flex-shrink:0; color:var(--tx3); font-size:11px; font-weight:500; white-space:nowrap; }
.br-list-base { background:#fef3c7; border-color:#d97706; }
.br-list-base .br-list-name { color:#92400e; }
.br-list-site { background:#dbeafe; border-color:#3b82f6; }
.br-list-site .br-list-name { color:#1e40af; }
.br-search { margin-bottom:6px; font-size:12px; padding:4px 8px; border:1.5px solid var(--bd); border-radius:var(--rs); background:var(--s2); width:100%; box-sizing:border-box; outline:none; }
.br-check-list { max-height:200px; overflow-y:auto; border:1px solid var(--bd); border-radius:6px; padding:6px 8px; display:flex; flex-direction:column; gap:4px; }
.br-check { display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; }
.br-check input { cursor:pointer; }
`;
  document.head.appendChild(s);
})();
