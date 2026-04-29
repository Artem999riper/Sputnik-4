function tabSiteOv(pb){
  const s=currentObj;
  const dl=s.end_date?Math.ceil((new Date(s.end_date)-new Date())/86400000):null;
  const allM=(s.bases||[]).flatMap(b=>b.machinery||[]);
  const brk=allM.filter(m=>m.status==='broken');
  let al='';
  if(dl!==null&&dl<0)al+=`<div class="al-c">🚨 Просрочено на ${Math.abs(dl)} дн.</div>`;
  else if(dl!==null&&dl<8)al+=`<div class="al-w">⚠️ До сдачи ${dl} дн.</div>`;
  if(brk.length)al+=`<div class="al-c">🔴 Сломано: ${brk.map(m=>esc(m.name)).join(', ')}</div>`;
  pb.innerHTML=`${al}<div class="ic full ac" style="margin-bottom:8px">
    <div class="icl">Готовность</div>
    <div style="display:flex;align-items:flex-end;gap:9px">
      <div class="icvb">${s.completion_percent}%</div>
      <div style="flex:1;margin-bottom:5px"><div class="pbt" style="height:9px"><div class="pbf" style="width:${s.completion_percent}%"></div></div></div>
    </div></div>
  <div class="igrid">
    ${s.client?`<div class="ic"><div class="icl">Заказчик</div><div class="icv" style="font-size:11px">${esc(s.client)}</div></div>`:''}
    ${s.address?`<div class="ic"><div class="icl">Адрес</div><div class="icv" style="font-size:11px">${esc(s.address)}</div></div>`:''}
    ${s.start_date?`<div class="ic"><div class="icl">Начало</div><div class="icv">${fmt(s.start_date)}</div></div>`:''}
    ${s.end_date?`<div class="ic ${dl!==null&&dl<8?'ac':''}"><div class="icl">Срок</div><div class="icv">${fmt(s.end_date)}</div></div>`:''}
    <div class="ic"><div class="icl">Баз</div><div class="icv">${(s.bases||[]).length}</div></div>
    <div class="ic"><div class="icl">Персонал</div><div class="icv">${(s.bases||[]).reduce((a,b)=>a+(b.workers||[]).length,0)} чел.</div></div>
    <div class="ic"><div class="icl">Техника</div><div class="icv">${allM.length} ед.</div></div>
  </div>
  ${s.notes?`<div class="ic full" style="margin-bottom:8px"><div class="icl">Примечания</div><div style="font-size:11px;color:var(--tx2);margin-top:2px">${esc(s.notes)}</div></div>`:''}
  <div style="display:flex;gap:3px;flex-wrap:wrap">
    <button class="btn bp bsm" onclick="openEditSiteModal('${s.id}')">✏️ Ред.</button>
    <button class="btn bs bsm" onclick="openAssignBasesModal('${s.id}')">🔗 Базы</button>
    <button class="btn bs bsm" onclick="exportExcel('${s.id}')">📤 Excel</button>
    <button class="btn bs bsm" onclick="openHtmlExportModal('${s.id}')">📄 HTML</button>
    <button class="btn bs bsm" onclick="exportVolumesDXF('${s.id}')">📐 DXF</button>
    <button class="btn bd bsm" onclick="deleteSite('${s.id}')">🗑</button>
  </div>`;
}

function tabSiteBases(pb){
  const bs=currentObj?.bases||[];
  pb.innerHTML=`<div class="sch"><h4>🏕 Базы (${bs.length})</h4><button class="btn bb bsm" onclick="openAssignBasesModal('${currentObj.id}')">🔗 Изменить</button></div>
  ${bs.length?bs.map(b=>{
    const w=b.workers||[],m=b.machinery||[],mat=b.materials||[];
    return`<div class="bblk">
      <div class="bblk-hd" onclick="this.classList.toggle('cld');this.nextElementSibling.classList.toggle('hid')">
        <span style="font-size:16px">🏕</span><div class="bbn">${esc(b.name)}<div style="font-size:9px;color:var(--tx2);font-weight:400">${w.length} чел. · ${m.length} техн.</div></div>
        <span class="bbarr">▼</span></div>
      <div class="bblk-bd">
        ${w.length?`<div class="bms"><h5>👷 Персонал</h5>${w.map(x=>{const mc=m.find(mm=>mm.id===x.machine_id);return`<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;font-size:11px">👤 <span style="flex:1">${esc(x.name)} <span style="color:var(--tx3)">${esc(x.role||'')}</span></span>${mc?`<span class="wmt">${MICONS[mc.type]||'🔧'} ${esc(mc.name)}</span>`:''}</div>`;}).join('')}</div>`:''}
        ${m.length?`<div class="bms"><h5>🚛 Техника</h5>${m.map(x=>`<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;font-size:11px">${MICONS[x.type]||'🔧'} <span style="flex:1">${esc(x.name)}</span><span class="badge ${x.status==='working'?'bw':x.status==='idle'?'bi':'br'}">${SL[x.status]}</span></div>`).join('')}</div>`:''}
        ${mat.length?`<div class="bms"><h5>📦 Материалы</h5>${mat.map(x=>`<div style="display:flex;justify-content:space-between;gap:6px;font-size:11px;margin-bottom:2px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${esc(x.name)}</span> <strong style="color:${x.min_amount>0&&x.amount<x.min_amount?'var(--red)':'var(--acc)'};flex-shrink:0">${x.amount} ${esc(x.unit)}</strong></div>`).join('')}</div>`:''}
        <button class="btn bb bxs" style="margin-top:5px" onclick="selectBase('${b.id}')">Открыть базу →</button>
      </div></div>`;
  }).join(''):'<div class="empty"><div class="empty-i">🏕</div>Нет баз</div>'}`;
}

function tabVolumes(pb){
  const vols=currentObj?.volumes||[];
  const prog=currentObj?.vol_progress||[];
  const totalVols=vols.length;
  const progVols=vols.filter(v=>{
    const done=(prog.filter(p=>p.volume_id===v.id)).reduce((a,p)=>a+(+p.completed||0),0);
    return v.amount>0&&done>=v.amount;
  }).length;

  pb.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:4px">
    <div><h4 style="font-size:13px;font-weight:800">📋 Объёмы (${totalVols})</h4>
      <div style="font-size:10px;color:var(--tx2)">Выполнено: ${progVols}/${totalVols}</div></div>
    <div style="display:flex;gap:4px">
      <button class="btn bg bsm" onclick="openVolSectionPicker()">＋ Добавить</button>
      <button class="btn bs bsm" onclick="recalcPctFromVols()">🔄 Обновить %</button>
    </div>
  </div>
  ${vols.length===0?'<div class="empty"><div class="empty-i">📋</div>Нет объёмов</div>':
    Object.entries(VOL_SECTIONS).map(([cat,sec])=>{
      const catVols=vols.filter(v=>v.category===cat);
      if(!catVols.length)return'';
      const catRows=catVols.map(vol=>{
        const vp=prog.filter(p=>p.volume_id===vol.id).slice().sort((a,b)=>a.work_date<b.work_date?1:-1);
        const done=vp.reduce((a,p)=>a+(+p.completed||0),0);
        const pct=vol.amount>0?Math.min(100,Math.round(done/vol.amount*100)):0;
        const isOpen=volExpanded&&volExpanded[vol.id];
        return`<div style="border:1.5px solid var(--bd);border-radius:var(--r);margin-bottom:8px;background:var(--s);overflow:hidden">
          <div style="padding:8px 10px;cursor:pointer" onclick="volToggleExpand('${vol.id}')">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <div style="width:10px;height:10px;border-radius:50%;background:${vol.color||'#1a56db'};flex-shrink:0"></div>
              <span style="font-size:12px;font-weight:700;flex:1">${esc(vol.name)}</span>
              <span style="font-size:11px;font-weight:700;color:${pct>=100?'var(--grn)':'var(--acc)'}">
                ${done}/${vol.amount} ${esc(vol.unit)} · ${pct}%
              </span>
              <span style="font-size:11px;color:var(--tx3)">${isOpen?'▲':'▼'}</span>
            </div>
            <div class="pbt"><div class="pbf" style="width:${pct}%;background:${pct>=100?'var(--grn)':'var(--acc)'}"></div></div>
            ${vol.plan_start?`<div style="font-size:9px;color:var(--tx3);margin-top:3px">📅 план: ${fmt(vol.plan_start)}${vol.plan_end?' — '+fmt(vol.plan_end):''}</div>`:''}
            ${pct>=100?'<span style="font-size:9px;background:var(--grnl);color:var(--grn);border-radius:8px;padding:1px 7px;font-weight:700;margin-top:3px;display:inline-block">✅ Выполнено</span>':''}
          </div>
          <div style="padding:0 10px 8px;display:flex;gap:3px;flex-wrap:wrap">
            <button class="btn bp bxs" onclick="openAddVolProgressModal('${vol.id}')">＋ Факт</button>
            <button class="btn bs bxs" onclick="openEditVolModal('${vol.id}')">✏️</button>
            <button class="btn bd bxs" onclick="deleteVol('${vol.id}')">🗑</button>
          </div>
          ${isOpen?`<div style="border-top:1px solid var(--bd)">
            ${vp.length===0
              ?'<div style="padding:8px 12px;font-size:11px;color:var(--tx3)">Нет записей факта</div>'
              :vp.map((p,idx)=>{
                return`<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--bd);background:${idx%2?'var(--s2)':'var(--s)'}">
                  <span style="font-size:10px;font-weight:700;color:var(--tx3);min-width:90px">📅 ${fmt(p.work_date)}</span>
                  <span style="font-size:11px;font-weight:700;color:var(--acc)">+${p.completed} ${esc(vol.unit)}</span>
                  <span style="font-size:10px;color:var(--tx3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.notes||'')}</span>
                  <button class="btn bg bxs" title="${vpVisible[p.id]===false?'Показать на карте':'Скрыть с карты'}" onclick="toggleVpVis('${p.id}','${vol.id}')">${vpVisible[p.id]===false?'👁':'🚫'}</button>
                  <button class="btn bg bxs" title="${p.geojson?'Перерисовать на карте':'Нарисовать на карте'}" onclick="startVpDraw('${p.id}','${vol.id}')">${p.geojson?'🖊 Ред.':'🗺 Нарисовать'}</button>
                  <button class="btn bs bxs" title="Редактировать факт" onclick="openEditVolFactModal('${p.id}','${vol.id}')">✏️</button>
                  <button class="btn bd bxs" onclick="deleteVolProgress('${p.id}','${vol.id}')">🗑</button>
                </div>`;
              }).join('')
            }
          </div>`:''}
        </div>`;
      }).join('');
      return`<div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:5px 8px;background:${sec.color}18;border-left:3px solid ${sec.color};border-radius:0 var(--rs) var(--rs) 0">
          <span style="font-size:14px">${sec.icon}</span>
          <span style="font-size:11px;font-weight:800;color:${sec.color};text-transform:uppercase;letter-spacing:.5px">${sec.label}</span>
          <span style="font-size:10px;color:var(--tx3);margin-left:auto">${catVols.length} объём${catVols.length===1?'':'ов'}</span>
        </div>
        ${catRows}
      </div>`;
    }).join('')
  }`;
}
let volExpanded={};
let volEditingFact=null;
function volToggleExpand(volId){
  volExpanded[volId]=!volExpanded[volId];
  renderTab();
}
async function saveVolFact(factId, volId){
  const d=document.getElementById('vfe-d-'+factId)?.value;
  const c=parseFloat(document.getElementById('vfe-c-'+factId)?.value)||0;
  const n=document.getElementById('vfe-n-'+factId)?.value||'';
  if(!d){toast('Укажите дату','err');return;}
  await fetch(`${API}/vol_progress/${factId}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({work_date:d,completed:c,notes:n})});
  volEditingFact=null;
  await refreshCurrent();
  await autoRecalcPct();
  currentTab='volumes';
  volExpanded[volId]=true;
  renderTab();
  toast('Сохранено','ok');
}


// ── Helpers for worker search in +Факт modals ──────────────────────────────
function _buildWorkerSelectHtml(selectedIds){
  const workers=pgkWorkers&&pgkWorkers.length?pgkWorkers:(currentObj?.workers||[]);
  const selSet=new Set((selectedIds||'').split(',').filter(Boolean));
  return`<div style="position:relative;margin-bottom:4px">
    <input id="f-vpwsearch" type="text" placeholder="🔍 Поиск сотрудника..." autocomplete="off"
      style="width:100%;box-sizing:border-box;font-size:11px;padding:4px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx)"
      oninput="filterVolWorkers()">
  </div>
  <select id="f-vpworkers" multiple style="width:100%;height:90px;font-size:11px">
    ${workers.map(w=>`<option value="${w.id}"${selSet.has(String(w.id))?' selected':''}>${esc(w.name)}${w.role?' — '+esc(w.role):''}</option>`).join('')}
  </select>
  <div style="font-size:9px;color:var(--tx3);margin-top:2px">Ctrl+клик для выбора нескольких</div>`;
}
function filterVolWorkers(){
  const q=(document.getElementById('f-vpwsearch')?.value||'').toLowerCase();
  const sel=document.getElementById('f-vpworkers');
  if(!sel)return;
  [...sel.options].forEach(o=>{
    o.style.display=(!q||o.text.toLowerCase().includes(q))?'':'none';
  });
}

// Add fact progress to a volume
function openAddVolProgressModal(volId){
  const vol=(currentObj?.volumes||[]).find(x=>x.id===volId);if(!vol)return;
  const today=new Date().toISOString().split('T')[0];
  const prog=currentObj?.vol_progress||[];
  const done=prog.filter(p=>p.volume_id===volId).reduce((a,p)=>a+(+p.completed||0),0);
  showModal('Добавить выполнение — '+esc(vol.name),`<div class="fgr fone">
    <div style="font-size:11px;color:var(--tx2);margin-bottom:8px">
      Плановый объём: <strong>${vol.amount} ${esc(vol.unit)}</strong> · Выполнено: <strong>${done} ${esc(vol.unit)}</strong>
    </div>
    <div class="fg"><label>Дата выполнения *</label><input id="f-vpd" type="date" value="${today}"></div>
    <div class="fg"><label>Выполнено (${esc(vol.unit)}) *</label><input id="f-vpc" type="number" step="any" value="0"></div>
    <div class="fg"><label>Сотрудники (необязательно)</label>${_buildWorkerSelectHtml('')}</div>
    <div class="fg"><label>Буровой инструмент (необязательно)</label>
      <select id="f-vpmach" style="width:100%;font-size:11px">
        <option value="">— не выбран —</option>
        ${pgkMachinery.filter(m=>DRILL_TYPES.includes(m.type)).map(m=>`<option value="${m.id}">${esc(m.name)} (${esc(m.type)})</option>`).join('')}
      </select>
    </div>
    <div class="fg"><label>Примечания</label><input id="f-vpn" placeholder="Комментарий..."></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const work_date=v('f-vpd');const completed=parseFloat(v('f-vpc'))||0;
    if(!work_date){toast('Укажите дату','err');return;}
    const _selWorkers=[...document.getElementById('f-vpworkers').selectedOptions];
    const _workerIds=_selWorkers.map(o=>o.value).join(',');
    const _workerNames=_selWorkers.map(o=>o.text).join(', ');
    const _machEl=document.getElementById('f-vpmach');
    const _machId=_machEl&&_machEl.value?_machEl.value:null;
    const _machName=_machId&&_machEl?_machEl.options[_machEl.selectedIndex].text:'';
    const _baseNotes=v('f-vpn');
    let _noteParts=[];
    if(_baseNotes)_noteParts.push(_baseNotes);
    if(_workerNames)_noteParts.push('Сотрудники: '+_workerNames);
    if(_machName)_noteParts.push('Буровая: '+_machName);
    const _finalNotes=_noteParts.join(' · ');
    const res=await fetch(`${API}/volumes/${volId}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({site_id:currentObj.id,work_date,completed,notes:_finalNotes,user_name:un(),
        worker_ids:_workerIds,machine_id:_machId||null})});
    if(!res.ok){toast('Ошибка сервера: '+res.status,'err');return;}
    closeModal();
    const updated=await fetch(`${API}/sites/${currentObj.id}`).then(r=>r.json());
    currentObj=updated;
    currentTab='volumes';
    volExpanded[volId]=true;
    document.querySelectorAll('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.t==='volumes'));
    renderTab();
    renderVpLayers(updated.vol_progress||[]);
    await autoRecalcPct();
    toast('Факт добавлен','ok');
  }}]);
}

// Edit existing fact (full modal like +Факт)
function openEditVolFactModal(factId, volId){
  const vol=(currentObj?.volumes||[]).find(x=>x.id===volId);if(!vol)return;
  const p=(currentObj?.vol_progress||[]).find(x=>x.id===factId);if(!p)return;
  // Parse existing notes back into parts
  const notes=p.notes||'';
  // Try to reconstruct: notes may contain "Сотрудники: ..." and "Буровая: ..."
  let baseNotes=notes,existingWorkerIds=p.worker_ids||'',existingMachId=p.machine_id||'';
  // Strip structured parts from display note
  baseNotes=baseNotes.replace(/\s*·?\s*Сотрудники:[^·]*/,'').replace(/\s*·?\s*Буровая:[^·]*/,'').trim().replace(/^·\s*/,'').replace(/\s*·$/,'').trim();

  showModal('✏️ Редактировать факт — '+esc(vol.name),`<div class="fgr fone">
    <div class="fg"><label>Дата выполнения *</label><input id="f-efd" type="date" value="${p.work_date||''}"></div>
    <div class="fg"><label>Выполнено (${esc(vol.unit)}) *</label><input id="f-efc" type="number" step="any" value="${p.completed||0}"></div>
    <div class="fg"><label>Сотрудники (необязательно)</label>${_buildWorkerSelectHtml(existingWorkerIds)}</div>
    <div class="fg"><label>Буровой инструмент (необязательно)</label>
      <select id="f-efmach" style="width:100%;font-size:11px">
        <option value="">— не выбран —</option>
        ${pgkMachinery.filter(m=>DRILL_TYPES.includes(m.type)).map(m=>`<option value="${m.id}"${m.id===existingMachId?' selected':''}>${esc(m.name)} (${esc(m.type)})</option>`).join('')}
      </select>
    </div>
    <div class="fg"><label>Примечания</label><input id="f-efn" value="${esc(baseNotes)}" placeholder="Комментарий..."></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'💾 Сохранить',cls:'bp',fn:async()=>{
    const work_date=document.getElementById('f-efd')?.value;
    const completed=parseFloat(document.getElementById('f-efc')?.value)||0;
    if(!work_date){toast('Укажите дату','err');return;}
    const _selWorkers=[...document.getElementById('f-vpworkers').selectedOptions];
    const _workerIds=_selWorkers.map(o=>o.value).join(',');
    const _workerNames=_selWorkers.map(o=>o.text).join(', ');
    const _machEl=document.getElementById('f-efmach');
    const _machId=_machEl&&_machEl.value?_machEl.value:null;
    const _machName=_machId&&_machEl?_machEl.options[_machEl.selectedIndex].text:'';
    const _baseNotes2=document.getElementById('f-efn')?.value||'';
    let _np=[];
    if(_baseNotes2)_np.push(_baseNotes2);
    if(_workerNames)_np.push('Сотрудники: '+_workerNames);
    if(_machName)_np.push('Буровая: '+_machName);
    const _finalNotes=_np.join(' · ');
    await fetch(`${API}/vol_progress/${factId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({work_date,completed,notes:_finalNotes,worker_ids:_workerIds,machine_id:_machId||null})});
    closeModal();
    const updated=await fetch(`${API}/sites/${currentObj.id}`).then(r=>r.json());
    currentObj=updated;
    currentTab='volumes';volExpanded[volId]=true;
    document.querySelectorAll('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.t==='volumes'));
    renderTab();renderVpLayers(updated.vol_progress||[]);
    await autoRecalcPct();
    toast('Факт обновлён','ok');
  }}]);
}

function openVolProgressHistoryModal(volId){
  const vol=(currentObj?.volumes||[]).find(x=>x.id===volId);if(!vol)return;
  const prog=(currentObj?.vol_progress||[]).filter(p=>p.volume_id===volId).sort((a,b)=>a.work_date>b.work_date?1:-1);
  const total=prog.reduce((a,p)=>a+(+p.completed||0),0);
  showModal('История выполнения — '+esc(vol.name),
    `<div style="font-size:11px;color:var(--tx2);margin-bottom:8px">Итого: <strong>${total}/${vol.amount} ${esc(vol.unit)}</strong></div>
    ${prog.map(p=>`<div class="li" style="padding:5px 8px">
      <div class="lim"><div class="lin">${fmt(p.work_date)} — <strong style="color:var(--acc)">${p.completed} ${esc(vol.unit)}</strong></div>
      ${p.notes?`<div class="lis">${esc(p.notes)}</div>`:''}</div>
      <div class="lia"><button class="btn bd bxs" onclick="deleteVolProgress('${p.id}','${volId}')">🗑</button></div>
    </div>`).join('')||'<div class="empty">Нет записей</div>'}`,
    [{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
async function deleteVolProgress(id,volId){
  if(!confirm('Удалить запись?'))return;
  await apiDelUndo(`/vol_progress/${id}`,'Запись удалена',async()=>{
    await refreshCurrent();currentTab='volumes';renderTab();
  });
  closeModal();openVolProgressHistoryModal(volId);
}

async function autoRecalcPct(){
  if(!currentObj||currentType!=='site')return;
  const vols=currentObj.volumes||[];
  const prog=currentObj.vol_progress||[];
  if(!vols.filter(v=>v.amount>0).length)return;
  const pcts=vols.filter(v=>v.amount>0).map(v=>{
    const done=prog.filter(p=>p.volume_id===v.id).reduce((a,p)=>a+(+p.completed||0),0);
    return Math.min(100,done/v.amount*100);
  });
  const avg=Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
  if(avg===currentObj.completion_percent)return;
  await fetch(`${API}/sites/${currentObj.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...currentObj,completion_percent:avg,user_name:un()})});
  currentObj.completion_percent=avg;
  renderSidebar();
}
async function recalcPctFromVols(){
  const vols=currentObj?.volumes||[];
  const prog=currentObj?.vol_progress||[];
  if(!vols.length){toast('Нет объёмов','err');return;}
  const pcts=vols.filter(v=>v.amount>0).map(v=>{
    const done=prog.filter(p=>p.volume_id===v.id).reduce((a,p)=>a+(+p.completed||0),0);
    return Math.min(100,done/v.amount*100);
  });
  if(!pcts.length){toast('Нет плановых объёмов','err');return;}
  const avg=Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
  await fetch(`${API}/sites/${currentObj.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...currentObj,completion_percent:avg,user_name:un()})});
  await loadAll();await refreshCurrent();toast(`Готовность обновлена: ${avg}%`,'ok');
}


function tabProgress(pb){
  const vols=currentObj?.volumes||[];
  const prog=currentObj?.vol_progress||[];
  if(!vols.length){
    pb.innerHTML=`<div class="empty"><div class="empty-i">📊</div>Сначала добавьте объёмы во вкладке «Объёмы»</div>`;
    return;
  }
  // Group progress by volume
  const rows=vols.map(vol=>{
    const vp=prog.filter(p=>p.volume_id===vol.id).sort((a,b)=>a.work_date>b.work_date?1:-1);
    const done=vp.reduce((a,p)=>a+(+p.completed||0),0);
    const pct=vol.amount>0?Math.min(100,Math.round(done/vol.amount*100)):0;
    return{vol,vp,done,pct};
  });
  const totalPct=rows.filter(r=>r.vol.amount>0).length?
    Math.round(rows.filter(r=>r.vol.amount>0).reduce((a,r)=>a+r.pct,0)/rows.filter(r=>r.vol.amount>0).length):0;

  pb.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div><span style="font-size:13px;font-weight:800">Общий прогресс: </span><span style="font-size:17px;font-weight:800;color:var(--acc)">${totalPct}%</span></div>
    <button class="btn bs bsm" onclick="recalcPctFromVols()">🔄 Обновить %</button>
  </div>
  ${rows.map(({vol,vp,done,pct})=>`<div style="background:var(--s);border:1.5px solid var(--bd);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <div style="width:10px;height:10px;border-radius:50%;background:${vol.color||'#1a56db'};flex-shrink:0"></div>
      <span style="font-size:12px;font-weight:700;flex:1">${esc(vol.name)}</span>
      <span style="font-size:10px;font-weight:700;color:${pct>=100?'var(--grn)':'var(--acc)'}">${done} / ${vol.amount} ${esc(vol.unit)} · ${pct}%</span>
      <button class="btn bp bxs" onclick="openAddVolProgressModal('${vol.id}')">＋</button>
    </div>
    <div class="pbt" style="margin-bottom:6px"><div class="pbf" style="width:${pct}%;background:${pct>=100?'var(--grn)':pct>50?'var(--acc)':'var(--acc)'}"></div></div>
    ${vp.slice(-3).reverse().map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;padding:2px 0;border-top:1px solid var(--bd)">
      <span style="color:var(--tx3)">📅 ${fmt(p.work_date)}</span>
      <span style="font-weight:700;color:var(--acc)">+${p.completed} ${esc(vol.unit)}</span>
      ${p.notes?`<span style="color:var(--tx3);flex:1;padding:0 6px;overflow:hidden;text-overflow:ellipsis">${esc(p.notes)}</span>`:''}
      <button style="background:none;border:none;cursor:pointer;font-size:10px;color:var(--tx3)" onclick="deleteVolProgress('${p.id}','${vol.id}')">✕</button>
    </div>`).join('')}
    ${vp.length>3?`<div style="font-size:9px;color:var(--tx3);text-align:right;padding-top:2px;cursor:pointer" onclick="openVolProgressHistoryModal('${vol.id}')">+ ещё ${vp.length-3} записей...</div>`:''}
  </div>`).join('')}`;
}


function tabLog(pb){
  const ll=currentObj?.log||[];
  pb.innerHTML=ll.map(l=>`<div class="lgr"><div class="lgt">${fmtDT(l.created_at)}</div>
    <div><div class="lga">${esc(l.action)}</div><div class="lgd">${esc(l.details||'')} <span style="color:var(--tx3)">· ${esc(l.user_name)}</span></div></div></div>`).join('')||'<div class="empty"><div class="empty-i">📋</div>Пусто</div>';
}

// ═══════════════════════════════════════════════════════════
// BASE PANEL TABS
// ═══════════════════════════════════════════════════════════
