function initMap(){
  map=L.map('map',{center:[62,55],zoom:5,zoomControl:false,attributionControl:false});
  const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM',maxZoom:19});
  const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri',maxZoom:19});
  const topo=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{attribution:'© OpenTopoMap (CC-BY-SA)',maxZoom:17,subdomains:['a','b','c']});
  osm.addTo(map);
  window._mapBaseLayers={'🗺 Карта':osm,'🛰 Спутник':sat,'🗻 Топо':topo};
  window._mapLayerCtrl=L.control.layers(window._mapBaseLayers,{},{position:'topright'}).addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  // Pane для точечных объёмов — поверх vpLayers и KML
  map.createPane('volPointsPane');
  map.getPane('volPointsPane').style.zIndex=450;
  map.on('click',onMapClick);
  map.on('contextmenu',onMapRClick);
  map.on('zoomend',_updateKmlLabelScale);
  document.addEventListener('click',e=>{if(!e.target.closest('#ctx'))hideCtx();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();cancelMode();clearRuler();}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undoLast();}if(e.key==='z'&&!e.ctrlKey&&!e.metaKey&&rulerActive){rulerUndoLast();}});
  // Инициализация слоёв рельефа (terrain.js)
  setTimeout(initTerrain, 100);
  // Инициализация менеджера KML слоёв
  setTimeout(initKmlManager, 150);
}

function onMapClick(e){
  // если контекстное меню открыто — просто закрываем его, не обрабатываем клик по карте
  if(document.getElementById('ctx').classList.contains('show')){hideCtx();return;}
  hideBCard();
  if(moveMode==='base'){doMoveBase(e.latlng);return;}
  if(moveMode==='machine'){doMoveMachine(e.latlng);return;}
  if(mapMode==='base'){openAddBaseModal(e.latlng.lat,e.latlng.lng);return;}
  if(mapMode==='machine'&&machinePlaceId){placeMachineOnMap(e.latlng.lat,e.latlng.lng);return;}
  if(drawMode){addDrawPt(e.latlng);return;}
}
function onMapRClick(e){
  e.originalEvent.preventDefault();
  if(vertexEditLayerId){_handleVertexEditRCM(e);return;}
  if(drawMode){
    showCtx(e.originalEvent.clientX,e.originalEvent.clientY,[
      {i:'✅',l:'Завершить рисование',f:finishDraw},
      {i:'↩️',l:'Отменить последнюю точку',f:undoDrawPt},
      {sep:true},
      {i:'❌',l:'Отменить рисование',cls:'dan',f:cancelDraw}
    ]);
    return;
  }
  if(rulerActive){
    showCtx(e.originalEvent.clientX,e.originalEvent.clientY,[
      {i:'↩️',l:'Отменить последнюю точку',f:rulerUndoLast},
      {i:'✅',l:'Завершить замер',f:stopRuler},
      {sep:true},
      {i:'🗑',l:'Отменить линейку',cls:'dan',f:clearRuler}
    ]);
    return;
  }
  const hasRuler=rulerPts.length>=2;
  showCtx(e.originalEvent.clientX,e.originalEvent.clientY,[
    {i:'📏',l:'Линейка (замер расстояния)',f:startRuler},
    ...(hasRuler?[{i:'🗑',l:'Убрать линейку',cls:'dan',f:clearRuler}]:[])
  ]);
}

// ═══════════════════════════════════════════════════════════
// TOOLS & MODES
// ═══════════════════════════════════════════════════════════
function setTool(t){
  mapMode=t;
  document.querySelectorAll('.mt').forEach(b=>b.classList.remove('on','onb'));
  const el=document.getElementById('tool-'+t);
  if(el)el.classList.add(t==='base'?'onb':'on');
  const msgs={base:'Кликните на карту для новой базы',machine:null};
  const bnr=document.getElementById('bnr');
  if(t==='machine'){
    mapMode='machine';
    // Если вызвано из enterPlaceMode (machinePlaceId уже установлен) — режим размещения
    if(machinePlaceId){
      bnr.className='show';
      map.getContainer().style.cursor='crosshair';
    } else {
      // Кнопка тулбара — режим «Фокус техника»: затемнить всё кроме маркеров техники
      bnr.className='';map.getContainer().style.cursor='';
      const btn=document.getElementById('tool-machine');
      const alreadyFocus=btn&&btn.classList.contains('on');
      if(alreadyFocus){
        // Выключаем режим фокуса
        setMachineryFocus(false);
        btn.classList.remove('on');
        mapMode='view';
      } else {
        if(btn)btn.classList.add('on');
        if(pgkMachinery&&pgkMachinery.length){
          renderAllMachinery();
          setTimeout(()=>setMachineryFocus(true),50);
          const placed=pgkMachinery.filter(m=>m.lat&&m.lng).length;
          toast('🚛 Фокус: техника на карте — '+placed+' ед.','ok');
        } else {
          fetch(`${API}/pgk/machinery`).then(r=>r.json()).then(mm=>{
            pgkMachinery=mm;renderAllMachinery();
            setTimeout(()=>setMachineryFocus(true),50);
            toast('🚛 Фокус: техника на карте — '+mm.filter(m=>m.lat&&m.lng).length+' ед.','ok');
          }).catch(()=>{});
        }
      }
    }
  } else if(msgs[t]){
    document.getElementById('bnr-t').textContent=msgs[t];
    bnr.className='show'+(t==='base'?' base':'');
    map.getContainer().style.cursor='crosshair';
  } else {
    bnr.className='';map.getContainer().style.cursor='';machinePlaceId=null;
  }
}
function cancelMode(){
  if(drawMode){cancelDraw();return;}
  moveMode=null;moveData=null;
  document.querySelectorAll('.leaflet-marker-icon,.leaflet-marker-shadow').forEach(function(el){el.style.pointerEvents='';});
  setMachineryFocus(false);
  const btn=document.getElementById('tool-machine');if(btn)btn.classList.remove('on');
  setTool('view');
}

// ── Machinery focus mode: dim all non-machinery panes ──────────────────────
let _machFocusActive=false;
function setMachineryFocus(on){
  _machFocusActive=on;
  // Panes to dim: tilePane (basemap), overlayPane (KML/GeoJSON polygons), shadowPane
  const dimPanes=['tilePane','overlayPane','shadowPane','markerPane'];
  // We only dim non-machine marker pane; machine markers are in markerPane but we
  // handle it by hiding base markers (bMarkers) and vol/kml layers via opacity
  if(on){
    // Dim tile and overlay panes
    const tp=map.getPane('tilePane');if(tp)tp.style.opacity='.25';
    const op=map.getPane('overlayPane');if(op)op.style.opacity='.18';
    // Hide base markers
    Object.values(bMarkers||{}).forEach(function(mk){
      const el=mk.getElement?mk.getElement():null;
      if(el)el.style.opacity='0.12';
    });
    // Hide volume / vp layers
    Object.values(volLayers||{}).forEach(function(g){try{g.setStyle({opacity:.08,fillOpacity:.04});}catch(e){}});
    Object.values(vpLayers||{}).forEach(function(g){try{g.setStyle({opacity:.08,fillOpacity:.04});}catch(e){}});
    // Hide KML layer groups
    Object.values(lGroups||{}).forEach(function(g){
      const el=g.getPane?null:null;
      try{if(g.setStyle)g.setStyle({opacity:.08,fillOpacity:.04});}catch(e){}
      try{g.eachLayer(function(l){const e2=l.getElement?l.getElement():null;if(e2)e2.style.opacity='.08';});}catch(e){}
    });
    // Machine markers stay full opacity — ensure they're on top
    Object.values(mMarkers||{}).forEach(function(mk){
      const el=mk.getElement?mk.getElement():null;
      if(el){el.style.opacity='1';el.style.filter='drop-shadow(0 0 6px rgba(0,120,255,.7))';}
    });
  } else {
    // Restore
    const tp=map.getPane('tilePane');if(tp)tp.style.opacity='';
    const op=map.getPane('overlayPane');if(op)op.style.opacity='';
    Object.values(bMarkers||{}).forEach(function(mk){const el=mk.getElement?mk.getElement():null;if(el)el.style.opacity='';});
    Object.values(volLayers||{}).forEach(function(g){try{g.setStyle({opacity:1,fillOpacity:.25});}catch(e){}});
    Object.values(vpLayers||{}).forEach(function(g){try{g.setStyle({opacity:1,fillOpacity:.25});}catch(e){}});
    Object.values(lGroups||{}).forEach(function(g){
      try{if(g.setStyle)g.setStyle({opacity:.8,fillOpacity:.25});}catch(e){}
      try{g.eachLayer(function(l){const e2=l.getElement?l.getElement():null;if(e2)e2.style.opacity='';});}catch(e){}
    });
    Object.values(mMarkers||{}).forEach(function(mk){
      const el=mk.getElement?mk.getElement():null;
      if(el){el.style.opacity='';el.style.filter='';}
    });
  }
}

// ═══════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════
function switchView(v){
  document.querySelectorAll('.nt').forEach(t=>t.classList.toggle('on',t.dataset.v===v));
  document.getElementById('dash-page').classList.toggle('show',v==='dash');

  document.getElementById('pgk-page').classList.toggle('show',v==='pgk');
  document.getElementById('kam-page').classList.toggle('show',v==='kam');
  document.getElementById('smg-page').classList.toggle('show',v==='smg');
  document.getElementById('gruz-page').classList.toggle('show',v==='gruz');
  document.getElementById('gtasks-page').classList.toggle('show',v==='gtasks');
  document.getElementById('dash-page').classList.toggle('show',v==='dash');

  document.getElementById('sidebar').style.display='flex';
  document.getElementById('mtb').style.display=v==='map'?'flex':'none';
  if(v!=='map'&&_machFocusActive){setMachineryFocus(false);const btn=document.getElementById('tool-machine');if(btn)btn.classList.remove('on');_machFocusActive=false;}
  if(v==='dash'){closePanel();if(typeof loadDashboard==='function')loadDashboard();}
  if(v==='pgk'){closePanel();if(typeof loadPGK==='function')loadPGK();}
  if(v==='kam'){closePanel();if(typeof loadKam==='function')loadKam();}
  if(v==='smg'){closePanel();if(typeof loadSMG==='function')loadSMG();}
  if(v==='gruz'){closePanel();if(typeof loadGruz==='function')loadGruz();}
  if(v==='gtasks'){closePanel();if(typeof loadGTasks==='function')loadGTasks();}
  if(v==='pers'){closePanel();if(typeof loadPersonnel==='function')loadPersonnel();}
}

// ═══════════════════════════════════════════════════════════
// LOAD ALL
// ═══════════════════════════════════════════════════════════
async function loadAll(){
  try{
    const[sr,br,lr,mr]=await Promise.all([
      fetch(`${API}/sites`),fetch(`${API}/bases`),
      fetch(`${API}/layers`),fetch(`${API}/pgk/machinery`)
    ]);
    if(sr.ok)sites=await sr.json(); else if(!Array.isArray(sites))sites=[];
    if(br.ok)bases=await br.json(); else if(!Array.isArray(bases))bases=[];
    if(lr.ok){
      layers=await lr.json();
      // Apply local visibility overrides so user-toggled state survives reloads
      layers.forEach(function(l){ if(layerVisibility.hasOwnProperty(l.id)) l.visible=layerVisibility[l.id]?1:0; });
    } else if(!Array.isArray(layers))layers=[];
    if(mr.ok)pgkMachinery=await mr.json(); else if(!Array.isArray(pgkMachinery))pgkMachinery=[];
  }catch(e){
    toast('⚠️ Нет связи с сервером — запустите start.bat','err');
    sites=Array.isArray(sites)?sites:[];
    bases=Array.isArray(bases)?bases:[];
    layers=Array.isArray(layers)?layers:[];
    pgkMachinery=Array.isArray(pgkMachinery)?pgkMachinery:[];
  }
  try{renderSidebar();}catch(e){}
  try{updateStats();}catch(e){}
  try{renderLP();}catch(e){}
  try{if(kmlPanelOpen)renderKmlPanel();}catch(e){}
  try{repaintMap();}catch(e){}
}

// Поднимает все слои объёмов и прогресса поверх KML
function bringVolumesToFront(){
  try{
    Object.values(volLayers).forEach(function(g){try{g.bringToFront();}catch(e){}});
    Object.values(vpLayers||{}).forEach(function(g){try{g.bringToFront();}catch(e){}});
  }catch(e){}
}

// Единая функция перерисовки карты — вызывается из loadAll и refreshCurrent
async function repaintMap(){
  try{renderBaseMarkers();}catch(e){}
  try{renderLayerGroups();}catch(e){}
  if(activeSiteId && currentType==='site' && currentObj){
    // Если активен объект — показываем его технику и объёмы
    try{renderMachineMarkers(currentObj.bases||[]);}catch(e){}
    try{renderVolumesOnMap(currentObj.volumes||[]);}catch(e){}
    try{renderVpLayers(currentObj.vol_progress||[]);}catch(e){}
  } else if(currentType==='base' && currentObj){
    // Если активна база — показываем её технику
    try{renderMachineMarkers([currentObj]);}catch(e){}
    try{clearVolumesFromMap();}catch(e){}
  } else {
    // Ничего не выбрано — показываем всю расставленную технику
    try{renderAllMachinery();}catch(e){}
    try{clearVolumesFromMap();}catch(e){}
  }
  // Объёмы всегда поверх KML-слоёв
  setTimeout(bringVolumesToFront, 50);
}
function updateStats(){
  document.getElementById('st-s').textContent=sites.length;
  document.getElementById('st-b').textContent=bases.length;
  document.getElementById('st-w').textContent=bases.reduce((a,b)=>a+(b.workers||[]).length,0);
  const mEl=document.getElementById('st-m');
  if(mEl)mEl.textContent=pgkMachinery&&pgkMachinery.length?pgkMachinery.length:bases.reduce((a,b)=>a+(b.machinery||[]).length,0);
}

// ═══════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════
function applyMlblSize(px){
  px=parseInt(px,10);
  document.documentElement.style.setProperty('--mlbl-fs',px+'px');
  const val=document.getElementById('mlbl-size-val');
  if(val)val.textContent=px;
  localStorage.setItem('mlbl_size',px);
}
function toggleSettingsPanel(){
  const p=document.getElementById('settings-panel');
  if(!p)return;
  p.style.display=p.style.display==='block'?'none':'block';
}
(function _initMlblSize(){
  const saved=localStorage.getItem('mlbl_size')||'13';
  applyMlblSize(saved);
  const slider=document.getElementById('mlbl-size-slider');
  if(slider)slider.value=saved;
  document.addEventListener('click',e=>{
    const panel=document.getElementById('settings-panel');
    if(panel&&panel.style.display==='block'&&!e.target.closest('#settings-panel')&&!e.target.closest('#settings-btn')){
      panel.style.display='none';
    }
  });
})();

// ═══════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════
