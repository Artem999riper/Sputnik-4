async function loadGruz(){
  // Load from server
  try{
    const data = await fetch(`${API}/cargo`).then(r=>r.json());
    gruzOrders = data;
  }catch(e){ gruzOrders=[]; }
  // Populate base filter
  const sel=document.getElementById('gruz-filter-base');
  if(sel){
    sel.innerHTML='<option value="">Все базы</option>'
      +bases.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  }
  renderGruz();
  renderNotifBadge();
}

function gruzNextNum(){
  const nums=gruzOrders.map(o=>parseInt(o.num||'0')).filter(n=>!isNaN(n));
  return String((nums.length?Math.max(...nums):0)+1).padStart(4,'0');
}

function renderGruz(){
  const body=document.getElementById('gruz-body');
  if(!body)return;
  const filterStatus=document.getElementById('gruz-filter-status')?.value||'';
  const filterBase=document.getElementById('gruz-filter-base')?.value||'';
  const search=(document.getElementById('gruz-search')?.value||'').toLowerCase();
  const today=new Date().toISOString().split('T')[0];

  let orders=[...gruzOrders].filter(o=>{
    if(filterStatus&&o.status!==filterStatus)return false;
    if(filterBase&&o.base_id!==filterBase)return false;
    if(search){
      const hay=(o.num+' '+(o.from_desc||'')+(o.notes||'')+(o.items||[]).map(i=>i.name).join(' ')).toLowerCase();
      if(!hay.includes(search))return false;
    }
    return true;
  });

  const allNew=gruzOrders.filter(o=>o.status==='new');
  const allTransit=gruzOrders.filter(o=>o.status==='transit');
  const allDelivered=gruzOrders.filter(o=>o.status==='delivered');
  const allCancelled=gruzOrders.filter(o=>o.status==='cancelled');
  const totalTonnage=gruzOrders.filter(o=>o.status!=='cancelled').reduce((a,o)=>a+(+o.total_weight||0),0);
  const overdue=gruzOrders.filter(o=>o.status==='transit'&&o.eta_date&&o.eta_date<today);
  const activeCount=allNew.length+allTransit.length;
  const doneCount=allDelivered.length+allCancelled.length;

  // Card renderer
  const cardHtml=o=>{
    const base=bases.find(b=>b.id===o.base_id);
    const isOverdue=o.status==='transit'&&o.eta_date&&o.eta_date<today;
    const statusCls=isOverdue?'overdue':(GRUZ_STATUS_CLS[o.status]||'new');
    const items=(o.items||[]).filter(i=>i.name);
    const daysLeft=o.eta_date?Math.ceil((new Date(o.eta_date)-new Date())/86400000):null;
    return `<div class="gruz-card status-${o.status}${isOverdue?' overdue':''}">
      <div class="gruz-head">
        <div style="flex:1;min-width:0">
          <div class="gruz-num">№${esc(o.num)}${o.depart_date?' · '+fmt(o.depart_date):''}</div>
          <div class="gruz-title">${base?'🏕 '+esc(base.name):'<span style="color:var(--tx3)">База не указана</span>'}</div>
        </div>
        <span class="gruz-badge ${statusCls}">${isOverdue?'⚠️ Просроч.':GRUZ_STATUS[o.status]||o.status}</span>
      </div>
      ${o.from_desc||o.driver||o.vehicle?`<div class="gruz-meta">
        ${o.from_desc?`<span>📍 ${esc(o.from_desc)}</span>`:''}
        ${o.driver?`<span>👤 ${esc(o.driver)}</span>`:''}
        ${o.vehicle?`<span>🚛 ${esc(o.vehicle)}</span>`:''}
      </div>`:''}
      ${o.eta_date||o.actual_arrive?`<div class="gruz-meta">
        ${o.eta_date&&o.status!=='delivered'?`<span style="color:${isOverdue?'#ef4444':daysLeft!==null&&daysLeft<=2?'#f59e0b':'var(--tx2)'}">
          🏁 ${fmt(o.eta_date)}${daysLeft!==null&&o.status==='transit'?` <b>(${isOverdue?Math.abs(daysLeft)+'д проср.':daysLeft===0?'сегодня':daysLeft+'д'})</b>`:''}</span>`:''}
        ${o.actual_arrive?`<span style="color:#16a34a">✅ ${fmt(o.actual_arrive)}</span>`:''}
      </div>`:''}
      ${items.length?`<div class="gruz-items-list">
        <div id="gi-top-${o.id}">${items.slice(0,3).map(i=>`<div class="gi-row">
          <span>${esc(i.name)}</span>
          <span style="color:var(--acc);font-weight:700">${i.qty?i.qty+' '+esc(i.unit||'шт'):'—'}${i.weight?' · '+i.weight+'т':''}</span>
        </div>`).join('')}</div>
        ${items.length>3?`<div id="gi-more-${escAttr(o.id)}" style="display:none">${items.slice(3).map(i=>`<div class="gi-row"><span>${esc(i.name)}</span><span style="color:var(--acc);font-weight:700">${i.qty?i.qty+' '+esc(i.unit||'шт'):'—'}${i.weight?' · '+i.weight+'т':''}</span></div>`).join('')}</div>
        <button class="btn bs bxs" style="margin:3px 0 2px;width:100%;justify-content:center" onclick="(function(btn){const m=document.getElementById('gi-more-${escAttr(o.id)}');const open=m.style.display!=='none';m.style.display=open?'none':'block';btn.textContent=open?'▼ Ещё ${items.length-3} позиций':'▲ Свернуть';})(this)">▼ Ещё ${items.length-3} позиций</button>`:''}
        <div class="gi-row"><span style="font-weight:700">Итого</span><span style="color:var(--acc);font-weight:800">${(+o.total_weight||0).toFixed(2)} т</span></div>
      </div>`:o.status==='new'?'<div style="font-size:10px;color:var(--tx3);margin-bottom:5px">📦 Груз не указан</div>':''}
      ${o.notes?`<div style="font-size:10px;color:var(--tx2);border-top:1px solid var(--bd);padding-top:4px;margin-top:3px">📝 ${esc(o.notes)}</div>`:''}
      <div class="gruz-actions">
        ${o.status==='new'?(()=>{
          const notifyW = (()=>{try{return JSON.parse(o.notify_workers||'[]');}catch(e){return [];}})();
          const confs = (()=>{try{return JSON.parse(o.cargo_confirmations||'[]');}catch(e){return [];}})();
          const allConf = notifyW.length===0 || notifyW.every(w=>confs.includes(w));
          const me = un();
          const meIsNotified = notifyW.includes(me);
          const meConfirmed = confs.includes(me);
          const confHtml = notifyW.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px">${notifyW.map(w=>{
            const isConf=confs.includes(w);
            const isMe=w===me;
            return `<label style="display:flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:20px;border:1.5px solid ${isConf?'#16a34a':'var(--bd)'};background:${isConf?'#dcfce7':'var(--s2)'};cursor:${isConf?'default':'pointer'}" title="${!isMe&&!isConf?'Подтвердить за '+w:''}">
              <input type="checkbox" ${isConf?'checked':''} ${isConf?'disabled':''} onchange="gruzConfirm('${o.id}','${w.replace(/'/g,"\'")}',this.checked)" style="cursor:inherit"> ${isConf?'✅':'⬜'} ${esc(w)}${isMe?' (вы)':' ⚠️'}
            </label>`;
          }).join('')}</div>` : '';
          return confHtml + `<button class="btn ${allConf?'bp':'bs'} bxs" ${allConf?'':'disabled title="Не все подтвердили"'} onclick="${allConf?`gruzSetStatus('${escAttr(o.id)}','transit')`:''}">▶ В путь${allConf?'':'🔒'}</button>`;
        })():''}
        ${o.status==='transit'?`<button class="btn bg2 bxs" onclick="gruzArrived('${escAttr(o.id)}')">✅ Доставлено</button>`:''}
        ${o.status!=='delivered'&&o.status!=='cancelled'?`<button class="btn bd bxs" onclick="gruzSetStatus('${escAttr(o.id)}','cancelled')">✕ Отмена</button>`:''}
        <button class="btn bs bxs" onclick="gruzExportExcel('${escAttr(o.id)}')">📤</button>
        <button class="btn bs bxs" onclick="gruzEditOrder('${escAttr(o.id)}')">✏️</button>
        <button class="btn bd bxs" onclick="gruzDeleteOrder('${escAttr(o.id)}')">🗑</button>
      </div>
    </div>`;
  };

  // Collapsed card for done/cancelled
  const cardCollapsedHtml=o=>{
    const base=bases.find(b=>b.id===o.base_id);
    const statusCls=GRUZ_STATUS_CLS[o.status]||'new';
    const items=(o.items||[]).filter(i=>i.name);
    const weight=(+o.total_weight||0);
    return `<div class="gruz-card status-${o.status}" style="cursor:pointer" onclick="this.querySelector('.gruz-done-detail').style.display=this.querySelector('.gruz-done-detail').style.display==='none'?'block':'none';this.querySelector('.gruz-done-chevron').textContent=this.querySelector('.gruz-done-detail').style.display==='none'?'▶':'▼'">
      <div class="gruz-head">
        <div style="flex:1;min-width:0">
          <div class="gruz-num">№${esc(o.num)}${o.depart_date?' · '+fmt(o.depart_date):''}</div>
          <div class="gruz-title" style="font-size:10px;color:var(--tx3)">${base?esc(base.name):'База не указана'}${weight>0?` · <span style="color:var(--acc);font-weight:700">${weight.toFixed(2)} т</span>`:''}</div>
        </div>
        <span class="gruz-badge ${statusCls}">${GRUZ_STATUS[o.status]||o.status}</span>
        <span class="gruz-done-chevron" style="font-size:10px;color:var(--tx3);margin-left:4px">▶</span>
      </div>
      <div class="gruz-done-detail" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">
        ${o.from_desc||o.driver||o.vehicle?`<div class="gruz-meta">
          ${o.from_desc?`<span>📍 ${esc(o.from_desc)}</span>`:''}
          ${o.driver?`<span>👤 ${esc(o.driver)}</span>`:''}
          ${o.vehicle?`<span>🚛 ${esc(o.vehicle)}</span>`:''}
        </div>`:''}
        ${o.actual_arrive?`<div class="gruz-meta"><span style="color:#16a34a">✅ Прибыл: ${fmt(o.actual_arrive)}</span></div>`:''}
        ${items.length?`<div class="gruz-items-list"><div id="gic-top-${escAttr(o.id)}">${items.slice(0,3).map(i=>`<div class="gi-row"><span>${esc(i.name)}</span><span style="color:var(--acc);font-weight:700">${i.qty?i.qty+' '+esc(i.unit||'шт'):'—'}${i.weight?' · '+i.weight+'т':''}</span></div>`).join('')}</div>${items.length>3?`<div id="gic-more-${escAttr(o.id)}" style="display:none">${items.slice(3).map(i=>`<div class="gi-row"><span>${esc(i.name)}</span><span style="color:var(--acc);font-weight:700">${i.qty?i.qty+' '+esc(i.unit||'шт'):'—'}${i.weight?' · '+i.weight+'т':''}</span></div>`).join('')}</div><button class="btn bs bxs" style="margin:3px 0 2px;width:100%;justify-content:center" onclick="event.stopPropagation();(function(btn){const m=document.getElementById('gic-more-${escAttr(o.id)}');const open=m.style.display!=='none';m.style.display=open?'none':'block';btn.textContent=open?'▼ Ещё ${items.length-3} позиций':'▲ Свернуть';})(this)">▼ Ещё ${items.length-3} позиций</button>`:''}
          <div class="gi-row"><span style="font-weight:700">Итого</span><span style="color:var(--acc);font-weight:800">${weight.toFixed(2)} т</span></div>
        </div>`:''}
        ${o.notes?`<div style="font-size:10px;color:var(--tx2);margin-top:4px">📝 ${esc(o.notes)}</div>`:''}
        <div class="gruz-actions" style="margin-top:6px">
          <button class="btn bs bxs" onclick="event.stopPropagation();gruzExportExcel('${escAttr(o.id)}')">📤</button>
          <button class="btn bs bxs" onclick="event.stopPropagation();gruzEditOrder('${escAttr(o.id)}')">✏️</button>
          <button class="btn bd bxs" onclick="event.stopPropagation();gruzDeleteOrder('${escAttr(o.id)}')">🗑</button>
        </div>
      </div>
    </div>`;
  };

  const colNew=orders.filter(o=>o.status==='new').sort((a,b)=>(b.depart_date||'')>(a.depart_date||'')?1:-1);
  const colTransit=orders.filter(o=>o.status==='transit').sort((a,b)=>{
    const ao=a.eta_date&&a.eta_date<today?-1:0;
    const bo=b.eta_date&&b.eta_date<today?-1:0;
    if(ao!==bo)return ao-bo;
    return (a.eta_date||'')>(b.eta_date||'')?1:-1;
  });
  const colDone=orders.filter(o=>(o.status==='delivered'||o.status==='cancelled') && (()=>{
    if(!window._gruzDoneMonth) return true;
    const d = o.actual_arrive || o.depart_date || o.created_at || '';
    return d.slice(0,7) === window._gruzDoneMonth;
  })()).sort((a,b)=>(b.actual_arrive||b.depart_date||'')>(a.actual_arrive||a.depart_date||'')?1:-1);

  const empty=(msg)=>`<div style="text-align:center;padding:24px 10px;color:var(--tx3);font-size:11px">${msg}</div>`;

  const html=`
  <div class="gruz-stats">
    <div class="gruz-stat-box"><div class="gsv">${gruzOrders.length}</div><div class="gsl">Всего</div></div>
    <div class="gruz-stat-box"><div class="gsv" style="color:#3b82f6">${allNew.length}</div><div class="gsl">Новых</div></div>
    <div class="gruz-stat-box"><div class="gsv" style="color:#f59e0b">${allTransit.length}</div><div class="gsl">В пути</div></div>
    <div class="gruz-stat-box"><div class="gsv" style="color:#22c55e">${allDelivered.length}</div><div class="gsl">Доставлено</div></div>
    <div class="gruz-stat-box"><div class="gsv">${totalTonnage.toFixed(1)} т</div><div class="gsl">Тоннаж</div></div>
    ${overdue.length?`<div class="gruz-stat-box" style="border-color:#ef4444"><div class="gsv" style="color:#ef4444">${overdue.length}</div><div class="gsl" style="color:#ef4444">Просрочено</div></div>`:''}
  </div>
  <div class="gruz-board">
    <!-- LEFT: В работе -->
    <div class="gruz-section active">
      <div class="gruz-section-head active">
        <div class="gruz-section-title">🚀 В работе</div>
        <span class="gruz-section-badge active">${activeCount}</span>
      </div>
      <div class="gruz-cols">
        <div class="gruz-col">
          <div class="gruz-col-head new">📦 Новые <span style="background:rgba(0,0,0,.1);border-radius:8px;padding:1px 7px">${colNew.length}</span></div>
          <div class="gruz-col-body">${colNew.length?colNew.map(cardHtml).join(''):empty('Нет новых заявок')}</div>
        </div>
        <div class="gruz-col">
          <div class="gruz-col-head transit">🚛 В пути <span style="background:rgba(0,0,0,.1);border-radius:8px;padding:1px 7px">${colTransit.length}</span></div>
          <div class="gruz-col-body">${colTransit.length?colTransit.map(cardHtml).join(''):empty('Нет грузов в пути')}</div>
        </div>
      </div>
    </div>
    <!-- RIGHT: Завершено -->
    <div class="gruz-section done">
      <div class="gruz-section-head done" style="cursor:pointer" onclick="gruzToggleDone()">
        <div class="gruz-section-title">✅ Завершено</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="gruz-section-badge done">${doneCount}</span>
          <span id="gruz-done-arrow" style="font-size:11px;color:var(--tx3);transition:transform .2s">${window._gruzDoneOpen?'▲':'▼'}</span>
        </div>
      </div>
      <div style="padding:6px 8px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--s2)" onclick="event.stopPropagation()">
        <span style="font-size:10px;font-weight:700;color:var(--tx3)">📅 Месяц:</span>
        <button class="btn bxs ${!window._gruzDoneMonth?'bp':'bs'}" onclick="gruzSetDoneMonth('')">Все</button>
        ${(()=>{
          // Collect all unique YYYY-MM from done orders
          const allDone = gruzOrders.filter(o=>o.status==='delivered'||o.status==='cancelled');
          const months = [...new Set(allDone.map(o=>(o.actual_arrive||o.depart_date||o.created_at||'').slice(0,7)).filter(m=>m.length===7))].sort().reverse();
          const RU_MON=['','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
          return months.map(m=>{
            const [y,mo]=m.split('-');
            const lbl=RU_MON[parseInt(mo,10)]+' '+y;
            const active=window._gruzDoneMonth===m;
            return `<button class="btn bxs ${active?'bp':'bs'}" onclick="gruzSetDoneMonth('${m}')">${lbl}</button>`;
          }).join('');
        })()}
      </div>
      <div id="gruz-done-body" class="gruz-done-body" style="display:${window._gruzDoneOpen?'flex':'none'}">${colDone.length?colDone.map(cardCollapsedHtml).join(''):empty('Нет завершённых заявок за выбранный период')}</div>
    </div>
  </div>`;

  const viewBar=`<div style="display:flex;gap:4px;margin:0 0 8px"><div class="mch-view-toggle">
    <button class="btn bsm ${window._gruzView!=='table'?'bp':'bs'}" onclick="gruzSetView('board')">▦ Доска</button>
    <button class="btn bsm ${window._gruzView==='table'?'bp':'bs'}" onclick="gruzSetView('table')">☰ Таблица</button></div></div>`;
  if(window._gruzView==='table'){
    body.innerHTML=html.slice(0,html.indexOf('<div class="gruz-board">'))+viewBar+_gruzTableHtml(orders);
    TK.initSelect('gruz-tbody','gruz');
    try{renderNotifBadge();}catch(e){}
    return;
  }
  body.innerHTML=html.replace('<div class="gruz-board">',viewBar+'<div class="gruz-board">');
  // Обновляем бейджи вкладок при каждом рендере грузов
  try{renderNotifBadge();}catch(e){}
}

if(typeof window._gruzDoneOpen==='undefined') window._gruzDoneOpen=true;
if(typeof window._gruzDoneMonth==='undefined') window._gruzDoneMonth=''; // '' = все месяцы, 'YYYY-MM' = конкретный
function gruzToggleDone(){
  window._gruzDoneOpen=!window._gruzDoneOpen;
  const body=document.getElementById('gruz-done-body');
  const arrow=document.getElementById('gruz-done-arrow');
  if(body) body.style.display=window._gruzDoneOpen?'flex':'none';
  if(arrow) arrow.textContent=window._gruzDoneOpen?'▲':'▼';
}

function gruzSetDoneMonth(ym){
  window._gruzDoneMonth=ym;
  window._gruzDoneOpen=true;
  renderGruz();
}

function gruzItemsFormHtml(items){
  return `<div id="gruz-items-wrap">
    ${(items||[]).map((it,i)=>`<div class="gi-row" style="gap:4px;margin-bottom:4px" id="gi-${i}">
      <input placeholder="Наименование" value="${esc(it.name||'')}" style="flex:2;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
      <input placeholder="Кол-во" type="number" value="${it.qty||''}" style="width:70px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
      <input placeholder="Ед." value="${esc(it.unit||'шт')}" style="width:50px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
      <input placeholder="Тонн" type="number" step="0.01" value="${it.weight||''}" style="width:70px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
      <button onclick="this.closest('[id^=gi-]').remove();gruzRecalcWeight()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;flex-shrink:0">✕</button>
    </div>`).join('')}
  </div>
  <button class="btn bs bxs" onclick="gruzAddItemRow()" style="margin-top:4px">＋ Позиция</button>
  <div style="font-size:11px;margin-top:6px">Итого тоннаж: <strong id="gruz-total-w">0.00</strong> т</div>`;
}

function gruzAddItemRow(){
  const wrap=document.getElementById('gruz-items-wrap');
  if(!wrap)return;
  const i=wrap.children.length;
  const div=document.createElement('div');
  div.className='gi-row';div.id='gi-'+i;div.style.cssText='gap:4px;margin-bottom:4px';
  div.innerHTML=`<input placeholder="Наименование" style="flex:2;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
    <input placeholder="Кол-во" type="number" style="width:70px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
    <input placeholder="Ед." value="шт" style="width:50px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
    <input placeholder="Тонн" type="number" step="0.01" style="width:70px;font-size:11px;padding:4px 6px;border:1.5px solid var(--bd);border-radius:4px;background:var(--s2);color:var(--tx);outline:none">
    <button onclick="this.closest('[id^=gi-]').remove();gruzRecalcWeight()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;flex-shrink:0">✕</button>`;
  wrap.appendChild(div);
  div.querySelector('input').focus();
}

function gruzRecalcWeight(){
  const wrap=document.getElementById('gruz-items-wrap');if(!wrap)return;
  let total=0;
  wrap.querySelectorAll('[id^=gi-]').forEach(row=>{
    const inputs=row.querySelectorAll('input');
    total+=parseFloat(inputs[3]?.value||0)||0;
  });
  const el=document.getElementById('gruz-total-w');
  if(el)el.textContent=total.toFixed(2);
}

function gruzReadItems(){
  const wrap=document.getElementById('gruz-items-wrap');if(!wrap)return[];
  const items=[];
  wrap.querySelectorAll('[id^=gi-]').forEach(row=>{
    const inputs=row.querySelectorAll('input');
    const name=(inputs[0]?.value||'').trim();
    if(!name)return;
    items.push({name,qty:inputs[1]?.value||'',unit:inputs[2]?.value||'шт',weight:parseFloat(inputs[3]?.value||0)||0});
  });
  return items;
}

function gruzModalBody(o){
  const today=new Date().toISOString().split('T')[0];
  return `<div class="fgr">
    <div class="fg"><label>Номер заявки</label><input id="g-num" value="${esc(o.num||gruzNextNum())}"></div>
    <div class="fg"><label>Статус</label><select id="g-st">
      <option value="new"${o.status==='new'?' selected':''}>🔵 Новая</option>
      <option value="transit"${o.status==='transit'?' selected':''}>🟡 В пути</option>
      <option value="delivered"${o.status==='delivered'?' selected':''}>✅ Доставлено</option>
      <option value="cancelled"${o.status==='cancelled'?' selected':''}>✕ Отменена</option>
    </select></div>
    <div class="fg s2"><label>База назначения *</label><select id="g-base">
      <option value="">— Выберите базу —</option>
      ${bases.map(b=>`<option value="${b.id}"${o.base_id===b.id?' selected':''}>${esc(b.name)}</option>`).join('')}
    </select></div>
    <div class="fg s2"><label>Откуда (пункт отправки)</label><input id="g-from" placeholder="г. Москва / склад №3" value="${esc(o.from_desc||'')}"></div>
    <div class="fg"><label>Дата отбытия</label><input id="g-dep" type="date" value="${o.depart_date||today}"></div>
    <div class="fg"><label>Ожид. дата прибытия</label><input id="g-eta" type="date" value="${o.eta_date||''}"></div>
    ${o.actual_arrive!==undefined?`<div class="fg"><label>Фактическая дата прибытия</label><input id="g-arr" type="date" value="${o.actual_arrive||''}"></div>`:''}
    <div class="fg"><label>Водитель / экспедитор</label><input id="g-drv" placeholder="ФИО" value="${esc(o.driver||'')}"></div>
    <div class="fg"><label>Транспортное средство</label><input id="g-veh" placeholder="КАМАЗ А123БВ" value="${esc(o.vehicle||'')}"></div>
    <div class="fg s2"><label>Список груза</label>
      ${gruzItemsFormHtml(o.items||[])}
    </div>
    <div class="fg s2"><label>Примечания</label><textarea id="g-notes" rows="2">${esc(o.notes||'')}</textarea></div>
    ${!o.id ? `<div class="fg s2">
      <label>👥 Уведомить сотрудников (обязательное подтверждение)</label>
      <input id="g-notify-search" type="text" placeholder="🔍 Поиск по имени..." autocomplete="off"
        style="width:100%;font-size:11px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);outline:none;margin-bottom:6px"
        oninput="gruzFilterNotifyWorkers(this.value)">
      <div id="g-notify-wrap" style="display:flex;flex-wrap:wrap;gap:5px;padding:8px;background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);min-height:38px;max-height:160px;overflow-y:auto">
        ${(()=>{
          const allW = (pgkWorkers||[]).map(w=>w.name).filter(Boolean).sort();
          if(!allW.length) return '<span style="font-size:10px;color:var(--tx3)">Сотрудники загружаются из ПГК...</span>';
          return allW.map(wn=>`<label data-notify-label="${esc(wn).toLowerCase()}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;cursor:pointer;padding:4px 10px;background:var(--s);border:1.5px solid var(--bd);border-radius:20px;user-select:none;transition:all .15s;white-space:nowrap" onmouseenter="this.style.borderColor='var(--acc)'" onmouseleave="if(!this.querySelector('input').checked)this.style.borderColor='var(--bd)'">
            <input type="checkbox" data-notify-worker="${esc(wn)}" style="cursor:pointer;accent-color:var(--acc)" onchange="this.closest('label').style.borderColor=this.checked?'var(--acc)':'var(--bd)';this.closest('label').style.color=this.checked?'var(--acc)':'inherit'"> ${esc(wn)}
          </label>`).join('');
        })()}
      </div>
    </div>` : ''}
  </div>`;
}

function gruzFilterNotifyWorkers(q){
  const wrap=document.getElementById('g-notify-wrap');if(!wrap)return;
  const s=q.trim().toLowerCase();
  wrap.querySelectorAll('label[data-notify-label]').forEach(function(lbl){
    const show=!s||lbl.dataset.notifyLabel.includes(s);
    lbl.style.display=show?'inline-flex':'none';
    lbl.style.margin=show?'':'0';
    lbl.style.padding=show?'':'0';
  });
}

async function gruzAddOrder(){
  // Ensure workers are loaded for the notify section
  if(!pgkWorkers||pgkWorkers.length===0){
    try{const d=await fetch(`${API}/pgk/workers`).then(r=>r.json());pgkWorkers=Array.isArray(d)?d:[];}catch(e){}
  }
  showModal('📦 Новая заявка на перевозку', gruzModalBody({}), [
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Создать',cls:'bp',fn:async()=>{
      const base_id=document.getElementById('g-base').value;
      if(!base_id){toast('Выберите базу назначения','err');return;}
      const items=gruzReadItems();
      const total_weight=items.reduce((a,i)=>a+(+i.weight||0),0);
      const numVal = document.getElementById('g-num').value||gruzNextNum();
      const body={
        num:numVal,
        base_id,
        from_desc:document.getElementById('g-from').value,
        depart_date:document.getElementById('g-dep').value||null,
        eta_date:document.getElementById('g-eta').value||null,
        status:document.getElementById('g-st').value||'new',
        driver:document.getElementById('g-drv').value,
        vehicle:document.getElementById('g-veh').value,
        total_weight,items,
        notes:document.getElementById('g-notes').value,
        notify_workers: Array.from(document.querySelectorAll('[data-notify-worker]:checked')).map(el=>el.dataset.notifyWorker),
        created_by: un()
      };
      try{
        // Check for duplicate num locally
        if(gruzOrders.some(o=>o.num===numVal)){
          toast(`Заявка с номером №${numVal} уже существует!`,'err');return;
        }
        const resp = await fetch(`${API}/cargo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        if(!resp.ok){const err=await resp.json();toast(err.error||'Ошибка сохранения','err');return;}
        closeModal();await loadGruz();toast('Заявка создана','ok');
      }catch(e){toast('Ошибка сохранения','err');}
    }}
  ]);
  // Attach live recalc
  setTimeout(()=>{
    document.getElementById('gruz-items-wrap')?.addEventListener('input',gruzRecalcWeight);
    gruzRecalcWeight();
  },80);
}

async function gruzEditOrder(id){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  showModal('✏️ Заявка №'+o.num, gruzModalBody({...o,actual_arrive:o.actual_arrive}), [
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Сохранить',cls:'bp',fn:async()=>{
      const base_id=document.getElementById('g-base').value;
      if(!base_id){toast('Выберите базу назначения','err');return;}
      const items=gruzReadItems();
      const total_weight=items.reduce((a,i)=>a+(+i.weight||0),0);
      const body={
        num:document.getElementById('g-num').value||o.num,
        base_id,
        from_desc:document.getElementById('g-from').value,
        depart_date:document.getElementById('g-dep').value||null,
        eta_date:document.getElementById('g-eta').value||null,
        actual_arrive:document.getElementById('g-arr')?.value||null,
        status:document.getElementById('g-st').value||o.status,
        driver:document.getElementById('g-drv').value,
        vehicle:document.getElementById('g-veh').value,
        total_weight,items,
        notes:document.getElementById('g-notes').value
      };
      try{
        await fetch(`${API}/cargo/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        closeModal();await loadGruz();toast('Сохранено','ok');
      }catch(e){toast('Ошибка сохранения','err');}
    }}
  ]);
  setTimeout(()=>{
    document.getElementById('gruz-items-wrap')?.addEventListener('input',gruzRecalcWeight);
    gruzRecalcWeight();
  },80);
}

async function gruzSetStatus(id,status){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  try{
    await fetch(`${API}/cargo/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...o,status})});
    await loadGruz();
    toast(status==='transit'?'🚛 Груз отправлен!':status==='cancelled'?'Заявка отменена':'Статус обновлён','ok');
  }catch(e){toast('Ошибка','err');}
}

async function gruzConfirm(orderId, workerName, checked){
  const me = un();
  const isOther = workerName !== me;
  if(isOther && checked){
    if(!await confirmDlg(`Вы собираетесь подтвердить заявку за сотрудника «${workerName}».\n\nВы уверены, что хотите подтвердить за другого сотрудника?`)){
      // Revert checkbox visually
      renderGruz();
      return;
    }
  }
  try{
    const r = await fetch(`${API}/cargo/${orderId}/confirm`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({worker_name:workerName, confirm:checked})});
    const data = await r.json();
    const o = gruzOrders.find(x=>x.id===orderId);
    if(o){
      o.cargo_confirmations = JSON.stringify(data.confirmations);
    }
    if(data.allConfirmed){
      toast('✅ Все подтвердили — можно отправлять!','ok');
    }
    renderGruz();
  }catch(e){toast('Ошибка подтверждения','err');}
}

async function gruzArrived(id){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  const today=new Date().toISOString().split('T')[0];
  const me=un();
  const norm=s=>(s||'').trim().toLowerCase();
  const isForeign = o.created_by && norm(o.created_by) !== norm(me);
  const base=bases.find(b=>b.id===o.base_id);
  const itemsHtml=(o.items||[]).filter(i=>i.name&&(+i.qty)>0).map(i=>
    `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid var(--bd)">
      <span>${esc(i.name)}</span>
      <span style="font-weight:700;color:var(--acc)">${i.qty} ${esc(i.unit||'шт')}</span>
    </div>`).join('')||'<div style="font-size:11px;color:var(--tx3)">Список груза пуст</div>';
  showModal('✅ Подтвердить доставку',
    `<div class="fgr fone">
      ${isForeign?`<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span style="font-size:22px">🔒</span>
        <div>
          <div style="font-size:12px;font-weight:800;color:#dc2626">ВЫ ЗАКРЫВАЕТЕ ЧУЖУЮ ЗАЯВКУ</div>
          <div style="font-size:11px;color:#b91c1c">Создана: <strong>${esc(o.created_by)}</strong></div>
        </div>
        <label style="display:flex;align-items:center;gap:5px;margin-left:auto;font-size:11px;cursor:pointer;font-weight:600;color:#dc2626">
          <input type="checkbox" id="g-foreign-confirm" style="accent-color:#dc2626"> Подтверждаю
        </label>
      </div>`:''}
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">Заявка №${esc(o.num)}</div>
      ${base?`<div style="font-size:11px;color:var(--tx2);margin-bottom:8px">🏕 База: <strong>${esc(base.name)}</strong></div>`:''}
      <div style="background:var(--s2);border-radius:6px;padding:8px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:4px">БУДЕТ ДОБАВЛЕНО В МАТЕРИАЛЫ БАЗЫ:</div>
        ${itemsHtml}
      </div>
      <div class="fg"><label>Фактическая дата прибытия</label><input id="g-arr2" type="date" value="${today}"></div>
      <div class="fg"><label>Примечания</label><input id="g-anotes" placeholder="Всё в порядке / замечания…"></div>
    </div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'✅ Подтвердить доставку',cls:'bp',fn:async()=>{
      if(isForeign && !document.getElementById('g-foreign-confirm')?.checked){
        toast('Поставьте галочку «Подтверждаю» для закрытия чужой заявки','err');return;
      }
      const arr=document.getElementById('g-arr2').value||today;
      const notes=(document.getElementById('g-anotes').value||'').trim();
      try{
        const r=await fetch(`${API}/cargo/${id}/deliver`,{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({actual_arrive:arr,notes,user_name:un()})});
        const data=await r.json();
        if(!r.ok)throw new Error(data.error||'Ошибка');
        closeModal();
        await loadGruz();
        // Refresh bases so materials update
        try{const br=await fetch(`${API}/bases`).then(r=>r.json());bases=br;}catch(e){}
        if(currentObj&&currentType==='base'&&currentObj.id===o.base_id)await refreshCurrent();
        const pushed=data.pushed||[];
        const added=pushed.filter(p=>p.action==='created').length;
        const updated=pushed.filter(p=>p.action==='updated').length;
        toast(`✅ Доставлено! Материалов: +${added} новых, ${updated} пополнено`,'ok');
      }catch(e){toast('Ошибка: '+e.message,'err');}
    }}]
  );
}

function gruzExportExcel(id){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  const base=bases.find(b=>b.id===o.base_id);
  const items=(o.items||[]).filter(i=>i.name);
  const STATUS_RU={'new':'Новая','transit':'В пути','delivered':'Доставлена','cancelled':'Отменена'};
  const fmtD=d=>d?d.split('-').reverse().join('.'):'—';

  // Theme colors
  const BLUE_HDR='4F81BD', BLUE_LT='B9CCE4', GREEN_HDR='9BBB59', GREEN_LT='C3D69B';
  const s=(v,opts)=>Object.assign({v,t:typeof v==='number'?'n':'s'},opts||{});
  const c=(fgRgb,bold,sz)=>({font:{name:'Times New Roman',sz:sz||11,bold:!!bold,color:{rgb:fgRgb||'000000'}},
    alignment:{vertical:'center',wrapText:true}});
  const fill=rgb=>({patternType:'solid',fgColor:{rgb}});
  const border=(style)=>{const b={style,color:{rgb:'595959'}};return{top:b,bottom:b,left:b,right:b};};

  const titleStyle={font:{name:'Times New Roman',sz:13,bold:true},
    fill:fill('D9E1F2'),border:border('medium'),alignment:{horizontal:'center',vertical:'center'}};
  const hdrStyle={font:{name:'Times New Roman',sz:11,bold:true,color:{rgb:'FFFFFF'}},
    fill:fill(BLUE_HDR),border:border('medium'),alignment:{horizontal:'center',vertical:'center',wrapText:true}};
  const labelStyle={font:{name:'Times New Roman',sz:11,bold:true},
    fill:fill(GREEN_LT),border:border('thin'),alignment:{vertical:'center'}};
  const valStyle={font:{name:'Times New Roman',sz:11},border:border('thin'),
    alignment:{vertical:'center',wrapText:true}};
  const totStyle={font:{name:'Times New Roman',sz:11,bold:true,color:{rgb:'FFFFFF'}},
    fill:fill(BLUE_HDR),border:border('medium'),alignment:{horizontal:'right',vertical:'center'}};

  const WB=XLSX.utils.book_new();
  const ws={};
  const merges=[];
  let R=0;

  const setCell=(r,c2,cell)=>{ws[XLSX.utils.encode_cell({r,c:c2})]=cell;};
  const rowH=(r,h)=>{if(!ws['!rows'])ws['!rows']=[];ws['!rows'][r]={hpx:h};};

  // Title row
  setCell(R,0,{...titleStyle,v:`Заявка на груз №${o.num}`});
  merges.push({s:{r:R,c:0},e:{r:R,c:4}});
  rowH(R,28); R++;

  // Info section: label | value pairs
  const info=[
    ['База назначения', base?base.name:'—'],
    ['Откуда', o.from_desc||'—'],
    ['Водитель', o.driver||'—'],
    ['Транспортное средство', o.vehicle||'—'],
    ['Дата отправки', fmtD(o.depart_date)],
    ['Ожидаемое прибытие', fmtD(o.eta_date)],
    ['Фактическое прибытие', fmtD(o.actual_arrive)],
    ['Статус', STATUS_RU[o.status]||o.status],
    ['Примечания', o.notes||'—'],
  ];
  for(const [lbl,val] of info){
    setCell(R,0,{...labelStyle,v:lbl});
    merges.push({s:{r:R,c:0},e:{r:R,c:1}});
    setCell(R,2,{...valStyle,v:String(val)});
    merges.push({s:{r:R,c:2},e:{r:R,c:4}});
    rowH(R,18); R++;
  }
  R++; // blank row

  // Items header
  const HDRS=['№','Наименование','Кол-во','Ед.','Вес, т'];
  HDRS.forEach((h,ci)=>setCell(R,ci,{...hdrStyle,v:h}));
  rowH(R,22); R++;

  // Items rows
  items.forEach((it,idx)=>{
    const rowFill=idx%2===0?'FFFFFF':BLUE_LT;
    const rs=(v,bold)=>({font:{name:'Times New Roman',sz:11,bold:!!bold},
      fill:fill(rowFill),border:border('thin'),alignment:{vertical:'center',wrapText:true},
      v,t:typeof v==='number'?'n':'s'});
    setCell(R,0,rs(idx+1,true));
    setCell(R,1,rs(it.name||''));
    setCell(R,2,rs(it.qty!=null?+it.qty:''));
    setCell(R,3,rs(it.unit||'шт'));
    setCell(R,4,rs(it.weight!=null?+it.weight:''));
    rowH(R,18); R++;
  });

  // Total row
  const tw=(+o.total_weight||0);
  setCell(R,0,{...totStyle,v:'Итого:'});
  merges.push({s:{r:R,c:0},e:{r:R,c:3}});
  setCell(R,4,{...totStyle,v:tw,t:'n',z:'0.00'});
  rowH(R,20); R++;

  ws['!merges']=merges;
  ws['!cols']=[{wch:4},{wch:18},{wch:42},{wch:8},{wch:8},{wch:10}];
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:R-1,c:4}});

  XLSX.utils.book_append_sheet(WB,ws,'Заявка');
  XLSX.writeFile(WB,`Заявка_${o.num}.xlsx`);
  toast(`Excel скачан: Заявка_${o.num}.xlsx`,'ok');
}

async function gruzDeleteOrder(id){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  if(!await confirmDlg(`Удалить заявку №${o.num}?`))return;
  await apiDelUndo(`/cargo/${id}`,`Заявка №${o.num} удалена`,loadGruz);
}
// ═══════════════════════════════════════════════════════════
// 📋 ГЛОБАЛЬНЫЕ ЗАДАЧИ
// ═══════════════════════════════════════════════════════════
let gtasks = [];
const GT_PRIO = {high:'🔴 Высокий', normal:'🔵 Обычный', low:'⚪ Низкий'};
const GT_PRIO_CLS = {high:'high', normal:'normal', low:'low'};
const GT_CATS = {general:'📌 Общие', field:'🏕 Полевые', office:'📐 Камеральные', logistics:'🚛 Логистика', safety:'🦺 Охрана труда', equipment:'🔧 Оборудование'};


// ═══ Табличный вид «Груза» (выделение, массовые действия, экспорт) ═══════
const GRUZ_COLS=[['num','№'],['status','Статус'],['base','База'],['from','Откуда'],['depart','Отправка'],['eta','Прибытие (план)'],
  ['arrive','Прибыл'],['weight','Вес, т'],['items','Позиций'],['driver','Водитель'],['vehicle','Транспорт'],['notes','Примечания']];
function gruzSetView(v){window._gruzView=v;try{localStorage.setItem('gruz_view',v);}catch(e){}renderGruz();}
if(typeof window._gruzView==='undefined'){try{window._gruzView=localStorage.getItem('gruz_view')||'board';}catch(e){window._gruzView='board';}}
function _gruzTableHtml(orders){
  const today=new Date().toISOString().split('T')[0];
  const _s=window._gruzSort||'depart', _a=window._gruzAsc===true;
  const hidden=TK.hidden('gruz'), show=k=>!hidden.has(k);
  TK.rerender.gruz=()=>renderGruz();
  const bn=o=>(bases.find(b=>b.id===o.base_id)||{}).name||'';
  const val=(o,k)=>k==='num'?(parseInt(o.num)||0):k==='status'?(GRUZ_STATUS[o.status]||''):k==='base'?bn(o):k==='from'?(o.from_desc||'')
    :k==='depart'?(o.depart_date||''):k==='eta'?(o.eta_date||''):k==='arrive'?(o.actual_arrive||''):k==='weight'?(+o.total_weight||0)
    :k==='items'?(o.items||[]).filter(i=>i.name).length:(o[k]||'');
  const list=[...orders].sort((x,y)=>{const a=val(x,_s),b=val(y,_s);
    if(typeof a==='number')return (a-b)*(_a?1:-1);
    if(!a!==!b)return a?-1:1;return String(a).localeCompare(String(b),'ru',{numeric:true})*(_a?1:-1);});
  window._gruzShownIds=list.map(o=>o.id);
  const th=(k,l)=>`<th data-col="${k}" class="${_s===k?(_a?'wt-asc':'wt-desc'):''}" onclick="if(window._gruzSort==='${k}')window._gruzAsc=!window._gruzAsc;else{window._gruzSort='${k}';window._gruzAsc=true;}renderGruz()">${l}</th>`;
  const sel=TK.set('gruz');
  const dash='<span style="color:var(--tx3)">—</span>';
  const rows=list.map(o=>{
    const _id=escAttr(o.id), on=sel.has(o.id);
    const over=o.status==='transit'&&o.eta_date&&o.eta_date<today;
    const it=(o.items||[]).filter(i=>i.name);
    const td={
      num:`<td class="td-link" style="font-weight:700" onclick="gruzEditOrder('${_id}')">№${esc(o.num)}</td>`,
      status:`<td><span class="gruz-badge ${over?'overdue':(GRUZ_STATUS_CLS[o.status]||'new')}">${over?'⚠️ Просроч.':GRUZ_STATUS[o.status]||o.status}</span></td>`,
      base:`<td style="color:var(--bpc)">${bn(o)?'🏕 '+esc(bn(o)):dash}</td>`,
      from:`<td>${o.from_desc?esc(o.from_desc):dash}</td>`,
      depart:`<td>${o.depart_date?fmt(o.depart_date):dash}</td>`,
      eta:`<td style="${over?'color:#ef4444;font-weight:700':''}">${o.eta_date?fmt(o.eta_date):dash}</td>`,
      arrive:`<td style="color:#16a34a">${o.actual_arrive?fmt(o.actual_arrive):dash}</td>`,
      weight:`<td style="text-align:right;font-weight:700;color:var(--acc)">${(+o.total_weight||0).toFixed(2)}</td>`,
      items:`<td style="text-align:center" title="${esc(it.map(i=>i.name+(i.qty?' — '+i.qty+' '+(i.unit||'шт'):'')).join('\n'))}">${it.length||dash}</td>`,
      driver:`<td>${o.driver?'👤 '+esc(o.driver):dash}</td>`,
      vehicle:`<td>${o.vehicle?'🚛 '+esc(o.vehicle):dash}</td>`,
      notes:`<td class="td-notes td-editable" title="${esc(o.notes||'')}" onclick="_gruzNoteCell(event,this,'${_id}')">${esc(o.notes||'')}</td>`,
    };
    return `<tr data-rid="${o.id}" class="${on?'lasso-sel':''}" oncontextmenu="event.preventDefault();gruzCtxMenu(event,'${_id}')">${TK.chkTd(on)}${GRUZ_COLS.filter(([k])=>show(k)).map(([k])=>td[k]).join('')}</tr>`;
  }).join('');
  const n=1+GRUZ_COLS.filter(([k])=>show(k)).length;
  return `<div class="wt-summary" style="padding:4px 2px;flex-wrap:wrap">
      ${list.length<gruzOrders.length?`<span style="color:var(--acc)">Показано: <b>${list.length}</b></span>`:''}
      ${TK.selBar('gruz')}
      <span style="margin-left:auto"><button class="btn bs bsm" onclick="_gruzExportMenu(event)">📤 Excel</button></span>
    </div>
    <div class="wt-scroll" style="max-height:calc(100vh - 260px)"><table class="wt-tbl" id="gruz-tbl" style="min-width:900px">
      <thead oncontextmenu="TK.colsMenu(event,'gruz',GRUZ_COLS.filter(c=>c[0]!=='num'),()=>renderGruz())"><tr>${TK.chkTh('gruz')}${GRUZ_COLS.filter(([k])=>show(k)).map(([k,l])=>k==='notes'?`<th class="no-sort" data-col="notes">${l}</th>`:th(k,l)).join('')}</tr></thead>
      <tbody id="gruz-tbody">${rows||`<tr><td colspan="${n}" style="text-align:center;padding:24px;color:var(--tx3)">Нет заявок</td></tr>`}</tbody>
    </table></div>`;
}
function _gruzNoteCell(ev,td,id){const o=gruzOrders.find(x=>x.id===id);if(o)TK.cellText(ev,td,o.notes||'',v=>_gruzApply([id],{notes:v},'Примечание сохранено'));}
async function _gruzApply(ids,patch,msg,noUndo){
  const list=ids.map(id=>gruzOrders.find(o=>o.id===id)).filter(Boolean);
  const before=list.map(o=>({id:o.id,old:Object.fromEntries(Object.keys(typeof patch==='function'?patch(o):patch).map(k=>[k,o[k]]))}));
  try{await Promise.all(list.map(o=>{const p=typeof patch==='function'?patch(o):patch;
    return fetch(`${API}/cargo/${o.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...o,...p,created_by:un()})});}));}
  catch(e){toast('Ошибка сохранения','err');}
  await loadGruz();
  if(msg&&!noUndo)TK.undoBar(`${msg}${list.length>1?': '+list.length+' заявок':''}`,()=>_gruzApply(before.map(b=>b.id),o=>(before.find(b=>b.id===o.id)||{}).old||{},null,true));
}
function gruzCtxMenu(ev,id){
  const o=gruzOrders.find(x=>x.id===id);if(!o)return;
  const x=ev.clientX,y=ev.clientY;
  const ids=TK.ctxIds('gruz',id), multi=ids.length>1;
  showCtx(x,y,[
    multi?{i:'☑️',l:`<b>Выбрано: ${ids.length}</b>`,html:true,f:()=>{}}:{i:'🚛',l:`<b>Заявка №${esc(o.num)}</b>`,html:true,f:()=>gruzEditOrder(id)},
    {sep:true},
    ...(multi?[]:[{i:'✏️',l:'Редактировать',f:()=>gruzEditOrder(id)},
      ...(o.status==='transit'?[{i:'✅',l:'Доставлено…',f:()=>gruzArrived(id)}]:[])]),
    {i:'🏕',l:'База…',f:()=>_searchPick({x,y,title:'🏕 База'+(multi?` — ${ids.length}`:''),items:[{v:'',l:'— не указана —'},...bases.map(b=>({v:b.id,l:b.name}))],current:multi?null:(o.base_id||''),
      onPick:v=>_gruzApply(ids,{base_id:v||null},'База изменена')})},
    {i:'📝',l:'Примечание…',f:()=>TK.notesModal(ids.length,multi?'':o.notes,(t,app)=>_gruzApply(ids,app?(e=>({notes:(e.notes?e.notes+' ':'')+t})):{notes:t},'Примечание сохранено'))},
    {sep:true},
    {i:'',l:'Статус: 🟡 В пути',f:()=>_gruzApply(ids.filter(i=>(gruzOrders.find(q=>q.id===i)||{}).status==='new'),{status:'transit'},'Отправлено в путь')},
    {i:'',l:'Статус: ✕ Отменена',f:()=>_gruzApply(ids.filter(i=>!['delivered','cancelled'].includes((gruzOrders.find(q=>q.id===i)||{}).status)),{status:'cancelled'},'Отменено')},
    {sep:true},
    {i:'📤',l:'Экспорт в Excel',f:()=>multi?_gruzExportList(ids.map(i=>gruzOrders.find(q=>q.id===i)).filter(Boolean)):gruzExportExcel(id)},
    {i:'🗑',l:multi?`Удалить выбранные (${ids.length})`:'Удалить',cls:'cxi-red',f:()=>multi?TK.bulkDelete(ids,i=>`/cargo/${i}`,loadGruz,'заявок'):gruzDeleteOrder(id)},
  ]);
}
function _gruzExportMenu(ev){
  const by=id=>gruzOrders.find(o=>o.id===id);
  const shown=(window._gruzShownIds||[]).map(by).filter(Boolean), s=TK.selectedIds('gruz');
  TK.exportMenu(ev,{all:gruzOrders,shown,selected:shown.filter(o=>s.includes(o.id)),run:_gruzExportList});
}
function _gruzExportList(list){
  if(!list||!list.length){toast('Нет заявок','warn');return;}
  const bn=o=>(bases.find(b=>b.id===o.base_id)||{}).name||'';
  const st={new:'Новая',transit:'В пути',delivered:'Доставлена',cancelled:'Отменена'};
  const aoa=[['Реестр заявок на груз — '+new Date().toLocaleDateString('ru-RU')],
    ['№','Статус','База','Откуда','Отправка','Прибытие (план)','Прибыл','Вес, т','Позиции','Водитель','Транспорт','Примечания'],
    ...list.map(o=>[o.num,st[o.status]||o.status,bn(o),o.from_desc||'',_fmtDateRu(o.depart_date),_fmtDateRu(o.eta_date),_fmtDateRu(o.actual_arrive),
      +(+o.total_weight||0).toFixed(3),(o.items||[]).filter(i=>i.name).map(i=>i.name+(i.qty?' — '+i.qty+' '+(i.unit||'шт'):'')).join('; '),o.driver||'',o.vehicle||'',o.notes||''])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:7},{wch:11},{wch:18},{wch:18},{wch:11},{wch:12},{wch:11},{wch:8},{wch:50},{wch:18},{wch:16},{wch:24}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:11}}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Груз');
  XLSX.writeFile(wb,`Груз_${new Date().toISOString().slice(0,10)}.xlsx`);toast('Excel сохранён','ok');
}
