// ═══════════════════════════════════════════════════════════
// KML LAYER MANAGER — Правая боковая панель управления слоями
// ═══════════════════════════════════════════════════════════

// ── Библиотека условных знаков (SVG) ───────────────────────
const KML_SYMBOLS = {
  borehole:       { label:'Скважина',              group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/>` },
  borehole_filled:{ label:'Скважина (пройденная)', group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/>` },
  borehole_water: { label:'Водозаборная скважина',  group:'Бурение',
    svg:`<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="COLOR"/>` },
  borehole_geo:   { label:'Геологическая скважина', group:'Бурение',
    svg:`<circle cx="12" cy="8" r="6" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="14" x2="12" y2="22" stroke="COLOR" stroke-width="2.5"/><line x1="8" y1="8" x2="16" y2="8" stroke="COLOR" stroke-width="2"/><line x1="6" y1="8" x2="18" y2="8" stroke="COLOR" stroke-width="1" stroke-dasharray="2 1"/>` },
  pit:            { label:'Шурф',                   group:'Горные выработки',
    svg:`<rect x="5" y="5" width="14" height="14" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="5" y1="5" x2="19" y2="19" stroke="COLOR" stroke-width="1.5"/><line x1="19" y1="5" x2="5" y2="19" stroke="COLOR" stroke-width="1.5"/>` },
  trench:         { label:'Канава',                 group:'Горные выработки',
    svg:`<rect x="3" y="8" width="18" height="8" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="3" y1="8" x2="21" y2="16" stroke="COLOR" stroke-width="1"/><line x1="3" y1="16" x2="21" y2="8" stroke="COLOR" stroke-width="1"/>` },
  adit:           { label:'Штольня',                group:'Горные выработки',
    svg:`<path d="M4 18 L12 6 L20 18 Z" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="18" x2="12" y2="12" stroke="COLOR" stroke-width="2"/>` },
  benchmark:      { label:'Репер',                  group:'Геодезия',
    svg:`<polygon points="12,4 20,18 4,18" fill="none" stroke="COLOR" stroke-width="2.5"/><circle cx="12" cy="14" r="2" fill="COLOR"/>` },
  station:        { label:'Геодезическая станция',  group:'Геодезия',
    svg:`<polygon points="12,4 20,18 4,18" fill="COLOR" fill-opacity="0.25" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="4" x2="12" y2="2" stroke="COLOR" stroke-width="2"/><line x1="10" y1="2" x2="14" y2="2" stroke="COLOR" stroke-width="2"/>` },
  picket:         { label:'Пикет',                  group:'Геодезия',
    svg:`<circle cx="12" cy="12" r="3" fill="COLOR"/><circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="1.5" stroke-dasharray="3 2"/>` },
  fault:          { label:'Разлом',                 group:'Геология',
    svg:`<path d="M4 18 Q8 12 12 12 Q16 12 20 6" fill="none" stroke="COLOR" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="6" x2="20" y2="4" stroke="COLOR" stroke-width="2"/><line x1="18" y1="8" x2="20" y2="4" stroke="COLOR" stroke-width="2"/>` },
  contact:        { label:'Геологический контакт',  group:'Геология',
    svg:`<line x1="4" y1="12" x2="20" y2="12" stroke="COLOR" stroke-width="2.5" stroke-dasharray="4 2"/><line x1="4" y1="8" x2="20" y2="8" stroke="COLOR" stroke-width="1" stroke-dasharray="2 3"/>` },
  sample:         { label:'Точка опробования',      group:'Геология',
    svg:`<path d="M10 4 L14 4 L16 12 L8 12 Z" fill="none" stroke="COLOR" stroke-width="2"/><ellipse cx="12" cy="13" rx="4" ry="2" fill="none" stroke="COLOR" stroke-width="2"/><line x1="8" y1="12" x2="8" y2="18" stroke="COLOR" stroke-width="2"/><line x1="16" y1="12" x2="16" y2="18" stroke="COLOR" stroke-width="2"/><line x1="8" y1="18" x2="16" y2="18" stroke="COLOR" stroke-width="2"/>` },
  point:          { label:'Точка (стандарт)',        group:'Базовые',
    svg:`<circle cx="12" cy="12" r="7" fill="COLOR" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>` },
  point_cross:    { label:'Точка с крестом',         group:'Базовые',
    svg:`<circle cx="12" cy="12" r="6" fill="none" stroke="COLOR" stroke-width="2.5"/><line x1="12" y1="6" x2="12" y2="18" stroke="COLOR" stroke-width="2"/><line x1="6" y1="12" x2="18" y2="12" stroke="COLOR" stroke-width="2"/>` },
  square:         { label:'Квадрат',                group:'Базовые',
    svg:`<rect x="5" y="5" width="14" height="14" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/>` },
  diamond:        { label:'Ромб',                   group:'Базовые',
    svg:`<polygon points="12,4 20,12 12,20 4,12" fill="COLOR" fill-opacity="0.3" stroke="COLOR" stroke-width="2.5"/>` },
  star:           { label:'Звезда',                 group:'Базовые',
    svg:`<polygon points="12,3 14.5,9 21,9 15.5,13.5 17.5,20 12,16 6.5,20 8.5,13.5 3,9 9.5,9" fill="COLOR" stroke="COLOR" stroke-width="1" fill-opacity="0.8"/>` },
  flag:           { label:'Флажок',                 group:'Базовые',
    svg:`<line x1="7" y1="4" x2="7" y2="20" stroke="COLOR" stroke-width="2.5" stroke-linecap="round"/><path d="M7 4 L18 8 L7 12 Z" fill="COLOR" fill-opacity="0.8"/>` },
  camp:           { label:'Лагерь / База',           group:'Инфраструктура',
    svg:`<path d="M4 18 L12 4 L20 18 Z" fill="COLOR" fill-opacity="0.2" stroke="COLOR" stroke-width="2.5"/><line x1="4" y1="18" x2="20" y2="18" stroke="COLOR" stroke-width="2.5"/>` },
  helipad:        { label:'Вертолётная площадка',   group:'Инфраструктура',
    svg:`<circle cx="12" cy="12" r="9" fill="none" stroke="COLOR" stroke-width="2"/><text x="12" y="17" text-anchor="middle" font-size="12" font-weight="bold" fill="COLOR" font-family="Arial">H</text>` },
  fuel:           { label:'Топливо / АЗС',           group:'Инфраструктура',
    svg:`<rect x="7" y="4" width="8" height="12" fill="none" stroke="COLOR" stroke-width="2"/><rect x="9" y="6" width="4" height="3" fill="COLOR" fill-opacity="0.5"/><line x1="11" y1="16" x2="11" y2="20" stroke="COLOR" stroke-width="2"/><line x1="15" y1="8" x2="17" y2="8" stroke="COLOR" stroke-width="2"/><line x1="17" y1="8" x2="17" y2="14" stroke="COLOR" stroke-width="2"/><circle cx="17" cy="15" r="1.5" fill="COLOR"/>` },
};

const KML_LINE_STYLES = {
  solid:   { label:'Сплошная',      dash: null },
  dashed:  { label:'Пунктир',       dash: '8 4' },
  dotted:  { label:'Точечная',      dash: '2 4' },
  dashdot: { label:'Штрих-пунктир', dash: '8 4 2 4' },
};

// ── Состояние ───────────────────────────────────────────────
let kmGroups    = {};
let kmGroupOrder= [];
let kmlPanelOpen= false;

// ── Утилиты SVG ────────────────────────────────────────────
function kmlSvgIcon(symbolKey, color, size) {
  size = size || 24;
  const sym = KML_SYMBOLS[symbolKey] || KML_SYMBOLS['point'];
  const inner = sym.svg.replace(/COLOR/g, color || '#1a56db');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${inner}</svg>`;
}

// Per-feature иконка (учитывает feature-level переопределения цвета/символа и размер слоя)
function kmlFeatureDivIcon(layerObj, featureProps) {
  const sym   = (featureProps && featureProps._sym)   || layerObj.symbol || 'point';
  const color = (featureProps && featureProps._color) || layerObj.color  || '#1a56db';
  const scale = layerObj.size != null ? layerObj.size : 1;
  const size  = Math.round(28 * scale);
  return L.divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))">${kmlSvgIcon(sym, color, size)}</div>`,
    iconSize:  [size, size],
    iconAnchor:[size/2, size/2],
  });
}

// ── Открыть / закрыть панель ────────────────────────────────
function toggleKmlPanel() {
  kmlPanelOpen = !kmlPanelOpen;
  const panel = document.getElementById('kml-panel');
  const btn   = document.getElementById('tool-kml');
  if (kmlPanelOpen) {
    panel.classList.add('open');
    btn && btn.classList.add('on');
    renderKmlPanel();
  } else {
    panel.classList.remove('open');
    btn && btn.classList.remove('on');
  }
}

// ── Главный рендер панели ───────────────────────────────────
function renderKmlPanel() {
  const list = document.getElementById('kml-panel-body');
  if (!list) return;

  const ungrouped = layers.filter(l => !l.site_id && (!l.group_id || !kmGroups[l.group_id]));
  const grouped   = {};
  layers.filter(l => !l.site_id && l.group_id && kmGroups[l.group_id]).forEach(l => {
    if (!grouped[l.group_id]) grouped[l.group_id] = [];
    grouped[l.group_id].push(l);
  });

  let html = '';
  kmGroupOrder.forEach(gid => {
    const g = kmGroups[gid];
    if (!g) return;
    const gLayers = grouped[gid] || [];
    const allVis  = gLayers.length > 0 && gLayers.every(l => l.visible);
    const siteIds = g.site_ids || [];
    const boundSites = siteIds.length ? sites.filter(s=>siteIds.includes(s.id)) : [];
    const isActive  = !siteIds.length || (currentObj && siteIds.includes(currentObj.id));
    const badgeLabel = boundSites.length===1 ? esc(boundSites[0].name) : boundSites.length+' объекта';
    const siteBadge = boundSites.length
      ? `<span title="Привязана к: ${boundSites.map(s=>esc(s.name)).join(', ')}" style="font-size:9px;background:${isActive?'var(--acc)':'var(--tx3)'};color:#fff;border-radius:10px;padding:1px 6px;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏗 ${badgeLabel}</span>`
      : '';
    html += `<div class="kml-group" data-gid="${gid}" style="${!isActive?'opacity:.45':''}">
      <div class="kml-group-hd" onclick="kmlToggleGroup('${gid}')">
        <span class="kml-group-arrow">${g.collapsed ? '▶' : '▼'}</span>
        <span class="kml-group-eye ${allVis?'on':''}" onclick="event.stopPropagation();kmlGroupVisToggle('${gid}')">${allVis?'👁':'🚫'}</span>
        <span class="kml-group-name" ondblclick="event.stopPropagation();kmlRenameGroup('${gid}')">${esc(g.name)}</span>
        ${siteBadge}
        <span class="kml-group-count">${gLayers.length}</span>
        <button class="kml-icon-btn" onclick="event.stopPropagation();kmlGroupCtx(event,'${gid}')">⋯</button>
      </div>
      ${g.collapsed ? '' : `<div class="kml-group-body">${gLayers.map(l => kmlLayerRow(l)).join('')}</div>`}
    </div>`;
  });

  if (ungrouped.length) {
    html += `<div class="kml-ungrouped-hd">📄 Без группы</div>`;
    html += ungrouped.map(l => kmlLayerRow(l)).join('');
  }

  if (!html) {
    html = `<div class="kml-empty"><div style="font-size:28px;margin-bottom:6px">🗺</div>
      <div>Нет слоёв</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:4px">Импортируйте KML или GPX</div></div>`;
  }
  list.innerHTML = html;
}

function kmlLayerRow(l) {
  const lblOn = !!layerLabels[l.id];
  const sym   = l.symbol || 'point';
  const svgPrev = kmlSvgIcon(sym, l.color || '#1a56db', 18);
  return `<div class="kml-layer-row" data-lid="${l.id}" oncontextmenu="event.preventDefault();kmlLayerCtx(event,'${l.id}')">
    <button class="kml-icon-btn vis ${l.visible?'on':''}" onclick="kmlToggleVis('${l.id}',${l.visible?0:1})">${l.visible?'👁':'🚫'}</button>
    <div class="kml-sym-preview" onclick="kmlOpenStyleModal('${l.id}')" title="Стиль слоя">${svgPrev}</div>
    <div class="kml-layer-name" ondblclick="kmlRenameLayer('${l.id}')" title="${esc(l.name)}">${esc(l.name)}</div>
    <button class="kml-icon-btn ${lblOn?'on':''}" onclick="toggleLayerLabels('${l.id}')" title="Подписи">🏷</button>
    <button class="kml-icon-btn" onclick="kmlZoomTo('${l.id}')" title="Приблизить">🔍</button>
    <button class="kml-icon-btn" onclick="kmlOpenFeatureList('${l.id}')" title="Объекты слоя">📋</button>
    <button class="kml-icon-btn menu" onclick="kmlLayerCtx(event,'${l.id}')" title="Меню">⋯</button>
  </div>`;
}

// ── Видимость ───────────────────────────────────────────────
function kmlToggleVis(id, vis) {
  toggleLV(id, vis);
  setTimeout(renderKmlPanel, 100);
}

// ── Zoom к слою ─────────────────────────────────────────────
function kmlZoomTo(id) {
  const g = lGroups[id];
  if (!g) { toast('Слой скрыт или пуст', 'err'); return; }
  try { const b = g.getBounds(); if (b.isValid()) map.flyToBounds(b, {padding:[40,40]}); }
  catch(e) { toast('Нет координат', 'err'); }
}

// ── Группы ─────────────────────────────────────────────────
function kmlToggleGroup(gid) {
  if (kmGroups[gid]) { kmGroups[gid].collapsed = !kmGroups[gid].collapsed; renderKmlPanel(); }
}
async function kmlGroupVisToggle(gid) {
  const gl = layers.filter(l => l.group_id === gid);
  const newVis = gl.some(l => l.visible) ? 0 : 1;
  for (const l of gl) await toggleLV(l.id, newVis);
  setTimeout(renderKmlPanel, 150);
}
async function kmlSetGroupVis(gid, vis) {
  for (const l of layers.filter(l => l.group_id === gid)) await toggleLV(l.id, vis);
  setTimeout(renderKmlPanel, 150);
}
function kmlRenameGroup(gid) {
  const g = kmGroups[gid]; if (!g) return;
  showModal('Переименовать группу',
    `<div class="fg"><label>Название</label><input id="f-grn" value="${esc(g.name)}"></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Сохранить',cls:'bp',fn:()=>{g.name=v('f-grn').trim()||g.name;saveKmGroups();closeModal();renderKmlPanel();}}]);
}
function kmlDeleteGroup(gid) {
  const cnt = layers.filter(l=>l.group_id===gid).length;
  if (!confirm(`Удалить группу?${cnt?' Слои ('+cnt+' шт.) останутся без группы.':''}`)) return;
  layers.filter(l=>l.group_id===gid).forEach(l=>{l.group_id='';});
  delete kmGroups[gid];
  kmGroupOrder = kmGroupOrder.filter(x=>x!==gid);
  saveKmGroups(); renderKmlPanel();
}
function kmlCreateGroup() {
  showModal('Новая группа',
    `<div class="fg"><label>Название</label><input id="f-gnm" placeholder="Геология, Топография..."></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Создать',cls:'bp',fn:()=>{
       const nm=v('f-gnm').trim();if(!nm)return;
       const gid='g_'+Date.now();
       kmGroups[gid]={id:gid,name:nm,collapsed:false,site_ids:[]};
       kmGroupOrder.push(gid);
       saveKmGroups();closeModal();renderKmlPanel();
     }}]);
}
async function saveKmGroups(){
  Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
  try{
    await fetch(`${API}/app-settings/kml_groups`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({value:{groups:kmGroups,order:kmGroupOrder}})});
  }catch(e){}
  try{localStorage.setItem('kml_groups',JSON.stringify({groups:kmGroups,order:kmGroupOrder}));}catch(e){}
}
async function loadKmGroups(){
  try{
    const r=await fetch(`${API}/app-settings/kml_groups`);
    const data=await r.json();
    if(data.value&&data.value.groups){
      kmGroups=data.value.groups;kmGroupOrder=data.value.order||[];
      Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
      return;
    }
  }catch(e){}
  try{
    const d=JSON.parse(localStorage.getItem('kml_groups')||'{}');
    kmGroups=d.groups||{};kmGroupOrder=d.order||[];
    Object.values(kmGroups).forEach(g=>{if(!g.site_ids)g.site_ids=g.site_id?[g.site_id]:[];});
    if(Object.keys(kmGroups).length>0)saveKmGroups();
  }catch(e){kmGroups={};kmGroupOrder=[];}
}

// ── Привязать группу к объектам (мультивыбор) ──────────────
function kmlGroupBindSite(gid) {
  const g=kmGroups[gid];if(!g)return;
  if(!sites||!sites.length){toast('Нет объектов','err');return;}
  const cur=g.site_ids||[];
  const opts=sites.map(s=>
    `<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer">
      <input type="checkbox" value="${escAttr(s.id)}" ${cur.includes(s.id)?'checked':''}> ${esc(s.name)}
    </label>`).join('');
  showModal('🏗 Привязать группу к объектам',
    `<div style="max-height:260px;overflow-y:auto;padding-right:4px">${opts}</div>
     <div style="font-size:11px;color:var(--tx3);margin-top:8px">Слои этой группы видны только при выборе указанных объектов. Оставьте все снятыми — группа глобальная.</div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Применить',cls:'bp',fn:()=>{
       const checked=[...document.querySelectorAll('#mbd input[type=checkbox]:checked')].map(el=>el.value);
       g.site_ids=checked;
       saveKmGroups();closeModal();renderKmlPanel();renderLayerGroups();
       toast(checked.length?`Группа привязана к ${checked.length} объект${checked.length===1?'у':'ам'}`:'Привязка снята','ok');
     }}]);
}

// ── Переименование слоя ─────────────────────────────────────
function kmlRenameLayer(id) {
  const l=layers.find(x=>x.id===id);if(!l)return;
  showModal('Переименовать слой',`<div class="fg"><label>Название</label><input id="f-lrn" value="${esc(l.name)}"></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'Сохранить',cls:'bp',fn:async()=>{
       const nm=v('f-lrn').trim();if(!nm)return;
       l.name=nm;
       await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({name:nm,color:l.color,visible:l.visible?1:0,symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid'})});
       closeModal();renderKmlPanel();toast('Переименовано','ok');
     }}]);
}

// ── Переместить в группу ────────────────────────────────────
async function kmlMoveToGroup(lid, gid) {
  const l=layers.find(x=>x.id===lid);if(!l)return;
  l.group_id=gid||'';
  await fetch(`${API}/layers/${lid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,symbol:l.symbol||'',group_id:l.group_id,line_dash:l.line_dash||'solid'})});
  renderKmlPanel();
}

// ── Удалить слой ────────────────────────────────────────────
async function kmlDeleteLayer(id) {
  if(!confirm('Удалить слой?'))return;
  if(lGroups[id])map.removeLayer(lGroups[id]);
  layers=layers.filter(l=>l.id!==id);renderKmlPanel();
  await apiDelUndo(`/layers/${id}`,'Слой удалён',async()=>{
    const fresh=await fetch(`${API}/layers`).then(r=>r.json()).catch(()=>[]);
    layers=fresh;renderKmlPanel();try{reloadKmlLayers();}catch(e){}
  });
}

// ── Контекстное меню слоя ───────────────────────────────────
function kmlLayerCtx(ev, id) {
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const l=layers.find(x=>x.id===id);if(!l)return;
  const cx=ev.clientX,cy=ev.clientY;
  const moveToGroupItems=kmGroupOrder.length?[
    ...kmGroupOrder.map(gid=>({i:'📁',l:'В группу: '+esc(kmGroups[gid].name),f:()=>kmlMoveToGroup(id,gid)})),
  ]:[];
  const removeFromGroupItem=l.group_id?[{i:'📄',l:'Убрать из группы',f:()=>kmlMoveToGroup(id,null)}]:[];
  const groupItems=(moveToGroupItems.length||removeFromGroupItem.length)?[{sep:true},...moveToGroupItems,...removeFromGroupItem]:[];
  showCtx(cx,cy,[
    {i:'🗺',l:`<b>${esc(l.name)}</b>`,f:null},{sep:true},
    {i:'📋',l:'Объекты слоя',f:()=>kmlOpenFeatureList(id)},
    {i:'🎨',l:'Стиль / условный знак',f:()=>kmlOpenStyleModal(id)},
    {i:'✏️',l:'Переименовать',f:()=>kmlRenameLayer(id)},
    {i:'🔍',l:'Приблизить к слою',f:()=>kmlZoomTo(id)},
    {i:l.visible?'🚫':'👁',l:l.visible?'Скрыть':'Показать',f:()=>kmlToggleVis(id,l.visible?0:1)},
    {i:'🏷',l:layerLabels[id]?'Скрыть подписи':'Показать подписи',f:()=>{toggleLayerLabels(id);renderKmlPanel();}},
    ...groupItems,{sep:true},
    {i:'🗑',l:'Удалить слой',cls:'dan',f:()=>kmlDeleteLayer(id)},
  ]);
}

// ── Контекстное меню группы ─────────────────────────────────
function kmlGroupCtx(ev, gid) {
  const g=kmGroups[gid];if(!g)return;
  const siteIds=g.site_ids||[];
  const bindItems=siteIds.length
    ?[{i:'🔓',l:'Отвязать от объектов',f:()=>{g.site_ids=[];saveKmGroups();renderKmlPanel();renderLayerGroups();}},
      {i:'🏗',l:'Изменить привязку…',f:()=>kmlGroupBindSite(gid)}]
    :[{i:'🏗',l:'Привязать к объектам…',f:()=>kmlGroupBindSite(gid)}];
  showCtx(ev.clientX,ev.clientY,[
    {i:'📁',l:`<b>${esc(g.name)}</b>`,f:null},{sep:true},
    {i:'✏️',l:'Переименовать',f:()=>kmlRenameGroup(gid)},
    {i:'👁',l:'Показать все',f:()=>kmlSetGroupVis(gid,1)},
    {i:'🚫',l:'Скрыть все',f:()=>kmlSetGroupVis(gid,0)},
    {sep:true},
    ...bindItems,
    {sep:true},
    {i:'🗑',l:'Удалить группу',cls:'dan',f:()=>kmlDeleteGroup(gid)},
  ]);
}

// ── Модалка стиля слоя ──────────────────────────────────────
function kmlOpenStyleModal(id) {
  const l=layers.find(x=>x.id===id);if(!l)return;
  const curSym=l.symbol||'point', curColor=l.color||'#1a56db', curDash=l.line_dash||'solid';
  const symGroups={};
  Object.entries(KML_SYMBOLS).forEach(([k,s])=>{
    if(!symGroups[s.group])symGroups[s.group]=[];
    symGroups[s.group].push({key:k,...s});
  });
  const symHtml=Object.entries(symGroups).map(([grpNm,syms])=>`
    <div style="margin-bottom:10px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-bottom:5px">${grpNm}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${syms.map(s=>`<div class="kml-sym-btn ${s.key===curSym?'on':''}" data-sym="${s.key}" onclick="kmlSelectSym(this)" title="${s.label}">
          <div class="kml-sym-inner" id="kml-sym-prev-${s.key}">${kmlSvgIcon(s.key,curColor,22)}</div></div>`).join('')}
      </div>
    </div>`).join('');
  const lineHtml=Object.entries(KML_LINE_STYLES).map(([k,s])=>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:3px 0">
      <input type="radio" name="ldash" value="${k}" ${curDash===k?'checked':''}> ${s.label}</label>`).join('');
  const curMinZ = l.min_zoom != null ? l.min_zoom : 0;
  const curMaxZ = l.max_zoom != null ? l.max_zoom : 20;
  const curSize = l.size     != null ? l.size     : 1;
  const curZ    = Math.round(map.getZoom());
  showModal(`🎨 Стиль слоя — ${esc(l.name)}`,`
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start">
      <div><label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Цвет</label>
        <input type="color" id="kml-style-color" value="${curColor}" style="width:50px;height:36px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px" oninput="kmlUpdateSymPreviews(this.value)">
      </div>
      <div style="flex:1"><label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Линии/полигоны</label>${lineHtml}</div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">
        Размер значков: <b id="kml-size-val">${curSize.toFixed(1)}×</b>
      </label>
      <input type="range" id="kml-size" min="0.3" max="3" step="0.1" value="${curSize}"
        style="width:100%;accent-color:var(--acc)"
        oninput="document.getElementById('kml-size-val').textContent=parseFloat(this.value).toFixed(1)+'×'">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tx3);margin-top:2px">
        <span>0.3× (мелко)</span><span>1.0× (норма)</span><span>3.0× (крупно)</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px">
      <div style="flex:1">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Мин. зум</label>
        <input type="number" id="kml-min-zoom" min="0" max="20" value="${curMinZ}" style="width:100%;padding:5px 7px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--s);color:var(--tx)">
      </div>
      <div style="flex:1">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">Макс. зум</label>
        <input type="number" id="kml-max-zoom" min="0" max="20" value="${curMaxZ}" style="width:100%;padding:5px 7px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--s);color:var(--tx)">
      </div>
      <div style="font-size:10px;color:var(--tx3);padding-bottom:7px;white-space:nowrap">сейчас: <b>${curZ}</b></div>
    </div>
    <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">Условный знак для точек</label>
    <div id="kml-sym-grid" style="max-height:220px;overflow-y:auto;padding-right:4px">${symHtml}</div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'✅ Применить',cls:'bp',fn:async()=>{
       const color=document.getElementById('kml-style-color').value;
       const symEl=document.querySelector('.kml-sym-btn.on');
       const sym=symEl?symEl.dataset.sym:curSym;
       const dash=document.querySelector('input[name="ldash"]:checked')?.value||'solid';
       const minZ=Math.max(0,Math.min(20,parseInt(document.getElementById('kml-min-zoom').value)||0));
       const maxZ=Math.max(0,Math.min(20,parseInt(document.getElementById('kml-max-zoom').value)||20));
       const sz=Math.max(0.3,Math.min(3,parseFloat(document.getElementById('kml-size').value)||1));
       l.color=color;l.symbol=sym;l.line_dash=dash;l.min_zoom=minZ;l.max_zoom=maxZ;l.size=sz;
       await fetch(`${API}/layers/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({name:l.name,color,visible:l.visible?1:0,symbol:sym,group_id:l.group_id||'',line_dash:dash,min_zoom:minZ,max_zoom:maxZ,size:sz})});
       closeModal();renderLayerGroups();renderKmlPanel();toast('Стиль применён','ok');
     }}]);
}
function kmlSelectSym(el){document.querySelectorAll('.kml-sym-btn').forEach(b=>b.classList.remove('on'));el.classList.add('on');}
function kmlUpdateSymPreviews(color){Object.keys(KML_SYMBOLS).forEach(k=>{const el=document.getElementById('kml-sym-prev-'+k);if(el)el.innerHTML=kmlSvgIcon(k,color,22);});}

// ══════════════════════════════════════════════════════════════
// РЕДАКТОР ОБЪЕКТОВ СЛОЯ (Feature List)
// ══════════════════════════════════════════════════════════════
function kmlOpenFeatureList(id) {
  const l = layers.find(x => x.id === id);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { toast('Ошибка разбора слоя', 'err'); return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  if (!features.length) { toast('Слой пустой', 'err'); return; }

  // Считаем типы
  const pts  = features.filter(f => f.geometry && f.geometry.type === 'Point').length;
  const lns  = features.filter(f => f.geometry && f.geometry.type === 'LineString').length;
  const pols = features.filter(f => f.geometry && f.geometry.type === 'Polygon').length;

  const typeIcon = geomType => geomType === 'Point' ? '📍' : geomType === 'LineString' ? '〰️' : '⬡';

  const rowsHtml = features.map((f, idx) => {
    const props    = f.properties || {};
    const nm       = props.name  || props.Name || `Объект ${idx + 1}`;
    const desc     = props.description || props.desc || '';
    const fSym     = props._sym   || l.symbol  || 'point';
    const fColor   = props._color || l.color   || '#1a56db';
    const geomType = f.geometry ? f.geometry.type : '?';
    const preview  = geomType === 'Point' ? kmlSvgIcon(fSym, fColor, 20) : typeIcon(geomType);
    // Координаты для отображения
    let coordLabel = '';
    try {
      if (geomType === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      } else if (geomType === 'LineString') {
        coordLabel = `${f.geometry.coordinates.length} точек`;
      } else if (geomType === 'Polygon') {
        coordLabel = `${(f.geometry.coordinates[0]||[]).length} вершин`;
      }
    } catch(e) {}

    return `<div class="kfl-row" data-fidx="${idx}">
      <div class="kfl-sym">${preview}</div>
      <div class="kfl-info">
        <div class="kfl-name">${esc(nm)}</div>
        ${desc ? `<div class="kfl-desc">${esc(desc)}</div>` : ''}
        <div class="kfl-coord">${esc(coordLabel)}</div>
      </div>
      <div class="kfl-actions">
        <button class="kml-icon-btn" onclick="kmlZoomToFeature('${id}',${idx})" title="Приблизить">🔍</button>
        <button class="kml-icon-btn" onclick="kmlEditFeature('${id}',${idx})" title="Редактировать">✏️</button>
        <button class="kml-icon-btn" style="color:var(--red);opacity:.7" onclick="kmlDeleteFeature('${id}',${idx})" title="Удалить">🗑</button>
      </div>
    </div>`;
  }).join('');

  const html = `
    <div class="kfl-header">
      <span style="font-size:11px;color:var(--tx3)">
        ${pts ? `📍 ${pts} точек  ` : ''}${lns ? `〰️ ${lns} линий  ` : ''}${pols ? `⬡ ${pols} полигонов` : ''}
      </span>
    </div>
    <div class="kfl-list">${rowsHtml}</div>`;

  showModal(`📋 Объекты слоя — ${esc(l.name)}`, html,
    [{label:'Закрыть',cls:'bs',fn:closeModal}]);
}

// ── Приблизить к конкретному feature ───────────────────────
function kmlZoomToFeature(layerId, fIdx) {
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  try {
    const gj = JSON.parse(l.geojson);
    const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
    const f = features[fIdx];
    if (!f || !f.geometry) return;
    if (f.geometry.type === 'Point') {
      const [lng, lat] = f.geometry.coordinates;
      map.flyTo([lat, lng], 17, {animate: true});
    } else {
      // для линий/полигонов строим bounds
      const allCoords = f.geometry.type === 'LineString'
        ? f.geometry.coordinates
        : f.geometry.coordinates[0];
      const lats = allCoords.map(c => c[1]), lngs = allCoords.map(c => c[0]);
      map.flyToBounds([[Math.min(...lats), Math.min(...lngs)],[Math.max(...lats), Math.max(...lngs)]], {padding:[40,40]});
    }
  } catch(e) { toast('Не удалось приблизить', 'err'); }
}

// ── Редактировать отдельный feature ────────────────────────
function kmlEditFeature(layerId, fIdx) {
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
  const f = features[fIdx];
  if (!f) return;
  const props    = f.properties || {};
  const nm       = props.name  || props.Name || '';
  const desc     = props.description || props.desc || '';
  const geomType = f.geometry ? f.geometry.type : '';
  const isPoint  = geomType === 'Point';
  const fSym     = props._sym   || l.symbol  || 'point';
  const fColor   = props._color || l.color   || '#1a56db';

  // Строим сетку символов для выбора
  const symGroups = {};
  Object.entries(KML_SYMBOLS).forEach(([k,s]) => {
    if (!symGroups[s.group]) symGroups[s.group] = [];
    symGroups[s.group].push({key:k,...s});
  });
  const symGrid = isPoint ? `
    <div style="margin-top:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px">Условный знак</label>
      <div id="kfl-sym-grid" style="max-height:220px;overflow-y:auto">
        ${Object.entries(symGroups).map(([grpNm,syms])=>`
          <div style="margin-bottom:8px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-bottom:4px">${grpNm}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${syms.map(s=>`<div class="kml-sym-btn kfl-sym-sel ${s.key===fSym?'on':''}" data-sym="${s.key}" onclick="kflSelectSym(this)" title="${s.label}">
                <div id="kfl-sp-${s.key}">${kmlSvgIcon(s.key,fColor,20)}</div></div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const html = `
    <div class="fgr">
      <div class="fg"><label>Название</label><input id="kfl-nm" value="${esc(nm)}"></div>
      <div class="fg"><label>Описание</label><textarea id="kfl-desc" rows="2" style="width:100%;resize:vertical">${esc(desc)}</textarea></div>
      ${isPoint ? `<div class="fg"><label>Цвет объекта</label>
        <input type="color" id="kfl-color" value="${fColor}" style="width:50px;height:32px;border:1.5px solid var(--bd);border-radius:5px;cursor:pointer;padding:2px"
          oninput="document.querySelectorAll('[id^=kfl-sp-]').forEach(el=>{const k=el.id.replace('kfl-sp-','');el.innerHTML=kmlSvgIcon(k,this.value,20);})">
        <span style="font-size:10px;color:var(--tx3);margin-left:6px">Переопределяет цвет слоя для этого объекта</span>
      </div>` : ''}
      ${symGrid}
    </div>`;

  showModal(`✏️ Редактировать — ${esc(nm||'Объект')}`, html, [
    {label:'Отмена',cls:'bs',fn:()=>{closeModal();kmlOpenFeatureList(layerId);}},
    {label:'💾 Сохранить',cls:'bp',fn:async()=>{
      const newNm   = document.getElementById('kfl-nm').value.trim() || nm;
      const newDesc = document.getElementById('kfl-desc').value.trim();
      const newColor= isPoint ? document.getElementById('kfl-color').value : null;
      const symEl   = isPoint ? document.querySelector('.kfl-sym-sel.on') : null;
      const newSym  = symEl ? symEl.dataset.sym : (isPoint ? fSym : null);

      // Обновляем properties в GeoJSON
      if (!f.properties) f.properties = {};
      f.properties.name = newNm;
      if (newDesc) f.properties.description = newDesc; else delete f.properties.description;
      if (isPoint && newColor && newColor !== l.color) f.properties._color = newColor;
      else delete f.properties._color;
      if (isPoint && newSym && newSym !== l.symbol) f.properties._sym = newSym;
      else delete f.properties._sym;

      // Сохраняем весь слой обратно
      const newGeojson = JSON.stringify(gj);
      await fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,
          symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',geojson:newGeojson})});
      l.geojson = newGeojson;
      renderLayerGroups();
      toast('Сохранено','ok');
      closeModal();
      kmlOpenFeatureList(layerId);  // возврат к списку
    }}
  ]);
}
function kflSelectSym(el){document.querySelectorAll('.kfl-sym-sel').forEach(b=>b.classList.remove('on'));el.classList.add('on');}

// ── Удалить отдельный feature ───────────────────────────────
async function kmlDeleteFeature(layerId, fIdx) {
  if (!confirm('Удалить этот объект из слоя?')) return;
  const l = layers.find(x => x.id === layerId);
  if (!l) return;
  let gj;
  try { gj = JSON.parse(l.geojson); } catch(e) { return; }
  if (gj.type === 'FeatureCollection') {
    gj.features.splice(fIdx, 1);
  }
  const newGeojson = JSON.stringify(gj);
  await fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:l.name,color:l.color,visible:l.visible?1:0,
      symbol:l.symbol||'',group_id:l.group_id||'',line_dash:l.line_dash||'solid',geojson:newGeojson})});
  l.geojson = newGeojson;
  renderLayerGroups();
  toast('Объект удалён','ok');
  kmlOpenFeatureList(layerId);  // обновить список
}

// ── Импорт ─────────────────────────────────────────────────
function kmlPanelImport(evt) {
  importLayer(evt);
  setTimeout(renderKmlPanel, 500);
}

// ══════════════════════════════════════════════════════════════
// renderLayerGroups — KML всегда ПОД объёмами (pane kmlPane)
// ══════════════════════════════════════════════════════════════
function renderLayerGroupsWithSymbols() {
  // Удаляем старые глобальные KML-слои
  Object.keys(lGroups).forEach(k => {
    if (!k.startsWith('s_')) { try { map.removeLayer(lGroups[k]); } catch(e) {} delete lGroups[k]; }
  });

  // Создаём pane с низким z-index (ниже overlayPane=400, ниже объёмов)
  if (!map.getPane('kmlPane')) {
    map.createPane('kmlPane');
    map.getPane('kmlPane').style.zIndex = 200;   // ниже tilePane(200)?  нет — ниже overlayPane(400)
    map.getPane('kmlPane').style.pointerEvents = 'auto';
  }
  // Убедимся что pane для объёмов выше
  if (map.getPane('overlayPane'))  map.getPane('overlayPane').style.zIndex  = 400;
  if (map.getPane('volPointsPane'))map.getPane('volPointsPane').style.zIndex = 450;

  layers.filter(l => l.visible && !l.site_id).forEach(l => {
    // If the layer's group is bound to a specific site, only show when that site is active
    if (l.group_id) {
      const grp = kmGroups[l.group_id];
      if (grp) {
        const siteIds = grp.site_ids || (grp.site_id ? [grp.site_id] : []);
        if (siteIds.length && (!currentObj || !siteIds.includes(currentObj.id))) return;
      }
    }
    try {
      const gj       = JSON.parse(l.geojson);
      const showLabels = !!layerLabels[l.id];
      const color    = l.color     || '#1a56db';
      const dash     = l.line_dash || 'solid';
      const dashArr  = KML_LINE_STYLES[dash]?.dash || null;

      const g = L.geoJSON(gj, {
        pane: 'kmlPane',
        style: () => ({ color, weight:2.5, opacity:.85, fillOpacity:.2, dashArray:dashArr }),
        pointToLayer: (f, ll) => {
          // feature-level переопределение символа/цвета
          const icon = kmlFeatureDivIcon(l, f.properties);
          return L.marker(ll, { icon, pane:'kmlPane' });
        },
        onEachFeature: (f, layer) => {
          const nm = f.properties?.name || f.properties?.Name || '';
          if (nm) layer.bindTooltip(nm, {permanent:showLabels, className:'mlbl', direction:'top'});

          // ПКМ на объекте карты
          layer.on('contextmenu', function(ev) {
            L.DomEvent.stopPropagation(ev);
            ev.originalEvent.preventDefault();
            const cx = ev.originalEvent.clientX, cy = ev.originalEvent.clientY;
            const featureName = f.properties?.name || f.properties?.Name || 'Объект';
            let coordStr = '';
            try {
              if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates;
                coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              }
            } catch(e) {}
            showCtx(cx, cy, [
              {i:'🗺',l:`<b>${esc(featureName)}</b> <span style="color:var(--tx3);font-weight:400">${esc(l.name)}</span>`,f:null},{sep:true},
              {i:'🔍',l:'Приблизить',f:()=>{
                try { map.flyToBounds(layer.getBounds ? layer.getBounds() : L.latLngBounds([[layer.getLatLng().lat,layer.getLatLng().lng]]), {padding:[60,60]}); }
                catch(e){ try{map.flyTo(layer.getLatLng(),16);}catch(e2){} }
              }},
              ...(coordStr?[{i:'📋',l:'Копировать координаты',f:()=>{navigator.clipboard.writeText(coordStr).then(()=>toast('Скопировано','ok'));}}]:[]),
              {sep:true},
              {i:'🎨',l:'Стиль слоя',f:()=>kmlOpenStyleModal(l.id)},
              {i:'📋',l:'Объекты слоя',f:()=>kmlOpenFeatureList(l.id)},
              {i:'👁',l:l.visible?'Скрыть слой':'Показать слой',f:()=>kmlToggleVis(l.id,l.visible?0:1)},
              ...(l.group_id?[{sep:true},{i:'📄',l:'Убрать из группы',f:()=>kmlMoveToGroup(l.id,null)}]:[]),
            ]);
          });
        }
      }).addTo(map);

      lGroups[l.id] = g;
      // Скрыть если текущий зум вне диапазона масштаба
      const minZ = l.min_zoom != null ? l.min_zoom : 0;
      const maxZ = l.max_zoom != null ? l.max_zoom : 20;
      if (minZ > 0 || maxZ < 20) {
        const z = map.getZoom();
        if (z < minZ || z > maxZ) map.removeLayer(g);
      }
    } catch(e) { console.warn('KML render error', l.name, e); }
  });

  // Объёмы всегда поверх KML
  setTimeout(bringVolumesToFront, 50);
  // Обновить панель чтобы отразить активные/неактивные группы
  if (kmlPanelOpen) setTimeout(renderKmlPanel, 50);
}

// ── Инициализация ───────────────────────────────────────────
async function initKmlManager() {
  await loadKmGroups();
  window.renderLayerGroups = renderLayerGroupsWithSymbols;
  setTimeout(() => {
    try { renderLayerGroupsWithSymbols(); } catch(e) {}
  }, 50);

  // Показывать/скрывать слои при смене зума (если задан диапазон масштаба)
  map.on('zoomend', () => {
    const z = map.getZoom();
    layers.filter(l => l.visible && !l.site_id).forEach(l => {
      const minZ = l.min_zoom != null ? l.min_zoom : 0;
      const maxZ = l.max_zoom != null ? l.max_zoom : 20;
      if (minZ === 0 && maxZ === 20) return; // без ограничений
      const g = lGroups[l.id];
      if (!g) return;
      const shouldShow = z >= minZ && z <= maxZ;
      if (shouldShow && !map.hasLayer(g)) g.addTo(map);
      else if (!shouldShow && map.hasLayer(g)) map.removeLayer(g);
    });
  });
}
