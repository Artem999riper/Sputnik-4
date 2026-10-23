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

    const empty = (txt) => `<span style="color:var(--tx3);font-size:11px">— ${txt}</span>`;

    const members = (br.members || []).length
      ? `<div class="br-items">${br.members.map(m =>
          `<div class="br-row"><span class="br-row-info">👤 <b>${esc(m.name)}</b>${m.role ? `<span style="color:var(--tx3)"> · ${esc(m.role)}</span>` : ''}</span><span class="br-row-badge" style="color:${m.start_date ? '#15803d' : 'var(--tx3)'}">${m.start_date ? `📅 ${m.days} дн.` : '🏠 дома'}</span></div>`
        ).join('')}</div>`
      : empty('нет членов');

    const basesHtml = (br.base_names || []).length
      ? `<div class="br-items">${br.base_names.map(n =>
          `<div class="br-row"><span class="br-row-info">🏕 ${esc(n)}</span></div>`).join('')}</div>`
      : empty('нет баз');

    const sitesHtml = (br.site_names || []).length
      ? `<div class="br-items">${br.site_names.map(n =>
          `<div class="br-row"><span class="br-row-info">📍 ${esc(n)}</span></div>`).join('')}</div>`
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
      <div style="margin:4px 0 6px">${mach}</div>
      <div class="br-section-label">👷 Члены бригады (${(br.members||[]).length})</div>
      ${members}
      <div class="br-section-label">🏕 Базы (${(br.base_names||[]).length})</div>
      ${basesHtml}
      <div class="br-section-label">📍 Объекты (${(br.site_names||[]).length})</div>
      ${sitesHtml}
      ${notes}
    </div>`;
  }).join('');

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
