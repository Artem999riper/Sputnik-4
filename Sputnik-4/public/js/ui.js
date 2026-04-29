function showCtx(x,y,items){
  CTX_ACTIONS=[];
  const m=document.getElementById('ctx');
  m.innerHTML=items.map(it=>{
    if(it.sep)return'<div class="cxs"></div>';
    const i=CTX_ACTIONS.length;CTX_ACTIONS.push(it.f);
    return`<div class="cxi ${esc(it.cls||'')}" data-i="${i}">${it.i||''} ${it.html?it.l:esc(it.l||'')}</div>`;
  }).join('');
  // Блокируем всплытие с контекстного меню на карту
  m.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();});
  m.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();});
  m.querySelectorAll('.cxi').forEach(el=>{
    el.addEventListener('mousedown',e=>{
      e.stopPropagation();e.preventDefault();
      const fn=CTX_ACTIONS[parseInt(el.dataset.i)];
      if(typeof fn==='function'){setTimeout(()=>{hideCtx();fn();},10);}
    });
  });
  m.style.left=Math.min(x,window.innerWidth-210-8)+'px';
  m.style.top=Math.min(y,window.innerHeight-items.length*34-8)+'px';
  m.classList.add('show');
}
function hideCtx(){document.getElementById('ctx').classList.remove('show');}

// ═══════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════
function showModal(title,body,buttons){
  document.getElementById('mtit').textContent=title;
  document.getElementById('mbd').innerHTML=body;
  document.getElementById('mft').innerHTML=buttons.map(b=>`<button class="btn ${b.cls}">${b.label}</button>`).join('');
  const btns=document.querySelectorAll('#mft .btn');
  buttons.forEach((b,i)=>{if(btns[i])btns[i].addEventListener('click',()=>{if(typeof b.fn==='function')b.fn();});});
  // Reset modal position (drag reset)
  const m=document.getElementById('modal');
  if(m){m.style.position='';m.style.left='';m.style.top='';m.style.transform='';m.style.margin='';}
  document.getElementById('mov').classList.add('open');
  setTimeout(()=>{const fi=document.querySelector('#mbd input,#mbd textarea');if(fi)fi.focus();},80);
}
function closeModal(){document.getElementById('mov').classList.remove('open');try{clearMachHistory();}catch(e){}}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
function toast(msg,type){
  const c=document.getElementById('toasts');
  const el=document.createElement('div');el.className=`toast ${type||''}`;el.textContent=msg;
  c.appendChild(el);setTimeout(()=>el.remove(),3200);
}

// Удаление через API с поддержкой "Отменить" (stateless — данные хранятся на клиенте)
async function apiDelUndo(url,msg,refresh){
  let r; try{r=await fetch(`${API}${url}`,{method:'DELETE'}).then(r=>r.json());}catch(e){r={error:'Ошибка сети'};}
  if(r&&r.error){toast('Ошибка: '+r.error,'err');return false;}
  if(refresh){try{await refresh();}catch(e){}}
  if(r&&r._restore) showUndoBar(msg||'Удалено', r._restore, refresh);
  else toast(msg||'Удалено','ok');
  return true;
}

// Заметная панель "Отменить" внизу экрана — исчезает через 10 секунд
let _undoBarTimer=null, _undoBarEl=null;
function showUndoBar(msg, restoreData, onUndone){
  // Убрать предыдущую если была
  if(_undoBarEl){clearTimeout(_undoBarTimer);_undoBarEl.remove();_undoBarEl=null;}
  if(!restoreData){toast(msg,'ok');return;}

  const bar=document.createElement('div');
  bar.id='undo-bar';
  bar.style.cssText=[
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'background:#1e293b','color:#fff','border-radius:10px',
    'box-shadow:0 4px 20px rgba(0,0,0,.45)','display:flex','align-items:center',
    'gap:14px','padding:12px 18px','z-index:9999','font-size:13px','font-weight:500',
    'min-width:280px','max-width:90vw','animation:undoSlideIn .25s ease'
  ].join(';');

  const txt=document.createElement('span');txt.textContent=msg;txt.style.flex='1';

  // Progress bar показывает оставшееся время (10 с)
  const prog=document.createElement('div');
  prog.style.cssText='position:absolute;bottom:0;left:0;height:3px;background:#3b82f6;border-radius:0 0 10px 10px;width:100%;transition:width 10s linear';

  const btn=document.createElement('button');
  btn.textContent='↩ Отменить';
  btn.style.cssText=[
    'background:#3b82f6','border:none','color:#fff','border-radius:6px',
    'padding:6px 14px','font-size:13px','font-weight:700','cursor:pointer',
    'font-family:inherit','white-space:nowrap','flex-shrink:0'
  ].join(';');

  const close=document.createElement('button');
  close.textContent='✕';
  close.style.cssText='background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;padding:0 2px;line-height:1';

  btn.onclick=async function(){
    btn.disabled=true;btn.textContent='…';
    clearTimeout(_undoBarTimer);
    try{
      const r=await fetch(`${API}/restore`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(restoreData)
      }).then(r=>r.json());
      if(r&&r.ok){toast('Восстановлено ✓','ok');try{onUndone&&onUndone();}catch(e){}}
      else toast('Не удалось отменить: '+(r&&r.error||'ошибка'),'err');
    }catch(e){toast('Ошибка отмены','err');}
    bar.remove();_undoBarEl=null;
  };
  close.onclick=function(){clearTimeout(_undoBarTimer);bar.remove();_undoBarEl=null;};

  bar.appendChild(txt);bar.appendChild(btn);bar.appendChild(close);bar.appendChild(prog);
  document.body.appendChild(bar);
  _undoBarEl=bar;

  // Start shrinking progress bar
  requestAnimationFrame(()=>{ prog.style.width='0%'; });

  _undoBarTimer=setTimeout(()=>{bar.remove();_undoBarEl=null;},10000);
}

// Устаревшая обёртка (оставлена для обратной совместимости с вызовами toastUndo в коде)
function toastUndo(msg,trashId,onUndone){toast(msg,'ok');}

// ═══════════════════════════════════════════════════════════
// 🔔 СИСТЕМА УВЕДОМЛЕНИЙ
// ═══════════════════════════════════════════════════════════
let _notifs=[], _notifOpen=false, _notifTimer=null;

async function fetchNotifs(){
  const me=un();
  if(!me||me==='Пользователь')return;
  try{
    const data=await fetch(`${API}/notifications?user=${encodeURIComponent(me)}`).then(r=>r.json());
    const prev=_notifs.map(n=>n.id);
    _notifs=data;
    // Show toast for brand-new notifications (not seen in previous poll)
    data.filter(n=>!prev.includes(n.id)).forEach(n=>{
      showNotifToast(n);
    });
    renderNotifBadge();
    if(_notifOpen)renderNotifPanel();
  }catch(e){}
}

function showNotifToast(n){
  const isCargo = n.ref_type==='cargo' || n.type==='cargo_assigned';
  const targetView = isCargo ? 'gruz' : 'gtasks';
  const btnLabel = isCargo ? '🚛 Открыть груз' : '📋 Открыть задачи';
  const borderColor = isCargo ? '#f59e0b' : '#7c3aed';
  const bgColor = isCargo ? '#fffbeb' : '#faf5ff';
  const btnBg = isCargo ? '#d97706' : '#7c3aed';
  const closeBorder = isCargo ? '#fcd34d' : '#c4b5fd';
  const closeColor = isCargo ? '#d97706' : '#7c3aed';
  const c=document.getElementById('toasts');
  const el=document.createElement('div');
  el.className='toast';
  el.style.cssText=`cursor:pointer;border-left-color:${borderColor};background:${bgColor};max-width:280px`;
  el.innerHTML=`<div style="font-weight:700;font-size:11px">${esc(n.title||'')}</div>`
    +(n.body?`<div style="font-size:10px;color:var(--tx2);margin-top:2px">${esc(n.body)}</div>`:'')+
    `<div style="display:flex;gap:6px;margin-top:6px">
      <button style="background:${btnBg};border:none;border-radius:4px;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;cursor:pointer">${btnLabel}</button>
      <button style="background:none;border:1px solid ${closeBorder};border-radius:4px;color:${closeColor};font-size:10px;padding:2px 8px;cursor:pointer">✕</button>
    </div>`;
  const btns=el.querySelectorAll('button');
  btns[0].onclick=(e)=>{e.stopPropagation();el.remove();markNotifRead([n.id]);switchView(targetView);};
  btns[1].onclick=(e)=>{e.stopPropagation();el.remove();markNotifRead([n.id]);};
  el.onclick=()=>{el.remove();markNotifRead([n.id]);switchView(targetView);};
  c.appendChild(el);
  setTimeout(()=>{if(el.parentNode)el.remove();},8000);
}

function renderNotifBadge(){
  const me=un();
  const cargoCnt=_notifs.filter(n=>!n.is_read&&(n.ref_type==='cargo'||n.type==='cargo_assigned')).length;
  const taskCnt=_notifs.filter(n=>!n.is_read&&n.ref_type!=='cargo'&&n.type!=='cargo_assigned').length;
  const cnt=_notifs.filter(n=>!n.is_read).length;

  const badge=document.getElementById('notif-count');
  const tabBadge=document.getElementById('notif-badge');
  const gruzBadge=document.getElementById('gruz-notif-badge');

  if(badge){
    badge.textContent=cnt>9?'9+':cnt;
    badge.classList.toggle('show',cnt>0);
  }
  if(tabBadge){
    tabBadge.textContent=taskCnt>9?'9+':taskCnt;
    tabBadge.style.display=taskCnt>0?'inline':'none';
  }
  if(gruzBadge){
    const activeCargo=gruzOrders.filter(o=>o.status==='new'||o.status==='transit').length;
    gruzBadge.textContent=activeCargo>9?'9+':activeCargo;
    gruzBadge.style.display=activeCargo>0?'inline':'none';
  }
  // Мои грузы: красный кружок на вкладке Груз — грузы где я в notify_workers и статус new/transit
  const myTasksBadge=document.getElementById('gruz-my-tasks-badge');
  if(myTasksBadge){
    const myCargoOpen=gruzOrders.filter(o=>{
      if(o.status!=='new'&&o.status!=='transit')return false;
      try{const nw=JSON.parse(o.notify_workers||'[]');return nw.includes(me);}catch(e){return false;}
    }).length;
    myTasksBadge.textContent=myCargoOpen>9?'9+':myCargoOpen;
    myTasksBadge.style.display=myCargoOpen>0?'inline':'none';
    myTasksBadge.title='Мои грузы в работе';
  }
  // Обновим фиолетовый значок открытых задач на вкладке Задачи
  const openBadge=document.getElementById('gtasks-open-badge');
  if(openBadge){
    const openCnt=gtasks.filter(t=>t.status!=='done').length;
    openBadge.textContent=openCnt>99?'99+':openCnt;
    openBadge.style.display=openCnt>0?'inline':'none';
  }
  // Pulse the bell if new notifs
  const btn=document.getElementById('notif-btn');
  if(btn)btn.style.borderColor=cnt>0?'#ef4444':'';
}

function renderNotifPanel(){
  const list=document.getElementById('notif-list');
  const foot=document.getElementById('notif-foot-txt');
  if(!list)return;
  const unread=_notifs.filter(n=>!n.is_read);
  if(foot)foot.textContent=unread.length?`Непрочитанных: ${unread.length}`:'Всё прочитано';
  if(!_notifs.length){
    list.innerHTML='<div class="np-empty">🎉 Нет уведомлений</div>';
    return;
  }
  list.innerHTML=_notifs.map(n=>{
    const isCargo = n.ref_type==='cargo' || n.type==='cargo_assigned';
    const icon = isCargo ? '🚛' : '📋';
    return `<div class="np-item${n.is_read?'':' unread'}" onclick="notifClick('${escAttr(n.id)}','${escAttr(n.ref_id||'')}')">
      <div class="np-icon">${icon}</div>
      <div class="np-body">
        <div class="np-title">${esc(n.title)}</div>
        <div class="np-text">${esc(n.body||'')}</div>
        <div class="np-time">${fmtDT(n.created_at)}</div>
      </div>
      ${!n.is_read?'<div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;margin-top:5px"></div>':''}
    </div>`;
  }).join('');
}

function notifClick(id, refId){
  markNotifRead([id]);
  // Update local state immediately
  const n=_notifs.find(x=>x.id===id);
  _notifs=_notifs.map(x=>x.id===id?{...x,is_read:1}:x);
  renderNotifBadge();renderNotifPanel();
  toggleNotifPanel();
  const isCargo = n && (n.ref_type==='cargo' || n.type==='cargo_assigned');
  switchView(isCargo ? 'gruz' : 'gtasks');
}

function toggleNotifPanel(){
  _notifOpen=!_notifOpen;
  const p=document.getElementById('notif-panel');
  if(!p)return;
  p.classList.toggle('show',_notifOpen);
  if(_notifOpen)renderNotifPanel();
  // Close on outside click
  if(_notifOpen){
    setTimeout(()=>{
      document.addEventListener('click',_notifOutsideClick,{once:false});
    },50);
  } else {
    document.removeEventListener('click',_notifOutsideClick);
  }
}

function _notifOutsideClick(e){
  if(!e.target.closest('#notif-panel')&&!e.target.closest('#notif-btn')){
    _notifOpen=false;
    document.getElementById('notif-panel')?.classList.remove('show');
    document.removeEventListener('click',_notifOutsideClick);
  }
}

async function markNotifRead(ids){
  const me=un();
  if(!me||!ids?.length)return;
  try{
    await fetch(`${API}/notifications/read`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,user:me})});
    _notifs=_notifs.map(n=>ids.includes(n.id)?{...n,is_read:1}:n);
    renderNotifBadge();
  }catch(e){}
}

async function markAllNotifRead(){
  const me=un();if(!me)return;
  try{
    await fetch(`${API}/notifications/read`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:me})});
    _notifs=_notifs.map(n=>({...n,is_read:1}));
    renderNotifBadge();renderNotifPanel();
  }catch(e){}
}

function startNotifPolling(){
  fetchNotifs();
  _notifTimer=setInterval(fetchNotifs,30000); // poll every 30s
}

// Re-poll when user types their name (so they get their notifications immediately)
document.addEventListener('DOMContentLoaded',()=>{
  const unm=document.getElementById('unm');
  if(unm){
    let _unTimer=null;
    unm.addEventListener('input',()=>{
      clearTimeout(_unTimer);
      _unTimer=setTimeout(()=>{_notifs=[];fetchNotifs();},600);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDash(){
  const el=document.getElementById('dash-content');
  el.innerHTML='<div style="font-size:13px;color:var(--tx3);padding:20px">Загрузка...</div>';
  try{
    const[sr,br,mr,wr,tr]=await Promise.all([
      fetch(`${API}/sites`).then(r=>r.json()),
      fetch(`${API}/bases`).then(r=>r.json()),
      fetch(`${API}/pgk/machinery`).then(r=>r.json()),
      fetch(`${API}/pgk/workers`).then(r=>r.json()),
      fetch(`${API}/log`).then(r=>r.json()),
    ]);
    const today=new Date().toISOString().split('T')[0];
    const in3d=new Date(Date.now()+3*86400000).toISOString().split('T')[0];

    // Collect all tasks across sites
    const allTasks=[];
    const sitesDetail=await Promise.all(sr.slice(0,20).map(s=>fetch(`${API}/sites/${s.id}`).then(r=>r.json()).catch(()=>null)));
    sitesDetail.filter(Boolean).forEach(s=>(s.tasks||[]).forEach(t=>allTasks.push({...t,site_name:s.name,site_id:s.id})));

    // Alerts
    const alerts=[];
    const overdueTasks=allTasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=='done');
    const soonTasks=allTasks.filter(t=>t.due_date&&t.due_date>=today&&t.due_date<=in3d&&t.status!=='done');
    const brokenMach=mr.filter(m=>m.status==='broken');
    const longWorkers=wr.filter(w=>{if(!w.start_date)return false;const d=Math.floor((Date.now()-new Date(w.start_date))/86400000);return d>=30;});
    const lowSites=sr.filter(s=>s.status==='active'&&s.end_date&&s.end_date<in3d);

    if(overdueTasks.length) alerts.push({type:'err',icon:'🚨',title:`Просрочено задач: ${overdueTasks.length}`,body:overdueTasks.slice(0,3).map(t=>`<a onclick="selectSite('${escAttr(t.site_id)}');switchView('map')">${esc(t.title)}</a> (${esc(t.site_name)})`).join(' · ')});
    if(soonTasks.length) alerts.push({type:'warn',icon:'⚠️',title:`Срок через 3 дня: ${soonTasks.length} задач`,body:soonTasks.slice(0,3).map(t=>`<a onclick="selectSite('${escAttr(t.site_id)}');switchView('map')">${esc(t.title)}</a>`).join(' · ')});
    if(brokenMach.length) alerts.push({type:'err',icon:'🔴',title:`Сломана техника: ${brokenMach.length} ед.`,body:brokenMach.map(m=>esc(m.name)).join(', ')});
    if(longWorkers.length) alerts.push({type:'warn',icon:'📅',title:`${longWorkers.length} сотрудников 30+ дней в командировке`,body:longWorkers.map(w=>{const d=Math.floor((Date.now()-new Date(w.start_date))/86400000);return `${esc(w.name)} — ${d} дн.`;}).join(' · ')});
    if(lowSites.length) alerts.push({type:'warn',icon:'📋',title:`Сдача объектов через 3 дня`,body:lowSites.map(s=>esc(s.name)).join(', ')});
    if(!alerts.length) alerts.push({type:'ok',icon:'✅',title:'Критических проблем нет',body:'Всё в порядке'});

    // Stats
    const activeSites=sr.filter(s=>s.status==='active').length;
    const avgPct=sr.length?Math.round(sr.reduce((a,s)=>a+(s.completion_percent||0),0)/sr.length):0;
    const totalWorkers=br.reduce((a,b)=>a+(b.workers||[]).length,0);
    const workingMach=mr.filter(m=>m.status==='working').length;

    const alertsHtml=alerts.map(a=>`<div class="dash-alert ${a.type}"><div class="dash-alert-icon">${a.icon}</div><div class="dash-alert-body"><div class="dash-alert-title">${a.title}</div><div style="font-size:10px;color:var(--tx2)">${a.body}</div></div></div>`).join('');

    // Active sites list
    const activeSitesList=sr.filter(s=>s.status==='active').slice(0,8).map(s=>{
      const dl=s.end_date?Math.ceil((new Date(s.end_date)-new Date())/86400000):null;
      return`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd);cursor:pointer" onclick="selectSite('${escAttr(s.id)}');switchView('map')">
        <div class="pm" style="flex:1;height:5px"><div class="pmf" style="width:${s.completion_percent}%"></div></div>
        <span style="font-size:11px;font-weight:700;min-width:32px;text-align:right">${s.completion_percent}%</span>
        <span style="font-size:11px;flex:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
        ${dl!==null?`<span style="font-size:9px;color:${dl<0?'var(--red)':dl<8?'var(--ylw)':'var(--tx3)'}">📅${dl<0?dl+'д':dl+'д'}</span>`:''}
      </div>`;
    }).join('');

    // Recent activity
    const actHtml=tr.slice(0,8).map(l=>`<div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd);font-size:10px">
      <span style="color:var(--tx3);white-space:nowrap;min-width:95px">${fmtDT(l.created_at)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(l.action)} ${esc(l.details||'')}</span>
      <span style="color:var(--tx3)">${esc(l.user_name)}</span>
    </div>`).join('');

    el.innerHTML=`
    <h2 style="font-size:18px;font-weight:800;margin-bottom:14px">📊 Дашборд</h2>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>⚠️ Предупреждения</h3>
        ${alertsHtml}
      </div>
      <div class="dash-card">
        <h3>📈 Показатели</h3>
        <div class="dash-stat"><div class="dash-stat-icon" style="background:var(--accl)">🗺</div><div><div class="dash-stat-val">${activeSites}<span style="font-size:14px;color:var(--tx3)">/${sr.length}</span></div><div class="dash-stat-lbl">Активных объектов</div></div></div>
        <div class="dash-stat"><div class="dash-stat-icon" style="background:var(--grnl)">📊</div><div><div class="dash-stat-val">${avgPct}%</div><div class="dash-stat-lbl">Средний прогресс</div></div></div>
        <div class="dash-stat"><div class="dash-stat-icon" style="background:var(--bpl)">🏕</div><div><div class="dash-stat-val">${br.length}</div><div class="dash-stat-lbl">Баз развёрнуто</div></div></div>
        <div class="dash-stat"><div class="dash-stat-icon" style="background:var(--orgl)">👷</div><div><div class="dash-stat-val">${totalWorkers}</div><div class="dash-stat-lbl">Людей на объектах</div></div></div>
        <div class="dash-stat"><div class="dash-stat-icon" style="background:var(--grnl)">🚛</div><div><div class="dash-stat-val">${workingMach}<span style="font-size:14px;color:var(--tx3)">/${mr.length}</span></div><div class="dash-stat-lbl">Техники в работе</div></div></div>
      </div>
      <div class="dash-card">
        <h3>📋 Активные объекты</h3>
        ${activeSitesList||'<div class="empty">Нет активных объектов</div>'}
      </div>
      <div class="dash-card">
        <h3>🕐 Последние действия</h3>
        ${actHtml||'<div class="empty">Пусто</div>'}
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
      <button class="btn bs bsm" onclick="openBackupModal()">💾 Резервные копии</button>
      <button class="btn bs bsm" onclick="loadDash()">🔄 Обновить</button>
    </div>`;
  }catch(e){el.innerHTML='<div class="empty">Ошибка загрузки дашборда</div>';}
}

// ═══════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════════════════════
let _searchTimer=null;
function openGlobalSearch(){
  document.getElementById('gsearch-overlay').classList.add('show');
  setTimeout(()=>document.getElementById('gsearch-input').focus(),50);
}
function closeGlobalSearch(){
  document.getElementById('gsearch-overlay').classList.remove('show');
  document.getElementById('gsearch-input').value='';
  document.getElementById('gsearch-results').innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px">Введите минимум 2 символа</div>';
}
function doGlobalSearch(q){
  clearTimeout(_searchTimer);
  if(q.length<2){document.getElementById('gsearch-results').innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px">Введите минимум 2 символа</div>';return;}
  _searchTimer=setTimeout(async()=>{
    const r=await fetch(`${API}/search?q=${encodeURIComponent(q)}`).then(r=>r.json());
    let html='';
    const section=(label,icon,items,render)=>items.length?`<div class="gsr-section">${icon} ${label}</div>${items.map(render).join('')}`:'';
    html+=section('Объекты','📍',r.sites||[],s=>`<div class="gsr-item" onclick="closeGlobalSearch();selectSite('${escAttr(s.id)}');switchView('map')">
      <span class="gsr-item-icon">📍</span><div><div class="gsr-item-main">${esc(s.name)}</div><div class="gsr-item-sub">${esc(s.client||'')} · ${s.completion_percent}%</div></div></div>`);
    html+=section('Базы','🏕',r.bases||[],b=>`<div class="gsr-item" onclick="closeGlobalSearch();selectBase('${escAttr(b.id)}');switchView('map')">
      <span class="gsr-item-icon">🏕</span><div><div class="gsr-item-main">${esc(b.name)}</div></div></div>`);
    html+=section('Сотрудники','👤',r.workers||[],w=>`<div class="gsr-item" onclick="closeGlobalSearch();if(w_base_${w.id})selectBase('${w.base_id||''}');switchView('pgk')">
      <span class="gsr-item-icon">👤</span><div><div class="gsr-item-main">${esc(w.name)}</div><div class="gsr-item-sub">${esc(w.role||'')}${w.phone?' · '+esc(w.phone):''}</div></div></div>`);
    html+=section('Техника','🚛',r.machinery||[],m=>`<div class="gsr-item" onclick="closeGlobalSearch();flyToMach('${escAttr(m.id)}');switchView('map')">
      <span class="gsr-item-icon">🚛</span><div><div class="gsr-item-main">${esc(m.name)}</div><div class="gsr-item-sub">${esc(m.type||'')} ${esc(m.plate_number||'')}</div></div></div>`);
    html+=section('Задачи','✅',r.tasks||[],t=>`<div class="gsr-item" onclick="closeGlobalSearch();selectSite('${escAttr(t.site_id)}');switchView('map')">
      <span class="gsr-item-icon">✅</span><div><div class="gsr-item-main">${esc(t.title)}</div><div class="gsr-item-sub">${esc(t.site_name||'')} · ${t.status==='done'?'Выполнено':'Открыта'}</div></div></div>`);
    if(!html) html='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px">Ничего не найдено</div>';
    document.getElementById('gsearch-results').innerHTML=html;
  },300);
}
// Ctrl+F to open search
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();openGlobalSearch();}
  if(e.key==='Escape'){closeGlobalSearch();}
});

// ═══════════════════════════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════════════════════════
async function loadPhotos(entityType, entityId, container){
  try{
    const photos=await fetch(`${API}/photos?entity_type=${entityType}&entity_id=${entityId}`).then(r=>r.json());
    renderPhotos(photos, entityType, entityId, container);
  }catch(e){}
}
// ═══════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════
const VOL_TEMPLATES={
  'geo_standard':{label:'Инженерно-геологические изыскания',volumes:[
    {name:'Скважины колонковые',unit:'пог.м',category:'geology'},
    {name:'Шурфы',unit:'шт',category:'geology'},
    {name:'Отбор монолитов',unit:'шт',category:'geology'},
    {name:'Лабораторные анализы',unit:'шт',category:'geology'},
    {name:'Полевые опыты',unit:'шт',category:'geology'},
  ]},
  'geo_survey':{label:'Инженерно-геодезические изыскания',volumes:[
    {name:'Топографическая съёмка',unit:'га',category:'geodesy'},
    {name:'Нивелирование',unit:'км',category:'geodesy'},
    {name:'Закрепление пунктов',unit:'шт',category:'geodesy'},
    {name:'Трассирование',unit:'км',category:'geodesy'},
  ]},
  'eco':{label:'Экологические изыскания',volumes:[
    {name:'Отбор проб грунта',unit:'шт',category:'geology'},
    {name:'Отбор проб воды',unit:'шт',category:'geology'},
    {name:'Маршрутные обследования',unit:'км',category:'geology'},
    {name:'Химический анализ',unit:'шт',category:'geology'},
  ]},
};
function openTemplateModal(siteId){
  const opts=Object.entries(VOL_TEMPLATES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
  showModal('Применить шаблон объёмов',`<div class="fgr fone">
    <div class="fg"><label>Шаблон</label><select id="f-tmpl">${opts}</select></div>
    <div style="font-size:10px;color:var(--tx3);margin-top:6px">Шаблон добавит типовые строки объёмов. Вы сможете изменить их после.</div>
  </div>`,[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Применить',cls:'bp',fn:async()=>{
      const tmpl=VOL_TEMPLATES[v('f-tmpl')];if(!tmpl)return;
      for(const vol of tmpl.volumes){
        await fetch(`${API}/sites/${siteId}/volumes`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...vol,amount:0,color:'#0891b2',user_name:un()})});
      }
      closeModal();await refreshCurrent();currentTab='volumes';renderTab();
      toast(`Добавлено ${tmpl.volumes.length} объёмов из шаблона «${tmpl.label}»`,'ok');
    }}]);
}

// ═══════════════════════════════════════════════════════════
// MACHINE HISTORY
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// KML/GEOJSON EXPORT
// ═══════════════════════════════════════════════════════════
function exportMapKML(){
  if(!currentObj){toast('Откройте объект для экспорта','err');return;}
  const features=[];
  (currentObj.volumes||[]).forEach(vol=>{
    if(!vol.geojson)return;
    try{const gj=JSON.parse(vol.geojson);
      (gj.features||[gj]).forEach(f=>{if(f.geometry)features.push({...f,properties:{name:vol.name,type:'volume',color:vol.color}});});
    }catch(e){}
  });
  (currentObj.vol_progress||[]).forEach(p=>{
    if(!p.geojson)return;
    try{const gj=JSON.parse(p.geojson);
      const vol=(currentObj.volumes||[]).find(v=>v.id===p.volume_id);
      (gj.features||[gj]).forEach(f=>{if(f.geometry)features.push({...f,properties:{name:(vol?vol.name:'Факт')+' '+fmt(p.work_date),type:'fact',date:p.work_date,completed:p.completed}});});
    }catch(e){}
  });
  (currentObj.bases||[]).forEach(b=>{
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[b.lng,b.lat]},properties:{name:'🏕 '+b.name,type:'base'}});
    (b.machinery||[]).filter(m=>m.lat&&m.lng).forEach(m=>{
      features.push({type:'Feature',geometry:{type:'Point',coordinates:[m.lng,m.lat]},properties:{name:'🚛 '+m.name,type:'machine',status:SL[m.status]||m.status}});
    });
  });
  const gj={type:'FeatureCollection',features};
  const blob=new Blob([JSON.stringify(gj,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(currentObj.name.replace(/[/\:*?"<>|]/g,'_'))+'_карта.geojson';
  a.click();toast('GeoJSON экспортирован','ok');
}


// ═══════════════════════════════════════════════════════════
// ИСТОРИЯ ПЕРЕМЕЩЕНИЙ ТЕХНИКИ НА КАРТЕ
// ═══════════════════════════════════════════════════════════
let machHistLayers=[];
let machHistActiveId=null; // ID машины чья история сейчас на карте

async function showMachHistory(machId){
  // Toggle: если уже показана история этой машины — скрыть
  if(machHistActiveId===machId){
    clearMachHistory();
    toast('История скрыта','ok');
    // Обновить все кнопки этой машины
    document.querySelectorAll('[data-hist-id="'+machId+'"]').forEach(function(btn){
      btn.classList.remove('on','bw');
      btn.textContent='🕐';
      btn.title='Показать историю перемещений';
    });
    return;
  }

  // Если была другая история — сначала очистить
  clearMachHistory();

  const m=pgkMachinery.find(x=>x.id===machId)||(currentObj?.machinery||[]).find(x=>x.id===machId);
  if(!m){toast('Техника не найдена','err');return;}

  toast('Загружаю историю...','ok');
  let data;
  try{
    data=await fetch(`${API}/machinery/${machId}/history`).then(r=>r.json());
  }catch(e){toast('Ошибка загрузки истории','err');return;}

  const log=data.log||[];
  const machine=data.machine||m;
  const color='#7c3aed';
  const coordRe=/→\s*([-\d.]+),\s*([-\d.]+)/;

  // Собираем точки: старые → новые
  const points=[];
  [...log].reverse().forEach(function(e){
    if(e.action&&e.action.includes('перемещена')&&e.details){
      const mm=e.details.match(coordRe);
      if(mm){
        points.push({
          lat:parseFloat(mm[1]),lng:parseFloat(mm[2]),
          date:(e.created_at||'').slice(0,16).replace('T',' '),
          user:e.user_name||'',label:e.details
        });
      }
    }
  });
  // Текущее положение — последняя точка
  if(machine.lat&&machine.lng){
    points.push({lat:machine.lat,lng:machine.lng,date:'Сейчас',user:'',label:'Текущее положение',current:true});
  }

  if(!points.length){
    toast('Нет данных о перемещениях','err');
    return;
  }

  // Рисуем на карте
  switchView('map');
  if(points.length>1){
    machHistLayers.push(L.polyline(points.map(function(p){return[p.lat,p.lng];}),{
      color,weight:3,opacity:0.8,dashArray:'8 5'
    }).addTo(map));
  }
  points.forEach(function(p,i){
    const isCur=p.current;
    const mk=L.marker([p.lat,p.lng],{
      icon:L.divIcon({className:'',iconSize:[28,28],iconAnchor:[14,14],
        html:'<div style="width:28px;height:28px;background:'+(isCur?color:'#fff')+';color:'+(isCur?'#fff':color)+
             ';border:2.5px solid '+color+';border-radius:50%;display:flex;align-items:center;justify-content:center;'+
             'font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.35)">'+(isCur?'★':(i+1))+'</div>'
      }),
      zIndexOffset:isCur?1000:100
    }).addTo(map);
    mk.bindTooltip('<b>'+(isCur?'Сейчас':p.date)+'</b>'+(p.user?' · '+esc(p.user):'')+'<br>'+esc(p.label),
      {permanent:false,className:'mlbl'});
    machHistLayers.push(mk);
  });
  try{map.fitBounds(L.featureGroup(machHistLayers).getBounds().pad(0.3));}catch(e){}

  machHistActiveId=machId;
  toast(machine.name+': '+points.length+' точек маршрута. Нажмите 🕐 ещё раз чтобы скрыть','ok');

  // Подсветить активные кнопки
  document.querySelectorAll('[data-hist-id="'+machId+'"]').forEach(function(btn){
    btn.classList.add('on');
    btn.textContent='✕ Скрыть';
    btn.title='Скрыть историю перемещений';
  });
}

function clearMachHistory(){
  machHistLayers.forEach(function(l){try{map.removeLayer(l);}catch(e){}});
  machHistLayers=[];
  if(machHistActiveId){
    document.querySelectorAll('[data-hist-id="'+machHistActiveId+'"]').forEach(function(btn){
      btn.classList.remove('on','bw');
      btn.textContent='🕐';
      btn.title='Показать историю перемещений';
    });
  }
  machHistActiveId=null;
}

window._firstLoad=true;
// Ждём полной загрузки DOM перед стартом
// (name-gate div находится ПОСЛЕ тегов script в HTML)
document.addEventListener('DOMContentLoaded', function(){
  initMap(); // карта инициализируется всегда
  if(!checkNameGate()){
    // Новый пользователь — name-gate показан, initApp() вызовется из submitNameGate()
  } else {
    // Известный пользователь — запускаем сразу
    initApp();
  }
});

