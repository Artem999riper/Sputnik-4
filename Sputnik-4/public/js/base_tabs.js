function tabBaseOv(pb){
  const b=currentObj;
  pb.innerHTML=`<div class="ic full bc" style="margin-bottom:8px">
    <div class="icl">База</div><div class="icv">${esc(b.name)}</div>
    ${b.description?`<div style="font-size:11px;color:var(--tx2);margin-top:2px">${esc(b.description)}</div>`:''}</div>
  <div class="igrid">
    <div class="ic"><div class="icl">Персонал</div><div class="icv">${(b.workers||[]).length} чел.</div></div>
    <div class="ic"><div class="icl">Техника</div><div class="icv">${(b.machinery||[]).length} ед.</div></div>
    <div class="ic"><div class="icl">Оборудование</div><div class="icv">${(b.equipment||[]).length} ед.</div></div>
    <div class="ic"><div class="icl">Материалы</div><div class="icv">${(b.materials||[]).length} поз.</div></div>
  </div>
  <div style="display:flex;gap:3px;flex-wrap:wrap">
    <button class="btn bb bsm" onclick="openEditBaseModal('${b.id}')">✏️ Редактировать</button>
    <button class="btn bs bsm" onclick="if(bMarkers['${b.id}'])map.panTo([${b.lat},${b.lng}],{animate:true})">🗺 На карте</button>
    <button class="btn bd bsm" onclick="deleteBase('${b.id}')">🗑</button>
  </div>`;
}

function tabWorkers(pb){
  const ww=currentObj.workers||[];
  const today=new Date();
  let rows='';
  ww.forEach(function(w){
    const m=(currentObj.machinery||[]).find(function(x){return x.id===w.machine_id;});
    let days='';
    if(w.start_date){
      const d=Math.floor((today-new Date(w.start_date))/86400000);
      if(d>=0)days='<span style="background:var(--accl);color:var(--acc);border:1px solid var(--accm);border-radius:10px;font-size:9px;font-weight:700;padding:1px 6px;margin-left:4px">'+d+' дн. с '+fmt(w.start_date)+'</span>';
    }
    rows+='<div class="li">'
      +'<div style="font-size:17px">👤</div>'
      +'<div class="lim"><div class="lin">'+esc(w.name)+days+'</div>'
      +'<div class="lis">'+(esc(w.role)||'—')+(w.phone?' · 📞 '+esc(w.phone):'')+'</div>'
      +(m?'<div class="wmt">'+(MICONS[m.type]||'🔧')+' '+esc(m.name)+'</div>':'')
      +'</div>'
      +'<div class="lia">'
      +(w.start_date?'<button class="btn bp bxs" title="Завершить вахту" onclick="openEndShiftModal(\''+w.id+'\')" >🏁</button>':'')
      +'<button class="btn bg2 bxs" title="Перевести на другую базу" onclick="openTransferModal(\'worker\',\''+w.id+'\')">🔄</button>'
      +'<button class="btn bs bxs" onclick="openEditWorkerModal(\''+w.id+'\')">✏️</button>'
      +'<button class="btn bd bxs" onclick="delWorker(\''+w.id+'\')">🗑</button>'
      +'</div>'
      +'</div>';
  });
  pb.innerHTML='<div class="sch"><h4>👷 Персонал ('+ww.length+')</h4>'
    +'<button class="btn bp bsm" onclick="openAssignWorkerModal()">📋 Назначить</button></div>'
    +(rows||'<div class="empty"><div class="empty-i">👷</div>Нет персонала</div>');
}
function tabMachinery(pb){
  const mm=currentObj.machinery||[];
  pb.innerHTML=`<div class="sch"><h4>🚛 Техника (${mm.length})</h4><button class="btn bp bsm" onclick="openAssignMachModal()">📋 Назначить</button></div>
    <div style="margin-bottom:7px"><button class="btn bs bsm" onclick="enterPlaceMode()">📍 Расставить на карте</button></div>
  ${mm.map(m=>{const drs=(currentObj.workers||[]).filter(w=>w.machine_id===m.id);return`<div class="li">
    <div style="font-size:19px">${MICONS[m.type]||'🔧'}</div><div class="lim"><div class="lin">${esc(m.name)}</div>
    <div class="lis">${esc(m.type||'')} ${m.plate_number?'· '+esc(m.plate_number):''} ${m.lat?'· 📍':''}</div>
    ${drs.length?`<div class="wmt">👤 ${drs.map(d=>esc(d.name)).join(', ')}</div>`:''}
    ${(()=>{const d=(currentObj.machinery||[]).find(x=>x.id===m.drill_id);return d?`<div class="wmt" style="background:#fef3c7;border-color:#f59e0b;color:#92400e">⛏ ${esc(d.name)}</div>`:''})()}</div>
    <span class="badge ${m.status==='working'?'bw':m.status==='idle'?'bi':'br'}">${SL[m.status]}</span>
    <div class="lia">
      ${m.lat&&m.lng?`<button class="btn bg2 bxs" title="Найти на карте" onclick="flyToMach('${m.id}')">📍</button>`:''}
      <button class="btn bg2 bxs" title="Перевести на другую базу" onclick="openTransferModal('machine','${m.id}')">🔄</button>
      <button class="btn bs bxs" title="Показать историю перемещений" data-hist-id="${m.id}" onclick="showMachHistory('${m.id}')">🕐</button>
      <button class="btn bs bxs" onclick="openEditMachModal('${m.id}')">✏️</button>
      <button class="btn bd bxs" onclick="delMach('${m.id}')">🗑</button>
    </div>
  </div>`;}).join('')||'<div class="empty"><div class="empty-i">🚛</div>Нет техники</div>'}`;
}


function tabEquipment(pb){
  const ee=currentObj.equipment||[];
  pb.innerHTML=`<div class="sch"><h4>🔩 Оборудование (${ee.length})</h4><button class="btn bp bsm" onclick="openAssignEquipModal()">📋 Назначить</button></div>
  ${ee.map(e=>`<div class="li">
    <div style="font-size:18px">🔩</div><div class="lim"><div class="lin">${esc(e.name)}</div>
    <div class="lis">${esc(e.type||'—')} ${e.serial_number?'· S/N '+esc(e.serial_number):''}</div>
    ${e.notes?`<div class="lis">${esc(e.notes)}</div>`:''}</div>
    <span class="badge ${e.status==='working'?'bw':e.status==='idle'?'bi':'br'}">${SL[e.status]||e.status}</span>
    <div class="lia"><button class="btn bg2 bxs" title="Перевести" onclick="openTransferModal('equipment','${e.id}')">🔄</button><button class="btn bs bxs" onclick="openEditEquipModal('${e.id}')">✏️</button><button class="btn bd bxs" onclick="delEquip('${e.id}')">🗑</button></div>
  </div>`).join('')||'<div class="empty"><div class="empty-i">🔩</div>Нет оборудования</div>'}`;
}
function openAddEquipModal(){
  showModal('Новое оборудование',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" placeholder="GPS Trimble R10"></div>
    <div class="fg"><label>Тип</label><input id="f-t" placeholder="Геодезический прибор"></div>
    <div class="fg"><label>Серийный №</label><input id="f-sr"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="working">В работе</option><option value="idle">Не используется</option><option value="broken">Неисправно</option></select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:saveEquip}]);
}
function openEditEquipModal(id){
  const e=(currentObj.equipment||[]).find(x=>x.id===id);if(!e)return;
  showModal('Редактировать оборудование',`<div class="fgr">
    <div class="fg s2"><label>Название *</label><input id="f-n" value="${esc(e.name)}"></div>
    <div class="fg"><label>Тип</label><input id="f-t" value="${esc(e.type||'')}"></div>
    <div class="fg"><label>Серийный №</label><input id="f-sr" value="${esc(e.serial_number||'')}"></div>
    <div class="fg s2"><label>Статус</label><select id="f-st"><option value="working" ${e.status==='working'?'selected':''}>В работе</option><option value="idle" ${e.status==='idle'?'selected':''}>Не используется</option><option value="broken" ${e.status==='broken'?'selected':''}>Неисправно</option></select></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-nt">${esc(e.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>saveEquip(id)}]);
}
async function saveEquip(id){
  const name=v('f-n').trim();if(!name){toast('Введите название','err');return;}
  const data={name,type:v('f-t'),serial_number:v('f-sr'),status:v('f-st')||'working',notes:v('f-nt'),base_id:currentObj.id};
  if(id)await fetch(`${API}/pgk/equipment/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  else  await fetch(`${API}/pgk/equipment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  closeModal();await refreshCurrent();toast(id?'Обновлено':'Добавлено','ok');
}
async function delEquip(id){if(!confirm('Удалить?'))return;await apiDelUndo(`/pgk/equipment/${id}`,'Оборудование удалено',refreshCurrent);}

function tabMaterials(pb){
  const mm=currentObj.materials||[];
  const lw=mm.filter(m=>m.min_amount>0&&m.amount<m.min_amount).length;
  // Check for duplicates
  const nameCounts={};
  mm.forEach(m=>{ const k=(m.name||'').trim().toLowerCase()+'||'+(m.unit||'шт').trim().toLowerCase(); nameCounts[k]=(nameCounts[k]||0)+1; });
  const hasDupes=Object.values(nameCounts).some(c=>c>1);
  pb.innerHTML=`<div class="sch"><h4>📦 Материалы (${mm.length})</h4>
    <div style="display:flex;gap:5px">
      ${hasDupes?`<button class="btn bd bsm" onclick="mergeMaterials('${currentObj.id}')" title="Объединить позиции с одинаковым названием">🔀 Объединить дубли</button>`:''}
      <button class="btn bp bsm" onclick="openAddMatModal()">＋ Добавить</button>
    </div></div>
  ${lw?`<div class="al-w">⚠️ ${lw} поз. ниже минимума</div>`:''}
  ${mm.map(m=>{const pct=m.min_amount>0?Math.min(100,Math.round(m.amount/m.min_amount*70)):60;const cls=m.min_amount>0?(m.amount<m.min_amount?'#e02424':m.amount<m.min_amount*1.3?'#d97706':'#0e9f6e'):'#0e9f6e';const shortage=m.min_amount>0&&m.amount<m.min_amount?Math.round((m.min_amount-m.amount)*100)/100:0;
    return`<div class="li" style="flex-direction:column;gap:3px"><div style="display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden"><div style="font-size:16px;flex-shrink:0">📦</div>
      <div class="lim" style="min-width:0;flex:1;overflow:hidden"><div class="lin" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.name)}">${esc(m.name)}</div>${m.notes?`<div class="lis" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.notes)}">${esc(m.notes)}</div>`:''}</div>
      <div style="font-size:13px;font-weight:700;color:var(--acc);white-space:nowrap;flex-shrink:0">${m.amount} ${esc(m.unit)}</div>
    </div>
    <div style="display:flex;gap:3px;flex-wrap:wrap;padding-left:21px">
      <button class="btn bg bxs" title="Актуализировать остаток" onclick="openActualizeModal('${m.id}')">📝 Акт.</button>
      <button class="btn bs bxs" title="История актуализаций" onclick="openMatLogModal('${m.id}')">📋 История</button>
      <button class="btn bg2 bxs" title="Перевести на другую базу" onclick="openTransferModal('material','${m.id}')">🔄 Перевести</button>
      <button class="btn bs bxs" onclick="openEditMatModal('${m.id}')">✏️</button>
      <button class="btn bd bxs" onclick="delMat('${m.id}')">🗑</button>
    </div>${m.min_amount>0?`<div style="padding-left:21px"><div style="font-size:9px;color:${m.amount<m.min_amount?'var(--red)':'var(--tx3)'};margin-bottom:2px">Мин: ${m.min_amount} ${esc(m.unit)}${m.amount<m.min_amount?' · ⚠️ Не хватает: '+(m.min_amount-m.amount).toFixed(2)+' '+esc(m.unit):''}</div>
      <div style="height:3px;background:var(--s3);border-radius:2px"><div style="width:${pct}%;height:3px;background:${cls};border-radius:2px"></div></div></div>`:''}</div>`;}).join('')||'<div class="empty"><div class="empty-i">📦</div>Нет материалов</div>'}`;
}

// ═══════════════════════════════════════════════════════════
// PGK PAGE — все 4 вкладки + кнопки добавить
// ═══════════════════════════════════════════════════════════
