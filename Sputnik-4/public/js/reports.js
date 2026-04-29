async function openPersonnelReport(){
  const today=new Date();
  // Always use summary endpoint to get last_shift_start, last_shift_end, rest_days, last_shift_volume
  let summaryWorkers=[];
  try{summaryWorkers=await fetch(`${API}/pgk/workers/summary`).then(r=>r.json());}catch(e){}
  if(summaryWorkers.length)pgkWorkers=summaryWorkers;

  const todayStr=today.toISOString().split('T')[0];
  const allWorkers=summaryWorkers.map(w=>{
    const shiftDays=w.last_shift_start
      ? Math.max(0,Math.floor((new Date(w.last_shift_end||todayStr)-new Date(w.last_shift_start))/86400000))
      : (w.start_date?Math.floor((today-new Date(w.start_date))/86400000):null);
    return {...w, field_days:shiftDays};
  }).sort((a,b)=>(b.field_days||0)-(a.field_days||0));
  _personnelData=[...allWorkers];

  const total=allWorkers.length;
  const inField=allWorkers.filter(w=>w.last_shift_start&&!w.last_shift_end).length;
  const longRest=allWorkers.filter(w=>(w.rest_days||0)>=30).length;

  const html=`
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:80px;background:var(--s2);border-radius:var(--rs);padding:8px 10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--acc)">${total}</div>
        <div style="font-size:9px;color:var(--tx3)">Всего</div>
      </div>
      <div style="flex:1;min-width:80px;background:var(--s2);border-radius:var(--rs);padding:8px 10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--grn)">${inField}</div>
        <div style="font-size:9px;color:var(--tx3)">На вахте</div>
      </div>
      <div style="flex:1;min-width:80px;background:${longRest?'#fef3c7':'var(--s2)'};border-radius:var(--rs);padding:8px 10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:${longRest?'#92400e':'var(--tx3)'}">${longRest}</div>
        <div style="font-size:9px;color:var(--tx3)">Отдых 30+ дн.</div>
      </div>
    </div>
    <div style="max-height:400px;overflow-y:auto">
      <table id="personnel-report-table" style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:var(--s2)">
            <th style="padding:5px 6px;text-align:left;border-bottom:1px solid var(--bd)">Сотрудник</th>
            <th style="padding:5px 6px;text-align:left;border-bottom:1px solid var(--bd)">Должность</th>
            <th style="padding:5px 6px;text-align:left;border-bottom:1px solid var(--bd)">База</th>
            <th style="padding:5px 6px;text-align:center;border-bottom:1px solid var(--bd)">Начало вахты</th>
            <th style="padding:5px 6px;text-align:center;border-bottom:1px solid var(--bd)">Посл. выезд</th>
            <th style="padding:5px 6px;text-align:center;border-bottom:1px solid var(--bd)">Дней отдыха</th>
            <th style="padding:5px 6px;text-align:right;border-bottom:1px solid var(--bd)">Объём</th>
          </tr>
        </thead>
        <tbody>
          ${allWorkers.map((w,i)=>`<tr style="background:${i%2?'var(--s2)':'var(--s)'}">
            <td style="padding:4px 6px;font-weight:600">${esc(w.name)}</td>
            <td style="padding:4px 6px;color:var(--tx2)">${esc(w.role||'—')}</td>
            <td style="padding:4px 6px">${esc(w.base_name||'—')}</td>
            <td style="padding:4px 6px;text-align:center">${w.last_shift_start?fmt(w.last_shift_start):'—'}</td>
            <td style="padding:4px 6px;text-align:center">${w.last_shift_end?fmt(w.last_shift_end):'—'}</td>
            <td style="padding:4px 6px;text-align:center;${(w.rest_days||0)>=30?'color:#92400e;font-weight:700':''}">${w.rest_days!=null?w.rest_days+' дн.':'—'}</td>
            <td style="padding:4px 6px;text-align:right;color:var(--acc)">${w.last_shift_volume!=null?w.last_shift_volume:'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  showModal('👷 Отчёт по персоналу',html,[
    {label:'Закрыть',cls:'bs',fn:closeModal},
    {label:'📤 Excel',cls:'bp',fn:()=>exportPersonnelExcel(allWorkers)}
  ]);
}

function exportPersonnelExcel(workers){
  const wb=XLSX.utils.book_new();
  const todayDate=new Date();
  const todayStr=todayDate.toISOString().split('T')[0];
  const todayFmt=todayDate.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});

  // Theme colors from Office 2007 scheme used in the example file
  // accent1=#4F81BD tint0.6 → #B9CCE4 (light blue header fill)
  // accent3=#9BBB59 tint0.4 → #C3D69B (green header row fill)
  const COLS=10;
  const hdrFill='C3D69B';   // light green — header row
  const rowFill='B9CCE4';   // light blue — odd data rows
  const titleFill='D9E1F2'; // light blue-gray — title

  const border={
    top:{style:'medium',color:{rgb:'000000'}},
    bottom:{style:'medium',color:{rgb:'000000'}},
    left:{style:'medium',color:{rgb:'000000'}},
    right:{style:'medium',color:{rgb:'000000'}},
  };
  const thinBorder={
    top:{style:'thin',color:{rgb:'000000'}},
    bottom:{style:'thin',color:{rgb:'000000'}},
    left:{style:'thin',color:{rgb:'000000'}},
    right:{style:'thin',color:{rgb:'000000'}},
  };
  const baseAlign={horizontal:'center',vertical:'center',wrapText:true};
  const leftAlign={horizontal:'left',vertical:'center',wrapText:true};

  const hdr=['№','Сотрудник','Должность','Местоположение',
    'Дата начала командировки','Последняя дата выезда',
    'Продолжительность командировки, дней','Продолжительность отдыха, дней',
    'Суммарный выполненный объём','Примечания'];

  const aoa=[
    ['Отчёт по персоналу ПурГеоКом — '+todayFmt],
    hdr,
  ];

  workers.forEach((w,i)=>{
    // last_shift_start comes from worker_shifts (completed shifts only);
    // for an ongoing shift the start date lives in w.start_date
    const shiftStart=w.last_shift_start||(!w.last_shift_end?w.start_date:null);
    const onShift=!!shiftStart&&!w.last_shift_end;
    const shiftDays=onShift
      ? Math.max(0,Math.floor((new Date(todayStr)-new Date(shiftStart))/86400000))
      : null;
    aoa.push([
      i+1,
      w.name||'',
      w.role||'',
      w.base_name||'',
      onShift?shiftStart:'',
      w.last_shift_end||'',
      shiftDays!=null?shiftDays:'',
      w.rest_days!=null?w.rest_days:'',
      w.last_shift_volume!=null?w.last_shift_volume:'',
      w.notes||''
    ]);
  });

  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:5},{wch:26},{wch:20},{wch:20},{wch:14},{wch:14},{wch:14},{wch:13},{wch:14},{wch:30}];
  ws['!rows']=[{hpx:32},{hpx:46}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:COLS-1}}];

  function colLetter(c){let s='',n=c;do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
  function ref(r,c){return colLetter(c)+(r+1);}
  function setStyle(cr,st){if(!ws[cr])ws[cr]={t:'s',v:''};ws[cr].s=st;}

  // Title row
  setStyle(ref(0,0),{
    font:{name:'Times New Roman',bold:true,sz:14},
    alignment:{horizontal:'center',vertical:'center'},
    fill:{patternType:'solid',fgColor:{rgb:titleFill}},
    border
  });

  // Header row (row index 1)
  for(let c=0;c<COLS;c++){
    setStyle(ref(1,c),{
      font:{name:'Times New Roman',bold:true,sz:11},
      alignment:baseAlign,
      fill:{patternType:'solid',fgColor:{rgb:hdrFill}},
      border
    });
  }

  // Data rows (start at index 2)
  workers.forEach((w,i)=>{
    const r=i+2;
    const isBlue=i%2===0;
    const fill=isBlue?{patternType:'solid',fgColor:{rgb:rowFill}}:{patternType:'solid',fgColor:{rgb:'FFFFFF'}};
    for(let c=0;c<COLS;c++){
      const align=c===1||c===2||c===3||c===9?leftAlign:baseAlign;
      setStyle(ref(r,c),{font:{name:'Times New Roman',sz:11},alignment:align,fill,border:thinBorder});
    }
  });

  ws['!views']=[{state:'frozen',xSplit:0,ySplit:2}];

  // Summary sheet by bases
  const baseGroups={};
  workers.forEach(w=>{const bn=w.base_name||'—';if(!baseGroups[bn])baseGroups[bn]=[];baseGroups[bn].push(w);});
  const sumAoa=[
    ['Сводка по базам'],
    ['База','Кол-во сотрудников','На вахте','Средний объём'],
    ...Object.entries(baseGroups).map(([bn,ww])=>[
      bn,ww.length,
      ww.filter(w=>w.last_shift_start&&!w.last_shift_end).length,
      ww.filter(w=>w.last_shift_volume!=null).length
        ?Math.round(ww.filter(w=>w.last_shift_volume!=null).reduce((a,w)=>a+(w.last_shift_volume||0),0)/ww.filter(w=>w.last_shift_volume!=null).length)
        :''
    ])
  ];
  const sumWs=XLSX.utils.aoa_to_sheet(sumAoa);
  sumWs['!cols']=[{wch:25},{wch:18},{wch:12},{wch:14}];
  sumWs['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}}];

  XLSX.utils.book_append_sheet(wb,ws,'Персонал');
  XLSX.utils.book_append_sheet(wb,sumWs,'По базам');
  XLSX.writeFile(wb,'Персонал_'+todayStr.replace(/-/g,'_')+'.xlsx');
  toast('Excel сохранён','ok');
}

// ═══════════════════════════════════════════════════════════
// ОТЧЁТ ПО ТЕХНИКЕ
// ═══════════════════════════════════════════════════════════
let reportSortCol='', reportSortDir=1;
function sortReport(col, tblId){
  if(reportSortCol===col){reportSortDir*=-1;}else{reportSortCol=col;reportSortDir=1;}
  const tbl=document.getElementById(tblId);
  if(!tbl)return;
  const tbody=tbl.querySelector('tbody');
  const rows=[...tbody.querySelectorAll('tr')];
  const idx=['name','type','status','base','plate','days'].indexOf(col);
  if(idx<0)return;
  rows.sort(function(a,b){
    const av=(a.children[idx]&&a.children[idx].textContent)||'';
    const bv=(b.children[idx]&&b.children[idx].textContent)||'';
    return reportSortDir*(av.localeCompare(bv,'ru'));
  });
  rows.forEach(function(r){tbody.appendChild(r);});
  // Update sort arrows
  tbl.querySelectorAll('th[data-col]').forEach(function(th){
    th.textContent=th.textContent.replace(/ [▲▼]/,'');
    if(th.dataset.col===col)th.textContent+=(reportSortDir>0?' ▲':' ▼');
  });
}

async function openMachineryReport(){
  const mach=pgkMachinery.length?pgkMachinery:await fetch(`${API}/pgk/machinery`).then(r=>r.json()).catch(()=>[]);
  const today=new Date();
  const transport=mach.filter(m=>TRANSPORT_TYPES.includes(m.type));
  const drills=mach.filter(m=>DRILL_TYPES.includes(m.type));
  const working=mach.filter(m=>m.status==='working').length;
  const broken=mach.filter(m=>m.status==='broken').length;

  const html=`
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:70px;background:var(--s2);border-radius:var(--rs);padding:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--acc)">${mach.length}</div><div style="font-size:9px;color:var(--tx3)">Всего</div></div>
    <div style="flex:1;min-width:70px;background:var(--s2);border-radius:var(--rs);padding:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--grn)">${working}</div><div style="font-size:9px;color:var(--tx3)">В работе</div></div>
    <div style="flex:1;min-width:70px;background:${broken?'#fef2f2':'var(--s2)'};border-radius:var(--rs);padding:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--red)">${broken}</div><div style="font-size:9px;color:var(--tx3)">Сломана</div></div>
    <div style="flex:1;min-width:70px;background:var(--s2);border-radius:var(--rs);padding:8px;text-align:center"><div style="font-size:20px;font-weight:800">${transport.length}</div><div style="font-size:9px;color:var(--tx3)">Транспорт</div></div>
    <div style="flex:1;min-width:70px;background:var(--s2);border-radius:var(--rs);padding:8px;text-align:center"><div style="font-size:20px;font-weight:800">${drills.length}</div><div style="font-size:9px;color:var(--tx3)">Буровые</div></div>
  </div>
  <div style="max-height:400px;overflow:auto">
  <table id="mach-report-tbl" style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="background:var(--s2)">
      <th data-col="name" style="padding:5px 6px;text-align:left;cursor:pointer;border-bottom:1px solid var(--bd)" onclick="sortReport('name','mach-report-tbl')">Название ▲▼</th>
      <th data-col="type" style="padding:5px 6px;cursor:pointer;border-bottom:1px solid var(--bd)" onclick="sortReport('type','mach-report-tbl')">Тип</th>
      <th data-col="status" style="padding:5px 6px;cursor:pointer;border-bottom:1px solid var(--bd)" onclick="sortReport('status','mach-report-tbl')">Статус</th>
      <th data-col="base" style="padding:5px 6px;text-align:left;cursor:pointer;border-bottom:1px solid var(--bd)" onclick="sortReport('base','mach-report-tbl')">База</th>
      <th data-col="plate" style="padding:5px 6px;border-bottom:1px solid var(--bd)">Номер</th>
      <th style="padding:5px 6px;border-bottom:1px solid var(--bd)">Прикреплено</th>
    </tr></thead>
    <tbody>
      ${mach.map(function(m,i){
        const b=bases.find(x=>x.id===m.base_id);
        const drill=TRANSPORT_TYPES.includes(m.type)?mach.find(x=>x.drill_id===m.id):null;
        const host=DRILL_TYPES.includes(m.type)&&m.drill_id?mach.find(x=>x.id===m.drill_id):null;
        return`<tr style="background:${i%2?'var(--s2)':'var(--s)'}${m.status==='broken'?';border-left:3px solid var(--red)':''}">
          <td style="padding:4px 6px;font-weight:600">${MICONS[m.type]||'🔧'} ${esc(m.name)}</td>
          <td style="padding:4px 6px;text-align:center">${esc(m.type||'—')}</td>
          <td style="padding:4px 6px;text-align:center">${SL[m.status]||m.status}</td>
          <td style="padding:4px 6px">${esc(b?b.name:'—')}</td>
          <td style="padding:4px 6px;text-align:center">${esc(m.plate_number||'—')}</td>
          <td style="padding:4px 6px;font-size:10px;color:var(--tx2)">${drill?'⛏ '+esc(drill.name):host?'🚙 '+esc(host.name):'—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  showModal('🚛 Отчёт по технике',html,[
    {label:'Закрыть',cls:'bs',fn:closeModal},
    {label:'📤 Excel',cls:'bp',fn:()=>exportMachineryExcel(mach)}
  ]);
}
function exportMachineryExcel(mach){
  const wb=XLSX.utils.book_new();
  const today=new Date().toLocaleDateString('ru');
  const aoa=[
    ['Отчёт по технике ПурГеоКом — '+today],[],
    ['Название','Тип','Категория','Статус','База','Гос. номер','Прикреплено','Координаты'],
    ...mach.map(m=>{
      const b=bases.find(x=>x.id===m.base_id);
      const drill=TRANSPORT_TYPES.includes(m.type)?mach.find(x=>x.drill_id===m.id):null;
      const host=DRILL_TYPES.includes(m.type)&&m.drill_id?mach.find(x=>x.id===m.drill_id):null;
      return[m.name,m.type||'',DRILL_TYPES.includes(m.type)?'Буровая':'Транспорт',
        SL[m.status]||m.status,b?b.name:'',m.plate_number||'',
        drill?drill.name:host?host.name:'',
        m.lat&&m.lng?m.lat.toFixed(5)+', '+m.lng.toFixed(5):''];
    })
  ];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:25},{wch:12},{wch:12},{wch:12},{wch:18},{wch:12},{wch:20},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws,'Техника');
  XLSX.writeFile(wb,'Техника_'+today.replace(/\./g,'_')+'.xlsx');
  toast('Excel сохранён','ok');
}

// ═══════════════════════════════════════════════════════════
// NAME GATE
// ═══════════════════════════════════════════════════════════
function checkNameGate(){
  const name=localStorage.getItem('pgk_username');
  if(!name||!name.trim()){
    // Новый пользователь — показываем экран входа
    const gate=document.getElementById('name-gate');
    if(gate) gate.style.display='flex';
    const inp=document.getElementById('name-gate-inp');
    if(inp) inp.focus();
    return false;
  }
  // Известный пользователь — подставляем имя сразу
  const unm=document.getElementById('unm');
  if(unm) unm.value=name;
  // Также подставляем роль если сохранена
  const role=localStorage.getItem('pgk_userrole');
  if(role){
    const roleEl=document.getElementById('unm-role');
    if(roleEl) roleEl.title=role;
  }
  return true;
}
function submitNameGate(){
  const inp=document.getElementById('name-gate-inp');
  const val=(inp&&inp.value||'').trim();
  if(!val){inp&&inp.focus();toast('Введите фамилию и имя','err');return;}
  const role=(document.getElementById('name-gate-role')&&document.getElementById('name-gate-role').value||'').trim();
  const phone=(document.getElementById('name-gate-phone')&&document.getElementById('name-gate-phone').value||'').trim();
  localStorage.setItem('pgk_username',val);
  localStorage.setItem('pgk_userrole',role);
  localStorage.setItem('pgk_userphone',phone);
  document.getElementById('unm').value=val;
  document.getElementById('name-gate').style.display='none';
  // Add to PGK workers if not already exists
  fetch(`${API}/pgk/workers`).then(r=>r.json()).then(function(workers){
    const exists=workers.find(function(w){return w.name.trim().toLowerCase()===val.toLowerCase();});
    if(!exists){
      fetch(`${API}/pgk/workers`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:val,role:role||'',phone:phone||'',status:'home'})});
    }
  }).catch(function(){});
  initApp();
}
async function initApp(){
  switchView('map');
  // Грузим основные данные (объекты, базы, слои, техника) → сайдбар и карта
  await loadAll();
  // Параллельно грузим бейджи грузов, задач и уведомлений
  await Promise.allSettled([
    fetchNotifs(),
    loadGruz(),
    loadGTasks(),
  ]);
  // SSE подписка на серверные события — push-обновления вместо частого polling
  startSseListener();
  // Подстраховка: редкий polling на случай разрыва SSE
  setInterval(loadAll, 120000);
  setInterval(function(){ try{loadGruz();}catch(e){} try{loadGTasks();}catch(e){} }, 180000);
  setTimeout(startNotifPolling, 3000);
}

// ═══════════════════════════════════════════════════════════
// SSE CLIENT — слушает /api/events, дебаунсит обновления данных
// ═══════════════════════════════════════════════════════════
let _sseSrc = null;
let _sseTimer = null;
let _sseGruzTimer = null;
function startSseListener(){
  if(typeof EventSource==='undefined')return;
  function connect(){
    try{
      _sseSrc=new EventSource(`${API}/events`);
      _sseSrc.onmessage=function(e){
        let ev; try{ev=JSON.parse(e.data);}catch(_){return;}
        if(ev.type!=='change')return;
        handleSseChange(ev);
      };
      _sseSrc.onerror=function(){
        try{_sseSrc.close();}catch(_){}
        _sseSrc=null;
        setTimeout(connect,5000);
      };
    }catch(e){setTimeout(connect,5000);}
  }
  connect();
}
function handleSseChange(ev){
  const url=ev.url||'';
  // Перерисовка текущего объекта в панели — если изменилось то, что относится к нему
  if(typeof currentObj!=='undefined'&&currentObj){
    const id=currentObj.id;
    if(id&&url.indexOf(id)>=0){
      if(_sseTimer)clearTimeout(_sseTimer);
      _sseTimer=setTimeout(function(){try{refreshCurrent&&refreshCurrent();}catch(e){}},400);
    }
  }
  // Грузы / задачи — отдельный дебаунс
  if(url.indexOf('/cargo')>=0||url.indexOf('/gtasks')>=0||url.indexOf('/tasks')>=0||url.indexOf('/notifications')>=0){
    if(_sseGruzTimer)clearTimeout(_sseGruzTimer);
    _sseGruzTimer=setTimeout(function(){
      try{loadGruz&&loadGruz();}catch(e){}
      try{loadGTasks&&loadGTasks();}catch(e){}
      try{fetchNotifs&&fetchNotifs();}catch(e){}
    },600);
  }
  // Базовые сущности — общий дебаунсированный loadAll
  if(url.match(/\/(sites|bases|layers|pgk|materials|volumes|vol_progress|kameral|remarks|machinery|workers|equipment)/)){
    if(_sseAllTimer)clearTimeout(_sseAllTimer);
    _sseAllTimer=setTimeout(function(){try{loadAll&&loadAll();}catch(e){}},900);
  }
}
let _sseAllTimer=null;


// ═══════════════════════════════════════════════════════════
// DRAGGABLE MODAL
// ═══════════════════════════════════════════════════════════
(function(){
  var modal=null,hd=null,dx=0,dy=0,dragging=false,startX=0,startY=0;
  function getModal(){return document.getElementById('modal');}
  function getHd(){return document.querySelector('.mhd');}
  document.addEventListener('mousedown',function(e){
    var h=getHd();
    if(h&&h.contains(e.target)){
      modal=getModal();
      var r=modal.getBoundingClientRect();
      dx=e.clientX-r.left;dy=e.clientY-r.top;
      dragging=true;modal.classList.add('dragging');
      e.preventDefault();
    }
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging||!modal)return;
    var x=e.clientX-dx,y=e.clientY-dy;
    x=Math.max(0,Math.min(x,window.innerWidth-modal.offsetWidth));
    y=Math.max(0,Math.min(y,window.innerHeight-modal.offsetHeight));
    modal.style.position='fixed';
    modal.style.left=x+'px';modal.style.top=y+'px';
    modal.style.transform='none';modal.style.margin='0';
  });
  document.addEventListener('mouseup',function(){
    dragging=false;if(modal)modal.classList.remove('dragging');modal=null;
  });
  // Reset position when new modal opened
  var origShow=null;
  var orig=window.showModal;
  window.addEventListener('DOMContentLoaded',function(){
    var m=getModal();if(m){m.style.position='';m.style.left='';m.style.top='';m.style.transform='';}
  });
})();

// ═══════════════════════════════════════════════════════════
// KML / GPX PER SITE
// ═══════════════════════════════════════════════════════════
async function openSiteKMLPanel(siteId){
  let siteLayers=[]; try{siteLayers=await fetch(`${API}/sites/${siteId}/layers`).then(r=>{if(!r.ok)return[];return r.json();});}catch(e){}
  // Populate siteLayerCache for instant toggle without extra fetches
  siteLayers.forEach(function(l){ siteLayerCache[l.id]=l; });
  const html='<div style="margin-bottom:10px">'
    +'<label class="btn bp bsm" style="cursor:pointer">📂 Импортировать KML/GPX'
    +'<input type="file" accept=".kml,.gpx" style="display:none" data-site-id="'+siteId+'" onchange="importSiteKMLEvt(event)">'
    +'</label></div>'
    +'<div id="site-kml-list">'
    +(siteLayers.length?siteLayers.map(function(l){
      // Use siteLayerVisibility if user has toggled, else use server value
      const isVis=siteLayerVisibility.hasOwnProperty(l.id)?siteLayerVisibility[l.id]:!!(l.visible);
      return'<div class="li" style="padding:5px 8px">'
        +'<div class="lim"><div class="lin">'+esc(l.name)+'</div></div>'
        +'<div class="lia">'
        +'<button class="btn bg bxs" data-lid="'+l.id+'" data-sid="'+siteId+'" data-vis="'+(isVis?'1':'0')+'" onclick="toggleSiteLayerBtn(this)" title="'+(isVis?'Скрыть':'Показать')+'">'+(isVis?'👁':'🚫')+'</button>'
        +'<button class="btn bd bxs" data-lid="'+l.id+'" data-sid="'+siteId+'" onclick="deleteSiteLayerBtn(this)">✕</button>'
        +'</div></div>';
    }).join(''):'<div class="empty">Нет слоёв</div>')
    +'</div>';
  showModal('🗺 Слои KML/GPX — '+esc((currentObj&&currentObj.name)||''),html,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
function importSiteKMLEvt(ev){const siteId=ev.target.dataset.siteId;importSiteKML(ev,siteId);}
async function importSiteKML(ev,siteId){
  const file=ev.target.files[0];if(!file)return;
  const text=await file.text();
  const ext=file.name.split('.').pop().toLowerCase();
  let gj;
  try{gj=ext==='gpx'?gpxToGJ(text):kmlToGJ(text);}catch(e){toast('Ошибка разбора файла','err');return;}
  const color=['#1a56db','#0891b2','#057a55','#7e3af2','#e02424'][Math.floor(Math.random()*5)];
  await fetch(`${API}/sites/${siteId}/layers`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:file.name.replace(/\.[^.]+$/,''),geojson:JSON.stringify(gj),color})});
  // Reload layers
  let layers=[]; try{layers=await fetch(`${API}/sites/${siteId}/layers`).then(r=>{if(!r.ok)return[];return r.json();});}catch(e){}
  // Render them on map
  layers.forEach(function(l){
    if(l.visible&&l.geojson){
      try{
        L.geoJSON(JSON.parse(l.geojson),{style:{color:l.color,weight:2.5,opacity:.85,fillOpacity:.2},
          pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:6,fillColor:l.color,color:'#fff',weight:2,fillOpacity:.9});}
        }).addTo(map);
      }catch(e){}
    }
  });
  closeModal();
  openSiteKMLPanel(siteId);
  toast('Слой импортирован','ok');
}
function deleteSiteLayerBtn(btn){deleteSiteLayer(btn.dataset.lid,btn.dataset.sid);}
async function deleteSiteLayer(layerId,siteId){
  if(!confirm('Удалить слой?'))return;
  await fetch(`${API}/layers/${layerId}`,{method:'DELETE'});
  closeModal();openSiteKMLPanel(siteId);
}





























function toggleSiteLayerBtn(btn){
  const lid=btn.dataset.lid;
  const nowVisible=btn.dataset.vis==='1';
  const newVis=!nowVisible;
  // Persist user choice in local cache (survives modal reopen)
  siteLayerVisibility[lid]=newVis;
  // Update button instantly
  btn.dataset.vis=newVis?'1':'0';
  btn.textContent=newVis?'👁':'🚫';
  btn.title=newVis?'Скрыть':'Показать';
  // Update map layer instantly using cached geojson
  if(newVis){
    const cached=siteLayerCache[lid];
    if(cached&&cached.geojson){
      if(lGroups['s_'+lid]){try{map.removeLayer(lGroups['s_'+lid]);}catch(e){}}
      try{
        lGroups['s_'+lid]=L.geoJSON(JSON.parse(cached.geojson),{
          style:{color:cached.color||'#1a56db',weight:2.5,opacity:.85,fillOpacity:.2},
          pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:6,fillColor:cached.color||'#1a56db',color:'#fff',weight:2,fillOpacity:.9});}
        }).addTo(map);
      }catch(e){}
    }
  } else {
    if(lGroups['s_'+lid]){try{map.removeLayer(lGroups['s_'+lid]);}catch(e){}delete lGroups['s_'+lid];}
  }
  // Save to server in background (no extra GET needed — use cached name/color)
  if(siteLayerCache[lid]) siteLayerCache[lid].visible=newVis?1:0;
  const cached=siteLayerCache[lid]||{};
  fetch(`${API}/layers/${lid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:cached.name||lid,color:cached.color||'#1a56db',visible:newVis?1:0})
  }).catch(function(){ toast('Ошибка сохранения видимости слоя','err'); });
}

function toggleSiteLayer(layerId,vis){
  fetch(`${API}/layers/${layerId}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({visible:vis?1:0})});
}

// ═══════════════════════════════════════════════════════════
// MATERIALS ACTUALIZATION
// ═══════════════════════════════════════════════════════════
