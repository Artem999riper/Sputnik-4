// Правка вершин объёмов и фактов убрана: объём — слой KML (правка геометрии — kml-edit.js).
let vertexEditLayerId=null;
async function openAssignWorkerModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allWorkers=await fetch(`${API}/pgk/workers`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.workers||[]).map(w=>w.id));
  const avail=allWorkers.filter(w=>!assigned.has(w.id));
  if(!avail.length){toast('Все сотрудники уже назначены на эту базу или других нет','err');return;}
  const today=new Date().toISOString().split('T')[0];
  showModal('📋 Назначить сотрудника на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Сотрудник</label><select id="f-aw" style="width:100%">
        ${avail.map(w=>`<option value="${w.id}">${esc(w.name)} ${w.role?'— '+esc(w.role):''}</option>`).join('')}
      </select></div>
      <div class="fg"><label>Дата заезда</label><input id="f-asd" type="date" value="${today}"></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const wid=v('f-aw'),sd=v('f-asd');
      const w=allWorkers.find(x=>x.id===wid);if(!w)return;
      await fetch(`${API}/pgk/workers/${wid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...w,base_id:currentObj.id,start_date:sd,status:'working',user_name:un()})});
      closeModal();await refreshCurrent();toast('Сотрудник назначен на вахту','ok');
    }}]);
}
async function openAssignMachModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allMach=await fetch(`${API}/pgk/machinery`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.machinery||[]).map(m=>m.id));
  const avail=allMach.filter(m=>!assigned.has(m.id)&&TRANSPORT_TYPES.includes(m.type));
  if(!avail.length){toast('Нет доступного транспорта. Добавьте в ПГК → Техника','err');return;}
  showModal('📋 Назначить технику на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Транспорт</label><select id="f-am" style="width:100%">
        ${avail.map(m=>`<option value="${m.id}">${MICONS[m.type]||'🚙'} ${esc(m.name)} ${m.plate_number?'· '+m.plate_number:''}</option>`).join('')}
      </select></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const mid=v('f-am');
      const m=allMach.find(x=>x.id===mid);if(!m)return;
      await fetch(`${API}/pgk/machinery/${mid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...m,base_id:currentObj.id,user_name:un()})});
      // Also assign any attached drill
      if(m.drill_id){
        const drill=allMach.find(x=>x.id===m.drill_id);
        if(drill)await fetch(`${API}/pgk/machinery/${m.drill_id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...drill,base_id:currentObj.id,user_name:un()})});
      }
      closeModal();await refreshCurrent();toast('Техника назначена','ok');
    }}]);
}
async function openAssignEquipModal(){
  if(!currentObj){toast('Выберите базу','err');return;}
  const allEquip=await fetch(`${API}/pgk/equipment`).then(r=>r.json()).catch(()=>[]);
  const assigned=new Set((currentObj.equipment||[]).map(e=>e.id));
  const avail=allEquip.filter(e=>!assigned.has(e.id));
  if(!avail.length){toast('Нет доступного оборудования. Добавьте в ПГК → Оборудование','err');return;}
  showModal('📋 Назначить оборудование на базу',
    `<div class="fgr fone">
      <div class="fg"><label>Оборудование</label><select id="f-ae" style="width:100%">
        ${avail.map(e=>`<option value="${e.id}">${esc(e.name)} ${e.type?'— '+esc(e.type):''}</option>`).join('')}
      </select></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Назначить',cls:'bp',fn:async()=>{
      const eid=v('f-ae');
      const e=allEquip.find(x=>x.id===eid);if(!e)return;
      await fetch(`${API}/pgk/equipment/${eid}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...e,base_id:currentObj.id})});
      closeModal();await refreshCurrent();toast('Оборудование назначено','ok');
    }}]);
}

let _personnelData=[];let _personnelSort={col:'days',asc:false};
function sortPersonnel(col,th){
  if(_personnelSort.col===col){_personnelSort.asc=!_personnelSort.asc;}
  else{_personnelSort={col,asc:col!=='days'};}
  _personnelData.sort(function(a,b){
    let va=a[col]||'',vb=b[col]||'';
    if(col==='days'){va=+a.field_days||0;vb=+b.field_days||0;}
    return (va<vb?-1:va>vb?1:0)*(_personnelSort.asc?1:-1);
  });
  // Re-render table body
  const tbody=document.querySelector('#personnel-report-table tbody');
  if(!tbody)return;
  tbody.innerHTML=_personnelData.map(function(w,i){
    return`<tr style="background:${i%2?'var(--s2)':'var(--s)'}${(w.field_days||0)>=30?';border-left:3px solid #f59e0b':''}">
      <td style="padding:4px 6px;font-weight:600">${esc(w.name)}</td>
      <td style="padding:4px 6px;color:var(--tx2)">${esc(w.role||'—')}</td>
      <td style="padding:4px 6px">${esc(w.base_name||'—')}</td>
      <td style="padding:4px 6px;color:var(--tx3)">${esc(w.machine_name||'—')}</td>
      <td style="padding:4px 6px;text-align:center;font-weight:700;color:${(w.field_days||0)>=30?'#92400e':(w.field_days||0)>0?'var(--acc)':'var(--tx3)'}">
        ${w.field_days!==null?(w.field_days+' дн.'):'—'}
      </td>
      <td style="padding:4px 6px;color:var(--tx3)">${esc(w.phone||'—')}</td>
    </tr>`;
  }).join('');
}


// ═══════════════════════════════════════════════════════════
// GLOBAL LOG
// ═══════════════════════════════════════════════════════════
async function openGLog(){
  const[users,log]=await Promise.all([fetch(`${API}/log/users`).then(r=>r.json()),fetch(`${API}/log`).then(r=>r.json())]);
  showModal('Журнал',`<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
    <label style="font-size:9px;font-weight:700;color:var(--tx3)">Польз.:</label>
    <select id="gl-u" style="background:var(--s2);border:1.5px solid var(--bd);border-radius:4px;font-size:11px;padding:2px 6px;outline:none" onchange="loadGLE()">
      <option value="">Все</option>${users.map(u=>`<option>${esc(u)}</option>`).join('')}
    </select></div>
    <div id="gl-e" style="max-height:420px;overflow-y:auto">${renderGLE(log)}</div>`,
    [{label:'🔁 Изменения с откатом',cls:'bs',fn:()=>{closeModal();openAuditLog();}},{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
function renderGLE(log){return log.map(l=>`<div class="lgr"><div class="lgt">${fmtDT(l.created_at)}</div>
  <div>${l.site_name?`<div style="font-size:9px;color:var(--acc);font-weight:700">${esc(l.site_name)}</div>`:''}<div class="lga">${esc(l.action)}</div>
  <div class="lgd">${esc(l.details||'')} <span style="color:var(--tx3)">· ${esc(l.user_name)}</span></div></div></div>`).join('')||'<div class="empty">Пусто</div>';}
async function loadGLE(){const u=v('gl-u');const log=await fetch(`${API}/log${u?`?user=${encodeURIComponent(u)}`:''}`).then(r=>r.json());const el=document.getElementById('gl-e');if(el)el.innerHTML=renderGLE(log);}

// ═══════════════════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════════════════
async function exportExcel(siteId){
  toast('Готовлю Excel...','ok');
  const s=await fetch(`${API}/sites/${siteId}`).then(r=>r.json());
  const wb=XLSX.utils.book_new();
  const sh=(data,name)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),name);

  // Карты ID→имя для работников и техники
  const wMap={},mMap={};
  (s.bases||[]).forEach(b=>{
    (b.workers||[]).forEach(w=>{wMap[w.id]=w.name;});
    (b.machinery||[]).forEach(m=>{mMap[m.id]=m.name;});
  });

  // ── Обзор ──────────────────────────────────────────────────
  sh([['ПурГеоКом — Объект'],[''],['Объект',s.name],['Заказчик',s.client||''],['Договор №',s.contract_number||''],
    ['Адрес',s.address||''],['Начало',fmt(s.start_date)],['Срок',fmt(s.end_date)],['Статус',SSL[s.status]||s.status],
    ['Готовность',s.completion_percent+'%'],['Баз',(s.bases||[]).length],
    ['Персонал',(s.bases||[]).reduce((a,b)=>a+(b.workers||[]).length,0)],
    ['Техника',(s.bases||[]).reduce((a,b)=>a+(b.machinery||[]).length,0)],['Примечания',s.notes||'']],'Обзор');

  // ── Базы ───────────────────────────────────────────────────
  sh([['База','Широта','Долгота','Персонал','Техника','Материалов','Описание'],
    ...(s.bases||[]).map(b=>[b.name,b.lat,b.lng,(b.workers||[]).length,(b.machinery||[]).length,(b.materials||[]).length,b.description||''])],'Базы');

  // ── Персонал ───────────────────────────────────────────────
  sh([['ФИО','Должность','База','Машина'],
    ...(s.bases||[]).flatMap(b=>(b.workers||[]).map(w=>{const m=(b.machinery||[]).find(x=>x.id===w.machine_id);return[w.name,w.role||'',b.name,m?m.name:'']}))],'Персонал');

  // ── Техника ────────────────────────────────────────────────
  sh([['Название','Тип','Госномер','Статус','База','Широта','Долгота'],
    ...(s.bases||[]).flatMap(b=>(b.machinery||[]).map(m=>[m.name,m.type||'',m.plate_number||'',SL[m.status]||m.status,b.name,m.lat||'',m.lng||'']))],'Техника');

  // ── Материалы ──────────────────────────────────────────────
  sh([['Материал','Кол-во','Ед.','Мин. запас','База'],
    ...(s.bases||[]).flatMap(b=>(b.materials||[]).map(m=>[m.name,m.amount,m.unit,m.min_amount,b.name]))],'Материалы');

  // ── Объёмы: план и выполнение (на слоях — по объектам слоя) ──
  const catName=c=>(typeof VOL_SECTIONS!=='undefined'&&VOL_SECTIONS[c]||{}).label||c||'';
  (pgkWorkers||[]).forEach(w=>{wMap[w.id]=wMap[w.id]||w.name;});
  (pgkMachinery||[]).forEach(m=>{mMap[m.id]=mMap[m.id]||m.name;});
  const fact=(s.vol_progress||[]).filter(p=>(p.row_type||'fact')==='fact');
  const volMap={};(s.volumes||[]).forEach(v=>{volMap[v.id]=v;});
  sh([['Вид работ','Раздел','Источник','План','Ед.','Выполнено','%','Второй показатель','План 2','Выполнено 2','Нач. план','Оконч. план'],
    ...(s.volumes||[]).map(v=>{
      const m=volMeasure(v), rows=fact.filter(p=>p.volume_id===v.id);
      const done=rows.reduce((a,p)=>a+(+p.completed||0),0), done2=rows.reduce((a,p)=>a+(+p.amount2||0),0);
      const l=v.layer_id&&(layers||[]).find(x=>x.id===v.layer_id);
      return[v.name,catName(v.category),v.layer_id?('Слой: '+(l?l.name:'(удалён)')):'Без карты',v.amount,v.unit,+done.toFixed(3),
        v.amount>0?Math.round(done/v.amount*100)+'%':'—',m.second&&v.layer_id?m.second.unit:'',m.second&&v.layer_id?v.amount2:'',m.second&&v.layer_id?+done2.toFixed(3):'',
        fmt(v.plan_start),fmt(v.plan_end)];
    })],'Объёмы');

  // ── Объекты слоёв-объёмов: каждый пункт с отметкой выполнения ──
  const fr=[['Объём','Объект','Тип','Широта','Долгота','План (поле)','Выполнено','Дата','Факт','Исполнители','Техника','Примечание','Атрибуты']];
  (s.volumes||[]).filter(v=>v.layer_id).forEach(v=>{
    const l=(layers||[]).find(x=>x.id===v.layer_id);if(!l)return;
    const m=volMeasure(v);
    _kaFeatures(l).forEach((f,i)=>{
      const p=f.properties||{};if(!f.geometry)return;
      const c=f.geometry.type==='Point'?f.geometry.coordinates:null;
      const attrs=Object.keys(p).filter(k=>!k.startsWith('_')&&k!=='name'&&k!=='Name'&&(!m.second||k!==m.second.field)).map(k=>k+': '+p[k]).join('; ');
      fr.push([v.name,p.name||p.Name||('Объект '+(i+1)),f.geometry.type,c?+c[1].toFixed(7):'',c?+c[0].toFixed(7):'',
        m.second?(p[m.second.field]??''):'',p._skip?'исключён':p._done?'да':'нет',p._done?fmt(p._done_date):'',
        p._done&&m.second?(p._fact2!=null?p._fact2:(p[m.second.field]??'')):'',
        String(p._workers||'').split(',').filter(Boolean).map(id=>wMap[id]||id).join(', '),p._machine?(mMap[p._machine]||p._machine):'',p._note||'',attrs]);
    });
  });
  if(fr.length>1)sh(fr,'Объекты объёмов');

  // ── Выполнение по дням (журнал) ────────────────────────────
  const vpRows=[['Дата','Объём','Ед.','Выполнено','Второй показатель','Объект / запись','Работники','Техника','Источник']];
  fact.slice().sort((a,b)=>a.work_date<b.work_date?-1:1).forEach(p=>{
    const vol=volMap[p.volume_id];if(!vol)return;const m=volMeasure(vol);
    vpRows.push([fmt(p.work_date),vol.name,vol.unit,p.completed,p.amount2!=null?p.amount2+' '+((m.second||{}).unit||''):'',p.notes||'',
      (p.worker_ids||'').split(',').filter(Boolean).map(id=>wMap[id]||id).join(', '),p.machine_id?(mMap[p.machine_id]||p.machine_id):'',p.source==='kml'?'отметка в слое':'вручную']);
  });
  if(vpRows.length>1)sh(vpRows,'Выполнение по дням');

  // ── Камеральные ────────────────────────────────────────────
  const kr=[['Специалист','Роль','Ревизия','% готовности','Папка отчёта','Откр.замечаний','Закр.замечаний']];
  (s.kameral||[]).forEach(k=>{
    kr.push([k.specialist_name||'',k.specialist_role||'',k.revision||'Р0',k.completion_percent+'%',k.report_link||'',
      (k.remarks||[]).filter(r=>r.status==='open').length,(k.remarks||[]).filter(r=>r.status==='closed').length]);
    (k.remarks||[]).forEach(r=>kr.push(['','','','','  → '+r.text,'',r.link||'']));
  });
  sh(kr,'Камеральные');

  // ── Схема района ───────────────────────────────────────────
  const mr=[['СХЕМА РАЙОНА РАБОТ'],[''],['Тип','Название','Широта','Долгота','Статус','База']];
  (s.bases||[]).forEach(b=>mr.push(['🏕 База',b.name,b.lat,b.lng,b.description||'','—']));
  (s.bases||[]).forEach(b=>(b.machinery||[]).filter(m=>m.lat&&m.lng).forEach(m=>mr.push([`🚛 ${m.type||'Техника'}`,m.name,m.lat,m.lng,SL[m.status]||m.status,b.name])));
  sh(mr,'Схема района');

  const fname=`${s.name.replace(/[\/\\:*?"<>|]/g,'_')}_${new Date().toLocaleDateString('ru').replace(/\./g,'-')}.xlsx`;
  XLSX.writeFile(wb,fname);toast(`Сохранён: ${fname}`,'ok');
}

// ═══════════════════════════════════════════════════════════
// 🚛 ГРУЗ — ЗАЯВКИ НА ПЕРЕВОЗКУ
// ═══════════════════════════════════════════════════════════
let gruzOrders = [];
const GRUZ_STATUS = {new:'🔵 Новая', transit:'🟡 В пути', delivered:'✅ Доставлено', cancelled:'✕ Отменена'};
const GRUZ_STATUS_CLS = {new:'new', transit:'transit', delivered:'delivered', cancelled:'cancelled'};

