// ═══════════════════════════════════════════════════════════
// brigades.js — Страница «Бригады»
// ═══════════════════════════════════════════════════════════

let pgkBrigades = [];

async function loadBrigades() {
  const pb = document.getElementById('brigades-page');
  if (!pb) return;
  try {
    const r = await fetch(`${API}/pgk/brigades`);
    if (r.ok) pgkBrigades = await r.json();
    else pgkBrigades = [];
  } catch (e) {
    pgkBrigades = [];
  }
  // Resolve names from global caches
  pgkBrigades.forEach(br => {
    br.member_names = (br.member_ids || []).map(id => {
      const w = (window.pgkWorkers || []).find(x => x.id === id);
      return w ? w.name : id;
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

    const members = (br.member_names || []).length
      ? br.member_names.map(n => `<span class="br-chip">${esc(n)}</span>`).join('')
      : `<span style="color:var(--tx3);font-size:12px">— нет членов</span>`;

    const basesHtml = (br.base_names || []).length
      ? br.base_names.map(n => `<span class="br-chip br-chip-base">🏕 ${esc(n)}</span>`).join('')
      : `<span style="color:var(--tx3);font-size:12px">— нет баз</span>`;

    const sitesHtml = (br.site_names || []).length
      ? br.site_names.map(n => `<span class="br-chip br-chip-site">📍 ${esc(n)}</span>`).join('')
      : `<span style="color:var(--tx3);font-size:12px">— нет объектов</span>`;

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
      <div class="br-section-label">👷 Члены бригады</div>
      <div class="br-chips">${members}</div>
      <div class="br-section-label" style="margin-top:8px">🏕 Базы</div>
      <div class="br-chips">${basesHtml}</div>
      <div class="br-section-label" style="margin-top:8px">📍 Объекты</div>
      <div class="br-chips">${sitesHtml}</div>
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

function openBrigadeModal(id) {
  const br = id ? pgkBrigades.find(x => x.id === id) : null;
  const isEdit = !!br;

  const machOpts = `<option value="">— не назначена —</option>` +
    (window.pgkMachinery || []).map(m =>
      `<option value="${escAttr(m.id)}" ${br && br.machine_id === m.id ? 'selected' : ''}>${esc(m.name)}${m.plate_number ? ' · ' + m.plate_number : ''}</option>`
    ).join('');

  const selWorkerIds = br ? (br.member_ids || []) : [];
  const workerCheckboxes = (window.pgkWorkers || []).map(w =>
    `<label class="br-check"><input type="checkbox" name="members" value="${escAttr(w.id)}" ${selWorkerIds.includes(w.id) ? 'checked' : ''}> ${esc(w.name)}${w.role ? ' <span style="color:var(--tx3);font-size:11px">' + esc(w.role) + '</span>' : ''}</label>`
  ).join('');

  const selBaseIds = br ? (br.base_ids || []) : [];
  const baseCheckboxes = (window.bases || []).map(b =>
    `<label class="br-check"><input type="checkbox" name="bases" value="${escAttr(b.id)}" ${selBaseIds.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`
  ).join('');

  const selSiteIds = br ? (br.site_ids || []) : [];
  const siteCheckboxes = (window.sites || []).map(s =>
    `<label class="br-check"><input type="checkbox" name="sites" value="${escAttr(s.id)}" ${selSiteIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`
  ).join('');

  openModal(`<h3>${isEdit ? 'Редактировать бригаду' : 'Новая бригада'}</h3>
    <div class="form-group">
      <label>Название <span style="color:red">*</span></label>
      <input id="br-name" class="form-input" value="${br ? escAttr(br.name) : ''}" placeholder="Бригада 1" required>
    </div>
    <div class="form-group">
      <label>Машина</label>
      <select id="br-machine" class="form-input">${machOpts}</select>
    </div>
    <div class="form-group">
      <label>Члены бригады</label>
      <div class="br-check-list">${workerCheckboxes || '<span style="color:var(--tx3)">Нет сотрудников</span>'}</div>
    </div>
    <div class="form-group">
      <label>Базы</label>
      <div class="br-check-list">${baseCheckboxes || '<span style="color:var(--tx3)">Нет баз</span>'}</div>
    </div>
    <div class="form-group">
      <label>Объекты</label>
      <div class="br-check-list">${siteCheckboxes || '<span style="color:var(--tx3)">Нет объектов</span>'}</div>
    </div>
    <div class="form-group">
      <label>Примечания</label>
      <textarea id="br-notes" class="form-input" rows="2" placeholder="Доп. информация">${br ? esc(br.notes || '') : ''}</textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn bs" onclick="closeModal()">Отмена</button>
      <button class="btn bp" onclick="saveBrigade(${isEdit ? `'${escAttr(id)}'` : 'null'})">${isEdit ? 'Сохранить' : 'Создать'}</button>
    </div>`);
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
.br-outer { padding:16px 20px; max-width:1200px; margin:0 auto; }
.br-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.br-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
.br-card { background:var(--s1); border:1.5px solid var(--bd); border-radius:10px; padding:14px 16px; }
.br-card-header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; }
.br-card-name { font-weight:800; font-size:15px; }
.br-card-actions { display:flex; gap:4px; flex-shrink:0; }
.br-section-label { font-size:11px; font-weight:700; color:var(--tx3); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.br-chips { display:flex; flex-wrap:wrap; gap:4px; }
.br-chip { background:var(--s2); border:1px solid var(--bd); border-radius:12px; font-size:12px; padding:2px 8px; }
.br-chip-base { background:#fef3c7; border-color:#d97706; color:#92400e; }
.br-chip-site { background:#dbeafe; border-color:#3b82f6; color:#1e40af; }
.br-check-list { max-height:150px; overflow-y:auto; border:1px solid var(--bd); border-radius:6px; padding:6px 8px; display:flex; flex-direction:column; gap:4px; }
.br-check { display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; }
.br-check input { cursor:pointer; }
`;
  document.head.appendChild(s);
})();
