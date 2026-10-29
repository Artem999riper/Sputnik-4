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
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;border-bottom:1.5px solid var(--bd);padding-bottom:8px">
      <button class="btn bs bsm" id="adm-t-online"  onclick="_admSwitch('online')">👥 Онлайн</button>
      <button class="btn bs bsm" id="adm-t-rights"  onclick="_admSwitch('rights')">🔑 Права</button>
      <button class="btn bs bsm" id="adm-t-tabs"    onclick="_admSwitch('tabs')">🗂 Вкладки</button>
      <button class="btn bs bsm" id="adm-t-settings" onclick="_admSwitch('settings')">⚙️ Настройки</button>
      <button class="btn bs bsm" id="adm-t-update" onclick="_admSwitch('update')">🔄 Обновление</button>
      <button class="btn bs bsm" id="adm-t-db" onclick="_admSwitch('db')">🩺 Проверка базы</button>
      <button class="btn bs bsm" id="adm-t-errors" onclick="_admSwitch('errors')">🐞 Ошибки</button>
    </div>
    <div id="adm-body" style="min-height:260px"></div>`,
    [{label:'Закрыть',cls:'bs',fn:()=>{_admStopPoll();closeModal();}}]);
  _admSwitch(_admTab||'online');
}
function _admSwitch(tab){
  _admTab=tab;
  ['online','rights','tabs','settings','update','db','errors'].forEach(t=>{
    const b=document.getElementById('adm-t-'+t);
    if(b)b.className='btn '+(t===tab?'bp':'bs')+' bsm';
  });
  _admStopPoll();
  if(tab==='online'){_admRenderOnline();_admPollTimer=setInterval(()=>{if(document.getElementById('adm-online-list'))_admRenderOnline();else _admStopPoll();},8000);}
  else if(tab==='rights')_admRenderRights();
  else if(tab==='tabs')_admRenderTabs();
  else if(tab==='update')_admRenderUpdate();
  else if(tab==='db')_admRenderDb();
  else if(tab==='errors')_admRenderErrors();
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
      const nm=p.stale?(p.local?'❓ Старая вкладка на этом компьютере (сервере) — обновите её (F5)':p.guess?`❓ Старая вкладка — вероятно ${p.guess} (тот же компьютер), F5`:'❓ Старая версия страницы — обновить (F5)'):(p.name||'(без имени)');
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
  box.innerHTML=typeof skel==='function'?skel(4):'⏳ Загрузка…';
  let data={caps:{},clients:[]};
  try{const r=await fetch(`${API}/admin/clients`);if(r.ok)data=await r.json();else{const j=await r.json().catch(()=>({}));box.innerHTML='<div style="color:#ef4444;font-size:12px;padding:10px">'+esc(j.error||'Нет доступа')+'</div>';return;}}catch(e){box.innerHTML='<div style="color:#ef4444;padding:10px">Ошибка сети</div>';return;}
  _admCaps=data.caps;
  const capKeys=Object.keys(data.caps);
  const fmtSeen=s=>{if(!s)return '';const d=new Date(s.replace(' ','T')+'Z');return d.toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
  box.innerHTML=`
    <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;line-height:1.5">
      Права привязаны к <b>имени человека</b> и сохраняются после перезапуска сервера и смены браузера.
      Снятая галочка = <b>запрет</b>. У «Переключение слоёв для всех» снятая = слои переключаются только
      у него, не влияя на других. Пусто = полный доступ. <b>«По разделам»</b> — отдельно создание / правку / удаление
      в каждом разделе (👁 — только просмотр). С компьютера-сервера ограничения не действуют.
    </div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
      <button class="btn bs bsm" onclick="_admAddPerson(event)">＋ Задать права человеку…</button>
      <span style="font-size:10px;color:var(--tx3)">— например, тому, кто ещё не заходил в программу</span></div>
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
        ${data.sections?(()=>{
          const secs=Object.keys(data.sections),acts=Object.keys(data.acts||{});
          const denied=secs.reduce((n,sc)=>n+acts.filter(a=>c.caps&&c.caps[sc+'.'+a]===false).length,0);
          return `<details style="margin-top:6px"${denied?' open':''}><summary style="font-size:10.5px;cursor:pointer;color:var(--acc);font-weight:700">По разделам${denied?` — запретов: ${denied}`:''}</summary>
          <table style="border-collapse:collapse;font-size:10.5px;margin-top:4px;width:100%">
            <tr><th style="text-align:left;padding:2px 6px;color:var(--tx3)">Раздел</th>${acts.map(a=>`<th style="padding:2px 6px;color:var(--tx3)">${esc(data.acts[a])}</th>`).join('')}
              <th style="padding:2px 6px;color:var(--tx3)">только просмотр</th></tr>
            ${secs.map(sc=>`<tr style="border-top:1px solid var(--bd)"><td style="padding:2px 6px">${esc(data.sections[sc])}</td>
              ${acts.map(a=>`<td style="text-align:center"><input type="checkbox" class="adm-cap" data-key="${key}" data-cap="${sc}.${a}" ${c.caps&&c.caps[sc+'.'+a]===false?'':'checked'}
                onchange="_admSaveRow('${key}','${escAttr(c.name||'')}')" style="width:auto;margin:0"></td>`).join('')}
              <td style="text-align:center"><button class="btn bs bxs" title="Запретить создание, правку и удаление" onclick="document.querySelectorAll('.adm-cap[data-key=&quot;${key}&quot;][data-cap^=&quot;${sc}.&quot;]').forEach(x=>x.checked=false);_admSaveRow('${key}','${escAttr(c.name||'')}')">👁</button></td></tr>`).join('')}
          </table></details>`;})():''}
      </div>`;
    }).join(''):'<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Пользователи ещё не заходили</div>'}
    </div>`;
}
// Выбрать человека из сотрудников (или ввести имя) и создать для него запись прав
async function _admAddPerson(ev){
  let ws=[];try{ws=await fetch(`${API}/pgk/workers`).then(r=>r.json());}catch(e){}
  const r=ev.currentTarget.getBoundingClientRect();
  _searchPick({x:r.left,y:r.bottom+4,title:'Кому задать права',items:ws.map(w=>({v:w.name,l:w.name,sub:w.role||''})),current:null,addLabel:'имя',onPick:async name=>{
    if(!name)return;
    // запись прав создаётся, когда есть хоть один запрет — по умолчанию запрещаем удаление, дальше настраивается галочками
    await fetch(`${API}/admin/acl`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,caps:{delete:false}})});
    toast(`Добавлен «${name}» (удаление запрещено — настройте галочками)`,'ok');
    _admRenderRights();
  }});
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
  {v:'conv',label:'🧭 Пересчёт'},
  {v:'brigades',label:'👥 Бригады'},
];
async function _admRenderTabs(){
  const box=document.getElementById('adm-body');if(!box)return;
  box.innerHTML=typeof skel==='function'?skel(4):'⏳ Загрузка…';
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

// ── Версия и обновление программы ─────────────────────────
async function _admRenderUpdate(){
  const box=document.getElementById('adm-body');if(!box)return;
  box.innerHTML=typeof skel==='function'?skel(4):'⏳ Загрузка…';
  const v=await _verFetch()||{};
  let snaps=[];try{snaps=await fetch(`${API}/admin/update/snapshots`).then(r=>r.json());}catch(e){}
  const row=(k,val)=>`<div style="color:var(--tx3)">${k}</div><div>${val}</div>`;
  box.innerHTML=`
    <div style="display:grid;grid-template-columns:150px 1fr;gap:4px 10px;font-size:12px;margin-bottom:12px">
      ${row('Версия','<b>'+esc(v.version||'?')+'</b>')}
      ${row('Сборка',esc(v.commit?(v.commit+(v.branch?' ('+v.branch+')':'')):(v.serverBuild||'—')))}
      ${row('Сервер запущен',v.startedAt?new Date(v.startedAt).toLocaleString('ru-RU'):'—')}
      ${row('Node.js',esc(v.node||''))}
      ${row('Состояние',v.needRestart?'<b style="color:#b45309">⚠️ код обновлён — нужен перезапуск</b>':'<span style="color:#15803d">✅ актуально</span>')}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn ${v.needRestart?'bp':'bs'} bsm" onclick="verRestart()" ${v.canRestart?'':'disabled title="Сервер запущен не через start.bat"'}>🔄 Перезапустить сервер</button>
      <button class="btn bs bsm" onclick="_admSelftest()" title="Автотесты на временной копии: рабочая база не затрагивается">🧪 Самопроверка</button>
    </div>
    <div id="adm-selftest" style="font-size:11px;margin:-6px 0 14px"></div>
    ${v.git?`<div style="font-size:12px;font-weight:700;margin-bottom:6px">Обновление из git</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      <button class="btn bs bsm" onclick="_admUpdCheck()">🔎 Проверить обновления</button>
      <button class="btn bs bsm" onclick="_admUpdGit()">⬇️ Обновить (git pull)</button>
    </div>
    <div id="adm-upd-git" style="font-size:11px;color:var(--tx2);margin-bottom:14px"></div>`:''}
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">Обновление из архива (.zip)</div>
    <div style="font-size:10px;color:var(--tx3);margin-bottom:6px;line-height:1.5">
      Архив новой версии (например, «Download ZIP» с GitHub). База данных, бэкапы, фото и node_modules не затрагиваются.
      Перед обновлением автоматически делается бэкап базы и копия текущего кода — к ней можно откатиться.</div>
    <label class="btn bp bsm" style="cursor:pointer">📦 Выбрать архив и обновить<input type="file" accept=".zip" style="display:none" onchange="_admUpdZip(this)"></label>
    <div id="adm-upd-zip" style="font-size:11px;color:var(--tx2);margin:6px 0 14px"></div>
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">Откат на сохранённую копию</div>
    ${snaps.length?`<div style="max-height:150px;overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs)">${snaps.map(s=>`
      <div style="display:flex;gap:8px;align-items:center;padding:4px 8px;border-bottom:1px solid var(--bd);font-size:11px">
        <span style="flex:1">${esc(s.name)}</span><span style="color:var(--tx3)">${(s.size/1048576).toFixed(1)} МБ</span>
        <button class="btn bs bxs" onclick="_admUpdRollback('${escAttr(s.name)}')">↩ Откатить</button></div>`).join('')}</div>`
      :'<div style="font-size:11px;color:var(--tx3)">Копий пока нет — они появятся при первом обновлении.</div>'}`;
}
async function _admSelftest(){
  const box=document.getElementById('adm-selftest');if(!box)return;
  box.innerHTML='⏳ Идёт самопроверка (до минуты)… Рабочая база не затрагивается.';
  try{
    const j=await fetch(`${API}/admin/selftest`,{method:'POST'}).then(r=>r.json());
    if(j.error){box.innerHTML='<span style="color:var(--red)">'+esc(j.error)+'</span>';return;}
    box.innerHTML=`${j.fail?'<b style="color:var(--red)">❌ Найдены проблемы</b>':'<b style="color:#15803d">✅ Всё в порядке</b>'} — пройдено ${j.pass}${j.fail?`, ошибок ${j.fail}`:''}${j.skip?`, пропущено ${j.skip}`:''} · ${j.seconds} с
      ${j.failed&&j.failed.length?`<div style="color:var(--red);margin-top:4px">${j.failed.map(f=>'• '+esc(f)).join('<br>')}</div>`:''}
      <details style="margin-top:4px"><summary style="cursor:pointer;color:var(--tx3)">подробный отчёт</summary><pre style="max-height:220px;overflow:auto;font-size:10px;background:var(--s2);padding:6px;border-radius:4px;white-space:pre-wrap">${esc(j.output||'')}</pre></details>`;
  }catch(e){box.textContent='Ошибка: '+e.message;}
}
async function _admUpdCheck(){
  const out=document.getElementById('adm-upd-git');if(out)out.textContent='⏳ Проверяю…';
  try{
    const j=await fetch(`${API}/admin/update/check`).then(r=>r.json());
    if(j.error){out.innerHTML='<span style="color:var(--red)">'+esc(j.error)+'</span>';return;}
    out.innerHTML=j.behind?`Доступно обновлений: <b>${j.behind}</b><br>${j.log.map(l=>'• '+esc(l)).join('<br>')}`:'✅ Установлена последняя версия';
  }catch(e){out.textContent='Ошибка: '+e.message;}
}
async function _admUpdResult(j,out){
  if(j.error){out.innerHTML='<span style="color:var(--red)">⚠️ '+esc(j.error)+'</span>';return;}
  out.innerHTML=`✅ Обновлено${j.files?` (${j.files} файлов)`:''}${j.npm?`, зависимости: ${esc(j.npm)}`:''}. Копия прежнего кода: ${esc(j.snapshot||'')}`;
  if(j.restarting)_verWaitBack();else toast('Перезапустите сервер (закройте окно и запустите start.bat)','warn');
}
async function _admUpdGit(){
  if(!await confirmDlg('Обновить программу из git и перезапустить сервер?'))return;
  const out=document.getElementById('adm-upd-git');if(out)out.textContent='⏳ Обновляю…';
  try{const r=await fetch(`${API}/admin/update/git`,{method:'POST'});_admUpdResult(await r.json(),out);}catch(e){out.textContent='Ошибка: '+e.message;}
}
async function _admUpdZip(input){
  const f=input.files[0];input.value='';if(!f)return;
  if(!await confirmDlg(`Обновить программу из архива «${f.name}» и перезапустить сервер?`))return;
  const out=document.getElementById('adm-upd-zip');if(out)out.textContent='⏳ Загружаю и устанавливаю…';
  const fd=new FormData();fd.append('file',f);
  try{const r=await fetch(`${API}/admin/update/zip`,{method:'POST',body:fd});_admUpdResult(await r.json(),out);}catch(e){out.textContent='Ошибка: '+e.message;}
}
async function _admUpdRollback(name){
  if(!await confirmDlg(`Откатить программу на копию «${name}» и перезапустить сервер?\n\nБаза данных не изменится.`))return;
  const out=document.getElementById('adm-upd-zip');if(out)out.textContent='⏳ Откатываю…';
  try{const r=await fetch(`${API}/admin/update/rollback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});_admUpdResult(await r.json(),out);}catch(e){out.textContent='Ошибка: '+e.message;}
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


// ── 🩺 Проверка базы: целостность SQLite и битые ссылки (routes/health.js) ──
async function _admRenderDb(run){
  const b=document.getElementById('adm-body');if(!b)return;
  b.innerHTML='<div class="empty">⏳ Проверяю…</div>';
  let r;try{r=await fetch(`${API}/admin/dbcheck${run?'?run=1':''}`).then(x=>x.json());}catch(e){b.innerHTML='<div class="empty">Ошибка сети</div>';return;}
  if(r.error){b.innerHTML=`<div class="empty">${esc(r.error)}</div>`;return;}
  const n=(r.issues||[]).reduce((s,x)=>s+x.count,0);
  b.innerHTML=`<div class="adm-db">
    <div class="adm-db-hd ${r.integrity==='ok'&&!n?'ok':'bad'}">${r.integrity==='ok'&&!n?'✅ База в порядке':'⚠️ Есть проблемы'}
      <small>проверено ${r.at?new Date(r.at).toLocaleString('ru-RU'):''}</small>
      <button class="btn bs bxs" onclick="_admRenderDb(true)">🔄 Проверить сейчас</button></div>
    <div class="adm-db-row"><b>Целостность файла SQLite</b><span>${r.integrity==='ok'?'✅ в порядке':'❌ '+esc(r.integrity)}</span></div>
    ${r.integrity!=='ok'?'<div class="vl-hint">Файл базы повреждён: восстановите последнюю резервную копию (💾 Резервные копии) и сообщите разработчику.</div>':''}
    <div class="adm-db-sub">Битые ссылки ${n?`— ${n}`:''}</div>
    ${(r.issues||[]).length?(r.issues||[]).map(x=>`<div class="adm-db-row">
        <div style="flex:1"><b>${esc(x.label)}</b> — <b>${x.count}</b>${x.sample&&x.sample.length?`<div class="vl-hint">${x.sample.map(esc).join(', ')}${x.count>x.sample.length?'…':''}</div>`:''}
          <div class="vl-hint">${x.fix==='delete'?'Исправить: удалить эти записи (их родителя уже нет)':'Исправить: очистить ссылку (запись останется)'}</div></div>
        <button class="btn bs bxs" onclick="_admDbFix(['${x.key}'])">🛠 Исправить</button></div>`).join('')
      +`<button class="btn bp bsm" style="margin-top:8px" onclick="_admDbFix(null)">🛠 Исправить всё (${n})</button>`
      :'<div class="vl-hint">Битых ссылок нет.</div>'}
    <div class="vl-hint" style="margin-top:10px">Проверка идёт сама при каждом запуске сервера. Перед исправлением делается резервная копия базы.</div></div>`;
}
async function _admDbFix(keys){
  if(!await confirmDlg(keys?'Исправить эту проблему? Перед этим сохранится резервная копия базы.':'Исправить все найденные проблемы? Перед этим сохранится резервная копия базы.',{title:'🩺 Проверка базы',okLabel:'Исправить',danger:false}))return;
  const r=await fetch(`${API}/admin/dbcheck/fix`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})}).then(x=>x.json()).catch(()=>({error:'Ошибка сети'}));
  if(r.error){toast(r.error,'err');return;}
  toast(`🛠 Исправлено записей: ${r.fixed} · копия: ${r.backup}`,'ok');
  _admRenderDb();
  try{if(typeof loadAll==='function')loadAll();if(typeof loadPGK==='function')loadPGK();}catch(e){}
}

// ── 🐞 Журнал ошибок: сервер и браузеры пользователей ──
const _ADME={source:'',q:''};
async function _admRenderErrors(){
  const b=document.getElementById('adm-body');if(!b)return;
  const qs=new URLSearchParams();if(_ADME.source)qs.set('source',_ADME.source);if(_ADME.q)qs.set('q',_ADME.q);
  let r;try{r=await fetch(`${API}/admin/errors?${qs}`).then(x=>x.json());}catch(e){b.innerHTML='<div class="empty">Ошибка сети</div>';return;}
  if(r.error){b.innerHTML=`<div class="empty">${esc(r.error)}</div>`;return;}
  const rows=r.rows||[];_ADME.rows=rows;
  b.innerHTML=`<div class="adm-err">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <select onchange="_ADME.source=this.value;_admRenderErrors()" style="width:auto"><option value="">Все</option><option value="server" ${_ADME.source==='server'?'selected':''}>🖥 Сервер</option><option value="client" ${_ADME.source==='client'?'selected':''}>🌐 Браузеры</option></select>
      <input type="search" placeholder="🔍 текст, пользователь, адрес…" value="${escAttr(_ADME.q)}" onchange="_ADME.q=this.value;_admRenderErrors()" style="flex:1;min-width:150px">
      <span style="font-size:11px;color:var(--tx3)">за сутки: <b>${r.last24}</b></span>
      <button class="btn bs bxs" onclick="_admRenderErrors()">🔄</button>
      ${rows.length?'<button class="btn bs bxs" onclick="_admErrCopy()" title="Скопировать все показанные ошибки текстом">📋 Копировать все</button><button class="btn bd bxs" onclick="_admErrClear()">🗑 Очистить</button>':''}
    </div>
    ${rows.length?rows.map((e,i)=>`<div class="adm-err-row" onclick="if(!String(getSelection()))this.classList.toggle('open')">
      <div class="adm-err-hd"><span>${e.source==='server'?'🖥':'🌐'}</span><b>${esc(e.message)}</b>${e.count>1?`<i>×${e.count}</i>`:''}
        <button class="btn bg bxs" onclick="event.stopPropagation();_admErrCopy(${i})" title="Скопировать текст ошибки">📋</button></div>
      <div class="adm-err-meta">${new Date(e.last_at||e.at).toLocaleString('ru-RU')}${e.user_name?' · 👤 '+esc(e.user_name):''}${e.url?' · '+esc(e.url):''}</div>
      ${e.stack?`<pre class="adm-err-st">${esc(e.stack)}</pre>`:''}</div>`).join(''):'<div class="empty">✅ Ошибок нет</div>'}
  </div>`;
}
async function _admErrClear(){
  if(!await confirmDlg('Очистить журнал ошибок?'))return;
  await fetch(`${API}/admin/errors`,{method:'DELETE'});_admRenderErrors();
}

// Админу при запуске: битые ссылки в базе и ошибки за сутки — значок на кнопке 🛡 и сообщение
async function admHealthBadge(){
  if(typeof isAdminClient!=='function'||!isAdminClient())return;
  let db={},er={};
  try{[db,er]=await Promise.all([fetch(`${API}/admin/dbcheck`).then(r=>r.json()),fetch(`${API}/admin/errors`).then(r=>r.json())]);}catch(e){return;}
  const issues=(db.issues||[]).reduce((s,x)=>s+x.count,0)+(db.integrity&&db.integrity!=='ok'?1:0), errs=er.last24||0;
  const btn=document.getElementById('admin-btn');if(!btn)return;
  let b=btn.querySelector('.adm-badge');
  if(issues||errs){if(!b){b=document.createElement('span');b.className='adm-badge';btn.appendChild(b);}b.textContent=issues?'!':errs;
    btn.title=`Администрирование${issues?` · в базе проблем: ${issues}`:''}${errs?` · ошибок за сутки: ${errs}`:''}`;}
  else if(b)b.remove();
  if(issues&&!admHealthBadge._told){admHealthBadge._told=true;
    toast(`🩺 В базе найдены проблемы (${issues}) — 🛡 Администрирование → «Проверка базы»`,'warn');}
}
setTimeout(()=>{admHealthBadge();setInterval(admHealthBadge,600000);},7000);

// текст ошибки (или всех показанных) — в буфер обмена, чтобы переслать разработчику
function _admErrText(e){
  return [`${e.source==='server'?'Сервер':'Браузер'} · ${new Date(e.last_at||e.at).toLocaleString('ru-RU')}${e.count>1?` · ×${e.count}`:''}${e.user_name?` · ${e.user_name}`:''}`,
    e.message, e.url?`Где: ${e.url}`:'', e.agent?`Браузер: ${e.agent}`:'', e.stack||''].filter(Boolean).join('\n');
}
async function _admErrCopy(i){
  const list=_ADME.rows||[]; const txt=(i==null?list:[list[i]]).filter(Boolean).map(_admErrText).join('\n\n────────\n\n');
  if(!txt)return;
  try{await navigator.clipboard.writeText(txt);toast(i==null?`📋 Скопировано ошибок: ${list.length}`:'📋 Текст ошибки скопирован','ok');}
  catch(e){ // без https буфер может быть недоступен — показать текст для ручного копирования
    showModal('📋 Текст ошибки',`<textarea style="width:min(680px,86vw);height:50vh;font-size:11px;font-family:monospace" onfocus="this.select()">${esc(txt)}</textarea>`,[{label:'Закрыть',cls:'bs',fn:()=>{closeModal();openAdminPanel().then(()=>_admSwitch('errors'));}}]);
    setTimeout(()=>{const t=document.querySelector('#mbd textarea');if(t){t.focus();t.select();}},50);
  }
}
