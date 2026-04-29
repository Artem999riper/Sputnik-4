function openVolCommentModal(volId){
  const vol=(currentObj?.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  showModal('💬 Комментарий — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div class="fg"><label>Комментарий / примечание</label>'
    +'<textarea id="f-vnotes" rows="4">'+esc(vol.notes||'')+'</textarea></div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'💾 Сохранить',cls:'bp',fn:async function(){
      const notes=document.getElementById('f-vnotes').value;
      await fetch(`${API}/volumes/${volId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...vol,notes})});
      closeModal();await refreshCurrent();renderTab();toast('Комментарий сохранён','ok');
    }}]);
}

let vertexEditLayerId=null, vertexEditMarkers=[];
// State shared with RCM handler
let _veCoords=null, _veGJ=null, _veId=null, _veIsVP=false, _veColor='#1a56db', _veUpdatePreview=null;

function startVolVertexEdit(volId){
  const vol=(currentObj?.volumes||[]).find(v=>v.id===volId);
  if(!vol||!vol.geojson){toast('Сначала нарисуйте контур','err');return;}
  let gj;
  try{gj=JSON.parse(vol.geojson);}catch(e){toast('Ошибка чтения геометрии','err');return;}
  stopVertexEdit();
  vertexEditLayerId=volId;
  switchView('map');
  const coords=[];
  function extractCoords(geom){
    if(!geom)return;
    if(geom.type==='Point'){coords.push(geom.coordinates);}
    else if(geom.type==='LineString'){geom.coordinates.forEach(c=>coords.push(c));}
    else if(geom.type==='Polygon'){if(geom.coordinates[0])geom.coordinates[0].forEach(c=>coords.push(c));}
    else if(geom.type==='MultiPolygon'){geom.coordinates.forEach(poly=>{if(poly[0])poly[0].forEach(c=>coords.push(c));});}
    else if(geom.type==='FeatureCollection'){(geom.features||[]).forEach(f=>extractCoords(f.geometry));}
    else if(geom.type==='Feature'){extractCoords(geom.geometry);}
  }
  extractCoords(gj);
  if(!coords.length){toast('Нет вершин для редактирования','err');return;}
  let previewLayer=null;
  function updatePreview(){
    if(previewLayer){try{map.removeLayer(previewLayer);}catch(e){}}
    try{previewLayer=L.geoJSON(gj,{
      style:{color:vol.color||'#1a56db',weight:2,opacity:.7,fillOpacity:.15,dashArray:'4 3'},
      pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:5,fillColor:'#1a56db',color:'#fff',weight:1.5,fillOpacity:.8});}
    }).addTo(map);previewLayer.bringToFront&&previewLayer.bringToFront();}catch(e){}
  }
  updatePreview();
  _veCoords=coords; _veGJ=gj; _veId=volId; _veIsVP=false;
  _veColor=vol.color||'#1a56db'; _veUpdatePreview=updatePreview;
  coords.forEach(function(c){ _addVertexMarker(c, volId, gj, coords, updatePreview, false); });
  vertexEditMarkers.push({_isPreview:true,remove:function(){if(previewLayer){try{map.removeLayer(previewLayer);}catch(e){}}}});
  toast('Тяните вершины. Двойной клик — удалить. ПКМ — меню действий.','ok');
}

function _addVertexMarker(c, volId, gj, coords, updatePreview, isVP){
  const color=isVP?'#7c3aed':'#1a56db';
  const mk=L.marker([c[1],c[0]],{
    draggable:true,
    icon:L.divIcon({className:'',iconSize:[14,14],iconAnchor:[7,7],
      html:'<div style="width:14px;height:14px;background:#fff;border:2.5px solid '+color+';border-radius:50%;cursor:move;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>'})
  }).addTo(map);
  mk.on('drag',function(){const ll=mk.getLatLng();c[0]=ll.lng;c[1]=ll.lat;updatePreview();});
  mk.on('dragend',function(){
    const ll=mk.getLatLng();c[0]=ll.lng;c[1]=ll.lat;
    updatePreview();
    if(!isVP) saveVertexEdit(volId,gj);
    else _saveVpVertex(volId,gj);
  });
  mk.on('dblclick',function(){
    const idx=coords.indexOf(c);
    if(idx>-1&&coords.length>3){coords.splice(idx,1);}
    updatePreview();
    if(!isVP) saveVertexEdit(volId,gj); else _saveVpVertex(volId,gj);
    try{map.removeLayer(mk);}catch(e){}
    const mi=vertexEditMarkers.indexOf(mk);
    if(mi>-1)vertexEditMarkers.splice(mi,1);
  });
  // insert before preview sentinel if it exists
  const pi=vertexEditMarkers.findIndex(m=>m._isPreview);
  if(pi>-1)vertexEditMarkers.splice(pi,0,mk); else vertexEditMarkers.push(mk);
  return mk;
}

async function _saveVpVertex(factId, gj){
  const idx=(currentObj&&currentObj.vol_progress||[]).findIndex(x=>x.id===factId);
  await fetch(`${API}/vol_progress/${factId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({geojson:JSON.stringify(gj)})}).catch(()=>{});
  if(idx>=0)currentObj.vol_progress[idx]={...currentObj.vol_progress[idx],geojson:JSON.stringify(gj)};
  renderVpLayers(currentObj&&currentObj.vol_progress||[]);
}

async function saveVertexEdit(volId,gj){
  const vol=(currentObj?.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  const r=await fetch(`${API}/volumes/${volId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...vol,geojson:JSON.stringify(gj)})});
  if(!r.ok){toast('Ошибка сохранения','err');return;}
  const geojsonStr=JSON.stringify(gj);
  const vIdx=(currentObj?.volumes||[]).findIndex(v=>v.id===volId);
  if(vIdx>=0)currentObj.volumes[vIdx]={...vol,geojson:geojsonStr};
}
function stopVertexEdit(){
  vertexEditMarkers.forEach(function(m){
    if(m._isPreview){m.remove();}
    else{try{map.removeLayer(m);}catch(e){}}
  });
  vertexEditMarkers=[];
  vertexEditLayerId=null;
  _veCoords=null; _veGJ=null; _veId=null; _veIsVP=false; _veUpdatePreview=null;
  if(currentObj){
    refreshCurrent().then(function(){
      renderVolumesOnMap(currentObj.volumes||[]);
      renderVpLayers(currentObj.vol_progress||[]);
      renderTab();
    });
  }
}

// Called from onMapRClick when vertexEditLayerId is set
function _handleVertexEditRCM(e){
  if(e.originalEvent)e.originalEvent.preventDefault();
  const clickPx=map.latLngToContainerPoint(e.latlng);
  const cx=e.originalEvent.clientX, cy=e.originalEvent.clientY;
  showCtx(cx,cy,[
    {i:'✅',l:'Закончить редактирование',f:function(){
      if(_veIsVP){stopVertexEdit();}
      else{saveVertexEdit(_veId,_veGJ).then(stopVertexEdit);}
    }},
    {i:'❌',l:'Удалить ближайшую вершину',f:function(){
      if(!_veCoords||_veCoords.length<=3){toast('Минимум 3 вершины','err');return;}
      let bestMk=null,bestDist=Infinity;
      vertexEditMarkers.forEach(function(mk){
        if(mk._isPreview||!mk.getLatLng)return;
        const p=map.latLngToContainerPoint(mk.getLatLng());
        const d=Math.hypot(p.x-clickPx.x,p.y-clickPx.y);
        if(d<bestDist){bestDist=d;bestMk=mk;}
      });
      if(!bestMk)return;
      const ll=bestMk.getLatLng();
      const idx=_veCoords.findIndex(c=>Math.abs(c[0]-ll.lng)<1e-9&&Math.abs(c[1]-ll.lat)<1e-9);
      if(idx>-1)_veCoords.splice(idx,1);
      try{map.removeLayer(bestMk);}catch(ex){}
      const mi=vertexEditMarkers.indexOf(bestMk);
      if(mi>-1)vertexEditMarkers.splice(mi,1);
      if(_veUpdatePreview)_veUpdatePreview();
      if(_veIsVP)_saveVpVertex(_veId,_veGJ); else saveVertexEdit(_veId,_veGJ);
    }},
    {i:'➕',l:'Добавить вершину здесь',f:function(){
      if(!_veCoords||!_veGJ)return;
      const T=clickPx;
      let bestSeg=-1,bestDist=Infinity;
      for(let i=0;i<_veCoords.length;i++){
        const j=(i+1)%_veCoords.length;
        const A=map.latLngToContainerPoint([_veCoords[i][1],_veCoords[i][0]]);
        const B=map.latLngToContainerPoint([_veCoords[j][1],_veCoords[j][0]]);
        const dx=B.x-A.x,dy=B.y-A.y,len2=dx*dx+dy*dy;
        if(len2===0)continue;
        const t=Math.max(0,Math.min(1,((T.x-A.x)*dx+(T.y-A.y)*dy)/len2));
        const d=Math.hypot(A.x+t*dx-T.x,A.y+t*dy-T.y);
        if(d<bestDist){bestDist=d;bestSeg=i;}
      }
      if(bestSeg<0)return;
      const newC=[e.latlng.lng,e.latlng.lat];
      _veCoords.splice(bestSeg+1,0,newC);
      _addVertexMarker(newC,_veId,_veGJ,_veCoords,_veUpdatePreview,_veIsVP);
      if(_veUpdatePreview)_veUpdatePreview();
      if(_veIsVP)_saveVpVertex(_veId,_veGJ); else saveVertexEdit(_veId,_veGJ);
    }}
  ]);
}

async function startVpVertexEdit(factId){
  const p=(currentObj&&currentObj.vol_progress||[]).find(x=>x.id===factId);
  if(!p||!p.geojson){toast('Нет контура для редактирования','err');return;}
  let gj; try{gj=JSON.parse(p.geojson);}catch(e){toast('Ошибка геометрии','err');return;}
  stopVertexEdit();
  vertexEditLayerId='vp_'+factId;
  switchView('map');
  const coords=[];
  function extractVpCoords(geom){
    if(!geom)return;
    if(geom.type==='Point'){coords.push(geom.coordinates);}
    else if(geom.type==='LineString'){geom.coordinates.forEach(c=>coords.push(c));}
    else if(geom.type==='Polygon'){if(geom.coordinates[0])geom.coordinates[0].forEach(c=>coords.push(c));}
    else if(geom.type==='FeatureCollection'){(geom.features||[]).forEach(f=>extractVpCoords(f.geometry));}
    else if(geom.type==='Feature'){extractVpCoords(geom.geometry);}
  }
  extractVpCoords(gj);
  if(!coords.length){toast('Нет вершин','err');return;}
  let previewLayer=null;
  function updatePreview2(){
    if(previewLayer){try{map.removeLayer(previewLayer);}catch(e){}}
    try{previewLayer=L.geoJSON(gj,{
      style:{color:'#7c3aed',weight:2,opacity:.7,fillOpacity:.15,dashArray:'4 3'},
      pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:5,fillColor:'#7c3aed',color:'#fff',weight:1.5,fillOpacity:.8})
    }).addTo(map);}catch(e){}
  }
  updatePreview2();
  _veCoords=coords; _veGJ=gj; _veId=factId; _veIsVP=true;
  _veColor='#7c3aed'; _veUpdatePreview=updatePreview2;
  coords.forEach(function(c){ _addVertexMarker(c,factId,gj,coords,updatePreview2,true); });
  vertexEditMarkers.push({_isPreview:true,remove:function(){if(previewLayer){try{map.removeLayer(previewLayer);}catch(e){}}}});
  toast('Тяните вершины факта. Двойной клик — удалить. ПКМ — меню действий.','ok');
}

// ═══════════════════════════════════════════════════════════
// ASSIGN FROM PGK TO BASE
// ═══════════════════════════════════════════════════════════
async function openAssignWorkerModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allWorkers=await fetch(`${API}/pgk/workers`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.workers||[]).map(w=>w.id));
  const avail=allWorkers.filter(w=>!assigned.has(w.id));
  if(!avail.length){toast('Все сотрудники уже назначены на эту базу или других нет','err');return;}
  const today=new Date().toISOString().split('T')[0];
  showModal('📋 Назначить сотрудника на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Сотрудник</label><select id="f-aw" style="width:100%">
        ${avail.map(w=>`<option value="${w.id}">${esc(w.name)} ${w.role?'— '+esc(w.role):''}</option>`).join('')}
      </select></div>
      <div class="fg"><label>Дата заезда</label><input id="f-asd" type="date" value="${today}"></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const wid=v('f-aw'),sd=v('f-asd');
      const w=allWorkers.find(x=>x.id===wid);if(!w)return;
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,base_id:currentObj.id,start_date:sd,status:'working',user_name:un()})});
      closeModal();await refreshCurrent();toast('Сотрудник назначен на вахту','ok');
    }}]);
}
async function openAssignMachModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allMach=await fetch(`${API}/pgk/machinery`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.machinery||[]).map(m=>m.id));
  const avail=allMach.filter(m=>!assigned.has(m.id)&&TRANSPORT_TYPES.includes(m.type));
  if(!avail.length){toast('Нет доступного транспорта. Добавьте в ПГК → Техника','err');return;}
  showModal('📋 Назначить технику на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Транспорт</label><select id="f-am" style="width:100%">
        ${avail.map(m=>`<option value="${m.id}">${MICONS[m.type]||'🚙'} ${esc(m.name)} ${m.plate_number?'· '+m.plate_number:''}</option>`).join('')}
      </select></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const mid=v('f-am');
      const m=allMach.find(x=>x.id===mid);if(!m)return;
      await fetch(`${API}/pgk/machinery/${mid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...m,base_id:currentObj.id,user_name:un()})});
      // Also assign any attached drill
      if(m.drill_id){
        const drill=allMach.find(x=>x.id===m.drill_id);
        if(drill)await fetch(`${API}/pgk/machinery/${m.drill_id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...drill,base_id:currentObj.id,user_name:un()})});
      }
      closeModal();await refreshCurrent();toast('Техника назначена','ok');
    }}]);
}
async function openAssignEquipModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allEquip=await fetch(`${API}/pgk/equipment`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.equipment||[]).map(e=>e.id));
  const avail=allEquip.filter(e=>!assigned.has(e.id));
  if(!avail.length){toast('Нет доступного оборудования. Добавьте в ПГК → Оборудование','err');return;}
  showModal('📋 Назначить оборудование на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Оборудование</label><select id="f-ae" style="width:100%">
        ${avail.map(e=>`<option value="${e.id}">${esc(e.name)} ${e.type?'— '+esc(e.type):''}</option>`).join('')}
      </select></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const eid=v('f-ae');
      const e=allEquip.find(x=>x.id===eid);if(!e)return;
      await fetch(`${API}/pgk/equipment/${eid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...e,base_id:currentObj.id})});
      closeModal();await refreshCurrent();toast('Оборудование назначено','ok');
    }}]);
}

let _personnelData=[];let _personnelSort={col:'days',asc:false};
function sortPersonnel(col,th){
  if(_personnelSort.col===col){_personnelSort.asc=!_personnelSort.asc;}
  else{_personnelSort={col,asc:col!=='days'};}
  _personnelData.sort(function(a,b){
    let va=a[col]||'',vb=b[col]||'';
    if(col==='days'){va=+a.field_days||0;vb=+b.field_days||0;}
    return (va<vb?-1:va>vb?1:0)*(_personnelSort.asc?1:-1);
  });
  // Re-render table body
  const tbody=document.querySelector('#personnel-report-table tbody');
  if(!tbody)return;
  tbody.innerHTML=_personnelData.map(function(w,i){
    return`<tr style="background:${i%2?'var(--s2)':'var(--s)'}${(w.field_days||0)>=30?';border-left:3px solid #f59e0b':''}">
      <td style="padding:4px 6px;font-weight:600">${esc(w.name)}</td>
      <td style="padding:4px 6px;color:var(--tx2)">${esc(w.role||'—')}</td>
      <td style="padding:4px 6px">${esc(w.base_name||'—')}</td>
      <td style="padding:4px 6px;color:var(--tx3)">${esc(w.machine_name||'—')}</td>
      <td style="padding:4px 6px;text-align:center;font-weight:700;color:${(w.field_days||0)>=30?'#92400e':(w.field_days||0)>0?'var(--acc)':'var(--tx3)'}">
        ${w.field_days!==null?(w.field_days+' дн.'):'—'}
      </td>
      <td style="padding:4px 6px;color:var(--tx3)">${esc(w.phone||'—')}</td>
    </tr>`;
  }).join('');
}


// ═══════════════════════════════════════════════════════════
// GLOBAL LOG
// ═══════════════════════════════════════════════════════════
async function openGLog(){
  const[users,log]=await Promise.all([fetch(`${API}/log/users`).then(r=>r.json()),fetch(`${API}/log`).then(r=>r.json())]);
  showModal('Журнал',`<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
    <label style="font-size:9px;font-weight:700;color:var(--tx3)">Польз.:</label>
    <select id="gl-u" style="background:var(--s2);border:1.5px solid var(--bd);border-radius:4px;font-size:11px;padding:2px 6px;outline:none" onchange="loadGLE()">
      <option value="">Все</option>${users.map(u=>`<option>${esc(u)}</option>`).join('')}
    </select></div>
    <div id="gl-e" style="max-height:420px;overflow-y:auto">${renderGLE(log)}</div>`,
    [{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
function renderGLE(log){return log.map(l=>`<div class="lgr"><div class="lgt">${fmtDT(l.created_at)}</div>
  <div>${l.site_name?`<div style="font-size:9px;color:var(--acc);font-weight:700">${esc(l.site_name)}</div>`:''}<div class="lga">${esc(l.action)}</div>
  <div class="lgd">${esc(l.details||'')} <span style="color:var(--tx3)">· ${esc(l.user_name)}</span></div></div></div>`).join('')||'<div class="empty">Пусто</div>';}
async function loadGLE(){const u=v('gl-u');const log=await fetch(`${API}/log${u?`?user=${encodeURIComponent(u)}`:''}`).then(r=>r.json());const el=document.getElementById('gl-e');if(el)el.innerHTML=renderGLE(log);}

// ═══════════════════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════════════════
async function exportExcel(siteId){
  toast('Готовлю Excel...','ok');
  const s=await fetch(`${API}/sites/${siteId}`).then(r=>r.json());
  const wb=XLSX.utils.book_new();
  const sh=(data,name)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),name);

  // Семантика хранится в notes как __SEM__:{"type":"...","data":{...}}\nтекст
  // Regex \{.*?\} не работает для вложенных объектов (захватывает только до первой '}').
  // Правильный способ: взять строку между '__SEM__:' и первым '\n', распарсить как JSON.
  const parseSem=notes=>{
    if(!notes)return{type:'',data:{},cleanNotes:''};
    if(!notes.startsWith('__SEM__:'))return{type:'',data:{},cleanNotes:notes};
    const rest=notes.slice(8); // длина '__SEM__:' = 8
    const nl=rest.indexOf('\n');
    const jsonStr=nl>=0?rest.slice(0,nl):rest;
    const cleanNotes=nl>=0?rest.slice(nl+1).trim():'';
    try{const p=JSON.parse(jsonStr);return{type:p.type||'',data:p.data||{},cleanNotes};}catch(e){}
    return{type:'',data:{},cleanNotes:notes};
  };
  const SEM_LABEL={borehole:'Скважина',pit:'Шурф',ggs:'Пункт ГГС',ogs:'Пункт ОГС',
    repere:'Репер',benchmark:'Марка',steel_angle:'Металлический уголок',other:'Другое'};

  // Карты ID→имя для работников и техники
  const wMap={},mMap={};
  (s.bases||[]).forEach(b=>{
    (b.workers||[]).forEach(w=>{wMap[w.id]=w.name;});
    (b.machinery||[]).forEach(m=>{mMap[m.id]=m.name;});
  });

  // ── Обзор ──────────────────────────────────────────────────
  sh([['ПурГеоКом — Объект'],[''],['Объект',s.name],['Заказчик',s.client||''],['Договор №',s.contract_number||''],
    ['Адрес',s.address||''],['Начало',fmt(s.start_date)],['Срок',fmt(s.end_date)],['Статус',SSL[s.status]||s.status],
    ['Готовность',s.completion_percent+'%'],['Баз',(s.bases||[]).length],
    ['Персонал',(s.bases||[]).reduce((a,b)=>a+(b.workers||[]).length,0)],
    ['Техника',(s.bases||[]).reduce((a,b)=>a+(b.machinery||[]).length,0)],['Примечания',s.notes||'']],'Обзор');

  // ── Базы ───────────────────────────────────────────────────
  sh([['База','Широта','Долгота','Персонал','Техника','Материалов','Описание'],
    ...(s.bases||[]).map(b=>[b.name,b.lat,b.lng,(b.workers||[]).length,(b.machinery||[]).length,(b.materials||[]).length,b.description||''])],'Базы');

  // ── Персонал ───────────────────────────────────────────────
  sh([['ФИО','Должность','База','Машина'],
    ...(s.bases||[]).flatMap(b=>(b.workers||[]).map(w=>{const m=(b.machinery||[]).find(x=>x.id===w.machine_id);return[w.name,w.role||'',b.name,m?m.name:'']}))],'Персонал');

  // ── Техника ────────────────────────────────────────────────
  sh([['Название','Тип','Госномер','Статус','База','Широта','Долгота'],
    ...(s.bases||[]).flatMap(b=>(b.machinery||[]).map(m=>[m.name,m.type||'',m.plate_number||'',SL[m.status]||m.status,b.name,m.lat||'',m.lng||'']))],'Техника');

  // ── Материалы ──────────────────────────────────────────────
  sh([['Материал','Кол-во','Ед.','Мин. запас','База'],
    ...(s.bases||[]).flatMap(b=>(b.materials||[]).map(m=>[m.name,m.amount,m.unit,m.min_amount,b.name]))],'Материалы');

  // ── Прогресс ───────────────────────────────────────────────
  sh([['Вид работ','Выполнено','Всего','Ед.','%','Примечания'],
    ...(s.progress||[]).map(p=>[p.work_type,p.completed,p.total,p.unit,p.total>0?Math.round(p.completed/p.total*100)+'%':'—',p.notes||''])],'Прогресс');

  // ── Объёмы (расширено: плановые даты, тип семантики, чистые примечания) ──
  sh([['Вид работ','Категория','Кол-во план.','Ед.','Нач. план','Оконч. план','Тип семантики','Геометрия','Примечания'],
    ...(s.volumes||[]).map(v=>{
      const sem=parseSem(v.notes);
      return[v.name,v.category==='geology'?'Геология':'Геодезия',
        v.amount,v.unit,fmt(v.plan_start),fmt(v.plan_end),
        SEM_LABEL[sem.type]||'',v.geojson?'Есть':'—',sem.cleanNotes];
    })],'Объёмы');

  // ── Карта объёмов (нужна и для семантики, и для выполнения) ──
  const volMap={};
  (s.volumes||[]).forEach(v=>{volMap[v.id]=v;});

  // ── Семантика объёмов (только точки с заполненным типом) ──
  // Семантика хранится в трёх местах:
  // 1. volumes.notes — __SEM__:... (openVolPointSemantics, для всего объёма)
  // 2. volumes.geojson → features[].properties.sem (openFeatureSemantics без vpId)
  // 3. vol_progress.geojson → features[].properties.sem (openFeatureSemantics с vpId — основной случай)
  const semRows=[['Объём','Дата записи','Категория','Тип','Глубина (м)','Диаметр (мм)','УГВ (м)','Дата','Исполнитель','Описание / Примечание']];

  const extractSemFromGJ=(gjStr,name,cat,dateLabel)=>{
    if(!gjStr)return;
    try{
      const gj=JSON.parse(gjStr);
      const features=gj.type==='FeatureCollection'?gj.features:(gj.type==='Feature'?[gj]:[]);
      features.forEach(feat=>{
        const sem=(feat.properties&&feat.properties.sem)||{};
        if(!sem.type)return;
        const d=sem.data||{};
        semRows.push([name,dateLabel,cat,
          SEM_LABEL[sem.type]||sem.type,
          d.depth||'',d.diam||'',d.ugv||'',
          d.date||'',d.exec||'',
          d.desc||d.note||'']);
      });
    }catch(e){}
  };

  (s.volumes||[]).forEach(v=>{
    const cat=v.category==='geology'?'Геология':'Геодезия';
    // Способ 1: семантика в volumes.notes
    const noteSem=parseSem(v.notes);
    if(noteSem.type){
      const d=noteSem.data||{};
      semRows.push([v.name,'—',cat,
        SEM_LABEL[noteSem.type]||noteSem.type,
        d.depth||'',d.diam||'',d.ugv||'',
        d.date||'',d.exec||'',
        d.desc||d.note||noteSem.cleanNotes]);
    }
    // Способ 2: семантика в volumes.geojson
    extractSemFromGJ(v.geojson,v.name,cat,'—');
  });

  // Способ 3: семантика в vol_progress.geojson (главный источник при работе с прогрессом)
  (s.vol_progress||[]).forEach(p=>{
    if(p.row_type&&p.row_type!=='fact')return;
    const vol=volMap[p.volume_id];
    if(!vol||!p.geojson)return;
    const cat=vol.category==='geology'?'Геология':'Геодезия';
    extractSemFromGJ(p.geojson,vol.name,cat,fmt(p.work_date));
  });

  if(semRows.length>1)sh(semRows,'Семантика объёмов');

  // ── Выполнение объёмов (vol_progress, только факт) ────────
  // Итог по каждому объёму для расчёта %
  const volDone={};
  (s.vol_progress||[]).forEach(p=>{
    if(p.row_type&&p.row_type!=='fact')return;
    volDone[p.volume_id]=(volDone[p.volume_id]||0)+(p.completed||0);
  });
  const vpRows=[['Объём','Категория','Ед.','Дата','Выполнено за запись','Итого выполнено','% от плана','Работники','Техника','№ акта','Примечание']];
  (s.vol_progress||[]).forEach(p=>{
    if(p.row_type&&p.row_type!=='fact')return;
    const vol=volMap[p.volume_id];
    if(!vol)return;
    const total=volDone[p.volume_id]||0;
    const pct=vol.amount>0?Math.round(total/vol.amount*100)+'%':'—';
    const workers=(p.worker_ids||'').split(',').filter(Boolean).map(id=>wMap[id]||id).join(', ');
    const mac=p.machine_id?(mMap[p.machine_id]||p.machine_id):'';
    vpRows.push([vol.name,vol.category==='geology'?'Геология':'Геодезия',
      vol.unit,fmt(p.work_date),p.completed,total,pct,
      workers,mac,p.act_number||'',p.notes||'']);
  });
  if(vpRows.length>1)sh(vpRows,'Выполнение объёмов');

  // ── Камеральные ────────────────────────────────────────────
  const kr=[['Специалист','Роль','Ревизия','% готовности','Папка отчёта','Откр.замечаний','Закр.замечаний']];
  (s.kameral||[]).forEach(k=>{
    kr.push([k.specialist_name||'',k.specialist_role||'',k.revision||'Р0',k.completion_percent+'%',k.report_link||'',
      (k.remarks||[]).filter(r=>r.status==='open').length,(k.remarks||[]).filter(r=>r.status==='closed').length]);
    (k.remarks||[]).forEach(r=>kr.push(['','','','','  → '+r.text,'',r.link||'']));
  });
  sh(kr,'Камеральные');

  // ── Схема района ───────────────────────────────────────────
  const mr=[['СХЕМА РАЙОНА РАБОТ'],[''],['Тип','Название','Широта','Долгота','Статус','База']];
  (s.bases||[]).forEach(b=>mr.push(['🏕 База',b.name,b.lat,b.lng,b.description||'','—']));
  (s.bases||[]).forEach(b=>(b.machinery||[]).filter(m=>m.lat&&m.lng).forEach(m=>mr.push([`🚛 ${m.type||'Техника'}`,m.name,m.lat,m.lng,SL[m.status]||m.status,b.name])));
  sh(mr,'Схема района');

  const fname=`${s.name.replace(/[\/\\:*?"<>|]/g,'_')}_${new Date().toLocaleDateString('ru').replace(/\./g,'-')}.xlsx`;
  XLSX.writeFile(wb,fname);toast(`Сохранён: ${fname}`,'ok');
}

// ═══════════════════════════════════════════════════════════
// 🚛 ГРУЗ — ЗАЯВКИ НА ПЕРЕВОЗКУ
// ═══════════════════════════════════════════════════════════
let gruzOrders = [];
const GRUZ_STATUS = {new:'🔵 Новая', transit:'🟡 В пути', delivered:'✅ Доставлено', cancelled:'✕ Отменена'};
const GRUZ_STATUS_CLS = {new:'new', transit:'transit', delivered:'delivered', cancelled:'cancelled'};

