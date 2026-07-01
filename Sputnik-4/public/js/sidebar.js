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
    const driver=mach.driver_id?(pgkWorkers||[]).find(w=>w.id===mach.driver_id):null;
    mk.bindPopup(`<div class="popup">
      <div class="popup-n">${ico} ${esc(mach.name)}</div>
      <div class="popup-s">${esc(mach.type||'')}${mach.plate_number?' · '+mach.plate_number:''}</div>
      ${driver?`<div style="padding:4px 7px;background:var(--orgl);border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:var(--org)">👤 ${esc(driver.name)}${driver.role?' — '+esc(driver.role):''}</div>`:'<div style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:2px 6px;margin-bottom:5px;font-weight:600">⚠️ Водитель не назначен</div>'}
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
    // Merge with pgkMachinery to get fresh coordinates stored after last loadAll
    (b.machinery||[]).map(m=>{const f=(pgkMachinery||[]).find(x=>x.id===m.id);return f?{...m,lat:f.lat,lng:f.lng}:m;}).filter(m=>m.lat&&m.lng).forEach(mach=>{
      const clr=mach.status==='working'?'#0e9f6e':mach.status==='broken'?'#e02424':'#d97706';
      const ico=MICONS[mach.type]||'🔧';
      const icon=L.divIcon({className:'',
        html:`<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="width:28px;height:28px;background:${clr};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${ico}</div>
          <div class="mlbl">${esc(mach.name)}</div></div>`,
        iconSize:[90,44],iconAnchor:[45,26]
      });
      const mk=L.marker([mach.lat,mach.lng],{icon}).addTo(map);
      const driver=mach.driver_id?(pgkWorkers||[]).find(w=>w.id===mach.driver_id):null;
      mk.bindPopup(`<div class="popup">
        <div class="popup-n">${ico} ${esc(mach.name)}</div>
        <div class="popup-s">${esc(mach.type||'')}${mach.plate_number?' · '+mach.plate_number:''}</div>
        ${driver?`<div style="padding:4px 7px;background:var(--orgl);border-radius:5px;margin-bottom:5px;font-size:11px;font-weight:600;color:var(--org)">👤 ${esc(driver.name)}${driver.role?' — '+esc(driver.role):''}</div>`:'<div style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:2px 6px;margin-bottom:5px;font-weight:600">⚠️ Водитель не назначен</div>'}
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
  await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:vis,symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',
      min_zoom:l.min_zoom,max_zoom:l.max_zoom,size:l.size,show_labels:l.show_labels})});
  renderLP();renderLayerGroups();setTimeout(bringVolumesToFront,50);
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
}
function _updateKmlLabelScale(){
  if(!window.map)return;
  const z=map.getZoom();
  document.querySelectorAll('.leaflet-tooltip.mlbl').forEach(el=>{
    el.style.visibility = z < 9 ? 'hidden' : '';
  });
}
async function toggleLayerLabels(id){
  layerLabels[id]=!layerLabels[id];
  renderLP();
  renderLayerGroups();
  setTimeout(bringVolumesToFront,50);
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
  const l=layers.find(x=>x.id===id);
  if(l){
    l.show_labels=layerLabels[id]?1:0;
    await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,
        symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',
        show_labels:layerLabels[id]?1:0})});
  }
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
async function _readFileText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (_) { return new TextDecoder('windows-1251').decode(buf); }
}
async function importLayer(evt){
  const file=evt.target.files[0];if(!file)return;
  const text=await _readFileText(file);
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='dxf'){await _importDxf(file,text);evt.target.value='';return;}
  if(ext==='csv'||ext==='txt'){await _importCsv(file,text);evt.target.value='';return;}
  const name=file.name.replace(/\.(kml|gpx)$/i,'');
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
function _showDxfCrsModal(){
  return new Promise(resolve=>{
    const body=`
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:12px;color:var(--tx3);margin-bottom:2px">Выберите систему координат DXF-файла:</div>
        <label style="display:block;padding:3px 0"><input type="radio" name="dxf-crs" value="msk86" checked> МСК-86 (авто зона по X)</label>
        <label style="display:block;padding:3px 0"><input type="radio" name="dxf-crs" value="msk86_z3"> МСК-86 Зона 3 (ЦМ=72°05′, фикс.)</label>
        <label style="display:block;padding:3px 0"><input type="radio" name="dxf-crs" value="msk86_z4"> МСК-86 Зона 4 (ЦМ=78°05′, фикс.)</label>
        <label style="display:block;padding:3px 0"><input type="radio" name="dxf-crs" value="gsk2011"> ГСК-2011</label>
        <label style="display:block;padding:3px 0"><input type="radio" name="dxf-crs" value="wgs84"> WGS-84 (градусы)</label>
      </div>`;
    showModal('📥 Импорт DXF',body,[
      {label:'Отмена',cls:'bs',fn:()=>{closeModal();resolve(null);}},
      {label:'Импортировать',cls:'bp',fn:()=>{
        const crs=document.querySelector('input[name="dxf-crs"]:checked')?.value||'msk86';
        closeModal();resolve(crs);
      }},
    ]);
  });
}
async function _importDxf(file,text){
  const crs=await _showDxfCrsModal();
  if(!crs)return;
  let j;
  try{
    const r=await fetch(`${API}/layers/import-dxf`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dxfText:text,crs})});
    j=await r.json();
    if(!r.ok){toast(j.error||'Ошибка импорта DXF','err');return;}
  }catch(e){toast('Ошибка импорта DXF','err');return;}
  const fresh=await fetch(`${API}/layers`).then(r=>r.json()).catch(()=>layers);
  layers=fresh;renderLP();renderLayerGroups();
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
  const total=j.layers.reduce((s,l)=>s+l.features,0);
  toast(`DXF импортирован: ${j.layers.length} сл., ${total} объектов`,'ok');
}
// ── CSV / TXT импорт точек ──────────────────────────────────
function _csvAutoDelim(firstLine) {
  const candidates = [',', ';', '\t', ' '];
  let best = ',', bestCnt = 0;
  candidates.forEach(d => {
    const cnt = firstLine.split(d).length;
    if (cnt > bestCnt) { bestCnt = cnt; best = d; }
  });
  return best;
}

function _csvSplitLine(line, delim) {
  // basic CSV split respecting double-quoted fields
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells.map(c => c.replace(/^["']|["']$/g, ''));
}

function _csvBuildPreviewAndCols(text, delim) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows = lines.slice(0, 7).map(l => _csvSplitLine(l, delim));
  const maxCols = Math.max(...rows.map(r => r.length));
  return { rows, maxCols };
}

function _csvAutoDetectCols(headers) {
  let nameCol = -1, xCol = -1, yCol = -1;
  headers.forEach((h, i) => {
    const lh = h.toLowerCase();
    if (nameCol < 0 && /имя|name|^id$|точк|пункт|номер|label/.test(lh)) nameCol = i;
    if (xCol    < 0 && /^x$|север|north|^lat$|широт/.test(lh)) xCol = i;
    if (yCol    < 0 && /^y$|восток|east|^lon$|долг/.test(lh))  yCol = i;
  });
  return { nameCol, xCol: xCol >= 0 ? xCol : (nameCol === 0 ? 1 : 0), yCol: yCol >= 0 ? yCol : (nameCol === 0 ? 2 : 1) };
}

function _csvRenderPreviewTable(rows, maxCols) {
  const hdr = `<tr>${rows[0].map((c,i) => `<th style="padding:2px 6px;font-size:10px;border:1px solid var(--bd);background:var(--s2)">Кол.${i+1}<br><span style="font-weight:400;color:var(--acc)">${c||''}</span></th>`).join('')}</tr>`;
  const body = rows.slice(1, 5).map(r => {
    const cells = Array.from({length: maxCols}, (_,i) => `<td style="padding:2px 6px;font-size:10px;border:1px solid var(--bd);white-space:nowrap">${r[i]||''}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table style="border-collapse:collapse;max-width:100%;font-family:monospace">${hdr}${body}</table>`;
}

function _csvColOptions(rows, hasHeader, maxCols) {
  const labels = hasHeader && rows[0] ? rows[0].map((h,i) => h || `Кол. ${i+1}`) : Array.from({length:maxCols},(_,i)=>`Кол. ${i+1}`);
  return labels.map((l,i) => `<option value="${i}">${i+1}: ${l}</option>`).join('');
}

function _showCsvConfigModal(text, fileName) {
  return new Promise(resolve => {
    let delim = _csvAutoDelim(text.split(/\r?\n/)[0] || '');
    let { rows, maxCols } = _csvBuildPreviewAndCols(text, delim);
    let hasHeader = rows[0] && rows[0].some(c => isNaN(parseFloat(c.replace(',','.'))));
    let { nameCol, xCol, yCol } = _csvAutoDetectCols(hasHeader ? rows[0] : []);
    if (nameCol < 0) nameCol = 0;

    const delimLabel = d => d === '\t' ? 'Tab' : d === ' ' ? 'Пробел' : d;
    const DELIMS = [',', ';', '\t', ' '];

    function buildBody() {
      const { rows: r2, maxCols: mc } = _csvBuildPreviewAndCols(text, delim);
      rows = r2; maxCols = mc;
      const opts = _csvColOptions(rows, hasHeader, maxCols);
      const noOpt = `<option value="-1">— Нет —</option>`;
      const selName = `<select id="csv-col-name" style="width:100%;font-size:12px;padding:3px;border:1px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx)">${noOpt}${opts}</select>`;
      const selX   = `<select id="csv-col-x"    style="width:100%;font-size:12px;padding:3px;border:1px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx)">${opts}</select>`;
      const selY   = `<select id="csv-col-y"    style="width:100%;font-size:12px;padding:3px;border:1px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx)">${opts}</select>`;
      return `
        <div style="display:flex;flex-direction:column;gap:9px">
          <div>
            <div style="font-size:11px;font-weight:700;margin-bottom:5px">Разделитель</div>
            <div style="display:flex;gap:5px">
              ${DELIMS.map(d=>`<label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:12px;padding:3px 7px;border:1px solid var(--bd);border-radius:5px;background:${delim===d?'var(--accl)':'var(--s2)'}">
                <input type="radio" name="csv-delim" value="${d==='	'?'tab':d}" ${delim===d?'checked':''} onchange="_csvDelimChange(this)"> ${delimLabel(d)}
              </label>`).join('')}
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="csv-hdr" ${hasHeader?'checked':''} onchange="_csvHdrChange(this)">
            Первая строка — заголовки
          </label>
          <div>
            <div style="font-size:11px;font-weight:700;margin-bottom:4px">Предпросмотр</div>
            <div id="csv-preview" style="overflow-x:auto;max-height:120px;overflow-y:auto">${_csvRenderPreviewTable(rows, maxCols)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px">
            <div>
              <div style="font-size:11px;font-weight:600;margin-bottom:3px">Имя точки</div>
              <div id="csv-wrap-name">${selName}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;margin-bottom:3px">X (Север / Шир.)</div>
              <div id="csv-wrap-x">${selX}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;margin-bottom:3px">Y (Восток / Долг.)</div>
              <div id="csv-wrap-y">${selY}</div>
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;margin-bottom:4px">Система координат</div>
            <label style="display:block;padding:2px 0;font-size:12px"><input type="radio" name="csv-crs" value="msk86" checked> МСК-86 (авто зона по Y)</label>
            <label style="display:block;padding:2px 0;font-size:12px"><input type="radio" name="csv-crs" value="msk86_z3"> МСК-86 Зона 3 (ЦМ=72°05′)</label>
            <label style="display:block;padding:2px 0;font-size:12px"><input type="radio" name="csv-crs" value="msk86_z4"> МСК-86 Зона 4 (ЦМ=78°05′)</label>
            <label style="display:block;padding:2px 0;font-size:12px"><input type="radio" name="csv-crs" value="gsk2011"> ГСК-2011</label>
            <label style="display:block;padding:2px 0;font-size:12px"><input type="radio" name="csv-crs" value="wgs84"> WGS-84 (широта / долгота)</label>
          </div>
        </div>`;
    }

    function applyColDefaults() {
      const { rows: r2, maxCols: mc } = _csvBuildPreviewAndCols(text, delim);
      const detected = _csvAutoDetectCols(hasHeader ? r2[0] : []);
      nameCol = detected.nameCol >= 0 ? detected.nameCol : 0;
      xCol = detected.xCol; yCol = detected.yCol;
      const sName = document.getElementById('csv-col-name');
      const sX    = document.getElementById('csv-col-x');
      const sY    = document.getElementById('csv-col-y');
      if (sName) sName.value = nameCol;
      if (sX)    sX.value   = xCol;
      if (sY)    sY.value   = yCol;
    }

    // exposed to inline handlers
    window._csvDelimChange = function(el) {
      delim = el.value === 'tab' ? '\t' : el.value;
      const { rows: r2, maxCols: mc } = _csvBuildPreviewAndCols(text, delim);
      rows = r2; maxCols = mc;
      const prev = document.getElementById('csv-preview');
      if (prev) prev.innerHTML = _csvRenderPreviewTable(rows, maxCols);
      const opts = _csvColOptions(rows, hasHeader, maxCols);
      const noOpt = '<option value="-1">— Нет —</option>';
      ['csv-wrap-name','csv-wrap-x','csv-wrap-y'].forEach((wid, wi) => {
        const wrap = document.getElementById(wid);
        if (!wrap) return;
        const sel = wrap.querySelector('select');
        if (!sel) return;
        sel.innerHTML = (wi === 0 ? noOpt : '') + opts;
      });
      applyColDefaults();
    };
    window._csvHdrChange = function(el) {
      hasHeader = el.checked;
      const { rows: r2, maxCols: mc } = _csvBuildPreviewAndCols(text, delim);
      rows = r2; maxCols = mc;
      const opts = _csvColOptions(rows, hasHeader, maxCols);
      const noOpt = '<option value="-1">— Нет —</option>';
      ['csv-wrap-name','csv-wrap-x','csv-wrap-y'].forEach((wid, wi) => {
        const wrap = document.getElementById(wid);
        if (!wrap) return;
        const sel = wrap.querySelector('select');
        if (!sel) return;
        sel.innerHTML = (wi === 0 ? noOpt : '') + opts;
      });
      applyColDefaults();
    };

    showModal(`📄 Импорт CSV — ${fileName}`, buildBody(), [
      {label:'Отмена', cls:'bs', fn:()=>{ closeModal(); resolve(null); }},
      {label:'Импортировать', cls:'bp', fn:()=>{
        const nc = parseInt(document.getElementById('csv-col-name')?.value ?? -1);
        const xc = parseInt(document.getElementById('csv-col-x')?.value  ?? 1);
        const yc = parseInt(document.getElementById('csv-col-y')?.value  ?? 2);
        const crs = document.querySelector('input[name="csv-crs"]:checked')?.value || 'msk86';
        const hdr = !!document.getElementById('csv-hdr')?.checked;
        closeModal();
        resolve({ delim, hasHeader: hdr, nameCol: nc, xCol: xc, yCol: yc, crs });
      }},
    ]);
    // set select values after modal renders
    setTimeout(applyColDefaults, 50);
  });
}

async function _importCsv(file, text) {
  const cfg = await _showCsvConfigModal(text, file.name);
  if (!cfg) return;
  const { delim, hasHeader, nameCol, xCol, yCol, crs } = cfg;

  const allLines = text.split(/\r?\n/).filter(l => l.trim());
  const dataLines = hasHeader ? allLines.slice(1) : allLines;

  const features = [];
  let skipped = 0;

  dataLines.forEach((line, i) => {
    const cols = _csvSplitLine(line, delim);
    const rawX = cols[xCol] || '';
    const rawY = cols[yCol] || '';
    const nm   = nameCol >= 0 ? (cols[nameCol] || `Точка ${i + 1}`) : `Точка ${i + 1}`;

    const x = parseFloat(rawX.replace(',', '.'));
    const y = parseFloat(rawY.replace(',', '.'));
    if (isNaN(x) || isNaN(y)) { skipped++; return; }

    let lat, lng;
    try {
      if (crs === 'wgs84') {
        lat = x; lng = y;
      } else {
        const zone = crs === 'msk86_z3' ? 3 : crs === 'msk86_z4' ? 4 : Math.round(y / 1e6);
        const conv = crs.startsWith('gsk') ? gskToWgs : mskToWgs;
        const res  = conv(x, y, zone);
        lat = res.lat; lng = res.lon;
      }
    } catch (e) { skipped++; return; }

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      { skipped++; return; }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { name: nm.trim() || `Точка ${i + 1}` },
    });
  });

  if (!features.length) { toast('Нет корректных точек для импорта', 'err'); return; }

  const layerName = file.name.replace(/\.(csv|txt)$/i, '');
  const color = LCOLORS[layers.length % LCOLORS.length];
  const gj = JSON.stringify({ type: 'FeatureCollection', features });

  await fetch(`${API}/layers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: layerName, geojson: gj, color, symbol: 'picket' }),
  });
  const fresh = await fetch(`${API}/layers`).then(r => r.json()).catch(() => layers);
  layers = fresh;
  renderLP(); renderLayerGroups();
  try { if (kmlPanelOpen) renderKmlPanel(); } catch (e) {}
  toast(`CSV импортирован: ${features.length} точек${skipped ? `, пропущено ${skipped}` : ''}`, 'ok');
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
