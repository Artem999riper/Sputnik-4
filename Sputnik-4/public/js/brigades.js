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
    try { window._brStats = await fetch(`${API}/pgk/brigades/stats`).then(r => r.ok ? r.json() : {}); } catch (e) { window._brStats = {}; }
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

  const cards = pgkBrigades.map(_brCardHtml).join('');

  const isTbl = window._brView === 'table';
  pb.innerHTML = `<div class="br-outer"${isTbl ? ' style="display:flex;flex-direction:column;height:100%"' : ''}>
    <div class="br-toolbar">
      <span style="font-size:15px;font-weight:800">👥 Бригады</span>
      <span style="font-size:13px;color:var(--tx3)">Всего: <b>${pgkBrigades.length}</b></span>
      ${isTbl ? `<input type="search" placeholder="🔍 Поиск…" value="${esc(window._brQ || '')}" oninput="window._brQ=this.value;clearTimeout(window._brQT);window._brQT=setTimeout(()=>{renderBrigades();const i=document.querySelector('#brigades-page input[type=search]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},250)" style="font-size:11px;padding:3px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);min-width:160px">` : ''}
      <div class="mch-view-toggle" style="margin-left:auto">
        <button class="btn bsm ${!isTbl ? 'bp' : 'bs'}" onclick="brSetView('cards')">⊞ Карточки</button>
        <button class="btn bsm ${isTbl ? 'bp' : 'bs'}" onclick="brSetView('table')">☰ Таблица</button>
      </div>
      <button class="btn bs bsm" onclick="_brExportMenu(event)" title="Экспорт в Excel">📤</button>
      <button class="btn bp bsm" onclick="openBrigadeModal()">＋ Создать</button>
    </div>
    ${isTbl && pgkBrigades.length ? _brTableHtml() : pgkBrigades.length ? `<div class="br-grid">${cards}</div>` : `<div style="text-align:center;padding:60px 0;color:var(--tx3);font-size:14px">Бригад пока нет.<br><button class="btn bp" style="margin-top:16px" onclick="openBrigadeModal()">＋ Создать первую</button></div>`}
  </div>`;
  if (isTbl) TK.initSelect('br-tbody', 'brigades');
}

// ── Карточка бригады ─────────────────────────────────────────
// Шапка: имя, состояние (на вахте / частично / дома), счётчики. Машина с водителем
// (водителю объём не засчитывается). Люди — «аватарки» со статусом и днями вахты.
// Выработка за сегодня / 7 / 30 дней / всего. Базы и объекты — щелчок открывает на карте.
// Предупреждения: уволенный в составе, человек в нескольких бригадах, на другой базе, нет машины.
const _BR_ST = { working: ['на вахте', '#16a34a'], idle: ['простой', '#d97706'], sick: ['больничный', '#dc2626'], home: ['дома', '#64748b'], fired: ['уволен', '#9ca3af'] };
const _brEff = w => !w ? 'home' : w.status === 'fired' ? 'fired' : w.start_date ? 'working' : (w.status || 'home');
const _brIni = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
const _brN = x => (Math.round((+x || 0) * 10) / 10).toLocaleString('ru-RU');
const _brSum = o => { const e = Object.entries(o || {}).filter(([, v]) => v); return e.length ? e.map(([u, v]) => `<div><b>${_brN(v)}</b> ${esc(u)}</div>`).join('') : '<span class="brc-mute">—</span>'; };
function _brCardHtml(br) {
  const bid = escAttr(br.id), W = window.pgkWorkers || [], M = window.pgkMachinery || [];
  const mach = M.find(m => m.id === br.machine_id), drvId = br.machine_driver_id || (mach && mach.driver_id);
  const drv = drvId ? W.find(w => w.id === drvId) : null;
  const ppl = (br.member_ids || []).map(id => W.find(w => w.id === id) || { id, name: '(удалён)', status: 'fired' });
  const crew = ppl.filter(w => w.id !== drvId);
  const st = ppl.map(_brEff), onShift = st.filter(x => x === 'working').length, home = st.filter(x => x === 'home').length;
  const state = !ppl.length ? ['пустая', '#9ca3af'] : onShift === ppl.length ? ['на вахте', '#16a34a'] : onShift ? ['частично на вахте', '#d97706'] : ['дома', '#64748b'];
  // предупреждения
  const warn = [];
  if (!br.machine_id) warn.push('нет машины');
  const fired = ppl.filter(w => _brEff(w) === 'fired'); if (fired.length) warn.push(`уволен: ${fired.map(w => esc(w.name)).join(', ')}`);
  const other = crew.filter(w => pgkBrigades.some(b => b.id !== br.id && (b.member_ids || []).includes(w.id))); if (other.length) warn.push(`ещё в другой бригаде: ${other.map(w => esc(w.name)).join(', ')}`);
  const bset = new Set(br.base_ids || []), away = bset.size ? ppl.filter(w => w.base_id && !bset.has(w.base_id)) : [];
  if (away.length) warn.push(`на другой базе: ${away.map(w => esc(w.name)).join(', ')}`);
  if (drvId && !ppl.some(w => w.id === drvId) && drv) warn.push(`водитель ${esc(drv.name)} не в составе`);
  const S = (window._brStats || {})[br.id] || {};
  const person = (w, isDrv) => { const e = _brEff(w), [lbl, col] = _BR_ST[e] || _BR_ST.home;
    const days = w.start_date ? Math.max(0, Math.floor((Date.now() - new Date(w.start_date)) / 864e5)) : null;
    const base = w.base_id ? ((window.bases || []).find(b => b.id === w.base_id) || {}).name : '';
    return `<div class="brc-p${e === 'fired' ? ' off' : ''}" onclick="event.stopPropagation();if(typeof openWorkerDetail==='function')openWorkerDetail('${escAttr(w.id)}')" title="${escAttr(`${w.name}${w.role ? ' — ' + w.role : ''}\n${lbl}${days != null ? ', ' + days + ' дн.' : ''}${base ? '\n🏕 ' + base : ''}${isDrv ? '\nВодитель — объём не засчитывается' : ''}`)}">
      <i class="brc-av" style="--c:${col}">${esc(_brIni(w.name))}${isDrv ? '<em>🚗</em>' : ''}</i>
      <span class="brc-pn"><b>${esc(w.name)}</b><small>${esc(w.role || '')}${isDrv ? (/водит/i.test(w.role || '') ? ' · не в зачёт' : (w.role ? ' · ' : '') + 'водитель, не в зачёт') : ''}</small></span>
      <span class="brc-ps" style="color:${col}">${days != null ? days + ' дн.' : lbl}</span></div>`; };
  const machHtml = mach || br.machine_name ? `<div class="brc-mach">
      <span class="brc-mi">🚛</span><div style="flex:1;min-width:0"><b>${esc(br.machine_name || mach.name)}</b>${br.machine_plate || (mach && mach.plate_number) ? ` <span class="brc-plate">${esc(br.machine_plate || mach.plate_number)}</span>` : ''}
        <small>${esc(br.machine_type || (mach && mach.type) || '')}${mach && mach.status ? ` · <span style="color:${mach.status === 'working' ? '#16a34a' : mach.status === 'broken' ? '#dc2626' : '#d97706'}">${mach.status === 'working' ? 'в работе' : mach.status === 'broken' ? 'сломана' : 'простой'}</span>` : ''}</small></div>
      ${drv ? `<span class="brc-drv" title="Водитель — объём не засчитывается">🚗 ${esc(drv.name)}</span>` : '<span class="brc-mute">без водителя</span>'}</div>`
    : `<div class="brc-mach brc-mute">🚛 машина не назначена</div>`;
  const chips = (ids, names, kind) => (ids || []).map((id, i) => `<span class="brc-chip" onclick="event.stopPropagation();switchView('map');${kind === 'base' ? 'selectBase' : 'selectSite'}('${escAttr(id)}')" title="Открыть на карте">${kind === 'base' ? '🏕' : '📍'} ${esc(names[i] || id)}</span>`).join('');
  return `<div class="br-card brc" oncontextmenu="event.preventDefault();if(typeof brCtxMenu==='function')brCtxMenu(event,'${bid}')">
    <div class="brc-hd">
      <div class="brc-logo" style="--c:${state[1]}">👥</div>
      <div style="flex:1;min-width:0"><div class="br-card-name">${esc(br.name)}</div>
        <div class="brc-state" style="color:${state[1]}">● ${state[0]}</div>
        <div class="brc-cnt"><span title="Всего в составе">👷 ${ppl.length}</span>${crew.length !== ppl.length ? `<span title="Засчитывается объём (без водителя)">✔ в зачёт ${crew.length}</span>` : ''}${onShift ? `<span class="on">на вахте ${onShift}</span>` : ''}${home ? `<span>дома ${home}</span>` : ''}</div></div>
      <div class="br-card-actions">
        <button class="btn bs bsm" onclick="brUseForMarks('${bid}')" title="Отмечать выполнение объёмов этой бригадой">✅</button>
        <button class="btn bs bsm" onclick="openBrigadeModal('${bid}')" title="Редактировать">✏️</button>
        <button class="btn bs bsm" onclick="deleteBrigade('${bid}')" title="Удалить" style="color:var(--err)">🗑</button>
      </div></div>
    ${machHtml}
    <div class="brc-ppl">${crew.map(w => person(w, false)).join('') || '<div class="brc-mute" style="padding:4px 2px">— нет людей в составе</div>'}${drv && ppl.some(w => w.id === drvId) ? person(drv, true) : ''}</div>
    <div class="brc-stats">
      <div><small>сегодня</small>${_brSum(S.today)}</div><div><small>7 дней</small>${_brSum(S.d7)}</div>
      <div><small>30 дней</small>${_brSum(S.d30)}</div><div><small>всего</small>${_brSum(S.all)}</div>
    </div>
    ${S.last ? `<div class="brc-last">последнее выполнение: <b>${fmt(S.last)}</b>${Object.keys(S.sites || {}).length ? ' · ' + Object.keys(S.sites).slice(0, 3).map(esc).join(', ') : ''}</div>` : '<div class="brc-last brc-mute">выполнения пока нет</div>'}
    ${(br.base_ids || []).length || (br.site_ids || []).length ? `<div class="brc-chips">${chips(br.base_ids, br.base_names || [], 'base')}${chips(br.site_ids, br.site_names || [], 'site')}</div>` : ''}
    ${warn.length ? `<div class="brc-warn">⚠ ${warn.join(' · ')}</div>` : ''}
    ${br.notes ? `<div class="brc-notes">${esc(br.notes)}</div>` : ''}
  </div>`;
}
// «✅» на карточке: эта бригада — исполнитель для отметок объёмов
async function brUseForMarks(id) {
  if (typeof VEX === 'undefined') return;
  await volBrigades(true);
  VEX.brigade = id; VEX.extra = []; VEX.machine = ''; _vexSave();
  toast(`✅ Отметки объёмов теперь от: ${volExecLabel()} — «Объёмы» → «✅ Отмечать» или ПКМ по скважине`, 'ok');
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
  if (!await confirmDlg('Удалить бригаду?')) return;
  await apiDelUndo(`/pgk/brigades/${id}`, 'Бригада удалена', loadBrigades);
}

// ── Styles injected once ──────────────────────────────────

// ═══ Табличный вид «Бригад» (выделение, массовые действия, экспорт) ═══════
const BR_COLS=[['name','Бригада'],['machine','Машина'],['driver','Водитель'],['members','Состав'],['cnt','Чел.'],['bases','Базы'],['sites','Объекты'],['notes','Примечания']];
if(typeof window._brView==='undefined'){try{window._brView=localStorage.getItem('br_view')||'cards';}catch(e){window._brView='cards';}}
function brSetView(v){window._brView=v;try{localStorage.setItem('br_view',v);}catch(e){}renderBrigades();}
function _brTableHtml(){
  const hidden=TK.hidden('brigades'),show=k=>!hidden.has(k);
  TK.rerender.brigades=()=>renderBrigades();
  const q=(window._brQ||'').toLowerCase();
  const list=pgkBrigades.filter(b=>!q||(b.name+' '+(b.machine_name||'')+' '+(b.members||[]).map(m=>m.name).join(' ')+' '+(b.base_names||[]).join(' ')+' '+(b.site_names||[]).join(' ')+' '+(b.notes||'')).toLowerCase().includes(q))
    .sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true}));
  window._brShownIds=list.map(b=>b.id);
  const sel=TK.set('brigades'),dash='<span style="color:var(--tx3)">—</span>';
  const rows=list.map(b=>{
    const _id=escAttr(b.id),on=sel.has(b.id);
    const td={
      name:`<td class="td-link" style="font-weight:700" onclick="openBrigadeModal('${_id}')">${esc(b.name)}</td>`,
      machine:`<td>${b.machine_name?'🚛 '+esc(b.machine_name)+(b.machine_plate?' · '+esc(b.machine_plate):''):dash}</td>`,
      driver:`<td>${b.driver_name?'👤 '+esc(b.driver_name):dash}</td>`,
      members:`<td style="font-size:11px">${(b.members||[]).length?(b.members||[]).map(m=>`${m.start_date?'🟢':'🏠'} ${esc(m.name)}${m.role?` <span style="color:var(--tx3)">${esc(m.role)}</span>`:''}`).join('<br>'):dash}</td>`,
      cnt:`<td style="text-align:center;font-weight:700">${(b.members||[]).length}</td>`,
      bases:`<td style="font-size:11px;color:var(--bpc)">${(b.base_names||[]).map(esc).join('<br>')||dash}</td>`,
      sites:`<td style="font-size:11px">${(b.site_names||[]).map(esc).join('<br>')||dash}</td>`,
      notes:`<td class="td-notes td-editable" title="${esc(b.notes||'')}" onclick="_brNoteCell(event,this,'${_id}')">${esc(b.notes||'')}</td>`,
    };
    return `<tr data-rid="${b.id}" class="${on?'lasso-sel':''}" oncontextmenu="event.preventDefault();brCtxMenu(event,'${_id}')">${TK.chkTd(on)}${BR_COLS.filter(([k])=>show(k)).map(([k])=>td[k]).join('')}</tr>`;
  }).join('');
  const n=1+BR_COLS.filter(([k])=>show(k)).length;
  return `<div class="wt-summary" style="padding:4px 2px;flex-wrap:wrap">${TK.selBar('brigades')}</div>
    <div class="wt-scroll" style="flex:1"><table class="wt-tbl" id="br-tbl" style="min-width:820px">
      <thead oncontextmenu="TK.colsMenu(event,'brigades',BR_COLS.filter(c=>c[0]!=='name'),()=>renderBrigades())"><tr>${TK.chkTh('brigades')}${BR_COLS.filter(([k])=>show(k)).map(([k,l])=>`<th class="no-sort" data-col="${k}">${l}</th>`).join('')}</tr></thead>
      <tbody id="br-tbody">${rows||`<tr><td colspan="${n}" style="text-align:center;padding:24px;color:var(--tx3)">Нет бригад</td></tr>`}</tbody></table></div>`;
}
function _brNoteCell(ev,td,id){const b=pgkBrigades.find(x=>x.id===id);if(b)TK.cellText(ev,td,b.notes||'',v=>_brApply([id],{notes:v},'Примечание сохранено'));}
// PUT бригады требует полный набор полей
async function _brApply(ids,patch,msg,noUndo){
  const list=ids.map(id=>pgkBrigades.find(b=>b.id===id)).filter(Boolean);
  const before=TK.snapshot(list,patch);
  try{await Promise.all(list.map(b=>{const p=typeof patch==='function'?patch(b):patch;
    const body={name:b.name,machine_id:b.machine_id||null,notes:b.notes||'',member_ids:b.member_ids||[],base_ids:b.base_ids||[],site_ids:b.site_ids||[],...p};
    return fetch(`${API}/pgk/brigades/${b.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}));}
  catch(e){toast('Ошибка сохранения','err');}
  await loadBrigades();
  if(msg&&!noUndo)TK.undoBar(list.length>1?`${msg}: ${list.length} бригад`:msg,()=>_brApply(before.map(b=>b.id),b=>(before.find(q=>q.id===b.id)||{}).old||{},null,true));
}
function brCtxMenu(ev,id){
  const b=pgkBrigades.find(x=>x.id===id);if(!b)return;
  const x=ev.clientX,y=ev.clientY,ids=TK.ctxIds('brigades',id),multi=ids.length>1;
  const W=(window.pgkWorkers||[]).map(w=>({v:w.id,l:w.name,sub:w.role||''}));
  const addTo=(field,val,msg)=>_brApply(ids,q=>({[field]:[...new Set([...(q[field]||[]),val])]}),msg);
  const remFrom=(field,val,msg)=>_brApply(ids,q=>({[field]:(q[field]||[]).filter(v=>v!==val)}),msg);
  const unionOf=f=>[...new Set(ids.flatMap(i=>(pgkBrigades.find(q=>q.id===i)||{})[f]||[]))];
  const nm=(f,v)=>f==='member_ids'?((window.pgkWorkers||[]).find(w=>w.id===v)||{}).name||v:f==='base_ids'?((window.bases||[]).find(q=>q.id===v)||{}).name||v:((window.sites||[]).find(q=>q.id===v)||{}).name||v;
  const pickRem=(f,t,m)=>{const all=unionOf(f);if(!all.length){toast('Нечего убирать','warn');return;}_searchPick({x,y,title:t,items:all.map(v=>({v,l:nm(f,v)})),current:null,onPick:v=>v&&remFrom(f,v,m)});};
  showCtx(x,y,[
    multi?{i:'☑️',l:`<b>Выбрано: ${ids.length}</b>`,html:true,f:()=>{}}:{i:'👥',l:`<b>${esc(b.name)}</b>`,html:true,f:()=>openBrigadeModal(id)},
    {sep:true},
    ...(multi?[]:[{i:'✏️',l:'Редактировать',f:()=>openBrigadeModal(id)}]),
    {i:'🚛',l:'Машина…',f:()=>_searchPick({x,y,title:'🚛 Машина',items:[{v:'',l:'— не назначена —'},...(window.pgkMachinery||[]).map(m=>({v:m.id,l:m.name,sub:m.plate_number||''}))],current:multi?null:(b.machine_id||''),onPick:v=>_brApply(ids,{machine_id:v||null},'Машина назначена')})},
    {i:'➕',l:'Добавить в состав…',f:()=>_searchPick({x,y,title:'➕ Добавить в состав',items:W,current:null,onPick:v=>v&&addTo('member_ids',v,'Сотрудник добавлен')})},
    {i:'➖',l:'Убрать из состава…',f:()=>pickRem('member_ids','➖ Убрать из состава','Сотрудник убран')},
    {i:'🏕',l:'Добавить базу…',f:()=>_searchPick({x,y,title:'🏕 Добавить базу',items:(window.bases||[]).map(q=>({v:q.id,l:q.name})),current:null,onPick:v=>v&&addTo('base_ids',v,'База добавлена')})},
    {i:'📍',l:'Добавить объект…',f:()=>_searchPick({x,y,title:'📍 Добавить объект',items:(window.sites||[]).map(q=>({v:q.id,l:q.name})),current:null,onPick:v=>v&&addTo('site_ids',v,'Объект добавлен')})},
    {i:'📍',l:'Убрать базу / объект…',f:()=>{const items=[...unionOf('base_ids').map(v=>({v:'b:'+v,l:'🏕 '+nm('base_ids',v)})),...unionOf('site_ids').map(v=>({v:'s:'+v,l:'📍 '+nm('site_ids',v)}))];
      if(!items.length){toast('Нечего убирать','warn');return;}
      _searchPick({x,y,title:'Убрать',items,current:null,onPick:v=>{if(!v)return;const f=v[0]==='b'?'base_ids':'site_ids';remFrom(f,v.slice(2),'Убрано');}});}},
    {i:'📝',l:'Примечание…',f:()=>TK.notesModal(ids.length,multi?'':b.notes,(t,app)=>_brApply(ids,app?(q=>({notes:(q.notes?q.notes+' ':'')+t})):{notes:t},'Примечание сохранено'))},
    {sep:true},
    {i:'📤',l:'Экспорт в Excel',f:()=>_brExportList(ids.map(i=>pgkBrigades.find(q=>q.id===i)).filter(Boolean))},
    {i:'🗑',l:multi?`Удалить выбранные (${ids.length})`:'Удалить',cls:'cxi-red',f:()=>multi?TK.bulkDelete(ids,i=>`/pgk/brigades/${i}`,loadBrigades,'бригад'):deleteBrigade(id)},
  ]);
}
function _brExportMenu(ev){
  const by=id=>pgkBrigades.find(b=>b.id===id),shown=(window._brShownIds||pgkBrigades.map(b=>b.id)).map(by).filter(Boolean),s=TK.selectedIds('brigades');
  TK.exportMenu(ev,{all:pgkBrigades,shown,selected:shown.filter(b=>s.includes(b.id)),run:_brExportList});
}
function _brExportList(list){
  if(!list||!list.length){toast('Нет бригад','warn');return;}
  const aoa=[['Бригады — '+new Date().toLocaleDateString('ru-RU')],['Бригада','Машина','Гос. номер','Водитель','Сотрудник','Должность','На вахте, дн.','Базы','Объекты','Примечания']];
  list.forEach(b=>{
    const ms=(b.members||[]).length?b.members:[{name:'',role:'',start_date:null,days:''}];
    ms.forEach((m,i)=>aoa.push(i===0?[b.name,b.machine_name||'',b.machine_plate||'',b.driver_name||'',m.name,m.role||'',m.start_date?m.days:'',(b.base_names||[]).join(', '),(b.site_names||[]).join(', '),b.notes||'']
      :['','','','',m.name,m.role||'',m.start_date?m.days:'','','','']));
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:18},{wch:20},{wch:12},{wch:20},{wch:26},{wch:18},{wch:10},{wch:24},{wch:24},{wch:24}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Бригады');XLSX.writeFile(wb,`Бригады_${new Date().toISOString().slice(0,10)}.xlsx`);toast('Excel сохранён','ok');
}
