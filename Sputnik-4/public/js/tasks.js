async function loadGTasks(){
  window._gtWorkersLoaded=false;
  // Pre-load workers and sites if needed
  if(!pgkWorkers.length){try{pgkWorkers=await fetch(`${API}/pgk/workers`).then(r=>r.json());}catch(e){}}
  if(!sites.length){try{const sr=await fetch(`${API}/sites`);if(sr.ok)sites=await sr.json();}catch(e){}}
  try{
    const data = await fetch(`${API}/gtasks`).then(r=>r.json());
    gtasks = data;
  }catch(e){ gtasks=[]; }
  // Populate responsible filter from all tasks
  const respSet = new Set();
  gtasks.forEach(t=>(t.responsibles||[]).forEach(r=>respSet.add(r)));
  const sel=document.getElementById('gt-f-resp');
  if(sel){
    const cur=sel.value;
    sel.innerHTML='<option value="">Все ответственные</option>'
      +[...respSet].sort().map(r=>`<option value="${esc(r)}"${r===cur?' selected':''}>${esc(r)}</option>`).join('');
  }
  // Populate site filter (toolbar)
  const siteSel=document.getElementById('gt-f-site');
  if(siteSel){
    const cur=siteSel.value;
    siteSel.innerHTML='<option value="">Все объекты</option>'
      +[...sites].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(s=>`<option value="${s.id}"${s.id===cur?' selected':''}>${esc(s.name)}</option>`).join('');
  }
  renderGTasks();
  try{renderNotifBadge();}catch(e){}
}

function renderGTasks(){
  // Always update nav badges regardless of whether page is visible
  const today=new Date().toISOString().split('T')[0];
  const me=un();
  const open=gtasks.filter(t=>t.status!=='done').length;
  const myOpen=gtasks.filter(t=>t.status!=='done'&&(t.responsibles||[]).includes(me)).length;
  const openBadge=document.getElementById('gtasks-open-badge');
  if(openBadge){openBadge.textContent=open>99?'99+':open;openBadge.style.display=open>0?'inline':'none';}
  const gruzMyBadge=document.getElementById('gruz-my-tasks-badge');
  if(gruzMyBadge){
    const myCargoOpen=gruzOrders.filter(o=>{
      if(o.status!=='new'&&o.status!=='transit')return false;
      try{const nw=JSON.parse(o.notify_workers||'[]');return nw.includes(me);}catch(e){return false;}
    }).length;
    gruzMyBadge.textContent=myCargoOpen>9?'9+':myCargoOpen;
    gruzMyBadge.style.display=myCargoOpen>0?'inline':'none';
    gruzMyBadge.title='Мои грузы в работе';
  }

  const body=document.getElementById('gt-body');
  if(!body)return;
  const fStatus=document.getElementById('gt-f-status')?.value||'';
  const fPrio=document.getElementById('gt-f-prio')?.value||'';
  const fCat=document.getElementById('gt-f-cat')?.value||'';
  const fResp=document.getElementById('gt-f-resp')?.value||'';
  const fSite=document.getElementById('gt-f-site')?.value||'';
  const fSearch=(document.getElementById('gt-f-search')?.value||'').toLowerCase();

  let tasks=[...gtasks].filter(t=>{
    if(fStatus&&t.status!==fStatus)return false;
    if(fPrio&&t.priority!==fPrio)return false;
    if(fCat&&t.category!==fCat)return false;
    if(fResp&&!(t.responsibles||[]).includes(fResp))return false;
    if(fSite&&t.site_id!==fSite)return false;
    if(fSearch){
      const hay=(t.title+(t.description||'')+(t.responsibles||[]).join(' ')+(t.notes||'')).toLowerCase();
      if(!hay.includes(fSearch))return false;
    }
    return true;
  });

  // Stats (from all tasks, not filtered)
  const total=gtasks.length;
  const done=gtasks.filter(t=>t.status==='done').length;
  const overdue=gtasks.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<today).length;

  let html=`<div class="gt-stats">
    <div class="gt-stat"><div class="sv">${total}</div><div class="sl">Всего</div></div>
    <div class="gt-stat"><div class="sv" style="color:#3b82f6">${open}</div><div class="sl">Открыто</div></div>
    <div class="gt-stat"><div class="sv" style="color:#22c55e">${done}</div><div class="sl">Выполнено</div></div>
    <div class="gt-stat"><div class="sv" style="color:#7c3aed">${myOpen}</div><div class="sl">Мои задачи</div></div>
    ${overdue?`<div class="gt-stat" style="border-color:#ef4444"><div class="sv" style="color:#ef4444">${overdue}</div><div class="sl" style="color:#ef4444">Просрочено</div></div>`:''}
  </div>`;

  html+=`<div style="display:flex;gap:4px;margin:0 0 8px"><div class="mch-view-toggle">
    <button class="btn bsm ${window._gtView!=='table'?'bp':'bs'}" onclick="gtSetView('board')">▦ Доска</button>
    <button class="btn bsm ${window._gtView==='table'?'bp':'bs'}" onclick="gtSetView('table')">☰ Таблица</button></div></div>`;
  if(window._gtView==='table'){body.innerHTML=html+_gtTableHtml(tasks);TK.initSelect('gt-tbody','gtasks');return;}
  if(!tasks.length){
    body.innerHTML=html+'<div class="empty"><div class="empty-i">📋</div>Нет задач'+(fStatus||fPrio||fCat||fResp||fSite||fSearch?' по фильтру':'')+'</div>';
    return;
  }

  // Kanban columns
  const openTasks=tasks.filter(t=>t.status==='open');
  const inProgTasks=tasks.filter(t=>t.status==='inprog');
  const doneTasks=tasks.filter(t=>t.status==='done');

  const cardHtml = t => {
    const resp=t.responsibles||[];
    const conf=t.confirmations||[];
    const pct=resp.length?Math.round(conf.length/resp.length*100):0;
    const overdue=t.due_date&&t.due_date<today&&t.status!=='done';
    const soon=t.due_date&&t.due_date>=today&&t.due_date<=new Date(Date.now()+3*86400000).toISOString().split('T')[0]&&t.status!=='done';
    const meIsResp=resp.includes(me);
    const meConfirmed=conf.includes(me);
    const site=t.site_id?sites.find(s=>s.id===t.site_id):null;
    const base=t.base_id?bases.find(b=>b.id===t.base_id):null;

    // Confirm checkboxes for each responsible
    const confirmRows=resp.map(r=>{
      const isConf=conf.includes(r);
      const isMe=r===me;
      return `<label class="gt-confirm-row${isConf?' confirmed':''}${isMe?' mine':''}">
        <input type="checkbox" ${isConf?'checked':''} ${t.status==='done'?'disabled':''}
          onchange="gtConfirm('${t.id}','${r.replace(/'/g,"\\'")}',this.checked)">
        <span>${isConf?'✅':isMe?'⬜':'⬜'} ${esc(r)}${isMe?' (вы)':''}</span>
      </label>`;
    }).join('');

    const allConfirmed=resp.length>0&&resp.every(r=>conf.includes(r));
    const closeBtn=allConfirmed&&t.status!=='done'
      ?`<button onclick="gtCloseTask('${escAttr(t.id)}')" style="margin-top:7px;width:100%;background:#16a34a;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer">✅ Завершить задачу</button>`
      :'';

    return `<div class="gt-card prio-${t.priority||'normal'}${overdue?' overdue':''}${t.status==='done'?' done-card':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
        <div style="flex:1">
          <div class="gt-card-title">${esc(t.title)}${overdue?'<span style="color:#ef4444;font-size:9px;font-weight:700;margin-left:4px">🚨ПРОСРОЧЕНО</span>':''}${soon&&!overdue?'<span style="color:#f59e0b;font-size:9px;font-weight:700;margin-left:4px">⚠️СКОРО</span>':''}</div>
          ${t.description?`<div class="gt-card-desc">${esc(t.description)}</div>`:''}
        </div>
        <div style="display:flex;gap:3px;flex-shrink:0">
          <button onclick="gtEditTask('${escAttr(t.id)}')" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:.6;padding:0 2px" title="Редактировать">✏️</button>
          <button onclick="gtDeleteTask('${escAttr(t.id)}')" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:.6;padding:0 2px" title="Удалить">🗑</button>
        </div>
      </div>
      <div class="gt-card-meta">
        <span class="gt-badge-prio ${GT_PRIO_CLS[t.priority]||'normal'}">${GT_PRIO[t.priority]||'Обычный'}</span>
        <span class="gt-cat-tag">${GT_CATS[t.category]||t.category}</span>
        ${t.due_date?`<span style="color:${overdue?'#ef4444':soon?'#f59e0b':'var(--tx3)'}">📅 ${fmt(t.due_date)}</span>`:''}
        ${t.created_by?`<span>👤 от ${esc(t.created_by)}</span>`:''}
        ${site?`<span>🏗 ${esc(site.name)}</span>`:''}
        ${base?`<span>🏕 ${esc(base.name)}</span>`:''}
        ${t.status==='done'&&t.closed_at?`<span style="color:var(--grn)">✅ ${fmt(t.closed_at)}</span>`:''}
      </div>
      ${resp.length?`<div class="gt-confirm-list">
        <div style="font-size:9px;font-weight:700;color:var(--tx3);margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">
          Подтверждения: ${conf.length}/${resp.length}
        </div>
        ${confirmRows}
        ${resp.length>1?`<div class="gt-progress"><div class="gt-progress-fill" style="width:${pct}%"></div></div>`:''}
        ${closeBtn}
      </div>`:'<div style="font-size:10px;color:var(--tx3)">Ответственные не назначены</div>'}
      ${t.notes?`<div style="font-size:10px;color:var(--tx2);border-top:1px solid var(--bd);padding-top:5px">📝 ${esc(t.notes)}</div>`:''}
    </div>`;
  };

  const col=(tasks,cls,label,icon)=>`
    <div>
      <div class="gt-col-head ${cls}"><span>${icon} ${label}</span><span style="background:rgba(0,0,0,.1);border-radius:8px;padding:1px 7px;font-size:11px">${tasks.length}</span></div>
      <div style="border:1.5px solid var(--bd);border-top:none;border-radius:0 0 8px 8px;min-height:60px;padding:8px">
        ${tasks.length?tasks.map(cardHtml).join(''):
          '<div style="font-size:11px;color:var(--tx3);text-align:center;padding:16px">Пусто</div>'}
      </div>
    </div>`;

  html+=`<div class="gt-cols">
    ${col(openTasks,'open','Новые','📌')}
    ${col(inProgTasks,'inprog','В работе','🔄')}
    ${col(doneTasks,'done','Выполнено','✅')}
  </div>`;

  body.innerHTML=html;
}

function gtTaskForm(t){
  const today=new Date().toISOString().split('T')[0];
  const allWorkers=pgkWorkers.map(w=>w.name).sort();
  const selectedResp=t?.responsibles||[];
  return `<div class="fgr" style="min-width:min(560px,92vw)">
    <div class="fg s2"><label>Название *</label><input id="gt-f-title" value="${esc(t?.title||'')}" placeholder="Что нужно сделать?"></div>
    <div class="fg s2"><label>Описание</label><textarea id="gt-f-desc" rows="3" placeholder="Подробное описание задачи...">${esc(t?.description||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label>Приоритет</label>
        <select id="gt-m-prio">
          <option value="high"${(t?.priority==='high')?' selected':''}>🔴 Высокий</option>
          <option value="normal"${(!t||t?.priority==='normal')?' selected':''}>🔵 Обычный</option>
          <option value="low"${(t?.priority==='low')?' selected':''}>⚪ Низкий</option>
        </select></div>
      <div class="fg"><label>Категория</label>
        <select id="gt-m-cat">
          ${Object.entries(GT_CATS).map(([k,v])=>`<option value="${k}"${(t?.category||'general')===k?' selected':''}>${v}</option>`).join('')}
        </select></div>
      <div class="fg"><label>Срок выполнения</label><input id="gt-f-due" type="date" value="${t?.due_date||''}"></div>
      <div class="fg"><label>Объект (необяз.)</label>
        <select id="gt-f-site"><option value="">— не привязано —</option>
          ${sites.map(s=>`<option value="${s.id}"${t?.site_id===s.id?' selected':''}>${esc(s.name)}</option>`).join('')}
        </select></div>
    </div>
    <div class="fg s2">
      <label>Ответственные</label>
      <div style="font-size:9px;color:var(--tx3);margin-bottom:4px">Отметьте всех кто должен подтвердить выполнение</div>
      <input id="gt-resp-search" type="text" placeholder="🔍 Поиск по имени..." autocomplete="off"
        style="width:100%;font-size:11px;padding:5px 8px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);color:var(--tx);outline:none;margin-bottom:6px"
        oninput="gtFilterResp(this.value)">
      <div id="gt-resp-list" style="display:flex;flex-wrap:wrap;gap:5px;max-height:160px;overflow-y:auto;background:var(--s2);border-radius:6px;padding:8px;border:1.5px solid var(--bd)">
        ${allWorkers.length?allWorkers.map(w=>`<label data-resp-label="${esc(w).toLowerCase()}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;cursor:pointer;padding:4px 10px;background:var(--s);border:1.5px solid ${selectedResp.includes(w)?'#7c3aed':'var(--bd)'};border-radius:20px;color:${selectedResp.includes(w)?'#7c3aed':'var(--tx)'};user-select:none;transition:all .15s;white-space:nowrap" onmouseenter="this.style.borderColor='#7c3aed'" onmouseleave="if(!this.querySelector('input').checked)this.style.borderColor='var(--bd)'">
          <input type="checkbox" value="${esc(w)}" ${selectedResp.includes(w)?'checked':''} style="accent-color:#7c3aed;cursor:pointer" onchange="this.closest('label').style.borderColor=this.checked?'#7c3aed':'var(--bd)';this.closest('label').style.color=this.checked?'#7c3aed':'var(--tx)'">
          ${esc(w)}
        </label>`).join(''):'<div style="font-size:11px;color:var(--tx3)">Нет сотрудников в системе</div>'}
      </div>
    </div>
    <div class="fg s2"><label>Примечания</label><input id="gt-f-notes" value="${esc(t?.notes||'')}" placeholder="Дополнительная информация"></div>
  </div>`;
}

function gtFilterResp(q){
  const list=document.getElementById('gt-resp-list');if(!list)return;
  const s=q.trim().toLowerCase();
  list.querySelectorAll('label[data-resp-label]').forEach(function(lbl){
    const show=!s||lbl.dataset.respLabel.includes(s);
    lbl.style.display=show?'inline-flex':'none';
    lbl.style.margin=show?'':'0';
    lbl.style.padding=show?'':'0';
  });
}

function gtCollectResponsibles(){
  const fromList=[...document.querySelectorAll('#gt-resp-list input[type=checkbox]:checked')].map(el=>el.value.trim()).filter(Boolean);
  return [...new Set(fromList)];
}

function gtAddTask(){
  if(!window._gtWorkersLoaded){
    window._gtWorkersLoaded=true;
    fetch(`${API}/pgk/workers`).then(r=>r.json()).then(d=>{pgkWorkers=Array.isArray(d)?d:[];_gtAddTaskModal();}).catch(()=>_gtAddTaskModal());
    return;
  }
  _gtAddTaskModal();
}
function _gtAddTaskModal(){
  showModal('📋 Новая задача', gtTaskForm(null), [
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'💾 Создать',cls:'bp',fn:async()=>{
      const title=document.getElementById('gt-f-title')?.value.trim();
      if(!title){toast('Введите название задачи','err');return;}
      const responsibles=gtCollectResponsibles();
      const body={
        title,
        description:document.getElementById('gt-f-desc')?.value.trim()||'',
        priority:document.getElementById('gt-m-prio')?.value||'normal',
        category:document.getElementById('gt-m-cat')?.value||'general',
        due_date:document.getElementById('gt-f-due')?.value||null,
        site_id:document.getElementById('gt-f-site')?.value||null,
        responsibles,
        notes:document.getElementById('gt-f-notes')?.value.trim()||'',
        created_by:un(),
      };
      await fetch(`${API}/gtasks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      closeModal();await loadGTasks();toast('Задача создана','ok');
    }}
  ]);
}

async function gtEditTask(id){
  const t=gtasks.find(x=>x.id===id);if(!t)return;
  if(!pgkWorkers.length){try{pgkWorkers=await fetch(`${API}/pgk/workers`).then(r=>r.json());}catch(e){}}
  showModal('✏️ Редактировать задачу', gtTaskForm(t), [
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'💾 Сохранить',cls:'bp',fn:async()=>{
      const title=document.getElementById('gt-f-title')?.value.trim();
      if(!title){toast('Введите название','err');return;}
      const responsibles=gtCollectResponsibles();
      await fetch(`${API}/gtasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title,
          description:document.getElementById('gt-f-desc')?.value.trim()||'',
          priority:document.getElementById('gt-m-prio')?.value||'normal',
          category:document.getElementById('gt-m-cat')?.value||'general',
          due_date:document.getElementById('gt-f-due')?.value||null,
          site_id:document.getElementById('gt-f-site')?.value||null,
          responsibles,
          notes:document.getElementById('gt-f-notes')?.value.trim()||'',
          user_name:un(),
        })});
      closeModal();await loadGTasks();toast('Сохранено','ok');
    }}
  ]);
}

async function gtConfirm(taskId, workerName, checked){
  const me = un();
  const isOther = workerName !== me;
  if(isOther && checked){
    if(!await confirmDlg(`⚠️ ВЫ ТОЧНО ХОТИТЕ ПОДТВЕРДИТЬ ЗА ДРУГОГО ЧЕЛОВЕКА?\n\nВы собираетесь отметить выполнение задачи за сотрудника «${workerName}».\nЭто действие будет зафиксировано.`)){
      renderGTasks();
      return;
    }
  }
  try{
    const r=await fetch(`${API}/gtasks/${taskId}/confirm`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({worker_name:workerName, confirm:checked})});
    const data=await r.json();
    // Update local cache immediately
    const t=gtasks.find(x=>x.id===taskId);
    if(t){
      t.confirmations=data.confirmations;
      t.status=data.status;
    }
    if(data.allConfirmed){
      toast('🎉 Все подтвердили! Нажмите «Завершить задачу» для закрытия.','ok');
    }
    renderGTasks();
  }catch(e){toast('Ошибка','err');}
}

async function gtCloseTask(id){
  const t=gtasks.find(x=>x.id===id);if(!t)return;
  if(!await confirmDlg(`Завершить задачу «${t.title}»?\n\nВсе ответственные подтвердили выполнение.`))return;
  try{
    const r=await fetch(`${API}/gtasks/${id}/close`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_name:un()})});
    const data=await r.json();
    if(data.error){toast(data.error,'err');return;}
    const idx=gtasks.findIndex(x=>x.id===id);
    if(idx>=0){gtasks[idx].status='done';gtasks[idx].closed_at=new Date().toISOString().split('T')[0];}
    renderGTasks();
    toast('✅ Задача завершена!','ok');
  }catch(e){toast('Ошибка','err');}
}

async function gtDeleteTask(id){
  const t=gtasks.find(x=>x.id===id);if(!t)return;
  if(!await confirmDlg(`Удалить задачу «${t.title}»?`))return;
  await apiDelUndo(`/gtasks/${id}`,`Задача «${t.title}» удалена`,loadGTasks);
}


// ═══════════════════════════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════════════════════════

// ═══ Табличный вид «Задач» (выделение, массовые действия, экспорт) ═══════
const GT_COLS=[['title','Задача'],['status','Статус'],['priority','Приоритет'],['category','Категория'],['due','Срок'],
  ['resp','Ответственные'],['conf','Подтв.'],['site','Объект'],['author','Автор'],['notes','Примечания']];
const GT_STATUS_LBL={open:'📌 Новая',inprog:'🔄 В работе',done:'✅ Выполнена'};
if(typeof window._gtView==='undefined'){try{window._gtView=localStorage.getItem('gt_view')||'board';}catch(e){window._gtView='board';}}
function gtSetView(v){window._gtView=v;try{localStorage.setItem('gt_view',v);}catch(e){}renderGTasks();}
function _gtTableHtml(tasks){
  const today=new Date().toISOString().split('T')[0];
  const _s=window._gtSort||'due',_a=window._gtAsc!==false;
  const hidden=TK.hidden('gtasks'),show=k=>!hidden.has(k);
  TK.rerender.gtasks=()=>renderGTasks();
  const sn=t=>((sites||[]).find(s=>s.id===t.site_id)||{}).name||'';
  const PR={high:0,normal:1,low:2};
  const val=(t,k)=>k==='status'?({open:0,inprog:1,done:2}[t.status]??3):k==='priority'?(PR[t.priority]??1):k==='due'?(t.due_date||''):k==='resp'?(t.responsibles||[]).join(', ')
    :k==='conf'?(t.confirmations||[]).length/Math.max(1,(t.responsibles||[]).length):k==='site'?sn(t):k==='author'?(t.created_by||''):k==='category'?(GT_CATS[t.category]||''):(t[k]||'');
  const list=[...tasks].sort((x,y)=>{const a=val(x,_s),b=val(y,_s);if(typeof a==='number')return(a-b)*(_a?1:-1);if(!a!==!b)return a?-1:1;return String(a).localeCompare(String(b),'ru',{numeric:true})*(_a?1:-1);});
  window._gtShownIds=list.map(t=>t.id);
  const th=(k,l)=>`<th data-col="${k}" class="${_s===k?(_a?'wt-asc':'wt-desc'):''}" onclick="if(window._gtSort==='${k}')window._gtAsc=!(window._gtAsc!==false);else{window._gtSort='${k}';window._gtAsc=true;}renderGTasks()">${l}</th>`;
  const sel=TK.set('gtasks'),dash='<span style="color:var(--tx3)">—</span>';
  const rows=list.map(t=>{
    const _id=escAttr(t.id),on=sel.has(t.id),resp=t.responsibles||[],conf=t.confirmations||[];
    const over=t.due_date&&t.due_date<today&&t.status!=='done';
    const td={
      title:`<td class="td-link" style="font-weight:600" onclick="gtEditTask('${_id}')" title="${esc(t.description||'')}">${esc(t.title)}</td>`,
      status:`<td>${GT_STATUS_LBL[t.status]||t.status}</td>`,
      priority:`<td><span class="gt-badge-prio ${GT_PRIO_CLS[t.priority]||'normal'}">${GT_PRIO[t.priority]||'Обычный'}</span></td>`,
      category:`<td><span class="gt-cat-tag">${GT_CATS[t.category]||t.category||''}</span></td>`,
      due:`<td class="td-editable" style="${over?'color:#ef4444;font-weight:700':''}" onclick="_gtDueCell(event,this,'${_id}')">${t.due_date?(over?'🚨 ':'')+fmt(t.due_date):dash}</td>`,
      resp:`<td style="font-size:11px">${resp.length?resp.map(r=>`${conf.includes(r)?'✅':'⬜'} ${esc(r)}`).join('<br>'):dash}</td>`,
      conf:`<td style="text-align:center">${resp.length?`${conf.length}/${resp.length}`:dash}</td>`,
      site:`<td>${sn(t)?'🏗 '+esc(sn(t)):dash}</td>`,
      author:`<td style="font-size:11px">${t.created_by?esc(t.created_by):dash}</td>`,
      notes:`<td class="td-notes td-editable" title="${esc(t.notes||'')}" onclick="_gtNoteCell(event,this,'${_id}')">${esc(t.notes||'')}</td>`,
    };
    return `<tr data-rid="${t.id}" class="${on?'lasso-sel':''}${t.status==='done'?' wt-fired':''}" oncontextmenu="event.preventDefault();gtCtxMenu(event,'${_id}')">${TK.chkTd(on)}${GT_COLS.filter(([k])=>show(k)).map(([k])=>td[k]).join('')}</tr>`;
  }).join('');
  const n=1+GT_COLS.filter(([k])=>show(k)).length;
  return `<div class="wt-summary" style="padding:4px 2px;flex-wrap:wrap">
      ${TK.selBar('gtasks')}<span style="margin-left:auto"><button class="btn bs bsm" onclick="_gtExportMenu(event)">📤 Excel</button></span></div>
    <div class="wt-scroll" style="max-height:calc(100vh - 260px)"><table class="wt-tbl" id="gt-tbl" style="min-width:900px">
      <thead oncontextmenu="TK.colsMenu(event,'gtasks',GT_COLS.filter(c=>c[0]!=='title'),()=>renderGTasks())"><tr>${TK.chkTh('gtasks')}${GT_COLS.filter(([k])=>show(k)).map(([k,l])=>k==='notes'?`<th class="no-sort" data-col="notes">${l}</th>`:th(k,l)).join('')}</tr></thead>
      <tbody id="gt-tbody">${rows||`<tr><td colspan="${n}" style="text-align:center;padding:24px;color:var(--tx3)">Нет задач</td></tr>`}</tbody></table></div>`;
}
function _gtNoteCell(ev,td,id){const t=gtasks.find(x=>x.id===id);if(t)TK.cellText(ev,td,t.notes||'',v=>_gtApply([id],{notes:v},'Примечание сохранено'));}
function _gtDueCell(ev,td,id){const t=gtasks.find(x=>x.id===id);if(t)TK.cellText(ev,td,t.due_date||'',v=>_gtApply([id],{due_date:v||null},'Срок изменён'),'date');}
async function _gtApply(ids,patch,msg,noUndo){
  const list=ids.map(id=>gtasks.find(t=>t.id===id)).filter(Boolean);
  const before=TK.snapshot(list,patch);
  try{await Promise.all(list.map(t=>{const p=typeof patch==='function'?patch(t):patch;
    return fetch(`${API}/gtasks/${t.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...t,...p,user_name:un()})});}));}
  catch(e){toast('Ошибка сохранения','err');}
  await loadGTasks();
  if(msg&&!noUndo)TK.undoBar(list.length>1?`${msg}: ${list.length} задач`:msg,()=>_gtApply(before.map(b=>b.id),t=>(before.find(b=>b.id===t.id)||{}).old||{},null,true));
}
function gtCtxMenu(ev,id){
  const t=gtasks.find(x=>x.id===id);if(!t)return;
  const x=ev.clientX,y=ev.clientY,ids=TK.ctxIds('gtasks',id),multi=ids.length>1;
  const people=(pgkWorkers||[]).map(w=>({v:w.name,l:w.name,sub:w.role||''}));
  showCtx(x,y,[
    multi?{i:'☑️',l:`<b>Выбрано: ${ids.length}</b>`,html:true,f:()=>{}}:{i:'📋',l:`<b>${esc(t.title)}</b>`,html:true,f:()=>gtEditTask(id)},
    {sep:true},
    ...(multi?[]:[{i:'✏️',l:'Редактировать',f:()=>gtEditTask(id)}]),
    {i:'⚑',l:'Приоритет…',f:()=>_searchPick({x,y,title:'⚑ Приоритет',items:Object.entries(GT_PRIO).map(([k,v])=>({v:k,l:v})),current:multi?null:t.priority,onPick:v=>_gtApply(ids,{priority:v},'Приоритет изменён')})},
    {i:'🏷',l:'Категория…',f:()=>_searchPick({x,y,title:'🏷 Категория',items:Object.entries(GT_CATS).map(([k,v])=>({v:k,l:v})),current:multi?null:t.category,onPick:v=>_gtApply(ids,{category:v},'Категория изменена')})},
    {i:'📅',l:'Срок…',f:()=>{showModal('📅 Срок'+(multi?` — ${ids.length} задач`:''),`<div class="fg"><label>Срок выполнения</label><input id="gt-bulk-due" type="date" value="${multi?'':(t.due_date||'')}"></div>`,
      [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:()=>{const d=v('gt-bulk-due')||null;closeModal();_gtApply(ids,{due_date:d},'Срок изменён');}}]);}},
    {i:'🏗',l:'Объект…',f:()=>_searchPick({x,y,title:'🏗 Объект',items:[{v:'',l:'— не привязано —'},...(sites||[]).map(s=>({v:s.id,l:s.name,sub:s.client||''}))],current:multi?null:(t.site_id||''),onPick:v=>_gtApply(ids,{site_id:v||null},'Объект изменён')})},
    {i:'👤',l:'Добавить ответственного…',f:()=>_searchPick({x,y,title:'👤 Добавить ответственного',items:people,current:null,onPick:v=>v&&_gtApply(ids,q=>({responsibles:[...new Set([...(q.responsibles||[]),v])]}),'Ответственный добавлен')})},
    {i:'👤',l:'Убрать ответственного…',f:()=>{const all=[...new Set(ids.flatMap(i=>(gtasks.find(q=>q.id===i)||{}).responsibles||[]))];
      if(!all.length){toast('Ответственных нет','warn');return;}
      _searchPick({x,y,title:'👤 Убрать ответственного',items:all.map(n=>({v:n,l:n})),current:null,onPick:v=>v&&_gtApply(ids,q=>({responsibles:(q.responsibles||[]).filter(r=>r!==v)}),'Ответственный убран')});}},
    {i:'📝',l:'Примечание…',f:()=>TK.notesModal(ids.length,multi?'':t.notes,(txt,app)=>_gtApply(ids,app?(q=>({notes:(q.notes?q.notes+' ':'')+txt})):{notes:txt},'Примечание сохранено'))},
    {sep:true},
    {i:'📤',l:'Экспорт в Excel',f:()=>_gtExportList(ids.map(i=>gtasks.find(q=>q.id===i)).filter(Boolean))},
    {i:'🗑',l:multi?`Удалить выбранные (${ids.length})`:'Удалить',cls:'cxi-red',f:()=>multi?TK.bulkDelete(ids,i=>`/gtasks/${i}`,loadGTasks,'задач'):gtDeleteTask(id)},
  ]);
}
function _gtExportMenu(ev){
  const by=id=>gtasks.find(t=>t.id===id),shown=(window._gtShownIds||[]).map(by).filter(Boolean),s=TK.selectedIds('gtasks');
  TK.exportMenu(ev,{all:gtasks,shown,selected:shown.filter(t=>s.includes(t.id)),run:_gtExportList});
}
function _gtExportList(list){
  if(!list||!list.length){toast('Нет задач','warn');return;}
  const sn=t=>((sites||[]).find(s=>s.id===t.site_id)||{}).name||'';
  const aoa=[['Задачи — '+new Date().toLocaleDateString('ru-RU')],['Задача','Описание','Статус','Приоритет','Категория','Срок','Ответственные','Подтвердили','Объект','Автор','Примечания'],
    ...list.map(t=>[t.title,t.description||'',(GT_STATUS_LBL[t.status]||t.status).replace(/^\S+\s/,''),GT_PRIO[t.priority]||'',String(GT_CATS[t.category]||'').replace(/^\S+\s/,''),
      _fmtDateRu(t.due_date),(t.responsibles||[]).join(', '),(t.confirmations||[]).join(', '),sn(t),t.created_by||'',t.notes||''])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:36},{wch:40},{wch:12},{wch:12},{wch:14},{wch:11},{wch:30},{wch:30},{wch:20},{wch:16},{wch:24}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:10}}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Задачи');XLSX.writeFile(wb,`Задачи_${new Date().toISOString().slice(0,10)}.xlsx`);toast('Excel сохранён','ok');
}
