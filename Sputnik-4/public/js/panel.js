async function selectSite(id){
  try{
    const r=await fetch(`${API}/sites/${id}`);
    if(!r.ok)throw new Error('not found');
    currentObj=await r.json();currentType='site';activeSiteId=id;
    // Show mini panel first
    _showMiniPanel();
    renderSidebar();
    await repaintMap();
    renderVpLayers(currentObj.vol_progress||[]);
  }catch(e){toast('Ошибка загрузки объекта','err');}
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
  openPanel(false);setupSiteTabs();renderTab();
  loadPhotos('site',currentObj.id,'photos-site');
}

function closeMiniPanel(){
  document.getElementById('mini-panel').classList.remove('open');
  currentObj=null;currentType=null;activeSiteId=null;
  clearVolumesFromMap();
  renderSidebar();
  try{repaintMap();}catch(e){}
}
async function selectBase(id){
  try{
    const r=await fetch(`${API}/bases/${id}`);
    if(!r.ok)throw new Error('not found');
    currentObj=await r.json();currentType='base';activeSiteId=null;
    openPanel(true);setupBaseTabs();renderTab();
    if(bMarkers[id])map.panTo([currentObj.lat,currentObj.lng],{animate:true});
    await repaintMap();
    loadPhotos('base',id,'photos-base');
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
  document.getElementById('mini-panel').classList.remove('open');
  document.body.classList.remove('panel-open');
  setTimeout(()=>map.invalidateSize({animate:false,pan:false}),260);
  currentObj=null;currentType=null;activeSiteId=null;
  clearVolumesFromMap();
  renderSidebar();
  try{repaintMap();}catch(e){}
}
function setupSiteTabs(){
  currentTab='overview';
  document.getElementById('ptabs').innerHTML=[['overview','Обзор'],['bases','Базы'],['volumes','Объёмы'],['progress','Прогресс']]
    .map(([k,l])=>`<div class="ptab${k===currentTab?' on':''}" data-t="${k}" onclick="switchTab(this)">${l}</div>`).join('');
}
function setupBaseTabs(){
  currentTab='overview';
  document.getElementById('ptabs').innerHTML=[['overview','Обзор'],['workers','Персонал'],['machinery','Техника'],['equipment','Оборудование'],['materials','Материалы']]
    .map(([k,l])=>`<div class="ptab ob${k===currentTab?' on':''}" data-t="${k}" onclick="switchTab(this)">${l}</div>`).join('');
}
function switchTab(el){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');currentTab=el.dataset.t;renderTab();
}
function renderTab(){
  const pb=document.getElementById('pbody');
  if(currentType==='site')({overview:tabSiteOv,bases:tabSiteBases,volumes:tabVolumes,progress:tabProgress})[currentTab]?.(pb);
  else({overview:tabBaseOv,workers:tabWorkers,machinery:tabMachinery,equipment:tabEquipment,materials:tabMaterials})[currentTab]?.(pb);
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

// ── ЦВЕТ И СЕМАНТИКА ОБЪЁМОВ (объявлены ДО renderVolumesOnMap) ───────────────

// Быстрый попап выбора цвета прямо рядом с курсором
function openVolColorPickerCtx(volId, cx, cy){
  var vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol)return;
  var PRESETS=['#1a56db','#7c3aed','#057a55','#c81e1e','#d97706','#0891b2','#be185d','#374151','#f97316','#16a34a'];
  var el=document.createElement('div');
  el.style.cssText='position:fixed;z-index:10000;background:var(--s);border:1.5px solid var(--bd);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:10px 12px;min-width:220px';
  el.style.left=Math.min(cx,window.innerWidth-240)+'px';
  el.style.top=Math.min(cy,window.innerHeight-140)+'px';
  el.innerHTML='<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--tx)">🎨 Цвет: <b>'+esc(vol.name)+'</b></div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">'
    +PRESETS.map(function(c){return '<div style="width:24px;height:24px;border-radius:50%;background:'+c+';cursor:pointer;border:2px solid '+(vol.color===c?'#111':'transparent')+';transition:transform .1s" onclick="window._applyVolColor(\''+volId+'\',\''+c+'\')" onmouseover="this.style.transform=\'scale(1.2)\'" onmouseout="this.style.transform=\'\'"></div>';}).join('')
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:6px">'
    +'<input type="color" id="_vcpick" value="'+(vol.color||'#1a56db')+'" style="width:36px;height:28px;border:none;padding:0;cursor:pointer;background:none">'
    +'<span style="font-size:10px;color:var(--tx2)">Другой цвет</span>'
    +'<button style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:14px;color:var(--tx3)" onclick="this.closest(\'[data-vcpop]\').remove()">✕</button>'
    +'</div>';
  el.setAttribute('data-vcpop','1');
  document.body.appendChild(el);
  el.querySelector('#_vcpick').addEventListener('input',function(){window._applyVolColor(volId,this.value);});
  setTimeout(function(){
    document.addEventListener('mousedown',function _close(e){
      if(!el.contains(e.target)){el.remove();document.removeEventListener('mousedown',_close);}
    });
  },120);
  window._applyVolColor=function(vid,color){
    var vv=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===vid;});
    if(!vv)return;
    fetch(API+'/volumes/'+vid,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({category:vv.category,name:vv.name,amount:vv.amount,unit:vv.unit,color:color,fill_opacity:vv.fill_opacity,plan_start:vv.plan_start,plan_end:vv.plan_end,notes:vv.notes||'',geojson:vv.geojson||null})})
    .then(function(){el.remove();refreshCurrent();toast('Цвет изменён','ok');});
  };
}

// Семантика точечных объёмов
var VOL_SEM_TYPES={
  'borehole':    {icon:'⚫',label:'Скважина',   hasData:true,  hasNote:false, mapIcon:null},
  'steel_angle': {icon:'📐',label:'Металлический уголок',hasData:false,hasNote:false,mapIcon:null},
  'ggs':         {icon:'🔺',label:'Пункт ГГС',  hasData:false, hasNote:true,  mapIcon:{shape:'triangle',color:'#e02424'}},
  'ogs':         {icon:'🔵',label:'Пункт ОГС',  hasData:false, hasNote:true,  mapIcon:{shape:'circle',  color:'#1a56db'}},
  'repere':      {icon:'📍',label:'Репер',       hasData:false, hasNote:true,  mapIcon:{shape:'diamond', color:'#7c3aed'}},
  'benchmark':   {icon:'🗿',label:'Марка',       hasData:false, hasNote:true,  mapIcon:{shape:'square',  color:'#d97706'}},
  'pit':         {icon:'🟤',label:'Шурф',        hasData:true,  hasNote:false, mapIcon:null},
  'other':       {icon:'📌',label:'Другое',      hasData:false, hasNote:true,  mapIcon:null},
};

function _volParseSem(notes){
  if(!notes)return{type:'',data:{},cleanNotes:''};
  if(notes.indexOf('__SEM__:')!==0)return{type:'',data:{},cleanNotes:notes};
  var rest=notes.slice(8);
  var nl=rest.indexOf('\n');
  var jsonStr=nl>=0?rest.slice(0,nl):rest;
  var cleanNotes=nl>=0?rest.slice(nl+1).trim():'';
  try{var p=JSON.parse(jsonStr);return{type:p.type||'',data:p.data||{},cleanNotes:cleanNotes};}catch(e){}
  return{type:'',data:{},cleanNotes:notes};
}
function _volBuildSem(type,data,cleanNotes){
  if(!type)return cleanNotes||'';
  return '__SEM__:'+JSON.stringify({type:type,data:data})+'\n'+(cleanNotes||'');
}

function openVolPointSemantics(volId){
  var vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol)return;
  var sem=_volParseSem(vol.notes);
  var curType=sem.type||'';
  var curData=sem.data||{};

  function _renderDataFields(type){
    if(type==='borehole'||type==='pit'){
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">'
        +'<div class="fg"><label>Глубина (м)</label><input id="sd-depth" type="number" step="0.1" value="'+(curData.depth||'')+'" placeholder="0.0"></div>'
        +'<div class="fg"><label>Диаметр (мм)</label><input id="sd-diam" type="number" step="1" value="'+(curData.diam||'')+'" placeholder=""></div>'
        +'<div class="fg"><label>УГВ (м)</label><input id="sd-ugv" type="number" step="0.1" value="'+(curData.ugv||'')+'" placeholder="не встречен"></div>'
        +'<div class="fg"><label>Дата бурения</label><input id="sd-date" type="date" value="'+(curData.date||'')+'"></div>'
        +'<div class="fg s2"><label>Описание разреза</label><textarea id="sd-desc" rows="3" placeholder="ИГЭ, литология...">'+(curData.desc||'')+'</textarea></div>'
        +'<div class="fg s2"><label>Исполнитель</label><input id="sd-exec" value="'+(curData.exec||'')+'" placeholder="ФИО бурильщика"></div>'
        +'</div>';
    }
    var semDef=VOL_SEM_TYPES[type]||{};
    if(semDef.hasNote){
      return '<div class="fg s2" style="margin-top:8px"><label>Примечание</label>'
        +'<textarea id="sd-note" rows="3" placeholder="Номер пункта, класс, год закладки...">'+(curData.note||'')+'</textarea></div>';
    }
    return '';
  }
  window._semDataFields=_renderDataFields;

  showModal('🏷 Семантика точки: '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div class="fg s2"><label>Тип объекта</label>'
    +'<div id="sem-type-grid" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">'
    +Object.keys(VOL_SEM_TYPES).map(function(k){
      var s=VOL_SEM_TYPES[k];
      return '<label style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;border:1.5px solid '+(curType===k?'var(--acc)':'var(--bd)')+';background:'+(curType===k?'var(--accl)':'var(--s2)')+';cursor:pointer;font-size:11px;font-weight:600;user-select:none;transition:all .15s" onclick="document.querySelectorAll(\'#sem-type-grid label\').forEach(function(l){l.style.background=\'var(--s2)\';l.style.borderColor=\'var(--bd)\';});this.style.background=\'var(--accl)\';this.style.borderColor=\'var(--acc)\';document.getElementById(\'sem-data-wrap\').innerHTML=window._semDataFields(this.querySelector(\'input\').value)">'
        +'<input type="radio" name="sem-type" value="'+k+'" '+(curType===k?'checked':'')+' style="display:none"> '+s.icon+' '+s.label
        +'</label>';
    }).join('')
    +'</div></div>'
    +'<div id="sem-data-wrap">'+_renderDataFields(curType)+'</div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'💾 Сохранить',cls:'bp',fn:function(){
      var selType=(document.querySelector('input[name="sem-type"]:checked')||{}).value||'';
      var data={};
      if(selType==='borehole'||selType==='pit'){
        data={
          depth:document.getElementById('sd-depth')?.value||'',
          diam:document.getElementById('sd-diam')?.value||'',
          ugv:document.getElementById('sd-ugv')?.value||'',
          date:document.getElementById('sd-date')?.value||'',
          desc:document.getElementById('sd-desc')?.value||'',
          exec:document.getElementById('sd-exec')?.value||''
        };
      } else if((VOL_SEM_TYPES[selType]||{}).hasNote){
        data={note: document.getElementById('sd-note')?.value||''};
      }
      var newNotes=_volBuildSem(selType,data,sem.cleanNotes);
      fetch(API+'/volumes/'+volId,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({category:vol.category,name:vol.name,amount:vol.amount,unit:vol.unit,color:vol.color,fill_opacity:vol.fill_opacity,plan_start:vol.plan_start,plan_end:vol.plan_end,notes:newNotes,geojson:vol.geojson||null})})
      .then(function(){closeModal();refreshCurrent();toast('Семантика сохранена','ok');});
    }}]
  );
}

// Цвет конкретной точки
// vpId — id записи vol_progress (если вызвано из прогресса), иначе null → сохраняем в volumes
function openFeatureColorPicker(volId, featureIdx, cx, cy, geojsonStr, vpId){
  var vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol){toast('Объём не найден','err');return;}
  var srcGj=geojsonStr||vol.geojson;
  if(!srcGj){toast('У объёма нет геометрии на карте','err');return;}
  var gj;
  try{gj=JSON.parse(srcGj);}catch(e){toast('Ошибка разбора геометрии','err');return;}
  if(!gj){toast('Геометрия пустая','err');return;}
  if(!gj.features){
    if(gj.type==='Feature') gj={type:'FeatureCollection',features:[gj]};
    else gj={type:'FeatureCollection',features:[{type:'Feature',geometry:gj,properties:{}}]};
  }
  if(!gj.features.length){toast('Нет точек в объёме','err');return;}
  if(featureIdx<0||featureIdx>=gj.features.length) featureIdx=0;
  var feature=gj.features[featureIdx];
  if(!feature.properties)feature.properties={};
  var curColor=feature.properties.color||vol.color||'#1a56db';
  var PRESETS=['#1a56db','#7c3aed','#057a55','#c81e1e','#d97706','#0891b2','#be185d','#374151','#f97316','#16a34a'];
  document.querySelectorAll('[data-vcpop]').forEach(function(e){e.remove();});
  var el=document.createElement('div');
  el.setAttribute('data-vcpop','1');
  el.style.cssText='position:fixed;z-index:10000;background:var(--s);border:1.5px solid var(--bd);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:10px 12px;min-width:220px';
  el.style.left=Math.min(cx,window.innerWidth-240)+'px';
  el.style.top=Math.min(cy,window.innerHeight-170)+'px';
  el.innerHTML='<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--tx)">🎨 Цвет точки #'+(featureIdx+1)+'<br><span style="font-weight:400;color:var(--tx3)">'+esc(vol.name)+'</span></div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">'
    +PRESETS.map(function(c){
      return '<div style="width:26px;height:26px;border-radius:50%;background:'+c+';cursor:pointer;border:3px solid '+(curColor===c?'#000':'transparent')+';box-sizing:border-box;transition:transform .1s" '
        +'onclick="window._applyFeatureColor('+featureIdx+',\''+c+'\')" '
        +'onmouseover="this.style.transform=\'scale(1.15)\'" onmouseout="this.style.transform=\'\'"></div>';
    }).join('')
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:6px">'
    +'<input type="color" id="_fcpick" value="'+curColor+'" style="width:36px;height:28px;border:none;padding:0;cursor:pointer;background:none">'
    +'<span style="font-size:10px;color:var(--tx2)">Другой цвет</span>'
    +'<button style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:14px;color:var(--tx3)" onclick="this.closest(\'[data-vcpop]\').remove()">✕</button>'
    +'</div>';
  document.body.appendChild(el);
  el.querySelector('#_fcpick').addEventListener('input',function(){window._applyFeatureColor(featureIdx,this.value);});
  setTimeout(function(){
    document.addEventListener('mousedown',function _cl(e){
      if(!el.contains(e.target)){el.remove();document.removeEventListener('mousedown',_cl);}
    });
  },120);
  // Замыкание: gj, vpId, volId, vol уже в скоупе
  window._applyFeatureColor=function(idx,color){
    if(!gj.features[idx]) return;
    if(!gj.features[idx].properties) gj.features[idx].properties={};
    gj.features[idx].properties.color=color;
    var newGjStr=JSON.stringify(gj);
    var url=vpId?(API+'/vol_progress/'+vpId):(API+'/volumes/'+volId);
    var body=vpId
      ?{geojson:newGjStr}
      :{category:vol.category,name:vol.name,amount:vol.amount,unit:vol.unit,
        color:vol.color,fill_opacity:vol.fill_opacity,plan_start:vol.plan_start,plan_end:vol.plan_end,
        notes:vol.notes||'',geojson:newGjStr};
    fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(){el.remove();refreshCurrent();toast('Цвет точки #'+(idx+1)+' изменён','ok');})
    .catch(function(){toast('Ошибка сохранения','err');});
  };
}

// Семантика конкретной точки
// vpId — id записи vol_progress (если вызвано из прогресса), иначе null → сохраняем в volumes
function openFeatureSemantics(volId, featureIdx, geojsonStr, vpId){
  var vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol){toast('Объём не найден','err');return;}
  var srcGj=geojsonStr||vol.geojson;
  if(!srcGj){toast('У объёма нет геометрии на карте','err');return;}
  var gj;
  try{gj=JSON.parse(srcGj);}catch(e){toast('Ошибка разбора геометрии','err');return;}
  if(!gj){toast('Геометрия пустая','err');return;}
  if(!gj.features){
    if(gj.type==='Feature') gj={type:'FeatureCollection',features:[gj]};
    else gj={type:'FeatureCollection',features:[{type:'Feature',geometry:gj,properties:{}}]};
  }
  if(!gj.features.length){toast('Нет точек в объёме','err');return;}
  if(featureIdx<0||featureIdx>=gj.features.length) featureIdx=0;
  var feature=gj.features[featureIdx];
  if(!feature.properties)feature.properties={};
  var sem=feature.properties.sem||{};
  var curType=sem.type||'';
  var curData=sem.data||{};
  // KML snap name: pre-select borehole if name exists and no type yet
  var kmlName=feature.properties.name||'';
  if(kmlName&&!curType){curType='borehole';}
  if(kmlName&&!curData.label){curData=Object.assign({label:kmlName},curData);}

  function _renderDataFields(type){
    if(type==='borehole'||type==='pit'){
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">'
        +'<div class="fg s2"><label>Название / Номер</label><input id="sd-label" value="'+(curData.label||'')+'" placeholder="СКВ-1, ПТ-2/23..."></div>'
        +'<div class="fg"><label>Глубина (м)</label><input id="sd-depth" type="number" step="0.1" value="'+(curData.depth||'')+'" placeholder="0.0"></div>'
        +'<div class="fg"><label>Диаметр (мм)</label><input id="sd-diam" type="number" step="1" value="'+(curData.diam||'')+'" placeholder=""></div>'
        +'<div class="fg"><label>УГВ (м)</label><input id="sd-ugv" type="number" step="0.1" value="'+(curData.ugv||'')+'" placeholder="не встречен"></div>'
        +'<div class="fg"><label>Дата бурения</label><input id="sd-date" type="date" value="'+(curData.date||'')+'"></div>'
        +'<div class="fg s2"><label>Описание разреза</label><textarea id="sd-desc" rows="3" placeholder="ИГЭ, литология...">'+(curData.desc||'')+'</textarea></div>'
        +'<div class="fg s2"><label>Исполнитель</label><input id="sd-exec" value="'+(curData.exec||'')+'" placeholder="ФИО бурильщика"></div>'
        +'</div>';
    }
    var semDef=VOL_SEM_TYPES[type]||{};
    if(semDef.hasNote){
      return '<div class="fg s2" style="margin-top:8px"><label>Примечание</label>'
        +'<textarea id="sd-note" rows="3" placeholder="Номер пункта, класс, год закладки...">'+(curData.note||'')+'</textarea></div>';
    }
    return '<div style="padding:8px 0;font-size:11px;color:var(--tx3)">Дополнительных данных нет</div>';
  }
  window._semDataFields=_renderDataFields;

  showModal('🏷 Точка #'+(featureIdx+1)+' — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div class="fg s2"><label>Тип объекта</label>'
    +'<div id="sem-type-grid" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">'
    +Object.keys(VOL_SEM_TYPES).map(function(k){
      var s=VOL_SEM_TYPES[k];
      var active=curType===k;
      return '<label style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;border:1.5px solid '+(active?'var(--acc)':'var(--bd)')+';background:'+(active?'var(--accl)':'var(--s2)')+';cursor:pointer;font-size:11px;font-weight:600;user-select:none;transition:all .15s" '
        +'onclick="document.querySelectorAll(\'#sem-type-grid label\').forEach(function(l){l.style.background=\'var(--s2)\';l.style.borderColor=\'var(--bd)\';});this.style.background=\'var(--accl)\';this.style.borderColor=\'var(--acc)\';document.getElementById(\'sem-data-wrap\').innerHTML=window._semDataFields(this.querySelector(\'input\').value)">'
        +'<input type="radio" name="sem-type" value="'+k+'" '+(active?'checked':'')+' style="display:none"> '+s.icon+' '+s.label
        +'</label>';
    }).join('')
    +'</div></div>'
    +'<div id="sem-data-wrap">'+_renderDataFields(curType)+'</div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'💾 Сохранить',cls:'bp',fn:function(){
      var selType=(document.querySelector('input[name="sem-type"]:checked')||{}).value||'';
      var data={};
      if(selType==='borehole'||selType==='pit'){
        data={
          label:document.getElementById('sd-label')?.value||'',
          depth:document.getElementById('sd-depth')?.value||'',
          diam: document.getElementById('sd-diam')?.value||'',
          ugv:  document.getElementById('sd-ugv')?.value||'',
          date: document.getElementById('sd-date')?.value||'',
          desc: document.getElementById('sd-desc')?.value||'',
          exec: document.getElementById('sd-exec')?.value||''
        };
      } else if((VOL_SEM_TYPES[selType]||{}).hasNote){
        data={note: document.getElementById('sd-note')?.value||''};
      }
      feature.properties.sem={type:selType,data:data};
      var newGjStr=JSON.stringify(gj);
      // Сохраняем в vol_progress (если vpId) или в volumes (если нет)
      var url=vpId?(API+'/vol_progress/'+vpId):(API+'/volumes/'+volId);
      var body=vpId
        ?{geojson:newGjStr}
        :{category:vol.category,name:vol.name,amount:vol.amount,unit:vol.unit,
          color:vol.color,fill_opacity:vol.fill_opacity,plan_start:vol.plan_start,plan_end:vol.plan_end,
          notes:vol.notes||'',geojson:newGjStr};
      fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(){closeModal();refreshCurrent();toast('Семантика точки #'+(featureIdx+1)+' сохранена','ok');})
      .catch(function(){toast('Ошибка сохранения','err');});
    }}]
  );
}



// ═══════════════════════════════════════════════════════════
// VOLUMES ON MAP
// ═══════════════════════════════════════════════════════════
function clearVolumesFromMap(){
  Object.values(volLayers).forEach(g=>{try{map.removeLayer(g);}catch(e){}});volLayers={};
  Object.values(vpLayers||{}).forEach(g=>{try{map.removeLayer(g);}catch(e){}});vpLayers={};
}
function renderVolumesOnMap(vols){
  clearVolumesFromMap();
  (vols||[]).forEach(function(vol){
    if(!vol.geojson)return;
    if(volVisible[vol.id]===true)return;
    try{
      var gj=JSON.parse(vol.geojson);
      // Determine if this volume is a point collection
      var isPointVol=false;
      if(gj.type==='FeatureCollection'&&gj.features&&gj.features.length>0){
        isPointVol=gj.features[0].geometry&&gj.features[0].geometry.type==='Point';
      } else if(gj.geometry&&gj.geometry.type==='Point'){
        isPointVol=true;
      }

      // Присваиваем _idx ДО передачи в L.geoJSON
      var geoType='polygon';
      if(gj.type==='FeatureCollection'&&gj.features){
        gj.features.forEach(function(f,i){ f._idx=i; });
        var firstGeomType=gj.features[0]&&gj.features[0].geometry&&gj.features[0].geometry.type||'';
        if(firstGeomType==='LineString'||firstGeomType==='MultiLineString') geoType='line';
        else if(firstGeomType==='Point') geoType='point';
      } else if(gj.type==='Feature'){
        gj._idx=0;
        var gt=gj.geometry&&gj.geometry.type||'';
        if(gt==='LineString'||gt==='MultiLineString') geoType='line';
        else if(gt==='Point') geoType='point';
      } else if(gj.type){
        // Raw geometry
        gj={type:'Feature',geometry:gj,properties:{},_idx:0};
        if(gj.geometry.type==='LineString'||gj.geometry.type==='MultiLineString') geoType='line';
      }

      var g=L.geoJSON(gj,{
        pane: isPointVol ? 'volPointsPane' : 'overlayPane',
        style:function(feature){
          var c=(feature&&feature.properties&&feature.properties.color)||vol.color||'#1a56db';
          return {color:c,weight:2.5,opacity:.9,fillOpacity:vol.fill_opacity!=null?vol.fill_opacity:.25};
        },
        pointToLayer:function(feature,ll){
          var c=(feature&&feature.properties&&feature.properties.color)||vol.color||'#1a56db';
          var sem=(feature&&feature.properties&&feature.properties.sem)||{};
          var semType=sem.type||'';
          var semDef=VOL_SEM_TYPES[semType]||{};
          var mapIcon=semDef.mapIcon||null;

          if(mapIcon){
            var ic=mapIcon;
            var sz=22;
            var svgShape='';
            if(ic.shape==='triangle'){
              // красный треугольник (ГГС)
              svgShape='<polygon points="12,2 22,20 2,20" fill="'+ic.color+'" stroke="#fff" stroke-width="1.5"/>';
            } else if(ic.shape==='circle'){
              // синий круг (ОГС)
              svgShape='<circle cx="12" cy="12" r="9" fill="'+ic.color+'" stroke="#fff" stroke-width="1.5"/>';
            } else if(ic.shape==='diamond'){
              // фиолетовый ромб (репер)
              svgShape='<polygon points="12,2 22,12 12,22 2,12" fill="'+ic.color+'" stroke="#fff" stroke-width="1.5"/>';
            } else if(ic.shape==='square'){
              // оранжевый квадрат (марка)
              svgShape='<rect x="3" y="3" width="18" height="18" fill="'+ic.color+'" stroke="#fff" stroke-width="1.5"/>';
            }
            var svgHtml='<svg xmlns="http://www.w3.org/2000/svg" width="'+sz+'" height="'+sz+'" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">'+svgShape+'</svg>';
            var icon=L.divIcon({
              className:'',
              html:'<div style="display:flex;flex-direction:column;align-items:center;gap:1px">'+svgHtml+'</div>',
              iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]
            });
            return L.marker(ll,{icon:icon,pane:'volPointsPane'});
          }
          return L.circleMarker(ll,{radius:7,fillColor:c,color:'#fff',weight:2,opacity:1,fillOpacity:.9,
            pane:'volPointsPane'});
        }
      }).addTo(map).bindTooltip(vol.name,{permanent:false,className:'mlbl'});

      g.eachLayer(function(layer){
        // layer.feature — shallow clone сделанный Leaflet'ом, _idx скопирован
        var feature=layer.feature||null;
        var featureIdx=(feature&&feature._idx!==undefined)?feature._idx:-1;
        var props=(feature&&feature.properties)||{};

        // Семантика из properties.sem (plain object {type, data})
        var sem=props.sem||{};
        var semType=sem.type||'';
        var semData=sem.data||{};
        var semLabel=semType&&VOL_SEM_TYPES[semType]?VOL_SEM_TYPES[semType].icon+' '+VOL_SEM_TYPES[semType].label:'';

        // Цвет точки
        var ptColor=props.color||vol.color||'#1a56db';

        // Тултип
        var tipLines=['<b>'+esc(vol.name)+'</b>'];
        if(semLabel) tipLines.push('<span style="color:'+ptColor+'">'+semLabel+(semData.label?' <b>'+esc(semData.label)+'</b>':'')+'</span>');
        if(featureIdx>=0) tipLines.push('<span style="color:var(--tx3);font-size:10px">точка #'+(featureIdx+1)+'</span>');
        if(vol.amount) tipLines.push(vol.amount+' '+esc(vol.unit));
        if(semType==='borehole'||semType==='pit'){
          if(semData.depth) tipLines.push('⬇ Глубина: <b>'+semData.depth+' м</b>');
          if(semData.diam)  tipLines.push('⌀ Диаметр: <b>'+semData.diam+' мм</b>');
          if(semData.ugv)   tipLines.push('💧 УГВ: <b>'+semData.ugv+' м</b>');
          if(semData.date)  tipLines.push('📅 '+semData.date);
          if(semData.exec)  tipLines.push('👤 '+esc(semData.exec));
          if(semData.desc)  tipLines.push('📋 '+esc(semData.desc));
        } else if(semData.note){
          tipLines.push('📝 '+esc(semData.note));
        }
        layer.bindTooltip(tipLines.join('<br>'),{permanent:false,className:'mlbl'});

        layer.on('click',function(){
          toast(vol.name+(semLabel?' · '+semLabel:'')+(featureIdx>=0?' #'+(featureIdx+1):''),'ok');
        });

        layer.on('contextmenu',function(ev){
          L.DomEvent.stopPropagation(ev);
          ev.originalEvent.preventDefault();
          var cx=ev.originalEvent.clientX, cy=ev.originalEvent.clientY;
          var menuItems=[
            {i:'🔍',l:'Приблизить',f:function(){try{map.fitBounds(g.getBounds().pad(.3));}catch(e){try{map.setView(layer.getLatLng(),16);}catch(e2){}}}},
            {i:'💬',l:'Комментарий',f:function(){openVolCommentModal(vol.id);}},
          ];
          if(isPointVol&&featureIdx>=0){
            menuItems.push({i:'🎨',l:'Цвет этой точки',f:function(){openFeatureColorPicker(vol.id,featureIdx,cx,cy);}});
            menuItems.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vol.id,cx,cy);}});
            menuItems.push({i:'🏷',l:'Семантика этой точки',f:function(){openFeatureSemantics(vol.id,featureIdx);}});
          } else if(featureIdx>=0){
            // Линия или полигон с известным индексом
            var shapeLabel=geoType==='line'?'этой линии':'этого полигона';
            menuItems.push({i:'🎨',l:'Цвет '+shapeLabel,f:function(){openFeatureColorPicker(vol.id,featureIdx,cx,cy);}});
            menuItems.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vol.id,cx,cy);}});
            menuItems.push({i:'✏️',l:'Редактировать вершины',f:function(){startVolVertexEdit(vol.id);}});
            menuItems.push({i:'🖊',l:'Продолжить рисование',f:function(){startVolDraw(vol.id,'add');}});
            menuItems.push({i:'🔄',l:'Перерисовать заново',f:function(){startVolDraw(vol.id,'replace');}});
          } else {
            // featureIdx не определён — используем 0 для линий и полигонов
            var shapeLabel2=geoType==='line'?'этой линии':'этого полигона';
            menuItems.push({i:'🎨',l:'Цвет '+shapeLabel2,f:function(){openFeatureColorPicker(vol.id,0,cx,cy);}});
            menuItems.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vol.id,cx,cy);}});
            menuItems.push({i:'✏️',l:'Редактировать вершины',f:function(){startVolVertexEdit(vol.id);}});
            menuItems.push({i:'🖊',l:'Продолжить рисование',f:function(){startVolDraw(vol.id,'add');}});
            menuItems.push({i:'🔄',l:'Перерисовать заново',f:function(){startVolDraw(vol.id,'replace');}});
          }
          menuItems.push({sep:true});
          menuItems.push({i:'📝',l:'Редактировать данные',f:function(){openEditVolModal(vol.id);}});
          menuItems.push({i:'🚫',l:'Скрыть с карты',f:function(){toggleVolVis(vol.id);}});
          menuItems.push({i:'✂️',l:'Удалить контур',cls:'dan',f:function(){clearVolGeom(vol.id);}});
          menuItems.push({i:'🗑',l:'Удалить объём',cls:'dan',f:function(){deleteVol(vol.id);}});
          showCtx(cx,cy,menuItems);
        });
      });

      // Group-level fallback (срабатывает если клик не попал на конкретный слой)
      g.on('contextmenu',function(ev){
        L.DomEvent.stopPropagation(ev);
        ev.originalEvent.preventDefault();
        var cx=ev.originalEvent.clientX, cy=ev.originalEvent.clientY;
        var items=[
          {i:'🔍',l:'Приблизить',f:function(){try{map.fitBounds(g.getBounds().pad(.3));}catch(e){}}},
          {i:'💬',l:'Комментарий',f:function(){openVolCommentModal(vol.id);}},
          {i:'🎨',l:'Изменить цвет объёма',f:function(){openVolColorPickerCtx(vol.id,cx,cy);}},
        ];
        if(!isPointVol){
          items.push({i:'✏️',l:'Редактировать вершины',f:function(){startVolVertexEdit(vol.id);}});
          items.push({i:'🖊',l:'Продолжить рисование',f:function(){startVolDraw(vol.id,'add');}});
          items.push({i:'🔄',l:'Перерисовать заново',f:function(){startVolDraw(vol.id,'replace');}});
        }
        items.push({sep:true});
        items.push({i:'📝',l:'Редактировать данные',f:function(){openEditVolModal(vol.id);}});
        items.push({i:'🚫',l:'Скрыть с карты',f:function(){toggleVolVis(vol.id);}});
        items.push({i:'✂️',l:'Удалить контур',cls:'dan',f:function(){clearVolGeom(vol.id);}});
        items.push({i:'🗑',l:'Удалить объём',cls:'dan',f:function(){deleteVol(vol.id);}});
        showCtx(cx,cy,items);
      });

      volLayers[vol.id]=g;
    }catch(e){ console.error('renderVolumesOnMap error:',e); }
  });
  setTimeout(bringVolumesToFront,50);
}

function openVolColorModal(volId){
  var vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol)return;
  showModal('Изменить цвет',
    '<div class="fg"><label>Цвет контура</label><input id="f-vc" type="color" value="'+(vol.color||'#1a56db')+'" style="width:100%;height:40px"></div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Применить',cls:'bp',fn:function(){
      var newColor=v('f-vc');
      fetch(API+'/volumes/'+volId,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({category:vol.category,name:vol.name,amount:vol.amount,unit:vol.unit,color:newColor,notes:vol.notes||'',geojson:vol.geojson||null})})
      .then(function(){closeModal();refreshCurrent();toast('Цвет изменён','ok');});
    }}]);
}

// Быстрый выбор цвета прямо через попап над точкой контекстного меню
function clearVpLayers(){
  Object.values(vpLayers).forEach(g=>{try{map.removeLayer(g);}catch(e){}});
  vpLayers={};
}
function renderVpLayers(volProgressList){
  // Remove old layers first
  clearVpLayers();
  (volProgressList||[]).forEach(function(p){
    if(!p.geojson)return;
    if(vpVisible[p.id]===false)return; // явно скрыт пользователем
    var vol=(currentObj&&currentObj.volumes||[]).find(function(v){return v.id===p.volume_id;});
    var color=vol?vol.color||'#1a56db':'#1a56db';
    var fillOp=vol&&vol.fill_opacity!==undefined&&vol.fill_opacity!==null?vol.fill_opacity:.3;
    try{
      var pGj=JSON.parse(p.geojson);
      var pIsPoint=pGj.type==='FeatureCollection'
        ?(pGj.features&&pGj.features[0]&&pGj.features[0].geometry&&pGj.features[0].geometry.type==='Point')
        :(pGj.geometry&&pGj.geometry.type==='Point');

      // Присваиваем _idx каждому feature для идентификации
      if(pGj.type==='FeatureCollection'&&pGj.features){
        pGj.features.forEach(function(f,i){f._idx=i;});
      }

      var g=L.geoJSON(pGj,{
        style:function(feature){
          var c=(feature&&feature.properties&&feature.properties.color)||color;
          return {color:c,weight:2,opacity:.85,fillOpacity:fillOp,dashArray:'4 3'};
        },
        pointToLayer:function(feature,ll){
          var c=(feature&&feature.properties&&feature.properties.color)||color;
          return L.circleMarker(ll,{radius:6,fillColor:c,color:'#fff',weight:2,fillOpacity:Math.max(fillOp,0.6)});
        }
      }).addTo(map);

      // НЕ вешаем общий тултип на группу — используем только per-layer тултип ниже

      // Тултип per-layer с семантикой (единственный тултип на каждую точку)
      g.eachLayer(function(vpLayer){
        var feat=vpLayer.feature||{};
        var fProps=(feat.properties)||{};
        var sem=fProps.sem||{};
        var semType=sem.type||'';
        var semData=sem.data||{};
        var semLabel=semType&&VOL_SEM_TYPES[semType]?VOL_SEM_TYPES[semType].icon+' '+VOL_SEM_TYPES[semType].label:'';
        var tipLines=[];
        tipLines.push('<b>'+(p.work_date||'')+'</b>'+(p.completed?' · +'+p.completed+(vol?' '+esc(vol.unit):''):''));
        if(semLabel) tipLines.push('<span style="color:var(--acc)">'+semLabel+'</span>');
        if(semType==='borehole'||semType==='pit'){
          if(semData.depth) tipLines.push('⬇ Глубина: <b>'+semData.depth+' м</b>');
          if(semData.diam)  tipLines.push('⌀ Диаметр: <b>'+semData.diam+' мм</b>');
          if(semData.ugv)   tipLines.push('💧 УГВ: <b>'+semData.ugv+' м</b>');
          if(semData.date)  tipLines.push('📅 '+semData.date);
          if(semData.exec)  tipLines.push('👤 '+esc(semData.exec));
          if(semData.desc)  tipLines.push('📋 '+esc(semData.desc));
        } else if(semData.note){
          tipLines.push('📝 '+esc(semData.note));
        }
        if(p.notes) tipLines.push('💬 '+esc(p.notes));
        vpLayer.bindTooltip(tipLines.join('<br>'),{permanent:false,className:'mlbl',direction:'top'});
      });

      // Регистрируем через eachLayer чтобы знать конкретную точку
      g.eachLayer(function(vpLayer){
        vpLayer.on('contextmenu',function(ev){
          L.DomEvent.stopPropagation(ev);
          ev._stopped=true;
          ev.originalEvent.preventDefault();
          var cx=ev.originalEvent.clientX, cy=ev.originalEvent.clientY;

          // Ищем ближайший feature в p.geojson (геометрия прогресса — именно она на карте)
          var clickedFeatureIdx=-1;
          var vpGjStr=p.geojson; // геометрия этой записи прогресса
          if(pIsPoint&&vpGjStr&&vpLayer.getLatLng){
            try{
              var clickLL=vpLayer.getLatLng();
              var vpGj=JSON.parse(vpGjStr);
              var minDist=Infinity;
              (vpGj.features||[]).forEach(function(f,i){
                if(f.geometry&&f.geometry.type==='Point'){
                  var fc=f.geometry.coordinates;
                  var d=Math.pow(fc[1]-clickLL.lat,2)+Math.pow(fc[0]-clickLL.lng,2);
                  if(d<minDist){minDist=d;clickedFeatureIdx=i;}
                }
              });
            }catch(e){}
          }

          var items=[
            {i:'🔍',l:'Приблизить',f:function(){try{map.fitBounds(g.getBounds().pad(.3));}catch(e){}}},
            {i:'✏️',l:'Редактировать вершины (факт)',f:function(){startVpVertexEdit(p.id);}},
            {i:'🖊',l:'Перерисовать (факт)',f:function(){startVpDraw(p.id,p.volume_id);}},
            {i:'✂️',l:'Удалить контур факта',f:function(){clearVpGeom(p.id,p.volume_id);}},
            {sep:true},
          ];
          if(vol||(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===p.volume_id;})){
            var vid=p.volume_id;
            var vpGs=vpGjStr;
            var vpId=p.id;
            if(pIsPoint&&clickedFeatureIdx>=0){
              var ci=clickedFeatureIdx;
              items.push({i:'🎨',l:'Цвет этой точки',f:function(){openFeatureColorPicker(vid,ci,cx,cy,vpGs,vpId);}});
              items.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vid,cx,cy);}});
              items.push({i:'🏷',l:'Семантика этой точки',f:function(){openFeatureSemantics(vid,ci,vpGs,vpId);}});
            } else if(pIsPoint){
              items.push({i:'🎨',l:'Цвет точки',f:function(){openFeatureColorPicker(vid,0,cx,cy,vpGs,vpId);}});
              items.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vid,cx,cy);}});
              items.push({i:'🏷',l:'Семантика точки',f:function(){openFeatureSemantics(vid,0,vpGs,vpId);}});
            } else {
              // Линия или полигон — определяем тип из geojson
              var vpShapeType='polygon';
              try{var _tgj=JSON.parse(vpGjStr||'{}');var _tgt=(_tgj.features&&_tgj.features[0]&&_tgj.features[0].geometry&&_tgj.features[0].geometry.type)||_tgj.geometry&&_tgj.geometry.type||'';if(_tgt==='LineString'||_tgt==='MultiLineString')vpShapeType='line';}catch(e){}
              var vpShapeLbl=vpShapeType==='line'?'этой линии':'этого полигона';
              items.push({i:'🎨',l:'Цвет '+vpShapeLbl,f:function(){openFeatureColorPicker(vid,0,cx,cy,vpGs,vpId);}});
              items.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vid,cx,cy);}});
            }
            items.push({i:'📝',l:'Данные объёма',f:function(){openEditVolModal(vid);}});
          }
          items.push({sep:true});
          items.push({i:'🚫',l:'Скрыть слой',f:function(){vpVisible[p.id]=false;renderVpLayers(currentObj&&currentObj.vol_progress||[]);}});
          showCtx(cx,cy,items);
        });
      });

      // Группа-fallback
      g.on('contextmenu',function(ev){
        if(ev._stopped)return;
        L.DomEvent.stopPropagation(ev);
        ev.originalEvent.preventDefault();
        var cx=ev.originalEvent.clientX, cy=ev.originalEvent.clientY;
        var vid=p.volume_id;
        var volObj=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===vid;});
        var items=[
          {i:'🔍',l:'Приблизить',f:function(){try{map.fitBounds(g.getBounds().pad(.3));}catch(e){}}},
          {i:'✏️',l:'Редактировать вершины (факт)',f:function(){startVpVertexEdit(p.id);}},
          {i:'🖊',l:'Перерисовать (факт)',f:function(){startVpDraw(p.id,p.volume_id);}},
          {i:'✂️',l:'Удалить контур факта',f:function(){clearVpGeom(p.id,p.volume_id);}},
          {sep:true},
        ];
        if(vol||volObj){
          var vpGsFb=p.geojson;
          var vpIdFb=p.id;
          if(pIsPoint){
            items.push({i:'🎨',l:'Цвет точки',f:function(){openFeatureColorPicker(vid,0,cx,cy,vpGsFb,vpIdFb);}});
            items.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vid,cx,cy);}});
            items.push({i:'🏷',l:'Семантика точки',f:function(){openFeatureSemantics(vid,0,vpGsFb,vpIdFb);}});
          } else {
            var fbShapeType='polygon';
            try{var _fgj=JSON.parse(vpGsFb||'{}');var _fgt=(_fgj.features&&_fgj.features[0]&&_fgj.features[0].geometry&&_fgj.features[0].geometry.type)||_fgj.geometry&&_fgj.geometry.type||'';if(_fgt==='LineString'||_fgt==='MultiLineString')fbShapeType='line';}catch(e){}
            var fbShapeLbl=fbShapeType==='line'?'этой линии':'этого полигона';
            items.push({i:'🎨',l:'Цвет '+fbShapeLbl,f:function(){openFeatureColorPicker(vid,0,cx,cy,vpGsFb,vpIdFb);}});
            items.push({i:'🎨',l:'Цвет всего объёма',f:function(){openVolColorPickerCtx(vid,cx,cy);}});
          }
          items.push({i:'📝',l:'Данные объёма',f:function(){openEditVolModal(vid);}});
        }
        items.push({sep:true});
        items.push({i:'🚫',l:'Скрыть слой',f:function(){vpVisible[p.id]=false;renderVpLayers(currentObj&&currentObj.vol_progress||[]);}});
        showCtx(cx,cy,items);
      });
      vpLayers[p.id]=g;
    }catch(e){}
  });
  setTimeout(bringVolumesToFront,50);
}
function startVpDraw(factId, volId){
  drawingFactId=factId;
  const sid=currentObj&&currentObj.id;
  const vol=(currentObj&&currentObj.volumes||[]).find(v=>v.id===volId);
  // clear existing tmp layer
  if(drawTmpLayer){try{map.removeLayer(drawTmpLayer);}catch(e){}drawTmpLayer=null;}
  drawPts=[];drawVolId=volId;drawSiteId=sid;drawMode=null;
  switchView('map');
  showModal('Нарисовать на карте — '+(vol?esc(vol.name):'факт'),
    '<div class="draw-hint">📅 <strong>'+(formatDate(factId,'fact'))+'</strong><br>'+
    'Выберите тип геометрии, нажмите «Начать» и рисуйте на карте.<br>'+
    '<strong>ПКМ</strong> → меню рисования</div>'+
    '<div class="fg"><label>Тип</label><select id="f-gtype">'+
    '<option value="polygon">Полигон — площадь</option>'+
    '<option value="points">Точки — скважины</option>'+
    '<option value="line">Линия — маршрут</option>'+
    '</select></div>',
    [{label:'Отмена',cls:'bs',fn:function(){closeModal();drawingFactId=null;}},
     {label:'🖊 Начать',cls:'bp',fn:function(){
       drawMode=v('f-gtype')||'polygon';
       closeModal();
       document.getElementById('bnr-t').textContent='🖊 Рисую факт '+(vol?vol.name:'')+'  — ПКМ для меню';
       document.getElementById('bnr').className='show draw';
       map.getContainer().style.cursor='crosshair';
       toast('Кликайте · ПКМ = меню','ok');
     }}]);
}
function formatDate(factId,prefix){
  // helper: find work_date of a fact
  const p=(currentObj&&currentObj.vol_progress||[]).find(function(x){return x.id===factId;});
  return p?fmt(p.work_date):'';
}
async function clearVpGeom(factId, volId){
  if(!confirm('Удалить контур этой записи?'))return;
  await fetch(API+'/vol_progress/'+factId,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({geojson:null})});
  if(vpLayers[factId]){try{map.removeLayer(vpLayers[factId]);}catch(e){}delete vpLayers[factId];}
  await refreshCurrent();currentTab='volumes';volExpanded[volId]=true;renderTab();
  renderVpLayers(currentObj&&currentObj.vol_progress||[]);
  toast('Контур удалён','ok');
}

function toggleVpVis(factId,volId){
  if(vpVisible[factId]===false){
    vpVisible[factId]=true;   // → показать
  } else {
    vpVisible[factId]=false;  // → скрыть
  }
  if(currentObj)renderVpLayers(currentObj.vol_progress||[]);
  currentTab='volumes';volExpanded[volId]=true;renderTab();
}

function toggleVolVis(volId){
  const isHidden=(volVisible[volId]===true);
  if(isHidden){
    volVisible[volId]=false; // показать
  } else {
    volVisible[volId]=true;  // скрыть
  }
  if(currentObj)renderVolumesOnMap(currentObj.volumes||[]);
  renderTab();
}
function clearVolGeom(volId){
  if(!confirm('Удалить нарисованный контур?'))return;
  const vol=(currentObj&&currentObj.volumes||[]).find(function(x){return x.id===volId;});
  if(!vol){toast('Объём не найден','err');return;}
  fetch(API+'/volumes/'+volId,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({category:vol.category,name:vol.name,amount:vol.amount,unit:vol.unit,color:vol.color,notes:vol.notes||'',geojson:null})})
  .then(function(r){
    if(!r.ok){toast('Ошибка '+r.status,'err');return;}
    if(volLayers[volId]){try{map.removeLayer(volLayers[volId]);}catch(e){}delete volLayers[volId];}
    refreshCurrent();toast('Контур удалён','ok');
  });
}

// ── UNDO STACK ─────────────────────────────────────────────
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
  document.querySelectorAll('.leaflet-marker-icon,.leaflet-marker-shadow').forEach(function(el){el.style.pointerEvents='';});
  setTool('view');await loadAll();
}
async function doMoveMachine(ll){
  const{mach,baseId}=moveData;
  await fetch(`${API}/pgk/machinery/${mach.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...mach,lat:ll.lat,lng:ll.lng,base_id:baseId||null,user_name:un()})});
  toast('Техника перемещена','ok');moveMode=null;moveData=null;
  // Восстанавливаем pointer-events
  document.querySelectorAll('.leaflet-marker-icon,.leaflet-marker-shadow').forEach(function(el){el.style.pointerEvents='';});
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
