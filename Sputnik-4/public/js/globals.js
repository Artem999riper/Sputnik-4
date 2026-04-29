// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const API='/api';
const TRANSPORT_TYPES=['ТРЭКОЛ','БУРЛАК','ТАНК','ТРОМ','ЛЕГКОВАЯ','ГРУЗОВАЯ','СНЕГОХОД'];
const DRILL_TYPES=['УБШМ','УБГМ','УРБ'];
const MICONS={ТРЭКОЛ:'🚙',БУРЛАК:'🚛',ТАНК:'🪖',ЛЕГКОВАЯ:'🚗',ГРУЗОВАЯ:'🚚',СНЕГОХОД:'🏂',УБШМ:'⚙️',УБГМ:'🔧',УРБ:'🔩'};
const MTYPES=[...TRANSPORT_TYPES,...DRILL_TYPES];
const WORKER_STATUSES={working:'🟢 В работе',idle:'⏸ Простой',sick:'🏥 Больничный',home:'🏠 Дома',fired:'🚫 Уволен'};
const SL={working:'В работе',idle:'Стоит',broken:'Сломана'};
const SSL={active:'Активный',paused:'Пауза',done:'Завершён'};
const LCOLORS=['#1a56db','#7c3aed','#057a55','#c05621','#c81e1e','#0891b2','#b45309'];
const MPRESET=['Дизельное топливо','Бензин','Уголок металлический','Трубы обсадные','Буровой раствор','Цемент','Щебень','Масло моторное','Питьевая вода'];
const REVISIONS=['Р0','Р1','Р2','Р3','Р4','Р5'];

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let map, sites=[], bases=[], layers=[];
let currentObj=null, currentType=null, activeSiteId=null;
let currentTab='overview', filterSt='all';
let mapMode='view', machinePlaceId=null, machinePlaceBaseId=null;
let bMarkers={}, mMarkers={}, lGroups={}, volLayers={};
let pgkTab='workers', pgkWorkers=[], pgkMachinery=[], pgkEquipment=[];
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
let kamSiteId=null;
// ═══════════════════════════════════════════════════════════
// КАМЕРАЛЬНЫЕ — loadKam / renderKam
// ═══════════════════════════════════════════════════════════
