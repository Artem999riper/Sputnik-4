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
// Имя для сервера: поле в шапке или сохранённое при входе; пусто — человек ещё не представился
const myName=()=>{let n='';try{n=((document.getElementById('unm')||{}).value||'').trim()||localStorage.getItem('pgk_username')||'';}catch(e){}return n==='Пользователь'?'':n.trim();};
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
      if(typeof applyCapsToUI==='function')applyCapsToUI();
      if(iAmAdmin&&typeof admHealthBadge==='function')setTimeout(admHealthBadge,1500);}
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
      let uname='';try{uname=encodeURIComponent(myName());}catch(e){}
      const h=new Headers(opts.headers||{});
      h.set('X-Client-Id',CLIENT_ID);
      if(uname)h.set('X-User-Name',uname);
      const tk=adminToken();if(tk)h.set('X-Admin-Token',tk);
      opts.headers=h;
    }
    if(isApi){busy++;upd();}
    try{
      const r=await orig(url,opts);
      // сервер требует представиться — показать окно входа (имя обязательно)
      if(isApi&&r.status===401){
        try{const j=await r.clone().json();if(j&&j.needName){const g=document.getElementById('name-gate');if(g&&g.style.display!=='flex'){g.style.display='flex';const i=document.getElementById('name-gate-inp');if(i)i.focus();}return r;}}catch(e){}
      }
      // доступ закрыт администратором — экран вместо потока ошибок
      if(isApi&&r.status===403){
        try{const j=await r.clone().json();if(j&&j.blocked){showKicked(Object.assign({blocked:true},j));return r;}}catch(e){}
      }
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
      // в журнал ошибок — какой запрос не дошёл и какого размера (большой слой сервер может оборвать)
      if(isApi&&e&&e.name==='TypeError'){
        const kb=opts&&typeof opts.body==='string'?Math.round(opts.body.length/1024):0;
        const ne=new TypeError(`Нет связи с сервером: ${method} ${String(url).replace(/^https?:\/\/[^/]+/,'').slice(0,80)}${kb?`, ${kb>2048?(kb/1024).toFixed(1)+' МБ':kb+' КБ'}`:''} (${e.message})`);
        ne.stack=e.stack;throw ne;
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
// Карта готова? (window.map — это ещё и <div id="map">: браузер так отдаёт элементы с id, поэтому проверяем сам объект Leaflet)
const mapReady=()=>typeof map!=='undefined'&&!!map&&typeof map.on==='function';
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

// ═══════════════════════════════════════════════════════════
// UI-КОНФИГ: какие вкладки скрыты (глобально, задаётся админом)
// ═══════════════════════════════════════════════════════════
let HIDDEN_TABS=[]; // массив data-v скрытых вкладок ('dash', 'smg', ...)
async function loadUiConfig(){
  try{
    const r=await fetch(`${API}/ui-config`);
    if(!r.ok)return;
    const d=await r.json();
    HIDDEN_TABS=Array.isArray(d&&d.hiddenTabs)?d.hiddenTabs:[];
  }catch(e){ HIDDEN_TABS=[]; }
  applyHiddenTabs();
}
function applyHiddenTabs(){
  try{
    document.querySelectorAll('.nt[data-v]').forEach(function(el){
      const v=el.dataset.v;
      if(v==='map'){ el.style.display=''; return; } // карту скрыть нельзя
      el.style.display=HIDDEN_TABS.indexOf(v)>=0?'none':'';
    });
    // Если активная вкладка оказалась скрыта — уходим на карту
    const active=document.querySelector('.nt.on[data-v]');
    if(active&&active.dataset.v!=='map'&&HIDDEN_TABS.indexOf(active.dataset.v)>=0){
      if(typeof switchView==='function')switchView('map');
    }
  }catch(e){}
}

// ── Ошибки в браузере → журнал ошибок админа (routes/health.js) ──
// Одинаковые — не чаще раза в минуту; ошибки загрузки картинок/тайлов не считаем.
(function () {
  const sent = new Map();
  // обрыв связи — не ошибка программы: копим неудачные запросы и, когда связь вернётся,
  // пишем в журнал одну запись «связь прерывалась с … по …»
  const OUT = window._NETOUT = { first: 0, last: 0, n: 0, reqs: [] };
  const _hm = t => new Date(t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setInterval(() => {
    if (!OUT.n || Date.now() - OUT.last < 15000) return;
    const msg = `Связь с сервером прерывалась: ${_hm(OUT.first)} — ${_hm(OUT.last)} (≈${Math.max(1, Math.round((OUT.last - OUT.first) / 1000))} с), неудачных запросов ${OUT.n}: ${OUT.reqs.join(', ')}${OUT.n > OUT.reqs.length ? '…' : ''}`;
    fetch(`${API}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, stack: 'Сервер не отвечал (перезапуск, выключен, сеть). Сама программа в браузере при этом не ломалась.', url: location.pathname }) })
      .then(r => { if (r.ok) { OUT.n = 0; OUT.reqs = []; OUT.first = 0; } }).catch(() => {});
  }, 10000);
  const report = (message, stack) => {
    message = String(message || 'Ошибка').slice(0, 1000);
    if (/ResizeObserver loop|Script error\.?$/.test(message)) return;
    const net = message.match(/Нет связи с сервером:?\s*([A-Z]+ \S+)?/) || (/Failed to fetch|NetworkError|Load failed/.test(message) && [message, '']);
    if (net) {
      const now = Date.now(); if (!OUT.first) OUT.first = now; OUT.last = now; OUT.n++;
      const r = (net[1] || '').trim(); if (r && OUT.reqs.length < 6 && !OUT.reqs.includes(r)) OUT.reqs.push(r);
      return;
    }
    const k = message, t = sent.get(k); if (t && Date.now() - t < 60000) return; sent.set(k, Date.now());
    try {
      fetch(`${API}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stack: String(stack || '').slice(0, 6000), url: location.pathname + location.hash + (document.querySelector('.nt.on') ? ' · вкладка ' + document.querySelector('.nt.on').dataset.v : '') }) }).catch(() => {});
    } catch (e) {}
  };
  window.addEventListener('error', e => { if (e && e.error !== undefined || e.message) report(e.message || (e.error && e.error.message), (e.error && e.error.stack) || `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`); });
  window.addEventListener('unhandledrejection', e => { const r = e && e.reason; report('Промис: ' + ((r && r.message) || r), r && r.stack); });
  window.reportClientError = report;
})();

// ── «Вас отключил администратор» ─────────────────────────────
// info: {msg, blocked, until (мс; 0 — до разблокировки)}. Страница перестаёт
// получать обновления; «Подключиться снова» — перезагрузка (если доступ закрыт —
// сервер снова покажет этот экран).
function showKicked(info){
  info=info||{};window._pgkKicked=true;
  try{if(typeof _sseSrc!=='undefined'&&_sseSrc){_sseSrc.close();_sseSrc=null;}}catch(e){}
  let o=document.getElementById('kicked-ovl');
  if(!o){o=document.createElement('div');o.id='kicked-ovl';document.body.appendChild(o);}
  const e=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const till=info.blocked?(info.until?'Доступ закрыт до '+new Date(info.until).toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Доступ закрыт до разблокировки администратором'):'';
  o.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center';
  o.innerHTML='<div style="background:var(--s,#fff);color:var(--tx,#111);border-radius:12px;padding:22px 26px;max-width:420px;width:calc(100% - 40px);box-shadow:0 16px 50px rgba(0,0,0,.4);text-align:center">'
    +'<div style="font-size:34px;margin-bottom:6px">🚫</div>'
    +'<div style="font-size:16px;font-weight:800;margin-bottom:8px">'+(info.blocked?'Доступ к программе закрыт':'Вас отключил администратор')+'</div>'
    +(info.msg?'<div style="font-size:13px;margin-bottom:8px;padding:8px 10px;background:rgba(148,163,184,.15);border-radius:8px">'+e(info.msg)+'</div>':'')
    +(till?'<div style="font-size:12px;color:#b45309;margin-bottom:10px">'+e(till)+'</div>':'')
    +'<div style="font-size:11.5px;opacity:.7;margin-bottom:14px">Несохранённые изменения на этой странице могли не дойти до сервера.</div>'
    +'<button class="btn bp" onclick="location.reload()">🔄 Подключиться снова</button></div>';
}

// ── Слои карты: качаем только изменившиеся ──────────────────
// GET /api/layers (без параметров) перехватывается: сначала лёгкий список без
// геометрии (?lite=1, у каждого слоя rev — версия геометрии), затем геометрия
// только новых и изменившихся слоёв (POST /api/layers-get), остальное — из памяти.
// Раньше каждый браузер раз в 2 минуты и после любой правки любого слоя перекачивал
// ВСЕ слои целиком — на медленной сети это забивало канал сервера.
(function () {
  const of = window.fetch;
  const C = new Map();          // id → { rev, geojson }
  let inflight = null;
  const fake = arr => ({
    ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => arr.map(o => ({ ...o })),
    text: async () => JSON.stringify(arr),
    clone() { return fake(arr); },
  });
  async function smart() {
    const lr = await of(`${API}/layers?lite=1`, { cache: 'no-store' });
    if (!lr.ok) return lr;
    const lite = await lr.json();
    const need = lite.filter(l => { const c = C.get(l.id); return !c || c.rev !== (l.rev || 0); }).map(l => l.id);
    for (let i = 0; i < need.length; i += 60) {
      const r = await of(`${API}/layers-get`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: need.slice(i, i + 60) }) });
      if (!r.ok) return of(`${API}/layers`);   // что-то не так — по-старому, целиком
      (await r.json()).forEach(x => C.set(x.id, { rev: x.rev || 0, geojson: x.geojson }));
    }
    const ids = new Set(lite.map(l => l.id));
    [...C.keys()].forEach(k => { if (!ids.has(k)) C.delete(k); });
    return fake(lite.map(l => { const c = C.get(l.id), o = { ...l, geojson: c ? c.geojson : '{"type":"FeatureCollection","features":[]}' }; delete o.glen; return o; }));
  }
  window.fetch = function (u, o) {
    const isList = typeof u === 'string' && /\/api\/layers$/.test(u) && (!o || !o.method || /^get$/i.test(o.method));
    if (!isList) return of.apply(this, arguments);
    // одновременные запросы списка (SSE + таймер + вкладка) — один на всех
    if (!inflight) inflight = smart().catch(() => of(`${API}/layers`)).finally(() => { setTimeout(() => { inflight = null; }, 0); });
    return inflight.then(r => (typeof r.clone === 'function' ? r.clone() : r));
  };
  window._layersCacheInfo = () => ({ layers: C.size, mb: +([...C.values()].reduce((s, c) => s + (c.geojson || '').length, 0) / 1048576).toFixed(1) });
})();
