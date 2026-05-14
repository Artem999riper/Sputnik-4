function _getPGKContainer(){
  const pageId = pgkTab==='workers'?'workers-page':
                 pgkTab==='machinery'?'machinery-page':
                 pgkTab==='equipment'?'equipment-page':'materials-page';
  return document.getElementById(pageId);
}
async function loadPGK(){
  const[wr,mr,er,br]=await Promise.all([
    fetch(`${API}/pgk/workers/summary`),fetch(`${API}/pgk/machinery`),
    fetch(`${API}/pgk/equipment`),fetch(`${API}/bases`)
  ]);
  pgkWorkers=await wr.json();pgkMachinery=await mr.json();
  pgkEquipment=await er.json();bases=await br.json();
  [pgkFuelReserves,pgkSpareGroups,pgkSpares,pgkEquipGroups,pgkMatGroups]=await Promise.all([
    fetch(`${API}/fuel_reserves`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/spare_groups`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/spare_parts`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/equip_groups`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/mat_groups`).then(r=>r.json()).catch(()=>[])
  ]);
  await renderPGK();
}
async function renderPGK(){
  const pb=_getPGKContainer();
  if(!pb)return;
  if(pgkTab==='workers')pgkPageWorkers(pb);
  else if(pgkTab==='machinery')pgkPageMachinery(pb);
  else if(pgkTab==='equipment')pgkPageEquipment(pb);
  else await pgkPageMaterials(pb);
}

// ── Inline cell editor ─────────────────────────────────────
async function pgkCellEdit(ev, td, entityType, id, field) {
  ev.stopPropagation();
  if (td.querySelector('input,select,textarea')) return;

  // Find entity
  let entity;
  if (entityType==='worker') entity=pgkWorkers.find(x=>x.id===id);
  else if (entityType==='machinery') entity=pgkMachinery.find(x=>x.id===id);
  else if (entityType==='equipment') entity=pgkEquipment.find(x=>x.id===id);
  else if (entityType==='material') {
    for (const b of bases) {
      const m=(b.materials||[]).find(m=>m.id===id);
      if (m){entity={...m};break;}
    }
  }
  if (!entity) return;

  const currentVal = entity[field];
  const origHTML = td.innerHTML;

  // Determine editor type
  let editorType='text', opts=null;
  if (field==='status') {
    editorType='select';
    if (entityType==='worker') opts=Object.entries(WORKER_STATUSES);
    else opts=[['working','✅ В работе'],['idle','⏸ Простой'],['broken','🔴 Сломана']];
  } else if (field==='base_id') {
    editorType='select';
    opts=[['','— Снять с базы —'],...bases.map(b=>[b.id,b.name])];
  } else if (field==='amount') {
    editorType='number';
  }

  // Build editor element
  let editor;
  if (editorType==='select') {
    editor=document.createElement('select');
    (opts||[]).forEach(([val,lbl])=>{
      const o=document.createElement('option');
      o.value=val||'';
      o.textContent=lbl;
      if ((val||'')===(currentVal||'')) o.selected=true;
      editor.appendChild(o);
    });
  } else {
    editor=document.createElement('input');
    editor.type=editorType;
    if (editorType==='number'){editor.step='any';editor.min='0';}
    editor.value=currentVal!=null?currentVal:'';
  }
  editor.style.cssText='width:100%;min-width:60px;font-size:11px;padding:2px 4px;border:1.5px solid var(--acc);border-radius:4px;background:var(--s1);color:var(--tx);box-sizing:border-box';

  td.innerHTML='';
  td.appendChild(editor);
  editor.focus();
  if (editor.tagName==='INPUT') editor.select();

  const doSave=async()=>{
    let newVal=editor.value;
    if (field==='amount') newVal=parseFloat(newVal)||0;
    else if (newVal==='') newVal=null;

    td.innerHTML=origHTML;

    // Preserve scroll position across re-render
    const scrollEl=document.querySelector('.wt-scroll');
    const scrollTop=scrollEl?scrollEl.scrollTop:0;

    let url, body;
    if (entityType==='worker') {
      url=`${API}/pgk/workers/${id}`;
      body={...entity,[field]:newVal,user_name:un()};
    } else if (entityType==='machinery') {
      url=`${API}/pgk/machinery/${id}`;
      body={...entity,[field]:newVal,user_name:un()};
    } else if (entityType==='equipment') {
      url=`${API}/pgk/equipment/${id}`;
      body={...entity,[field]:newVal};
    } else if (entityType==='material') {
      url=`${API}/materials/${id}`;
      body={...entity,[field]:newVal};
      delete body.base_name;
    }

    try {
      await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      await loadPGK();
      const newScrollEl=document.querySelector('.wt-scroll');
      if (newScrollEl) newScrollEl.scrollTop=scrollTop;
    } catch(e) {
      toast('Ошибка сохранения','err');
    }
  };

  const doCancel=()=>{td.innerHTML=origHTML;};

  let saved=false;
  if (editorType==='select') {
    editor.onchange=()=>{saved=true;doSave();};
    editor.onkeydown=e=>{if(e.key==='Escape'){saved=true;doCancel();}};
    editor.onblur=()=>{if(!saved)doCancel();};
  } else {
    editor.onkeydown=e=>{
      if(e.key==='Enter'){e.preventDefault();if(!saved){saved=true;doSave();}}
      if(e.key==='Escape'){if(!saved){saved=true;doCancel();}}
    };
    editor.onblur=()=>{if(!saved){saved=true;doSave();}};
  }
}

function pgkPageWorkers(pb){
  const today=new Date();
  const _ws=window._pgkWSort||'name', _wa=window._pgkWAsc!==false;
  const _wfStatus=window._pgkWFStatus||'';
  const _wfBase=window._pgkWFBase||'';
  const _wfRole=window._pgkWFRole||'';

  const statusCls={working:'wbs-working',idle:'wbs-idle',sick:'wbs-sick',home:'wbs-home',fired:'wbs-fired'};

  const getDays=w=>w.start_date?Math.max(0,Math.floor((today-new Date(w.start_date))/86400000)):0;
  const getBase=w=>(bases.find(x=>x.id===w.base_id)||{}).name||'';
  // Derive effective status: if worker has days on shift → working; if shift ended → home overrides
  const effSt=w=>w.start_date?'working':(w.status||'home');
  const getStatus=w=>WORKER_STATUSES[effSt(w)]||'';

  const byStatus={working:[],idle:[],sick:[],home:[],fired:[]};
  pgkWorkers.forEach(w=>{const s=effSt(w);(byStatus[s]=byStatus[s]||[]).push(w);});

  let filtered=[...pgkWorkers].filter(w=>{
    if(_wfStatus&&effSt(w)!==_wfStatus)return false;
    if(_wfBase&&w.base_id!==_wfBase)return false;
    if(_wfRole&&(w.role||'')!==_wfRole)return false;
    return true;
  });

  filtered.sort((a,b)=>{
    const aFired=a.status==='fired', bFired=b.status==='fired';
    if(aFired&&!bFired)return 1;
    if(!aFired&&bFired)return -1;
    let va,vb;
    if(_ws==='days'){va=getDays(a);vb=getDays(b);}
    else if(_ws==='base'){va=getBase(a);vb=getBase(b);}
    else if(_ws==='status'){va=getStatus(a);vb=getStatus(b);}
    else if(_ws==='last_shift_end'){va=a.last_shift_end||'';vb=b.last_shift_end||'';}
    else if(_ws==='rest_days'){va=a.rest_days!=null?a.rest_days:-1;vb=b.rest_days!=null?b.rest_days:-1;}
    else if(_ws==='last_shift_volume'){va=a.last_shift_volume!=null?a.last_shift_volume:-1;vb=b.last_shift_volume!=null?b.last_shift_volume:-1;}
    else{va=a[_ws]||'';vb=b[_ws]||'';}
    if(typeof va==='number'&&typeof vb==='number')return(va-vb)*(_wa?1:-1);
    return String(va).localeCompare(String(vb),'ru')*(_wa?1:-1);
  });

  const thCls=col=>`class="${_ws===col?(_wa?'wt-asc':'wt-desc'):''}"`;
  const thSort=(col,lbl)=>`<th ${thCls(col)} onclick="if(window._pgkWSort==='${col}'){window._pgkWAsc=!(window._pgkWAsc!==false);}else{window._pgkWSort='${col}';window._pgkWAsc=true;}renderPGK()">${lbl}</th>`;

  const baseOpts=`<option value="">Все базы</option>`+bases.map(b=>`<option value="${b.id}" ${_wfBase===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
  const statusOpts=`<option value="">Все статусы</option>`+Object.entries(WORKER_STATUSES).map(([k,v])=>`<option value="${k}" ${_wfStatus===k?'selected':''}>${v}</option>`).join('');
  const roles=[...new Set(pgkWorkers.map(w=>w.role||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const roleOpts=`<option value="">Все должности</option>`+roles.map(r=>`<option value="${esc(r)}" ${_wfRole===r?'selected':''}>${esc(r)}</option>`).join('');

  const rows=filtered.map((w,i)=>{
    const b=bases.find(x=>x.id===w.base_id);
    const days=getDays(w);
    const st=effSt(w);
    const isFired=st==='fired';
    const _id=escAttr(w.id);
    const restDays=w.rest_days!=null?w.rest_days+' дн.':'—';
    const lastOut=w.last_shift_end?fmt(w.last_shift_end):'—';
    const vol=w.last_shift_volume!=null?w.last_shift_volume:'—';
    const notesPreview=esc((w.notes||'').replace(/\n/g,' ').slice(0,60));
    return `<tr class="${isFired?'wt-fired':''}" data-wid="${w.id}"
      data-search="${esc((w.name+' '+(w.role||'')+' '+(b?b.name:'')+' '+(w.notes||'')).toLowerCase())}"
      oncontextmenu="event.preventDefault();workerCtxMenu(event,'${_id}')">
      <td style="text-align:center;color:var(--tx3);font-size:10px;font-weight:600">${i+1}</td>
      <td class="td-link" style="font-weight:600" onclick="openWorkerDetail('${_id}')">${esc(w.name.trim())}</td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'worker','${_id}','role')">${esc(w.role||'—')}</td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'worker','${_id}','status')"><span class="wt-badge ${statusCls[st]||'wbs-home'}">${WORKER_STATUSES[st]||st}</span></td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'worker','${_id}','base_id')">${b?`<span style="color:var(--bpc)">🏕 ${esc(b.name)}</span>`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td class="td-days">${w.start_date?`<span title="с ${fmt(w.start_date)}">${days}</span>`:'—'}</td>
      <td style="text-align:center;font-size:11px;color:var(--tx2)">${lastOut}</td>
      <td style="text-align:center;font-size:11px;${w.rest_days!=null&&w.rest_days>=30?'color:#92400e;font-weight:700':'color:var(--tx2)'}">${restDays}</td>
      <td style="text-align:right;font-size:11px;color:var(--acc);padding:2px 6px">${vol}</td>
      <td class="td-notes td-link" style="color:var(--tx)" title="${notesPreview}" onclick="pgkNotesModal('${_id}')">${notesPreview||'<span style="color:var(--tx3)">—</span>'}</td>
    </tr>`;
  }).join('');

  pb.innerHTML=`<div class="wt-outer">
    <div class="wt-toolbar">
      <span style="font-size:13px;font-weight:800;flex-shrink:0">👷 Сотрудники</span>
      <input id="pgk-w-search" type="search" placeholder="🔍 Поиск по имени, должности…"
        style="font-size:11px;padding:3px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);outline:none;min-width:150px;flex-shrink:0"
        oninput="pgkWorkerSearchFilter(this.value)" />
      <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkWFStatus=this.value;renderPGK()">${statusOpts}</select>
      <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkWFBase=this.value;renderPGK()">${baseOpts}</select>
      <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkWFRole=this.value;renderPGK()">${roleOpts}</select>
      <div style="margin-left:auto;display:flex;gap:4px;flex-shrink:0">
        <button class="btn bs bsm" onclick="pgkExcelMenu()" title="Импорт / экспорт Excel">📊 Excel</button>
        <button class="btn bp bsm" onclick="pgkAddWorker()">＋ Добавить</button>
      </div>
    </div>
    <div class="wt-summary">
      <span>Всего: <b>${pgkWorkers.length}</b></span>
      <span style="color:#15803d">🟢 В работе: <b>${byStatus.working.length}</b></span>
      <span style="color:#a16207">⏸ Простой: <b>${byStatus.idle.length}</b></span>
      <span style="color:#b91c1c">🏥 Больничный: <b>${byStatus.sick.length}</b></span>
      <span>🏠 Дома: <b>${byStatus.home.length}</b></span>
      ${byStatus.fired.length?`<span style="color:#9ca3af">🚫 Уволен: <b>${byStatus.fired.length}</b></span>`:''}
      <span id="wt-shown-count" style="color:var(--acc);margin-left:4px;display:none">Найдено: <b id="wt-shown-n">0</b></span>
    </div>
    <div class="wt-scroll">
      <table class="wt-tbl" id="pgk-workers-tbl">
        <thead><tr id="pgk-workers-hdr">
          <th class="no-sort" style="width:36px;text-align:center;color:var(--tx3)">#</th>
          ${thSort('name','Ф.И.О.')}
          ${thSort('role','Должность')}
          ${thSort('status','Статус')}
          ${thSort('base','База / Объект')}
          ${thSort('days','Дней')}
          ${thSort('last_shift_end','Посл. выезд')}
          ${thSort('rest_days','Дней отдыха')}
          ${thSort('last_shift_volume','Объём')}
          <th class="no-sort" style="min-width:260px">Примечания</th>
        </tr></thead>
        <tbody id="wt-tbody">${rows||`<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--tx3)">Нет сотрудников</td></tr>`}</tbody>
      </table>
    </div>
  </div>`;

  const srch=window._pgkWSearchVal||'';
  if(srch){
    const inp=document.getElementById('pgk-w-search');
    if(inp)inp.value=srch;
    pgkWorkerSearchFilter(srch);
  }
  _pgkInitColResize('pgk-workers-hdr');
}

function pgkWorkerSearchFilter(val){
  window._pgkWSearchVal=val;
  const q=val.toLowerCase().trim();
  const rows=document.querySelectorAll('#wt-tbody tr[data-wid]');
  let shown=0;
  rows.forEach(tr=>{
    const match=!q||tr.dataset.search.includes(q);
    tr.style.display=match?'':'none';
    if(match)shown++;
  });
  // Renumber visible rows from 1
  let num=1;
  rows.forEach(tr=>{if(tr.style.display!=='none'){const c=tr.querySelector('td:first-child');if(c)c.textContent=num++;}});
  const cntWrap=document.getElementById('wt-shown-count');
  const cntN=document.getElementById('wt-shown-n');
  if(cntWrap&&cntN){
    if(q){cntWrap.style.display='';cntN.textContent=shown;}
    else{cntWrap.style.display='none';}
  }
}

function pgkNotesModal(wid){
  const w=pgkWorkers.find(x=>x.id===wid);if(!w)return;
  showModal('Примечания — '+esc(w.name),`
    <div class="fg s2" style="margin:0">
      <textarea id="pgk-notes-ta" rows="6"
        style="width:100%;font-size:13px;padding:8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);resize:vertical;box-sizing:border-box"
        placeholder="Введите примечание...">${esc(w.notes||'')}</textarea>
    </div>
  `,[
    {label:'Закрыть',cls:'bs',fn:closeModal},
    {label:'Сохранить',cls:'bp',fn:async()=>{
      const notes=document.getElementById('pgk-notes-ta').value;
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,notes,user_name:un()})});
      closeModal();await loadPGK();toast('Примечание сохранено','ok');
    }}
  ]);
  setTimeout(()=>{const ta=document.getElementById('pgk-notes-ta');if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}},50);
}

function _pgkInitColResize(trId){
  const tr=document.getElementById(trId);
  if(!tr)return;
  tr.querySelectorAll('th').forEach(th=>{
    if(th.querySelector('.th-rzr'))return;
    const rz=document.createElement('div');
    rz.className='th-rzr';
    th.appendChild(rz);
    rz.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      const startX=e.pageX, startW=th.offsetWidth;
      const onMove=e=>{const w=Math.max(40,startW+(e.pageX-startX));th.style.width=w+'px';th.style.minWidth=w+'px';};
      const onUp=()=>{document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  });
}

function workerCtxMenu(ev,wid){
  const w=pgkWorkers.find(x=>x.id===wid);
  if(!w)return;
  const statusItems=Object.entries(WORKER_STATUSES).map(([k,v])=>({
    i:'', l:(w.status||'home')===k?'✓ '+v:v,
    f:()=>pgkChangeWorkerStatus(wid,k)
  }));
  showCtx(ev.clientX,ev.clientY,[
    {i:'👤',l:'<b>'+esc(w.name.trim())+'</b>',html:true,f:()=>openWorkerDetail(wid)},
    {sep:true},
    {i:'📋',l:'Открыть карточку',f:()=>openWorkerDetail(wid)},
    {i:'✏️',l:'Редактировать',f:()=>pgkEditWorker(wid)},
    {i:'📝',l:'Добавить примечание',f:()=>pgkEditWorkerNotes(wid)},
    {sep:true},
    {i:'🏕',l:'Начать вахту',f:()=>openStartShiftModal(wid)},
    ...(w.start_date?[{i:'🏁',l:'Завершить вахту',f:()=>openEndShiftModal(wid)}]:[]),
    {sep:true},
    {i:'🔄',l:'Изменить статус ▸',f:()=>{}},
    ...statusItems.map(si=>({i:'  ',l:si.l,f:si.f})),
    {sep:true},
    {i:'🗑',l:'Удалить сотрудника',cls:'cxi-red',f:()=>pgkDelWorker(wid)},
  ]);
}

async function pgkEditWorkerNotes(wid){
  const w=pgkWorkers.find(x=>x.id===wid);if(!w)return;
  showModal('📝 Примечание — '+esc(w.name.trim()),
    `<div class="fg"><label>Примечание</label><textarea id="f-wnotes" rows="4" placeholder="Введите примечание...">${esc(w.notes||'')}</textarea></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
      const notes=v('f-wnotes');
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,notes,user_name:un()})});
      closeModal();await loadPGK();toast('Примечание сохранено','ok');
    }}]);
}
async function pgkChangeWorkerStatus(wid,status){
  await fetch(`${API}/pgk/workers/${wid}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
  await loadPGK();
}
async function openWorkerDetail(wid){
  try{
    const all=await fetch(`${API}/pgk/workers`).then(r=>r.json());
    const fresh=all.find(x=>x.id===wid);
    if(fresh){const i=pgkWorkers.findIndex(x=>x.id===wid);if(i>=0)pgkWorkers[i]=fresh;}
  }catch(e){}
  const w=pgkWorkers.find(x=>x.id===wid);if(!w)return;
  const [shifts,volProg]=await Promise.all([
    fetch(`${API}/pgk/workers/${wid}/shifts`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/pgk/workers/${wid}/vol_progress`).then(r=>r.json()).catch(()=>[])
  ]);
  const b=bases.find(x=>x.id===w.base_id);
  const parts=w.name.trim().split(/\s+/);
  const initials=parts.slice(0,2).map(p=>p[0]||'').join('').toUpperCase();
  const st=w.status||'home';
  const stStyle={
    working:'color:var(--grn);background:var(--grnl);border-color:#a7f3d0',
    home:'color:var(--tx2);background:var(--s3);border-color:var(--bd)',
    fired:'color:var(--red);background:var(--redl);border-color:#fca5a5'
  };
  const onShift=!!w.start_date;
  const vpBySite={};
  volProg.forEach(p=>{if(!vpBySite[p.site_name])vpBySite[p.site_name]=[];vpBySite[p.site_name].push(p);});
  const html=`
  <div class="wdc-hd">
    <div class="wdc-av">${initials}</div>
    <div class="wdc-info">
      <div class="wdc-name">${esc(w.name)}</div>
      <div class="wdc-role">${esc(w.role||'—')}</div>
      <div class="wdc-chips">
        <span class="wdc-chip" style="${stStyle[st]||stStyle.home}">${WORKER_STATUSES[st]||''}</span>
        ${b?`<span class="wdc-chip" style="color:var(--bpc);background:var(--bpl);border-color:var(--bpb)">🏕 ${esc(b.name)}</span>`:''}
        ${onShift?`<span class="wdc-chip" style="color:var(--acc);background:var(--accl);border-color:var(--accm)">📅 с ${fmt(w.start_date)}</span>`:''}
      </div>
    </div>
  </div>
  <div class="wdc-actions">
    <button class="btn ${onShift?'bs':'bp'} wdc-btn" onclick="closeModal();openStartShiftModal('${wid}')">
      🏕 ${onShift?'Переназначить вахту':'Начать вахту'}
    </button>
    ${onShift?`<button class="btn bd wdc-btn" onclick="closeModal();openEndShiftModal('${wid}')">🏁 Завершить вахту</button>`:''}
  </div>
  <div class="wdc-tabs">
    <button class="wdc-tab on" onclick="wdcSwitch(this,'main')">Основное</button>
    <button class="wdc-tab" onclick="wdcSwitch(this,'shifts')">История вахт (${shifts.length})</button>
    <button class="wdc-tab" onclick="wdcSwitch(this,'vols')">Объёмы (${volProg.length})</button>
  </div>
  <div id="wdc-main" class="wdc-panel">
    ${w.phone?`<div class="wdc-row"><span class="wdc-lbl">Телефон</span><span>${esc(w.phone)}</span></div>`:''}
    ${w.notes?`<div class="wdc-row"><span class="wdc-lbl">Примечания</span><span style="color:var(--tx2)">${esc(w.notes)}</span></div>`:''}
    ${!w.phone&&!w.notes?'<div class="wdc-empty">Дополнительная информация не указана</div>':''}
  </div>
  <div id="wdc-shifts" class="wdc-panel" style="display:none">
    ${shifts.length?shifts.map(s=>`<div class="wdc-shift">
      <div class="wdc-shift-base">${esc(s.base_name||'—')} · <b>${s.days||0} дн.</b></div>
      <div class="wdc-shift-meta">${fmt(s.start_date)}${s.end_date?' → '+fmt(s.end_date):' — по сей день'}</div>
      ${s.notes?`<div class="wdc-shift-notes">${esc(s.notes)}</div>`:''}
    </div>`).join(''):'<div class="wdc-empty">Вахт не было</div>'}
  </div>
  <div id="wdc-vols" class="wdc-panel" style="display:none">
    ${volProg.length?Object.keys(vpBySite).map(sn=>`
      <div class="wdc-vol-site">🏗 ${esc(sn)}</div>
      ${vpBySite[sn].map(p=>`<div class="wdc-vol-row">
        <div><span class="wdc-vol-val">${p.completed} ${esc(p.unit)}</span> — ${esc(p.vol_name)}</div>
        <div class="wdc-vol-date">${fmt(p.work_date)}${p.notes?' · '+esc(p.notes):''}</div>
      </div>`).join('')}`).join(''):'<div class="wdc-empty">Нет данных</div>'}
  </div>`;
  showModal('👤 '+esc(w.name),html,[
    {label:'Закрыть',cls:'bs',fn:closeModal},
    {label:'🗑 Очистить историю',cls:'bd',fn:async()=>{
      if(!confirm('Удалить всю историю вахт и объёмов сотрудника '+w.name+'?'))return;
      const sh=await fetch(`${API}/pgk/workers/${wid}/shifts`).then(r=>r.json()).catch(()=>[]);
      for(const s2 of sh)await fetch(`${API}/pgk/workers/shifts/${s2.id}`,{method:'DELETE'}).catch(()=>{});
      const freshVp=await fetch(`${API}/pgk/workers/${wid}/vol_progress`).then(r=>r.json()).catch(()=>[]);
      for(const vp of freshVp)await fetch(`${API}/vol_progress/${vp.id}`,{method:'DELETE'}).catch(()=>{});
      if(currentObj)await refreshCurrent();
      toast('История очищена','ok');
      await openWorkerDetail(wid);
    }},
    {label:'✏️ Редактировать',cls:'bp',fn:()=>{closeModal();pgkEditWorker(wid);}}
  ]);
}
function wdcSwitch(el,tabId){
  document.querySelectorAll('.wdc-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.wdc-panel').forEach(p=>p.style.display='none');
  el.classList.add('on');
  const p=document.getElementById('wdc-'+tabId);if(p)p.style.display='block';
}
function openStartShiftModal(wid){
  const w=pgkWorkers.find(x=>x.id===wid);if(!w)return;
  const today=new Date().toISOString().split('T')[0];
  showModal('🏕 Начать вахту — '+esc(w.name),
    `<div class="fgr fone">
      <div class="fg"><label>База</label><select id="f-sb">${bases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div class="fg"><label>Дата заезда</label><input id="f-sd" type="date" value="${today}"></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
      const baseId=v('f-sb'),startDate=v('f-sd');
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,base_id:baseId,start_date:startDate,status:'working',user_name:un()})});
      // Update local pgkWorkers cache immediately so openEndShiftModal can read start_date
      const fresh=await fetch(`${API}/pgk/workers/summary`).then(r=>r.json()).catch(()=>null);
      if(fresh){window.pgkWorkers=fresh;}
      closeModal();await loadPGK();if(currentObj)await refreshCurrent();toast('Сотрудник назначен на базу','ok');
    }}]);
}
function calcDaysBetween(d1,d2){
  // Safe day diff using date strings (avoids timezone UTC-midnight issue)
  const a=new Date(d1+'T12:00:00'),b=new Date(d2+'T12:00:00');
  return Math.max(0,Math.round((b-a)/86400000));
}
async function openEndShiftModal(wid){
  // Always fetch fresh worker data to avoid stale start_date from closure/cache
  let w;
  try{
    const all=await fetch(`${API}/pgk/workers`).then(r=>r.json());
    w=all.find(x=>x.id===wid);
    // Also refresh local pgkWorkers cache
    if(w){const i=pgkWorkers.findIndex(x=>x.id===wid);if(i>=0)pgkWorkers[i]=w;}
  }catch(e){}
  if(!w)w=pgkWorkers.find(x=>x.id===wid);
  if(!w)return;
  const today=new Date().toISOString().split('T')[0];
  const startDate=w.start_date||null;
  const days=startDate?calcDaysBetween(startDate,today):0;
  showModal('🏁 Завершить вахту — '+esc(w.name),
    `<div class="fgr fone">
      <div style="font-size:11px;color:var(--tx2);margin-bottom:8px">
        Начало: ${startDate?fmt(startDate):'—'} · ${days} дн.
        ${!startDate?'<span style="color:var(--red);font-size:10px"> (дата начала не задана)</span>':''}
      </div>
      <div class="fg"><label>Дата начала вахты</label><input id="f-sd" type="date" value="${startDate||today}"></div>
      <div class="fg"><label>Дата окончания</label><input id="f-ed" type="date" value="${today}"></div>
      <div class="fg"><label>Примечания</label><input id="f-en" placeholder="Итоги вахты..."></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'✅ Завершить',cls:'bp',fn:async()=>{
      const sd=v('f-sd')||today;
      const endDate=v('f-ed')||today;
      const realDays=calcDaysBetween(sd,endDate);
      // Save shift record with corrected start_date from form
      await fetch(`${API}/pgk/workers/${wid}/shifts`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({base_id:w.base_id,start_date:sd,end_date:endDate,days:realDays,notes:v('f-en')})});
      // Reset worker
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,base_id:null,start_date:null,status:'home',user_name:un()})});
      closeModal();await loadPGK();
      if(currentObj)await refreshCurrent();
      toast('Вахта завершена. Дней: '+realDays,'ok');
    }}]);
}

// ── MACHINERY PAGE (4 tabs) ────────────────────────────────
function pgkPageMachinery(pb){
  const tab=window._mchTab||'park';
  const view=window._mchView||'table';
  pb.innerHTML=`<div class="mch-outer">
  <div class="mch-topbar">
    <div class="mch-page-tabs">
      <button class="mch-page-tab${tab==='park'?' on':''}" onclick="_setMchTab('park')">🚛 Парк <span class="mch-cnt">${pgkMachinery.length}</span></button>
      <button class="mch-page-tab${tab==='fuel'?' on':''}" onclick="_setMchTab('fuel')">⛽ Топливо</button>
      <button class="mch-page-tab${tab==='drivers'?' on':''}" onclick="_setMchTab('drivers')">👤 Водители</button>
      <button class="mch-page-tab${tab==='spares'?' on':''}" onclick="_setMchTab('spares')">🔧 Запчасти <span class="mch-cnt">${pgkSpares.length}</span></button>
    </div>
    <div class="mch-topbar-act">
      ${tab==='park'?`<div class="mch-view-toggle">
        <button class="btn bsm ${view==='cards'?'bp':'bs'}" onclick="_setMchView('cards')" title="Карточки">⊞ Карточки</button>
        <button class="btn bsm ${view==='table'?'bp':'bs'}" onclick="_setMchView('table')" title="Список">☰ Список</button>
      </div><button class="btn bp bsm" onclick="pgkAddMach()">＋ Добавить</button>`:''}
      ${tab==='fuel'?`<button class="btn bp bsm" onclick="mchFuelRecord()">＋ Записать</button>`:''}
      ${tab==='spares'?`<button class="btn bs bsm" onclick="mchSpareAddGroup()">＋ Группа</button><button class="btn bp bsm" onclick="mchSpareAdd()">＋ Запчасть</button>`:''}
      <button class="btn bg bsm" onclick="techExportExcel()" title="Экспорт всей вкладки в Excel">📤 Excel</button>
    </div>
  </div>
  <div id="mch-park" class="mch-panel${tab==='park'?' active':''}">${_mchBuildPark(view)}</div>
  <div id="mch-fuel" class="mch-panel${tab==='fuel'?' active':''}">${_mchBuildFuel()}</div>
  <div id="mch-drivers" class="mch-panel${tab==='drivers'?' active':''}">${_mchBuildDrivers()}</div>
  <div id="mch-spares" class="mch-panel${tab==='spares'?' active':''}">${_mchBuildSpares()}</div>
  </div>`;
  if(tab==='park'){const s=window._pgkMSearchVal||'';if(s){const inp=document.getElementById('mch-search');if(inp){inp.value=s;_mchParkSearch(s);}}}
}
function _setMchTab(t){window._mchTab=t;const pb=document.getElementById('machinery-page');if(pb)pgkPageMachinery(pb);}
function _setMchView(v){window._mchView=v;const pb=document.getElementById('machinery-page');if(pb)pgkPageMachinery(pb);}
function _mchSpareGrp(gid){window._mchSpareGroup=gid;const pb=document.getElementById('machinery-page');if(pb)pgkPageMachinery(pb);}

// ─────────────────────────────────────────────────────────────
// Excel-экспорт вкладки «Техника» (стиль СМГ)
// ─────────────────────────────────────────────────────────────
async function techExportExcel(){
  if(typeof XLSX==='undefined'){toast('Библиотека XLSX не загружена','err');return;}
  toast('Готовим Excel…');

  // Подгружаем актуальные топливные операции по всем базам (последние 200 на каждую)
  let allTxns=[];
  try{
    const arr=await Promise.all((bases||[]).map(b=>
      fetch(`${API}/fuel_transactions?base_id=${encodeURIComponent(b.id)}`).then(r=>r.json()).catch(()=>[])
    ));
    arr.forEach((rows,i)=>rows.forEach(t=>allTxns.push({...t,_baseName:(bases[i]||{}).name||t.base_id})));
    allTxns.sort((a,b)=>(b.created_at||b.op_date||'').localeCompare(a.created_at||a.op_date||''));
    allTxns=allTxns.slice(0,200);
  }catch(e){}

  const baseName=id=>((bases||[]).find(b=>b.id===id)||{}).name||'—';
  const driverNameFor=mid=>{
    const m=(pgkMachinery||[]).find(x=>x.id===mid);
    if(!m||!m.driver_id)return '';
    const w=(pgkWorkers||[]).find(w=>w.id===m.driver_id);
    return w?w.name:'';
  };

  // ── Стили (мирроринг СМГ) ──────────────────────────────────
  const border={
    top:{style:'thin',color:{rgb:'808080'}},bottom:{style:'thin',color:{rgb:'808080'}},
    left:{style:'thin',color:{rgb:'808080'}},right:{style:'thin',color:{rgb:'808080'}},
  };
  const baseAlign={horizontal:'center',vertical:'center',wrapText:true};
  const titleStyle={font:{bold:true,sz:14},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'D9E1F2'}},border};
  const headerStyle={font:{bold:true,sz:11},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'BDD7EE'}},border};
  const groupStyle=fill=>({font:{bold:true,sz:12,color:{rgb:'FFFFFF'}},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:fill}},border});
  const bodyStyle=alt=>({font:{sz:11},alignment:{horizontal:'left',vertical:'center',wrapText:true},
    fill:{patternType:'solid',fgColor:{rgb:alt?'DDEBF7':'FFFFFF'}},border});

  function colLetter(c){let s='',n=c;do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
  function ref(r,c){return colLetter(c)+(r+1);}
  function setStyle(ws,cellRef,style){if(!ws[cellRef])ws[cellRef]={t:'s',v:''};ws[cellRef].s=style;}
  function applyTitleAndHeader(ws,colCount,titleText){
    setStyle(ws,ref(0,0),titleStyle);
    for(let c=0;c<colCount;c++)setStyle(ws,ref(2,c),headerStyle);
  }

  // ── Лист «Парк» ─────────────────────────────────────────────
  function buildPark(){
    const cols=['№','Тип','Имя','Гос.номер','База','Статус','Водитель','Заметки'];
    const aoa=[['Парк техники — '+new Date().toLocaleDateString('ru-RU')],[],cols];
    const merges=[{s:{r:0,c:0},e:{r:0,c:cols.length-1}}];
    const groupRows=[];
    const TYPE_FILL={'ТРЭКОЛ':'00B0F0','БУРЛАК':'00B050','ТАНК':'A6A6A6','ТРОМ':'00B0F0',
      'ЛЕГКОВАЯ':'A6A6A6','ГРУЗОВАЯ':'FFC000','СНЕГОХОД':'D9E1F2'};
    let row=3,seq=0;
    (TRANSPORT_TYPES||[]).forEach(t=>{
      const items=(pgkMachinery||[]).filter(m=>m.type===t);
      if(!items.length)return;
      aoa.push([(MICONS[t]||'🔧')+' '+t]);
      groupRows.push({r:row,fill:TYPE_FILL[t]||'808080'});
      merges.push({s:{r:row,c:0},e:{r:row,c:cols.length-1}});
      row++;
      items.forEach(m=>{
        seq++;
        aoa.push([seq, m.type||'', m.name||'', m.plate_number||'',
          baseName(m.base_id), SL[m.status]||m.status||'', driverNameFor(m.id), m.notes||'']);
        row++;
      });
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:5},{wch:12},{wch:24},{wch:14},{wch:18},{wch:14},{wch:22},{wch:30}];
    ws['!merges']=merges;
    applyTitleAndHeader(ws,cols.length,aoa[0][0]);
    groupRows.forEach(g=>{for(let c=0;c<cols.length;c++)setStyle(ws,ref(g.r,c),groupStyle(g.fill));});
    // body zebra
    let alt=false,prevRow=2;
    for(let r=3;r<row;r++){
      if(groupRows.some(g=>g.r===r)){alt=false;continue;}
      for(let c=0;c<cols.length;c++)setStyle(ws,ref(r,c),bodyStyle(alt));
      alt=!alt;
    }
    return ws;
  }

  // ── Лист «Топливо» ──────────────────────────────────────────
  function buildFuel(){
    const cols=['№','База','Тип топлива','Остаток (л)','Заметки','Обновлено'];
    const aoa=[['Топливо — остатки и операции'],[],cols];
    const merges=[{s:{r:0,c:0},e:{r:0,c:cols.length-1}}];
    let row=3,seq=0;
    (pgkFuelReserves||[]).forEach(r=>{
      seq++;
      aoa.push([seq, baseName(r.base_id), r.fuel_type||'', +(r.amount||0),
        r.notes||'', (r.updated_at||'').slice(0,16).replace('T',' ')]);
      row++;
    });
    // Раздел «Последние операции»
    aoa.push([]); row++;
    aoa.push(['Последние операции']);
    const opsHeaderRow=row;
    merges.push({s:{r:row,c:0},e:{r:row,c:cols.length-1}});
    row++;
    const opsCols=['Дата','База','Тип','Δ (л)','Заметки',''];
    aoa.push(opsCols);
    const opsHdrRow=row;
    row++;
    allTxns.forEach(t=>{
      aoa.push([(t.op_date||t.created_at||'').slice(0,16).replace('T',' '),
        t._baseName, t.fuel_type||'', +(t.delta||0), t.notes||'', '']);
      row++;
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:14},{wch:22},{wch:18},{wch:12},{wch:30},{wch:18}];
    ws['!merges']=merges;
    applyTitleAndHeader(ws,cols.length,aoa[0][0]);
    // зебра для остатков
    let alt=false;
    for(let r=3;r<opsHeaderRow;r++){
      for(let c=0;c<cols.length;c++)setStyle(ws,ref(r,c),bodyStyle(alt));
      alt=!alt;
    }
    // group-row "Последние операции"
    for(let c=0;c<cols.length;c++)setStyle(ws,ref(opsHeaderRow,c),groupStyle('00B050'));
    // ops header
    for(let c=0;c<cols.length;c++)setStyle(ws,ref(opsHdrRow,c),headerStyle);
    alt=false;
    for(let r=opsHdrRow+1;r<row;r++){
      for(let c=0;c<cols.length;c++)setStyle(ws,ref(r,c),bodyStyle(alt));
      alt=!alt;
    }
    return ws;
  }

  // ── Лист «Запчасти» ─────────────────────────────────────────
  function buildSpares(){
    const cols=['№','Название','Кол-во','Ед.','Местоположение','Заметки'];
    const aoa=[['Запчасти и материалы'],[],cols];
    const merges=[{s:{r:0,c:0},e:{r:0,c:cols.length-1}}];
    const groupRows=[];
    let row=3,seq=0;
    const groups=[...(pgkSpareGroups||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const ungrouped=(pgkSpares||[]).filter(s=>!s.group_id||!groups.find(g=>g.id===s.group_id));
    function pushGroup(name,fill,items){
      if(!items.length)return;
      aoa.push([name]);
      groupRows.push({r:row,fill});
      merges.push({s:{r:row,c:0},e:{r:row,c:cols.length-1}});
      row++;
      items.forEach(s=>{seq++;
        aoa.push([seq, s.name||'', +(s.quantity||0), s.unit||'шт', s.location||'', s.notes||'']);
        row++;
      });
    }
    groups.forEach((g,i)=>pushGroup('🔧 '+(g.name||'—'), i%2?'00B0F0':'00B050',
      (pgkSpares||[]).filter(s=>s.group_id===g.id)));
    pushGroup('Без группы','A6A6A6',ungrouped);

    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:5},{wch:30},{wch:10},{wch:8},{wch:20},{wch:30}];
    ws['!merges']=merges;
    applyTitleAndHeader(ws,cols.length,aoa[0][0]);
    groupRows.forEach(g=>{for(let c=0;c<cols.length;c++)setStyle(ws,ref(g.r,c),groupStyle(g.fill));});
    let alt=false;
    for(let r=3;r<row;r++){
      if(groupRows.some(g=>g.r===r)){alt=false;continue;}
      for(let c=0;c<cols.length;c++)setStyle(ws,ref(r,c),bodyStyle(alt));
      alt=!alt;
    }
    return ws;
  }

  // ── Лист «Водители» ─────────────────────────────────────────
  function buildDrivers(){
    const cols=['№','ФИО','Должность','База','Назначенная техника','Статус'];
    const aoa=[['Водители'],[],cols];
    const merges=[{s:{r:0,c:0},e:{r:0,c:cols.length-1}}];
    const drivers=(pgkWorkers||[]).filter(w=>{const r=(w.role||'').toLowerCase();return r.includes('водитель')||r.includes('мбу')||r.includes('пмбу');});
    let row=3,seq=0;
    drivers.forEach(w=>{
      seq++;
      const mach=(pgkMachinery||[]).find(m=>m.driver_id===w.id);
      const stRaw=w.start_date?'working':(w.status||'home');
      aoa.push([seq, w.name||'', w.role||'', baseName(w.base_id),
        mach?`${MICONS[mach.type]||'🔧'} ${mach.name||''} ${mach.plate_number||''}`.trim():'',
        WORKER_STATUSES[stRaw]||stRaw]);
      row++;
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:5},{wch:24},{wch:16},{wch:18},{wch:30},{wch:14}];
    ws['!merges']=merges;
    applyTitleAndHeader(ws,cols.length,aoa[0][0]);
    let alt=false;
    for(let r=3;r<row;r++){
      for(let c=0;c<cols.length;c++)setStyle(ws,ref(r,c),bodyStyle(alt));
      alt=!alt;
    }
    return ws;
  }

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildPark(),    'Парк');
  XLSX.utils.book_append_sheet(wb, buildFuel(),    'Топливо');
  XLSX.utils.book_append_sheet(wb, buildSpares(),  'Запчасти');
  XLSX.utils.book_append_sheet(wb, buildDrivers(), 'Водители');
  const today=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Техника_${today}.xlsx`);
  toast('✓ Excel сохранён','ok');
}

function _mchBuildPark(view){
  const statCls={working:'wbs-working',idle:'wbs-idle',broken:'wbs-sick'};
  const statLbl={working:'✅ В работе',idle:'⏸ Простой',broken:'🔴 Сломана'};
  const _mfBase=window._pgkMFBase||'';
  const _mfStatus=window._pgkMFStatus||'';
  const _mfType=window._pgkMFType||'';

  const baseOpts=`<option value="">Все базы</option>`+bases.map(b=>`<option value="${b.id}" ${_mfBase===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
  const statOpts=`<option value="">Все статусы</option>`+Object.entries(statLbl).map(([k,v])=>`<option value="${k}" ${_mfStatus===k?'selected':''}>${v}</option>`).join('');
  const types=[...new Set(pgkMachinery.map(m=>m.type).filter(Boolean))].sort();
  const typeOpts=`<option value="">Все типы</option>`+types.map(t=>`<option value="${t}" ${_mfType===t?'selected':''}>${esc(t)}</option>`).join('');
  let filtered=[...pgkMachinery];
  if(_mfBase)filtered=filtered.filter(m=>m.base_id===_mfBase);
  if(_mfStatus)filtered=filtered.filter(m=>(m.status||'working')===_mfStatus);
  if(_mfType)filtered=filtered.filter(m=>(m.type||'')===_mfType);
  const cnt={working:0,idle:0,broken:0};
  pgkMachinery.forEach(m=>cnt[m.status||'working']=(cnt[m.status||'working']||0)+1);
  const statDot={working:'#22c55e',idle:'#f59e0b',broken:'#ef4444'};
  const toolbar=`<div class="wt-toolbar" style="flex-shrink:0">
    <input id="mch-search" type="search" placeholder="🔍 Поиск…"
      style="font-size:11px;padding:3px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);outline:none;min-width:150px"
      oninput="_mchParkSearch(this.value)" />
    <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkMFStatus=this.value;_setMchTab('park')">${statOpts}</select>
    <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkMFType=this.value;_setMchTab('park')">${typeOpts}</select>
    <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkMFBase=this.value;_setMchTab('park')">${baseOpts}</select>
    <span style="font-size:10px;color:var(--tx3);white-space:nowrap">
      <span style="color:#15803d">✅ ${cnt.working}</span> · <span style="color:#a16207">⏸ ${cnt.idle}</span> · <span style="color:#b91c1c">🔴 ${cnt.broken}</span>
    </span>
  </div>`;
  if(view==='cards'){
    const cards=filtered.map(m=>{
      const b=bases.find(x=>x.id===m.base_id);
      const driver=pgkWorkers.find(x=>x.id===m.driver_id);
      const st=m.status||'working';const _id=escAttr(m.id);
      return `<div class="mch-card" data-search="${esc((m.name+' '+(m.type||'')+' '+(m.plate_number||'')+' '+(b?b.name:'')+' '+(driver?driver.name:'')).toLowerCase())}"
        onclick="openMachDetail('${_id}')" oncontextmenu="event.preventDefault();machCtxMenu(event,'${_id}')">
        <div class="mch-card-top"><div class="mch-card-ico">${MICONS[m.type]||'🔧'}</div>
          <span class="mch-card-stdot" style="background:${statDot[st]||'#9ca3af'}" title="${statLbl[st]||st}"></span></div>
        <div class="mch-card-name">${esc(m.name)}</div>
        ${m.plate_number?`<div class="mch-card-plate">${esc(m.plate_number)}</div>`:''}
        <div class="mch-card-type">${esc(m.type||'—')}</div>
        <div class="mch-card-chips"><span class="wt-badge ${statCls[st]||'wbs-idle'}" style="font-size:9px">${statLbl[st]||st}</span>
          ${b?`<span class="mch-card-base">🏕 ${esc(b.name)}</span>`:''}</div>
        ${driver?`<div class="mch-card-drv">👤 ${esc(driver.name)}</div>`:''}
      </div>`;
    }).join('');
    return toolbar+`<div class="mch-grid" id="mch-park-grid">${filtered.length?cards:'<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--tx3)">Нет техники</div>'}</div>`;
  }
  // ── Sortable table view ────────────────────────────────────
  const _ms=window._mchSort||'name', _ma=window._mchAsc!==false;
  const getBase=m=>(bases.find(x=>x.id===m.base_id)||{}).name||'';
  const getDriver=m=>{const w=pgkWorkers.find(x=>x.id===m.driver_id);return w?w.name:'';};
  const getStatus=m=>statLbl[m.status||'working']||m.status||'';
  filtered.sort((a,b)=>{
    let va,vb;
    if(_ms==='base'){va=getBase(a);vb=getBase(b);}
    else if(_ms==='driver'){va=getDriver(a);vb=getDriver(b);}
    else if(_ms==='status'){va=getStatus(a);vb=getStatus(b);}
    else{va=a[_ms]||'';vb=b[_ms]||'';}
    return String(va).localeCompare(String(vb),'ru')*(_ma?1:-1);
  });
  const thCls=col=>`class="${_ms===col?(_ma?'wt-asc':'wt-desc'):''}"`;
  const thS=(col,lbl)=>`<th ${thCls(col)} onclick="if(window._mchSort==='${col}'){window._mchAsc=!(window._mchAsc!==false);}else{window._mchSort='${col}';window._mchAsc=true;}const pb2=document.getElementById('machinery-page');if(pb2)pgkPageMachinery(pb2);">${lbl}</th>`;
  const rows=filtered.map((m,i)=>{
    const b=bases.find(x=>x.id===m.base_id);
    const driver=pgkWorkers.find(x=>x.id===m.driver_id);
    const st=m.status||'working';const _id=escAttr(m.id);
    return `<tr data-search="${esc((m.name+' '+(m.type||'')+' '+(m.plate_number||'')+' '+(b?b.name:'')+' '+(driver?driver.name:'')).toLowerCase())}"
      oncontextmenu="event.preventDefault();machCtxMenu(event,'${_id}')">
      <td style="text-align:center;color:var(--tx3);font-size:10px;width:32px">${i+1}</td>
      <td class="td-link" onclick="openMachDetail('${_id}')"><span style="font-size:14px">${MICONS[m.type]||'🔧'}</span> <b>${esc(m.name)}</b></td>
      <td style="color:var(--tx2)">${esc(m.type||'—')}</td>
      <td>${m.plate_number?`<code style="font-size:11px;background:var(--s2);padding:1px 5px;border-radius:3px">${esc(m.plate_number)}</code>`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td><span class="wt-badge ${statCls[st]||'wbs-idle'}" style="cursor:pointer" title="Фильтр по статусу"
        onclick="window._pgkMFStatus=(window._pgkMFStatus===('${st}')?'':'${st}');_setMchTab('park')">${statLbl[st]||st}</span></td>
      <td>${b?`<span style="color:var(--bpc)">🏕 ${esc(b.name)}</span>`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td>${driver?`👤 ${esc(driver.name)}`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td class="td-notes" title="${esc(m.notes||'')}">${esc((m.notes||'').slice(0,60))}</td>
    </tr>`;
  }).join('');
  return toolbar+`<div class="wt-scroll"><table class="wt-tbl" id="mch-park-tbl" style="min-width:720px">
    <thead><tr>
      <th class="no-sort" style="width:32px;text-align:center">#</th>
      ${thS('name','Название')}
      ${thS('type','Тип')}
      ${thS('plate_number','Номер')}
      ${thS('status','Статус')}
      ${thS('base','База')}
      ${thS('driver','Водитель')}
      <th class="no-sort" style="min-width:100px">Примечания</th>
    </tr></thead>
    <tbody id="mch-park-tbl-body">${rows||`<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tx3)">Нет техники</td></tr>`}</tbody>
  </table></div>`;
}
function _mchParkSearch(val){
  window._pgkMSearchVal=val;const q=val.toLowerCase().trim();
  document.querySelectorAll('.mch-card[data-search]').forEach(c=>{c.style.display=!q||c.dataset.search.includes(q)?'':'none';});
  let n=0;
  document.querySelectorAll('#mch-park-tbl tbody tr[data-search]').forEach(r=>{
    const show=!q||r.dataset.search.includes(q);
    r.style.display=show?'':'none';
    if(show){const c=r.querySelector('td:first-child');if(c)c.textContent=++n;}
  });
}
function _mchBuildFuel(){
  const byBase={};
  pgkFuelReserves.forEach(r=>(byBase[r.base_id]=byBase[r.base_id]||[]).push(r));
  if(!bases.length)return '<div style="padding:24px;color:var(--tx3)">Нет баз</div>';
  return `<div class="fuel-wrap">${bases.map(b=>{
    const rsvs=byBase[b.id]||[];
    const _bid=escAttr(b.id);
    return `<div class="fuel-base-card">
      <div class="fuel-base-head"><span class="fuel-base-name">🏕 ${esc(b.name)}</span>
        <button class="btn bs bxs" onclick="mchFuelRecord('${_bid}','')">＋ Добавить</button></div>
      ${rsvs.map(r=>{
        const _ft=esc(r.fuel_type);
        return `<div class="fuel-row" onclick="mchFuelCard('${_bid}','${_ft}')" style="cursor:pointer">
          <span class="fuel-type">${_ft}</span>
          <span class="fuel-amount"><b>${(+r.amount||0).toLocaleString('ru')}</b> л</span>
          <button class="btn bs bxs" style="flex-shrink:0" onclick="event.stopPropagation();mchFuelQuick('${_bid}','${_ft}')">＋/－</button>
        </div>`;
      }).join('')||'<div style="font-size:11px;color:var(--tx3);padding:6px 0">Нет данных — нажмите ＋ Добавить</div>'}
    </div>`;
  }).join('')}</div>`;
}
function mchFuelQuick(baseId,fuelType){
  // Simplified modal: just op type + amount + date + comment
  const today=new Date().toISOString().split('T')[0];
  const b=bases.find(x=>x.id===baseId);
  showModal(`⛽ ${b?esc(b.name):''} — ${fuelType}`,`<div class="fgr">
    <div class="fg"><label>Операция</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="radio" name="fq-op" id="fq-in" value="in" checked style="accent-color:var(--grn)"> <span style="color:var(--grn);font-weight:700">▲ Приход</span></label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="radio" name="fq-op" id="fq-out" value="out" style="accent-color:var(--red)"> <span style="color:var(--red);font-weight:700">▼ Расход</span></label>
      </div>
    </div>
    <div class="fg s2"><label>Дата</label><input id="fq-date" type="date" value="${today}"></div>
    <div class="fg"><label>Количество, л</label><input id="fq-amt" type="number" step="any" min="0" placeholder="500" autofocus></div>
    <div class="fg s2"><label>Комментарий</label><input id="fq-notes" placeholder="Заправка от поставщика…"></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const amt=parseFloat(v('fq-amt'));
    if(isNaN(amt)||amt<=0){toast('Введите количество','err');return;}
    const opIn=document.getElementById('fq-in')&&document.getElementById('fq-in').checked;
    const delta=opIn?amt:-amt;
    await fetch(`${API}/fuel_transactions`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({base_id:baseId,fuel_type:fuelType,delta,notes:v('fq-notes'),op_date:v('fq-date')||today})});
    pgkFuelReserves=await fetch(`${API}/fuel_reserves`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('fuel');toast(delta>0?`+${amt} л — приход`:`${amt} л — расход`,'ok');
  }}]);
}
async function mchFuelCard(baseId,fuelType){
  const b=bases.find(x=>x.id===baseId);
  const rsv=pgkFuelReserves.find(r=>r.base_id===baseId&&r.fuel_type===fuelType);
  const params=new URLSearchParams({base_id:baseId,fuel_type:fuelType});
  const txns=await fetch(`${API}/fuel_transactions?${params}`).then(r=>r.json()).catch(()=>[]);
  const histRows=txns.length?txns.map(t=>{
    const sign=t.delta>0?'+':'';const clr=t.delta>0?'var(--grn)':'var(--red)';
    return `<tr>
      <td style="font-size:10px;color:var(--tx3)">${(t.op_date||t.created_at||'').slice(0,10)}</td>
      <td style="font-weight:700;color:${clr};text-align:right">${sign}${t.delta} л</td>
      <td style="font-size:10px;color:var(--tx3)">${esc(t.notes||'')}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--tx3)">История пуста</td></tr>`;
  showModal(`⛽ ${b?esc(b.name):''} — ${fuelType}`,`
    <div style="text-align:center;padding:12px 0 16px;border-bottom:1px solid var(--bd);margin-bottom:12px">
      <div style="font-size:32px;font-weight:800;color:var(--acc)">${(+(rsv?.amount||0)).toLocaleString('ru')} <span style="font-size:14px;font-weight:400;color:var(--tx3)">л</span></div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">Текущий остаток</div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:8px;letter-spacing:.4px">ИСТОРИЯ ОПЕРАЦИЙ</div>
    <div style="max-height:280px;overflow-y:auto">
      <table class="wt-tbl" style="min-width:260px">
        <thead><tr><th>Дата</th><th style="text-align:right">Количество</th><th>Комментарий</th></tr></thead>
        <tbody>${histRows}</tbody>
      </table>
    </div>`,
    [{label:'Закрыть',cls:'bs',fn:closeModal},{label:'＋/－ Записать',cls:'bp',fn:()=>{closeModal();mchFuelQuick(baseId,fuelType);}}]);
}
function _mchBuildDrivers(){
  const machByDrv={};pgkMachinery.forEach(m=>{if(m.driver_id)machByDrv[m.driver_id]=m;});
  let workers=pgkWorkers.filter(w=>{if(w.status==='fired')return false;const r=(w.role||'').toLowerCase();return r.includes('водитель')||r.includes('мбу')||r.includes('пмбу');});
  const wstCls={'working':'wbs-working','home':'wbs-home'};
  const wstLbl={'working':'В работе','home':'Дома'};
  const _ds=window._drvSort||'name';const _da=window._drvAsc!==false;
  workers=[...workers].sort((a,b)=>{
    let va,vb;
    if(_ds==='machine'){va=(machByDrv[a.id]||{}).name||'';vb=(machByDrv[b.id]||{}).name||'';}
    else if(_ds==='base'){va=(bases.find(x=>x.id===a.base_id)||{}).name||'';vb=(bases.find(x=>x.id===b.base_id)||{}).name||'';}
    else if(_ds==='status'){va=a.status||'home';vb=b.status||'home';}
    else{va=a.name||'';vb=b.name||'';}
    return String(va).localeCompare(String(vb),'ru')*(_da?1:-1);
  });
  const th=(col,lbl)=>`<th class="${_ds===col?(_da?'wt-asc':'wt-desc'):''}" onclick="if(window._drvSort==='${col}'){window._drvAsc=!(window._drvAsc!==false);}else{window._drvSort='${col}';window._drvAsc=true;}_setMchTab('drivers')">${lbl}</th>`;
  const rows=workers.map(w=>{
    const mach=machByDrv[w.id];const b=bases.find(x=>x.id===w.base_id);
    const ws=w.status||'home';
    return `<tr>
      <td><div style="font-weight:700">${esc(w.name)}</div><div style="font-size:10px;color:var(--tx3)">${esc(w.role||'')}</div></td>
      <td><span class="wt-badge ${wstCls[ws]||'wbs-home'}" style="font-size:10px">${wstLbl[ws]||ws}</span></td>
      <td>${mach?`${MICONS[mach.type]||'🔧'} <b>${esc(mach.name)}</b>`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td>${b?esc(b.name):'<span style="color:var(--tx3)">—</span>'}</td>
      <td><button class="btn bs bsm" onclick="mchAssignDriver('${escAttr(w.id)}')">🔄 Назначить</button></td>
    </tr>`;
  }).join('');
  return `<div class="wt-scroll"><table class="wt-tbl" style="min-width:600px">
    <thead><tr>${th('name','Сотрудник')}${th('status','Статус')}${th('machine','Машина')}${th('base','База')}<th class="no-sort">Действия</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--tx3)">Нет водителей</td></tr>`}</tbody>
  </table></div>`;
}
function _mchBuildSpares(){
  const selGroup=window._mchSpareGroup;
  let filtered=selGroup==='__none__'?pgkSpares.filter(s=>!s.group_id):selGroup?pgkSpares.filter(s=>s.group_id===selGroup):[...pgkSpares];
  const sidebar=`<div class="spare-sidebar">
    <div class="spare-sidebar-hd">Группы</div>
    <div class="spare-grp-item${!selGroup?' on':''}" onclick="_mchSpareGrp(null)">Все <span class="mch-cnt" style="background:var(--s3);color:var(--tx3)">${pgkSpares.length}</span></div>
    <div class="spare-grp-item${selGroup==='__none__'?' on':''}" onclick="_mchSpareGrp('__none__')">Без группы <span class="mch-cnt" style="background:var(--s3);color:var(--tx3)">${pgkSpares.filter(s=>!s.group_id).length}</span></div>
    ${pgkSpareGroups.map(g=>`<div class="spare-grp-item${selGroup===g.id?' on':''}">
      <span class="spare-grp-nm" onclick="_mchSpareGrp('${escAttr(g.id)}')">${esc(g.name)} <span class="mch-cnt" style="background:var(--s3);color:var(--tx3)">${pgkSpares.filter(s=>s.group_id===g.id).length}</span></span>
      <span class="spare-grp-acts">
        <button class="btn bxs bs" onclick="event.stopPropagation();mchSpareEditGroup('${escAttr(g.id)}')">✏️</button>
        <button class="btn bxs bd" onclick="event.stopPropagation();mchSpareDelGroup('${escAttr(g.id)}')">🗑</button>
      </span></div>`).join('')}
  </div>`;
  const rows=filtered.map(s=>{
    const grp=pgkSpareGroups.find(g=>g.id===s.group_id);
    return `<tr>
      <td><div style="font-weight:600">${esc(s.name)}</div>${s.notes?`<div style="font-size:10px;color:var(--tx3)">${esc(s.notes)}</div>`:''}</td>
      <td style="font-weight:700;font-size:14px;color:var(--acc)">${+(s.quantity||0)}</td>
      <td style="color:var(--tx3)">${esc(s.unit||'шт')}</td>
      <td>${s.location?esc(s.location):'<span style="color:var(--tx3)">—</span>'}</td>
      <td>${grp?`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--s3)">${esc(grp.name)}</span>`:'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn bs bxs" onclick="mchSpareEdit('${escAttr(s.id)}')">✏️</button>
        <button class="btn bd bxs" onclick="mchSpareDel('${escAttr(s.id)}')">🗑</button></td>
    </tr>`;
  }).join('');
  return `<div class="spare-layout">${sidebar}<div class="spare-main">
    <div class="wt-scroll"><table class="wt-tbl" style="min-width:480px">
      <thead><tr><th>Название</th><th style="width:70px">Кол-во</th><th style="width:55px">Ед.</th>
        <th>Хранение</th><th>Группа</th><th class="no-sort" style="width:70px">—</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tx3)">Нет запчастей</td></tr>`}</tbody>
    </table></div></div></div>`;
}

// ── MACHINERY ACTION FUNCTIONS ─────────────────────────────
function mchFuelRecord(baseId,fuelType){
  baseId=baseId||'';fuelType=fuelType||'';
  const fuelTypes=['Дизельное топливо','Бензин','Масло моторное','Масло трансмиссионное','Антифриз'];
  const baseOpts=bases.map(b=>`<option value="${b.id}" ${b.id===baseId?'selected':''}>${esc(b.name)}</option>`).join('');
  const typeOpts=fuelTypes.map(t=>`<option value="${t}" ${t===fuelType?'selected':''}>${esc(t)}</option>`).join('');
  const today=new Date().toISOString().split('T')[0];
  showModal('⛽ Приход / Расход топлива',`<div class="fgr">
    <div class="fg s2"><label>База</label><select id="f-fb">${baseOpts}</select></div>
    <div class="fg s2"><label>Вид топлива</label><select id="f-ftype">${typeOpts}</select></div>
    <div class="fg"><label>Тип операции</label>
      <div style="display:flex;gap:6px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="radio" name="f-fop" id="f-fop-in" value="in" checked style="accent-color:var(--grn)"> <span style="color:var(--grn);font-weight:700">▲ Приход</span></label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="radio" name="f-fop" id="f-fop-out" value="out" style="accent-color:var(--red)"> <span style="color:var(--red);font-weight:700">▼ Расход</span></label>
      </div>
    </div>
    <div class="fg s2"><label>Дата</label><input id="f-fdate" type="date" value="${today}"></div>
    <div class="fg"><label>Количество, л</label><input id="f-famt" type="number" step="any" min="0" placeholder="500"></div>
    <div class="fg s2"><label>Примечание</label><input id="f-fnotes" placeholder="Заправка от поставщика…"></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'История',cls:'bs',fn:()=>{closeModal();mchFuelHistory(baseId,fuelType);}},{label:'Сохранить',cls:'bp',fn:async()=>{
    const amt=parseFloat(v('f-famt'));
    if(isNaN(amt)||amt<=0){toast('Введите положительное количество','err');return;}
    const opIn=document.getElementById('f-fop-in')&&document.getElementById('f-fop-in').checked;
    const delta=opIn?amt:-amt;
    const op_date=v('f-fdate')||today;
    await fetch(`${API}/fuel_transactions`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({base_id:v('f-fb'),fuel_type:v('f-ftype'),delta,notes:v('f-fnotes'),op_date})});
    pgkFuelReserves=await fetch(`${API}/fuel_reserves`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('fuel');toast(delta>0?`+${amt} л — приход записан`:`${amt} л — расход записан`,'ok');
  }}]);
}
async function mchFuelHistory(baseId,fuelType){
  const params=new URLSearchParams();
  if(baseId)params.set('base_id',baseId);
  if(fuelType)params.set('fuel_type',fuelType);
  const txns=await fetch(`${API}/fuel_transactions?${params}`).then(r=>r.json()).catch(()=>[]);
  const base=bases.find(x=>x.id===baseId);
  const title=`📋 История — ${base?esc(base.name):'все базы'}${fuelType?' / '+esc(fuelType):''}`;
  const rows=txns.length?txns.map(t=>{
    const b=bases.find(x=>x.id===t.base_id);
    const sign=t.delta>0?'+':'';
    const clr=t.delta>0?'var(--grn)':'var(--red)';
    return `<tr>
      <td style="font-size:10px;color:var(--tx3)">${(t.op_date||t.created_at||'').slice(0,10)}</td>
      <td>${b?esc(b.name):'—'}</td>
      <td style="font-size:10px">${esc(t.fuel_type)}</td>
      <td style="font-weight:700;color:${clr};text-align:right">${sign}${t.delta} л</td>
      <td style="font-size:10px;color:var(--tx3)">${esc(t.notes||'')}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--tx3)">Нет записей</td></tr>`;
  showModal(title,`<div style="max-height:400px;overflow-y:auto"><table class="wt-tbl" style="min-width:420px">
    <thead><tr><th>Дата</th><th>База</th><th>Вид</th><th style="text-align:right">Кол-во</th><th>Примечание</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`,[{label:'Закрыть',cls:'bs',fn:closeModal},{label:'+ Запись',cls:'bp',fn:()=>{closeModal();mchFuelRecord(baseId,fuelType);}}]);
}
function mchAssignDriver(workerId){
  const w=pgkWorkers.find(x=>x.id===workerId);if(!w)return;
  const curMach=pgkMachinery.find(m=>m.driver_id===workerId);
  const machOpts=`<option value="">— Снять назначение —</option>`+
    pgkMachinery.map(m=>`<option value="${m.id}" ${m.id===curMach?.id?'selected':''}>${MICONS[m.type]||'🔧'} ${esc(m.name)}</option>`).join('');
  showModal('👤 Назначить машину — '+esc(w.name),`<div class="fgr fone"><div class="fg"><label>Машина</label><select id="f-mdrv">${machOpts}</select></div></div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const newMid=v('f-mdrv');
    if(curMach&&curMach.id!==newMid)
      await fetch(`${API}/pgk/machinery/${curMach.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...curMach,driver_id:null,user_name:un()})});
    if(newMid){const nm=pgkMachinery.find(x=>x.id===newMid);
      if(nm)await fetch(`${API}/pgk/machinery/${newMid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...nm,driver_id:workerId,user_name:un()})});}
    closeModal();await loadPGK();toast('Назначение обновлено','ok');
  }}]);
}
function mchSpareAdd(){
  const grpOpts=`<option value="">— Без группы —</option>`+pgkSpareGroups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  showModal('🔧 Новая запчасть',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-spn" placeholder="Фильтр масляный"></div>
    <div class="fg"><label>Количество</label><input id="f-spq" type="number" value="0" step="any" min="0"></div>
    <div class="fg"><label>Единица</label><input id="f-spu" value="шт" placeholder="шт, л, м, кг…"></div>
    <div class="fg s2"><label>Место хранения</label><input id="f-spl" placeholder="Склад А, Бокс №2…"></div>
    <div class="fg s2"><label>Группа</label><select id="f-spg">${grpOpts}</select></div>
    <div class="fg s2"><label>Примечание</label><input id="f-spnote"></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const name=v('f-spn').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/spare_parts`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,quantity:parseFloat(v('f-spq'))||0,unit:v('f-spu')||'шт',location:v('f-spl'),group_id:v('f-spg')||null,notes:v('f-spnote')})});
    pgkSpares=await fetch(`${API}/spare_parts`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('spares');toast('Добавлено','ok');
  }}]);
}
function mchSpareEdit(id){
  const s=pgkSpares.find(x=>x.id===id);if(!s)return;
  const grpOpts=`<option value="">— Без группы —</option>`+pgkSpareGroups.map(g=>`<option value="${g.id}" ${g.id===s.group_id?'selected':''}>${esc(g.name)}</option>`).join('');
  showModal('✏️ Редактировать запчасть',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-spn" value="${esc(s.name)}"></div>
    <div class="fg"><label>Количество</label><input id="f-spq" type="number" value="${s.quantity||0}" step="any" min="0"></div>
    <div class="fg"><label>Единица</label><input id="f-spu" value="${esc(s.unit||'шт')}"></div>
    <div class="fg s2"><label>Место хранения</label><input id="f-spl" value="${esc(s.location||'')}"></div>
    <div class="fg s2"><label>Группа</label><select id="f-spg">${grpOpts}</select></div>
    <div class="fg s2"><label>Примечание</label><input id="f-spnote" value="${esc(s.notes||'')}"></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=v('f-spn').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/spare_parts/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,quantity:parseFloat(v('f-spq'))||0,unit:v('f-spu')||'шт',location:v('f-spl'),group_id:v('f-spg')||null,notes:v('f-spnote')})});
    pgkSpares=await fetch(`${API}/spare_parts`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('spares');toast('Сохранено','ok');
  }}]);
}
async function mchSpareDel(id){
  if(!confirm('Удалить запчасть?'))return;
  await fetch(`${API}/spare_parts/${id}`,{method:'DELETE'});
  pgkSpares=pgkSpares.filter(s=>s.id!==id);_setMchTab('spares');toast('Удалено','ok');
}
function mchSpareAddGroup(){
  showModal('＋ Новая группа',`<div class="fgr fone"><div class="fg"><label>Название *</label><input id="f-sgn" placeholder="Фильтры, Масла, Шины…"></div></div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const name=v('f-sgn').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/spare_groups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    pgkSpareGroups=await fetch(`${API}/spare_groups`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('spares');toast('Группа добавлена','ok');
  }}]);
}
function mchSpareEditGroup(id){
  const g=pgkSpareGroups.find(x=>x.id===id);if(!g)return;
  showModal('✏️ Переименовать группу',`<div class="fgr fone"><div class="fg"><label>Название</label><input id="f-sgn" value="${esc(g.name)}"></div></div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=v('f-sgn').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/spare_groups/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    pgkSpareGroups=await fetch(`${API}/spare_groups`).then(r=>r.json()).catch(()=>[]);
    closeModal();_setMchTab('spares');toast('Переименовано','ok');
  }}]);
}
async function mchSpareDelGroup(id){
  const g=pgkSpareGroups.find(x=>x.id===id);if(!g)return;
  if(!confirm(`Удалить группу "${g.name}"? Запчасти останутся без группы.`))return;
  await fetch(`${API}/spare_groups/${id}`,{method:'DELETE'});
  pgkSpareGroups=pgkSpareGroups.filter(x=>x.id!==id);
  pgkSpares=pgkSpares.map(s=>s.group_id===id?{...s,group_id:null}:s);
  if(window._mchSpareGroup===id)window._mchSpareGroup=null;
  _setMchTab('spares');toast('Группа удалена','ok');
}

async function openMachDetail(mid){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  const b=bases.find(x=>x.id===m.base_id);
  const driver=pgkWorkers.find(x=>x.id===m.driver_id);
  const statCls={working:'wbs-working',idle:'wbs-idle',broken:'wbs-sick'};
  const statLbl={working:'✅ В работе',idle:'⏸ Простой',broken:'🔴 Сломана'};
  const st=m.status||'working';
  const driverOpts=`<option value="">— не назначен —</option>`+
    pgkWorkers.filter(w=>{if(w.status==='fired')return false;const r=(w.role||'').toLowerCase();return r.includes('водитель')||r.includes('мбу')||r.includes('пмбу');})
    .map(w=>`<option value="${escAttr(w.id)}" ${m.driver_id===w.id?'selected':''}>${esc(w.name)}</option>`).join('');
  const baseOpts=`<option value="">— не назначена —</option>`+bases.map(bx=>`<option value="${bx.id}" ${m.base_id===bx.id?'selected':''}>${esc(bx.name)}</option>`).join('');
  const html=`
  <div class="wdc-hd">
    <div class="mdc-ico">${MICONS[m.type]||'🔧'}</div>
    <div class="wdc-info">
      <div class="wdc-name">${esc(m.name)}</div>
      <div class="wdc-role">${esc(m.type||'—')}${m.plate_number?` · <code style="font-size:11px;background:var(--s3);padding:1px 5px;border-radius:3px">${esc(m.plate_number)}</code>`:''}</div>
    </div>
  </div>
  <div class="mdc-fields">
    <div class="mdc-row"><span class="mdc-lbl">Гос. номер</span><span class="mdc-val">${m.plate_number?`<code style="background:var(--s3);padding:1px 6px;border-radius:3px;font-size:12px">${esc(m.plate_number)}</code>`:'<span style="color:var(--tx3)">—</span>'}</span></div>
    <div class="mdc-row"><span class="mdc-lbl">Тип</span><span class="mdc-val">${esc(m.type||'—')}</span></div>
    <div class="mdc-row"><span class="mdc-lbl">Статус</span><span class="mdc-val">
      <span class="wt-badge ${statCls[st]||'wbs-idle'}" style="margin-right:8px">${statLbl[st]||st}</span>
      <select style="font-size:12px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="(async()=>{await pgkQuickStatus('${mid}',this.value);openMachDetail('${mid}');})()">
        ${Object.entries(statLbl).map(([k,lbl])=>`<option value="${k}" ${k===st?'selected':''}>${lbl}</option>`).join('')}
      </select>
    </span></div>
    <div class="mdc-row"><span class="mdc-lbl">Водитель</span><span class="mdc-val">
      <select id="mdc-drv-${mid}" style="font-size:12px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);max-width:200px" onchange="mchInlineSetDriver('${mid}',this.value)">${driverOpts}</select>
    </span></div>
    <div class="mdc-row"><span class="mdc-lbl">База</span><span class="mdc-val">
      <select id="mdc-base-${mid}" style="font-size:12px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);max-width:200px" onchange="mchInlineSetBase('${mid}',this.value)">${baseOpts}</select>
    </span></div>
    ${m.notes?`<div class="mdc-row"><span class="mdc-lbl">Примечание</span><span class="mdc-val" style="color:var(--tx2)">${esc(m.notes)}</span></div>`:''}
  </div>
  <div class="wdc-actions" style="margin-top:12px">
    ${m.lat&&m.lng
      ? `<button class="btn bg2 wdc-btn" onclick="closeModal();flyToMach('${mid}')">📍 Показать на карте</button>`
      : `<button class="btn bs wdc-btn" onclick="mchStartPlace('${mid}')">📍 Расставить на карте</button>`}
    <button class="btn bs wdc-btn" onclick="closeModal();showMachHistory('${mid}')">🕐 История</button>
    <button class="btn bs wdc-btn" style="color:var(--red);margin-left:auto" onclick="closeModal();pgkDelMach('${mid}')">🗑</button>
  </div>`;
  showModal((MICONS[m.type]||'🔧')+' '+esc(m.name),html,[
    {label:'Закрыть',cls:'bs',fn:closeModal},
    {label:'✏️ Редактировать',cls:'bp',fn:()=>{closeModal();pgkEditMach(mid);}}
  ]);
}
async function mchInlineSetDriver(mid,driverId){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  // Unassign old driver's other machine if different
  if(m.driver_id&&m.driver_id!==driverId){
    // already handled by backend — just send new value
  }
  await fetch(`${API}/pgk/machinery/${mid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...m,driver_id:driverId||null,user_name:un()})});
  await loadPGK();toast('Водитель обновлён','ok');
  openMachDetail(mid);
}
async function mchInlineSetBase(mid,baseId){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  await fetch(`${API}/pgk/machinery/${mid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...m,base_id:baseId||null,user_name:un()})});
  await loadPGK();await loadAll();toast(baseId?'База назначена':'Снята с базы','ok');
  openMachDetail(mid);
}
function mchStartPlace(mid){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  if(!m.base_id){
    toast('⚠️ Сначала назначьте базу для этой техники','warn');return;
  }
  closeModal();
  switchView('map');
  // Use existing startMove mechanism from panel.js
  if(typeof startMove==='function'){
    setTimeout(()=>startMove('machine',{mach:m,baseId:m.base_id}),100);
  }
}

async function pgkAssignMachBaseModal(mid){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  showModal('🏕 Назначить на базу — '+esc(m.name),
    `<div class="fgr fone"><div class="fg"><label>База</label><select id="f-mb"><option value="">— Снять с базы —</option>${bases.map(b=>`<option value="${b.id}" ${m.base_id===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
      const baseId=v('f-mb');
      await fetch(`${API}/pgk/machinery/${mid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...m,base_id:baseId||null,user_name:un()})});
      closeModal();await loadPGK();await loadAll();toast(baseId?'Назначена на базу':'Снята с базы','ok');
    }}]);
}

function machCtxMenu(ev,mid){
  const m=pgkMachinery.find(x=>x.id===mid);if(!m)return;
  const statItems=Object.entries({working:'✅ В работе',idle:'⏸ Простой',broken:'🔴 Сломана'}).map(([k,v])=>({
    i:'',l:(m.status||'working')===k?'✓ '+v:v,f:()=>{pgkQuickStatus(mid,k);}
  }));
  showCtx(ev.clientX,ev.clientY,[
    {i:MICONS[m.type]||'🔧',l:`<b>${esc(m.name)}</b>`,html:true,f:()=>openMachDetail(mid)},
    {sep:true},
    {i:'📋',l:'Открыть карточку',f:()=>openMachDetail(mid)},
    {i:'✏️',l:'Редактировать',f:()=>pgkEditMach(mid)},
    {sep:true},
    {i:'🏕',l:'Назначить на базу',f:()=>pgkAssignMachBaseModal(mid)},
    {sep:true},
    {i:'🔄',l:'Изменить статус ▸',f:()=>{}},
    ...statItems.map(si=>({i:'  ',l:si.l,f:si.f})),
    ...(m.lat&&m.lng?[{sep:true},{i:'📍',l:'Найти на карте',f:()=>flyToMach(mid)}]:[]),
    {sep:true},
    {i:'🗑',l:'Удалить',cls:'cxi-red',f:()=>pgkDelMach(mid)},
  ]);
}

function pgkPageEquipment(pb){
  const _egGrp=window._pgkEGrp||'';
  const _es=window._pgkESort||'name', _ea=window._pgkEAsc!==false;
  const _efBase=window._pgkEFBase||'';
  const _efStatus=window._pgkEFStatus||'';
  const statCls={working:'wbs-working',idle:'wbs-idle',broken:'wbs-sick'};
  const statLbl={working:'✅ В работе',idle:'Не используется',broken:'🔴 Неисправно'};
  const getBase=e=>(bases.find(x=>x.id===e.base_id)||{}).name||'';

  let filtered=[...pgkEquipment].filter(e=>{
    if(_egGrp==='__none'){if(e.group_id)return false;}
    else if(_egGrp&&e.group_id!==_egGrp)return false;
    if(_efBase&&e.base_id!==_efBase)return false;
    if(_efStatus&&(e.status||'working')!==_efStatus)return false;
    return true;
  });
  const _q=(window._pgkESearchVal||'').toLowerCase().trim();
  if(_q)filtered=filtered.filter(e=>(e.name+' '+(e.type||'')+' '+(e.serial_number||'')+' '+(e.responsible||'')+' '+getBase(e)+' '+(e.notes||'')).toLowerCase().includes(_q));
  filtered.sort((a,b)=>{
    let va,vb;
    if(_es==='base'){va=getBase(a);vb=getBase(b);}
    else{va=a[_es]||'';vb=b[_es]||'';}
    return String(va).localeCompare(String(vb),'ru')*(_ea?1:-1);
  });

  const thSort=(col,lbl)=>`<th class="${_es===col?(_ea?'wt-asc':'wt-desc'):''}" onclick="if(window._pgkESort==='${col}'){window._pgkEAsc=!(window._pgkEAsc!==false);}else{window._pgkESort='${col}';window._pgkEAsc=true;}renderPGK()">${lbl}</th>`;
  const baseOpts=`<option value="">Все базы</option>`+bases.map(b=>`<option value="${b.id}" ${_efBase===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
  const statOpts=`<option value="">Все статусы</option>`+Object.entries(statLbl).map(([k,v])=>`<option value="${k}" ${_efStatus===k?'selected':''}>${v}</option>`).join('');
  const byCnt={working:0,idle:0,broken:0};
  pgkEquipment.forEach(e=>{byCnt[e.status||'working']=(byCnt[e.status||'working']||0)+1;});

  const grpSidebar=`
    <div class="spare-grp-item${!_egGrp?' on':''}" onclick="window._pgkEGrp='';renderPGK()">
      <span class="spare-grp-nm">Все</span>
      <span style="font-size:10px;color:var(--tx3);margin-left:4px">${pgkEquipment.length}</span>
    </div>
    <div class="spare-grp-item${_egGrp==='__none'?' on':''}" onclick="window._pgkEGrp='__none';renderPGK()">
      <span class="spare-grp-nm" style="color:var(--tx3)">Без группы</span>
      <span style="font-size:10px;color:var(--tx3);margin-left:4px">${pgkEquipment.filter(e=>!e.group_id).length}</span>
    </div>
    ${pgkEquipGroups.map(g=>{
      const cnt=pgkEquipment.filter(e=>e.group_id===g.id).length;
      const _gid=escAttr(g.id);
      return `<div class="spare-grp-item${_egGrp===g.id?' on':''}" onclick="window._pgkEGrp='${_gid}';renderPGK()"
        ondragover="event.preventDefault();this.style.background='var(--accl)'" ondragleave="this.style.background=''" ondrop="equipDropToGroup(event,'${_gid}');this.style.background=''">
        <span class="spare-grp-nm">${esc(g.name)}</span>
        <span style="font-size:10px;color:var(--tx3);margin-left:4px">${cnt}</span>
        <span class="spare-grp-acts">
          <button class="btn bs bsm" style="padding:1px 5px;font-size:10px" onclick="event.stopPropagation();equipGrpEdit('${_gid}','${esc(g.name).replace(/'/g,"\\'")}')">✏️</button>
          <button class="btn bs bsm" style="padding:1px 5px;font-size:10px;color:var(--red)" onclick="event.stopPropagation();equipGrpDel('${_gid}')">🗑</button>
        </span>
      </div>`;
    }).join('')}
    <button class="btn bs bsm" style="width:100%;margin-top:6px;font-size:11px" onclick="equipGrpAdd()">＋ Группа</button>`;

  const rows=filtered.map((e,i)=>{
    const b=bases.find(x=>x.id===e.base_id);
    const st=e.status||'working';
    const _id=escAttr(e.id);
    return `<tr data-eid="${e.id}" data-search="${esc((e.name+' '+(e.type||'')+' '+(e.serial_number||'')+' '+(e.responsible||'')+' '+getBase(e)+' '+(e.notes||'')).toLowerCase())}" draggable="true"
      ondragstart="equipDragStart(event,'${_id}')"
      oncontextmenu="event.preventDefault();equipCtxMenu(event,'${_id}')">
      <td style="text-align:center;width:28px;color:var(--tx3);font-size:10px;font-weight:600" class="eq-rownum">${i+1}</td>
      <td class="td-link" style="font-weight:600" onclick="openEquipDetail('${_id}')">🔩 ${esc(e.name)}</td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'equipment','${_id}','type')">${esc(e.type||'—')}</td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'equipment','${_id}','status')"><span class="wt-badge ${statCls[st]||'wbs-idle'}">${statLbl[st]||st}</span></td>
      <td class="td-editable" onclick="pgkCellEdit(event,this,'equipment','${_id}','base_id')">${b?`<span style="color:var(--bpc)">🏕 ${esc(b.name)}</span>`:'<span style="color:var(--tx3)">—</span>'}</td>
      <td style="font-size:10px">${esc(e.serial_number||'—')}</td>
      <td style="font-size:11px">${e.responsible?'👤 '+esc(e.responsible):'<span style="color:var(--tx3)">—</span>'}</td>
      <td class="td-notes" title="${esc(e.notes||'')}">${esc(e.notes||'')}</td>
    </tr>`;
  }).join('');

  pb.innerHTML=`<div class="spare-layout" style="height:100%">
    <div class="spare-sidebar">
      <div class="spare-sidebar-hd">Группы</div>
      ${grpSidebar}
    </div>
    <div class="spare-main">
      <div class="spare-main-hd">
        <span style="font-size:13px;font-weight:800;flex-shrink:0">🔩 Оборудование</span>
        <input id="pgk-e-search" type="search" placeholder="🔍 Поиск…" value="${esc(_q)}"
          style="font-size:11px;padding:3px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);outline:none;min-width:140px;flex:1"
          oninput="equipSearchFilter(this.value)" />
        <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkEFStatus=this.value;renderPGK()">${statOpts}</select>
        <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkEFBase=this.value;renderPGK()">${baseOpts}</select>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn bs bsm" onclick="pgkImportEquip()" title="Импорт из Excel">📥</button>
          <button class="btn bs bsm" onclick="exportEquipmentExcel()" title="Экспорт в Excel">📤</button>
          <button class="btn bs bsm" onclick="openEquipActModal()" title="Акт приёма-передачи">📄 Акт</button>
          <button class="btn bp bsm" onclick="pgkAddEquip()">＋ Добавить</button>
        </div>
      </div>
      <div class="wt-summary" style="padding:4px 12px">
        <span>Всего: <b>${pgkEquipment.length}</b></span>
        <span style="color:#15803d">✅ <b>${byCnt.working||0}</b></span>
        <span style="color:#a16207">⏸ <b>${byCnt.idle||0}</b></span>
        <span style="color:#b91c1c">🔴 <b>${byCnt.broken||0}</b></span>
        ${filtered.length<pgkEquipment.length?`<span style="color:var(--acc)">Показано: <b>${filtered.length}</b></span>`:''}
        <span id="eq-sel-info" style="color:var(--acc);display:none">Выбрано: <b id="eq-sel-cnt">0</b> <button class="btn bs bsm" style="padding:1px 6px;font-size:10px" onclick="equipMoveSelected()">→ В группу</button> <button class="btn bs bsm" style="padding:1px 6px;font-size:10px" onclick="document.querySelectorAll('#et-tbody tr.lasso-sel').forEach(r=>r.classList.remove('lasso-sel'));_equipUpdateSelInfo()">✕</button></span>
      </div>
      <div class="spare-tbl-wrap">
        <table class="wt-tbl" style="min-width:600px">
          <thead><tr>
            <th class="no-sort" style="width:28px;text-align:center;color:var(--tx3)">#</th>
            ${thSort('name','Название')}
            ${thSort('type','Тип')}
            ${thSort('status','Статус')}
            ${thSort('base','База')}
            <th class="no-sort">Серийный №</th>
            ${thSort('responsible','Ответственный')}
            <th class="no-sort" style="min-width:120px">Примечания</th>
          </tr></thead>
          <tbody id="et-tbody">${rows||`<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tx3)">Нет оборудования</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
  // Re-apply search filter after render
  if(_q){setTimeout(()=>equipSearchFilter(_q),0);}
  // Init lasso selection
  setTimeout(()=>_initLasso('et-tbody',_equipUpdateSelInfo),0);
}

function equipSearchFilter(val){
  window._pgkESearchVal=val;
  const q=val.toLowerCase().trim();
  let n=0;
  document.querySelectorAll('#et-tbody tr[data-eid]').forEach(tr=>{
    const show=!q||tr.dataset.search.includes(q);
    tr.style.display=show?'':'none';
    if(show){const c=tr.querySelector('.eq-rownum');if(c)c.textContent=++n;}
  });
}
function _equipUpdateSelInfo(){
  const sel=document.querySelectorAll('#et-tbody tr.lasso-sel');
  const si=document.getElementById('eq-sel-info');
  const sc=document.getElementById('eq-sel-cnt');
  if(si&&sc){si.style.display=sel.length?'':'none';sc.textContent=sel.length;}
}

// ── Lasso (rubber-band) row selection ─────────────────────
function _initLasso(tbodyId, onChangeCallback){
  const tbody=document.getElementById(tbodyId);
  if(!tbody)return;
  const scroller=tbody.closest('.spare-tbl-wrap')||tbody.closest('.wt-scroll');
  if(!scroller)return;
  let startX,startY,rect,box,dragging=false,startTarget;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;pointer-events:none;border:1.5px dashed var(--acc);background:rgba(99,102,241,.08);z-index:9999;display:none;border-radius:3px';
  document.body.appendChild(overlay);
  function rowsInBox(x1,y1,x2,y2){
    const left=Math.min(x1,x2),top=Math.min(y1,y2),right=Math.max(x1,x2),bot=Math.max(y1,y2);
    const rows=[...tbody.querySelectorAll('tr[data-eid],tr[data-matid]')].filter(tr=>tr.style.display!=='none');
    return rows.filter(tr=>{
      const r=tr.getBoundingClientRect();
      return r.bottom>top&&r.top<bot&&r.right>left&&r.left<right;
    });
  }
  // Prevent browser DnD from hijacking the lasso gesture
  tbody.addEventListener('dragstart',e=>{
    if(startTarget){e.preventDefault();}
  });
  scroller.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    const tr=e.target.closest('tr');
    if(tr&&(tr.dataset.eid||tr.dataset.matid)&&!e.target.closest('button,a,input,select')){
      startTarget=tr;dragging=false;
      rect=scroller.getBoundingClientRect();
      startX=e.clientX;startY=e.clientY;
      box={x1:startX,y1:startY,x2:startX,y2:startY};
    }
  });
  window.addEventListener('mousemove',e=>{
    if(!startTarget)return;
    box.x2=e.clientX;box.y2=e.clientY;
    const dx=Math.abs(box.x2-box.x1),dy=Math.abs(box.y2-box.y1);
    if(!dragging&&dx<6&&dy<6)return; // not yet a drag
    if(!dragging){dragging=true;overlay.style.display='block';e.preventDefault();}
    overlay.style.left=Math.min(box.x1,box.x2)+'px';
    overlay.style.top=Math.min(box.y1,box.y2)+'px';
    overlay.style.width=Math.abs(box.x2-box.x1)+'px';
    overlay.style.height=Math.abs(box.y2-box.y1)+'px';
    const hit=new Set(rowsInBox(box.x1,box.y1,box.x2,box.y2));
    tbody.querySelectorAll('tr.lasso-sel').forEach(r=>{if(!hit.has(r))r.classList.remove('lasso-sel');});
    hit.forEach(r=>r.classList.add('lasso-sel'));
    onChangeCallback&&onChangeCallback();
  });
  window.addEventListener('mouseup',e=>{
    if(!startTarget){return;}
    const wasDragging=dragging;
    dragging=false;startTarget=null;
    overlay.style.display='none';
    if(!wasDragging)return; // plain click — don't change selection
    onChangeCallback&&onChangeCallback();
  });
  // Safety net: browser DnD (if not fully prevented) ends with dragend, not mouseup
  window.addEventListener('dragend',()=>{
    if(!startTarget)return;
    dragging=false;startTarget=null;
    overlay.style.display='none';
    onChangeCallback&&onChangeCallback();
  });
}

function _equipSelectedIds(){
  return [...document.querySelectorAll('#et-tbody tr.lasso-sel')].map(tr=>tr.dataset.eid);
}
function equipDragStart(ev,eid){
  const sel=_equipSelectedIds();
  ev.dataTransfer.setData('text/plain',sel.length?JSON.stringify(sel):JSON.stringify([eid]));
  ev.dataTransfer.effectAllowed='move';
}
async function equipDropToGroup(ev,gid){
  ev.preventDefault();
  let ids=[];
  try{ids=JSON.parse(ev.dataTransfer.getData('text/plain'));}catch(e){return;}
  await Promise.all(ids.map(id=>fetch(`${API}/pgk/equipment/${id}/group`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({group_id:gid})})));
  await loadPGK();
  toast(`Перемещено: ${ids.length}`,'ok');
}
async function equipMoveSelected(){
  const ids=_equipSelectedIds();
  if(!ids.length)return;
  const grpOpts=pgkEquipGroups.map(g=>`<option value="${escAttr(g.id)}">${esc(g.name)}</option>`).join('');
  if(!grpOpts){toast('Сначала создайте группу','warn');return;}
  showModal('→ Переместить в группу',`<div class="fgr"><div class="fg s2"><label>Группа</label>
    <select id="f-grp" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
      <option value="">— Без группы —</option>${grpOpts}
    </select></div></div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Переместить',cls:'bp',fn:async()=>{
    const gid=v('f-grp')||'';
    await Promise.all(ids.map(id=>fetch(`${API}/pgk/equipment/${id}/group`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({group_id:gid})})));
    closeModal();await loadPGK();toast(`Перемещено: ${ids.length}`,'ok');
  }}]);
}
async function equipGrpAdd(){
  showModal('Новая группа',`<div class="fgr"><div class="fg s2"><label>Название *</label><input id="f-n" placeholder="Геодезия"></div></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Создать',cls:'bp',fn:async()=>{
    const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/equip_groups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    closeModal();await loadPGK();toast('Группа создана','ok');
  }}]);
}
async function equipGrpEdit(gid,curName){
  showModal('Переименовать группу',`<div class="fgr"><div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(curName)}"></div></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/equip_groups/${gid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    closeModal();await loadPGK();toast('Переименовано','ok');
  }}]);
}
async function equipGrpDel(gid){
  if(!confirm('Удалить группу? Оборудование станет "без группы".'))return;
  await fetch(`${API}/equip_groups/${gid}`,{method:'DELETE'});
  if(window._pgkEGrp===gid)window._pgkEGrp='';
  await loadPGK();toast('Группа удалена','ok');
}

async function openEquipDetail(eid){
  const e=pgkEquipment.find(x=>x.id===eid);if(!e)return;
  const b=bases.find(x=>x.id===e.base_id);
  const grp=pgkEquipGroups.find(g=>g.id===e.group_id);
  const statLbl={working:'✅ В работе',idle:'⏸ Не используется',broken:'🔴 Неисправно'};
  const statClr={working:'var(--grn)',idle:'var(--warn)',broken:'var(--red)'};
  const st=e.status||'working';
  const initials=e.name.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  const _eid=escAttr(eid);
  function renderEqTab(tab){
    if(tab==='main'){
      return `<div class="wdc-panel">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;font-size:12px">
          <div style="color:var(--tx3)">Тип</div><div>${esc(e.type||'—')}</div>
          <div style="color:var(--tx3)">Серийный №</div><div style="font-family:monospace">${esc(e.serial_number||'—')}</div>
          <div style="color:var(--tx3)">База</div><div>${b?`<span style="color:var(--bpc)">🏕 ${esc(b.name)}</span>`:'<span style="color:var(--tx3)">—</span>'}</div>
          <div style="color:var(--tx3)">Группа</div><div>${grp?esc(grp.name):'<span style="color:var(--tx3)">—</span>'}</div>
        </div>
        ${e.notes?`<div style="font-size:11px;color:var(--tx2);background:var(--s2);border-radius:6px;padding:8px 10px;margin-bottom:12px">📝 ${esc(e.notes)}</div>`:''}
        <div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:6px">НАЗНАЧИТЬ НА БАЗУ</div>
        <select style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);margin-bottom:12px" onchange="pgkAssignEquipBase('${_eid}',this.value)">
          <option value="">— Снять с базы —</option>${bases.map(bx=>`<option value="${bx.id}" ${e.base_id===bx.id?'selected':''}>${esc(bx.name)}</option>`).join('')}
        </select>
        <div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:6px">СТАТУС</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${Object.entries(statLbl).map(([k,v])=>`<button class="btn bsm ${st===k?'bp':'bs'}" onclick="pgkEquipQuickStatus('${_eid}','${k}');openEquipDetail('${_eid}')">${v}</button>`).join('')}
        </div>
      </div>`;
    }
    return `<div class="wdc-panel" id="eq-hist-panel">
      <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Загрузка...</div>
    </div>`;
  }
  const _tab=window._pgkEqDetailTab||'main';
  const html=`<div class="wdc-hd">
    <div class="wdc-av" style="border-radius:var(--rs);font-size:16px">🔩</div>
    <div class="wdc-info">
      <div class="wdc-name">${esc(e.name)}</div>
      <div class="wdc-role">${esc(e.type||'Оборудование')}${e.serial_number?' · S/N '+esc(e.serial_number):''}</div>
      <div class="wdc-chips">
        <span class="wt-badge" style="background:${statClr[st]}22;color:${statClr[st]};border-color:${statClr[st]}44">${statLbl[st]}</span>
        ${b?`<span class="wdc-chip" style="background:var(--s2);border-color:var(--bd);color:var(--bpc)">🏕 ${esc(b.name)}</span>`:''}
        ${e.responsible?`<span class="wdc-chip" style="background:var(--s2);border-color:var(--bd);color:var(--tx2)">👤 ${esc(e.responsible)}</span>`:''}
      </div>
    </div>
  </div>
  <div class="wdc-actions">
    <button class="btn bp wdc-btn" onclick="closeModal();pgkEditEquip('${_eid}')">✏️ Редактировать</button>
    <button class="btn bs wdc-btn" onclick="pgkAssignEquipResponsible('${_eid}')">👤 Ответственный</button>
    <button class="btn bs wdc-btn" style="color:var(--red);margin-left:auto" onclick="closeModal();pgkDelEquip('${_eid}')">🗑</button>
  </div>
  <div class="wdc-tabs">
    <button class="wdc-tab${_tab==='main'?' on':''}" onclick="window._pgkEqDetailTab='main';document.getElementById('eq-tab-main').classList.add('on');document.getElementById('eq-tab-hist').classList.remove('on');document.getElementById('eq-body-main').style.display='';document.getElementById('eq-body-hist').style.display='none';" id="eq-tab-main">Основное</button>
    <button class="wdc-tab${_tab==='hist'?' on':''}" onclick="window._pgkEqDetailTab='hist';document.getElementById('eq-tab-hist').classList.add('on');document.getElementById('eq-tab-main').classList.remove('on');document.getElementById('eq-body-hist').style.display='';document.getElementById('eq-body-main').style.display='none';loadEquipHistory('${_eid}')" id="eq-tab-hist">История ответственных</button>
  </div>
  <div id="eq-body-main" style="display:${_tab==='main'?'':'none'}">${renderEqTab('main')}</div>
  <div id="eq-body-hist" style="display:${_tab==='hist'?'':'none'}">${renderEqTab('hist')}</div>`;
  showModal('🔩 '+esc(e.name),html,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
  if(_tab==='hist')loadEquipHistory(eid);
}

async function loadEquipHistory(eid){
  const panel=document.getElementById('eq-body-hist');if(!panel)return;
  panel.innerHTML='<div class="wdc-panel"><div style="font-size:11px;color:var(--tx3)">Загрузка...</div></div>';
  const hist=await fetch(`${API}/equip_responsible_history/${eid}`).then(r=>r.json()).catch(()=>[]);
  if(!hist.length){panel.innerHTML='<div class="wdc-panel"><div style="font-size:11px;color:var(--tx3);padding:12px 0">История пуста</div></div>';return;}
  panel.innerHTML=`<div class="wdc-panel">${hist.map(h=>`<div class="wdc-shift">
    <div style="font-size:12px;font-weight:600">👤 ${esc(h.responsible)}</div>
    <div style="font-size:10px;color:var(--tx3);margin-top:2px">${(h.assigned_at||'').replace('T',' ').slice(0,16)}</div>
  </div>`).join('')}</div>`;
}

async function pgkEquipQuickStatus(eid,status){
  const e=pgkEquipment.find(x=>x.id===eid);if(!e)return;
  await fetch(`${API}/pgk/equipment/${eid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...e,status})});
  await loadPGK();
}

function equipCtxMenu(ev,eid){
  const e=pgkEquipment.find(x=>x.id===eid);if(!e)return;
  const statItems=Object.entries({working:'✅ В работе',idle:'⏸ Не используется',broken:'🔴 Неисправно'}).map(([k,v])=>({
    i:'',l:(e.status||'working')===k?'✓ '+v:v,f:()=>pgkEquipQuickStatus(eid,k)
  }));
  showCtx(ev.clientX,ev.clientY,[
    {i:'🔩',l:`<b>${esc(e.name)}</b>`,html:true,f:()=>openEquipDetail(eid)},
    {sep:true},
    {i:'📋',l:'Открыть карточку',f:()=>openEquipDetail(eid)},
    {i:'✏️',l:'Редактировать',f:()=>pgkEditEquip(eid)},
    {i:'👤',l:e.responsible?`Ответственный: ${e.responsible}`:'Назначить ответственного',f:()=>pgkAssignEquipResponsible(eid)},
    {sep:true},
    {i:'🔄',l:'Изменить статус ▸',f:()=>{}},
    ...statItems.map(si=>({i:'  ',l:si.l,f:si.f})),
    {sep:true},
    {i:'🗑',l:'Удалить',cls:'cxi-red',f:()=>pgkDelEquip(eid)},
  ]);
}

async function pgkPageMaterials(pb){
  const allMats=bases.flatMap(b=>(b.materials||[]).map(m=>({...m,base_name:b.name})));
  const _mfGroup=window._pgkMFGroup||'';
  const _mfBase=window._pgkMFBaseM||'';
  const _ms=window._pgkMSortM||'name';
  const _ma=window._pgkMAscM!==false;
  const _q=(window._pgkMSearchM||'').toLowerCase().trim();

  const lowStock=allMats.filter(m=>m.min_amount>0&&m.amount<m.min_amount).length;
  const _knownGrpNames=new Set(pgkMatGroups.map(g=>g.name));

  let filtered=allMats.filter(m=>{
    if(_mfGroup==='__none'){if(m.category&&_knownGrpNames.has(m.category))return false;}
    else if(_mfGroup&&(m.category||'')!==_mfGroup)return false;
    if(_mfBase&&m.base_id!==_mfBase)return false;
    if(_q){const hay=(m.name+' '+(m.category||'')+' '+(m.base_name||'')+' '+(m.notes||'')).toLowerCase();if(!hay.includes(_q))return false;}
    return true;
  });
  filtered.sort((a,b)=>{
    let va,vb;
    if(_ms==='amount'){va=+a.amount||0;vb=+b.amount||0;}
    else if(_ms==='base'){va=a.base_name||'';vb=b.base_name||'';}
    else if(_ms==='category'){va=a.category||'';vb=b.category||'';}
    else{va=a[_ms]||'';vb=b[_ms]||'';}
    if(typeof va==='number'&&typeof vb==='number')return(va-vb)*(_ma?1:-1);
    return String(va).localeCompare(String(vb),'ru')*(_ma?1:-1);
  });

  const thSort=(col,lbl)=>`<th class="${_ms===col?(_ma?'wt-asc':'wt-desc'):''}"
    onclick="window._pgkMSortM==='${col}'?(window._pgkMAscM=!(_ma)):(window._pgkMSortM='${col}',window._pgkMAscM=true);renderPGK()">${lbl}</th>`;
  const baseOpts=`<option value="">Все базы</option>`+bases.map(b=>`<option value="${b.id}" ${_mfBase===b.id?'selected':''}>${esc(b.name)}</option>`).join('');

  const grpCounts={};allMats.forEach(m=>{const g=m.category||'__none';grpCounts[g]=(grpCounts[g]||0)+1;});
  // Count materials that don't belong to any known group
  const knownNames=new Set(pgkMatGroups.map(g=>g.name));
  const noneCount=allMats.filter(m=>!m.category||!knownNames.has(m.category)).length;

  const grpSidebar=`
    <div class="spare-grp-item${!_mfGroup?' on':''}" onclick="window._pgkMFGroup='';renderPGK()">
      <span class="spare-grp-nm">Все</span>
      <span style="font-size:10px;color:var(--tx3);margin-left:4px">${allMats.length}</span>
    </div>
    <div class="spare-grp-item${_mfGroup==='__none'?' on':''}" onclick="window._pgkMFGroup='__none';renderPGK()">
      <span class="spare-grp-nm" style="color:var(--tx3)">Без группы</span>
      <span style="font-size:10px;color:var(--tx3);margin-left:4px">${noneCount}</span>
    </div>
    ${pgkMatGroups.map(g=>{
      const cnt=allMats.filter(m=>m.category===g.name).length;
      const _gn=escAttr(g.name);const _gid=escAttr(g.id);
      return `<div class="spare-grp-item${_mfGroup===g.name?' on':''}" onclick="window._pgkMFGroup='${_gn}';renderPGK()"
        ondragover="event.preventDefault();this.style.background='var(--accl)'" ondragleave="this.style.background=''" ondrop="matDropToGroup(event,'${_gn}');this.style.background=''">
        <span class="spare-grp-nm">${esc(g.name)}</span>
        <span style="font-size:10px;color:var(--tx3);margin-left:4px">${cnt}</span>
        <span class="spare-grp-acts">
          <button class="btn bs bsm" style="padding:1px 5px;font-size:10px" onclick="event.stopPropagation();matGrpRename('${_gid}','${_gn}')">✏️</button>
          <button class="btn bs bsm" style="padding:1px 5px;font-size:10px;color:var(--red)" onclick="event.stopPropagation();matGrpDel('${_gid}','${_gn}')">🗑</button>
        </span>
      </div>`;
    }).join('')}
    <button class="btn bs bsm" style="width:100%;margin-top:6px;font-size:11px" onclick="matGrpAdd()">＋ Группа</button>`;

  const rows=filtered.map((m,i)=>{
    const pct=m.min_amount>0?Math.min(100,Math.round(m.amount/m.min_amount*100)):null;
    const low=m.min_amount>0&&m.amount<m.min_amount;
    const _id=escAttr(m.id);
    return `<tr data-matid="${m.id}" data-search="${esc((m.name+' '+(m.category||'')+' '+(m.base_name||'')+' '+(m.notes||'')).toLowerCase())}" draggable="true"
      ondragstart="matDragStart(event,'${_id}')"
      oncontextmenu="event.preventDefault();pgkMatCtxMenu(event,'${_id}')">
      <td style="text-align:center;width:28px;color:var(--tx3);font-size:10px;font-weight:600" class="mat-rownum">${i+1}</td>
      <td class="td-link" style="font-weight:600" title="${esc(m.name)}" onclick="pgkMatDetail('${_id}')">📦 ${esc(m.name)}</td>
      <td><span style="background:var(--s3);border:1px solid var(--bd);border-radius:20px;padding:1px 7px;font-size:10px;font-weight:600;color:var(--tx2)">${esc(m.category||'—')}</span></td>
      <td style="color:var(--bpc)">🏕 ${esc(m.base_name||'—')}</td>
      <td style="font-weight:700;color:var(--acc);text-align:right">${m.amount} <span style="font-weight:400;color:var(--tx3)">${esc(m.unit||'шт')}</span></td>
      <td style="text-align:center">
        ${pct!==null?`<div style="display:flex;align-items:center;gap:4px;min-width:70px">
          <div style="flex:1;height:4px;background:var(--s3);border-radius:2px">
            <div style="width:${pct}%;height:4px;background:${low?'var(--red)':pct<50?'#f59e0b':'var(--grn)'};border-radius:2px"></div>
          </div>
          <span style="font-size:9px;color:${low?'var(--red)':'var(--tx3)'};min-width:26px">${pct}%</span>
        </div>`:'<span style="color:var(--tx3);font-size:10px">—</span>'}
      </td>
      <td class="td-notes" title="${esc(m.notes||'')}">${esc(m.notes||'')}</td>
    </tr>`;
  }).join('');

  pb.innerHTML=`<div class="spare-layout" style="height:100%">
    <div class="spare-sidebar">
      <div class="spare-sidebar-hd">Группы</div>
      ${grpSidebar}
    </div>
    <div class="spare-main">
      <div class="spare-main-hd">
        <span style="font-size:13px;font-weight:800;flex-shrink:0">📦 Материалы</span>
        <input id="pgk-mat-search" type="search" placeholder="🔍 Поиск…" value="${esc(_q)}"
          style="font-size:11px;padding:3px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);outline:none;min-width:130px;flex:1"
          oninput="matSearchFilter(this.value)"/>
        <select style="font-size:11px;padding:3px 6px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)" onchange="window._pgkMFBaseM=this.value;renderPGK()">${baseOpts}</select>
        <button class="btn bp bsm" onclick="pgkAddMatGlobal()">＋ Добавить</button>
      </div>
      <div class="wt-summary" style="padding:4px 12px">
        <span>Позиций: <b>${allMats.length}</b></span>
        <span>Баз: <b>${bases.length}</b></span>
        ${lowStock?`<span style="color:var(--red)">⚠️ Ниже мин: <b>${lowStock}</b></span>`:''}
        ${filtered.length<allMats.length?`<span style="color:var(--acc)">Показано: <b>${filtered.length}</b></span>`:''}
        <span id="mat-sel-info" style="color:var(--acc);display:none">Выбрано: <b id="mat-sel-cnt">0</b> <button class="btn bs bsm" style="padding:1px 6px;font-size:10px" onclick="matMoveSelected()">→ В группу</button> <button class="btn bs bsm" style="padding:1px 6px;font-size:10px" onclick="document.querySelectorAll('#pgk-mat-tbody tr.lasso-sel').forEach(r=>r.classList.remove('lasso-sel'));_matUpdateSelInfo()">✕</button></span>
      </div>
      <div class="spare-tbl-wrap">
        <table class="wt-tbl" style="min-width:600px">
          <thead><tr>
            <th class="no-sort" style="width:28px;text-align:center;color:var(--tx3)">#</th>
            ${thSort('name','Название')}
            ${thSort('category','Группа')}
            ${thSort('base','База')}
            ${thSort('amount','Кол-во')}
            <th class="no-sort" style="min-width:80px">Запас</th>
            <th class="no-sort" style="min-width:120px">Примечания</th>
          </tr></thead>
          <tbody id="pgk-mat-tbody">${rows||`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--tx3)">Нет материалов</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
  // Re-apply search filter after render
  if(_q){setTimeout(()=>matSearchFilter(_q),0);}
  // Init lasso selection
  setTimeout(()=>_initLasso('pgk-mat-tbody',_matUpdateSelInfo),0);
}

function matSearchFilter(val){
  window._pgkMSearchM=val;
  const q=val.toLowerCase().trim();
  let n=0;
  document.querySelectorAll('#pgk-mat-tbody tr[data-matid]').forEach(tr=>{
    const show=!q||tr.dataset.search.includes(q);
    tr.style.display=show?'':'none';
    if(show){const c=tr.querySelector('.mat-rownum');if(c)c.textContent=++n;}
  });
}
function _matUpdateSelInfo(){
  const sel=document.querySelectorAll('#pgk-mat-tbody tr.lasso-sel');
  const si=document.getElementById('mat-sel-info'),sc=document.getElementById('mat-sel-cnt');
  if(si&&sc){si.style.display=sel.length?'':'none';sc.textContent=sel.length;}
}
function _matSelectedIds(){return[...document.querySelectorAll('#pgk-mat-tbody tr.lasso-sel')].map(tr=>tr.dataset.matid);}
function matDragStart(ev,mid){const sel=_matSelectedIds();ev.dataTransfer.setData('text/plain',sel.length?JSON.stringify(sel):JSON.stringify([mid]));ev.dataTransfer.effectAllowed='move';}
async function matDropToGroup(ev,grpName){
  ev.preventDefault();
  let ids=[];try{ids=JSON.parse(ev.dataTransfer.getData('text/plain'));}catch(e){return;}
  await Promise.all(ids.map(id=>{
    const b=bases.find(b=>(b.materials||[]).some(m=>m.id===id));
    const m=b&&(b.materials||[]).find(m=>m.id===id);
    if(!m)return Promise.resolve();
    return fetch(`${API}/materials/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...m,category:grpName,user_name:un()})});
  }));
  await loadPGK();await loadAll();toast(`Перемещено: ${ids.length}`,'ok');
}
async function matMoveSelected(){
  const ids=_matSelectedIds();if(!ids.length)return;
  const allGroups=pgkMatGroups.map(g=>g.name);
  const grpOpts=allGroups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  showModal('→ Переместить в группу',`<div class="fgr">
    <div class="fg s2"><label>Группа</label>
      <select id="f-mg" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">
        <option value="">— без группы —</option>${grpOpts}
      </select>
    </div></div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Переместить',cls:'bp',fn:async()=>{
    const grp=v('f-mg')||'';
    await Promise.all(ids.map(id=>{
      const b=bases.find(b=>(b.materials||[]).some(m=>m.id===id));
      const m=b&&(b.materials||[]).find(m=>m.id===id);
      if(!m)return Promise.resolve();
      return fetch(`${API}/materials/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...m,category:grp,user_name:un()})});
    }));
    closeModal();await loadPGK();await loadAll();toast(`Перемещено: ${ids.length}`,'ok');
  }}]);
}
async function matGrpAdd(){
  showModal('Новая группа',`<div class="fgr"><div class="fg s2"><label>Название</label><input id="f-n" placeholder="Топливо"></div></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Создать',cls:'bp',fn:async()=>{
    const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/mat_groups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    closeModal();await loadPGK();window._pgkMFGroup=name;toast(`Группа "${name}" создана — перетащите материалы в неё`,'ok');
  }}]);
}
async function matGrpRename(gid,oldName){
  showModal('Переименовать группу',`<div class="fgr"><div class="fg s2"><label>Новое название</label><input id="f-n" value="${esc(oldName)}"></div></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Переименовать',cls:'bp',fn:async()=>{
    const newName=v('f-n').trim();if(!newName||newName===oldName){closeModal();return;}
    await fetch(`${API}/mat_groups/${gid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName})});
    const toUpdate=bases.flatMap(b=>(b.materials||[]).filter(m=>(m.category||'')===oldName));
    await Promise.all(toUpdate.map(m=>fetch(`${API}/materials/${m.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...m,category:newName,user_name:un()})})));
    closeModal();await loadPGK();await loadAll();toast(`Переименовано`,'ok');
  }}]);
}
async function matGrpDel(gid,grpName){
  if(!confirm(`Удалить группу "${grpName}"? Материалы станут "без группы".`))return;
  await fetch(`${API}/mat_groups/${gid}`,{method:'DELETE'});
  if(window._pgkMFGroup===grpName)window._pgkMFGroup='';
  await loadPGK();toast('Группа удалена','ok');
}

// Карточка материала
function pgkMatDetail(matId){
  const b = bases.find(b=>(b.materials||[]).some(m=>m.id===matId));
  const m = b && (b.materials||[]).find(m=>m.id===matId);
  if(!m)return;
  const low = m.min_amount>0&&m.amount<m.min_amount;
  showModal('📦 '+esc(m.name),`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:12px">
      <div><span style="color:var(--tx3)">База:</span> <b>${esc(b.name)}</b></div>
      <div><span style="color:var(--tx3)">Группа:</span> <b>${esc(m.category||'—')}</b></div>
      <div><span style="color:var(--tx3)">Остаток:</span> <b style="color:var(--acc)">${m.amount} ${esc(m.unit||'шт')}</b></div>
      <div><span style="color:var(--tx3)">Минимум:</span> <b style="color:${low?'var(--red)':'var(--tx)'}">${m.min_amount||'—'} ${m.min_amount?esc(m.unit||'шт'):''}</b></div>
    </div>
    ${low?`<div style="background:var(--redl);border:1.5px solid #fca5a5;border-radius:var(--rs);padding:6px 10px;font-size:11px;color:var(--red);margin-bottom:10px">⚠️ Не хватает: ${(m.min_amount-m.amount).toFixed(2)} ${esc(m.unit||'шт')}</div>`:''}
    ${m.notes?`<div style="font-size:11px;color:var(--tx2);background:var(--s2);border-radius:6px;padding:8px 10px;margin-bottom:10px">📝 ${esc(m.notes)}</div>`:''}
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn bp bsm" onclick="closeModal();openActualizeModal('${escAttr(m.id)}')">📝 Актуализировать</button>
      <button class="btn bs bsm" onclick="closeModal();openMatLogModal('${escAttr(m.id)}')">📋 История</button>
      <button class="btn bg2 bsm" onclick="closeModal();openTransferModal('material','${escAttr(m.id)}')">🔄 Перевести</button>
    </div>`,
    [{label:'Закрыть',cls:'bs',fn:closeModal},{label:'✏️ Редактировать',cls:'bp',fn:()=>{closeModal();openEditMatModalGlobal(matId);}}]
  );
}

// Контекстное меню материала
function pgkMatCtxMenu(ev,matId){
  const b=bases.find(b=>(b.materials||[]).some(m=>m.id===matId));
  const m=b&&(b.materials||[]).find(m=>m.id===matId);
  if(!m)return;
  showCtx(ev.clientX,ev.clientY,[
    {i:'📦',l:`<b>${esc(m.name)}</b>`,html:true,f:()=>pgkMatDetail(matId)},
    {sep:true},
    {i:'📝',l:'Актуализировать остаток',f:()=>openActualizeModal(matId)},
    {i:'📋',l:'История актуализаций',f:()=>openMatLogModal(matId)},
    {i:'🔄',l:'Перевести на другую базу',f:()=>openTransferModal('material',matId)},
    {sep:true},
    {i:'✏️',l:'Редактировать',f:()=>openEditMatModalGlobal(matId)},
    {i:'🗑',l:'Удалить',cls:'cxi-red',f:()=>pgkDelMatGlobal(matId)},
  ]);
}

// Редактировать материал глобально (с выбором группы)
function openEditMatModalGlobal(matId){
  const b=bases.find(b=>(b.materials||[]).some(m=>m.id===matId));
  const m=b&&(b.materials||[]).find(m=>m.id===matId);
  if(!m)return;
  const allGroups=pgkMatGroups.map(g=>g.name);
  const groupOpts=`<option value="">— без группы —</option>`+allGroups.map(g=>`<option value="${esc(g)}" ${m.category===g?'selected':''}>${esc(g)}</option>`).join('');
  showModal('✏️ '+esc(m.name),`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-mn" value="${esc(m.name)}"></div>
    <div class="fg"><label>Группа</label>
      <select id="f-mcat" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">${groupOpts}</select>
    </div>
    <div class="fg"><label>Кол-во</label><input id="f-mamt" type="number" value="${m.amount}" step="0.01"></div>
    <div class="fg"><label>Единица</label><input id="f-munit" value="${esc(m.unit||'шт')}"></div>
    <div class="fg"><label>Минимум</label><input id="f-mmin" type="number" value="${m.min_amount||0}" step="0.01"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-mnotes">${esc(m.notes||'')}</textarea></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=(document.getElementById('f-mn').value||'').trim();
    if(!name){toast('Введите название','err');return;}
    const category=(document.getElementById('f-mcat').value||'').trim();
    const amount=parseFloat(document.getElementById('f-mamt').value)||0;
    const unit=(document.getElementById('f-munit').value||'шт').trim();
    const min_amount=parseFloat(document.getElementById('f-mmin').value)||0;
    const notes=(document.getElementById('f-mnotes').value||'').trim();
    await fetch(`${API}/materials/${matId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,category,amount,unit,min_amount,notes,user_name:un()})});
    closeModal();await loadPGK();await loadAll();toast('Обновлено','ok');
  }}]);
}

async function pgkDelMatGlobal(matId){
  if(!confirm('Удалить материал?'))return;
  await fetch(`${API}/materials/${matId}`,{method:'DELETE'});
  await loadPGK();await loadAll();toast('Удалено','ok');
}

// Добавить материал глобально
function pgkAddMatGlobal(){
  const allGroups=pgkMatGroups.map(g=>g.name);
  const groupOpts=`<option value="">— без группы —</option>`+allGroups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  const baseOpts=`<option value="">— выберите базу —</option>`+bases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  showModal('＋ Новый материал',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-mn" placeholder="Дизельное топливо"></div>
    <div class="fg"><label>База *</label><select id="f-mbase">${baseOpts}</select></div>
    <div class="fg"><label>Группа</label>
      <select id="f-mcat" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">${groupOpts}</select>
    </div>
    <div class="fg"><label>Кол-во</label><input id="f-mamt" type="number" value="0" step="0.01"></div>
    <div class="fg"><label>Единица</label><input id="f-munit" value="шт"></div>
    <div class="fg"><label>Минимум</label><input id="f-mmin" type="number" value="0" step="0.01"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-mnotes"></textarea></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const name=(document.getElementById('f-mn').value||'').trim();
    const baseId=(document.getElementById('f-mbase').value||'').trim();
    if(!name){toast('Введите название','err');return;}
    if(!baseId){toast('Выберите базу','err');return;}
    const category=(document.getElementById('f-mcat').value||'').trim();
    const amount=parseFloat(document.getElementById('f-mamt').value)||0;
    const unit=(document.getElementById('f-munit').value||'шт').trim();
    const min_amount=parseFloat(document.getElementById('f-mmin').value)||0;
    const notes=(document.getElementById('f-mnotes').value||'').trim();
    await fetch(`${API}/bases/${baseId}/materials`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,category,amount,unit,min_amount,notes,user_name:un()})});
    closeModal();await loadPGK();await loadAll();toast('Добавлено','ok');
  }}]);
}


// Assign base from PGK page dropdowns
async function pgkAssignWorkerBase(id,baseId){
  const w=pgkWorkers.find(x=>x.id===id);if(!w)return;
  // При назначении на базу → В работе, при снятии → Дома
  const newStatus=baseId?'working':'home';
  await fetch(`${API}/pgk/workers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...w,base_id:baseId||null,status:newStatus,user_name:un()})});
  await loadPGK();await loadAll();toast(baseId?'Назначен на базу, статус: В работе':'Снят с базы, статус: Дома','ok');
}
async function pgkAssignMachBase(id,baseId){
  const m=pgkMachinery.find(x=>x.id===id);if(!m)return;
  await fetch(`${API}/pgk/machinery/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...m,base_id:baseId||null,user_name:un()})});
  await loadPGK();await loadAll();toast(baseId?'Назначена на базу':'Снята с базы','ok');
}
async function pgkAssignEquipBase(id,baseId){
  const e=pgkEquipment.find(x=>x.id===id);if(!e)return;
  await fetch(`${API}/pgk/equipment/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...e,base_id:baseId||null})});
  await loadPGK();toast(baseId?'Назначено':'Снято','ok');
}

// ── PGK WORKER CRUD ────────────────────────────────────────
function pgkAddWorker(){
  showModal('Новый сотрудник',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-n" placeholder="Иванов Иван Иванович"></div>
    <div class="fg"><label>Должность</label><input id="f-r" placeholder="Буровой мастер"></div>
    <div class="fg"><label>Дата начала работы</label><input id="f-sd" type="date"></div>
    <div class="fg s2"><label>База</label><select id="f-b"><option value="">— не назначен —</option>${bases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:savePGKWorker}]);
}

function pgkExcelMenu(){
  showModal('📊 Excel — Сотрудники',
    '<div style="font-size:13px;color:var(--tx2);text-align:center;padding:8px 0">Что сделать?</div>',
    [
      { cls:'bs', label:'Отмена', fn: closeModal },
      { cls:'bs', label:'📥 Импорт', fn: ()=>{ closeModal(); pgkImportWorkers(); } },
      { cls:'bp', label:'📤 Экспорт', fn: ()=>{ closeModal(); if(typeof exportPersonnelExcel==='function') exportPersonnelExcel(pgkWorkers); else toast('exportPersonnelExcel не найден','err'); } }
    ]
  );
}

function pgkImportWorkers(){
  // Показываем превью перед импортом
  showModal('📥 Импорт сотрудников из Excel',`
    <div style="font-size:11px;color:var(--tx2);margin-bottom:10px">
      Ожидаемый формат: <b>Колонка A</b> — ФИО, <b>Колонка B</b> — Должность.<br>
      Заголовки необязательны — строки где первая ячейка похожа на заголовок будут пропущены.
    </div>
    <div class="fg s2">
      <label>Выберите файл .xlsx</label>
      <input type="file" id="pgk-import-file" accept=".xlsx,.xls"
        style="font-size:11px;padding:4px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);width:100%"
        onchange="pgkImportPreview(this)">
    </div>
    <div id="pgk-import-preview" style="margin-top:8px"></div>
  `,[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'✅ Импортировать',cls:'bp',fn:pgkImportExecute}
  ]);
  window._pgkImportRows=[];
}

function pgkImportPreview(input){
  const file=input.files[0];
  if(!file)return;
  const prev=document.getElementById('pgk-import-preview');
  prev.innerHTML='<div style="font-size:11px;color:var(--tx3)">⏳ Читаю файл...</div>';

  // Загружаем SheetJS динамически
  if(!window.XLSX){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>_pgkDoPreview(file,prev);
    s.onerror=()=>{prev.innerHTML='<div style="color:#ef4444;font-size:11px">❌ Не удалось загрузить библиотеку чтения xlsx. Проверьте интернет-соединение.</div>';};
    document.head.appendChild(s);
  } else {
    _pgkDoPreview(file,prev);
  }
}

function _pgkDoPreview(file,prev){
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

      // Фильтруем строки: пропускаем пустые и строки-заголовки
      const HEADER_KEYWORDS=['фио','имя','сотрудник','должность','name','role','position'];
      const rows=data
        .filter(r=>r[0]&&String(r[0]).trim())
        .filter(r=>{
          const first=String(r[0]).trim().toLowerCase();
          return !HEADER_KEYWORDS.some(k=>first.includes(k));
        })
        .map(r=>({
          name:String(r[0]).trim(),
          role:r[1]?String(r[1]).trim():''
        }));

      window._pgkImportRows=rows;

      if(!rows.length){
        prev.innerHTML='<div style="color:#ef4444;font-size:11px">❌ Не найдено строк с данными</div>';
        return;
      }

      // Определяем дубликаты с уже существующими сотрудниками
      const existing=new Set(pgkWorkers.map(w=>w.name.trim().toLowerCase()));
      const dupes=rows.filter(r=>existing.has(r.name.toLowerCase()));

      let html=`<div style="font-size:11px;font-weight:700;margin-bottom:6px;color:var(--tx)">
        Найдено: <span style="color:var(--acc)">${rows.length}</span> сотрудников
        ${dupes.length?`<span style="color:#f59e0b;margin-left:8px">⚠️ ${dupes.length} уже существуют (будут пропущены)</span>`:''}
      </div>`;

      html+=`<div style="max-height:260px;overflow-y:auto;border:1.5px solid var(--bd);border-radius:var(--rs)">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead><tr style="background:var(--s2);position:sticky;top:0">
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--bd)">#</th>
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--bd)">ФИО</th>
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--bd)">Должность</th>
            <th style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--bd)">Статус</th>
          </tr></thead><tbody>`;

      rows.forEach((r,i)=>{
        const isDupe=existing.has(r.name.toLowerCase());
        html+=`<tr style="border-bottom:1px solid var(--bd);${isDupe?'opacity:.45;':''}">
          <td style="padding:4px 8px;color:var(--tx3)">${i+1}</td>
          <td style="padding:4px 8px;font-weight:600">${esc(r.name)}</td>
          <td style="padding:4px 8px;color:var(--tx2)">${esc(r.role)||'—'}</td>
          <td style="padding:4px 8px;text-align:center">${isDupe
            ?'<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 6px;font-size:9px">уже есть</span>'
            :'<span style="background:#dcfce7;color:#166534;border-radius:6px;padding:1px 6px;font-size:9px">новый</span>'
          }</td>
        </tr>`;
      });
      html+='</tbody></table></div>';
      prev.innerHTML=html;
    }catch(err){
      prev.innerHTML=`<div style="color:#ef4444;font-size:11px">❌ Ошибка чтения файла: ${esc(err.message)}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function pgkImportExecute(){
  const rows=window._pgkImportRows||[];
  if(!rows.length){toast('Сначала выберите файл','err');return;}

  // Пропускаем уже существующих
  const existing=new Set(pgkWorkers.map(w=>w.name.trim().toLowerCase()));
  const toCreate=rows.filter(r=>!existing.has(r.name.toLowerCase()));

  if(!toCreate.length){
    toast('Все сотрудники уже существуют — ничего не добавлено','warn');
    closeModal();return;
  }

  closeModal();
  toast(`⏳ Создаю ${toCreate.length} сотрудников...`,'ok');

  let created=0,failed=0;
  // Создаём последовательно чтобы не перегрузить сервер
  for(const r of toCreate){
    try{
      const res=await fetch(`${API}/pgk/workers`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:r.name,role:r.role,phone:'',base_id:null,status:'home',notes:'',user_name:un()})
      });
      if(res.ok)created++;else failed++;
    }catch(e){failed++;}
  }

  await loadPGK();await loadAll();
  if(failed===0){
    toast(`✅ Импортировано ${created} сотрудников`,'ok');
  } else {
    toast(`✅ Создано: ${created} · ❌ Ошибок: ${failed}`,'warn');
  }
  window._pgkImportRows=[];
}

// ═══════════════════════════════════════════════════════════
// IMPORT EQUIPMENT FROM EXCEL
// ═══════════════════════════════════════════════════════════
function pgkImportEquip(){
  showModal('📥 Импорт оборудования из Excel',`
    <div style="font-size:11px;color:var(--tx2);margin-bottom:10px">
      Ожидаемый формат колонок:<br>
      <b>A</b> — Название * &nbsp;|&nbsp; <b>B</b> — Тип &nbsp;|&nbsp; <b>C</b> — Серийный № &nbsp;|&nbsp; <b>D</b> — Ответственный &nbsp;|&nbsp; <b>E</b> — Примечания<br>
      <span style="color:var(--tx3)">Строки с заголовками определяются автоматически и пропускаются.</span>
    </div>
    <div class="fg s2">
      <label>Выберите файл .xlsx / .xls</label>
      <input type="file" id="pgk-equip-import-file" accept=".xlsx,.xls"
        style="font-size:11px;padding:4px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);width:100%"
        onchange="pgkEquipImportPreview(this)">
    </div>
    <div id="pgk-equip-import-preview" style="margin-top:8px"></div>
  `,[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'✅ Импортировать',cls:'bp',fn:pgkEquipImportExecute}
  ]);
  window._pgkEquipImportRows=[];
}

function pgkEquipImportPreview(input){
  const file=input.files[0];
  if(!file)return;
  const prev=document.getElementById('pgk-equip-import-preview');
  prev.innerHTML='<div style="font-size:11px;color:var(--tx3)">⏳ Читаю файл...</div>';
  if(!window.XLSX){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>_pgkDoEquipPreview(file,prev);
    s.onerror=()=>{prev.innerHTML='<div style="color:#ef4444;font-size:11px">❌ Не удалось загрузить библиотеку xlsx. Проверьте интернет-соединение.</div>';};
    document.head.appendChild(s);
  } else {
    _pgkDoEquipPreview(file,prev);
  }
}

function _pgkDoEquipPreview(file,prev){
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

      const HEADER_KW=['название','наименование','name','тип','type','серийн','serial','оборудование','equipment'];
      const rows=data
        .filter(r=>r[0]&&String(r[0]).trim())
        .filter(r=>{
          const first=String(r[0]).trim().toLowerCase();
          return !HEADER_KW.some(k=>first.includes(k));
        })
        .map(r=>({
          name:       String(r[0]).trim(),
          type:       r[1]?String(r[1]).trim():'',
          serial_number: r[2]?String(r[2]).trim():'',
          responsible:r[3]?String(r[3]).trim():'',
          notes:      r[4]?String(r[4]).trim():''
        }));

      window._pgkEquipImportRows=rows;

      if(!rows.length){
        prev.innerHTML='<div style="color:#ef4444;font-size:11px">❌ Не найдено строк с данными</div>';
        return;
      }

      const existingNames=new Set(pgkEquipment.map(e=>e.name.trim().toLowerCase()));
      const dupes=rows.filter(r=>existingNames.has(r.name.toLowerCase()));

      let html=`<div style="font-size:11px;font-weight:700;margin-bottom:6px;color:var(--tx)">
        Найдено: <span style="color:var(--acc)">${rows.length}</span> позиций
        ${dupes.length?`<span style="color:#f59e0b;margin-left:8px">⚠️ ${dupes.length} уже существуют (будут пропущены)</span>`:''}
      </div>`;

      html+=`<div style="max-height:240px;overflow-y:auto;border:1.5px solid var(--bd);border-radius:var(--rs)">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead><tr style="background:var(--s2);position:sticky;top:0">
            <th style="padding:4px 7px;text-align:left;border-bottom:1px solid var(--bd)">#</th>
            <th style="padding:4px 7px;text-align:left;border-bottom:1px solid var(--bd)">Название</th>
            <th style="padding:4px 7px;text-align:left;border-bottom:1px solid var(--bd)">Тип</th>
            <th style="padding:4px 7px;text-align:left;border-bottom:1px solid var(--bd)">Серийный №</th>
            <th style="padding:4px 7px;text-align:left;border-bottom:1px solid var(--bd)">Ответственный</th>
            <th style="padding:4px 7px;text-align:center;border-bottom:1px solid var(--bd)">Статус</th>
          </tr></thead><tbody>`;

      rows.forEach((r,i)=>{
        const isDupe=existingNames.has(r.name.toLowerCase());
        html+=`<tr style="border-bottom:1px solid var(--bd);${isDupe?'opacity:.45;':''}">
          <td style="padding:3px 7px;color:var(--tx3)">${i+1}</td>
          <td style="padding:3px 7px;font-weight:600">${esc(r.name)}</td>
          <td style="padding:3px 7px;color:var(--tx2)">${esc(r.type)||'—'}</td>
          <td style="padding:3px 7px;color:var(--tx2)">${esc(r.serial_number)||'—'}</td>
          <td style="padding:3px 7px;color:var(--tx2)">${esc(r.responsible)||'—'}</td>
          <td style="padding:3px 7px;text-align:center">${isDupe
            ?'<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 6px;font-size:9px">уже есть</span>'
            :'<span style="background:#dcfce7;color:#166534;border-radius:6px;padding:1px 6px;font-size:9px">новая</span>'
          }</td>
        </tr>`;
      });
      html+='</tbody></table></div>';
      prev.innerHTML=html;
    }catch(err){
      prev.innerHTML=`<div style="color:#ef4444;font-size:11px">❌ Ошибка чтения файла: ${esc(err.message)}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function pgkEquipImportExecute(){
  const rows=window._pgkEquipImportRows||[];
  if(!rows.length){toast('Сначала выберите файл','err');return;}

  const existingNames=new Set(pgkEquipment.map(e=>e.name.trim().toLowerCase()));
  const toCreate=rows.filter(r=>!existingNames.has(r.name.toLowerCase()));

  if(!toCreate.length){
    toast('Всё оборудование уже существует — ничего не добавлено','warn');
    closeModal();return;
  }

  closeModal();
  toast(`⏳ Создаю ${toCreate.length} позиций...`,'ok');

  let created=0,failed=0;
  for(const r of toCreate){
    try{
      const res=await fetch(`${API}/pgk/equipment`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:r.name,
          type:r.type||'',
          serial_number:r.serial_number||'',
          responsible:r.responsible||null,
          notes:r.notes||'',
          status:'working',
          base_id:null
        })
      });
      if(res.ok)created++;else failed++;
    }catch(e){failed++;}
  }

  window._pgkEquipImportRows=[];
  await loadPGK();
  if(failed===0){
    toast(`✅ Импортировано ${created} единиц оборудования`,'ok');
  } else {
    toast(`✅ Создано: ${created} · ❌ Ошибок: ${failed}`,'warn');
  }
}

function pgkEditWorker(id){
  const w=pgkWorkers.find(x=>x.id===id);if(!w)return;
  showModal('Редактировать сотрудника',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-n" value="${esc(w.name)}"></div>
    <div class="fg"><label>Должность</label><input id="f-r" value="${esc(w.role||'')}"></div>
    <div class="fg"><label>Дата начала работы</label><input id="f-sd" type="date" value="${w.start_date||''}"></div>
    <div class="fg s2"><label>База</label><select id="f-b"><option value="">— не назначен —</option>${bases.map(b=>`<option value="${b.id}" ${w.base_id===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(w.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>savePGKWorker(id)}]);
}
async function savePGKWorker(id){
  const name=v('f-n').trim();if(!name){toast('Введите имя','err');return;}
  const duplicate=pgkWorkers.find(w=>w.name.trim().toLowerCase()===name.toLowerCase()&&w.id!==id);
  if(duplicate){toast('Сотрудник с таким именем уже существует','err');return;}
  const base_id=v('f-b')||null;
  const existing=id?pgkWorkers.find(x=>x.id===id):null;
  let status=existing?existing.status||'home':'home';
  if(base_id&&!existing?.base_id) status='working';
  if(!base_id&&existing?.base_id) status='home';
  const data={name,role:v('f-r'),phone:'',start_date:v('f-sd')||null,base_id,status,notes:v('f-nt'),user_name:un()};
  if(id)await fetch(`${API}/pgk/workers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/pgk/workers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await loadPGK();await loadAll();toast(id?'Обновлено':'Добавлено','ok');
}
async function pgkDelWorker(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/workers/${id}`,'Сотрудник удалён',async()=>{await loadPGK();await loadAll();});}

// ── PGK MACHINERY CRUD ─────────────────────────────────────
function pgkAddMach(){
  const baseOpts=`<option value="">— не на базе —</option>`+bases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  showModal('Добавить технику',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" placeholder="ТРЭКОЛ-39294"></div>
    <div class="fg"><label>Тип</label><select id="f-t">${TRANSPORT_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="fg"><label>Гос. номер</label><input id="f-pl" placeholder="А123БВ"></div>
    <div class="fg s2"><label>База</label><select id="f-b">${baseOpts}</select></div>
    <div class="fg s2"><label>Статус</label><select id="f-st">
      <option value="working">✅ В работе</option><option value="idle">⏸ Простой</option><option value="broken">🔴 Сломана</option>
    </select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/pgk/machinery`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,type:v('f-t'),plate_number:v('f-pl'),base_id:v('f-b')||null,status:v('f-st')||'working',notes:v('f-nt'),user_name:un()})});
    closeModal();await loadPGK();await loadAll();toast('Добавлено','ok');
  }}]);
}
function pgkEditMach(id){
  const m=pgkMachinery.find(x=>x.id===id);if(!m)return;
  const baseOpts=`<option value="">— не на базе —</option>`+bases.map(b=>`<option value="${b.id}" ${m.base_id===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
  const driverOpts=`<option value="">— без водителя —</option>`+pgkWorkers.filter(w=>w.status!=='fired').map(w=>`<option value="${w.id}" ${m.driver_id===w.id?'selected':''}>${esc(w.name)}</option>`).join('');
  showModal('Редактировать — '+esc(m.name),`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(m.name)}"></div>
    <div class="fg"><label>Тип</label><select id="f-t">${TRANSPORT_TYPES.map(t=>`<option ${m.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="fg"><label>Гос. номер</label><input id="f-pl" value="${esc(m.plate_number||'')}"></div>
    <div class="fg s2"><label>База</label><select id="f-b">${baseOpts}</select></div>
    <div class="fg s2"><label>Водитель</label><select id="f-drv">${driverOpts}</select></div>
    <div class="fg s2"><label>Статус</label><select id="f-st">
      <option value="working" ${m.status==='working'?'selected':''}>✅ В работе</option>
      <option value="idle" ${m.status==='idle'?'selected':''}>⏸ Простой</option>
      <option value="broken" ${m.status==='broken'?'selected':''}>🔴 Сломана</option>
    </select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(m.notes||'')}</textarea></div>
  </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
    await fetch(`${API}/pgk/machinery/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...m,name,type:v('f-t'),plate_number:v('f-pl'),base_id:v('f-b')||null,driver_id:v('f-drv')||null,status:v('f-st')||'working',notes:v('f-nt'),user_name:un()})});
    closeModal();await loadPGK();await loadAll();toast('Обновлено','ok');
  }}]);
}


async function pgkDelMach(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/machinery/${id}`,'Техника удалена',async()=>{await loadPGK();await loadAll();});}

// ── PGK EQUIPMENT CRUD ─────────────────────────────────────
function _equipFormHtml(e){
  const grpOpts=`<option value="">— без группы —</option>`+pgkEquipGroups.map(g=>`<option value="${escAttr(g.id)}" ${e&&e.group_id===g.id?'selected':''}>${esc(g.name)}</option>`).join('');
  const respOpts=`<option value="">— не назначен —</option>`+(pgkWorkers||[]).map(w=>`<option value="${esc(w.name)}" ${e&&e.responsible===w.name?'selected':''}>${esc(w.name)}${w.role?' ('+esc(w.role)+')':''}</option>`).join('');
  return `<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(e?e.name:'')}"></div>
    <div class="fg"><label>Тип</label><input id="f-t" value="${esc(e?e.type:'')}"></div>
    <div class="fg"><label>Серийный №</label><input id="f-sr" value="${esc(e?e.serial_number:'')}"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st">
      <option value="working" ${!e||e.status==='working'?'selected':''}>✅ В работе</option>
      <option value="idle" ${e&&e.status==='idle'?'selected':''}>⏸ Не используется</option>
      <option value="broken" ${e&&e.status==='broken'?'selected':''}>🔴 Неисправно</option>
    </select></div>
    <div class="fg s2"><label>Группа</label><select id="f-grp">${grpOpts}</select></div>
    <div class="fg s2"><label>База</label><select id="f-b"><option value="">— не назначено —</option>${bases.map(b=>`<option value="${b.id}" ${e&&e.base_id===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div class="fg s2"><label>Ответственный</label><select id="f-resp">${respOpts}</select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(e?e.notes:'')}</textarea></div>
  </div>`;
}
function pgkAddEquip(){
  showModal('Новое оборудование',_equipFormHtml(null),[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:savePGKEquip}]);
}
function pgkEditEquip(id){
  const e=pgkEquipment.find(x=>x.id===id);if(!e)return;
  showModal('Редактировать оборудование',_equipFormHtml(e),[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>savePGKEquip(id)}]);
}
async function savePGKEquip(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const data={name,type:v('f-t'),serial_number:v('f-sr'),status:v('f-st'),base_id:v('f-b')||null,responsible:v('f-resp')||'',notes:v('f-nt'),group_id:v('f-grp')||''};
  if(id)await fetch(`${API}/pgk/equipment/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/pgk/equipment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await loadPGK();toast(id?'Обновлено':'Добавлено','ok');
}
async function pgkDelEquip(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/equipment/${id}`,'Оборудование удалено',loadPGK);}

function exportEquipmentExcel(){
  if(!pgkEquipment||!pgkEquipment.length){toast('Нет оборудования для экспорта','warn');return;}
  const wb=XLSX.utils.book_new();
  const todayDate=new Date();
  const todayStr=todayDate.toISOString().split('T')[0];
  const todayFmt=todayDate.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});

  const COLS=8;
  const hdrFill='C3D69B';
  const rowFill='B9CCE4';
  const titleFill='D9E1F2';
  const border={top:{style:'medium',color:{rgb:'000000'}},bottom:{style:'medium',color:{rgb:'000000'}},left:{style:'medium',color:{rgb:'000000'}},right:{style:'medium',color:{rgb:'000000'}}};
  const thinBorder={top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}};
  const baseAlign={horizontal:'center',vertical:'center',wrapText:true};
  const leftAlign={horizontal:'left',vertical:'center',wrapText:true};

  const statLbl={working:'В работе',idle:'Не используется',broken:'Неисправно'};
  const hdr=['№','Название','Тип','Серийный №','Статус','База','Ответственный','Примечания'];

  const aoa=[
    ['Реестр оборудования — '+todayFmt],
    hdr,
    ...pgkEquipment.map((e,i)=>{
      const b=(bases||[]).find(x=>x.id===e.base_id);
      const grp=(pgkEquipGroups||[]).find(g=>g.id===e.group_id);
      return[
        i+1,
        (grp?'['+grp.name+'] ':'')+e.name,
        e.type||'',
        e.serial_number||'',
        statLbl[e.status||'working']||e.status||'',
        b?b.name:'',
        e.responsible||'',
        e.notes||''
      ];
    })
  ];

  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:5},{wch:32},{wch:18},{wch:16},{wch:16},{wch:20},{wch:24},{wch:30}];
  ws['!rows']=[{hpx:32},{hpx:40}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:COLS-1}}];
  ws['!views']=[{state:'frozen',xSplit:0,ySplit:2}];

  function colLetter(c){let s='',n=c;do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
  function ref(r,c){return colLetter(c)+(r+1);}
  function setStyle(cr,st){if(!ws[cr])ws[cr]={t:'s',v:''};ws[cr].s=st;}

  setStyle(ref(0,0),{font:{name:'Times New Roman',bold:true,sz:14},alignment:{horizontal:'center',vertical:'center'},fill:{patternType:'solid',fgColor:{rgb:titleFill}},border});
  for(let c=0;c<COLS;c++)setStyle(ref(1,c),{font:{name:'Times New Roman',bold:true,sz:11},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:hdrFill}},border});
  pgkEquipment.forEach((_,i)=>{
    const r=i+2;
    const fill=i%2===0?{patternType:'solid',fgColor:{rgb:rowFill}}:{patternType:'solid',fgColor:{rgb:'FFFFFF'}};
    for(let c=0;c<COLS;c++){
      const align=(c===1||c===2||c===5||c===6||c===7)?leftAlign:baseAlign;
      setStyle(ref(r,c),{font:{name:'Times New Roman',sz:11},alignment:align,fill,border:thinBorder});
    }
  });

  // Сводный лист по ответственным
  const byResp={};
  pgkEquipment.forEach(e=>{const r=e.responsible||'— не назначен —';if(!byResp[r])byResp[r]=[];byResp[r].push(e);});
  const sumAoa=[
    ['Сводка по ответственным'],
    ['Ответственный','Кол-во','В работе','Неисправно'],
    ...Object.entries(byResp).map(([resp,items])=>[
      resp,items.length,
      items.filter(e=>(e.status||'working')==='working').length,
      items.filter(e=>e.status==='broken').length
    ])
  ];
  const sumWs=XLSX.utils.aoa_to_sheet(sumAoa);
  sumWs['!cols']=[{wch:28},{wch:10},{wch:10},{wch:12}];
  sumWs['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}}];

  XLSX.utils.book_append_sheet(wb,ws,'Оборудование');
  XLSX.utils.book_append_sheet(wb,sumWs,'По ответственным');
  XLSX.writeFile(wb,'Оборудование_'+todayStr.replace(/-/g,'_')+'.xlsx');
  toast('Excel сохранён','ok');
}

function openEquipActModal(){
  const withResp=[...new Set(pgkEquipment.filter(e=>e.responsible).map(e=>e.responsible))].sort();
  if(!withResp.length){toast('Ни за кем не закреплено оборудование','warn');return;}
  const opts=withResp.map(r=>`<option value="${esc(r)}">${esc(r)} (${pgkEquipment.filter(e=>e.responsible===r).length} ед.)</option>`).join('');
  showModal('📄 Акт приёма-передачи',`<div class="fgr">
    <div class="fg s2"><label>Выберите ответственного</label>
      <select id="f-act-resp" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">${opts}</select>
    </div>
    <div class="fg s2" style="font-size:11px;color:var(--tx3)">Будет сформирован Word-документ со списком оборудования, закреплённого за выбранным сотрудником.</div>
  </div>`,[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'📄 Сформировать',cls:'bp',fn:async()=>{
      const resp=(document.getElementById('f-act-resp').value||'').trim();
      if(!resp)return;
      closeModal();
      try{
        const url=`${API}/pgk/equipment/act?responsible=${encodeURIComponent(resp)}`;
        const r=await fetch(url);
        if(!r.ok){const e=await r.json().catch(()=>({}));toast(e.error||'Ошибка формирования акта','err');return;}
        const blob=await r.blob();
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`Акт_${resp.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.docx`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Акт сформирован','ok');
      }catch(e){toast('Ошибка: '+e.message,'err');}
    }}
  ]);
}

function pgkAssignEquipResponsible(eid){
  const e=pgkEquipment.find(x=>x.id===eid);if(!e)return;
  const opts=`<option value="">— снять ответственного —</option>`+(pgkWorkers||[]).map(w=>`<option value="${esc(w.name)}" ${e.responsible===w.name?'selected':''}>${esc(w.name)}${w.role?' ('+esc(w.role)+')':''}</option>`).join('');
  showModal('👤 Ответственный',`<div class="fgr">
    <div class="fg s2"><label>Оборудование</label><input disabled value="${esc(e.name)}"></div>
    <div class="fg s2"><label>Ответственный</label><select id="f-resp" style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2)">${opts}</select></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const responsible=v('f-resp')||'';
    await fetch(`${API}/pgk/equipment/${eid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...e,responsible})});
    closeModal();await loadPGK();toast('Ответственный обновлён','ok');
  }}]);
}

// ═══════════════════════════════════════════════════════════
// BASE PANEL CRUD MODALS
// ═══════════════════════════════════════════════════════════
function openAddWorkerModal(){
  const machOpts=`<option value="">— нет —</option>`+(currentObj.machinery||[]).map(m=>`<option value="${m.id}">${MICONS[m.type]||'🔧'} ${esc(m.name)}</option>`).join('');
  showModal('Новый сотрудник',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-n"></div>
    <div class="fg"><label>Должность</label><input id="f-r"></div>
    <div class="fg"><label>Дата заезда</label><input id="f-sd" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="fg s2"><label>Машина</label><select id="f-m">${machOpts}</select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:saveWorker}]);
}
function openEditWorkerModal(id){
  const w=(currentObj.workers||[]).find(x=>x.id===id);if(!w)return;
  const machOpts=`<option value="">— нет —</option>`+(currentObj.machinery||[]).map(m=>`<option value="${m.id}" ${m.id===w.machine_id?'selected':''}>${MICONS[m.type]||'🔧'} ${esc(m.name)}</option>`).join('');
  showModal('Редактировать сотрудника',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-n" value="${esc(w.name)}"></div>
    <div class="fg"><label>Должность</label><input id="f-r" value="${esc(w.role||'')}"></div>
    <div class="fg"><label>Дата заезда</label><input id="f-sd" type="date" value="${w.start_date||''}"></div>
    <div class="fg s2"><label>Машина</label><select id="f-m">${machOpts}</select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(w.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveWorker(id)}]);
}
async function saveWorker(id){
  const name=v('f-n').trim();if(!name){toast('Введите имя','err');return;}
  const data={name,role:v('f-r'),phone:'',start_date:v('f-sd')||null,machine_id:v('f-m')||null,base_id:currentObj.id,notes:v('f-nt'),user_name:un()};
  if(id)await fetch(`${API}/pgk/workers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/pgk/workers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function delWorker(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/workers/${id}`,'Сотрудник удалён',refreshCurrent);}

function openAddMachModal(){
  showModal('Новая техника',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n"></div>
    <div class="fg"><label>Тип</label><select id="f-t">${MTYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="fg"><label>Гос. номер</label><input id="f-pl"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="working">В работе</option><option value="idle">Стоит</option><option value="broken">Сломана</option></select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:saveMach}]);
}
function openEditMachModal(id){
  const m=(currentObj.machinery||[]).find(x=>x.id===id);if(!m)return;
  showModal('Редактировать технику',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(m.name)}"></div>
    <div class="fg"><label>Тип</label><select id="f-t">${MTYPES.map(t=>`<option ${m.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="fg"><label>Гос. номер</label><input id="f-pl" value="${esc(m.plate_number||'')}"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="working" ${m.status==='working'?'selected':''}>В работе</option><option value="idle" ${m.status==='idle'?'selected':''}>Стоит</option><option value="broken" ${m.status==='broken'?'selected':''}>Сломана</option></select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(m.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveMach(id)}]);
}
async function saveMach(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const ex=id?(currentObj.machinery||[]).find(x=>x.id===id):null;
  const data={name,type:v('f-t'),plate_number:v('f-pl'),status:v('f-st'),lat:ex?.lat||null,lng:ex?.lng||null,base_id:currentObj.id,notes:v('f-nt'),user_name:un()};
  if(id)await fetch(`${API}/pgk/machinery/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/pgk/machinery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function delMach(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/machinery/${id}`,'Техника удалена',refreshCurrent);}

function enterPlaceMode(){
  // На странице ПГК currentObj может быть null — нужно выбрать базу
  const allMach=currentObj?.machinery||pgkMachinery||[];
  if(!allMach.length){toast('Сначала добавьте технику','err');return;}
  // Формируем список: если смотрим конкретную базу — её техника, иначе вся
  const machOpts=allMach.map(m=>`<option value="${m.id}:${m.base_id||''}">${MICONS[m.type]||'🔧'} ${esc(m.name)}${m.base_id?(` — 🏕 `+(bases.find(b=>b.id===m.base_id)?.name||m.base_id)):'  (без базы)'}</option>`).join('');
  showModal('Расставить технику',`<p style="font-size:11px;color:var(--tx2);margin-bottom:9px">Выберите технику, затем кликните по карте.</p>
    <div class="fg"><label>Техника</label><select id="f-mid">${machOpts}</select></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'📍 Начать',cls:'bp',fn:()=>{
      const val=v('f-mid').split(':');
      machinePlaceId=val[0];
      machinePlaceBaseId=val[1]||null;
      closeModal();
      switchView('map'); // переключаемся на карту
      const m=allMach.find(x=>x.id===machinePlaceId);
      setTool('machine');
      document.getElementById('bnr-t').textContent=`📍 Кликните место для: ${m?.name||''}`;
    }}]);
}
async function placeMachineOnMap(lat,lng){
  if(!machinePlaceId)return;
  const baseId=machinePlaceBaseId||(currentObj?.id);
  const m=pgkMachinery.find(x=>x.id===machinePlaceId)||(currentObj?.machinery||[]).find(x=>x.id===machinePlaceId);
  if(!m){toast('Техника не найдена','err');machinePlaceId=null;setTool('view');return;}
  const machName=m.name;
  await fetch(`${API}/pgk/machinery/${machinePlaceId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...m,lat,lng,base_id:baseId,user_name:un()})});
  machinePlaceId=null;machinePlaceBaseId=null;setTool('view');
  // Перезагружаем технику и базы, рисуем ВСЮ технику на карте
  pgkMachinery=await fetch(`${API}/pgk/machinery`).then(r=>r.json());
  bases=await fetch(`${API}/bases`).then(r=>r.json());
  renderAllMachinery();
  toast(machName+' размещена на карте','ok');
}

function openAddMatModal(){
  showModal('Новый материал',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" list="mpl"><datalist id="mpl">${MPRESET.map(p=>`<option>${p}</option>`).join('')}</datalist></div>
    <div class="fg"><label>Количество</label><input id="f-a" type="number" value="0" step="any"></div>
    <div class="fg"><label>Единица</label><input id="f-u" value="шт"></div>
    <div class="fg s2"><label>Мин. запас (0 = не контролировать)</label><input id="f-mn" type="number" value="0" step="any"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:saveMat}]);
}
function openEditMatModal(id){
  const m=(currentObj.materials||[]).find(x=>x.id===id);if(!m)return;
  showModal('Редактировать материал',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(m.name)}"></div>
    <div class="fg"><label>Количество</label><input id="f-a" type="number" value="${m.amount}" step="any"></div>
    <div class="fg"><label>Единица</label><input id="f-u" value="${esc(m.unit)}"></div>
    <div class="fg s2"><label>Мин. запас</label><input id="f-mn" type="number" value="${m.min_amount}" step="any"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(m.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveMat(id)}]);
}
async function saveMat(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const data={name,amount:parseFloat(v('f-a'))||0,unit:v('f-u')||'шт',min_amount:parseFloat(v('f-mn'))||0,notes:v('f-nt')};
  if(id)await fetch(`${API}/materials/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/bases/${currentObj.id}/materials`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function mergeMaterials(baseId){
  if(!confirm('Объединить все материалы с одинаковым названием на этой базе?\nКоличества будут просуммированы, запись останется одна.'))return;
  try{
    const r=await fetch(`${API}/bases/${baseId}/materials/merge`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}' });
    const data=await r.json();
    await refreshCurrent();
    if(data.merged>0) toast(`Объединено дублей: ${data.merged}`,'ok');
    else toast('Дублей не найдено','ok');
  }catch(e){toast('Ошибка объединения','err');}
}
async function delMat(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/materials/${id}`,'Материал удалён',refreshCurrent);}


// ═══════════════════════════════════════════════════════════
// TRANSFER RESOURCES BETWEEN BASES
// ═══════════════════════════════════════════════════════════
function openTransferModal(type, itemId){
  // find source base for material
  let sourceBaseId=currentObj?currentObj.id:null;
  if(type==='material'){
    for(const b of bases){if((b.materials||[]).some(m=>m.id===itemId)){sourceBaseId=b.id;break;}}
  }
  const otherBases=bases.filter(b=>b.id!==sourceBaseId);
  if(!otherBases.length){toast('Нет других баз для перевода','err');return;}
  const labels={worker:'сотрудника',machine:'технику',equipment:'оборудование',material:'материал'};
  const baseOpts=otherBases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  showModal(`Перевести ${labels[type]||''}`,`<div class="fgr fone">
    <div class="fg"><label>Перевести на базу</label><select id="f-tb">${baseOpts}</select></div>
  </div>`,[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Перевести →',cls:'bp',fn:()=>doTransfer(type,itemId,v('f-tb'),sourceBaseId)}
  ]);
}
async function doTransfer(type, itemId, targetBaseId, sourceBaseId){
  if(!targetBaseId){toast('Выберите базу','err');return;}
  const targetBase=bases.find(b=>b.id===targetBaseId);
  const sourceBase=bases.find(b=>b.id===sourceBaseId)||currentObj||{};
  let endpoint='', body={};
  const afterDone=async()=>{
    if(pgkTab==='materials'){await loadPGK();await loadAll();}else{await refreshCurrent();}
  };
  if(type==='worker'){
    const w=pgkWorkers.find(x=>x.id===itemId)||(currentObj&&(currentObj.workers||[]).find(x=>x.id===itemId));
    if(!w)return;
    endpoint=`${API}/pgk/workers/${itemId}`;
    body={...w,base_id:targetBaseId,user_name:un()};
  } else if(type==='machine'){
    const m=pgkMachinery.find(x=>x.id===itemId)||(currentObj&&(currentObj.machinery||[]).find(x=>x.id===itemId));
    if(!m)return;
    endpoint=`${API}/pgk/machinery/${itemId}`;
    body={...m,base_id:targetBaseId,user_name:un()};
  } else if(type==='equipment'){
    const e=pgkEquipment.find(x=>x.id===itemId)||(currentObj&&(currentObj.equipment||[]).find(x=>x.id===itemId));
    if(!e)return;
    endpoint=`${API}/pgk/equipment/${itemId}`;
    body={...e,base_id:targetBaseId};
  } else if(type==='material'){
    let m=null;
    for(const b of bases){m=(b.materials||[]).find(x=>x.id===itemId);if(m)break;}
    if(!m&&currentObj)m=(currentObj.materials||[]).find(x=>x.id===itemId);
    if(!m)return;
    const targetBaseData=await fetch(`${API}/bases/${targetBaseId}`).then(r=>r.json()).catch(()=>null);
    const existing=targetBaseData&&(targetBaseData.materials||[]).find(x=>x.name.trim().toLowerCase()===m.name.trim().toLowerCase()&&x.unit===m.unit);
    if(existing){
      await fetch(`${API}/materials/${existing.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...existing,amount:existing.amount+m.amount,user_name:un()})});
      await fetch(`${API}/materials/${existing.id}/actualize`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({new_amount:existing.amount+m.amount,act_date:new Date().toISOString().split('T')[0],
          notes:'Приход при переводе с базы '+esc(sourceBase.name||'')+': +'+m.amount+' '+m.unit,user_name:un()})});
    } else {
      await fetch(`${API}/bases/${targetBaseId}/materials`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...m,user_name:un()})});
    }
    await fetch(`${API}/materials/${itemId}`,{method:'DELETE'});
    closeModal();await afterDone();toast(`Переведено на базу ${esc(targetBase?.name||'')}${existing?' (объединено)':''}`, 'ok');return;
  }
  await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  closeModal();await afterDone();toast(`Переведено на базу ${esc(targetBase?.name||'')}`, 'ok');
}

// ═══════════════════════════════════════════════════════════
// SITE / BASE CRUD
// ═══════════════════════════════════════════════════════════
function openAddSiteModal(){
  showModal('Новый объект',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" placeholder="Скважины р-н Берёзово"></div>
    <div class="fg"><label>Заказчик</label><input id="f-cl"></div>
    <div class="fg"><label>Договор №</label><input id="f-ct"></div>
    <div class="fg s2"><label>Адрес / Район</label><input id="f-ad"></div>
    <div class="fg"><label>Начало</label><input id="f-sd" type="date"></div>
    <div class="fg"><label>Срок</label><input id="f-ed" type="date"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="active">Активный</option><option value="paused">Пауза</option><option value="done">Завершён</option></select></div>
    <div class="fg s2"><label>Готовность: <span class="rdv" id="f-pv">0%</span></label><input id="f-pct" type="range" min="0" max="100" value="0" oninput="document.getElementById('f-pv').textContent=this.value+'%'"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Создать',cls:'bp',fn:saveSite}]);
}
async function openEditSiteModal(id){
  const s=await fetch(`${API}/sites/${id}`).then(r=>r.json());
  showModal('Редактировать объект',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(s.name)}"></div>
    <div class="fg"><label>Заказчик</label><input id="f-cl" value="${esc(s.client||'')}"></div>
    <div class="fg"><label>Договор №</label><input id="f-ct" value="${esc(s.contract_number||'')}"></div>
    <div class="fg s2"><label>Адрес</label><input id="f-ad" value="${esc(s.address||'')}"></div>
    <div class="fg"><label>Начало</label><input id="f-sd" type="date" value="${s.start_date||''}"></div>
    <div class="fg"><label>Срок</label><input id="f-ed" type="date" value="${s.end_date||''}"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="active" ${s.status==='active'?'selected':''}>Активный</option><option value="paused" ${s.status==='paused'?'selected':''}>Пауза</option><option value="done" ${s.status==='done'?'selected':''}>Завершён</option></select></div>
    <div class="fg s2"><label>Готовность: <span class="rdv" id="f-pv">${s.completion_percent}%</span></label><input id="f-pct" type="range" min="0" max="100" value="${s.completion_percent}" oninput="document.getElementById('f-pv').textContent=this.value+'%'"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(s.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveSite(id)}]);
}
async function saveSite(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const data={name,client:v('f-cl'),contract_number:v('f-ct'),address:v('f-ad'),start_date:v('f-sd'),end_date:v('f-ed'),status:v('f-st')||'active',completion_percent:parseInt(v('f-pct'))||0,notes:v('f-nt'),user_name:un()};
  const resp=await fetch(id?`${API}/sites/${id}`:`${API}/sites`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!resp.ok){toast('Ошибка сохранения: '+resp.status,'err');return;}
  closeModal();
  filterSt='all';
  document.querySelectorAll('.ft').forEach(t=>t.classList.toggle('on',t.dataset.f==='all'));
  await loadAll();
  if(id)selectSite(id);
  toast(id?'Обновлено':'Объект создан — смотри список слева','ok');
}
async function deleteSite(id){if(!confirm('Удалить объект?'))return;closePanel();await apiDelUndo(`/sites/${id}`,'Объект удалён',loadAll);}

function openAddBaseModal(lat,lng){
  setTool('view');
  showModal('Новая база',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" placeholder="База Берёзово"></div>
    <div class="fg"><label>Широта</label><input id="f-la" type="number" step="any" value="${lat||62}"></div>
    <div class="fg"><label>Долгота</label><input id="f-ln" type="number" step="any" value="${lng||55}"></div>
    <div class="fg s2"><label>Описание</label><textarea id="f-d"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Создать',cls:'bb',fn:saveBase}]);
}
async function openEditBaseModal(id){
  const b=bases.find(x=>x.id===id)||currentObj;if(!b)return;
  showModal('Редактировать базу',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(b.name)}"></div>
    <div class="fg"><label>Широта</label><input id="f-la" type="number" step="any" value="${b.lat}"></div>
    <div class="fg"><label>Долгота</label><input id="f-ln" type="number" step="any" value="${b.lng}"></div>
    <div class="fg s2"><label>Описание</label><textarea id="f-d">${esc(b.description||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bb',fn:()=>saveBase(id)}]);
}
async function saveBase(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const lat=parseFloat(v('f-la')),lng=parseFloat(v('f-ln'));
  if(isNaN(lat)||isNaN(lng)){toast('Укажите координаты','err');return;}
  const data={name,lat,lng,description:v('f-d'),user_name:un()};
  if(id)await fetch(`${API}/bases/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/bases`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await loadAll();if(id&&currentObj?.id===id)refreshCurrent();toast(id?'Обновлено':'База создана','ok');
}
async function deleteBase(id){if(!confirm('Удалить базу?'))return;closePanel();await apiDelUndo(`/bases/${id}`,'База удалена',loadAll);}

async function openAssignBasesModal(siteId){
  const s=await fetch(`${API}/sites/${siteId}`).then(r=>r.json());
  const aIds=(s.bases||[]).map(b=>b.id);
  showModal('Назначить базы',`<p style="font-size:11px;color:var(--tx2);margin-bottom:9px">Объект: <strong>${esc(s.name)}</strong></p>
    ${bases.length?`<div class="fchk-list" id="bchk">${bases.map(b=>`<label class="fchk"><input type="checkbox" value="${b.id}" ${aIds.includes(b.id)?'checked':''}>🏕 ${esc(b.name)}</label>`).join('')}</div>`:'<div class="empty">Нет баз</div>'}`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
      const ids=[...document.querySelectorAll('#bchk input:checked')].map(c=>c.value);
      await fetch(`${API}/sites/${siteId}/bases`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({base_ids:ids,user_name:un()})});
      closeModal();await loadAll();if(currentObj?.id===siteId)selectSite(siteId);toast('Базы обновлены','ok');
    }}]);
}

// ═══════════════════════════════════════════════════════════
// VOLUMES
// ═══════════════════════════════════════════════════════════
const VOL_SECTIONS={
  geology:  {label:'Геология',    icon:'🪨', color:'#0891b2'},
  geodesy:  {label:'Геодезия',    icon:'📐', color:'#065f46'},
  hydromet: {label:'Гидромет',    icon:'💧', color:'#1d4ed8'},
  ecology:  {label:'Экология',    icon:'🌿', color:'#15803d'},
};

function openVolSectionPicker(){
  showModal('Выберите раздел',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0">
      ${Object.entries(VOL_SECTIONS).map(([k,s])=>`
        <button class="btn bs" style="padding:18px 10px;flex-direction:column;gap:6px;font-size:14px;border-radius:var(--r);justify-content:center;align-items:center;border:2px solid var(--bd);transition:all .15s"
          onmouseover="this.style.borderColor='${s.color}';this.style.background='${s.color}18'"
          onmouseout="this.style.borderColor='';this.style.background=''"
          onclick="closeModal();openAddVolModal('${k}')">
          <span style="font-size:26px">${s.icon}</span>
          <span style="font-weight:800;font-size:13px">${s.label}</span>
        </button>`).join('')}
    </div>`,
  [{label:'Отмена',cls:'bs',fn:closeModal}]);
}

function openAddVolModal(cat){
  const sec=VOL_SECTIONS[cat]||{label:'Объём',icon:'📋',color:'#1a56db'};
  showModal(`${sec.icon} Новый объём — ${sec.label}`,`<div class="fgr">
    <div class="fg s2"><label>Вид работ *</label><input id="f-vn" placeholder="Бурение, съёмка, нивелировка..."></div>
    <div class="fg"><label>Плановый объём</label><input id="f-va" type="number" value="0" step="any"></div>
    <div class="fg"><label>Единица</label><input id="f-vu" value="шт"></div>
    <div class="fg"><label>Начало (план)</label><input id="f-vps" type="date"></div>
    <div class="fg"><label>Конец (план)</label><input id="f-vpe" type="date"></div>
    <div class="fg s2"><label>Цвет на карте</label><input id="f-vc" type="color" value="${sec.color}" style="width:100%;height:30px"></div>
    <div class="fg s2"><label>Прозрачность заливки: <span id="f-vop-lbl">25%</span></label>
      <input id="f-vop" type="range" min="0" max="100" value="25" style="width:100%" oninput="document.getElementById('f-vop-lbl').textContent=this.value+'%'"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-vnt"></textarea></div>
  </div>`,[{label:'← Назад',cls:'bs',fn:()=>{closeModal();openVolSectionPicker();}},{label:'Добавить',cls:'bp',fn:()=>saveVol(null,cat)}]);
}
function openEditVolModal(id){
  const vol=(currentObj?.volumes||[]).find(x=>x.id===id);if(!vol)return;
  const opPct=Math.round((vol.fill_opacity!==undefined&&vol.fill_opacity!==null?vol.fill_opacity:.25)*100);
  showModal('Редактировать объём',`<div class="fgr">
    <div class="fg s2"><label>Вид работ *</label><input id="f-vn" value="${esc(vol.name)}"></div>
    <div class="fg"><label>Плановый объём</label><input id="f-va" type="number" value="${vol.amount}" step="any"></div>
    <div class="fg"><label>Единица</label><input id="f-vu" value="${esc(vol.unit)}"></div>
    <div class="fg"><label>Начало (план)</label><input id="f-vps" type="date" value="${vol.plan_start||''}"></div>
    <div class="fg"><label>Конец (план)</label><input id="f-vpe" type="date" value="${vol.plan_end||''}"></div>
    <div class="fg s2"><label>Цвет</label><input id="f-vc" type="color" value="${vol.color||'#1a56db'}" style="width:100%;height:30px"></div>
    <div class="fg s2"><label>Прозрачность заливки: <span id="f-vop-lbl">${opPct}%</span></label>
      <input id="f-vop" type="range" min="0" max="100" value="${opPct}" style="width:100%" oninput="document.getElementById('f-vop-lbl').textContent=this.value+'%'"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-vnt">${esc(vol.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveVol(id,vol.category)}]);
}
async function saveVol(id,cat){
  const name=v('f-vn').trim();if(!name){toast('Введите название','err');return;}
  const ex=id?(currentObj?.volumes||[]).find(x=>x.id===id):null;
  const opEl=document.getElementById('f-vop');
  const fillOp=opEl?parseFloat(opEl.value)/100:.25;
  const data={category:cat||ex?.category,name,amount:parseFloat(v('f-va'))||0,unit:v('f-vu')||'шт',color:v('f-vc')||'#1a56db',fill_opacity:fillOp,geojson:ex?.geojson??null,plan_start:v('f-vps')||null,plan_end:v('f-vpe')||null,notes:v('f-vnt')};
  if(id)await fetch(`${API}/volumes/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/sites/${currentObj.id}/volumes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function deleteVol(id){
  if(!confirm('Удалить объём? Будут также удалены все записи факта для этого объёма.'))return;
  // Remove vol_progress map layers that belong to this volume
  const volProg = (currentObj && currentObj.vol_progress || []).filter(p => p.volume_id === id);
  volProg.forEach(p => {
    if(vpLayers[p.id]){try{map.removeLayer(vpLayers[p.id]);}catch(e){}delete vpLayers[p.id];}
  });
  // Remove the volume's own layer
  if(volLayers[id]){try{map.removeLayer(volLayers[id]);}catch(e){}delete volLayers[id];}
  await apiDelUndo(`/volumes/${id}`,'Объём удалён',refreshCurrent);
}
function zoomVol(id){
  const vol=(currentObj?.volumes||[]).find(x=>x.id===id);if(!vol?.geojson)return;
  try{const g=L.geoJSON(JSON.parse(vol.geojson));map.fitBounds(g.getBounds().pad(.25));}catch(e){}
}

// ── Volume drawing ─────────────────────────────────────────
function startVolDraw(volId, drawAction){
  // drawAction: 'replace' (default) или 'add' (продолжить)
  drawAction=drawAction||'replace';
  const siteId=currentObj?.id||activeSiteId;
  drawVolId=volId;drawSiteId=siteId;
  const vol=(currentObj?.volumes||[]).find(x=>x.id===volId);
  drawVolData=vol?{...vol}:null;
  // При продолжении — загружаем уже нарисованные точки
  if(drawAction==='add'&&vol?.geojson){
    try{
      const gj=JSON.parse(vol.geojson);
      const coords=gj.type==='FeatureCollection'
        ?gj.features.map(f=>[f.geometry.coordinates[1],f.geometry.coordinates[0]])
        :gj.geometry.type==='LineString'
          ?gj.geometry.coordinates.map(c=>[c[1],c[0]])
          :gj.geometry.type==='Polygon'
            ?gj.geometry.coordinates[0].slice(0,-1).map(c=>[c[1],c[0]])
            :[];
      drawPts=[...coords];
    }catch(e){drawPts=[];}
  } else {
    drawPts=[];
  }
  if(drawTmpLayer){try{map.removeLayer(drawTmpLayer);}catch(e){}drawTmpLayer=null;}
  closePanel();
  switchView('map');
  if(vol?.geojson){try{const g=L.geoJSON(JSON.parse(vol.geojson));map.fitBounds(g.getBounds().pad(.3));}catch(e){}}
  const isAdd=drawAction==='add'&&drawPts.length>0;
  const hint=isAdd?`Продолжаете рисование (уже ${drawPts.length} точек). ПКМ для меню.`:'Кликайте на карту. ПКМ для меню.';
  // Если продолжаем — не показываем диалог выбора типа, используем тот же тип
  const existType=vol?.geojson?( ()=>{try{const gj=JSON.parse(vol.geojson);return gj.type==='FeatureCollection'?'points':gj.geometry?.type==='LineString'?'line':'polygon';}catch(e){return'polygon';}} )():'polygon';
  if(isAdd){
    drawMode=existType;
    closeModal();
    document.getElementById('bnr-t').textContent=`🖊 Продолжение — ПКМ для меню`;
    document.getElementById('bnr').className='show draw';
    map.getContainer().style.cursor='crosshair';
    updateDrawPreview();
    toast(hint,'ok');
  } else {
    showModal('Тип геометрии',`<div class="draw-hint">📍 ${hint}<br>
      <strong>Правая кнопка мыши</strong> → меню рисования</div>
      <div class="fg"><label>Тип</label><select id="f-gtype">
        <option value="polygon" ${existType==='polygon'?'selected':''}>Полигон — площадь/контур</option>
        <option value="points" ${existType==='points'?'selected':''}>Точки — скважины, реперы</option>
        <option value="line" ${existType==='line'?'selected':''}>Линия — маршрут, трасса</option>
      </select></div>`,
      [{label:'Отмена',cls:'bs',fn:()=>{closeModal();if(siteId)selectSite(siteId);}},
       {label:'🖊 Начать',cls:'bp',fn:()=>{drawMode=v('f-gtype')||'polygon';closeModal();document.getElementById('bnr-t').textContent=`🖊 ПКМ для меню`;document.getElementById('bnr').className='show draw';map.getContainer().style.cursor='crosshair';toast('Кликайте · ПКМ = меню','ok');}}]);
  }
}

function addDrawPt(ll){
  if(!drawMode)return;
  const snap=_snapToKml(ll,20);
  drawPts.push([snap.lat,snap.lng]);
  drawPtNames.push(snap.snapped&&snap.name?snap.name:'');
  if(snap.snapped)toast(snap.name?`📌 Привязано: ${snap.name}`:'📌 Привязано к KML','ok');
  updateDrawPreview();
}
function _snapToKml(ll,pxRadius){
  if(!window.map||!lGroups)return{lat:ll.lat,lng:ll.lng,snapped:false,name:''};
  const T=map.latLngToContainerPoint(ll);
  let bestPx=null,bestDist=pxRadius,bestName='';

  // Pass 1: point features (highest priority)
  for(const layerId in lGroups){
    const g=lGroups[layerId];
    if(!g||!map.hasLayer(g))continue;
    g.eachLayer(sub=>{
      if(typeof sub.getLatLng==='function'){
        const p=map.latLngToContainerPoint(sub.getLatLng());
        const d=Math.hypot(p.x-T.x,p.y-T.y);
        if(d<bestDist){
          bestDist=d;bestPx=p;
          const props=sub.feature&&sub.feature.properties;
          bestName=(props&&(props.name||props.Name||props.label||props.Label||props.title||props.id||props.ID))||'';
        }
      }
    });
  }
  if(bestPx){const s=map.containerPointToLatLng(bestPx);return{lat:s.lat,lng:s.lng,snapped:true,name:String(bestName)};}

  // Pass 2: polygon/line vertices
  bestDist=pxRadius;
  for(const layerId in lGroups){
    const g=lGroups[layerId];
    if(!g||!map.hasLayer(g))continue;
    g.eachLayer(sub=>{
      if(typeof sub.getLatLngs==='function'){
        const flat=sub.getLatLngs().flat(2);
        for(const latlng of flat){
          const A=map.latLngToContainerPoint(latlng);
          const d=Math.hypot(A.x-T.x,A.y-T.y);
          if(d<bestDist){bestDist=d;bestPx=A;bestName='';}
        }
      }
    });
  }
  if(bestPx){const s=map.containerPointToLatLng(bestPx);return{lat:s.lat,lng:s.lng,snapped:true,name:''};}

  // Pass 3: closest point on line segments
  bestDist=pxRadius;
  for(const layerId in lGroups){
    const g=lGroups[layerId];
    if(!g||!map.hasLayer(g))continue;
    g.eachLayer(sub=>{
      if(typeof sub.getLatLngs==='function'){
        const flat=sub.getLatLngs().flat(2);
        for(let i=0;i<flat.length-1;i++){
          const A=map.latLngToContainerPoint(flat[i]);
          const B=map.latLngToContainerPoint(flat[i+1]);
          const dx=B.x-A.x,dy=B.y-A.y,len2=dx*dx+dy*dy;
          if(len2>0){
            const t=Math.max(0,Math.min(1,((T.x-A.x)*dx+(T.y-A.y)*dy)/len2));
            const cx=A.x+t*dx,cy=A.y+t*dy;
            const d=Math.hypot(cx-T.x,cy-T.y);
            if(d<bestDist){bestDist=d;bestPx={x:cx,y:cy};bestName='';}
          }
        }
      }
    });
  }
  if(bestPx){const s=map.containerPointToLatLng(bestPx);return{lat:s.lat,lng:s.lng,snapped:true,name:''};}
  return{lat:ll.lat,lng:ll.lng,snapped:false,name:''};
}
function updateDrawPreview(){
  if(drawTmpLayer){map.removeLayer(drawTmpLayer);drawTmpLayer=null;}
  const pts=drawPts;if(!pts.length)return;
  // цвет берём из drawVolData (сохранён до closePanel) или из currentObj если панель ещё открыта
  const vol=drawVolData||(currentObj?.volumes||[]).find(x=>x.id===drawVolId);
  const color=vol?.color||'#0891b2';
  if(drawMode==='points'){
    drawTmpLayer=L.layerGroup(pts.map(p=>L.circleMarker(p,{radius:7,fillColor:color,color:'#fff',weight:2,fillOpacity:.9}))).addTo(map);
  }else if(drawMode==='polygon'&&pts.length>=2){
    drawTmpLayer=L.polygon(pts,{color,weight:2.5,fillOpacity:.2}).addTo(map);
  }else if(drawMode==='line'&&pts.length>=2){
    drawTmpLayer=L.polyline(pts,{color,weight:3}).addTo(map);
  }
}
function undoDrawPt(){if(!drawPts.length){toast('Нет точек','err');return;}drawPts.pop();updateDrawPreview();toast(`Отменена точка. Осталось: ${drawPts.length}`,'ok');}
async function finishDraw(){
  if(!drawMode||!drawPts.length){cancelDraw();return;}
  const pts=drawPts;let gj;
  if(drawMode==='points'){gj={type:'FeatureCollection',features:pts.map((p,i)=>({type:'Feature',geometry:{type:'Point',coordinates:[p[1],p[0]]},properties:drawPtNames[i]?{name:drawPtNames[i]}:{}}))}}
  else if(drawMode==='polygon'){const cl=[...pts,pts[0]];gj={type:'Feature',geometry:{type:'Polygon',coordinates:[cl.map(p=>[p[1],p[0]])]},properties:{}};}
  else{gj={type:'Feature',geometry:{type:'LineString',coordinates:pts.map(p=>[p[1],p[0]])},properties:{}};}
  const sid=drawSiteId;
  const volId=drawVolId;
  const factId=drawingFactId;
  drawingFactId=null;
  endDraw();
  // ── Сохраняем геометрию ──────────────────────────────────────────────────
  if(factId){
    // Факт выполнения: PUT только geojson (остальные поля server сохраняет)
    const r=await fetch(`${API}/vol_progress/${factId}`,{method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({geojson:JSON.stringify(gj)})});
    if(!r.ok){toast('Ошибка сохранения: '+r.status,'err');return;}
    toast(`Контур факта сохранён (${pts.length} точек)`,'ok');
  } else {
    // Объём: PUT с полными данными
    if(!sid||!volId){toast('Ошибка: объект не найден','err');return;}
    const fresh=await fetch(`${API}/sites/${sid}`).then(r=>r.json());
    const vol=(fresh.volumes||[]).find(x=>x.id===volId);
    if(!vol){toast('Объём не найден','err');return;}
    const r=await fetch(`${API}/volumes/${volId}`,{method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({category:vol.category,name:vol.name,amount:vol.amount,
        unit:vol.unit,color:vol.color||'#1a56db',
        plan_start:vol.plan_start||null,plan_end:vol.plan_end||null,
        notes:vol.notes||'',geojson:JSON.stringify(gj)})});
    if(!r.ok){toast('Ошибка сохранения: '+r.status,'err');return;}
    toast(`Контур объёма сохранён (${pts.length} точек)`,'ok');
  }
  // ── Обновляем карту и панель ──────────────────────────────────────────────
  const updated=await fetch(`${API}/sites/${sid}`).then(r=>r.json());
  currentObj=updated; currentType='site'; activeSiteId=sid;
  // Сначала рисуем слои на карте
  renderVolumesOnMap(updated.volumes||[]);
  renderVpLayers(updated.vol_progress||[]);
  renderMachineMarkers(updated.bases||[]);
  // Затем открываем панель (сдвигает карту, но слои уже добавлены)
  if(!document.getElementById('panel').classList.contains('open')){
    openPanel(false);
    setupSiteTabs();
  }
  // Возвращаемся на вкладку объёмов
  currentTab='volumes';
  if(factId&&volId)volExpanded[volId]=true;
  document.querySelectorAll('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.t==='volumes'));
  renderTab(); renderSidebar();
}
function cancelDraw(){const sid=drawSiteId;toast('Рисование отменено','ok');endDraw();if(sid)selectSite(sid);}
function endDraw(){
  if(drawTmpLayer){try{map.removeLayer(drawTmpLayer);}catch(e){}drawTmpLayer=null;}
  drawMode=null;drawPts=[];drawPtNames=[];drawVolId=null;drawSiteId=null;
  document.getElementById('bnr').className='';map.getContainer().style.cursor='';
}

// ═══════════════════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════════════════
function openAddProgModal(){
  showModal('Добавить прогресс',`<div class="fgr">
    <div class="fg s2"><label>Вид работ *</label><input id="f-wt" list="wtl" placeholder="Скважины пробурены"><datalist id="wtl"><option>Скважины пробурены</option><option>Гектары съёмки</option><option>Геологические пробы</option><option>КМ маршрута</option><option>Шурфы</option></datalist></div>
    <div class="fg"><label>Выполнено</label><input id="f-dn" type="number" value="0" step="any"></div>
    <div class="fg"><label>Всего (план)</label><input id="f-tt" type="number" value="0" step="any"></div>
    <div class="fg s2"><label>Единица</label><input id="f-u" value="шт"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:saveProg}]);
}
function openEditProgModal(id){
  const p=(currentObj?.progress||[]).find(x=>x.id===id);if(!p)return;
  showModal('Редактировать прогресс',`<div class="fgr">
    <div class="fg s2"><label>Вид работ *</label><input id="f-wt" value="${esc(p.work_type)}"></div>
    <div class="fg"><label>Выполнено</label><input id="f-dn" type="number" value="${p.completed}" step="any"></div>
    <div class="fg"><label>Всего</label><input id="f-tt" type="number" value="${p.total}" step="any"></div>
    <div class="fg s2"><label>Единица</label><input id="f-u" value="${esc(p.unit)}"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(p.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveProg(id)}]);
}
async function saveProg(id){
  const wt=v('f-wt').trim();if(!wt){toast('Укажите вид работ','err');return;}
  const data={work_type:wt,completed:parseFloat(v('f-dn'))||0,total:parseFloat(v('f-tt'))||0,unit:v('f-u')||'шт',notes:v('f-nt'),site_id:currentObj.id,user_name:un()};
  if(id)await fetch(`${API}/progress/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/sites/${currentObj.id}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function deleteProg(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/progress/${id}`,'Прогресс удалён',refreshCurrent);}
async function recalcPct(){
  const pp=currentObj?.progress||[];if(!pp.length){toast('Нет данных прогресса','err');return;}
  const pcts=pp.filter(p=>p.total>0).map(p=>(p.completed/p.total)*100);
  if(!pcts.length){toast('Нет плановых значений','err');return;}
  const avg=Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
  const s=currentObj;
  await fetch(`${API}/sites/${s.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...s,completion_percent:avg,user_name:un()})});
  await loadAll();await refreshCurrent();toast(`Готовность: ${avg}%`,'ok');
}

// ═══════════════════════════════════════════════════════════
// ЗАДАЧИ
// ═══════════════════════════════════════════════════════════
function tabTasks(pb){
  const tasks=currentObj?.tasks||[];
  const open=tasks.filter(t=>t.status!=='done');
  const done=tasks.filter(t=>t.status==='done');
  const today=new Date().toISOString().split('T')[0];
  const taskRow=t=>{
    const overdue=t.due_date&&t.due_date<today&&t.status!=='done';
    const soon=t.due_date&&t.due_date>=today&&t.due_date<=new Date(Date.now()+3*86400000).toISOString().split('T')[0]&&t.status!=='done';
    const doneStyle=t.status==='done'?'opacity:.55;text-decoration:line-through;':'';
    return`<div class="li" style="${doneStyle}${overdue?'border-left:3px solid var(--red);':''}">
      <button onclick="toggleTask('${t.id}')" style="font-size:18px;background:none;border:none;cursor:pointer;flex-shrink:0;padding:0">${t.status==='done'?'✅':'⬜'}</button>
      <div class="lim">
        <div class="lin">${esc(t.title)}${overdue?` <span style="color:var(--red);font-size:9px;font-weight:700">🚨ПРОСРОЧЕНО</span>`:''}${soon&&!overdue?` <span style="color:var(--ylw);font-size:9px;font-weight:700">⚠️СКОРО</span>`:''}</div>
        ${t.description?`<div class="lis">${esc(t.description)}</div>`:''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">
          ${t.responsible?`<span style="font-size:9px;color:var(--tx2)">👤 ${esc(t.responsible)}</span>`:''}
          ${t.due_date?`<span style="font-size:9px;color:${overdue?'var(--red)':soon?'var(--ylw)':'var(--tx3)'}">📅 ${fmt(t.due_date)}</span>`:''} ${t.closed_by&&t.status==='done'?`<span style="font-size:9px;color:var(--tx3)">✅ ${esc(t.closed_by)} ${t.closed_at?fmt(t.closed_at):''}</span>`:''}
        </div>
      </div>
      <div class="lia">
        <button class="btn bs bxs" onclick="openEditTaskModal('${t.id}')">✏️</button>
        <button class="btn bd bxs" onclick="deleteTask('${t.id}')">🗑</button>
      </div>
    </div>`;
  };
  pb.innerHTML=`<div class="sch"><h4>✅ Задачи (${open.length} откр. · ${done.length} выполн.)</h4>
    <button class="btn bp bsm" onclick="openAddTaskModal()">＋ Задача</button></div>
  ${open.map(taskRow).join('')}
  ${done.length?`<div style="font-size:9px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--tx3);margin:10px 0 5px">Выполненные (${done.length})</div>`:''}
  ${done.map(taskRow).join('')}
  ${!tasks.length?'<div class="empty"><div class="empty-i">✅</div>Нет задач</div>':''}`;
}

async function openAddTaskModal(){
  if(!pgkWorkers||pgkWorkers.length===0){
    try{const d=await fetch(`${API}/pgk/workers/summary`).then(r=>r.json());pgkWorkers=Array.isArray(d)?d:[];}catch(e){}
  }
  const wOpts='<option value="">— не назначено —</option>'+(pgkWorkers||[]).map(w=>`<option value="${esc(w.name)}">${esc(w.name)}</option>`).join('');
  showModal('Новая задача',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-tt" placeholder="Например: Сдать отчёт"></div>
    <div class="fg s2"><label>Описание</label><textarea id="f-td" rows="2"></textarea></div>
    <div class="fg"><label>Ответственный</label><select id="f-tr">${wOpts}</select></div>
    <div class="fg"><label>Срок</label><input id="f-td2" type="date"></div>
    <div class="fg s2"><label>Приоритет</label><select id="f-tp"><option value="normal">Обычный</option><option value="high">Высокий</option><option value="low">Низкий</option></select></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Создать',cls:'bp',fn:saveTask}]);
}
function openEditTaskModal(id){
  const t=(currentObj?.tasks||[]).find(x=>x.id===id);if(!t)return;
  const wOpts='<option value="">— не назначено —</option>'+(pgkWorkers||[]).map(w=>`<option value="${esc(w.name)}"${t.responsible===w.name?' selected':''}>${esc(w.name)}</option>`).join('');
  showModal('Редактировать задачу',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-tt" value="${esc(t.title)}"></div>
    <div class="fg s2"><label>Описание</label><textarea id="f-td" rows="2">${esc(t.description||'')}</textarea></div>
    <div class="fg"><label>Ответственный</label><select id="f-tr">${wOpts}</select></div>
    <div class="fg"><label>Срок</label><input id="f-td2" type="date" value="${t.due_date||''}"></div>
    <div class="fg s2"><label>Приоритет</label><select id="f-tp"><option value="normal"${t.priority==='normal'?' selected':''}>Обычный</option><option value="high"${t.priority==='high'?' selected':''}>Высокий</option><option value="low"${t.priority==='low'?' selected':''}>Низкий</option></select></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveTask(id)}]);
}
async function saveTask(id){
  const title=v('f-tt').trim();if(!title){toast('Введите название','err');return;}
  const data={title,description:v('f-td'),responsible:v('f-tr'),due_date:v('f-td2')||null,priority:v('f-tp')||'normal',user_name:un()};
  const siteId=currentObj.id;
  try{
    let resp;
    if(id){
      resp=await fetch(`${API}/tasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    } else {
      resp=await fetch(`${API}/sites/${siteId}/tasks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    }
    if(!resp.ok){toast('Ошибка сервера: '+resp.status,'err');return;}
  }catch(e){toast('Ошибка связи с сервером','err');return;}
  closeModal();
  // Перезагружаем данные объекта и остаёмся на вкладке задач
  try{
    const r=await fetch(`${API}/sites/${siteId}`);
    if(r.ok){
      currentObj=await r.json();
      // Update open_tasks count in sites array so sidebar badge updates
      const si=sites.findIndex(s=>s.id===siteId);
      if(si>=0)sites[si].open_tasks=(currentObj.tasks||[]).filter(t=>t.status!=='done').length;
      currentTab='tasks';
      document.querySelectorAll('.ptab').forEach(t=>{
        t.classList.toggle('on',t.dataset.t==='tasks');
      });
      renderTab();renderSidebar();
    }
  }catch(e){toast('Ошибка загрузки','err');}
  toast(id?'Обновлено':'Задача создана','ok');
}
async function deleteTask(id){
  if(!confirm('Удалить задачу?'))return;
  await apiDelUndo(`/tasks/${id}`,'Задача удалена',refreshCurrent);
}
async function toggleTask(id){
  const t=(currentObj?.tasks||[]).find(x=>x.id===id);if(!t)return;
  const newStatus=t.status==='done'?'open':'done';
  const siteId=currentObj.id;
  const today=new Date().toISOString().split('T')[0];
  const me=un();

  // If closing (marking done) someone else's task — ask for confirmation
  const norm = s => (s||'').trim().toLowerCase();
  const isMyTask = !t.responsible || t.responsible.trim()==='' || norm(t.responsible) === norm(me);

  const doClose = async () => {
    const extra=newStatus==='done'?{closed_by:me,closed_at:today}:{closed_by:null,closed_at:null};
    await fetch(`${API}/tasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...t,...extra,status:newStatus,user_name:me})});
    try{
      const r=await fetch(`${API}/sites/${siteId}`);
      if(r.ok){
        currentObj=await r.json();
        const si=sites.findIndex(s=>s.id===siteId);
        if(si>=0)sites[si].open_tasks=(currentObj.tasks||[]).filter(t=>t.status!=='done').length;
        currentTab='tasks';renderTab();renderSidebar();
      }
    }catch(e){}
  };

  if(newStatus==='done' && !isMyTask){
    showModal(
      '⚠️ Закрытие чужой задачи',
      `<div style="text-align:center;padding:14px 4px">
        <div style="font-size:36px;margin-bottom:10px">🔒</div>
        <div style="font-size:14px;font-weight:800;color:#dc2626;margin-bottom:10px">ВЫ ТОЧНО ХОТИТЕ ЗАКРЫТЬ ЧУЖУЮ ЗАДАЧУ?</div>
        <div style="font-size:12px;color:var(--tx2);background:var(--s2);padding:8px;border-radius:6px">
          Задача назначена: <strong>${esc(t.responsible)}</strong><br>
          <span style="color:var(--tx3);font-size:10px">«${esc(t.title)}»</span>
        </div>
      </div>`,
      [
        {label:'Нет, отмена', cls:'bs', fn:()=>closeModal()},
        {label:'Да, закрыть', cls:'dan', fn:async()=>{closeModal();await doClose();}}
      ]
    );
    return;
  }
  await doClose();
}



// ═══════════════════════════════════════════════════════════
// СМГ — СУТОЧНО-МЕСЯЧНЫЙ ГРАФИК (авто из объёмов + прогресса)
// ═══════════════════════════════════════════════════════════
let smgSiteId=null, smgYear=new Date().getFullYear(), smgMonth=new Date().getMonth();
let smgSiteData=null; // кэш данных выбранного объекта
const SMG_MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

