// ═══════════════════════════════════════════════════════════
// СМГ v2 — Суточно-месячный график
// Порт React-прототипа в vanilla JS
// ═══════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────
let _smgSelected   = null;   // {volId, day, row:'fact'|'plan'}
let _smgEditing    = null;   // {volId, day, row, td}
let _smgClipboard  = null;   // number
let _smgDrag       = null;   // {volId, startDay, value, currentDay}
let _smgZoom       = 1.0;
let _smgSearch     = '';
let _smgFilter     = 'all';  // all | behind | done | nodata
let _smgShiftStart = '';     // YYYY-MM-DD — start of shift cycle

// Re-export aliases for compatibility

const SMG_COLORS = [
  {v:'',      l:'— Без цвета',    bg:'transparent'},
  {v:'#dcfce7',l:'🟢 Выполнено',  bg:'#dcfce7'},
  {v:'#fee2e2',l:'🔴 Проблема',   bg:'#fee2e2'},
  {v:'#fef3c7',l:'🟡 В работе',   bg:'#fef3c7'},
  {v:'#dbeafe',l:'🔵 Запланировано',bg:'#dbeafe'},
  {v:'#ede9fe',l:'🟣 Актировано', bg:'#ede9fe'},
  {v:'#fed7aa',l:'🟠 Остановка',  bg:'#fed7aa'},
];

const SMG_DOWS = ['вс','пн','вт','ср','чт','пт','сб'];
const SMG_CAT  = {
  geology: {label:'Геология', icon:'⛏', color:'#059669'},
  geodesy: {label:'Геодезия', icon:'📐', color:'#0369a1'},
};

// ── Helpers ───────────────────────────────────────────────────
function smgDaysInMonth(){return new Date(smgYear,smgMonth+1,0).getDate();}
function smgDateStr(d){return smgYear+'-'+String(smgMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function smgIsToday(d){const t=new Date();return t.getFullYear()===smgYear&&t.getMonth()===smgMonth&&t.getDate()===d;}

// Вахтовый цикл 4+1 — старт цикла = plan_start объёма (или 1-е число месяца)
function smgIsShiftOffForVol(vol, d){
  const cycleStart = vol.plan_start || smgDateStr(1);
  const cur = new Date(smgYear, smgMonth, d);
  const start = new Date(cycleStart + 'T00:00:00');
  const diff = Math.floor((cur - start) / 86400000);
  if(diff < 0) return false;
  return diff % 5 === 4;
}
// Global fallback (used for header rendering)
function smgIsShiftOff(d){
  const cycleStart = _smgShiftStart || smgDateStr(1);
  const cur = new Date(smgYear, smgMonth, d);
  const start = new Date(cycleStart + 'T00:00:00');
  const diff = Math.floor((cur - start) / 86400000);
  if(diff < 0) return false;
  return diff % 5 === 4;
}

function smgGetPlanDays(vol){
  const days=smgDaysInMonth();
  const res=[];
  for(let d=1;d<=days;d++){
    const ds=smgDateStr(d);
    if(vol.plan_start&&ds<vol.plan_start)continue;
    if(vol.plan_end&&ds>vol.plan_end)continue;
    if(!smgIsShiftOffForVol(vol,d))res.push(d);
  }
  return res;
}

// All working (non-shift) plan dates across the full plan range as YYYY-MM-DD strings
function smgAllPlanDateStrs(vol){
  if(!vol.plan_start||!vol.plan_end)return smgGetPlanDays(vol).map(d=>smgDateStr(d));
  const res=[];
  const cur=new Date(vol.plan_start);
  const end=new Date(vol.plan_end);
  const cycleStart=new Date(vol.plan_start);
  while(cur<=end){
    const diff=Math.round((cur-cycleStart)/86400000);
    if(diff%5!==4)res.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate()+1);
  }
  return res;
}

function smgCalcAutoPlan(vol){
  if(!vol.plan_start&&!vol.plan_end)return {};
  if(!vol.amount)return {};
  const allDates=smgAllPlanDateStrs(vol);
  if(!allDates.length)return {};
  const perDay=vol.amount/allDates.length;
  const pfx=smgYear+'-'+String(smgMonth+1).padStart(2,'0')+'-';
  const map={};
  allDates.forEach(ds=>{if(ds.startsWith(pfx))map[ds]=Math.round(perDay);});
  return map;
}

function smgGetManualPlan(prog,volId){
  const map={};
  (prog||[]).filter(p=>p.volume_id===volId&&p.row_type==='plan').forEach(p=>{
    map[p.work_date]=(map[p.work_date]||0)+(+p.completed||0);
  });
  return map;
}

function smgEffectivePlan(vol,prog){
  // Collect ALL manual plan entries across all months
  const allManual={};
  (prog||[]).filter(p=>p.volume_id===vol.id&&p.row_type==='plan').forEach(p=>{
    allManual[p.work_date]=(allManual[p.work_date]||0)+(+p.completed||0);
  });
  const result={};
  const days=smgDaysInMonth();
  if(Object.keys(allManual).length>0){
    // Redistribute remaining amount across non-manual auto days
    const allDates=smgAllPlanDateStrs(vol);
    const autoDatesSet=new Set(allDates.filter(ds=>!Object.prototype.hasOwnProperty.call(allManual,ds)));
    const manualTotal=Object.values(allManual).reduce((a,v)=>a+v,0);
    const autoAmount=Math.max(0,vol.amount-manualTotal);
    const perAutoDay=autoDatesSet.size>0?autoAmount/autoDatesSet.size:0;
    for(let d=1;d<=days;d++){
      const ds=smgDateStr(d);
      if(Object.prototype.hasOwnProperty.call(allManual,ds))result[ds]=allManual[ds];
      else if(autoDatesSet.has(ds))result[ds]=Math.round(perAutoDay);
      else result[ds]=0;
    }
  }else{
    const auto=smgCalcAutoPlan(vol);
    for(let d=1;d<=days;d++){const ds=smgDateStr(d);result[ds]=auto[ds]||0;}
  }
  return result;
}

// ── Sparkline SVG ─────────────────────────────────────────────
function smgSparkline(points,color){
  if(!points.length)return '';
  const max=Math.max(...points,1);
  const w=76,h=14;
  const step=w/(points.length-1||1);
  const path=points.map((v,i)=>`${i===0?'M':'L'} ${(i*step).toFixed(1)} ${(h-(v/max)*h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" style="overflow:visible;flex-shrink:0">
    <path d="${path}" fill="none" stroke="${color}" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ── Main load/render ──────────────────────────────────────────
async function loadSMG(){
  if(!_smgShiftStart){
    _smgShiftStart=smgYear+'-'+String(smgMonth+1).padStart(2,'0')+'-01';
  }
  // If sites is empty, fetch them
  if(!sites||!sites.length){
    try{
      const r=await fetch(API+'/sites');
      if(r.ok)sites=await r.json();
    }catch(e){}
  }
  // Init toolbar on first load (or repair if sel is missing)
  const tb=document.querySelector('.smg-toolbar');
  const hasExtraClass=tb&&tb.classList.contains('smg-toolbar-extra');
  if(!hasExtraClass){
    smgToolbarInit();
  } else {
    smgUpdateToolbar();
  }
  // Always refresh site list — find the select fresh from DOM
  smgRefreshSiteList();
  if(smgSiteId)await smgLoadAndRender();
  else document.getElementById('smg-body').innerHTML='<div class="empty"><div class="empty-i">📅</div>Выберите объект</div>';
}

function smgRefreshSiteList(){
  const sel=document.getElementById('smg-site-sel');
  if(!sel)return;
  const list=sites||[];
  sel.innerHTML='<option value="">— Выберите объект —</option>'
    +list.map(s=>'<option value="'+s.id+'"'+(s.id===smgSiteId?' selected':'')+'>'+esc(s.name)+'</option>').join('');
}

async function smgSelectSite(id){
  smgSiteId=id||null;smgSiteData=null;
  smgUpdateToolbar();
  if(smgSiteId)await smgLoadAndRender();
  else document.getElementById('smg-body').innerHTML='<div class="empty"><div class="empty-i">📅</div>Выберите объект</div>';
}

async function smgLoadAndRender(){
  if(!smgSiteId)return;
  document.getElementById('smg-body').innerHTML='<div class="empty"><div class="empty-i">⏳</div>Загрузка...</div>';
  try{
    const r=await fetch(API+'/sites/'+smgSiteId);
    smgSiteData=await r.json();
  }catch(e){document.getElementById('smg-body').innerHTML='<div class="empty">Ошибка загрузки</div>';return;}
  smgRender();
}

function smgPrevMonth(){
  smgMonth--;if(smgMonth<0){smgMonth=11;smgYear--;}
  smgUpdateToolbar();smgRender();
}
function smgNextMonth(){
  smgMonth++;if(smgMonth>11){smgMonth=0;smgYear++;}
  smgUpdateToolbar();smgRender();
}

function smgUpdateToolbar(){
  const lbl=document.getElementById('smg-month-lbl');
  if(lbl)lbl.textContent=SMG_MONTHS[smgMonth]+' '+smgYear;
  const si=document.getElementById('smg-shift-input');
  if(si)si.value=_smgShiftStart;
  const srch=document.getElementById('smg-search-inp');
  if(srch)srch.value=_smgSearch;
  const flt=document.getElementById('smg-filter-sel');
  if(flt)flt.value=_smgFilter;
  const zl=document.getElementById('smg-zoom-lbl');
  if(zl)zl.textContent=Math.round(_smgZoom*100)+'%';
}

// ── Render ────────────────────────────────────────────────────
function smgRender(){
  if(!smgSiteData){smgLoadAndRender();return;}
  const days=smgDaysInMonth();
  const vols=smgSiteData.volumes||[];
  const prog=smgSiteData.vol_progress||[];
  const today=new Date().toISOString().split('T')[0];
  const todayDayNum=new Date().getFullYear()===smgYear&&new Date().getMonth()===smgMonth?new Date().getDate():null;

  if(!vols.length){
    document.getElementById('smg-body').innerHTML='<div class="empty"><div class="empty-i">📊</div>Нет объёмов. Добавьте объёмы во вкладке «Объёмы»</div>';
    return;
  }

  // Filter volumes
  const filteredVols=vols.filter(vol=>{
    if(_smgSearch&&!vol.name.toLowerCase().includes(_smgSearch.toLowerCase()))return false;
    if(_smgFilter==='all')return true;
    const totalFact=prog.filter(p=>p.volume_id===vol.id&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);
    if(_smgFilter==='done')return vol.amount>0&&totalFact>=vol.amount;
    if(_smgFilter==='nodata')return totalFact===0;
    if(_smgFilter==='behind'){
      const plan=smgEffectivePlan(vol,prog);
      let pT=0,fT=0;
      for(let d=1;d<=days;d++){const ds=smgDateStr(d);if(ds>today)break;pT+=(plan[ds]||0);fT+=prog.filter(p=>p.volume_id===vol.id&&p.work_date===ds&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);}
      return fT<pT;
    }
    return true;
  });

  // Stats
  let behindCount=0,doneCount=0;
  vols.forEach(vol=>{
    const totalFact=prog.filter(p=>p.volume_id===vol.id&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);
    if(vol.amount>0&&totalFact>=vol.amount)doneCount++;
    const plan=smgEffectivePlan(vol,prog);
    let pT=0,fT=0;
    for(let d=1;d<=days;d++){const ds=smgDateStr(d);if(ds>today)break;pT+=(plan[ds]||0);fT+=prog.filter(p=>p.volume_id===vol.id&&p.work_date===ds&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);}
    if(fT<pT*0.9)behindCount++;
  });

  const cellW=Math.round(32*_smgZoom);
  const cellH=Math.round(26*_smgZoom);
  const planH=Math.round(23*_smgZoom);
  const rowHdW=240;
  const typeW=22;
  const fs=Math.round(11*_smgZoom);

  // ── Status bar HTML
  const statusBar=`
  <div class="smg-status-bar">
    <div class="smg-leg-item"><span class="smg-leg-dot" style="background:#dcfce7;border:1px solid #86efac"></span>Опережение</div>
    <div class="smg-leg-item"><span class="smg-leg-dot" style="background:#fef3c7;border:1px solid #fcd34d"></span>По плану</div>
    <div class="smg-leg-item"><span class="smg-leg-dot" style="background:#fee2e2;border:1px solid #fca5a5"></span>Отставание</div>
    <div class="smg-leg-item"><span class="smg-leg-dot" style="background:#f5f5f5;border:1px solid #d4d4d4"></span>Выходной вахты</div>
    <div class="smg-leg-item"><span class="smg-leg-dot" style="background:#fed7aa;border:1px solid #fb923c"></span>Актировано (пропуск)</div>
    <div class="smg-stat ${behindCount>0?'smg-stat-warn':''}">
      <span class="smg-stat-ico">⚠</span>
      <strong>${behindCount}</strong> отстают
    </div>
    <div class="smg-stat ${doneCount>0?'smg-stat-ok':''}">
      <span class="smg-stat-ico">✓</span>
      <strong>${doneCount}</strong> завершены
    </div>
    <div class="smg-hint">↑↓←→ навигация · Enter редактировать · Ctrl+C/V копировать · Тянуть ячейку = заполнить диапазон</div>
  </div>`;

  // ── Table head
  let thead=`<tr>
    <th class="smg-hd-name" style="width:${rowHdW}px;min-width:${rowHdW}px;position:sticky;left:0;top:0;z-index:22">Вид работ</th>
    <th class="smg-hd-type" style="width:${typeW}px;min-width:${typeW}px;position:sticky;left:${rowHdW}px;top:0;z-index:21"></th>`;
  for(let d=1;d<=days;d++){
    const dt=new Date(smgYear,smgMonth,d);
    const off=smgIsShiftOff(d);
    const tdy=smgIsToday(d);
    thead+=`<th class="smg-hd-day${tdy?' smg-hd-today':''}"
      style="width:${cellW}px;min-width:${cellW}px;top:0;z-index:19" title="${SMG_DOWS[dt.getDay()]} ${d}${off?' (выходной вахты)':''}">
      <div style="font-size:${fs}px;font-weight:700;line-height:1.2">${d}</div>
      <div style="font-size:${Math.round(8*_smgZoom)}px;opacity:.7;line-height:1">${SMG_DOWS[dt.getDay()]}</div>
    </th>`;
  }
  thead+=`<th class="smg-hd-tot" style="min-width:70px;top:0;z-index:19">Факт</th>
    <th class="smg-hd-tot" style="min-width:70px;top:0;z-index:19">План</th>
    <th class="smg-hd-tot" style="min-width:78px;top:0;z-index:19">Общий<br>объём</th>
    <th class="smg-hd-tot" style="min-width:44px;top:0;z-index:19">%</th>
    <th class="smg-hd-tot smg-hd-act" style="min-width:68px;top:0;z-index:19">Акт</th>
    <th class="smg-hd-tot smg-hd-delta" style="min-width:108px;top:0;z-index:19">Δ план</th>
  </tr>`;

  // ── Table body
  let tbody='';
  const cats=['geology','geodesy'];

  cats.forEach(cat=>{
    const catVols=filteredVols.filter(v=>v.category===cat);
    if(!catVols.length)return;
    const meta=SMG_CAT[cat];
    tbody+=`<tr><td colspan="${days+6}" class="smg-cat-row" style="--cat-color:${meta.color}">
      ${meta.icon} ${meta.label.toUpperCase()} <span class="smg-cat-count">(${catVols.length})</span>
    </td></tr>`;

    catVols.forEach(vol=>{
      const plan=smgEffectivePlan(vol,prog);
      const factEntries=prog.filter(p=>p.volume_id===vol.id&&p.row_type!=='plan');
      const factMap={},factMulti={},colorMap={};
      factEntries.forEach(p=>{
        factMap[p.work_date]=(factMap[p.work_date]||0)+(+p.completed||0);
        factMulti[p.work_date]=(factMulti[p.work_date]||0)+1;
        if(p.cell_color)colorMap[p.work_date]=p.cell_color;
      });
      const totalFact=factEntries.reduce((a,p)=>a+(+p.completed||0),0);
      const totalPlan=Object.values(plan).reduce((a,v)=>a+v,0);
      const pct=vol.amount>0?Math.min(100,Math.round(totalFact/vol.amount*100)):0;
      // act = count of days marked as skipped (row_type='act')
      const actEntries=prog.filter(p=>p.volume_id===vol.id&&p.row_type==='act');
      const actDaysSet=new Set(actEntries.map(p=>p.work_date));
      const actCount=actDaysSet.size;

      let pT=0,fT=0;
      const sparkPoints=[];
      for(let d=1;d<=days;d++){
        const ds=smgDateStr(d);
        if(ds<=today){pT+=(plan[ds]||0);fT+=(factMap[ds]||0);}
        sparkPoints.push(factMap[ds]||0);
      }
      const delta=Math.round(fT-pT);
      const deltaHtml=delta===0
        ?'<span style="color:#a3a3a3;font-size:11px">—</span>'
        :delta>0
          ?`<span class="smg-delta-pos">▲ +${delta.toLocaleString('ru-RU')} ${esc(vol.unit)}</span>`
          :`<span class="smg-delta-neg">▼ ${delta.toLocaleString('ru-RU')} ${esc(vol.unit)}</span>`;

      const pctColor=pct>=100?'#059669':pct>=70?'#2563eb':pct>=40?'#d97706':'#dc2626';
      const pbar=`<div style="margin-top:4px;height:3px;background:#e5e5e5;border-radius:2px;overflow:hidden">
        <div style="width:${Math.min(100,pct)}%;height:3px;background:${pctColor};border-radius:2px;transition:width .3s"></div>
      </div>`;

      // Row header (rowspan=2)
      const rowHd=`<td class="smg-row-hd" rowspan="2"
        style="width:${rowHdW}px;min-width:${rowHdW}px;position:sticky;left:0;z-index:8;vertical-align:top">
        <div style="display:flex;align-items:flex-start;gap:6px">
          <div style="margin-top:4px;width:8px;height:8px;border-radius:50%;background:${vol.color||'#1a56db'};flex-shrink:0"></div>
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:600;color:var(--tx);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(vol.name)}">${esc(vol.name)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">
              <span style="font-size:10px;color:var(--tx3)">${vol.amount.toLocaleString('ru-RU')} ${esc(vol.unit)}</span>
              ${smgSparkline(sparkPoints,vol.color||'#1a56db')}
            </div>
            ${pbar}
          </div>
        </div>
      </td>`;

      // ── PLAN ROW ─────────────────────────────────────────────
      const manualPlanMap=smgGetManualPlan(prog,vol.id);
      tbody+=`<tr class="smg-plan-row" data-vol="${vol.id}" data-row="plan">${rowHd}
        <td class="smg-type-cell smg-plan-type" style="position:sticky;left:${rowHdW}px;z-index:7">П</td>`;
      for(let d=1;d<=days;d++){
        const ds=smgDateStr(d);
        const pval=plan[ds]||0;
        const off=smgIsShiftOffForVol(vol,d);
        const tdy=smgIsToday(d);
        const isManual=Object.prototype.hasOwnProperty.call(manualPlanMap,ds);
        const isSel=_smgSelected&&_smgSelected.volId===vol.id&&_smgSelected.day===d&&_smgSelected.row==='plan';
        const pstr=pval.toLocaleString('ru-RU');
        const pfs=pstr.length>4?Math.round(8*_smgZoom):Math.round(10*_smgZoom);
        tbody+=`<td class="smg-cell smg-plan-cell${off?' smg-off':''}${tdy?' smg-today':''}${isManual?' smg-manual':''}${isSel?' smg-selected':''}"
          style="width:${cellW}px;min-width:${cellW}px;height:${planH}px;font-size:${Math.round(10*_smgZoom)}px"
          onclick="smgCellClick(event,'${vol.id}',${d},'plan')"
          ondblclick="smgCellDblClick(event,'${vol.id}',${d},'plan',${pval})"
          oncontextmenu="smgPlanCellCtxMenu(event,'${vol.id}',${d})"
          title="${off?'Выходной вахты':'План: '+(pval||'нет')+' '+esc(vol.unit)+(isManual?' [ручной]':'')}">
          ${pval>0?`<span class="smg-plan-val" style="font-size:${pfs}px">${pstr}</span>`:''}
        </td>`;
      }
      tbody+=`<td class="smg-tot" style="color:#a3a3a3;font-size:10px;text-align:right;padding:2px 6px">—</td>
        <td class="smg-tot" style="font-size:11px;font-weight:600;text-align:right;padding:2px 6px">${Math.round(totalPlan).toLocaleString('ru-RU')}</td>
        <td class="smg-tot" style="font-size:10px;color:var(--acc);text-align:right;padding:2px 6px">${vol.amount.toLocaleString('ru-RU')} ${esc(vol.unit)}</td>
        <td class="smg-tot"></td><td class="smg-tot"></td><td class="smg-tot"></td>
      </tr>`;

      // ── FACT ROW ─────────────────────────────────────────────
      tbody+=`<tr class="smg-fact-row smg-row-bot" data-vol="${vol.id}" data-row="fact">
        <td class="smg-type-cell smg-fact-type" style="position:sticky;left:${rowHdW}px;z-index:7">Ф</td>`;
      for(let d=1;d<=days;d++){
        const ds=smgDateStr(d);
        const fval=factMap[ds]||0;
        const pval=plan[ds]||0;
        const off=smgIsShiftOffForVol(vol,d);
        const tdy=smgIsToday(d);
        const multi=(factMulti[ds]||0)>1;
        const cellColor=colorMap[ds]||'';
        const isPast=ds<=today;
        const isSel=_smgSelected&&_smgSelected.volId===vol.id&&_smgSelected.day===d&&_smgSelected.row==='fact';
        const isDragTarget=_smgDrag&&_smgDrag.volId===vol.id&&_smgDrag.currentDay!==undefined&&
          ((Math.min(_smgDrag.startDay,_smgDrag.currentDay)<=d)&&(d<=Math.max(_smgDrag.startDay,_smgDrag.currentDay)));

        let bgClass='';
        const isAct=actDaysSet.has(ds);
        if(!cellColor){
          if(isAct){bgClass='smg-fact-act';}
          else if(fval>0){bgClass=pval>0&&fval>=pval?'smg-fact-ok':pval>0?'smg-fact-partial':'smg-fact-ok';}
          else if(off){bgClass='smg-off';}
          else if(pval>0&&isPast){bgClass='smg-fact-behind';}
        }

        const fstr=fval.toLocaleString('ru-RU');
        const ffs=fstr.length>4?Math.round(8*_smgZoom):Math.round(10*_smgZoom);
        const inner=fval>0
          ?`<span class="smg-val" style="font-size:${ffs}px">${multi?'<span class="smg-dot">●</span>':''}${fstr}</span>`
          :'';

        tbody+=`<td class="smg-cell smg-fact-cell ${bgClass}${tdy?' smg-today':''}${isSel?' smg-selected':''}${isDragTarget?' smg-drag-target':''}"
          style="width:${cellW}px;min-width:${cellW}px;height:${cellH}px;font-size:${Math.round(10*_smgZoom)}px;${cellColor?'background:'+cellColor+';':''}"
          onclick="smgCellClick(event,'${vol.id}',${d},'fact')"
          ondblclick="smgCellDblClick(event,'${vol.id}',${d},'fact',${fval})"
          onmousedown="smgDragStart(event,'${vol.id}',${d},${fval})"
          onmouseenter="smgDragEnter(event,'${vol.id}',${d})"
          onmouseup="smgDragEnd(event,'${vol.id}')"
          oncontextmenu="smgCtxMenu(event,'${vol.id}',${d})"
          title="${ds}: ${fval>0?'факт '+fval+' '+esc(vol.unit)+(multi?' ('+factMulti[ds]+' записей)':''):'нет данных'}${pval>0?' · план '+pval:''}">
          ${inner}
        </td>`;
      }
      const pctStyle=`color:${pctColor};font-size:11px;font-weight:800`;
      tbody+=`<td class="smg-tot smg-tot-fact">${Math.round(totalFact).toLocaleString('ru-RU')}</td>
        <td class="smg-tot" style="color:var(--tx3)">${Math.round(totalPlan).toLocaleString('ru-RU')}</td>
        <td class="smg-tot"></td>
        <td class="smg-tot" style="${pctStyle}">${pct}%</td>
        <td class="smg-tot smg-tot-act">${actCount>0?actCount+' дн.':'—'}</td>
        <td class="smg-tot">${deltaHtml}</td>
      </tr>`;
    });
  });

  // ── ИТОГО row
  const totalVols=vols.filter(v=>v.amount>0).length;
  const doneVols=vols.filter(v=>{const d=prog.filter(p=>p.volume_id===v.id&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);return v.amount>0&&d>=v.amount;}).length;
  const avgPct=totalVols?Math.round(vols.filter(v=>v.amount>0).reduce((a,v2)=>{
    const d=prog.filter(p=>p.volume_id===v2.id&&p.row_type!=='plan').reduce((s,p)=>s+(+p.completed||0),0);
    return a+Math.min(100,v2.amount>0?d/v2.amount*100:0);
  },0)/totalVols):0;
  tbody+=`<tr class="smg-totals-row">
    <td class="smg-tot-hd" colspan="2" style="position:sticky;left:0;z-index:8">ИТОГО</td>`;
  for(let d=1;d<=days;d++){
    const ds=smgDateStr(d);
    const n=vols.filter(v=>prog.some(p=>p.volume_id===v.id&&p.work_date===ds&&p.row_type!=='plan')).length;
    tbody+=`<td style="font-size:9px;text-align:center;font-weight:700;color:${n?'#059669':'var(--tx3)'}">${n||''}</td>`;
  }
  tbody+=`<td class="smg-tot" colspan="2" style="font-size:11px;font-weight:800;color:var(--acc)">${doneVols}/${totalVols}</td>
    <td class="smg-tot"></td>
    <td class="smg-tot" style="font-size:11px;font-weight:800;color:${avgPct>=80?'#059669':avgPct>=50?'#2563eb':'#dc2626'}">${avgPct}%</td>
    <td class="smg-tot"></td><td class="smg-tot"></td>
  </tr>`;

  document.getElementById('smg-body').innerHTML=`
    ${statusBar}
    <div class="smg-table-wrap" id="smg-tw" onmouseup="smgDragEndGlobal(event)">
      <table class="smg-table" style="font-size:${fs}px">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${smgActionBarHtml()}`;

  // Keyboard listener
  const tw=document.getElementById('smg-tw');
  if(tw){
    tw.tabIndex=0;
    // Don't steal focus from search input
    const active=document.activeElement;
    if(!active||active.id!=='smg-search-inp')tw.focus();
  }
  document.getElementById('smg-tw')?.addEventListener('keydown',smgKeyDown);
  smgUpdateActionBar();
  smgInjectStyles();
}

// ── Action bar ────────────────────────────────────────────────
function smgActionBarHtml(){
  return `<div id="smg-action-bar" class="smg-action-bar" style="display:none">
    <span id="smg-ab-label" class="smg-ab-label"></span>
    <button class="smg-ab-btn" onclick="smgAbEdit()">✏️ Ред.</button>
    <button class="smg-ab-btn" onclick="smgAbCopy()"><span>⎘</span> Коп.</button>
    <span id="smg-ab-paste-btn" style="display:none">
      <button class="smg-ab-btn smg-ab-paste" onclick="smgAbPaste()">⎙ Вст. (<span id="smg-ab-paste-val"></span>)</button>
    </span>
    <div class="smg-ab-sep"></div>
    <button class="smg-ab-btn" onclick="smgAbColorPicker()">🎨 Цвет</button>
    <div class="smg-ab-sep"></div>
    <button class="smg-ab-btn smg-ab-del" onclick="smgAbDelete()">🗑 Удал.</button>
    <button class="smg-ab-close" onclick="smgClearSelection()">✕</button>
  </div>`;
}

function smgUpdateActionBar(){
  const bar=document.getElementById('smg-action-bar');
  if(!bar)return;
  if(!_smgSelected){bar.style.display='none';return;}
  bar.style.display='flex';
  const vol=(smgSiteData?.volumes||[]).find(v=>v.id===_smgSelected.volId);
  const ds=smgDateStr(_smgSelected.day);
  document.getElementById('smg-ab-label').textContent=
    (vol?.name||'?')+' · '+fmt(ds)+' · '+(_smgSelected.row==='plan'?'ПЛАН':'ФАКТ');
  const pv=document.getElementById('smg-ab-paste-btn');
  const pvv=document.getElementById('smg-ab-paste-val');
  if(pv&&pvv){
    if(_smgClipboard!==null){pv.style.display='';pvv.textContent=_smgClipboard;}
    else pv.style.display='none';
  }
}

// ── Cell interactions ─────────────────────────────────────────
function smgCellClick(ev,volId,day,row){
  ev.stopPropagation();
  if(_smgEditing)smgCommitEdit();
  _smgSelected={volId,day,row};
  smgUpdateActionBar();
  // highlight
  document.querySelectorAll('.smg-selected').forEach(td=>td.classList.remove('smg-selected'));
  ev.currentTarget.classList.add('smg-selected');
}

function smgCellDblClick(ev,volId,day,row,curVal){
  ev.stopPropagation();
  _smgSelected={volId,day,row};
  const td=ev.currentTarget;
  if(row==='fact'){
    const prog=smgSiteData?.vol_progress||[];
    const ds=smgDateStr(day);
    const multi=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan').length;
    if(multi>1){
      const vol=(smgSiteData?.volumes||[]).find(v=>v.id===volId);
      smgShowDayDetail(volId,ds,vol,prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan'),0);
      return;
    }
  }
  smgStartInlineEdit(td,volId,day,row,curVal);
}

function smgStartInlineEdit(td,volId,day,row,curVal){
  if(_smgEditing)smgCommitEdit();
  _smgEditing={volId,day,row,td};
  const inp=document.createElement('input');
  inp.type='number';inp.step='any';inp.min='0';
  inp.value=curVal||'';
  inp.className='smg-inline-edit';
  inp.onclick=e=>e.stopPropagation();
  inp.onblur=()=>smgCommitEdit();
  inp.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();smgCommitEdit();_smgSelected={volId,day,row};smgUpdateActionBar();}
    else if(e.key==='Escape'){e.preventDefault();_smgEditing=null;smgRender();}
    else if(e.key==='Tab'){
      e.preventDefault();
      const nextDay=day+(e.shiftKey?-1:1);
      smgCommitEdit();
      if(nextDay>=1&&nextDay<=smgDaysInMonth()){_smgSelected={volId,day:nextDay,row};smgUpdateActionBar();}
    }
    e.stopPropagation();
  };
  td.innerHTML='';td.appendChild(inp);
  inp.focus();inp.select();
}

async function smgCommitEdit(){
  if(!_smgEditing)return;
  const {volId,day,row,td}=_smgEditing;
  _smgEditing=null;
  const inp=td?.querySelector('input');
  if(!inp)return;
  const val=parseFloat(inp.value);
  const ds=smgDateStr(day);
  const prog=smgSiteData?.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&(p.row_type||'fact')===row);
  for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  if(!isNaN(val)&&inp.value.trim()!==''){
    await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:val,row_type:row,user_name:un()})});
  }
  await smgLoadAndRender();
}

// ── Keyboard navigation ───────────────────────────────────────
function smgKeyDown(e){
  if(_smgEditing)return;
  if(!_smgSelected)return;
  const days=smgDaysInMonth();
  const {volId,day,row}=_smgSelected;
  const vols=(smgSiteData?.volumes||[]);

  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
    e.preventDefault();
    const prog=smgSiteData?.vol_progress||[];
    const ds=smgDateStr(day);
    const val=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&(p.row_type||'fact')===row).reduce((a,p)=>a+(+p.completed||0),0);
    _smgClipboard=val;
    smgUpdateActionBar();
    toast('Скопировано: '+val,'ok');
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){
    e.preventDefault();
    if(_smgClipboard!==null)smgAbPaste();
    return;
  }

  if(e.key==='ArrowRight'&&day<days){e.preventDefault();_smgSelected.day=day+1;}
  else if(e.key==='ArrowLeft'&&day>1){e.preventDefault();_smgSelected.day=day-1;}
  else if(e.key==='ArrowDown'){
    e.preventDefault();
    const idx=vols.findIndex(v=>v.id===volId);
    if(row==='plan')_smgSelected.row='fact';
    else if(idx<vols.length-1){_smgSelected.volId=vols[idx+1].id;_smgSelected.row='plan';}
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    const idx=vols.findIndex(v=>v.id===volId);
    if(row==='fact')_smgSelected.row='plan';
    else if(idx>0){_smgSelected.volId=vols[idx-1].id;_smgSelected.row='fact';}
  }else if(e.key==='Enter'||e.key==='F2'){
    e.preventDefault();
    const td=document.querySelector(`tr[data-vol="${_smgSelected.volId}"][data-row="${_smgSelected.row}"] .smg-selected`);
    const prog=smgSiteData?.vol_progress||[];
    const ds=smgDateStr(_smgSelected.day);
    const curVal=prog.filter(p=>p.volume_id===_smgSelected.volId&&p.work_date===ds&&(p.row_type||'fact')===_smgSelected.row).reduce((a,p)=>a+(+p.completed||0),0);
    if(td)smgStartInlineEdit(td,_smgSelected.volId,_smgSelected.day,_smgSelected.row,curVal);
    return;
  }else if(e.key==='Delete'||e.key==='Backspace'){
    e.preventDefault();
    smgAbDelete();
    return;
  }else return;

  // Re-render selection highlight without full re-render
  document.querySelectorAll('.smg-selected').forEach(t=>t.classList.remove('smg-selected'));
  const td=document.querySelector(`tr[data-vol="${_smgSelected.volId}"][data-row="${_smgSelected.row}"] td.smg-cell:nth-child(${_smgSelected.day+2})`);
  if(td)td.classList.add('smg-selected');
  smgUpdateActionBar();
}

function smgClearSelection(){
  _smgSelected=null;
  document.querySelectorAll('.smg-selected').forEach(t=>t.classList.remove('smg-selected'));
  smgUpdateActionBar();
}

// ── Action bar handlers ───────────────────────────────────────
function smgAbEdit(){
  if(!_smgSelected)return;
  const prog=smgSiteData?.vol_progress||[];
  const ds=smgDateStr(_smgSelected.day);
  const curVal=prog.filter(p=>p.volume_id===_smgSelected.volId&&p.work_date===ds&&(p.row_type||'fact')===_smgSelected.row).reduce((a,p)=>a+(+p.completed||0),0);
  const td=document.querySelector(`tr[data-vol="${_smgSelected.volId}"][data-row="${_smgSelected.row}"] .smg-selected`);
  if(td)smgStartInlineEdit(td,_smgSelected.volId,_smgSelected.day,_smgSelected.row,curVal);
}

function smgAbCopy(){
  if(!_smgSelected)return;
  const prog=smgSiteData?.vol_progress||[];
  const ds=smgDateStr(_smgSelected.day);
  const val=prog.filter(p=>p.volume_id===_smgSelected.volId&&p.work_date===ds&&(p.row_type||'fact')===_smgSelected.row).reduce((a,p)=>a+(+p.completed||0),0);
  _smgClipboard=val;
  smgUpdateActionBar();
  toast('Скопировано: '+val,'ok');
}

async function smgAbPaste(){
  if(!_smgSelected||_smgClipboard===null)return;
  const ds=smgDateStr(_smgSelected.day);
  const {volId,row}=_smgSelected;
  const prog=smgSiteData?.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&(p.row_type||'fact')===row);
  for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  if(_smgClipboard>0){
    await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:_smgClipboard,row_type:row,user_name:un()})});
  }
  await smgLoadAndRender();toast('Вставлено: '+_smgClipboard,'ok');
}

async function smgAbDelete(){
  if(!_smgSelected)return;
  const ds=smgDateStr(_smgSelected.day);
  const {volId,row}=_smgSelected;
  const prog=smgSiteData?.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&(p.row_type||'fact')===row);
  for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  smgClearSelection();
  await smgLoadAndRender();toast('Ячейка очищена','ok');
}

function smgAbColorPicker(){
  if(!_smgSelected)return;
  // Remove existing picker if open
  const old=document.getElementById('smg-color-pop');
  if(old){old.remove();return;}
  const pop=document.createElement('div');
  pop.id='smg-color-pop';
  pop.style.cssText='position:fixed;bottom:56px;left:50%;transform:translateX(-50%);z-index:4000;background:var(--s);border:1.5px solid var(--bd);border-radius:var(--r);box-shadow:0 4px 20px rgba(0,0,0,.2);padding:4px;display:flex;flex-wrap:wrap;gap:2px;min-width:180px';
  SMG_COLORS.forEach(c=>{
    const btn=document.createElement('button');
    btn.style.cssText='display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;background:none;border:none;cursor:pointer;font-size:11px;color:var(--tx);border-radius:4px;text-align:left';
    btn.onmouseenter=()=>btn.style.background='var(--s2)';
    btn.onmouseleave=()=>btn.style.background='';
    btn.innerHTML=`<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.bg==='transparent'?'var(--s3)':c.bg};border:1px solid rgba(0,0,0,.15);flex-shrink:0"></span>${c.l}`;
    btn.onclick=()=>{
      smgSetCellColor(_smgSelected.volId,smgDateStr(_smgSelected.day),c.v);
      pop.remove();
    };
    pop.appendChild(btn);
  });
  document.body.appendChild(pop);
  // Close on outside click
  setTimeout(()=>document.addEventListener('click',function h(e){if(!pop.contains(e.target)){pop.remove();document.removeEventListener('click',h);}},{once:false}),50);
}

// ── Drag fill ─────────────────────────────────────────────────
function smgDragStart(ev,volId,day,value){
  if(ev.button!==0||!value)return;
  _smgDrag={volId,startDay:day,value,currentDay:undefined};
  ev.preventDefault();
}
function smgDragEnter(ev,volId,day){
  if(!_smgDrag||_smgDrag.volId!==volId)return;
  if(_smgDrag.currentDay===day)return;
  _smgDrag.currentDay=day;
  // Highlight range
  const s=Math.min(_smgDrag.startDay,day),e2=Math.max(_smgDrag.startDay,day);
  document.querySelectorAll('.smg-drag-target').forEach(t=>t.classList.remove('smg-drag-target'));
  document.querySelectorAll(`tr[data-vol="${volId}"][data-row="fact"] td.smg-cell`).forEach((td,i)=>{
    const d=i+1; // approximate — td index offset by type cell
    if(d>=s&&d<=e2)td.classList.add('smg-drag-target');
  });
}
async function smgDragEnd(ev,volId){
  if(!_smgDrag||_smgDrag.volId!==volId)return;
  await smgDragCommit();
}
async function smgDragEndGlobal(){
  if(!_smgDrag)return;
  await smgDragCommit();
}
async function smgDragCommit(){
  if(!_smgDrag||_smgDrag.currentDay===undefined||_smgDrag.currentDay===_smgDrag.startDay){
    _smgDrag=null;return;
  }
  const {volId,startDay,currentDay,value}=_smgDrag;
  _smgDrag=null;
  const start=Math.min(startDay,currentDay),end=Math.max(startDay,currentDay);
  const prog=smgSiteData?.vol_progress||[];
  for(let d=start;d<=end;d++){
    const ds=smgDateStr(d);
    const ex=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan');
    for(const p of ex)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
    await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:value,row_type:'fact',user_name:un()})});
  }
  await smgLoadAndRender();toast('Заполнено: '+value+' × '+(end-start+1)+' дн.','ok');
}

// ── Context menu ──────────────────────────────────────────────
function smgPlanCellCtxMenu(ev,volId,day){
  ev.preventDefault();
  _smgSelected={volId,day,row:'plan'};
  smgUpdateActionBar();
  const prog=smgSiteData?.vol_progress||[];
  const ds=smgDateStr(day);
  const manualPlan=smgGetManualPlan(prog,volId);
  const isManual=Object.prototype.hasOwnProperty.call(manualPlan,ds);
  const _resetDay=async()=>{
    const ex=prog.filter(p=>p.volume_id===volId&&p.row_type==='plan'&&p.work_date===ds);
    for(const p of ex)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
    await smgLoadAndRender();toast('Сброшено на авто','ok');
  };
  showCtx(ev.clientX,ev.clientY,[
    {i:'✏️',l:'Редактировать план',f:()=>smgPlanCellClick(volId,ds)},
    ...(isManual?[
      {i:'↺',l:'Сбросить на авто',f:_resetDay},
      {i:'🗑',l:'Удалить вручную',f:_resetDay},
    ]:[]),
    {sep:true},
    {i:'↺',l:'Сбросить весь месяц на авто',f:()=>smgResetPlanMonth(volId)},
  ]);
}

function smgCtxMenu(ev,volId,day){
  ev.preventDefault();
  _smgSelected={volId,day,row:'fact'};
  smgUpdateActionBar();
  const prog=smgSiteData?.vol_progress||[];
  const ds=smgDateStr(day);
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan'&&p.row_type!=='act');
  const isActed=prog.some(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type==='act');
  const val=existing.reduce((a,p)=>a+(+p.completed||0),0);
  const vol=(smgSiteData?.volumes||[]).find(v=>v.id===volId);

  showCtx(ev.clientX,ev.clientY,[
    {i:'✏️',l:'Внести выполнение',f:()=>smgFactCellClick(volId,ds)},
    {i:'➕',l:'Доп. запись за этот день',f:()=>{if(vol)smgAddAnotherEntry(volId,ds,vol);}},
    {sep:true},
    {i:'🎨',l:'Цвет ячейки',f:()=>smgShowColorPicker(ev,volId,ds)},
    {sep:true},
    {i:'⎘',l:`Копировать (${val})`,f:()=>{_smgClipboard=val;smgUpdateActionBar();toast('Скопировано: '+val,'ok');}},
    ...(_smgClipboard!==null?[{i:'⎙',l:`Вставить (${_smgClipboard})`,f:()=>smgAbPaste()}]:[]),
    {sep:true},
    {i:isActed?'🟠':'📜',l:isActed?'Снять актировку':'Актировать день (пропуск)',f:()=>smgSetAct(volId,ds)},
    {sep:true},
    {i:'✅',l:'Заполнить строку авто',f:()=>smgFillMonth(volId,'fact')},
    {i:'🗑',l:'Удалить эту ячейку',cls:'dan',f:async()=>{
      for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
      await smgLoadAndRender();toast('Ячейка очищена','ok');
    }},
    {i:'🗑',l:'Очистить всю строку ФАКТ',cls:'dan',f:()=>smgClearMonth(volId)},
  ]);
}

// ── Plan cell click ───────────────────────────────────────────
async function smgPlanCellClick(volId,ds){
  if(!smgSiteData)return;
  const vol=(smgSiteData.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  const prog=smgSiteData.vol_progress||[];
  const autoPlan=smgCalcAutoPlan(vol);
  const manualPlan=smgGetManualPlan(prog,volId);
  const autoVal=autoPlan[ds]||0;
  const manualVal=manualPlan.hasOwnProperty(ds)?manualPlan[ds]:null;

  showModal('📋 План — '+fmt(ds)+' — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div style="font-size:11px;color:var(--tx2);margin-bottom:8px">Авто-план: <strong>'+autoVal+' '+esc(vol.unit)+'</strong></div>'
    +(manualVal!==null?'<div style="font-size:11px;color:#7c3aed;margin-bottom:8px">Ручная корректировка: <strong>'+manualVal+'</strong></div>':'')
    +'<div class="fg"><label>Плановое значение ('+esc(vol.unit)+')</label>'
    +'<input id="f-pv" type="number" step="any" min="0" value="'+(manualVal!==null?manualVal:autoVal)+'"></div>'
    +'<div style="font-size:10px;color:var(--tx3);margin-top:4px">Пусто или 0 — сброс на авто-расчёт</div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},
     ...(manualVal!==null?[{label:'↺ Авто',cls:'bs',fn:async()=>{
       const ex=prog.filter(p=>p.volume_id===volId&&p.row_type==='plan'&&p.work_date===ds);
       for(const p of ex)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
       closeModal();await smgLoadAndRender();toast('Сброшено на авто','ok');
     }}]:[]),
     {label:'💾 Сохранить',cls:'bp',fn:async()=>{
       const val=parseFloat(document.getElementById('f-pv').value);
       const ex=prog.filter(p=>p.volume_id===volId&&p.row_type==='plan'&&p.work_date===ds);
       for(const p of ex)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
       if(!isNaN(val)&&val>0){
         await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
           body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:val,row_type:'plan',user_name:un()})});
       }
       closeModal();await smgLoadAndRender();toast('План обновлён','ok');
     }}]);
}

// ── Fact cell modal ───────────────────────────────────────────
async function smgFactCellClick(volId,ds){
  if(!smgSiteData)return;
  const vol=(smgSiteData.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  const prog=smgSiteData.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan');
  if(existing.length>1){smgShowDayDetail(volId,ds,vol,existing,0);return;}
  const totalFact=prog.filter(p=>p.volume_id===volId&&p.row_type!=='plan').reduce((a,p)=>a+(+p.completed||0),0);
  const planVal=(smgEffectivePlan(vol,prog))[ds]||0;
  const done=existing.reduce((a,p)=>a+(+p.completed||0),0);
  const existingColor=existing[0]?.cell_color||'';
  const existingWorkerIds=existing[0]?.worker_ids||'';
  const existingMachId=existing[0]?.machine_id||'';
  const workerList=pgkWorkers||[];
  const drillList=pgkMachinery?pgkMachinery.filter(m=>DRILL_TYPES.includes(m.type)):[];

  showModal('📅 '+fmt(ds)+' — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div style="display:flex;gap:14px;margin-bottom:10px;padding:8px 10px;background:var(--s2);border-radius:var(--rs)">'
    +'<div style="text-align:center"><div style="font-size:14px;font-weight:800;color:#0369a1">'+(planVal||'—')+'</div><div style="font-size:9px;color:var(--tx3)">план</div></div>'
    +'<div style="text-align:center"><div style="font-size:14px;font-weight:800;color:var(--acc)">'+(done||'—')+'</div><div style="font-size:9px;color:var(--tx3)">факт</div></div>'
    +'<div style="text-align:center"><div style="font-size:14px;font-weight:800;color:var(--acc)">'+totalFact+'</div><div style="font-size:9px;color:var(--tx3)">итого</div></div>'
    +'</div>'
    +'<div class="fg"><label>Выполнено ('+esc(vol.unit)+')</label><input id="f-smgc" type="number" step="any" min="0" value="'+(done||0)+'"></div>'
    +'<div class="fg"><label>Цвет ячейки</label><select id="f-smgcol" style="width:100%;font-size:11px">'
    +SMG_COLORS.map(c=>'<option value="'+c.v+'"'+(existingColor===c.v?' selected':'')+'>'+c.l+'</option>').join('')
    +'</select></div>'
    +'<div class="fg"><label>Сотрудники</label>'
    +'<div style="margin-bottom:3px"><input id="smg-wsearch" type="text" placeholder="🔍 Поиск..." style="width:100%;font-size:11px;padding:3px 6px;box-sizing:border-box;border:1px solid var(--bd);border-radius:3px;background:var(--s2)" oninput="smgFilterWorkers()"></div>'
    +'<select id="f-smgw" multiple style="width:100%;height:72px;font-size:11px">'
    +workerList.map(w=>'<option value="'+w.id+'"'+(existingWorkerIds.includes(w.id)?' selected':'')+'>'+esc(w.name)+(w.role?' — '+esc(w.role):'')+' </option>').join('')
    +'</select></div>'
    +(drillList.length?'<div class="fg"><label>Буровой инструмент</label><select id="f-smgmach" style="width:100%;font-size:11px"><option value="">— не выбран —</option>'+drillList.map(m=>'<option value="'+m.id+'"'+(existingMachId===m.id?' selected':'')+'>'+esc(m.name)+' ('+esc(m.type)+')</option>').join('')+'</select></div>':'')
    +'<div class="fg"><label>Комментарий</label><input id="f-smgn" value="'+(existing[0]?.notes||'').replace(/Сотрудники:[^·]*/g,'').replace(/Буровая:[^·]*/g,'').trim().replace(/^·\s*/,'').replace(/\s*·$/,'').trim()+'"></div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'➕ Ещё',cls:'bs',fn:()=>{closeModal();smgAddAnotherEntry(volId,ds,vol);}},
     ...(existing.length?[{label:'🗑',cls:'bd',fn:async()=>{
       for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
       closeModal();await smgLoadAndRender();toast('Запись удалена','ok');
     }}]:[]),
     {label:'💾 Сохранить',cls:'bp',fn:async()=>{
       const completed=parseFloat(document.getElementById('f-smgc').value)||0;
       const cell_color=document.getElementById('f-smgcol').value;
       const selW=[...document.getElementById('f-smgw').selectedOptions];
       const worker_ids=selW.map(o=>o.value).join(',');
       const workerNames=selW.map(o=>o.text.trim()).join(', ');
       const mEl=document.getElementById('f-smgmach');
       const machine_id=mEl?mEl.value:'';
       const machName=machine_id&&mEl?mEl.options[mEl.selectedIndex].text.trim():'';
       const baseNote=document.getElementById('f-smgn').value;
       const notes=[baseNote,workerNames?'Сотрудники: '+workerNames:'',machName?'Буровая: '+machName:''].filter(Boolean).join(' · ');
       for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
       if(completed>0||cell_color){
         await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
           body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed,notes,worker_ids,machine_id:machine_id||null,cell_color,user_name:un()})});
       }
       closeModal();await smgLoadAndRender();toast('Сохранено','ok');
     }}]);
}

function smgFilterWorkers(){
  const q=(document.getElementById('smg-wsearch')?.value||'').toLowerCase();
  const sel=document.getElementById('f-smgw');
  if(!sel)return;
  [...sel.options].forEach(o=>{o.style.display=(!q||o.text.toLowerCase().includes(q))?'':'none';});
}

// ── Day detail (multiple entries) ────────────────────────────
function smgShowDayDetail(volId,ds,vol,entries,planVal){
  const total=entries.reduce((a,p)=>a+(+p.completed||0),0);
  showModal('📅 '+fmt(ds)+' — '+esc(vol.name),
    '<div style="display:flex;gap:16px;margin-bottom:10px;padding:8px 10px;background:var(--s2);border-radius:var(--rs)">'
    +'<div style="text-align:center"><div style="font-size:15px;font-weight:800;color:var(--grn)">'+total.toLocaleString('ru-RU')+'</div><div style="font-size:9px;color:var(--tx3)">итого</div></div>'
    +'<div style="text-align:center"><div style="font-size:15px;font-weight:800;color:#7c3aed">'+entries.length+'</div><div style="font-size:9px;color:var(--tx3)">записей</div></div>'
    +(planVal?'<div style="text-align:center"><div style="font-size:15px;font-weight:800;color:#0369a1">'+planVal+'</div><div style="font-size:9px;color:var(--tx3)">план</div></div>':'')
    +'</div>'
    +entries.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <div style="font-size:14px;font-weight:800;color:var(--acc);min-width:64px">${Number(p.completed).toLocaleString('ru-RU')} <span style="font-size:10px;font-weight:400;color:var(--tx3)">${esc(vol.unit)}</span></div>
      <div style="flex:1;font-size:11px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis">${esc(p.notes||'—')}</div>
      <button class="btn bd bxs" onclick="smgDeleteEntry('${p.id}','${volId}','${ds}')">🗑</button>
    </div>`).join(''),
    [{label:'Закрыть',cls:'bs',fn:closeModal},
     {label:'➕ Добавить',cls:'bp',fn:()=>{closeModal();smgAddAnotherEntry(volId,ds,vol);}}]);
}

async function smgDeleteEntry(id,volId,ds){
  await fetch(API+'/vol_progress/'+id,{method:'DELETE'});
  const r=await fetch(API+'/sites/'+smgSiteId);smgSiteData=await r.json();
  const vol=(smgSiteData.volumes||[]).find(v=>v.id===volId);
  const entries=(smgSiteData.vol_progress||[]).filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan');
  if(entries.length>0)smgShowDayDetail(volId,ds,vol,entries,0);
  else closeModal();
  smgRender();toast('Запись удалена','ok');
}

function smgAddAnotherEntry(volId,ds,vol){
  const workerList=pgkWorkers||[];
  const drillList=pgkMachinery?pgkMachinery.filter(m=>DRILL_TYPES.includes(m.type)):[];
  showModal('➕ Доп. запись — '+fmt(ds)+' — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div class="fg"><label>Выполнено ('+esc(vol.unit)+')</label><input id="f-add2c" type="number" step="any" min="0" value="0"></div>'
    +'<div class="fg"><label>Сотрудники</label>'
    +'<div style="margin-bottom:3px"><input id="smg-wsearch2" type="text" placeholder="🔍 Поиск..." style="width:100%;font-size:11px;padding:3px 6px;box-sizing:border-box;border:1px solid var(--bd);border-radius:3px;background:var(--s2)" oninput="smgFilterWorkers2()"></div>'
    +'<select id="f-smgw2" multiple style="width:100%;height:72px;font-size:11px">'
    +workerList.map(w=>'<option value="'+w.id+'">'+esc(w.name)+(w.role?' — '+esc(w.role):'')+' </option>').join('')+'</select></div>'
    +(drillList.length?'<div class="fg"><label>Буровой инструмент</label><select id="f-smgmach2" style="width:100%;font-size:11px"><option value="">— не выбран —</option>'+drillList.map(m=>'<option value="'+m.id+'">'+esc(m.name)+' ('+esc(m.type)+')</option>').join('')+'</select></div>':'')
    +'<div class="fg"><label>Комментарий</label><input id="f-add2n" placeholder="Примечание..."></div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'💾 Добавить',cls:'bp',fn:async()=>{
       const completed=parseFloat(document.getElementById('f-add2c').value)||0;
       if(!completed){toast('Введите значение','err');return;}
       const selW=[...document.getElementById('f-smgw2').selectedOptions];
       const worker_ids=selW.map(o=>o.value).join(',');
       const workerNames=selW.map(o=>o.text.trim()).join(', ');
       const mEl=document.getElementById('f-smgmach2');
       const machine_id=mEl?mEl.value:'';
       const machName=machine_id&&mEl?mEl.options[mEl.selectedIndex].text.trim():'';
       const baseNote=document.getElementById('f-add2n').value;
       const notes=[baseNote,workerNames?'Сотрудники: '+workerNames:'',machName?'Буровая: '+machName:''].filter(Boolean).join(' · ');
       await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed,notes,worker_ids,machine_id:machine_id||null,user_name:un()})});
       closeModal();await smgLoadAndRender();toast('Запись добавлена','ok');
     }}]);
}
function smgFilterWorkers2(){
  const q=(document.getElementById('smg-wsearch2')?.value||'').toLowerCase();
  const sel=document.getElementById('f-smgw2');
  if(!sel)return;
  [...sel.options].forEach(o=>{o.style.display=(!q||o.text.toLowerCase().includes(q))?'':'none';});
}

// ── Colour picker ─────────────────────────────────────────────
function smgShowColorPicker(ev,volId,ds){
  showCtx(ev.clientX,ev.clientY,SMG_COLORS.map(c=>({
    i:`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.bg==='transparent'?'var(--s3)':c.bg};border:1px solid rgba(0,0,0,.2);margin-right:5px;vertical-align:middle"></span>`,
    l:c.l,
    f:()=>smgSetCellColor(volId,ds,c.v)
  })));
}

async function smgSetCellColor(volId,ds,color){
  if(!smgSiteData)return;
  const prog=smgSiteData.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type!=='plan');
  if(existing.length){
    const p=existing[0];
    await fetch(API+'/vol_progress/'+p.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,cell_color:color})});
  }else if(color){
    await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:0,notes:'',cell_color:color,user_name:un()})});
  }
  await smgLoadAndRender();
}

// ── Актировка ────────────────────────────────────────────────
async function smgSetAct(volId,ds){
  if(!smgSiteData)return;
  const vol=(smgSiteData.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  const prog=smgSiteData.vol_progress||[];
  const existing=prog.filter(p=>p.volume_id===volId&&p.work_date===ds&&p.row_type==='act');

  if(existing.length){
    // Toggle off — remove act marker
    for(const p of existing)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
    await smgLoadAndRender();toast('Актировка снята','ok');
    return;
  }

  showModal('📜 Актировка — '+fmt(ds)+' — '+esc(vol.name),
    '<div class="fgr fone">'
    +'<div style="font-size:11px;color:var(--tx2);margin-bottom:10px">Отметить <strong>'+fmt(ds)+'</strong> как пропущенный день (актировка). Ячейка окрасится оранжевым.</div>'
    +'<div class="fg"><label>Номер акта</label><input id="f-actn" placeholder="Акт №..."></div>'
    +'<div class="fg"><label>Примечания</label><input id="f-actc" placeholder="Причина пропуска..."></div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'✓ Отметить',cls:'bp',fn:async()=>{
       const actNum=document.getElementById('f-actn').value;
       const actComment=document.getElementById('f-actc').value;
       const notes=[actNum?'Акт '+actNum:'',actComment].filter(Boolean).join(' ');
       await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({site_id:smgSiteId,work_date:ds,completed:0,row_type:'act',notes,user_name:un()})});
       closeModal();await smgLoadAndRender();toast('День актирован','ok');
     }}]);
}

// ── Fill / clear month ────────────────────────────────────────
async function smgFillMonth(volId,mode){
  if(!smgSiteData)return;
  const vol=(smgSiteData.volumes||[]).find(v=>v.id===volId);if(!vol)return;
  const days=smgDaysInMonth();
  const planDays=smgGetPlanDays(vol);
  const dailyAmt=planDays.length>0?Math.floor(vol.amount/planDays.length):1;
  const prog=smgSiteData.vol_progress||[];
  const toDelete=prog.filter(p=>p.volume_id===volId&&p.row_type!=='plan'&&p.work_date>=smgDateStr(1)&&p.work_date<=smgDateStr(days));
  for(const p of toDelete)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  if(mode==='fact'){
    for(let d=1;d<=days;d++){
      if(!smgIsShiftOffForVol(vol,d)){
        await fetch(API+'/volumes/'+volId+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({site_id:smgSiteId,work_date:smgDateStr(d),completed:dailyAmt,row_type:'fact',user_name:un()})});
      }
    }
  }
  await smgLoadAndRender();toast('Заполнено','ok');
}

async function smgClearMonth(volId){
  if(!confirm('Удалить все записи ФАКТ за этот месяц?'))return;
  if(!smgSiteData)return;
  const days=smgDaysInMonth();
  const prog=smgSiteData.vol_progress||[];
  const toDelete=prog.filter(p=>p.volume_id===volId&&p.row_type!=='plan'&&p.work_date>=smgDateStr(1)&&p.work_date<=smgDateStr(days));
  for(const p of toDelete)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  await smgLoadAndRender();toast('Очищено','ok');
}

// ── Plan month reset/save ─────────────────────────────────────
async function smgResetPlanMonth(volId){
  if(!smgSiteData)return;
  const days=smgDaysInMonth();
  const prog=smgSiteData.vol_progress||[];
  const toDel=prog.filter(p=>p.volume_id===volId&&p.row_type==='plan'&&p.work_date>=smgDateStr(1)&&p.work_date<=smgDateStr(days));
  for(const p of toDel)await fetch(API+'/vol_progress/'+p.id,{method:'DELETE'});
  await smgLoadAndRender();toast('План сброшен на авто','ok');
}

// ── Toolbar controls ──────────────────────────────────────────
function smgSetZoom(val){
  _smgZoom=Math.max(0.7,Math.min(1.3,val));
  smgUpdateToolbar();smgRender();
}
function smgZoomIn(){smgSetZoom(_smgZoom+0.1);}
function smgZoomOut(){smgSetZoom(_smgZoom-0.1);}
function smgSetSearch(val){_smgSearch=val;smgRender();}
function smgSetFilter(val){_smgFilter=val;smgRender();}
function smgSetShiftStart(val){_smgShiftStart=val;smgRender();}

function smgAddRow(){
  if(!smgSiteId){toast('Выберите объект','err');return;}
  selectSite(smgSiteId).then(()=>{switchView('map');setTimeout(()=>openVolSectionPicker(),300);});
}

// ── Excel export helpers ──────────────────────────────────────

function _smgDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function _smgDateStr(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}

function _smgCalcAutoPlanForMonth(vol,y,m){
  if(!vol.plan_start&&!vol.plan_end)return {};
  if(!vol.amount)return {};
  const allDates=smgAllPlanDateStrs(vol);
  if(!allDates.length)return {};
  const perDay=vol.amount/allDates.length;
  const pfx=y+'-'+String(m+1).padStart(2,'0')+'-';
  const map={};
  allDates.forEach(ds=>{if(ds.startsWith(pfx))map[ds]=Math.round(perDay);});
  return map;
}

function _smgEffPlanForMonth(vol,prog,y,m){
  const allManual={};
  (prog||[]).filter(p=>p.volume_id===vol.id&&p.row_type==='plan').forEach(p=>{
    allManual[p.work_date]=(allManual[p.work_date]||0)+(+p.completed||0);
  });
  const days=_smgDaysInMonth(y,m);
  const result={};
  if(Object.keys(allManual).length>0){
    const allDates=smgAllPlanDateStrs(vol);
    const autoDatesSet=new Set(allDates.filter(ds=>!Object.prototype.hasOwnProperty.call(allManual,ds)));
    const manualTotal=Object.values(allManual).reduce((a,v)=>a+v,0);
    const autoAmount=Math.max(0,vol.amount-manualTotal);
    const perAutoDay=autoDatesSet.size>0?autoAmount/autoDatesSet.size:0;
    for(let d=1;d<=days;d++){
      const ds=_smgDateStr(y,m,d);
      if(Object.prototype.hasOwnProperty.call(allManual,ds))result[ds]=allManual[ds];
      else if(autoDatesSet.has(ds))result[ds]=Math.round(perAutoDay);
      else result[ds]=0;
    }
  }else{
    const auto=_smgCalcAutoPlanForMonth(vol,y,m);
    for(let d=1;d<=days;d++){const ds=_smgDateStr(y,m,d);result[ds]=auto[ds]||0;}
  }
  return result;
}

function _smgBuildMonthSheet(site,vols,prog,y,m,today){
  const days=_smgDaysInMonth(y,m);
  const monthName=SMG_MONTHS[m]+' '+y;
  const dows=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const todayStr=today.replace(/-/g,'.');

  // Columns: №, Вид работ, Строка, Ед., Объём(total), days..., Общий объём, Итог план/факт, %, Δ, Акт
  // Index:    0   1         2       3    4             5..4+days  5+days      5+days+1        +2  +3  +4
  const DCOL=5;                   // first day column index
  const VCOL=DCOL+days;           // "Общий объём" column
  const TOTAL_COLS=DCOL+days+5;   // +Общий объём, Plan/Fact, %, Δ, Акт

  const hdr=['№П/П','Вид работ','Строка','Ед.','Объём на месяц'];
  for(let d=1;d<=days;d++){const dt=new Date(y,m,d);hdr.push(d+' '+dows[dt.getDay()]);}
  hdr.push('Общий объём','Итого план/факт','% Выполнения','Δ к плану','Актировано');

  const aoa=[
    ['СМГ — '+site.name+' — '+monthName+'  ('+todayStr+')'],
    [],
    hdr,
  ];

  const cats=['geology','geodesy'];
  const catLabels={geology:'ГЕОЛОГИЯ',geodesy:'ГЕОДЕЗИЯ'};
  const catFills={geology:'00B050',geodesy:'00B0F0'};

  const merges=[],groupRows=[],planRows=[],factRows=[];
  merges.push({s:{r:0,c:0},e:{r:0,c:TOTAL_COLS-1}});

  let curRow=3,seqNo=0;
  cats.forEach(cat=>{
    const catVols=vols.filter(v=>v.category===cat);
    if(!catVols.length)return;
    aoa.push([catLabels[cat]]);
    groupRows.push({r:curRow,fill:catFills[cat]});
    merges.push({s:{r:curRow,c:0},e:{r:curRow,c:TOTAL_COLS-1}});
    curRow++;

    catVols.forEach(vol=>{
      seqNo++;
      const factEntries=prog.filter(p=>p.volume_id===vol.id&&p.row_type!=='plan');
      const factMap={};
      factEntries.forEach(p=>{factMap[p.work_date]=(factMap[p.work_date]||0)+(+p.completed||0);});
      const ep=_smgEffPlanForMonth(vol,prog,y,m);

      // Month-scoped totals
      let monthPlanTotal=0,monthFactTotal=0,monthPT=0,monthFT=0;
      for(let d=1;d<=days;d++){
        const ds=_smgDateStr(y,m,d);
        monthPlanTotal+=(ep[ds]||0);
        monthFactTotal+=(factMap[ds]||0);
        if(ds<=today){monthPT+=(ep[ds]||0);monthFT+=(factMap[ds]||0);}
      }
      const monthDelta=Math.round(monthFT-monthPT);

      // All-time fact for % (vs vol.amount)
      const totalFact=factEntries.reduce((a,p)=>a+(+p.completed||0),0);
      const pct=vol.amount>0?Math.min(100,Math.round(totalFact/vol.amount*100)):0;
      const actCount=new Set(prog.filter(p=>p.volume_id===vol.id&&p.row_type==='act').map(p=>p.work_date)).size;

      const planRow=[seqNo,vol.name,'ПЛАН',vol.unit,monthPlanTotal];
      for(let d=1;d<=days;d++)planRow.push(ep[_smgDateStr(y,m,d)]||'');
      planRow.push(vol.amount,monthPlanTotal,pct+'%',(monthDelta>0?'+':'')+monthDelta,'');
      aoa.push(planRow);
      const planRowIdx=curRow;
      planRows.push(planRowIdx);
      curRow++;

      const factRow=['','','ФАКТ','',''];
      for(let d=1;d<=days;d++)factRow.push(factMap[_smgDateStr(y,m,d)]||'');
      factRow.push('',monthFactTotal,'','',actCount||'');
      aoa.push(factRow);
      const factRowIdx=curRow;
      factRows.push(factRowIdx);
      curRow++;

      // Merge shared cells across plan+fact rows
      [0,1,3,VCOL,VCOL+2].forEach(c=>{
        merges.push({s:{r:planRowIdx,c},e:{r:factRowIdx,c}});
      });
    });
  });

  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:6},{wch:30},{wch:7},{wch:7},{wch:11}];
  for(let d=1;d<=days;d++)ws['!cols'].push({wch:5});
  ws['!cols'].push({wch:12},{wch:12},{wch:11},{wch:14},{wch:11});
  ws['!rows']=[];
  ws['!rows'][0]={hpx:28};
  ws['!rows'][2]={hpx:36};
  ws['!merges']=merges;

  const border={
    top:{style:'thin',color:{rgb:'808080'}},bottom:{style:'thin',color:{rgb:'808080'}},
    left:{style:'thin',color:{rgb:'808080'}},right:{style:'thin',color:{rgb:'808080'}},
  };
  const baseAlign={horizontal:'center',vertical:'center',wrapText:true};

  function setStyle(cellRef,style){
    if(!ws[cellRef])ws[cellRef]={t:'s',v:''};
    ws[cellRef].s=style;
  }
  function colLetter(c){
    let s='',n=c;
    do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);
    return s;
  }
  function ref(r,c){return colLetter(c)+(r+1);}

  setStyle(ref(0,0),{font:{bold:true,sz:14},alignment:{horizontal:'center',vertical:'center'},fill:{patternType:'solid',fgColor:{rgb:'D9E1F2'}},border});
  for(let c=0;c<TOTAL_COLS;c++){
    setStyle(ref(2,c),{font:{bold:true,sz:11},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'BDD7EE'}},border});
  }
  groupRows.forEach(g=>{
    for(let c=0;c<TOTAL_COLS;c++){
      setStyle(ref(g.r,c),{font:{bold:true,sz:12,color:{rgb:'FFFFFF'}},alignment:{horizontal:'center',vertical:'center'},fill:{patternType:'solid',fgColor:{rgb:g.fill}},border});
    }
  });
  const planFill={patternType:'solid',fgColor:{rgb:'DDEBF7'}};
  const factFill={patternType:'solid',fgColor:{rgb:'FFFFFF'}};
  const volColFill={patternType:'solid',fgColor:{rgb:'FFF2CC'}};
  planRows.forEach(r=>{
    for(let c=0;c<TOTAL_COLS;c++){
      setStyle(ref(r,c),{font:{sz:11,bold:c<DCOL||c>=VCOL},alignment:baseAlign,fill:planFill,border});
    }
    setStyle(ref(r,VCOL),{font:{sz:11,bold:true},alignment:baseAlign,fill:volColFill,border});
  });
  factRows.forEach(r=>{
    for(let c=0;c<TOTAL_COLS;c++){
      setStyle(ref(r,c),{font:{sz:11,bold:c<DCOL||c>=VCOL},alignment:baseAlign,fill:factFill,border});
    }
    setStyle(ref(r,VCOL),{font:{sz:11,bold:true},alignment:baseAlign,fill:volColFill,border});
  });

  // Today column
  const todayDay=(new Date().getFullYear()===y&&new Date().getMonth()===m)?new Date().getDate():-1;
  if(todayDay>0&&todayDay<=days){
    const c=DCOL+(todayDay-1);
    setStyle(ref(2,c),{font:{bold:true,sz:11,color:{rgb:'FFFFFF'}},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'4472C4'}},border});
  }
  // Off-shift day headers
  const savedY=smgYear,savedM=smgMonth;
  smgYear=y;smgMonth=m;
  for(let d=1;d<=days;d++){
    if(smgIsShiftOff(d)){
      const c=DCOL+(d-1);
      const existing=ws[ref(2,c)]&&ws[ref(2,c)].s?ws[ref(2,c)].s:null;
      if(!existing||existing.fill?.fgColor?.rgb!=='4472C4'){
        setStyle(ref(2,c),{font:{bold:true,sz:11,color:{rgb:'606060'}},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'F2F2F2'}},border});
      }
    }
  }
  smgYear=savedY;smgMonth=savedM;

  ws['!views']=[{state:'frozen',xSplit:DCOL,ySplit:3}];
  return ws;
}

// ── Excel export ──────────────────────────────────────────────
function smgExportExcel(){
  if(!smgSiteData){toast('Выберите объект','err');return;}
  const site=smgSiteData;
  const vols=site.volumes||[];
  const prog=site.vol_progress||[];
  const today=new Date().toISOString().split('T')[0];
  const wb=XLSX.utils.book_new();

  // Determine month range: from earliest plan_start to latest plan_end across all volumes
  const nowYM=new Date().getFullYear()*12+new Date().getMonth();
  let minYM=smgYear*12+smgMonth, maxYM=smgYear*12+smgMonth;
  vols.forEach(v=>{
    if(v.plan_start){const d=new Date(v.plan_start);const ym=d.getFullYear()*12+d.getMonth();if(ym<minYM)minYM=ym;}
    if(v.plan_end){const d=new Date(v.plan_end);const ym=d.getFullYear()*12+d.getMonth();if(ym>maxYM)maxYM=ym;}
  });
  // Also include months with actual vol_progress data
  prog.forEach(p=>{
    if(p.work_date){
      const d=new Date(p.work_date);const ym=d.getFullYear()*12+d.getMonth();
      if(ym<minYM)minYM=ym;
      if(ym>maxYM)maxYM=ym;
    }
  });
  // Never generate sheets beyond actual plan completion or current month (whichever is later)
  // but do allow future months if plan_end is in the future

  for(let ym=minYM;ym<=maxYM;ym++){
    const y=Math.floor(ym/12), m=ym%12;
    const ws=_smgBuildMonthSheet(site,vols,prog,y,m,today);
    const shName=SMG_MONTHS[m].slice(0,3)+' '+y;
    XLSX.utils.book_append_sheet(wb,ws,shName);
  }

  // Детализация sheet (all-time)
  const border={top:{style:'thin',color:{rgb:'808080'}},bottom:{style:'thin',color:{rgb:'808080'}},left:{style:'thin',color:{rgb:'808080'}},right:{style:'thin',color:{rgb:'808080'}}};
  const baseAlign={horizontal:'center',vertical:'center',wrapText:true};
  function colLetter(c){let s='',n=c;do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
  function ref(r,c){return colLetter(c)+(r+1);}
  const detAoa=[['ДЕТАЛИЗАЦИЯ'],['Объём','Дата','Выполнено','Ед.','Примечания']];
  vols.forEach(vol=>{
    prog.filter(p=>p.volume_id===vol.id&&p.row_type!=='plan').sort((a,b)=>a.work_date>b.work_date?1:-1).forEach(p=>
      detAoa.push([vol.name,p.work_date,p.completed,vol.unit,p.notes||'']));
  });
  const detWs=XLSX.utils.aoa_to_sheet(detAoa);
  detWs['!cols']=[{wch:30},{wch:12},{wch:12},{wch:8},{wch:40}];
  detWs['!merges']=[{s:{r:0,c:0},e:{r:0,c:4}}];
  if(detWs['A1'])detWs['A1'].s={font:{bold:true,sz:13},alignment:{horizontal:'center'},fill:{patternType:'solid',fgColor:{rgb:'D9E1F2'}}};
  for(let c=0;c<5;c++){const r=ref(1,c);if(detWs[r])detWs[r].s={font:{bold:true},alignment:baseAlign,fill:{patternType:'solid',fgColor:{rgb:'BDD7EE'}},border};}
  XLSX.utils.book_append_sheet(wb,detWs,'Детализация');

  XLSX.writeFile(wb,site.name.replace(/[\/\\:*?"<>|]/g,'_')+'_СМГ_'+smgYear+'.xlsx');
  toast('Excel сохранён','ok');
}

// ── Styles injection ──────────────────────────────────────────
function smgInjectStyles(){
  if(document.getElementById('smg-v2-style'))return;
  const s=document.createElement('style');
  s.id='smg-v2-style';
  s.textContent=`
/* ── SMG v2 styles ───────────────────────── */
.smg-status-bar{display:flex;align-items:center;gap:12px;padding:5px 12px;background:var(--s);border-bottom:1px solid var(--bd);font-size:11px;flex-wrap:wrap;flex-shrink:0}
.smg-leg-item{display:flex;align-items:center;gap:4px;color:var(--tx2)}
.smg-leg-dot{display:inline-block;width:11px;height:11px;border-radius:2px;flex-shrink:0}
.smg-stat{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--tx3);padding:2px 8px;border-radius:12px}
.smg-stat strong{font-size:13px;font-weight:800}
.smg-stat-warn{background:#fef2f2;color:#b91c1c}
.smg-stat-ok{background:#f0fdf4;color:#15803d}
.smg-stat-ico{font-size:11px}
.smg-hint{margin-left:auto;font-size:10px;color:var(--tx3);opacity:.7}

.smg-table-wrap{flex:1;overflow:auto;min-height:0}
.smg-table{border-collapse:separate;border-spacing:0;font-size:11px;width:100%}
.smg-table td,.smg-table th{border-right:1px solid var(--bd);border-bottom:1px solid var(--bd);padding:0}

/* Header */
.smg-hd-name{background:var(--s);color:var(--tx);font-weight:700;font-size:11px;text-align:left;padding:6px 10px}
.smg-hd-type{background:var(--s2)}
.smg-hd-day{background:var(--s);font-weight:700;text-align:center;padding:3px 1px;white-space:nowrap;position:sticky}
.smg-hd-day.smg-hd-today{background:#1d4ed8;color:#fff}
.smg-hd-tot{background:var(--s2);font-weight:700;font-size:10px;color:var(--tx3);text-align:right;padding:4px 8px;white-space:nowrap}
.smg-hd-act{color:#7c3aed}
.smg-hd-delta{color:var(--tx2);text-align:center}

/* Category row */
.smg-cat-row{background:#f5f5f5;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--cat-color,var(--tx3));padding:4px 10px;position:sticky;left:0;z-index:6}
.smg-cat-count{font-weight:400;opacity:.6}

/* Row header */
.smg-row-hd{background:var(--s);border-right:2px solid var(--bd)!important;padding:6px 8px}

/* Type cell */
.smg-type-cell{font-size:9px;font-weight:800;text-align:center;padding:0 2px;border-right:2px solid var(--bd)!important;user-select:none}
.smg-plan-type{background:#eff6ff;color:#1d4ed8}
.smg-fact-type{background:#f0fdf4;color:#15803d}

/* Cells */
.smg-cell{cursor:pointer;text-align:center;user-select:none;transition:filter 80ms}
.smg-cell:hover{filter:brightness(.88)}
.smg-plan-cell{background:#eff6ff}
.smg-plan-cell.smg-off{cursor:default}
.smg-plan-cell:not(.smg-off):hover{background:#dbeafe}
.smg-manual{background:#e0e7ff!important}
.smg-fact-cell{background:var(--s)}
.smg-fact-ok{background:#dcfce7!important}
.smg-fact-partial{background:#fef3c7!important}
.smg-fact-behind{background:#fee2e2!important}
.smg-fact-act{background:#fed7aa!important}
.smg-off{cursor:default}
.smg-today{box-shadow:inset 0 0 0 2px #2563eb!important}
.smg-selected{box-shadow:inset 0 0 0 2px #1d4ed8!important;z-index:3;position:relative}
.smg-drag-target{box-shadow:inset 0 0 0 2px #7c3aed!important;filter:brightness(.85)}

/* Values */
.smg-plan-val{font-size:9px;font-weight:600;color:#1d4ed8;display:block;text-align:center;pointer-events:none;line-height:1}
.smg-val{font-size:10px;font-weight:700;color:var(--tx);display:block;text-align:center;pointer-events:none;line-height:1}
.smg-dot{font-size:7px;color:#7c3aed;margin-right:1px;vertical-align:top}

/* Bottom border for fact rows */
.smg-row-bot td{border-bottom:2px solid var(--bd)!important}

/* Totals */
.smg-tot{padding:3px 8px;font-size:11px;text-align:right;white-space:nowrap;background:var(--s2)}
.smg-tot-fact{font-weight:800;color:#15803d}
.smg-tot-act{color:#7c3aed;font-weight:700}
.smg-totals-row td{background:var(--s3)!important;font-weight:800;font-size:11px}
.smg-tot-hd{font-weight:800;font-size:11px;padding:5px 10px;color:var(--tx)}

/* Delta */
.smg-delta-pos{color:#15803d;font-size:11px;font-weight:700}
.smg-delta-neg{color:#dc2626;font-size:11px;font-weight:700}

/* Inline edit */
.smg-inline-edit{width:100%;height:100%;border:2px solid #2563eb;outline:none;text-align:center;font-size:10px;font-weight:700;background:#fff;padding:0 2px;box-sizing:border-box}

/* Action bar */
.smg-action-bar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:3000;
  display:flex;align-items:center;gap:2px;
  background:#171717;color:#fff;border-radius:10px;
  box-shadow:0 4px 24px rgba(0,0,0,.35);
  padding:5px 8px;font-size:12px;
  animation:smgBarIn .18s cubic-bezier(.23,1,.32,1)}
@keyframes smgBarIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.smg-ab-label{color:#a3a3a3;font-size:11px;padding:0 8px;border-right:1px solid #404040;margin-right:2px}
.smg-ab-btn{background:none;border:none;color:#fff;cursor:pointer;padding:4px 8px;border-radius:6px;font-size:11px;white-space:nowrap;transition:background .1s}
.smg-ab-btn:hover{background:#2a2a2a}
.smg-ab-paste{color:#86efac}
.smg-ab-del{color:#fca5a5}
.smg-ab-del:hover{background:#450a0a}
.smg-ab-sep{width:1px;height:18px;background:#404040;margin:0 2px}
.smg-ab-close{background:none;border:none;color:#737373;cursor:pointer;padding:4px 6px;border-radius:6px;font-size:13px;transition:color .1s}
.smg-ab-close:hover{color:#fff}

/* Toolbar extras */
.smg-toolbar-extra{display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--s);border-bottom:1px solid var(--bd);flex-wrap:wrap;flex-shrink:0}
.smg-toolbar-extra input,.smg-toolbar-extra select{background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);color:var(--tx);font-size:11px;padding:3px 7px;outline:none;height:28px}
.smg-toolbar-extra input:focus,.smg-toolbar-extra select:focus{border-color:var(--acc)}
.smg-tbdiv{width:1px;height:18px;background:var(--bd);flex-shrink:0}
.smg-zoom-grp{display:flex;align-items:center;gap:2px;background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);overflow:hidden}
.smg-zoom-grp button{background:none;border:none;cursor:pointer;padding:3px 6px;color:var(--tx);font-size:13px;transition:background .1s}
.smg-zoom-grp button:hover{background:var(--s3)}
.smg-zoom-grp span{font-size:11px;font-weight:700;min-width:36px;text-align:center;color:var(--tx2)}
  `;
  document.head.appendChild(s);
}

// ── HTML toolbar update (called from index.html controls) ─────
// These functions wire up the NEW toolbar controls we add to index.html
function smgToolbarInit(){
  smgInjectStyles();
  // Replace static toolbar with enhanced one
  const tb=document.querySelector('.smg-toolbar');
  if(!tb)return;
  tb.className='smg-toolbar smg-toolbar-extra';
  tb.innerHTML=`
    <div style="display:flex;align-items:center;gap:5px;margin-right:4px">
      <div style="width:24px;height:24px;background:var(--tx);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">📅</div>
      <span style="font-size:13px;font-weight:700;color:var(--tx)">СМГ</span>
      <span style="font-size:11px;color:var(--tx3)">Суточно-месячный</span>
    </div>
    <div class="smg-tbdiv"></div>
    <select id="smg-site-sel" onchange="smgSelectSite(this.value)" style="max-width:220px">
      <option value="">— Выберите объект —</option>
    </select>
    <div class="smg-month-nav" style="display:flex;align-items:center;gap:2px">
      <button onclick="smgPrevMonth()" style="background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);cursor:pointer;font-size:13px;width:26px;height:26px;display:flex;align-items:center;justify-content:center">◀</button>
      <div id="smg-month-lbl" style="font-size:12px;font-weight:700;min-width:120px;text-align:center">—</div>
      <button onclick="smgNextMonth()" style="background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);cursor:pointer;font-size:13px;width:26px;height:26px;display:flex;align-items:center;justify-content:center">▶</button>
    </div>
    <div class="smg-tbdiv"></div>
    <div style="position:relative">
      <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;pointer-events:none;color:var(--tx3)">🔍</span>
      <input id="smg-search-inp" type="text" placeholder="Поиск..." style="padding-left:26px;width:140px" oninput="smgSetSearch(this.value)">
    </div>
    <select id="smg-filter-sel" onchange="smgSetFilter(this.value)" style="width:150px">
      <option value="all">Все работы</option>
      <option value="behind">Отстают от плана</option>
      <option value="done">Выполнены</option>
      <option value="nodata">Нет данных</option>
    </select>
    <div class="smg-tbdiv" style="margin-left:auto"></div>
    <div class="smg-zoom-grp">
      <button onclick="smgZoomOut()" title="Уменьшить">−</button>
      <span id="smg-zoom-lbl">100%</span>
      <button onclick="smgZoomIn()" title="Увеличить">+</button>
    </div>
    <button class="btn bs bsm" onclick="smgAddRow()">＋ Строка</button>
    <button class="btn bs bsm" onclick="smgExportExcel()">📤 Excel</button>
  `;
  // After toolbar DOM is created, populate the site list and update values
  smgRefreshSiteList();
  smgUpdateToolbar();
}

// ═══════════════════════════════════════════════════════════
// ALERT STRIP — предупреждения на главном экране
// ═══════════════════════════════════════════════════════════
let _alertsDismissed=false;
function buildAlerts(){
  const today=new Date().toISOString().split('T')[0];
  const in3=new Date(Date.now()+3*86400000).toISOString().split('T')[0];
  const alerts=[];
  sites.forEach(s=>{
    const tasks=s.tasks||[];
    const overdue=tasks.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<today);
    const soon=tasks.filter(t=>t.status!=='done'&&t.due_date&&t.due_date>=today&&t.due_date<=in3);
    if(overdue.length)alerts.push({type:'danger',icon:'🚨',text:esc(s.name)+': '+overdue.length+' просроч. задач',fn:()=>selectSite(s.id)});
    if(soon.length)alerts.push({type:'warn',icon:'⏰',text:esc(s.name)+': '+soon.length+' задач скоро',fn:()=>selectSite(s.id)});
  });
  const broken=pgkMachinery.filter(m=>m.status==='broken');
  if(broken.length)alerts.push({type:'danger',icon:'🔴',text:'Сломана техника: '+broken.map(m=>m.name).join(', '),fn:()=>switchView('pgk')});
  const longField=[];
  bases.forEach(b=>(b.workers||[]).forEach(w=>{
    if(w.start_date){const d=Math.floor((Date.now()-new Date(w.start_date))/86400000);if(d>=30)longField.push(w.name+' ('+d+' дн.)');}
  }));
  if(longField.length)alerts.push({type:'warn',icon:'👷',text:'В поле 30+ дней: '+longField.slice(0,3).map(n=>esc(n)).join(', ')+(longField.length>3?'...':''),fn:()=>switchView('pgk')});
  let lowMat=0;
  bases.forEach(b=>(b.materials||[]).forEach(m=>{if(m.min_amount>0&&m.amount<m.min_amount)lowMat++;}));
  if(lowMat)alerts.push({type:'warn',icon:'📦',text:lowMat+' поз. материалов ниже минимума'});
  return alerts;
}
function checkAlerts(){
  // Full check — called once on first load
  const alerts=buildAlerts();
  const strip=document.getElementById('alert-strip');
  const items=document.getElementById('alert-items');
  if(!alerts.length){strip.classList.remove('show');_alertsDismissed=false;return;}
  items.innerHTML=alerts.map((a,i)=>`<span class="alert-item" onclick="alertClick(${i})">${a.icon} ${a.text}</span>`).join('');
  strip.className='show';
  strip.style.background=alerts.some(a=>a.type==='danger')?'#c81e1e':'#92400e';
  window._alertFns=alerts.map(a=>a.fn||null);
  _alertsDismissed=false;
}
function checkAlertsQuiet(){
  // Silent update — only update content, never re-show if user dismissed
  if(_alertsDismissed)return;
  const alerts=buildAlerts();
  const strip=document.getElementById('alert-strip');
  const items=document.getElementById('alert-items');
  if(!alerts.length){strip.classList.remove('show');return;}
  // Just update content without changing show state
  items.innerHTML=alerts.map((a,i)=>`<span class="alert-item" onclick="alertClick(${i})">${a.icon} ${a.text}</span>`).join('');
  window._alertFns=alerts.map(a=>a.fn||null);
  strip.style.background=alerts.some(a=>a.type==='danger')?'#c81e1e':'#92400e';
}
function alertClick(i){const fn=window._alertFns&&window._alertFns[i];if(fn)fn();}

// ═══════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════════════════════
let gsearchTimer=null;
const GTYPE_ICONS={site:'🗺',base:'🏕',worker:'👤',machine:'🚛',equip:'🔩',material:'📦'};
const GTYPE_LABELS={site:'Объект',base:'База',worker:'Сотрудник',machine:'Техника',equip:'Оборудование',material:'Материал'};
function gsearchInput(q){
  const clear=document.getElementById('gsearch-clear');
  const drop=document.getElementById('gsearch-drop');
  if(clear)clear.style.display=q?'block':'none';
  clearTimeout(gsearchTimer);
  if(!q.trim()){drop.classList.remove('show');return;}
  gsearchTimer=setTimeout(async()=>{
    const raw=await fetch(`${API}/search?q=${encodeURIComponent(q)}`).then(r=>r.json()).catch(()=>({}));
    // Server returns either array (old) or object {sites,bases,...} (new)
    let res=[];
    if(Array.isArray(raw)){
      res=raw;
    } else {
      const icons={sites:'🗺',bases:'🏕',workers:'👤',machinery:'🚛',tasks:'✅'};
      const labels={sites:'Объект',bases:'База',workers:'Сотрудник',machinery:'Техника',tasks:'Задача'};
      Object.entries(raw).forEach(([key,items])=>(items||[]).forEach(it=>{
        res.push({type:key.slice(0,-1),id:it.id,name:it.name||it.title,sub:it.client||it.role||it.plate_number||it.site_name||it.type||''});
      }));
    }
    if(!res.length){drop.innerHTML='<div style="padding:10px;font-size:11px;color:var(--tx3)">Ничего не найдено</div>';drop.classList.add('show');return;}
    drop.innerHTML=res.map(r=>`<div class="gsr" onclick="gsearchGo('${r.type}','${r.id}')">
      <span class="gsr-ico">${GTYPE_ICONS[r.type]||'🔍'}</span>
      <div style="flex:1;min-width:0">
        <div class="gsr-nm">${esc(r.name||'')}</div>
        ${r.sub?`<div class="gsr-sub">${esc(r.sub)}</div>`:''}
      </div>
      <span class="gsr-type">${GTYPE_LABELS[r.type]||r.type||''}</span>
    </div>`).join('');
    drop.classList.add('show');
  },250);
}
function gsearchClear(){
  const inp=document.getElementById('gsearch');
  const drop=document.getElementById('gsearch-drop');
  const clear=document.getElementById('gsearch-clear');
  if(inp)inp.value='';
  if(drop)drop.classList.remove('show');
  if(clear)clear.style.display='none';
}
function gsearchGo(type,id){
  gsearchClear();
  if(type==='site')selectSite(id);
  else if(type==='base'){switchView('map');selectBase(id);}
  else if(type==='worker'||type==='machine'||type==='equip'){switchView('pgk');}
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#gsearch-wrap'))document.getElementById('gsearch-drop')?.classList.remove('show');
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard(){
  const pb=document.getElementById('dash-page');
  pb.innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3)">Загрузка...</div>';

  // Fetch all data in parallel
  let gtasks=[],cargo=[],actLog=[];
  try{
    const[sr,br,mr,gtr,cr,lr]=await Promise.all([
      fetch(`${API}/sites`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/bases`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/pgk/machinery`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/gtasks`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/cargo`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/log`).then(r=>r.json()).catch(()=>[])
    ]);
    sites=sr;bases=br;pgkMachinery=mr;gtasks=gtr;cargo=cr;actLog=lr;
  }catch(e){}

  const today=new Date().toISOString().split('T')[0];
  const in3=new Date(Date.now()+3*86400000).toISOString().split('T')[0];

  // Sites
  const sitesActive=sites.filter(s=>s.status==='active');
  const sitesDone=sites.filter(s=>s.status==='done').length;
  const sitesPaused=sites.filter(s=>s.status==='paused').length;
  const avgPct=sites.length?Math.round(sites.reduce((a,s)=>a+(s.completion_percent||0),0)/sites.length):0;

  // Workers & machinery
  const totalWorkers=bases.reduce((a,b)=>a+(b.workers||[]).length,0);
  const broken=pgkMachinery.filter(m=>m.status==='broken').length;
  const working=pgkMachinery.filter(m=>m.status==='working').length;
  const brokenList=pgkMachinery.filter(m=>m.status==='broken');

  // Site tasks (overdue/soon)
  let overdueTasks=0,soonTasks=0;
  try{
    const details=await Promise.all(
      sitesActive.slice(0,20).map(s=>fetch(`${API}/sites/${s.id}`).then(r=>r.json()).catch(()=>s))
    );
    details.forEach(s=>(s.tasks||[]).forEach(t=>{
      if(t.status==='done')return;
      if(t.due_date&&t.due_date<today)overdueTasks++;
      else if(t.due_date&&t.due_date<=in3)soonTasks++;
    }));
  }catch(e){}

  // Global tasks
  const gtOpen=gtasks.filter(t=>t.status==='open'||t.status==='new').length;
  const gtInprog=gtasks.filter(t=>t.status==='inprog'||t.status==='in_progress').length;
  const gtDone=gtasks.filter(t=>t.status==='done'||t.status==='closed').length;
  const gtOverdue=gtasks.filter(t=>t.status!=='done'&&t.status!=='closed'&&t.due_date&&t.due_date<today).length;

  // Cargo
  const cargoNew=cargo.filter(c=>c.status==='new').length;
  const cargoTransit=cargo.filter(c=>c.status==='transit'||c.status==='in_transit').length;
  const cargoDelivered=cargo.filter(c=>c.status==='delivered').length;
  const cargoPending=cargo.filter(c=>c.status!=='delivered').slice(0,5);

  // Long field workers
  const longField=[];
  bases.forEach(b=>(b.workers||[]).forEach(w=>{
    if(w.start_date){const d=Math.floor((Date.now()-new Date(w.start_date))/86400000);if(d>=30)longField.push({name:w.name,days:d,base:b.name});}
  }));
  longField.sort((a,b)=>b.days-a.days);

  // Low materials
  const lowMats=[];
  bases.forEach(b=>(b.materials||[]).forEach(m=>{
    if(m.min_amount>0&&m.amount<m.min_amount)lowMats.push({name:m.name,amount:m.amount,min:m.min_amount,unit:m.unit,base:b.name});
  }));

  // Alerts
  const alerts=[];
  if(overdueTasks>0)alerts.push({type:'err',icon:'⏰',title:`Просроченные задачи объектов: ${overdueTasks}`,body:'Требуют немедленного внимания.'});
  if(gtOverdue>0)alerts.push({type:'err',icon:'📋',title:`Просроченные общие задачи: ${gtOverdue}`,body:'Проверьте список задач.'});
  if(broken>0)alerts.push({type:'err',icon:'🔧',title:`Техника неисправна: ${broken} ед.`,body:brokenList.slice(0,3).map(m=>esc(m.name)).join(', ')+(brokenList.length>3?'…':'')});
  if(lowMats.length>0)alerts.push({type:'warn',icon:'📦',title:`Запасы ниже минимума: ${lowMats.length} поз.`,body:lowMats.slice(0,2).map(m=>`${esc(m.name)} (${m.amount}/${m.min})`).join(', ')+(lowMats.length>2?'…':'')});
  if(soonTasks>0)alerts.push({type:'warn',icon:'📅',title:`Задачи истекают через 3 дня: ${soonTasks}`,body:'Проверьте сроки выполнения.'});

  const statusColor=s=>s==='active'?'var(--acc)':s==='done'?'var(--grn)':s==='paused'?'var(--ylw)':'var(--tx3)';
  const cargoStatusLabel=s=>({new:'Новая',transit:'В пути',in_transit:'В пути',delivered:'Доставлена',cancelled:'Отменена'}[s]||s);
  const cargoStatusColor=s=>s==='delivered'?'var(--grn)':s==='transit'||s==='in_transit'?'var(--acc)':s==='new'?'var(--ylw)':'var(--tx3)';

  pb.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <h2 style="font-size:17px;font-weight:800;margin:0">📊 Дашборд</h2>
    <span style="font-size:10px;color:var(--tx3)">${new Date().toLocaleString('ru')}</span>
  </div>

  ${alerts.length?`<div style="margin-bottom:14px">${alerts.map(a=>`
    <div class="dash-alert ${a.type}">
      <div class="dash-alert-icon">${a.icon}</div>
      <div class="dash-alert-body"><div class="dash-alert-title">${a.title}</div><div style="color:var(--tx2)">${a.body}</div></div>
    </div>`).join('')}</div>`:''}

  <!-- KPI: 3 sections in one row -->
  <div class="dash-row" style="margin-bottom:14px">
    <!-- Objects -->
    <div class="dash-card" style="flex:1;min-width:220px">
      <h3>📍 Объекты</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.12)">🏗</div>
          <div><div class="dash-stat-val" style="color:var(--acc)">${sitesActive.length}</div><div class="dash-stat-lbl">Активных</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(5,122,85,.12)">✅</div>
          <div><div class="dash-stat-val" style="color:var(--grn)">${sitesDone}</div><div class="dash-stat-lbl">Завершено</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(146,64,14,.12)">⏸</div>
          <div><div class="dash-stat-val" style="color:#92400e">${sitesPaused}</div><div class="dash-stat-lbl">На паузе</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.08)">📈</div>
          <div><div class="dash-stat-val" style="color:${avgPct>=70?'var(--grn)':'var(--acc)'}">${avgPct}%</div><div class="dash-stat-lbl">Ср. готовность</div></div>
        </div>
      </div>
    </div>
    <!-- Personnel & machinery -->
    <div class="dash-card" style="flex:1;min-width:220px">
      <h3>👷 Люди и техника</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.12)">👷</div>
          <div><div class="dash-stat-val" style="color:var(--acc)">${totalWorkers}</div><div class="dash-stat-lbl">В поле</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(5,122,85,.12)">🚛</div>
          <div><div class="dash-stat-val" style="color:var(--grn)">${working}</div><div class="dash-stat-lbl">Техника в работе</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(200,30,30,.12)">🔴</div>
          <div><div class="dash-stat-val" style="color:${broken>0?'var(--red)':'var(--tx3)'}">${broken}</div><div class="dash-stat-lbl">Неисправно</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(146,64,14,.12)">⏳</div>
          <div><div class="dash-stat-val" style="color:${longField.length>0?'#92400e':'var(--tx3)'}">${longField.length}</div><div class="dash-stat-lbl">В поле 30+ дней</div></div>
        </div>
      </div>
    </div>
    <!-- Tasks -->
    <div class="dash-card" style="flex:1;min-width:220px">
      <h3>📋 Задачи</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.12)">📌</div>
          <div><div class="dash-stat-val" style="color:var(--acc)">${gtOpen}</div><div class="dash-stat-lbl">Открытых</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(124,58,237,.12)">⚙️</div>
          <div><div class="dash-stat-val" style="color:#7c3aed">${gtInprog}</div><div class="dash-stat-lbl">В работе</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(5,122,85,.12)">✅</div>
          <div><div class="dash-stat-val" style="color:var(--grn)">${gtDone}</div><div class="dash-stat-lbl">Выполнено</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(200,30,30,.12)">⏰</div>
          <div><div class="dash-stat-val" style="color:${gtOverdue>0?'var(--red)':'var(--tx3)'}">${gtOverdue}</div><div class="dash-stat-lbl">Просрочено</div></div>
        </div>
      </div>
    </div>
    <!-- Cargo -->
    <div class="dash-card" style="flex:1;min-width:220px">
      <h3>🚚 Грузы</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(146,64,14,.12)">🆕</div>
          <div><div class="dash-stat-val" style="color:#92400e">${cargoNew}</div><div class="dash-stat-lbl">Новых заявок</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.12)">🚚</div>
          <div><div class="dash-stat-val" style="color:var(--acc)">${cargoTransit}</div><div class="dash-stat-lbl">В пути</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(5,122,85,.12)">📬</div>
          <div><div class="dash-stat-val" style="color:var(--grn)">${cargoDelivered}</div><div class="dash-stat-lbl">Доставлено</div></div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat-icon" style="background:rgba(26,86,219,.08)">📦</div>
          <div><div class="dash-stat-val">${cargo.length}</div><div class="dash-stat-lbl">Всего</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Detail rows row 1 -->
  <div class="dash-row">
    <!-- Objects progress -->
    <div class="dash-col" style="flex:2;min-width:260px">
      <h4>📍 Прогресс активных объектов</h4>
      ${sitesActive.slice(0,10).map(s=>`
        <div class="dash-item">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:var(--tx1)" onclick="switchView('map');selectSite('${s.id}')">${esc(s.name)}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:70px;height:6px;background:var(--s3);border-radius:3px">
              <div style="width:${s.completion_percent||0}%;height:6px;background:${(s.completion_percent||0)>=70?'var(--grn)':'var(--acc)'};border-radius:3px;transition:width .3s"></div>
            </div>
            <span style="font-size:10px;font-weight:800;color:${(s.completion_percent||0)>=70?'var(--grn)':'var(--acc)'};min-width:30px">${s.completion_percent||0}%</span>
          </div>
        </div>`).join('')||'<div style="font-size:11px;color:var(--tx3);padding:8px 0">Нет активных объектов</div>'}
    </div>
    <!-- Cargo in progress -->
    <div class="dash-col" style="flex:1;min-width:200px">
      <h4>🚚 Активные перевозки (${cargoPending.length})</h4>
      ${cargoPending.map(c=>`
        <div class="dash-item">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">№${esc(c.num||'—')}${c.driver?` · ${esc(c.driver)}`:''}
          </span>
          <span style="font-size:10px;font-weight:700;color:${cargoStatusColor(c.status)}">${cargoStatusLabel(c.status)}</span>
        </div>`).join('')||'<div style="font-size:11px;color:var(--grn);padding:8px 0">Нет активных заявок ✓</div>'}
    </div>
    <!-- Broken machinery -->
    <div class="dash-col" style="flex:1;min-width:180px">
      <h4>🔧 Неисправная техника (${broken})</h4>
      ${brokenList.slice(0,8).map(m=>{const b=bases.find(x=>x.id===m.base_id);return`
        <div class="dash-item">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span>
          <span style="font-size:10px;color:var(--tx3)">${b?esc(b.name):''}</span>
        </div>`}).join('')||'<div style="font-size:11px;color:var(--grn);padding:8px 0">Всё исправно ✓</div>'}
    </div>
  </div>

  <!-- Detail rows row 2 -->
  <div class="dash-row">
    <!-- Low materials -->
    <div class="dash-col" style="flex:1;min-width:200px">
      <h4>📦 Запасы ниже минимума (${lowMats.length})</h4>
      ${lowMats.slice(0,8).map(m=>`
        <div class="dash-item">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}<span style="font-size:9px;color:var(--tx3);margin-left:4px">(${esc(m.base)})</span></span>
          <span style="font-size:10px;color:var(--red);font-weight:700;white-space:nowrap">${m.amount}/${m.min} ${esc(m.unit)}</span>
        </div>`).join('')||'<div style="font-size:11px;color:var(--grn);padding:8px 0">Запасы в норме ✓</div>'}
    </div>
    <!-- Long field workers -->
    <div class="dash-col" style="flex:1;min-width:200px">
      <h4>👷 В поле 30+ дней (${longField.length})</h4>
      ${longField.slice(0,8).map(w=>`
        <div class="dash-item">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</span>
          <span style="font-size:10px;font-weight:700;color:${w.days>=45?'var(--red)':'#92400e'};margin-right:6px">${w.days} дн.</span>
          <span style="font-size:10px;color:var(--tx3)">${esc(w.base)}</span>
        </div>`).join('')||'<div style="font-size:11px;color:var(--tx3);padding:8px 0">Нет</div>'}
    </div>
    <!-- Bases -->
    <div class="dash-col" style="flex:1;min-width:180px">
      <h4>🏕 Базы (${bases.length})</h4>
      ${bases.slice(0,8).map(b=>`
        <div class="dash-item" style="cursor:pointer" onclick="switchView('map');selectBase('${b.id}')">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
          <span style="font-size:10px;color:var(--tx3);white-space:nowrap">👷 ${(b.workers||[]).length} · 🚛 ${(b.machinery||[]).length}</span>
        </div>`).join('')||'<div style="font-size:11px;color:var(--tx3);padding:8px 0">Нет баз</div>'}
    </div>
    <!-- Recent activity -->
    <div class="dash-col" style="flex:1;min-width:220px">
      <h4>🕐 Последние события</h4>
      ${(actLog||[]).slice(0,8).map(e=>`
        <div class="dash-item" style="align-items:flex-start;padding:5px 0">
          <div style="flex:1">
            <div style="font-size:11px;font-weight:600;color:var(--tx1)">${esc(e.action||e.type||'')}</div>
            <div style="font-size:10px;color:var(--tx3)">${esc(e.detail||e.body||'')} ${e.user_name||e.user?`· ${esc(e.user_name||e.user)}`:''}
            </div>
          </div>
          <span style="font-size:9px;color:var(--tx3);margin-left:6px;white-space:nowrap">${e.created_at?new Date(e.created_at).toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</span>
        </div>`).join('')||'<div style="font-size:11px;color:var(--tx3);padding:8px 0">Нет данных</div>'}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════════════════════════════
async function openBackupModal(){
  const [list,settings]=await Promise.all([
    fetch(`${API}/backups`).then(r=>r.json()).catch(()=>[]),
    fetch(`${API}/backups/settings`).then(r=>r.json()).catch(()=>({interval_hours:2,max_count:10})),
  ]);
  showModal('💾 Резервные копии',`
    <div style="background:var(--s2);border-radius:var(--rs);padding:8px 10px;margin-bottom:10px;font-size:11px">
      <div style="font-weight:700;color:var(--tx2);margin-bottom:5px">⏱ Автозапись</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label>Интервал, ч:
          <input id="bk-interval" type="number" min="0" max="168" step="0.5" value="${settings.interval_hours}" style="width:60px;padding:3px 5px;border:1px solid var(--bd);border-radius:4px;font-size:11px">
        </label>
        <label>Хранить копий:
          <input id="bk-max" type="number" min="1" max="200" value="${settings.max_count}" style="width:55px;padding:3px 5px;border:1px solid var(--bd);border-radius:4px;font-size:11px">
        </label>
        <button class="btn bp bxs" onclick="saveBackupSettings()">Сохранить</button>
        <button class="btn bs bxs" onclick="runAutoBackup()" title="Сделать автокопию сейчас">▶ Сейчас</button>
      </div>
      <div style="color:var(--tx3);margin-top:4px">0 ч — отключить автокопию. Старые автокопии удаляются по очереди.</div>
    </div>
    <div style="margin-bottom:10px">
      <button class="btn bp bsm" onclick="createBackup()">💾 Создать резервную копию</button>
    </div>
    <div id="backup-list" style="max-height:300px;overflow-y:auto">
      ${list.length?list.map(f=>`<div class="li" style="padding:5px 8px">
        <div class="lim"><div class="lin" style="font-size:11px">${esc(f.name)}</div>
          <div class="lis">${new Date(f.date).toLocaleString('ru')} · ${Math.round(f.size/1024)} KB</div></div>
        <button class="btn bs bxs" onclick="restoreBackup('${esc(f.name)}')">↩️ Восст.</button>
      </div>`).join(''):'<div class="empty">Нет резервных копий</div>'}
    </div>`,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
async function saveBackupSettings(){
  const ih=parseFloat(document.getElementById('bk-interval').value);
  const mc=parseInt(document.getElementById('bk-max').value);
  const r=await fetch(`${API}/backups/settings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({interval_hours:ih,max_count:mc})}).then(r=>r.json()).catch(()=>({error:'Ошибка'}));
  if(r.ok||r.interval_hours!=null)toast(`Автокопия каждые ${r.interval_hours} ч, хранить ${r.max_count}`,'ok');
  else toast('Ошибка: '+(r.error||''),'err');
}
async function runAutoBackup(){
  const r=await fetch(`${API}/backups/run-auto`,{method:'POST'}).then(r=>r.json()).catch(()=>({error:'Ошибка'}));
  if(r.ok){toast('Автокопия создана','ok');closeModal();openBackupModal();}
  else toast('Ошибка: '+(r.error||''),'err');
}
async function createBackup(){
  const r=await fetch(`${API}/backups/create`,{method:'POST'}).then(r=>r.json()).catch(()=>({error:'Ошибка'}));
  if(r.ok)toast('Резервная копия создана: '+r.name,'ok');
  else toast('Ошибка: '+(r.error||''),'err');
  closeModal();openBackupModal();
}
async function restoreBackup(name){
  if(!confirm('Восстановить из резервной копии "'+name+'"?\nТекущие данные будут сохранены в отдельный бэкап.'))return;
  const r=await fetch(`${API}/backups/restore/`+encodeURIComponent(name),{method:'POST'}).then(r=>r.json()).catch(()=>({error:'Ошибка'}));
  if(r.ok)toast(r.message,'ok');
  else toast('Ошибка: '+(r.error||''),'err');
}

// ═══════════════════════════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════════════════════════
async function renderPhotos(refType, refId, container){
  const photos=await fetch(`${API}/photos?entity_type=${refType}&entity_id=${refId}`).then(r=>r.json()).catch(()=>[]);
  container.innerHTML=`<div class="photo-grid">
    ${photos.map(p=>`<div class="photo-thumb" onclick="viewPhoto('${esc(p.url)}','${esc(p.caption||'')}')">
      <img src="${esc(p.url)}" loading="lazy">
      ${p.caption?`<div class="photo-caption">${esc(p.caption)}</div>`:''}
      <button class="ph-del" onclick="event.stopPropagation();deletePhoto('${p.id}','${refType}','${refId}',this.closest('.photo-grid').parentNode)">✕</button>
    </div>`).join('')}
    <label class="photo-upload" title="Добавить фото">
      <span style="font-size:20px">📷</span>
      <span>Добавить</span>
      <input type="file" accept="image/*" multiple style="display:none" onchange="uploadPhotos(event,'${refType}','${refId}',this.closest('.photo-grid').parentNode)">
    </label>
  </div>`;
}
async function uploadPhotos(ev, refType, refId, container){
  const files=[...ev.target.files];
  if(!files.length)return;
  toast('Загружаю '+files.length+' фото...','ok');
  for(const f of files){
    const fd=new FormData();
    fd.append('photo',f);fd.append('entity_type',refType);fd.append('entity_id',refId);
    fd.append('caption','');fd.append('user_name',un());
    await fetch(`${API}/photos/upload`,{method:'POST',body:fd}).catch(()=>{});
  }
  renderPhotos(refType,refId,container);toast('Фото добавлены','ok');
}
async function deletePhoto(id,refType,refId,container){
  if(!confirm('Удалить фото?'))return;
  await fetch(`${API}/photos/${id}`,{method:'DELETE'});
  renderPhotos(refType,refId,container);
}
function viewPhoto(url,caption){
  showModal(caption||'Фото',`<div style="text-align:center"><img src="${url}" style="max-width:100%;max-height:70vh;border-radius:var(--r)"></div>`,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
}

// ═══════════════════════════════════════════════════════════
// QUICK ACTIONS (PGK status change inline)
// ═══════════════════════════════════════════════════════════
async function pgkQuickStatus(machId, newStatus){
  const m=pgkMachinery.find(x=>x.id===machId);if(!m)return;
  await fetch(`${API}/pgk/machinery/${machId}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...m,status:newStatus,user_name:un()})});
  await loadPGK();
  toast(`${m.name}: ${SL[newStatus]}`,'ok');
  if(currentObj)refreshCurrent();
}

// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════
const SITE_TEMPLATES={
  'inzh-geo':{name:'Инженерно-геологические изыскания',volumes:[
    {name:'Буровые работы',unit:'пог.м',category:'geology'},
    {name:'Полевые испытания грунтов',unit:'опыт',category:'geology'},
    {name:'Отбор проб',unit:'проба',category:'geology'},
    {name:'Лабораторные работы',unit:'проба',category:'geology'},
    {name:'Камеральная обработка',unit:'%',category:'geology'},
  ]},
  'inzh-geod':{name:'Инженерно-геодезические изыскания',volumes:[
    {name:'Топографическая съёмка',unit:'га',category:'geodesy'},
    {name:'Нивелирование',unit:'км',category:'geodesy'},
    {name:'Разбивочные работы',unit:'точка',category:'geodesy'},
    {name:'Камеральная обработка',unit:'%',category:'geodesy'},
  ]},
  'inzh-eco':{name:'Инженерно-экологические изыскания',volumes:[
    {name:'Маршрутные наблюдения',unit:'км',category:'geology'},
    {name:'Отбор проб воды',unit:'проба',category:'geology'},
    {name:'Отбор проб грунта',unit:'проба',category:'geology'},
    {name:'Лабораторный анализ',unit:'проба',category:'geology'},
    {name:'Камеральная обработка',unit:'%',category:'geology'},
  ]},
  'inzh-metr':{name:'Инженерно-метеорологические изыскания',volumes:[
    {name:'Полевые наблюдения',unit:'день',category:'geology'},
    {name:'Обработка данных',unit:'%',category:'geology'},
  ]},
};
function openSiteTemplateModal(){
  const opts=Object.entries(SITE_TEMPLATES).map(([k,t])=>
    `<option value="${k}">${t.name}</option>`).join('');
  showModal('Шаблон объекта',`<div class="fgr fone">
    <div class="fg"><label>Шаблон работ</label><select id="f-tpl"><option value="">— без шаблона —</option>${opts}</select></div>
    <p style="font-size:10px;color:var(--tx3);margin-top:4px">Выбрав шаблон, объёмы работ будут добавлены автоматически</p>
  </div>`,[
    {label:'Без шаблона',cls:'bs',fn:()=>{closeModal();openAddSiteModal();}},
    {label:'Создать →',cls:'bp',fn:()=>{window._siteTemplate=v('f-tpl')||null;closeModal();openAddSiteModal();}}
  ]);
}

async function openPhotosModal(refType, refId){
  const title=refType==='site'?'📷 Фото объекта':'📷 Фото базы';
  // Fetch photos first, then show modal with content
  const photos=await fetch(`${API}/photos?entity_type=${refType}&entity_id=${refId}`).then(r=>r.json()).catch(()=>[]);
  const gridHtml=`<div class="photo-grid">
    ${photos.map(p=>`<div class="photo-thumb" onclick="viewPhoto('${esc(p.url)}','${esc(p.caption||'')}')">
      <img src="${esc(p.url)}" loading="lazy">
      ${p.caption?`<div class="photo-caption">${esc(p.caption)}</div>`:''}
    </div>`).join('')}
    <label class="photo-upload" title="Добавить фото">
      <span style="font-size:20px">📷</span><span>Добавить</span>
      <input type="file" accept="image/*" multiple style="display:none"
        onchange="handlePhotoUpload(event,'${refType}','${refId}')">
    </label>
  </div>
  ${photos.length===0?'<div style="font-size:11px;color:var(--tx3);text-align:center;margin-top:6px">Нет фотографий</div>':''}`;
  showModal(title,gridHtml,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
}
async function handlePhotoUpload(ev,refType,refId){
  const files=[...ev.target.files];
  if(!files.length)return;
  toast('Загружаю '+files.length+' фото...','ok');
  for(const f of files){
    const fd=new FormData();
    fd.append('photo',f);fd.append('entity_type',refType);fd.append('entity_id',refId);
    fd.append('caption','');fd.append('user_name',un());
    await fetch(`${API}/photos/upload`,{method:'POST',body:fd}).catch(()=>{});
  }
  closeModal();
  toast('Фото добавлены','ok');
  // Reopen to show new photos
  openPhotosModal(refType,refId);
}

// ═══════════════════════════════════════════════════════════
// DAILY DIGEST — уведомление при входе
// ═══════════════════════════════════════════════════════════

async function showDailyDigest(){
  // Only show once per day per browser
  const today=new Date().toISOString().split('T')[0];
  const lastShown=localStorage.getItem('digest_shown');
  if(lastShown===today)return;
  try{
    const log=await fetch(`${API}/log?today=1`).then(r=>r.json());
    if(!log.length)return;
    // Group by action type
    const groups={};
    log.forEach(e=>{
      const key=e.action||'Действие';
      if(!groups[key])groups[key]=[];
      groups[key].push(e);
    });
    const total=log.length;
    const users=[...new Set(log.map(e=>e.user_name).filter(Boolean))];
    const html=`
      <div style="margin-bottom:10px;padding:8px 10px;background:var(--s2);border-radius:var(--rs);display:flex;gap:12px;flex-wrap:wrap">
        <div><span style="font-size:18px;font-weight:800;color:var(--acc)">${total}</span><span style="font-size:10px;color:var(--tx3);display:block">событий</span></div>
        <div><span style="font-size:18px;font-weight:800;color:var(--bpc)">${users.length}</span><span style="font-size:10px;color:var(--tx3);display:block">пользователей</span></div>
      </div>
      ${users.length?'<div style="font-size:10px;color:var(--tx3);margin-bottom:8px">👤 '+users.join(', ')+'</div>':''}
      <div style="max-height:320px;overflow-y:auto">
        ${log.slice(0,50).map(e=>`
          <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd);align-items:flex-start">
            <div style="font-size:9px;color:var(--tx3);min-width:44px;padding-top:1px">${(e.created_at||'').slice(11,16)}</div>
            <div style="flex:1">
              <div style="font-size:11px;font-weight:600">${esc(e.action||'')}</div>
              ${e.details?`<div style="font-size:10px;color:var(--tx2)">${esc(e.details)}</div>`:''}
              <div style="font-size:9px;color:var(--tx3)">${e.site_name?'📍 '+esc(e.site_name):''}${e.base_name?' · 🏕 '+esc(e.base_name):''} · ${esc(e.user_name||'')}</div>
            </div>
          </div>`).join('')}
      </div>`;
    showModal('📋 События за сегодня',html,[
      {label:'Закрыть',cls:'bs',fn:closeModal},
      {label:'Открыть журнал',cls:'bp',fn:()=>{closeModal();openGLog();}}
    ]);
    localStorage.setItem('digest_shown',today);
  }catch(e){}
}

// ═══════════════════════════════════════════════════════════
// ИСТОРИЯ ПЕРЕМЕЩЕНИЙ ТЕХНИКИ
// ═══════════════════════════════════════════════════════════
let historyLayer=null;


