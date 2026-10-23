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
  if(!await confirmDlg('Удалить специалиста и все его замечания?'))return;
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

// ── Геодезические замеры (эллипсоид WGS-84) ─────────────────
// Длина — обратная задача Винсенти; площадь — в равновеликой азимутальной
// проекции Ламберта с центром в центре фигуры (погрешность ≪ 0.1 %).
function _geoDist(a,b){
  const A=6378137,F=1/298.257223563,B=A*(1-F),rad=Math.PI/180;
  const L=(b.lng-a.lng)*rad,U1=Math.atan((1-F)*Math.tan(a.lat*rad)),U2=Math.atan((1-F)*Math.tan(b.lat*rad));
  const sU1=Math.sin(U1),cU1=Math.cos(U1),sU2=Math.sin(U2),cU2=Math.cos(U2);
  let lam=L,it=0,sS,cS,sig,sA,c2A,c2Sm;
  do{
    const sl=Math.sin(lam),cl=Math.cos(lam);
    sS=Math.sqrt((cU2*sl)**2+(cU1*sU2-sU1*cU2*cl)**2);
    if(sS===0)return 0;
    cS=sU1*sU2+cU1*cU2*cl;sig=Math.atan2(sS,cS);sA=cU1*cU2*sl/sS;c2A=1-sA*sA;
    c2Sm=c2A?cS-2*sU1*sU2/c2A:0;
    const C=F/16*c2A*(4+F*(4-3*c2A)),lp=lam;
    lam=L+(1-C)*F*sA*(sig+C*sS*(c2Sm+C*cS*(-1+2*c2Sm*c2Sm)));
    if(Math.abs(lam-lp)<1e-12)break;
  }while(++it<200);
  if(it>=200)return a.distanceTo?a.distanceTo(b):0;   // почти антиподы — сфера
  const u2=c2A*(A*A-B*B)/(B*B),Ak=1+u2/16384*(4096+u2*(-768+u2*(320-175*u2))),Bk=u2/1024*(256+u2*(-128+u2*(74-47*u2)));
  const dS=Bk*sS*(c2Sm+Bk/4*(cS*(-1+2*c2Sm*c2Sm)-Bk/6*c2Sm*(-3+4*sS*sS)*(-3+4*c2Sm*c2Sm)));
  return B*Ak*(sig-dS);
}
function _geoLength(pts){let s=0;for(let i=1;i<pts.length;i++)s+=_geoDist(pts[i-1],pts[i]);return s;}
function _geoArea(pts){
  // Равновеликая азимутальная проекция Ламберта на эллипсоиде (Snyder, 1987, §24)
  if(!pts||pts.length<3)return 0;
  const A=6378137,F=1/298.257223563,e2=F*(2-F),e=Math.sqrt(e2),rad=Math.PI/180;
  const q=ph=>{const s=Math.sin(ph);return (1-e2)*(s/(1-e2*s*s)-1/(2*e)*Math.log((1-e*s)/(1+e*s)));};
  const qp=q(Math.PI/2),Rq=A*Math.sqrt(qp/2);
  const lat0=pts.reduce((s,p)=>s+p.lat,0)/pts.length*rad,lon0=pts.reduce((s,p)=>s+p.lng,0)/pts.length*rad;
  const b1=Math.asin(q(lat0)/qp),m1=Math.cos(lat0)/Math.sqrt(1-e2*Math.sin(lat0)**2),D=A*m1/(Rq*Math.cos(b1));
  const xy=pts.map(p=>{
    const b=Math.asin(Math.max(-1,Math.min(1,q(p.lat*rad)/qp))),dl=p.lng*rad-lon0;
    const Bk=Rq*Math.sqrt(2/(1+Math.sin(b1)*Math.sin(b)+Math.cos(b1)*Math.cos(b)*Math.cos(dl)));
    return [Bk*D*Math.cos(b)*Math.sin(dl),(Bk/D)*(Math.cos(b1)*Math.sin(b)-Math.sin(b1)*Math.cos(b)*Math.cos(dl))];
  });
  let s=0;for(let i=0;i<xy.length;i++){const j=(i+1)%xy.length;s+=xy[i][0]*xy[j][1]-xy[j][0]*xy[i][1];}
  return Math.abs(s)/2;
}
function _fmtArea(m2){
  if(m2>=1e6)return (m2/1e6).toFixed(3)+' км²';
  if(m2>=1e4)return (m2/1e4).toFixed(3)+' га';
  return m2.toFixed(1)+' м²';
}
function _fmtAreaFull(m2){return `${m2.toFixed(1)} м² · ${(m2/1e4).toFixed(4)} га · ${(m2/1e6).toFixed(6)} км²`;}

// ── Ruler (measure tool) ────────────────────────────────────
// rulerMode: 'line' — расстояние по ломаной; 'area' — замкнутый контур: периметр + площадь
let rulerActive=false, rulerPts=[], rulerLayer=null, rulerLabels=[], rulerMode='line';
function startRuler(mode){
  rulerMode=mode==='area'?'area':'line';
  rulerActive=true; rulerPts=[]; _rulerClear();
  map.getContainer().style.cursor='crosshair';
  toast(rulerMode==='area'
    ?'📐 Площадь: кликайте вершины контура (привязка к KML) · ПКМ — меню · Z — отменить'
    :'📏 Линейка: кликайте (привязка к KML) · ПКМ — меню · Z — отменить','ok');
  map.on('click',_rulerClick);
}
function _rulerClick(e){
  _rulerAddPoint(e.latlng);
}
// Добавляет точку линейки с привязкой к вершинам/точкам KML (радиус 14px).
// exactLatLng — если задан (клик прямо по объекту KML), используется как есть.
function _rulerAddPoint(latlng, exactLatLng){
  let ll=latlng;
  if(exactLatLng){
    ll=exactLatLng;
    toast('📌 Привязано к объекту KML','ok');
  } else if(typeof _snapToKml==='function'){
    const s=_snapToKml(latlng,14);
    if(s&&s.snapped){ll=L.latLng(s.lat,s.lng);toast(s.name?'📌 '+s.name:'📌 Привязано к KML','ok');}
  }
  rulerPts.push(ll);
  _rulerDraw();
}
function rulerUndoLast(){
  if(!rulerPts.length)return;
  rulerPts.pop();
  _rulerDraw();
  if(!rulerPts.length) toast('📏 Все точки удалены','ok');
}
let rulerDots=[];
function _rulerClear(){
  if(rulerLayer){try{map.removeLayer(rulerLayer);}catch(x){}}
  rulerLabels.forEach(function(l){try{map.removeLayer(l);}catch(x){}});
  rulerDots.forEach(function(d){try{map.removeLayer(d);}catch(x){}});
  rulerLayer=null; rulerLabels=[]; rulerDots=[];
}
// Линия и подписи расстояний (вершины не трогает — их можно тащить)
function _rulerDrawLines(){
  if(rulerLayer){try{map.removeLayer(rulerLayer);}catch(x){}rulerLayer=null;}
  rulerLabels.forEach(function(l){try{map.removeLayer(l);}catch(x){}});
  rulerLabels=[];
  const isArea=rulerMode==='area'&&rulerPts.length>=3;
  if(rulerPts.length>=2){
    rulerLayer=isArea
      ?L.polygon(rulerPts,{color:'#e11d48',weight:2.5,dashArray:'6 4',opacity:.9,fillColor:'#e11d48',fillOpacity:.12,interactive:false}).addTo(map)
      :L.polyline(rulerPts,{color:'#e11d48',weight:2.5,dashArray:'6 4',opacity:.9,interactive:false}).addTo(map);
  }
  let total=0;
  const segPts=isArea?[...rulerPts,rulerPts[0]]:rulerPts;   // в режиме площади — с замыкающей стороной
  segPts.forEach(function(pt,i){
    if(i>0){
      const seg=_geoDist(segPts[i-1],pt);
      total+=seg;
      const mid=L.latLng((segPts[i-1].lat+pt.lat)/2,(segPts[i-1].lng+pt.lng)/2);
      const txt=_fmtDist(seg);
      const lbl=L.marker(mid,{interactive:false,icon:L.divIcon({
        className:'',
        html:'<div style="background:rgba(225,29,72,.9);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);transform:translate(-50%,-50%)">'+txt+'</div>',
        iconSize:[0,0],iconAnchor:[0,0]
      })}).addTo(map);
      rulerLabels.push(lbl);
    }
  });
  if(rulerPts.length>=2){
    const last=isArea?L.polygon(rulerPts).getBounds().getCenter():rulerPts[rulerPts.length-1];
    const txt=isArea?`Периметр: ${_fmtDist(total)}<br>Площадь: ${_fmtArea(_geoArea(rulerPts))}`:'Итого: '+_fmtDist(total);
    const tot=L.marker(last,{interactive:false,icon:L.divIcon({
      className:'',
      html:'<div style="background:#1a56db;color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:translate(-50%,-130%)">'+txt+'</div>',
      iconSize:[0,0],iconAnchor:[0,0]
    })}).addTo(map);
    rulerLabels.push(tot);
  }
}
function _rulerDraw(){
  _rulerClear();
  if(rulerPts.length<1)return;
  _rulerDrawLines();
  // Вершины — перетаскиваемые маркеры: тянешь точку, расстояния пересчитываются
  rulerPts.forEach(function(pt,i){
    const mk=L.marker(pt,{draggable:true,icon:L.divIcon({
      className:'',iconSize:[16,16],iconAnchor:[8,8],
      html:'<div style="width:16px;height:16px;border-radius:50%;background:#e11d48;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab;box-sizing:border-box"></div>'
    })});
    mk._ri=i;
    mk.on('drag',function(){rulerPts[this._ri]=this.getLatLng();_rulerDrawLines();});
    mk.addTo(map);
    rulerDots.push(mk);
  });
}
function _fmtDist(m){return m>=1000?(m/1000).toFixed(3)+' км':(m>=100?m.toFixed(1):m.toFixed(2))+' м';}
// Итог замера в окне (с копированием)
function rulerShowResult(){
  if(rulerPts.length<2)return;
  const isArea=rulerMode==='area'&&rulerPts.length>=3;
  const len=_geoLength(isArea?[...rulerPts,rulerPts[0]]:rulerPts);
  _measureModal(isArea?'📐 Замер площади':'📏 Замер расстояния',len,isArea?_geoArea(rulerPts):null,rulerPts.length);
}
function _measureModal(title,len,area,n){
  const txt=area!=null?`Периметр: ${len.toFixed(2)} м\nПлощадь: ${area.toFixed(1)} м² (${(area/1e4).toFixed(4)} га)`:`Длина: ${len.toFixed(2)} м`;
  showModal(title,`<div style="font-size:13px;line-height:1.9">
    ${area!=null?`<div>Периметр: <b>${len.toFixed(2)} м</b> <span style="color:var(--tx3)">(${(len/1000).toFixed(4)} км)</span></div>
      <div>Площадь: <b>${_fmtAreaFull(area)}</b></div>`
      :`<div>Длина: <b>${len.toFixed(2)} м</b> <span style="color:var(--tx3)">(${(len/1000).toFixed(4)} км)</span></div>`}
    <div style="color:var(--tx3);font-size:11px">Вершин: ${n} · расчёт на эллипсоиде WGS-84</div></div>`,
    [{label:'📋 Копировать',cls:'bs',fn:()=>{navigator.clipboard.writeText(txt).then(()=>toast('Скопировано','ok')).catch(()=>{});}},{label:'Закрыть',cls:'bp',fn:closeModal}]);
}
// Длина / периметр / площадь объекта KML (GeoJSON-геометрия)
function measureGeometry(geom,name){
  if(!geom)return;
  const ll=c=>L.latLng(c[1],c[0]);
  let len=0,area=null,n=0;
  const ring=r=>{const p=r.map(ll);if(p.length>1&&p[0].equals(p[p.length-1]))p.pop();return p;};
  const t=geom.type,c=geom.coordinates;
  if(t==='LineString'){const p=c.map(ll);len=_geoLength(p);n=p.length;}
  else if(t==='MultiLineString'){c.forEach(l=>{const p=l.map(ll);len+=_geoLength(p);n+=p.length;});}
  else if(t==='Polygon'||t==='MultiPolygon'){
    area=0;(t==='Polygon'?[c]:c).forEach(poly=>poly.forEach((r,ri)=>{
      const p=ring(r);n+=p.length;len+=_geoLength([...p,p[0]]);
      const a=_geoArea(p);area+=ri===0?a:-a;   // внутренние кольца (дыры) вычитаем
    }));
  } else {toast('Для точки длина и площадь не считаются','warn');return;}
  _measureModal('📐 '+(name||'Объект'),len,area,n);
}
function stopRuler(){
  rulerActive=false;
  map.off('click',_rulerClick);
  map.getContainer().style.cursor='';
  if(rulerPts.length>=2){
    toast((rulerMode==='area'?'📐':'📏')+' Готово. ПКМ — итог, ESC — убрать замер','ok');
  } else {
    _rulerClear(); rulerPts=[];
  }
}
function clearRuler(){_rulerClear();rulerPts=[];rulerActive=false;map.off('click',_rulerClick);map.getContainer().style.cursor='';}

// ═══════════════════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════════════════
