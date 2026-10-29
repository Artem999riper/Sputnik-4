async function selectSite(id){
  // приближаем карту только при переходе к другому объекту (повторный вызов — это обновление данных)
  const isNew=!(currentType==='site'&&currentObj&&currentObj.id===id);
  try{
    // Close full panel silently (no mini-restore for old site)
    const panelEl=document.getElementById('panel');
    if(panelEl.classList.contains('open')){
      panelEl.classList.remove('open');
      document.body.classList.remove('panel-open');
    }
    document.getElementById('mini-panel').classList.remove('open');
    const r=await fetch(`${API}/sites/${id}`);
    if(!r.ok)throw new Error('not found');
    currentObj=await r.json();currentType='site';activeSiteId=id;
    window._ssoCollapsed=false;
    _showMiniPanel();
    renderSiteStatsOverlay(currentObj);
    renderSidebar();
    await repaintMap();
    if(isNew)_zoomToSite(currentObj);
  }catch(e){toast('Ошибка загрузки объекта','err');}
}

// Приблизить карту к объекту: объёмы, факт, базы и KML-слои, привязанные к объекту
function _zoomToSite(o){
  if(!o||!mapReady())return;
  let b=null;
  const add=bb=>{if(bb&&bb.isValid())b=b?b.extend(bb):L.latLngBounds(bb.getSouthWest(),bb.getNorthEast());};
  const addGj=s=>{if(!s)return;try{add(L.geoJSON(typeof s==='string'?JSON.parse(s):s).getBounds());}catch(e){}};
  (o.volumes||[]).forEach(v=>{const l=v.layer_id&&(typeof layers!=='undefined'?layers:[]).find(x=>x.id===v.layer_id);if(l)addGj(l.geojson);});
  (o.bases||[]).forEach(x=>{if(x&&x.lat&&x.lng)add(L.latLngBounds([[x.lat,x.lng],[x.lat,x.lng]]));});
  (typeof layers!=='undefined'?layers:[]).forEach(l=>{
    const g=l.group_id&&typeof kmGroups==='object'?kmGroups[l.group_id]:null;
    const ids=g?(g.site_ids||(g.site_id?[g.site_id]:[])):[];
    if(l.site_id===o.id||ids.includes(o.id))addGj(l.geojson);
  });
  if(!b){toast('У объекта пока нет геометрии на карте','warn');return;}
  try{
    if(b.getNorthEast().equals(b.getSouthWest()))map.flyTo(b.getCenter(),Math.max(map.getZoom(),14),{duration:.8});
    else map.flyToBounds(b,{padding:[50,50],maxZoom:16,duration:.8});
  }catch(e){}
}

function hideSiteStatsOverlay(){
  const el=document.getElementById('site-stats-overlay');
  if(el){el.style.display='none';el.innerHTML='';}
}

function collapseSiteStatsOverlay(){
  window._ssoCollapsed=true;
  const body=document.getElementById('sso-body');
  const arrow=document.getElementById('sso-arrow');
  if(body)body.style.display='none';
  if(arrow)arrow.textContent='◀';
}

function toggleSiteStatsOverlay(){
  if(window._ssoCollapsed){
    window._ssoCollapsed=false;
    const body=document.getElementById('sso-body');
    const arrow=document.getElementById('sso-arrow');
    if(body)body.style.display='';
    if(arrow)arrow.textContent='▶';
  } else {
    collapseSiteStatsOverlay();
  }
}

function _ssoReposition(){
  const el=document.getElementById('site-stats-overlay');
  if(!el)return;
  const mp=document.getElementById('mini-panel');
  if(mp&&mp.classList.contains('open')){
    const r=mp.getBoundingClientRect();
    el.style.top=(r.bottom+2)+'px';
  }
}

function renderSiteStatsOverlay(site){
  const el=document.getElementById('site-stats-overlay');
  if(!el||!site)return;
  const vols=site.volumes||[];
  if(!vols.length){hideSiteStatsOverlay();return;}
  const rows=vols.map(v=>{
    const t=volTotals(v,site.vol_progress), m=volMeasure(v), plan=parseFloat(v.amount)||0;
    const sec=(typeof VOL_SECTIONS!=='undefined'&&VOL_SECTIONS[v.category])||{icon:'•'};
    const two=m.second&&v.layer_id;
    return `<tr>
      <td style="padding:1px 6px 1px 0;white-space:nowrap">${sec.icon} ${esc(v.name||'')}</td>
      <td style="padding:1px 4px;text-align:right;font-weight:600">${fmtN(t.done)}${two?`<div style="font-weight:400;color:#888;font-size:10px">${fmtN(t.done2)}</div>`:''}</td>
      <td style="padding:1px 2px;color:#aaa">/</td>
      <td style="padding:1px 4px;text-align:right">${plan>0?fmtN(plan):'-'}${two?`<div style="color:#888;font-size:10px">${fmtN(+v.amount2||0)}</div>`:''}</td>
      <td style="padding:1px 4px;color:#666">${esc(v.unit||'')}${two?`<div style="font-size:10px">${esc(m.second.unit||'')}</div>`:''}</td>
      <td style="padding:1px 0 1px 6px;text-align:right;color:#888">${plan>0?fmtN(Math.max(0,plan-t.done)):'-'}</td>
      <td style="padding:1px 0 1px 4px;color:#888;font-size:11px">${plan>0?t.pct+'%':''}</td>
    </tr>`;
  }).join('');
  const collapsed=window._ssoCollapsed;
  el.innerHTML=
    `<div id="sso-tab" onclick="toggleSiteStatsOverlay()" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;white-space:nowrap;font-weight:600;font-size:12px">
       <span id="sso-arrow" style="font-size:10px;color:var(--tx3)">${collapsed?'◀':'▶'}</span>📊 Объёмы
     </div>
     <div id="sso-body" style="margin-top:6px;${collapsed?'display:none':''}">
       <table style="border-collapse:collapse;font-size:12px;width:100%">
         <thead><tr style="color:#888;font-size:11px">
           <th style="text-align:left;padding:0 6px 3px 0;font-weight:500">Вид работ</th>
           <th style="padding:0 4px 3px;font-weight:500">Факт</th><th></th>
           <th style="padding:0 4px 3px;font-weight:500">План</th>
           <th style="padding:0 4px 3px;font-weight:500;text-align:left">Ед.</th>
           <th style="padding:0 0 3px 6px;font-weight:500">Остаток</th><th></th>
         </tr></thead>
         <tbody>${rows}</tbody>
       </table>
     </div>`;
  el.style.display='block';
  setTimeout(_ssoReposition, 240);
}

function fmtN(v){
  if(!isFinite(v))return '0';
  if(Math.abs(v-Math.round(v))<1e-9)return String(Math.round(v));
  return v.toFixed(1).replace('.',',');
}

function _showMiniPanel(){
  if(!currentObj)return;
  // Populate mini panel fields
  document.getElementById('mp-name').textContent=currentObj.name||'';
  const chips=[];
  if(currentObj.status)chips.push(`<span class="chip"><span class="sdot ${currentObj.status==='active'?'sa':'sd'}" style="margin-right:2px"></span>${SSL[currentObj.status]||currentObj.status}</span>`);
  if(currentObj.client)chips.push(`<span class="chip">🏢 ${esc(currentObj.client)}</span>`);
  document.getElementById('mp-chips').innerHTML=chips.join('');
  const bases_=(currentObj.bases||[]).length;
  const workers_=(currentObj.bases||[]).reduce((a,b)=>a+(b.workers||[]).length,0);
  const vols_=(currentObj.volumes||[]).length;
  document.getElementById('mp-stats').innerHTML=
    `<span>🏕 Баз: <b>${bases_}</b></span><span>👷 Персонал: <b>${workers_}</b></span><span>📦 Объёмы: <b>${vols_}</b></span>`;
  document.getElementById('mini-panel').classList.add('open');
}

function openFullSitePanel(){
  if(!currentObj||currentType!=='site')return;
  document.getElementById('mini-panel').classList.remove('open');
  hideSiteStatsOverlay();
  openPanel(false);setupSiteTabs();renderTab();
}

function closeMiniPanel(){
  document.getElementById('mini-panel').classList.remove('open');
  hideSiteStatsOverlay();
  currentObj=null;currentType=null;activeSiteId=null;
  clearVolumesFromMap();
  renderSidebar();
  try{repaintMap();}catch(e){}
}
async function selectBase(id){
  try{
    document.getElementById('mini-panel').classList.remove('open');
    hideSiteStatsOverlay();
    const r=await fetch(`${API}/bases/${id}`);
    if(!r.ok)throw new Error('not found');
    currentObj=await r.json();currentType='base';activeSiteId=null;
    openPanel(true);setupBaseTabs();renderTab();
    if(bMarkers[id])map.panTo([currentObj.lat,currentObj.lng],{animate:true});
    await repaintMap();
  }catch(e){toast('Ошибка загрузки базы','err');}
}

function openPanel(isBase){
  const wasOpen=document.getElementById('panel').classList.contains('open');
  document.getElementById('panel').classList.add('open');
  document.body.classList.add('panel-open');
  if(!wasOpen) setTimeout(()=>map.invalidateSize({animate:false,pan:false}),260);
  document.getElementById('ph-title').textContent=currentObj.name;
  const ph=document.getElementById('phdr');
  ph.style.borderBottom=isBase?'3px solid var(--bpb)':'';
  ph.style.background=isBase?'var(--bpl)':'';
  document.getElementById('ph-meta').innerHTML=currentType==='site'
    ?`<span class="chip"><span class="sdot ${currentObj.status==='active'?'sa':'sd'}" style="margin-right:2px"></span>${SSL[currentObj.status]||currentObj.status}</span>${currentObj.client?`<span class="chip">🏢 ${esc(currentObj.client)}</span>`:''}`
    :`<span class="chip" style="background:var(--bpl);color:var(--bpc);border-color:var(--bpb)">🏕 База</span>`;
}
function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.body.classList.remove('panel-open');
  setTimeout(()=>map.invalidateSize({animate:false,pan:false}),260);
  // For sites: go back to mini panel instead of closing entirely
  if(currentType==='site'&&currentObj){
    window._ssoCollapsed=false;
    _showMiniPanel();
    renderSiteStatsOverlay(currentObj);
    return;
  }
  document.getElementById('mini-panel').classList.remove('open');
  hideSiteStatsOverlay();
  currentObj=null;currentType=null;activeSiteId=null;
  clearVolumesFromMap();
  renderSidebar();
  try{repaintMap();}catch(e){}
}
function setupSiteTabs(){
  currentTab='overview';
  document.getElementById('ptabs').innerHTML=[['overview','Обзор'],['bases','Базы'],['volumes','Объёмы'],['photos','📷 Фото']]
    .map(([k,l])=>`<div class="ptab${k===currentTab?' on':''}" data-t="${k}" onclick="switchTab(this)">${l}</div>`).join('');
}
function setupBaseTabs(){
  currentTab='overview';
  document.getElementById('ptabs').innerHTML=[['overview','Обзор'],['workers','Персонал'],['machinery','Техника'],['equipment','Оборудование'],['materials','Материалы'],['photos','📷 Фото']]
    .map(([k,l])=>`<div class="ptab ob${k===currentTab?' on':''}" data-t="${k}" onclick="switchTab(this)">${l}</div>`).join('');
}
function switchTab(el){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');currentTab=el.dataset.t;renderTab();
}
function renderTab(){
  const pb=document.getElementById('pbody');
  if(currentType==='site')({overview:tabSiteOv,bases:tabSiteBases,volumes:tabVolumes,progress:tabProgress,photos:tabPhotos})[currentTab]?.(pb);
  else({overview:tabBaseOv,workers:tabWorkers,machinery:tabMachinery,equipment:tabEquipment,materials:tabMaterials,photos:tabPhotos})[currentTab]?.(pb);
}
// Вкладка «Фото» объекта/базы: сетка, загрузка, просмотр, удаление (renderPhotos — smg.js)
function tabPhotos(pb){
  pb.innerHTML=`<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">${currentType==='site'?'Фото объекта попадают в «Отчёт для заказчика».':'Фото базы.'} Щелчок — просмотр.</div><div id="photos-tab"></div>`;
  renderPhotos(currentType,currentObj.id,document.getElementById('photos-tab'));
}
async function refreshCurrent(){
  if(!currentObj)return;
  const id=currentObj.id;
  try{
    if(currentType==='base'){
      const r=await fetch(`${API}/bases/${id}`);
      if(!r.ok)return;
      currentObj=await r.json();
      const i=bases.findIndex(b=>b.id===id);if(i>=0)bases[i]=currentObj;
    }else{
      const r=await fetch(`${API}/sites/${id}`);
      if(!r.ok)return;
      currentObj=await r.json();
    }
  }catch(e){toast('Ошибка обновления','err');return;}
  // Обновляем pgkMachinery для актуальных маркеров
  try{const r=await fetch(`${API}/pgk/machinery`);if(r.ok)pgkMachinery=await r.json();}catch(e){}
  renderTab();
  // Рисуем маркеры через единый repaintMap
  try{await repaintMap();}catch(e){}
  // Обновляем сайдбар
  try{
    const[sr,br]=await Promise.all([fetch(`${API}/sites`),fetch(`${API}/bases`)]);
    if(sr.ok)sites=await sr.json();
    if(br.ok)bases=await br.json();
    renderSidebar();updateStats();
  }catch(e){}
}

// Объёмы больше не рисуются отдельно: объём — это слой KML (vol-layers.js).
// Пустые заглушки — для старых вызовов (repaintMap, снимок карты и т.п.).
function clearVolumesFromMap(){}
function renderVolumesOnMap(){}
function renderVpLayers(){}
function seedVpVisible(){}

let undoStack=[];
function pushUndo(label,fn){undoStack.push({label,fn});if(undoStack.length>20)undoStack.shift();}
async function undoLast(){
  const op=undoStack.pop();
  if(!op){toast('Нечего отменять','err');return;}
  try{await op.fn();toast('↩ Отменено: '+op.label,'ok');}catch(e){toast('Не удалось отменить','err');}
}

// ── MOVE ───────────────────────────────────────────────────
function startMove(type,data){
  moveMode=type;moveData=data;
  const nm=type==='base'?(data.base||data).name:(data.mach||data).name||'объект';
  document.getElementById('bnr-t').textContent='📍 Кликните новое место для: '+nm;
  document.getElementById('bnr').className='show'+(type==='base'?' base':'');
  map.getContainer().style.cursor='crosshair';
  mapMode='__move';
  // Отключаем pointer-events на всех маркерах — иначе они перехватывают клик
  document.querySelectorAll('.leaflet-marker-icon,.leaflet-marker-shadow').forEach(function(el){
    el.style.pointerEvents='none';
  });
}
async function doMoveBase(ll){
  const b=moveData.base||moveData;
  await fetch(`${API}/bases/${b.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,lat:ll.lat,lng:ll.lng,user_name:un()})});
  toast('База перемещена','ok');moveMode=null;moveData=null;
  restoreMarkerEvents();
  setTool('view');await loadAll();
}
async function doMoveMachine(ll){
  const{mach,baseId}=moveData;
  await fetch(`${API}/pgk/machinery/${mach.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...mach,lat:ll.lat,lng:ll.lng,base_id:baseId||null,user_name:un()})});
  toast('Техника перемещена','ok');moveMode=null;moveData=null;
  restoreMarkerEvents();
  setTool('view');
  if(currentObj)await refreshCurrent();else await loadAll();
}

function toggleMpExport(){
  const d=document.getElementById('mp-exp-drop');
  if(!d)return;
  d.style.display=d.style.display==='block'?'none':'block';
}
document.addEventListener('click',e=>{
  const drop=document.getElementById('mp-exp-drop');
  if(drop&&drop.style.display==='block'&&!e.target.closest('#mp-exp-drop')&&!e.target.closest('#mp-exp-btn')){
    drop.style.display='none';
  }
});

// ═══════════════════════════════════════════════════════════
// SITE PANEL TABS
// ═══════════════════════════════════════════════════════════
