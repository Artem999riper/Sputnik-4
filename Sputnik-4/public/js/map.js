function initMap(){
  map=L.map('map',{center:[62,55],zoom:5,zoomControl:false,attributionControl:false,maxZoom:21});
  const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM',maxZoom:21,maxNativeZoom:19});
  const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri',maxZoom:21,maxNativeZoom:17});
  sat.on('tileerror',function(e){e.tile.style.display='none';});
  const gsat=L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{attribution:'© Google',maxZoom:21,maxNativeZoom:20,subdomains:['0','1','2','3']});
  gsat.on('tileerror',function(e){e.tile.style.display='none';});
  const ghyb=L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{attribution:'© Google',maxZoom:21,maxNativeZoom:20,subdomains:['0','1','2','3']});
  ghyb.on('tileerror',function(e){e.tile.style.display='none';});
  const esriStreet=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri',maxZoom:21,maxNativeZoom:19});
  esriStreet.on('tileerror',function(e){e.tile.style.display='none';});
  const esriTopo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri',maxZoom:21,maxNativeZoom:19});
  esriTopo.on('tileerror',function(e){e.tile.style.display='none';});
  const topo=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{attribution:'© OpenTopoMap (CC-BY-SA)',maxZoom:17,subdomains:['a','b','c']});
  const carto=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap contributors © CARTO',maxZoom:21,maxNativeZoom:19,subdomains:['a','b','c','d']});
  const rosreestr=L.tileLayer('https://fsgs.cgkipd.ru/eeko/tile/56/{z}/{x}/{y}.png',{attribution:'© Росреестр / ЦГКИПД',maxZoom:18,maxNativeZoom:18});
  rosreestr.on('tileerror',function(e){e.tile.style.display='none';});
  sat.addTo(map);
  window._mapBaseLayers={'🗺 Карта':osm,'🛰 Спутник':sat,'🛰 Спутник Google':gsat,'🗺 Гибрид Google':ghyb,'🗺 Росреестр':rosreestr,'🗺 Улицы ESRI':esriStreet,'🗻 Топо ESRI':esriTopo,'🗻 Топо':topo,'🌍 Светлая':carto};
  window._mapLayerCtrl=L.control.layers(window._mapBaseLayers,{},{position:'topright'}).addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  // Pane для точечных объёмов — поверх vpLayers и KML
  map.createPane('volPointsPane');
  map.getPane('volPointsPane').style.zIndex=640;
  // Панель для +фактов — поверх ВСЕХ слоёв KML (KML-точки лежат в markerPane=600).
  // Рендерер SVG (не canvas): пустые области не перехватывают наведение/клики по нижним слоям.
  map.createPane('factsPane');
  map.getPane('factsPane').style.zIndex=630;
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
  if(typeof _epActive!=='undefined'&&_epActive){_epFinish(e);return;}
  if(typeof _kdActive!=='undefined'&&_kdActive){_kdRClick(e);return;}
  if(typeof _ksActive!=='undefined'&&_ksActive){_ksRClick(e);return;}
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
    {i:'🔎',l:'Найти на карте',f:openMapSearch},
    {i:'⬚',l:'Выделить объекты (область)',f:startKmlSelectMode},
    {sep:true},
    {i:'📌',l:'Поставить метку',f:()=>openPlaceMarkerModal(e.latlng)},
    {i:'〰️',l:'Нарисовать линию',f:()=>startKmlDraw('line')},
    {i:'⬛',l:'Нарисовать полигон',f:()=>startKmlDraw('polygon')},
    {i:'🔢',l:'Метка по координатам',f:()=>openCoordMarkerModal(e.latlng)},
    {sep:true},
    {i:'📍',l:'Отметка высоты (БСВ-77)',f:()=>showElevationAtPoint(e.latlng)},
    {sep:true},
    {i:'📏',l:'Линейка (замер расстояния)',f:startRuler},
    ...(hasRuler?[{i:'🗑',l:'Убрать линейку',cls:'dan',f:clearRuler}]:[])
  ]);
}

// ═══════════════════════════════════════════════════════════
// ПОИСК ПО ОБЪЕКТАМ НА КАРТЕ (ПКМ → Найти на карте)
// Ищет по всему, что сейчас загружено: точки/линии KML, факты,
// объёмы, базы, техника. Клик по результату — перелёт + подсветка.
// ═══════════════════════════════════════════════════════════
function _msFeatureName(p){
  if(!p)return '';
  return p.name||p.Name||p.label||p.Label||p.title||p.Title||p.id||p.ID
    ||(p.sem&&p.sem.data&&p.sem.data.label)||'';
}
function _msCollectGroup(g,icon,src,idx){
  try{
    g.eachLayer(function(sub){
      const f=sub.feature;if(!f)return;
      const nm=String(_msFeatureName(f.properties)||'').trim();
      if(!nm)return;
      idx.push({nm:nm,icon:icon,src:src,
        ll:sub.getLatLng?sub.getLatLng():null,
        bounds:(!sub.getLatLng&&sub.getBounds)?sub.getBounds():null});
    });
  }catch(e){}
}
function openMapSearch(){
  const idx=[];
  // KML-слои (глобальные и слои объекта)
  Object.entries(lGroups||{}).forEach(function([lid,g]){
    let lname='KML';
    try{
      const lay=(typeof layers!=='undefined'?layers:[]).find(x=>x.id===lid||('s_'+x.id)===lid);
      if(lay&&lay.name)lname=lay.name;
    }catch(e){}
    _msCollectGroup(g,'🗺',lname,idx);
  });
  // Факты и объёмы текущего объекта
  Object.values(typeof vpLayers!=='undefined'?vpLayers:{}).forEach(g=>_msCollectGroup(g,'📈','Факт',idx));
  Object.values(typeof volLayers!=='undefined'?volLayers:{}).forEach(g=>_msCollectGroup(g,'📐','Объём',idx));
  // Базы и техника
  (typeof bases!=='undefined'?bases:[]).forEach(function(b){
    if(b.lat&&b.lng)idx.push({nm:b.name,icon:'🏕',src:'База',ll:L.latLng(b.lat,b.lng)});
  });
  (typeof pgkMachinery!=='undefined'?pgkMachinery:[]).forEach(function(m){
    if(m.lat&&m.lng)idx.push({nm:m.name,icon:'🚛',src:'Техника',ll:L.latLng(m.lat,m.lng)});
  });
  window._mapSearchIdx=idx;
  showModal('🔎 Поиск на карте',
    `<input id="msearch-inp" type="search" placeholder="Имя скважины, точки, базы…" autocomplete="off"
       style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);outline:none"
       oninput="mapSearchRender(this.value)" onkeydown="if(event.key==='Enter')mapSearchGoFirst()">
     <div style="font-size:10px;color:var(--tx3);margin:4px 2px 6px">Объектов на карте: <b>${idx.length}</b> · Enter — перейти к первому</div>
     <div id="msearch-res" style="max-height:300px;overflow-y:auto"></div>`,
    [{label:'Закрыть',cls:'bs',fn:closeModal}]);
  setTimeout(function(){const i=document.getElementById('msearch-inp');if(i)i.focus();},60);
  mapSearchRender('');
}
function mapSearchRender(q){
  const box=document.getElementById('msearch-res');if(!box)return;
  q=String(q||'').trim().toLowerCase();
  const idx=window._mapSearchIdx||[];
  if(q.length<1){
    box.innerHTML='<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Начните вводить название</div>';
    return;
  }
  const starts=[],contains=[];
  idx.forEach(function(it,i){
    const nm=it.nm.toLowerCase();
    if(nm.startsWith(q))starts.push(i);
    else if(nm.includes(q))contains.push(i);
  });
  const hits=starts.concat(contains).slice(0,40);
  window._mapSearchHits=hits;
  if(!hits.length){
    box.innerHTML='<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Ничего не найдено</div>';
    return;
  }
  box.innerHTML=hits.map(function(i){
    const it=(window._mapSearchIdx||[])[i];
    return `<div onclick="mapSearchGo(${i})"
      style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:var(--rs);cursor:pointer;font-size:12px"
      onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
      <span>${it.icon}</span>
      <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.nm)}</span>
      <span style="font-size:10px;color:var(--tx3);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(it.src)}</span>
    </div>`;
  }).join('');
}
function mapSearchGoFirst(){
  const hits=window._mapSearchHits||[];
  if(hits.length)mapSearchGo(hits[0]);
}
function mapSearchGo(i){
  const it=(window._mapSearchIdx||[])[i];if(!it)return;
  closeModal();
  switchView('map');
  let ll=it.ll;
  if(it.bounds){
    try{map.flyToBounds(it.bounds.pad(.4),{duration:.8});ll=it.bounds.getCenter();}catch(e){}
  } else if(ll){
    map.flyTo(ll,Math.max(map.getZoom(),16),{duration:.8});
  }
  if(ll)_mapSearchHighlight(ll,it.nm);
}
// Пульсирующая подсветка найденного объекта
function _mapSearchHighlight(ll,nm){
  if(!document.getElementById('msearch-pulse-css')){
    const st=document.createElement('style');
    st.id='msearch-pulse-css';
    st.textContent='@keyframes msPulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.8);opacity:0}}'+
      '.ms-pulse{width:46px;height:46px;border-radius:50%;border:3px solid #f59e0b;box-sizing:border-box;animation:msPulse 1.1s ease-out infinite}';
    document.head.appendChild(st);
  }
  const mk=L.marker(ll,{interactive:false,icon:L.divIcon({className:'',iconSize:[46,46],iconAnchor:[23,23],
    html:'<div class="ms-pulse"></div>'})}).addTo(map);
  if(nm)mk.bindTooltip(esc(nm),{permanent:true,className:'mlbl',direction:'top',offset:[0,-16]}).openTooltip();
  setTimeout(function(){try{map.removeLayer(mk);}catch(e){}},3200);
}

// ═══════════════════════════════════════════════════════════
// TOOLS & MODES
// ═══════════════════════════════════════════════════════════
// Снимает «заморозку» маркеров (pointer-events:none), которую ставит режим перемещения.
// Без этого после выхода из перемещения на маркеры нельзя навести —
// курсор остаётся «ладонью» вместо указателя.
function restoreMarkerEvents(){
  document.querySelectorAll('.leaflet-marker-icon,.leaflet-marker-shadow').forEach(function(el){el.style.pointerEvents='';});
}
function setTool(t){
  // Любой переход инструмента прекращает незавершённое перемещение и «размораживает» маркеры
  if(moveMode){moveMode=null;moveData=null;}
  restoreMarkerEvents();
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
  if(typeof _kdActive!=='undefined'&&_kdActive){_kdCancel();return;}
  if(typeof _ksActive!=='undefined'&&_ksActive){_ksCancel();return;}
  if(drawMode){cancelDraw();return;}
  moveMode=null;moveData=null;
  restoreMarkerEvents();
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
  document.getElementById('workers-page').classList.toggle('show',v==='workers');
  document.getElementById('machinery-page').classList.toggle('show',v==='machinery');
  document.getElementById('equipment-page').classList.toggle('show',v==='equipment');
  document.getElementById('materials-page').classList.toggle('show',v==='materials');
  document.getElementById('gruz-page').classList.toggle('show',v==='gruz');
  document.getElementById('gtasks-page').classList.toggle('show',v==='gtasks');
  const sp=document.getElementById('smg-page');if(sp)sp.classList.toggle('show',v==='smg');
  const fp=document.getElementById('field-page');if(fp)fp.classList.toggle('show',v==='field');
  const mp=document.getElementById('mto-page');if(mp)mp.classList.toggle('show',v==='mto');
  const bp=document.getElementById('brigades-page');if(bp)bp.classList.toggle('show',v==='brigades');

  document.getElementById('sidebar').style.display='flex';
  document.getElementById('mtb').style.display=v==='map'?'flex':'none';
  if(typeof updateCoordWidgetVisibility==='function')updateCoordWidgetVisibility();
  if(v!=='map'&&_machFocusActive){setMachineryFocus(false);const btn=document.getElementById('tool-machine');if(btn)btn.classList.remove('on');_machFocusActive=false;}
  if(v==='dash'){closePanel();if(typeof loadDashboard==='function')loadDashboard();}
  if(v==='workers'){closePanel();pgkTab='workers';if(typeof loadPGK==='function')loadPGK();}
  if(v==='machinery'){closePanel();pgkTab='machinery';if(typeof loadPGK==='function')loadPGK();}
  if(v==='equipment'){closePanel();pgkTab='equipment';if(typeof loadPGK==='function')loadPGK();}
  if(v==='materials'){closePanel();pgkTab='materials';if(typeof loadPGK==='function')loadPGK();}
  if(v==='gruz'){closePanel();if(typeof loadGruz==='function')loadGruz();}
  if(v==='gtasks'){closePanel();if(typeof loadGTasks==='function')loadGTasks();}
  if(v==='smg'){closePanel();if(typeof loadSMG==='function')loadSMG();}
  if(v==='field'){closePanel();if(typeof loadField==='function')loadField();}
  if(v==='mto'){closePanel();if(typeof loadMTO==='function')loadMTO();}
  if(v==='pers'){closePanel();if(typeof loadPersonnel==='function')loadPersonnel();}
  if(v==='brigades'){closePanel();if(typeof loadBrigades==='function')loadBrigades();}
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
      layers.forEach(l=>{ layerLabels[l.id]=!!l.show_labels; });
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
