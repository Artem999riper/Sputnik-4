// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const API='/api';
const TRANSPORT_TYPES=['ТРЭКОЛ','БУРЛАК','БЕРКУТ','ТАНК','ТРОМ','ЛЕГКОВАЯ','ГРУЗОВАЯ','СНЕГОХОД'];
const MICONS={ТРЭКОЛ:'🚙',БУРЛАК:'🚛',БЕРКУТ:'🚙',ТАНК:'🚜',ТРОМ:'🚐',ЛЕГКОВАЯ:'🚗',ГРУЗОВАЯ:'🚚',СНЕГОХОД:'🏂'};
const MTYPES=[...TRANSPORT_TYPES];
const DRILL_TYPES=[...TRANSPORT_TYPES];
const WORKER_STATUSES={working:'🟢 В работе',home:'🏠 Дома',fired:'🚫 Уволен'};
const SL={working:'В работе',idle:'Стоит',broken:'Сломана'};
const SSL={active:'Активный',paused:'Пауза',done:'Завершён'};
const LCOLORS=['#1a56db','#7c3aed','#057a55','#c05621','#c81e1e','#0891b2','#b45309'];
const MPRESET=['Дизельное топливо','Бензин','Уголок металлический','Трубы обсадные','Буровой раствор','Цемент','Щебень','Масло моторное','Питьевая вода'];
const REVISIONS=['Р0','Р1','Р2','Р3','Р4','Р5'];

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS (moved from kameral.js)
// ═══════════════════════════════════════════════════════════
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr=s=>esc(s).replace(/\\/g,'&#92;');
const v=id=>{const e=document.getElementById(id);return e?e.value:''};
const un=()=>{const e=document.getElementById('unm');return e?e.value.trim()||'Пользователь':'Пользователь';};
const fmt=d=>{if(!d||d==='')return'—';try{const p=d.split('-');return`${p[2]}.${p[1]}.${p[0]}`;}catch{return d;}};
const fmtDT=dt=>{if(!dt)return'';try{const d=new Date(dt.includes('Z')?dt:dt+'Z');return d.toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return dt;}};

// ═══════════════════════════════════════════════════════════
// ГЛОБАЛЬНАЯ ОБЁРТКА FETCH: индикатор загрузки + тосты об ошибках
// Все запросы к /api/ проходят через неё без правки мест вызова:
//  • пока идут запросы — тонкая полоса активности сверху (с задержкой 300мс);
//  • не-GET с ответом !ok — тост с кодом и текстом ошибки сервера;
//  • сетевая ошибка — тост «нет связи» (не чаще раза в 5 сек).
// ═══════════════════════════════════════════════════════════
// Стабильный идентификатор браузера (для присутствия и прав)
function _sputnikClientId(){
  let id=localStorage.getItem('sputnik_cid');
  if(!id){
    id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'cid-'+Date.now()+'-'+Math.floor(Math.random()*1e9);
    localStorage.setItem('sputnik_cid',id);
  }
  return id;
}
const CLIENT_ID=_sputnikClientId();
// Сетевой адрес сервера (для общих ссылок): localhost на чужом ПК = его же ПК,
// поэтому ссылки строим по LAN-адресу, который сообщает сервер.
let SERVER_LAN_URL=null;
async function loadServerInfo(){
  try{ const r=await fetch(`${API}/server-info`); if(r.ok){ const j=await r.json(); SERVER_LAN_URL=j&&j.lanUrl||null; } }catch(e){}
}
function appBaseUrl(){
  const h=location.hostname;
  if((h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]')&&SERVER_LAN_URL)return SERVER_LAN_URL;
  return location.origin;
}
function adminToken(){return localStorage.getItem('sputnik_admin_token')||'';}
function setAdminToken(t){if(t)localStorage.setItem('sputnik_admin_token',t);else localStorage.removeItem('sputnik_admin_token');}
// Права текущего клиента (загружаются с сервера). По умолчанию всё разрешено.
let myCaps={delete:true,kmlEdit:true,volumes:true,refs:true,layerToggleGlobal:true};
let iAmAdmin=false, iAmLoopback=false, adminPwSet=false;
function can(cap){return myCaps[cap]!==false;}
function isAdminClient(){return !!iAmAdmin;}
async function loadMyCaps(){
  try{
    const r=await fetch(`${API}/me/caps`);
    if(r.ok){const j=await r.json();myCaps=j.caps||myCaps;iAmAdmin=!!j.isAdmin;iAmLoopback=!!j.loopback;adminPwSet=!!j.pwSet;
      if(typeof applyCapsToUI==='function')applyCapsToUI();}
  }catch(e){}
}

(function(){
  const orig=window.fetch.bind(window);
  let busy=0,showTimer=null,lastNetToast=0;
  function bar(){
    let el=document.getElementById('net-busy');
    if(!el){
      el=document.createElement('div');
      el.id='net-busy';
      el.style.cssText='position:fixed;top:0;left:0;right:0;height:2.5px;z-index:12000;display:none;overflow:hidden;pointer-events:none';
      el.innerHTML='<div style="width:38%;height:100%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:2px;animation:netBusySlide 1.1s ease-in-out infinite"></div>';
      const st=document.createElement('style');
      st.textContent='@keyframes netBusySlide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}';
      document.head.appendChild(st);
      document.body.appendChild(el);
    }
    return el;
  }
  function upd(){
    if(busy>0){
      if(!showTimer)showTimer=setTimeout(()=>{if(busy>0)bar().style.display='block';},300);
    } else {
      if(showTimer){clearTimeout(showTimer);showTimer=null;}
      const el=document.getElementById('net-busy');if(el)el.style.display='none';
    }
  }
  window.fetch=async function(url,opts){
    const isApi=typeof url==='string'&&url.indexOf('/api/')>=0;
    const method=((opts&&opts.method)||'GET').toUpperCase();
    if(isApi){
      // Заголовки идентификации на каждый запрос. Имя кодируем (заголовки — latin1).
      opts=opts||{};
      let uname='';try{uname=encodeURIComponent(un());}catch(e){}
      const h=new Headers(opts.headers||{});
      h.set('X-Client-Id',CLIENT_ID);
      if(uname)h.set('X-User-Name',uname);
      const tk=adminToken();if(tk)h.set('X-Admin-Token',tk);
      opts.headers=h;
    }
    if(isApi){busy++;upd();}
    try{
      const r=await orig(url,opts);
      if(isApi&&!r.ok&&method!=='GET'){
        let msg='';
        try{const j=await r.clone().json();msg=j&&j.error?String(j.error):'';}catch(e){}
        try{toast('⚠️ Ошибка сервера ('+r.status+')'+(msg?': '+msg:''),'err');}catch(e){}
      }
      return r;
    }catch(e){
      if(isApi&&Date.now()-lastNetToast>5000){
        lastNetToast=Date.now();
        try{toast('⚠️ Нет связи с сервером','err');}catch(_){}
      }
      throw e;
    }finally{
      if(isApi){busy--;upd();}
    }
  };
})();

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let map, sites=[], bases=[], layers=[];
let currentObj=null, currentType=null, activeSiteId=null;
let currentTab='overview', filterSt='all';
let mapMode='view', machinePlaceId=null, machinePlaceBaseId=null;
let bMarkers={}, mMarkers={}, lGroups={}, volLayers={};
let pgkTab='workers', pgkWorkers=[], pgkMachinery=[], pgkEquipment=[];
let pgkFuelReserves=[], pgkSpareGroups=[], pgkSpares=[];
let pgkEquipGroups=[];
let pgkMatGroups=[];
let kamSiteId=null;
let CTX_ACTIONS=[];
let _canvasRenderers={};
function getCanvasRenderer(paneName){
  paneName=paneName||'overlayPane';
  if(!_canvasRenderers[paneName]) _canvasRenderers[paneName]=L.canvas({pane:paneName,padding:1.0});
  return _canvasRenderers[paneName];
}
// SVG-рендерер: в отличие от canvas, пустые области НЕ перехватывают события мыши.
// Нужен для панелей поверх маркеров (volPointsPane, z-index 640) — иначе сплошной
// canvas накрыл бы карту и наведение на маркеры/слои под ним переставало бы работать.
let _svgRenderers={};
function getSvgRenderer(paneName){
  paneName=paneName||'overlayPane';
  if(!_svgRenderers[paneName]) _svgRenderers[paneName]=L.svg({pane:paneName,padding:1.0});
  return _svgRenderers[paneName];
}
let drawMode=null, drawPts=[], drawPtNames=[], drawTmpLayer=null, drawVolId=null, drawSiteId=null, drawVolData=null;
let volVisible={}; // per-volume show/hide
let vpLayers={}; // per fact-entry map layers (key=progress id)
let layerVisibility={}; // persists visible state across loadAll reloads
let layerLabels={}; // per-layer label (permanent tooltip) toggle state
let siteLayerCache={}; // cache of site-KML layer data {id:{name,color,geojson}}
let siteLayerVisibility={}; // user-toggled visible state for site KML layers
let vpVisible={}; // per fact-entry visibility toggle
let drawingFactId=null; // which fact entry is being drawn
let moveMode=null, moveData=null;
