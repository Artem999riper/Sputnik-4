async function loadKam(){
  const list=document.getElementById('kam-site-list');
  list.innerHTML=sites.map(s=>`<div class="pnav-item${s.id===kamSiteId?' on':''}" onclick="selectKamSite('${s.id}')">`
    +`<span class="sdot ${s.status==='active'?'sa':s.status==='paused'?'sp2':'sd'}"></span>${esc(s.name)}</div>`).join('')
    ||'<div style="font-size:11px;color:var(--tx3);padding:8px">Нет объектов</div>';
  if(kamSiteId) await renderKam(kamSiteId);
  else document.getElementById('kam-body').innerHTML='<div class="empty"><div class="empty-i">📋</div>Выберите объект слева</div>';
}
async function selectKamSite(id){
  kamSiteId=id;
  document.querySelectorAll('#kam-site-list .pnav-item').forEach(el=>{
    el.classList.toggle('on',el.textContent.trim()===((sites.find(s=>s.id===id)||{}).name||''));
  });
  // Re-render list to update 'on' class properly
  const list=document.getElementById('kam-site-list');
  list.innerHTML=sites.map(s=>`<div class="pnav-item${s.id===kamSiteId?' on':''}" onclick="selectKamSite('${s.id}')">`
    +`<span class="sdot ${s.status==='active'?'sa':s.status==='paused'?'sp2':'sd'}"></span>${esc(s.name)}</div>`).join('');
  await renderKam(id);
}
async function renderKam(siteId){
  const body=document.getElementById('kam-body');
  body.innerHTML='<div class="empty"><div class="empty-i">⏳</div>Загрузка...</div>';
  let s;
  try{ const r=await fetch(`${API}/sites/${siteId}`); s=await r.json(); }
  catch(e){ body.innerHTML='<div class="empty">Ошибка загрузки</div>'; return; }
  const kameral=s.kameral||[];
  const siteWorkers=(s.bases||[]).flatMap(b=>b.workers||[]);
  body.innerHTML=`<div style="padding:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:6px">
      <div>
        <h2 style="font-size:16px;font-weight:800;margin:0">${esc(s.name)}</h2>
        <div style="font-size:11px;color:var(--tx3)">${esc(s.client||'')}${s.contract_number?' · Договор №'+esc(s.contract_number):''}</div>
      </div>
      <button class="btn bp bsm" onclick="kamAddReport('${siteId}')">＋ Специалист</button>
    </div>
    ${!kameral.length?'<div class="empty"><div class="empty-i">📋</div>Нет камеральных работ</div>':
      kameral.map(k=>`<div style="border:1.5px solid var(--bd);border-radius:8px;padding:10px;margin-bottom:10px;background:var(--s)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${esc(k.specialist_name||'—')}</div>
            <div style="font-size:11px;color:var(--tx2)">${esc(k.specialist_role||'')} · Ревизия: <strong>${esc(k.revision||'Р0')}</strong></div>
            ${k.report_link?`<a href="${esc(k.report_link)}" target="_blank" style="font-size:10px;color:var(--acc)">📁 Папка отчёта</a>`:''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:22px;font-weight:800;color:${k.completion_percent>=100?'var(--grn)':'var(--acc)'}">${k.completion_percent}%</div>
            <div style="font-size:9px;color:var(--tx3)">готовность</div>
          </div>
        </div>
        <div style="height:6px;background:var(--bd);border-radius:3px;margin:8px 0">
          <div style="width:${Math.min(100,k.completion_percent)}%;height:6px;background:${k.completion_percent>=100?'var(--grn)':'var(--acc)'};border-radius:3px"></div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <button class="btn bs bxs" onclick="kamEditReport('${k.id}','${siteId}')">✏️ Изменить</button>
          <button class="btn bp bxs" onclick="kamAddRemark('${k.id}','${siteId}')">＋ Замечание</button>
          <button class="btn bd bxs" onclick="kamDelReport('${k.id}','${siteId}')">🗑</button>
        </div>
        ${(k.remarks||[]).length?`<div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:4px">ЗАМЕЧАНИЯ (${(k.remarks||[]).filter(r=>r.status==='open').length} откр. / ${(k.remarks||[]).filter(r=>r.status==='closed').length} закр.)</div>
        ${(k.remarks||[]).map(r=>`<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd);font-size:11px">
          <button onclick="kamToggleRemark('${r.id}','${siteId}')" style="background:none;border:none;cursor:pointer;font-size:14px;flex-shrink:0;padding:0">${r.status==='closed'?'✅':'⬜'}</button>
          <div style="flex:1;${r.status==='closed'?'text-decoration:line-through;color:var(--tx3)':''}">${esc(r.text)}${r.link?` <a href="${esc(r.link)}" target="_blank" style="color:var(--acc);font-size:9px">🔗</a>`:''}</div>
          <button onclick="kamDelRemark('${r.id}','${siteId}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px;flex-shrink:0">✕</button>
        </div>`).join('')}`:'<div style="font-size:11px;color:var(--grn)">✓ Нет замечаний</div>'}
      </div>`).join('')}
  </div>`;
}
async function kamAddReport(siteId){
  const wNames=(sites.find(s=>s.id===siteId)?.bases||[]).flatMap(b=>b.workers||[]).map(w=>w.name);
  showModal('＋ Камеральный специалист',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-kn" placeholder="Иванов И.И." list="kam-workers-dl">
      <datalist id="kam-workers-dl">${wNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="fg s2"><label>Должность</label><input id="f-kr" placeholder="Инженер-геолог"></div>
    <div class="fg"><label>Ревизия</label><select id="f-krev"><option>Р0</option><option>Р1</option><option>Р2</option><option>Р3</option></select></div>
    <div class="fg"><label>Готовность %</label><input id="f-kp" type="number" min="0" max="100" value="0"></div>
    <div class="fg s2"><label>Ссылка на папку отчёта</label><input id="f-kl" placeholder="\\server\path или https://..."></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-knt" rows="2"></textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const name=document.getElementById('f-kn').value.trim();if(!name){toast('Введите ФИО','err');return;}
    await fetch(`${API}/sites/${siteId}/kameral`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({specialist_name:name,specialist_role:document.getElementById('f-kr').value,
        revision:document.getElementById('f-krev').value,completion_percent:parseInt(document.getElementById('f-kp').value)||0,
        report_link:document.getElementById('f-kl').value,notes:document.getElementById('f-knt').value,user_name:un()})});
    closeModal();await renderKam(siteId);toast('Специалист добавлен','ok');
  }}]);
}
async function kamEditReport(id,siteId){
  // Fetch current site data to get report
  const s=await fetch(`${API}/sites/${siteId}`).then(r=>r.json()).catch(()=>null);if(!s)return;
  const k=(s.kameral||[]).find(x=>x.id===id);if(!k)return;
  showModal('✏️ Камеральный специалист',`<div class="fgr">
    <div class="fg s2"><label>ФИО *</label><input id="f-kn" value="${esc(k.specialist_name||'')}"></div>
    <div class="fg s2"><label>Должность</label><input id="f-kr" value="${esc(k.specialist_role||'')}"></div>
    <div class="fg"><label>Ревизия</label><select id="f-krev"><option${k.revision==='Р0'?' selected':''}>Р0</option><option${k.revision==='Р1'?' selected':''}>Р1</option><option${k.revision==='Р2'?' selected':''}>Р2</option><option${k.revision==='Р3'?' selected':''}>Р3</option></select></div>
    <div class="fg"><label>Готовность %</label><input id="f-kp" type="number" min="0" max="100" value="${k.completion_percent||0}"></div>
    <div class="fg s2"><label>Ссылка на папку отчёта</label><input id="f-kl" value="${esc(k.report_link||'')}"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-knt" rows="2">${esc(k.notes||'')}</textarea></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Сохранить',cls:'bp',fn:async()=>{
    const name=document.getElementById('f-kn').value.trim();if(!name){toast('Введите ФИО','err');return;}
    await fetch(`${API}/kameral/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({specialist_name:name,specialist_role:document.getElementById('f-kr').value,
        revision:document.getElementById('f-krev').value,completion_percent:parseInt(document.getElementById('f-kp').value)||0,
        report_link:document.getElementById('f-kl').value,notes:document.getElementById('f-knt').value,
        site_id:siteId,user_name:un()})});
    closeModal();await renderKam(siteId);toast('Обновлено','ok');
  }}]);
}
async function kamDelReport(id,siteId){
  if(!confirm('Удалить специалиста и все его замечания?'))return;
  await apiDelUndo(`/kameral/${id}`,'Камеральщик удалён',()=>renderKam(siteId));
}
async function kamAddRemark(reportId,siteId){
  showModal('＋ Замечание',`<div class="fgr">
    <div class="fg s2"><label>Текст замечания *</label><textarea id="f-rt" rows="3" placeholder="Описание замечания..."></textarea></div>
    <div class="fg s2"><label>Ссылка</label><input id="f-rl" placeholder="https://... или \\путь"></div>
  </div>`,[{label:'Отмена',cls:'bs',fn:closeModal},{label:'Добавить',cls:'bp',fn:async()=>{
    const text=document.getElementById('f-rt').value.trim();if(!text){toast('Введите текст','err');return;}
    await fetch(`${API}/kameral/${reportId}/remarks`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text,link:document.getElementById('f-rl').value,user_name:un()})});
    closeModal();await renderKam(siteId);toast('Замечание добавлено','ok');
  }}]);
}
async function kamToggleRemark(id,siteId){
  // Get current status from DOM — find button that called this
  const s=await fetch(`${API}/sites/${siteId}`).then(r=>r.json()).catch(()=>null);if(!s)return;
  const r=(s.kameral||[]).flatMap(k=>k.remarks||[]).find(x=>x.id===id);if(!r)return;
  await fetch(`${API}/remarks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:r.text,link:r.link||'',status:r.status==='closed'?'open':'closed'})});
  await renderKam(siteId);
}
async function kamDelRemark(id,siteId){
  await apiDelUndo(`/remarks/${id}`,'Замечание удалено',()=>renderKam(siteId));
}

let CTX_ACTIONS=[];

// ── Ruler (measure tool) ────────────────────────────────────
let rulerActive=false, rulerPts=[], rulerLayer=null, rulerLabels=[];
function startRuler(){
  rulerActive=true; rulerPts=[]; _rulerClear();
  map.getContainer().style.cursor='crosshair';
  toast('📏 Линейка: кликайте · ПКМ — меню · Z — отменить точку','ok');
  map.on('click',_rulerClick);
}
function _rulerClick(e){
  rulerPts.push(e.latlng);
  _rulerDraw();
}
function rulerUndoLast(){
  if(!rulerPts.length)return;
  rulerPts.pop();
  _rulerDraw();
  if(!rulerPts.length) toast('📏 Все точки удалены','ok');
}
function _rulerClear(){
  if(rulerLayer){try{map.removeLayer(rulerLayer);}catch(x){}}
  rulerLabels.forEach(function(l){try{map.removeLayer(l);}catch(x){}});
  rulerLayer=null; rulerLabels=[];
}
function _rulerDraw(){
  _rulerClear();
  if(rulerPts.length<1)return;
  if(rulerPts.length>=2){
    rulerLayer=L.polyline(rulerPts,{color:'#e11d48',weight:2.5,dashArray:'6 4',opacity:.9}).addTo(map);
  }
  let total=0;
  rulerPts.forEach(function(pt,i){
    if(i>0){
      const seg=rulerPts[i-1].distanceTo(pt);
      total+=seg;
      const mid=L.latLng((rulerPts[i-1].lat+pt.lat)/2,(rulerPts[i-1].lng+pt.lng)/2);
      const txt=_fmtDist(seg);
      const lbl=L.marker(mid,{icon:L.divIcon({
        className:'',
        html:'<div style="background:rgba(225,29,72,.9);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);transform:translate(-50%,-50%)">'+txt+'</div>',
        iconSize:[0,0],iconAnchor:[0,0]
      })}).addTo(map);
      rulerLabels.push(lbl);
    }
    const dot=L.circleMarker(pt,{radius:5,fillColor:'#e11d48',color:'#fff',weight:2,fillOpacity:1}).addTo(map);
    rulerLabels.push(dot);
  });
  if(rulerPts.length>=2){
    const last=rulerPts[rulerPts.length-1];
    const txt='Итого: '+_fmtDist(total);
    const tot=L.marker(last,{icon:L.divIcon({
      className:'',
      html:'<div style="background:#1a56db;color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:translate(-50%,-130%)">'+txt+'</div>',
      iconSize:[0,0],iconAnchor:[0,0]
    })}).addTo(map);
    rulerLabels.push(tot);
  }
}
function _fmtDist(m){return m>=1000?(m/1000).toFixed(2)+' км':Math.round(m)+' м';}
function stopRuler(){
  rulerActive=false;
  map.off('click',_rulerClick);
  map.getContainer().style.cursor='';
  if(rulerPts.length>=2){
    toast('📏 Готово. ESC — убрать линейку','ok');
  } else {
    _rulerClear(); rulerPts=[];
  }
}
function clearRuler(){_rulerClear();rulerPts=[];rulerActive=false;map.off('click',_rulerClick);map.getContainer().style.cursor='';}

const un=()=>document.getElementById('unm').value.trim()||'Пользователь';
const v=id=>{const e=document.getElementById(id);return e?e.value:''};
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr=s=>esc(s).replace(/\\/g,'&#92;');
const fmt=d=>{if(!d||d==='')return'—';try{const p=d.split('-');return`${p[2]}.${p[1]}.${p[0]}`;}catch{return d;}};
const fmtDT=dt=>{if(!dt)return'';try{const d=new Date(dt.includes('Z')?dt:dt+'Z');return d.toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return dt;}};

// ═══════════════════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════════════════
