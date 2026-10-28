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
  ${typeof siteForecastHtml==='function'?siteForecastHtml(s):''}
  <div style="display:flex;gap:3px;flex-wrap:wrap">
    <button class="btn bp bsm" onclick="openEditSiteModal('${s.id}')">✏️ Ред.</button>
    <button class="btn bs bsm" onclick="openAssignBasesModal('${s.id}')">🔗 Базы</button>
    <button class="btn bs bsm" onclick="exportExcel('${s.id}')">📤 Excel</button>
    <button class="btn bs bsm" onclick="openHtmlExportModal('${s.id}')">📄 HTML</button>
    <button class="btn bs bsm" onclick="exportVolumesDXF('${s.id}')">📐 DXF</button>
    <button class="btn bs bsm" onclick="siteDowntime('${s.id}')" title="Записать простой из-за погоды в журнал объекта">⛔ Простой</button>
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

// Вкладка «Объёмы», выполнение, «Выполнение за день» — vol-layers.js
