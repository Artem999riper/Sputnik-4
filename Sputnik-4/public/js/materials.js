async function openActualizeModal(matId){
  const mat=(currentObj&&currentObj.materials||[]).find(m=>m.id===matId);
  if(!mat)return;
  const today=new Date().toISOString().split('T')[0];
  showModal('📝 Движение материала — '+esc(mat.name),
    '<div class="fgr fone">'
    +'<div style="background:var(--s2);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;text-align:center">'
    +'Текущий остаток: <strong>'+mat.amount+' '+esc(mat.unit)+'</strong></div>'
    +'<div class="fg"><label>Тип операции</label>'
    +'<select id="f-mop"><option value="minus">➖ Расход (потратили)</option><option value="plus">➕ Приход (добавилось)</option></select></div>'
    +'<div class="fg"><label>Количество ('+esc(mat.unit)+') *</label>'
    +'<input id="f-ma" type="number" step="any" min="0" value="0" autofocus></div>'
    +'<div class="fg"><label>Дата</label>'
    +'<input id="f-md" type="date" value="'+today+'"></div>'
    +'<div class="fg"><label>Комментарий</label>'
    +'<input id="f-mn" placeholder="Причина..."></div>'
    +'</div>',
    [{label:'Отмена',cls:'bs',fn:closeModal},{label:'💾 Сохранить',cls:'bp',fn:async function(){
      const delta=parseFloat(v('f-ma'));
      if(isNaN(delta)||delta<=0){toast('Введите положительное количество','err');return;}
      const op=v('f-mop');
      const newAmt=op==='minus'?Math.max(0,mat.amount-delta):mat.amount+delta;
      const r=await fetch(API+'/materials/'+matId+'/actualize',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({new_amount:newAmt,act_date:v('f-md'),notes:(op==='minus'?'Расход: ':'Приход: ')+delta+' '+mat.unit+(v('f-mn')?' — '+v('f-mn'):''),user_name:un()})});
      const d=await r.json();
      closeModal();
      await refreshCurrent();currentTab='materials';renderTab();
      toast((op==='minus'?'Списано: -':'Добавлено: +')+delta.toFixed(2)+' '+mat.unit,'ok');
    }}]);
}
async function openMatLogModal(matId){
  const mat=(currentObj&&currentObj.materials||[]).find(m=>m.id===matId);
  if(!mat)return;
  const log=await fetch(API+'/materials/'+matId+'/log').then(r=>r.json()).catch(()=>[]);
  const html='<div style="margin-bottom:8px;font-size:12px;font-weight:700">'+esc(mat.name)
    +' · текущий остаток: <strong>'+mat.amount+' '+esc(mat.unit)+'</strong></div>'
    +(mat.last_act_date?'<div style="font-size:10px;color:var(--tx3);margin-bottom:8px">Последняя актуализация: '+fmt(mat.last_act_date)+'</div>':'')
    +'<div style="max-height:360px;overflow-y:auto">'
    +(log.length?log.map(function(l){
      const diff=l.change_amount||0;
      const clr=diff>0?'var(--grn)':diff<0?'var(--red)':'var(--tx3)';
      return'<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd);align-items:center">'
        +'<div style="font-size:9px;color:var(--tx3);min-width:72px">'+fmt(l.act_date)+'</div>'
        +'<div style="flex:1">'
        +'<div style="font-size:12px;font-weight:700">'+l.new_amount+' '+esc(mat.unit)
        +' <span style="font-size:11px;color:'+clr+'font-weight:700">'+(diff>=0?'+':'')+diff.toFixed(2)+'</span></div>'
        +(l.notes?'<div style="font-size:10px;color:var(--tx2)">'+esc(l.notes)+'</div>':'')
        +'<div style="font-size:9px;color:var(--tx3)">'+esc(l.user_name||'')+'</div>'
        +'</div></div>';
    }).join(''):'<div class="empty">Нет записей актуализации</div>')
    +'</div>';
  showModal('📋 История актуализаций — '+esc(mat.name),html,[{label:'Закрыть',cls:'bs',fn:closeModal}]);
}

// ═══════════════════════════════════════════════════════════
// VOL COMMENT & VERTEX EDIT
// ═══════════════════════════════════════════════════════════
