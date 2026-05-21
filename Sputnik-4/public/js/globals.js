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
let _canvasRenderer=null;
function getCanvasRenderer(){if(!_canvasRenderer)_canvasRenderer=L.canvas({padding:0.5});return _canvasRenderer;}
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
