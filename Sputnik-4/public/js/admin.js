// ═══════════════════════════════════════════════════════════
// admin.js — панель администратора: онлайн-пользователи, права,
// пароль. Доступ: с ПК-сервера (localhost) авто, иначе по паролю.
// ═══════════════════════════════════════════════════════════

let _admCaps={}, _admPollTimer=null, _admTab='online';

// Точка входа (кнопка ⚙️)
async function openAdminPanel(){
  await loadMyCaps();
  if(!isAdminClient()){
    if(iAmLoopback){ // с ПК-сервера — авто-логин без пароля
      await _admLogin('');
    } else {
      return _admPasswordPrompt();
    }
  } else if(!adminToken()){
    // админ по loopback, но токена ещё нет — получим для действий с др. устройств не нужно,
    // но локальным действиям токен не требуется (loopback и так админ)
  }
  _admRender();
}

// Запрос пароля (не-loopback)
function _admPasswordPrompt(){
  showModal('🔒 Вход администратора',`
    <div style="font-size:12px;color:var(--tx2);margin-bottom:10px">Введите пароль администратора.</div>
    <div class="fg"><label>Пароль</label>
      <input id="adm-pw" type="password" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')_admDoLogin()"></div>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'Войти',cls:'bp',fn:_admDoLogin}]);
  setTimeout(()=>{const e=document.getElementById('adm-pw');if(e)e.focus();},60);
}
async function _admDoLogin(){
  const pw=(document.getElementById('adm-pw')||{}).value||'';
  const ok=await _admLogin(pw);
  if(ok){await loadMyCaps();closeModal();_admRender();}
}
async function _admLogin(password){
  try{
    const r=await fetch(`${API}/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    if(!r.ok){const j=await r.json().catch(()=>({}));toast(j.error||'Ошибка входа','err');return false;}
    const j=await r.json();
    if(j.token)setAdminToken(j.token);
    iAmAdmin=true;
    return true;
  }catch(e){toast('Ошибка сети','err');return false;}
}

// Основная панель с вкладками
function _admRender(){
  showModal('⚙️ Администрирование',`
    <div style="display:flex;gap:4px;margin-bottom:10px;border-bottom:1.5px solid var(--bd);padding-bottom:8px">
      <button class="btn bs bsm" id="adm-t-online"  onclick="_admSwitch('online')">👥 Онлайн</button>
      <button class="btn bs bsm" id="adm-t-rights"  onclick="_admSwitch('rights')">🔑 Права</button>
      <button class="btn bs bsm" id="adm-t-tabs"    onclick="_admSwitch('tabs')">🗂 Вкладки</button>
      <button class="btn bs bsm" id="adm-t-settings" onclick="_admSwitch('settings')">⚙️ Настройки</button>
    </div>
    <div id="adm-body" style="min-height:260px"></div>`,
    [{label:'Закрыть',cls:'bs',fn:()=>{_admStopPoll();closeModal();}}]);
  _admSwitch(_admTab||'online');
}
function _admSwitch(tab){
  _admTab=tab;
  ['online','rights','tabs','settings'].forEach(t=>{
    const b=document.getElementById('adm-t-'+t);
    if(b)b.className='btn '+(t===tab?'bp':'bs')+' bsm';
  });
  _admStopPoll();
  if(tab==='online'){_admRenderOnline();_admPollTimer=setInterval(()=>{if(document.getElementById('adm-online-list'))_admRenderOnline();else _admStopPoll();},8000);}
  else if(tab==='rights')_admRenderRights();
  else if(tab==='tabs')_admRenderTabs();
  else _admRenderSettings();
}
function _admStopPoll(){if(_admPollTimer){clearInterval(_admPollTimer);_admPollTimer=null;}}
// вызывается из SSE presence-события
function onPresenceEvent(){ if(_admTab==='online'&&document.getElementById('adm-online-list'))_admRenderOnline(); }

async function _admRenderOnline(){
  const box=document.getElementById('adm-body');if(!box)return;
  let list=[];try{const r=await fetch(`${API}/presence`);if(r.ok)list=await r.json();}catch(e){}
  const fmtSince=t=>{const s=Math.max(0,Math.floor((Date.now()-t)/60000));return s<1?'только что':s<60?s+' мин':Math.floor(s/60)+' ч '+(s%60)+' мин';};
  const staleN=list.filter(p=>p.stale).length;
  box.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="font-size:11px;color:var(--tx3);flex:1">Сейчас в программе: <b style="color:var(--acc)">${list.length}</b></div>
      <button class="btn bs bsm" onclick="_admReloadAll()" title="Разослать команду обновить страницу всем на новой версии">🔄 Обновить у всех</button>
    </div>
    ${staleN?`<div style="font-size:10px;color:#b45309;background:#fef3c7;border-radius:var(--rs);padding:5px 8px;margin-bottom:6px;line-height:1.4">
      ⚠️ ${staleN} чел. на старой версии страницы — попросите их обновить (F5), чтобы появились имена и права.</div>`:''}
    <div id="adm-online-list" style="max-height:300px;overflow-y:auto">
    ${list.length?list.map(p=>{
      const dot=p.stale?'#f59e0b':'#22c55e';
      const nm=p.stale?'❓ Старая версия — обновить страницу (F5)':(p.name||'(без имени)');
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--bd);font-size:12px">
      <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></span>
      <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${p.stale?'color:#b45309':''}">${esc(nm)}</span>
      <span style="font-size:10px;color:var(--tx3);white-space:nowrap">${esc(p.ip||'')}</span>
      <span style="font-size:10px;color:var(--tx3);white-space:nowrap" title="Вкладок: ${p.tabs}">${p.tabs>1?'🗔×'+p.tabs+' · ':''}${fmtSince(p.connectedAt)}</span>
    </div>`;}).join(''):'<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Никого нет</div>'}
    </div>`;
}
async function _admReloadAll(){
  const ok=await confirmDlg('Разослать команду обновить страницу всем подключённым? У людей на актуальной версии страница перезагрузится через 1–2 сек.',{okLabel:'Обновить у всех',danger:false});
  if(!ok)return;
  try{const r=await fetch(`${API}/admin/reload`,{method:'POST'});if(r.ok)toast('Команда отправлена','ok');}catch(e){toast('Ошибка','err');}
}

async function _admRenderRights(){
  const box=document.getElementById('adm-body');if(!box)return;
  box.innerHTML='<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">⏳ Загрузка…</div>';
  let data={caps:{},clients:[]};
  try{const r=await fetch(`${API}/admin/clients`);if(r.ok)data=await r.json();else{const j=await r.json().catch(()=>({}));box.innerHTML='<div style="color:#ef4444;font-size:12px;padding:10px">'+esc(j.error||'Нет доступа')+'</div>';return;}}catch(e){box.innerHTML='<div style="color:#ef4444;padding:10px">Ошибка сети</div>';return;}
  _admCaps=data.caps;
  const capKeys=Object.keys(data.caps);
  const fmtSeen=s=>{if(!s)return '';const d=new Date(s.replace(' ','T')+'Z');return d.toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
  box.innerHTML=`
    <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;line-height:1.5">
      Права привязаны к <b>имени человека</b> и сохраняются после перезапуска сервера и смены браузера.
      Снятая галочка = <b>запрет</b>. У «Переключение слоёв для всех» снятая = слои переключаются только
      у него, не влияя на других. Пусто = полный доступ.
    </div>
    <div style="max-height:330px;overflow-y:auto">
    ${data.clients.length?data.clients.map((c,i)=>{
      const key=escAttr(c.key);
      return `<div style="border:1.5px solid var(--bd);border-radius:var(--rs);padding:8px 10px;margin-bottom:8px" data-key="${key}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          ${c.online?'<span style="width:8px;height:8px;border-radius:50%;background:#22c55e"></span>':'<span style="width:8px;height:8px;border-radius:50%;background:var(--bd)"></span>'}
          <span style="font-weight:700;font-size:12px;flex:1">${esc(c.name||'(без имени)')}</span>
          ${c.devices>1?`<span style="font-size:9px;color:var(--tx3)" title="Устройств/браузеров">💻×${c.devices}</span>`:''}
          <span style="font-size:9px;color:var(--tx3)">${c.online?'онлайн':('был '+fmtSeen(c.last_seen))}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${capKeys.map(k=>`<label style="display:flex;align-items:center;gap:4px;font-size:10.5px;cursor:pointer">
            <input type="checkbox" class="adm-cap" data-key="${key}" data-cap="${k}" ${c.caps&&c.caps[k]===false?'':'checked'}
              onchange="_admSaveRow('${key}','${escAttr(c.name||'')}')"> ${esc(data.caps[k])}
          </label>`).join('')}
        </div>
      </div>`;
    }).join(''):'<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Пользователи ещё не заходили</div>'}
    </div>`;
}
async function _admSaveRow(key,name){
  const caps={};
  document.querySelectorAll('.adm-cap[data-key="'+key+'"]').forEach(cb=>{caps[cb.dataset.cap]=cb.checked;});
  try{
    const r=await fetch(`${API}/admin/acl`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,caps})});
    if(r.ok)toast('Права сохранены','ok');
  }catch(e){toast('Ошибка сохранения','err');}
}

// Управление видимостью вкладок навигации (глобально для всех пользователей)
const _ADM_TABS=[
  {v:'dash',label:'📊 Дашборд'},
  {v:'workers',label:'👷 Сотрудники'},
  {v:'machinery',label:'🚛 Техника'},
  {v:'equipment',label:'🔩 Оборудование'},
  {v:'materials',label:'📦 Материалы'},
  {v:'gruz',label:'🚚 Груз'},
  {v:'gtasks',label:'📋 Задачи'},
  {v:'smg',label:'📅 СМГ'},
  {v:'mto',label:'🛠 МТО'},
  {v:'brigades',label:'👥 Бригады'},
];
async function _admRenderTabs(){
  const box=document.getElementById('adm-body');if(!box)return;
  box.innerHTML='<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">⏳ Загрузка…</div>';
  let hidden=[];
  try{const r=await fetch(`${API}/ui-config`);if(r.ok){const d=await r.json();hidden=Array.isArray(d&&d.hiddenTabs)?d.hiddenTabs:[];}}catch(e){}
  box.innerHTML=`
    <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">
      Снятая галочка = вкладка <b>скрыта у всех</b> пользователей. Вкладка «🗺 Карта» скрыть нельзя.
      Изменения применяются сразу на всех подключённых устройствах.
    </div>
    <div style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
    ${_ADM_TABS.map(t=>`<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;padding:6px 8px;border:1px solid var(--bd);border-radius:var(--rs)">
      <input type="checkbox" class="adm-tab-cb" data-v="${escAttr(t.v)}" ${hidden.indexOf(t.v)>=0?'':'checked'} onchange="_admSaveTabs()">
      <span>${t.label}</span>
    </label>`).join('')}
    </div>`;
}
async function _admSaveTabs(){
  const hidden=[];
  document.querySelectorAll('.adm-tab-cb').forEach(cb=>{ if(!cb.checked)hidden.push(cb.dataset.v); });
  try{
    const r=await fetch(`${API}/admin/ui-config`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hiddenTabs:hidden})});
    if(!r.ok){const j=await r.json().catch(()=>({}));toast(j.error||'Ошибка','err');return;}
    toast('Настройки вкладок сохранены','ok');
    // Применяем локально сразу (SSE догонит остальных)
    if(typeof HIDDEN_TABS!=='undefined')HIDDEN_TABS=hidden;
    if(typeof applyHiddenTabs==='function')applyHiddenTabs();
  }catch(e){toast('Ошибка сети','err');}
}

function _admRenderSettings(){
  const box=document.getElementById('adm-body');if(!box)return;
  box.innerHTML=`
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">Пароль администратора</div>
    <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">
      Нужен, чтобы открывать эту панель с других устройств (не с ПК-сервера). С самого сервера доступ есть всегда.
    </div>
    <div class="fg" style="max-width:280px"><label>Новый пароль (мин. 4 символа)</label>
      <input id="adm-newpw" type="password" autocomplete="new-password"></div>
    <button class="btn bp bsm" style="margin-top:8px" onclick="_admSavePw()">💾 Сохранить пароль</button>`;
}
async function _admSavePw(){
  const pw=(document.getElementById('adm-newpw')||{}).value||'';
  if(pw.length<4){toast('Минимум 4 символа','err');return;}
  try{
    const r=await fetch(`${API}/admin/password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
    if(!r.ok){const j=await r.json().catch(()=>({}));toast(j.error||'Ошибка','err');return;}
    const j=await r.json();if(j.token)setAdminToken(j.token);
    toast('Пароль сохранён','ok');
    const e=document.getElementById('adm-newpw');if(e)e.value='';
  }catch(e){toast('Ошибка сети','err');}
}

// Косметика: прячем явные кнопки удаления у ограниченного (сервер всё равно enforce'ит)
function applyCapsToUI(){
  try{
    document.body.classList.toggle('cap-no-delete', typeof can==='function' && !can('delete'));
    const gear=document.getElementById('admin-btn');
    if(gear)gear.style.display=''; // кнопка видна всем; вход по паролю/loopback
  }catch(e){}
}
