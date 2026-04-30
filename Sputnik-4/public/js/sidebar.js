function setFilt(el){
  document.querySelectorAll('.ft').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');filterSt=el.dataset.f;renderSidebar();
}
function renderSidebar(){
  const q=(document.getElementById('srch').value||'').toLowerCase();
  const list=sites.filter(s=>(s.name.toLowerCase().includes(q)||(s.client||'').toLowerCase().includes(q))&&(filterSt==='all'||s.status===filterSt));
  const el=document.getElementById('slist');
  if(!list.length){el.innerHTML='<div class="empty"><div class="empty-i">🗺</div>Нет объектов</div>';}
  else{el.innerHTML=list.map(s=>`<div class="sit${currentObj?.id===s.id&&currentType==='site'?' on':''}" onclick="selectSite('${s.id}')" oncontextmenu="event.preventDefault();siteCM(event,'${s.id}')">
    <div class="sin"><span class="sdot ${s.status==='active'?'sa':s.status==='paused'?'sp2':'sd'}"></span>${esc(s.name)}${(()=>{const ot=(s.open_tasks!==undefined?s.open_tasks:(s.tasks||[]).filter(t=>t.status!=='done').length);return ot?`<span style="background:#ef4444;color:#fff;border-radius:9px;font-size:8px;font-weight:800;padding:1px 5px;margin-left:4px">${ot}</span>`:'';})()}</div>
    <div class="sic">${esc(s.client||'Заказчик не указан')}</div>
    <div class="sibr"><div class="pm"><div class="pmf" style="width:${s.completion_percent}%"></div></div><span class="spp">${s.completion_percent}%</span></div>
  </div>`).join('');}
  renderBaseList();
}
function renderBaseList(){
  const el=document.getElementById('blist');
  if(!el)return;
  if(!bases.length){el.innerHTML='<div style="padding:7px 9px;font-size:11px;color:var(--tx3)">Нет баз</div>';return;}
  el.innerHTML=bases.map(b=>`<div class="sit${currentObj?.id===b.id&&currentType==='base'?' on':''}"
    style="border-left-color:${currentObj?.id===b.id&&currentType==='base'?'var(--bpc)':'transparent'};border-left-width:3px;border-left-style:solid"
    onclick="selectBase('${b.id}')"
    oncontextmenu="event.preventDefault();baseCtxMenu(event,'${b.id}')">
    <div class="sin" style="color:var(--bpc)">🏕 ${esc(b.name)}</div>
    <div class="sic">${(b.workers||[]).length} чел. · ${(b.machinery||[]).length} техн.</div>
  </div>`).join('');
}
function baseCtxMenu(ev,id){
  showCtx(ev.clientX,ev.clientY,[
    {i:'📂',l:'Открыть базу',f:()=>selectBase(id)},
    {i:'✏️',l:'Редактировать',f:()=>openEditBaseModal(id)},
    {sep:true},
    {i:'🗑',l:'Удалить',cls:'dan',f:()=>deleteBase(id)}
  ]);
}
function siteCM(ev,id){
  showCtx(ev.clientX,ev.clientY,[
    {i:'📂',l:'Открыть',f:()=>selectSite(id)},
    {i:'✏️',l:'Редактировать',f:()=>openEditSiteModal(id)},
    {i:'📤',l:'Excel',f:()=>exportExcel(id)},
    {sep:true},
    {i:'🗑',l:'Удалить',cls:'dan',f:()=>deleteSite(id)}
  ]);
}

// ═══════════════════════════════════════════════════════════
// BASE MARKERS
// ═══════════════════════════════════════════════════════════
function renderBaseMarkers(){
  Object.values(bMarkers).forEach(m=>{try{map.removeLayer(m);}catch(e){}});
  bMarkers={};
  const linkedIds=currentType==='site'?(currentObj?.bases||[]).map(b=>b.id):[];
  const hasActive=!!activeSiteId;
  bases.forEach(b=>{
    const linked=linkedIds.includes(b.id);
    const op=hasActive?(linked?1:.3):1;
    const icon=L.divIcon({className:'',
      html:`<div style="display:flex;flex-direction:column;align-items:center;gap:2px;opacity:${op}">
        <div style="width:40px;height:40px;background:${linked||!hasActive?'#7c3aed':'#5b21b6'};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 3px 12px rgba(0,0,0,.4)">🏕</div>
        <div style="background:rgba(124,58,237,.85);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.3)">${esc(b.name)}</div>
      </div>`,
      iconSize:[120,58],iconAnchor:[60,20],zIndexOffset:500
    });
    const m=L.marker([b.lat,b.lng],{icon,zIndexOffset:500}).addTo(map);
    m.on('click',ev=>{ev.originalEvent?.stopPropagation?.();showBCard(b,ev.originalEvent||ev);});
    m.on('contextmenu',ev=>{
      ev.originalEvent.preventDefault();
      showCtx(ev.originalEvent.clientX,ev.originalEvent.clientY,[
        {i:'📂',l:'Открыть базу',f:()=>selectBase(b.id)},
        {i:'✏️',l:'Редактировать',f:()=>openEditBaseModal(b.id)},
        {i:'📍',l:'Переместить',f:()=>startMove('base',b)},
        {sep:true},
        {i:'🗑',l:'Удалить',cls:'dan',f:()=>deleteBase(b.id)}
      ]);
    });
    bMarkers[b.id]=m;
  });
}

function showBCard(b,ev){
  const card=document.getElementById('bcard');
  const w=(b.workers||[]).length,mc=(b.machinery||[]).length;
  card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div style="font-size:13px;font-weight:800;color:var(--bpc)">🏕 ${esc(b.name)}</div>
    <button class="ph-x" onclick="hideBCard()">✕</button></div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:3px">👷 ${w} чел. &nbsp;🚛 ${mc} техн.</div>
    ${b.description?`<div style="font-size:10px;color:var(--tx3);margin-bottom:7px">${esc(b.description)}</div>`:''}
    <button class="btn bb bsm" style="width:100%;justify-content:center" onclick="selectBase('${b.id}');hideBCard()">Открыть →</button>`;
  const x=Math.min((ev.clientX||400),window.innerWidth-230);
  const y=Math.min((ev.clientY||300),window.innerHeight-180);
  card.style.left=x+'px';card.style.top=y+'px';card.classList.add('show');
}
function hideBCard(){document.getElementById('bcard').classList.remove('show');}

// ═══════════════════════════════════════════════════════════
// MACHINE MARKERS
// ═══════════════════════════════════════════════════════════
// Рисует ВСЮ технику из pgkMachinery напрямую (без привязки к базе)
function renderAllMachinery(){
  Object.keys(mMarkers).forEach(id=>{try{map.removeLayer(mMarkers[id]);}catch(e){}});
  mMarkers={};
  (pgkMachinery||[]).filter(mach=>mach.lat&&mach.lng).forEach(mach=>{
    const clr=mach.status==='working'?'#0e9f6e':mach.status==='broken'?'#e02424':'#d97706';
    const ico=MICONS[mach.type]||'🔧';
    const b=bases.find(x=>x.id===mach.base_id)||{name:'Без базы',workers:[]};
    const icon=L.divIcon({className:'',
      html:`<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
        <div style="width:28px;height:28px;background:${clr};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${ico}</div>
        <div class="mlbl">${esc(mach.name)}</div></div>`,
      iconSize:[90,44],iconAnchor:[45,26]
    });
    const mk=L.marker([mach.lat,mach.lng],{icon}).addTo(map);
    const driverList=(b.workers||[]).filter(w=>w.machine_id===mach.id);
    const attachedDrillA=(pgkMachinery||[]).find(x=>x.drill_id===mach.id);
    const drillTransportA=mach.drill_id?(pgkMachinery||[]).find(x=>x.id===mach.drill_id):null;
    mk.bindPopup(`<div class="popup">
      <div class="popup-n">${ico} ${esc(mach.name)}</div>
      <div class="popup-s">${esc(mach.type||'')}${mach.plate_number?' · '+mach.plate_number:''}</div>
      ${attachedDrillA?`<div style="padding:3px 7px;background:#fef3c7;border-radius:5px;margin-bottom:4px;font-size:11px;font-weight:600;color:#92400e">⛏️ ${esc(attachedDrillA.name)}</div>`:''}
      ${drillTransportA?`<div style="padding:3px 7px;background:#fef3c7;border-radius:5px;margin-bottom:4px;font-size:11px;font-weight:600;color:#92400e">🚙 ${esc(drillTransportA.name)}</div>`:''}
      ${driverList.length?`<div style="padding:4px 7px;background:var(--orgl);border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:var(--org)">${driverList.map(d=>'👤 '+esc(d.name)+(d.role?' — '+esc(d.role):'')).join('<br>')}</div>`:'<div style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:2px 6px;margin-bottom:5px;font-weight:600">⚠️ Водитель не назначен</div>'}
      <span class="badge ${mach.status==='working'?'bw':mach.status==='idle'?'bi':'br'}">${SL[mach.status]||mach.status}</span>
      <div style="font-size:9px;color:var(--tx3);margin-top:4px">🏕 ${esc(b.name)}</div>
      ${mach.notes?`<div style="font-size:10px;color:var(--tx2);margin-top:5px;padding-top:5px;border-top:1px solid var(--bd)">📝 ${esc(mach.notes)}</div>`:''}
    </div>`,{maxWidth:240});
    mk.on('contextmenu',ev=>{
      ev.originalEvent.preventDefault();
      showCtx(ev.originalEvent.clientX,ev.originalEvent.clientY,[
        {i:'✏️',l:'Редактировать',f:()=>pgkEditMach(mach.id)},
        {sep:true},
        {i:'📍',l:'Переместить',f:()=>startMove('machine',{mach,baseId:mach.base_id})},
        {i:'🕐',l:'История перемещений',f:()=>showMachHistory(mach.id)},
        {i:'✅',l:'В работе',f:()=>quickSt(mach,mach.base_id,'working')},
        {i:'⏸',l:'Стоит',f:()=>quickSt(mach,mach.base_id,'idle')},
        {i:'🔴',l:'Сломана',f:()=>quickSt(mach,mach.base_id,'broken')},
        {sep:true},
        {i:'🗑',l:'Убрать с карты',cls:'dan',f:()=>removeMachFromMap(mach,mach.base_id)}
      ]);
    });
    mMarkers[mach.id]=mk;
  });
}

function renderMachineMarkers(baseList){
  Object.keys(mMarkers).forEach(id=>{try{map.removeLayer(mMarkers[id]);}catch(e){}});
  mMarkers={};
  (baseList||[]).forEach(b=>{
    (b.machinery||[]).filter(m=>m.lat&&m.lng).forEach(mach=>{
      const clr=mach.status==='working'?'#0e9f6e':mach.status==='broken'?'#e02424':'#d97706';
      const ico=MICONS[mach.type]||'🔧';
      const icon=L.divIcon({className:'',
        html:`<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="width:28px;height:28px;background:${clr};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${ico}</div>
          <div class="mlbl">${esc(mach.name)}</div></div>`,
        iconSize:[90,44],iconAnchor:[45,26]
      });
      const mk=L.marker([mach.lat,mach.lng],{icon}).addTo(map);
      // Find all workers assigned to this machine
      const driverList=(b.workers||[]).filter(w=>w.machine_id===mach.id);
      // Find attached drill (drill stores drill_id pointing to transport)
      const allMachForPopup=[...(b.machinery||[]),...pgkMachinery];
      const attachedDrillForPopup=TRANSPORT_TYPES.includes(mach.type)?allMachForPopup.find(x=>x.drill_id===mach.id&&DRILL_TYPES.includes(x.type)):null;
      const hostTransportForPopup=DRILL_TYPES.includes(mach.type)&&mach.drill_id?allMachForPopup.find(x=>x.id===mach.drill_id):null;
      mk.bindPopup(`<div class="popup">
        <div class="popup-n">${ico} ${esc(mach.name)}</div>
        <div class="popup-s">${esc(mach.type||'')}${mach.plate_number?' · '+mach.plate_number:''}</div>
        ${attachedDrillForPopup?`<div style="padding:4px 7px;background:#fef3c7;border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:#92400e">⛏ ${esc(attachedDrillForPopup.name)}</div>`:''}
        ${hostTransportForPopup?`<div style="padding:4px 7px;background:#fef3c7;border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:#92400e">🚙 ${esc(hostTransportForPopup.name)}</div>`:''}
        ${driverList.length?`<div style="padding:4px 7px;background:var(--orgl);border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:var(--org)">${driverList.map(d=>'👤 '+esc(d.name)+(d.role?' — '+esc(d.role):'')).join('<br>')}</div>`:'<div style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:2px 6px;margin-bottom:5px;font-weight:600">⚠️ Водитель не назначен</div>'}
        <span class="badge ${mach.status==='working'?'bw':mach.status==='idle'?'bi':'br'}">${SL[mach.status]||mach.status}</span>
        <div style="font-size:9px;color:var(--tx3);margin-top:4px">🏕 ${esc(b.name)}</div>
        ${mach.notes?`<div style="font-size:10px;color:var(--tx2);margin-top:5px;padding-top:5px;border-top:1px solid var(--bd)">📝 ${esc(mach.notes)}</div>`:''}
      </div>`,{maxWidth:240});
      mk.on('contextmenu',ev=>{
        ev.originalEvent.preventDefault();
        showCtx(ev.originalEvent.clientX,ev.originalEvent.clientY,[
          {i:'✏️',l:'Редактировать',f:()=>pgkEditMach(mach.id)},
          {sep:true},
          {i:'📍',l:'Переместить',f:()=>startMove('machine',{mach,baseId:b.id})},
          {i:'✅',l:'В работе',f:()=>quickSt(mach,b.id,'working')},
          {i:'⏸',l:'Стоит',f:()=>quickSt(mach,b.id,'idle')},
          {i:'🔴',l:'Сломана',f:()=>quickSt(mach,b.id,'broken')},
          {sep:true},
          {i:'🗑',l:'Убрать с карты',cls:'dan',f:()=>removeMachFromMap(mach,b.id)}
        ]);
      });
      mMarkers[mach.id]=mk;
    });
  });
}

function flyToMach(machId){
  // найти машину в mMarkers или по координатам из pgkMachinery
  if(mMarkers[machId]){
    const mk=mMarkers[machId];
    map.flyTo(mk.getLatLng(),15,{animate:true});
    setTimeout(()=>mk.openPopup(),600);
    switchView('map');
    return;
  }
  // маркера нет — ищем координаты
  const m=pgkMachinery.find(x=>x.id===machId)||(currentObj?.machinery||[]).find(x=>x.id===machId);
  if(m&&m.lat&&m.lng){
    switchView('map');
    map.flyTo([m.lat,m.lng],15,{animate:true});
    toast('Техника на карте','ok');
  } else {
    toast('Техника не расставлена на карте','err');
  }
}
async function quickSt(mach,baseId,status){
  try{
    const resp=await fetch(`${API}/pgk/machinery/${mach.id}`,{method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...mach,status,base_id:baseId||null,user_name:un()})});
    if(!resp.ok)throw new Error(resp.status);
  }catch(e){toast('Ошибка обновления статуса','err');return;}
  toast(`${mach.name}: ${SL[status]}`,'ok');
  if(currentObj)await refreshCurrent();else await loadAll();
}
async function removeMachFromMap(mach,baseId){
  if(!confirm('Убрать с карты?'))return;
  await fetch(`${API}/pgk/machinery/${mach.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...mach,lat:null,lng:null,base_id:baseId||null,user_name:un()})});
  toast('Убрана с карты','ok');
  if(currentObj)await refreshCurrent();else await loadAll();
}


// ═══════════════════════════════════════════════════════════
// LAYERS
// ═══════════════════════════════════════════════════════════
function toggleLP(){document.getElementById('lp').classList.toggle('show');}
function renderLP(){
  const ll=document.getElementById('lp-list');
  if(!layers.length){ll.innerHTML='<div style="padding:8px 9px;font-size:11px;color:var(--tx3)">Нет KML/GPX слоёв</div>';return;}
  ll.innerHTML=layers.map(l=>{
    const lblOn=!!layerLabels[l.id];
    return `<div class="lpi">
      <button class="lp-v ${l.visible?'on':''}" onclick="toggleLV('${l.id}',${l.visible?0:1})" title="${l.visible?'Скрыть слой':'Показать слой'}">${l.visible?'👁':'🚫'}</button>
      <button class="lp-v ${lblOn?'on':''}" onclick="toggleLayerLabels('${l.id}')" title="${lblOn?'Скрыть надписи':'Показать надписи'}" style="font-size:10px;min-width:22px">🏷</button>
      <div class="lp-dot" style="background:${l.color}" title="Изм. цвет" onclick="editLayer('${l.id}')"></div>
      <div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.name)}</div>
      <button class="lp-del" onclick="deleteLayer('${l.id}')">✕</button>
    </div>`;
  }).join('');
}
function renderLayerGroups(){
  // Remove only global KML layers (not site-specific 's_' prefixed ones)
  Object.keys(lGroups).forEach(k=>{
    if(!k.startsWith('s_')){try{map.removeLayer(lGroups[k]);}catch(e){}delete lGroups[k];}
  });
  layers.filter(l=>l.visible).forEach(l=>{
    try{
      const gj=JSON.parse(l.geojson);
      const showLabels=!!layerLabels[l.id];
      const g=L.geoJSON(gj,{
        style:{color:l.color,weight:2.5,opacity:.85,fillOpacity:.2},
        pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:6,fillColor:l.color,color:'#fff',weight:2,opacity:1,fillOpacity:.9}),
        onEachFeature:(f,layer)=>{
          const nm=f.properties?.name||'';
          if(nm){
            if(showLabels){
              layer.bindTooltip(nm,{permanent:true,className:'mlbl',direction:'top'});
            } else {
              layer.bindTooltip(nm,{permanent:false,className:'mlbl',direction:'top'});
            }
          }
        }
      }).addTo(map);
      lGroups[l.id]=g;
    }catch(e){}
  });
}
async function toggleLV(id,vis){
  const l=layers.find(x=>x.id===id);if(!l)return;
  l.visible=vis;
  layerVisibility[id]=vis?true:false;
  await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:vis,symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid'})});
  renderLP();renderLayerGroups();setTimeout(bringVolumesToFront,50);
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
}
function _updateKmlLabelScale(){
  if(!window.map)return;
  const z=map.getZoom();
  // < 9: скрыть, 9-11: мелкий шрифт, >= 12: нормальный
  document.querySelectorAll('.leaflet-tooltip.mlbl').forEach(el=>{
    if(z<9){el.style.display='none';}
    else{el.style.display='';el.style.fontSize=z<12?'8px':'10px';}
  });
}
function toggleLayerLabels(id){
  layerLabels[id]=!layerLabels[id];
  renderLP();
  renderLayerGroups();
  setTimeout(bringVolumesToFront,50);
}
function editLayer(id){
  const l=layers.find(x=>x.id===id);if(!l)return;
  showModal('Слой',`<div class="fgr fone">
    <div class="fg"><label>Название</label><input id="f-lnm" value="${esc(l.name)}"></div>
    <div class="fg"><label>Цвет</label><input id="f-lcl" type="color" value="${l.color}" style="width:100%;height:32px"></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    l.name=v('f-lnm');l.color=v('f-lcl');
    await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0})});
    closeModal();renderLP();renderLayerGroups();setTimeout(bringVolumesToFront,50);toast('Обновлено','ok');
  }}]);
}
async function deleteLayer(id){
  if(lGroups[id])map.removeLayer(lGroups[id]);
  layers=layers.filter(l=>l.id!==id);renderLP();
  await apiDelUndo(`/layers/${id}`,'Слой удалён',async()=>{
    const fresh=await fetch(`${API}/layers`).then(r=>r.json()).catch(()=>[]);
    layers=fresh;renderLP();try{reloadKmlLayers();}catch(e){}
  });
}
async function importLayer(evt){
  const file=evt.target.files[0];if(!file)return;
  const text=await file.text();const name=file.name.replace(/\.(kml|gpx)$/i,'');
  const ext=file.name.split('.').pop().toLowerCase();
  let gj=null;
  try{gj=ext==='kml'?kmlToGJ(text):gpxToGJ(text);}catch(e){toast('Ошибка разбора','err');return;}
  if(!gj||!gj.features?.length){toast('Файл пустой','err');return;}
  const color=LCOLORS[layers.length%LCOLORS.length];
  await fetch(`${API}/layers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,geojson:JSON.stringify(gj),color})});
  const lr=await fetch(`${API}/layers`);const freshLayers=await lr.json();
  freshLayers.forEach(function(l){
    const ex=layers.find(x=>x.id===l.id);
    if(ex&&!ex.visible){
      l.visible=0;
      fetch(`${API}/layers/${l.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:l.name,color:l.color||'#1a56db',visible:0})});
    }
  });
  layers=freshLayers;
  renderLP();renderLayerGroups();
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
  toast(`Импортировано: ${gj.features.length} объектов`,'ok');
  evt.target.value='';
}
function kmlToGJ(kml){
  const doc=new DOMParser().parseFromString(kml,'application/xml'),feats=[];
  const pc=s=>s.trim().split(/\s+/).map(c=>{const p=c.split(',');return[parseFloat(p[0]),parseFloat(p[1])];});
  doc.querySelectorAll('Placemark').forEach(pm=>{
    const nm=pm.querySelector('name')?.textContent||'',props={name:nm};
    const pt=pm.querySelector('Point coordinates');
    if(pt){const c=pt.textContent.trim().split(',');feats.push({type:'Feature',geometry:{type:'Point',coordinates:[parseFloat(c[0]),parseFloat(c[1])]},properties:props});return;}
    const ls=pm.querySelector('LineString coordinates');
    if(ls){feats.push({type:'Feature',geometry:{type:'LineString',coordinates:pc(ls.textContent)},properties:props});return;}
    const pg=pm.querySelector('Polygon outerBoundaryIs coordinates')||pm.querySelector('Polygon coordinates');
    if(pg)feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[pc(pg.textContent)]},properties:props});
  });
  return{type:'FeatureCollection',features:feats};
}
function gpxToGJ(gpx){
  const doc=new DOMParser().parseFromString(gpx,'application/xml'),feats=[];
  doc.querySelectorAll('wpt').forEach(w=>{
    feats.push({type:'Feature',geometry:{type:'Point',coordinates:[parseFloat(w.getAttribute('lon')),parseFloat(w.getAttribute('lat'))]},properties:{name:w.querySelector('name')?.textContent||''}});
  });
  doc.querySelectorAll('trk').forEach(t=>{
    const nm=t.querySelector('name')?.textContent||'';
    t.querySelectorAll('trkseg').forEach(seg=>{
      const c=[...seg.querySelectorAll('trkpt')].map(p=>[parseFloat(p.getAttribute('lon')),parseFloat(p.getAttribute('lat'))]);
      if(c.length)feats.push({type:'Feature',geometry:{type:'LineString',coordinates:c},properties:{name:nm}});
    });
  });
  return{type:'FeatureCollection',features:feats};
}

// ═══════════════════════════════════════════════════════════
// SELECT SITE / BASE
// ═══════════════════════════════════════════════════════════
