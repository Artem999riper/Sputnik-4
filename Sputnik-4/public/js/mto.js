// ═══════════════════════════════════════════════════════════
// mto.js — вкладка МТО (материально-техническое обеспечение)
// Справка о технических средствах: разделы, позиции,
// импорт/экспорт Word (.docx) и Excel (.xlsx)
// ═══════════════════════════════════════════════════════════

let mtoItems=[];
let _mtoQ='';

// Заголовки колонок формы (как в фирменной справке ПурГеоКом)
const MTO_DOC_HEADERS=['№  п/п',
  'НАИМЕНОВАНИЕ ТЕХНИЧЕСКИХ СРЕДСТВ (МАШИН, МЕХАНИЗМОВ, ОБОРУДОВАНИЯ, ОСНАСТКИ, СРЕДСТВ ИЗМЕРЕНИЙ)',
  'КОЛИЧЕСТВО','ГОД ВЫПУСКА','НОРМАТИВНЫЙ СРОК СЛУЖБЫ (ЛЕТ)','ПРИНАДЛЕЖНОСТЬ','Примечания'];

async function loadMTO(){
  try{
    const r=await fetch(`${API}/mto`);
    if(r.ok)mtoItems=await r.json();
  }catch(e){toast('Не удалось загрузить МТО','err');}
  renderMTO();
}

function _mtoCategories(){
  const seen=new Set(),out=[];
  mtoItems.forEach(it=>{const c=it.category||'';if(!seen.has(c)){seen.add(c);out.push(c);}});
  return out;
}

// Полная перерисовка страницы (каркас + строки).
// При наборе в поиске НЕ вызывается — иначе innerHTML пересоздаёт input
// и поле теряет фокус после каждой буквы; фильтр обновляет только tbody.
function renderMTO(){
  const pg=document.getElementById('mto-page');if(!pg)return;
  const cats=_mtoCategories();
  pg.innerHTML=`
    <div class="wt-toolbar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1.5px solid var(--bd);flex-wrap:wrap">
      <span style="font-size:14px;font-weight:800">🛠 МТО</span>
      <span style="font-size:10px;color:var(--tx3)">материально-техническое обеспечение</span>
      <input id="mto-search" type="search" placeholder="🔍 Поиск…" value="${esc(_mtoQ)}"
        style="font-size:11px;padding:4px 9px;border:1.5px solid var(--bd);border-radius:var(--rs);background:var(--s2);outline:none;min-width:170px;flex:1;max-width:340px"
        oninput="_mtoQ=this.value;mtoRenderRows()">
      <span style="flex:1"></span>
      <label class="btn bs bsm" style="cursor:pointer" title="Импорт таблицы из Word или Excel">
        📥 Импорт
        <input type="file" accept=".docx,.xlsx,.xls" style="display:none" onchange="mtoImportFile(this)">
      </label>
      <button class="btn bs bsm" onclick="mtoExportDocx()" title="Скачать справку Word">📤 Word</button>
      <button class="btn bs bsm" onclick="mtoExportXlsx()" title="Скачать Excel">📤 Excel</button>
      <button class="btn bp bsm" onclick="mtoAddItem()">＋ Добавить</button>
    </div>
    <div class="wt-summary" style="padding:4px 14px;display:flex;gap:14px;font-size:11px;color:var(--tx2)">
      <span>Позиций: <b>${mtoItems.length}</b></span>
      <span>Разделов: <b>${cats.filter(c=>c).length}</b></span>
      <span id="mto-shown" style="color:var(--acc);display:none">Показано: <b id="mto-shown-n"></b></span>
    </div>
    <div style="flex:1;overflow:auto">
      <table class="wt-tbl" style="min-width:900px">
        <thead><tr>
          <th class="no-sort" style="width:34px;text-align:center">#</th>
          <th class="no-sort">Наименование</th>
          <th class="no-sort" style="width:80px;text-align:center">Кол-во</th>
          <th class="no-sort" style="width:110px;text-align:center">Год выпуска</th>
          <th class="no-sort" style="width:100px;text-align:center">Состояние</th>
          <th class="no-sort" style="width:170px">Принадлежность</th>
          <th class="no-sort" style="min-width:120px">Примечания</th>
          <th class="no-sort" style="width:60px"></th>
        </tr></thead>
        <tbody id="mto-tbody"></tbody>
      </table>
    </div>`;
  mtoRenderRows();
}

// Перерисовывает только строки таблицы + счётчик «Показано» (каркас не трогает)
function mtoRenderRows(){
  const tb=document.getElementById('mto-tbody');if(!tb)return;
  const q=(_mtoQ||'').toLowerCase();
  const filtered=q?mtoItems.filter(it=>((it.name||'')+' '+(it.category||'')+' '+(it.ownership||'')+' '+(it.notes||'')).toLowerCase().includes(q)):mtoItems;
  let rows='',num=0;
  _mtoCategories().forEach(cat=>{
    const items=filtered.filter(it=>(it.category||'')===cat);
    if(!items.length)return;
    rows+=`<tr style="background:var(--s2)">
      <td colspan="8" style="padding:6px 10px;font-weight:800;font-size:11px;color:var(--acc)">
        ${esc(cat||'Без раздела')} <span style="font-weight:400;color:var(--tx3)">· ${items.length}</span>
      </td></tr>`;
    items.forEach(it=>{
      num++;
      rows+=`<tr oncontextmenu="event.preventDefault();mtoCtxMenu(event,'${escAttr(it.id)}')">
        <td style="text-align:center;color:var(--tx3);font-size:10px;width:34px">${num}</td>
        <td style="font-weight:600" class="td-link" onclick="mtoEditItem('${escAttr(it.id)}')" title="${esc(it.name)}">${esc(it.name)}</td>
        <td style="text-align:center;font-weight:700;color:var(--acc)">${esc(it.quantity||'')}</td>
        <td style="text-align:center">${esc(it.year||'')}</td>
        <td style="text-align:center">${esc(it.condition||'')}</td>
        <td>${esc(it.ownership||'')}</td>
        <td class="td-notes" title="${esc(it.notes||'')}">${esc(it.notes||'')}</td>
        <td style="white-space:nowrap;width:60px">
          <button class="btn bg bxs" onclick="mtoEditItem('${escAttr(it.id)}')" title="Редактировать">✏️</button>
          <button class="btn bg bxs" onclick="mtoDelItem('${escAttr(it.id)}')" title="Удалить">🗑</button>
        </td>
      </tr>`;
    });
  });
  tb.innerHTML=rows||`<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--tx3)">${
    q?'Ничего не найдено':'Список пуст — добавьте позицию или импортируйте таблицу (Word/Excel)'}</td></tr>`;
  const shown=document.getElementById('mto-shown');
  if(shown){
    const less=filtered.length<mtoItems.length;
    shown.style.display=less?'':'none';
    if(less)document.getElementById('mto-shown-n').textContent=filtered.length;
  }
}

function mtoCtxMenu(ev,id){
  showCtx(ev.clientX,ev.clientY,[
    {i:'✏️',l:'Редактировать',f:()=>mtoEditItem(id)},
    {i:'🗑',l:'Удалить',cls:'dan',f:()=>mtoDelItem(id)},
  ]);
}

// ── Добавление / редактирование ─────────────────────────────
function _mtoItemForm(it){
  const cats=_mtoCategories().filter(c=>c);
  const catOpts=`<option value="">— без раздела —</option>`
    +cats.map(c=>`<option value="${escAttr(c)}" ${it.category===c?'selected':''}>${esc(c)}</option>`).join('')
    +`<option value="__new__">＋ Новый раздел…</option>`;
  return `<div class="fgr">
    <div class="fg s2"><label>Наименование *</label><input id="f-mto-name" value="${escAttr(it.name||'')}" placeholder="Электронный тахеометр Trimble M3"></div>
    <div class="fg"><label>Раздел</label>
      <select id="f-mto-cat" onchange="document.getElementById('f-mto-catnew').style.display=this.value==='__new__'?'':'none'">${catOpts}</select>
    </div>
    <div class="fg" id="f-mto-catnew" style="display:none"><label>Новый раздел</label><input id="f-mto-catname" placeholder="Геодезическое оборудование"></div>
    <div class="fg"><label>Количество</label><input id="f-mto-qty" value="${escAttr(it.quantity||'')}" placeholder="2"></div>
    <div class="fg"><label>Год выпуска</label><input id="f-mto-year" value="${escAttr(it.year||'')}" placeholder="2011, 2017"></div>
    <div class="fg"><label>Состояние</label><input id="f-mto-cond" value="${escAttr(it.condition||'Исправен')}" placeholder="Исправен"></div>
    <div class="fg"><label>Принадлежность</label><input id="f-mto-own" value="${escAttr(it.ownership||'Собственность')}" placeholder="Собственность / Лизинг до…"></div>
    <div class="fg s2"><label>Примечания</label><textarea id="f-mto-notes">${esc(it.notes||'')}</textarea></div>
  </div>`;
}
function _mtoReadForm(){
  let category=(document.getElementById('f-mto-cat').value||'').trim();
  if(category==='__new__')category=(document.getElementById('f-mto-catname').value||'').trim();
  return {
    category,
    name:(document.getElementById('f-mto-name').value||'').trim(),
    quantity:(document.getElementById('f-mto-qty').value||'').trim(),
    year:(document.getElementById('f-mto-year').value||'').trim(),
    condition:(document.getElementById('f-mto-cond').value||'').trim()||'Исправен',
    ownership:(document.getElementById('f-mto-own').value||'').trim(),
    notes:(document.getElementById('f-mto-notes').value||'').trim(),
  };
}
function mtoAddItem(){
  showModal('＋ Позиция МТО',_mtoItemForm({}),[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Добавить',cls:'bp',fn:async()=>{
      const b=_mtoReadForm();
      if(!b.name){toast('Введите наименование','err');return;}
      await fetch(`${API}/mto`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,user_name:un()})});
      closeModal();await loadMTO();toast('Добавлено','ok');
    }}]);
}
function mtoEditItem(id){
  const it=mtoItems.find(x=>x.id===id);if(!it)return;
  showModal('✏️ '+esc(it.name),_mtoItemForm(it),[
    {label:'Отмена',cls:'bs',fn:closeModal},
    {label:'Сохранить',cls:'bp',fn:async()=>{
      const b=_mtoReadForm();
      if(!b.name){toast('Введите наименование','err');return;}
      await fetch(`${API}/mto/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,user_name:un()})});
      closeModal();await loadMTO();toast('Сохранено','ok');
    }}]);
}
async function mtoDelItem(id){
  if(!confirm('Удалить позицию?'))return;
  await fetch(`${API}/mto/${id}`,{method:'DELETE'});
  await loadMTO();toast('Удалено','ok');
}

// ── ИМПОРТ (.docx / .xlsx) ──────────────────────────────────
function mtoImportFile(input){
  const file=input.files[0];if(!file)return;
  input.value='';
  const ext=file.name.toLowerCase().split('.').pop();
  if(ext==='docx')_mtoImportDocx(file);
  else _mtoImportXlsx(file);
}

// Разбор строк таблицы (общая логика для docx/xlsx):
// строка-раздел = заполнено только «наименование»; данные = имя + любое из полей
function _mtoRowsToItems(rows){
  const items=[];let curCat='';
  rows.forEach(cells=>{
    const c=cells.map(x=>String(x==null?'':x).trim());
    const nonempty=c.filter(Boolean);
    if(!nonempty.length)return;
    // пропускаем заголовок
    if(c.some(x=>x.toUpperCase().includes('НАИМЕНОВАНИЕ ТЕХНИЧЕСКИХ')))return;
    // раздел: одна значимая ячейка
    if(nonempty.length===1){curCat=nonempty[0];return;}
    // данные: [№, name, qty, year, condition, ownership, notes] (7 колонок формы)
    let name,qty,year,cond,own,notes;
    if(c.length>=6){name=c[1];qty=c[2];year=c[3];cond=c[4];own=c[5];notes=c[6]||'';}
    else {name=c[0];qty=c[1]||'';year=c[2]||'';cond=c[3]||'';own=c[4]||'';notes='';}
    if(!name){ // № пустой и имя съехало
      name=nonempty[0];
    }
    if(!name)return;
    items.push({category:curCat,name,quantity:qty,year,condition:cond||'Исправен',ownership:own,notes});
  });
  return items;
}

function _mtoImportXlsx(file){
  const go=()=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        _mtoImportPreview(_mtoRowsToItems(rows),file.name);
      }catch(err){toast('Ошибка чтения Excel: '+err.message,'err');}
    };
    reader.readAsArrayBuffer(file);
  };
  if(window.XLSX)go();
  else{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=go;s.onerror=()=>toast('Не удалось загрузить библиотеку xlsx','err');
    document.head.appendChild(s);
  }
}

function _mtoLoadJSZip(){
  return new Promise((resolve,reject)=>{
    if(window.JSZip)return resolve(window.JSZip);
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload=()=>resolve(window.JSZip);
    s.onerror=()=>reject(new Error('Не удалось загрузить JSZip (нужен интернет)'));
    document.head.appendChild(s);
  });
}

async function _mtoImportDocx(file){
  try{
    const JSZip=await _mtoLoadJSZip();
    const zip=await JSZip.loadAsync(file);
    const xml=await zip.file('word/document.xml').async('string');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const tbls=doc.getElementsByTagNameNS(W,'tbl');
    if(!tbls.length){toast('В документе нет таблиц','err');return;}
    // Берём самую большую таблицу
    let best=tbls[0],bestRows=0;
    for(let i=0;i<tbls.length;i++){
      const n=tbls[i].getElementsByTagNameNS(W,'tr').length;
      if(n>bestRows){bestRows=n;best=tbls[i];}
    }
    const rows=[];
    const trs=best.getElementsByTagNameNS(W,'tr');
    for(let r=0;r<trs.length;r++){
      // только прямые ячейки строки (вложенных таблиц в форме нет)
      const cells=[];
      const tcs=trs[r].getElementsByTagNameNS(W,'tc');
      for(let ci=0;ci<tcs.length;ci++){
        const ts=tcs[ci].getElementsByTagNameNS(W,'t');
        let txt='';
        for(let ti=0;ti<ts.length;ti++)txt+=ts[ti].textContent;
        cells.push(txt.trim());
      }
      rows.push(cells);
    }
    _mtoImportPreview(_mtoRowsToItems(rows),file.name);
  }catch(err){toast('Ошибка чтения Word: '+err.message,'err');}
}

function _mtoImportPreview(items,fname){
  if(!items.length){toast('Не удалось распознать строки таблицы','err');return;}
  window._mtoImportItems=items;
  const cats={};items.forEach(it=>{cats[it.category||'Без раздела']=(cats[it.category||'Без раздела']||0)+1;});
  const catRows=Object.entries(cats).map(([c,n])=>
    `<div style="display:flex;justify-content:space-between;padding:3px 8px;font-size:11px;border-bottom:1px solid var(--bd)">
      <span style="font-weight:600">${esc(c)}</span><span style="color:var(--acc);font-weight:700">${n}</span></div>`).join('');
  showModal('📥 Импорт МТО — '+esc(fname),`
    <div style="font-size:12px;margin-bottom:8px">Распознано позиций: <b style="color:var(--acc)">${items.length}</b></div>
    <div style="max-height:220px;overflow-y:auto;border:1.5px solid var(--bd);border-radius:var(--rs);margin-bottom:10px">${catRows}</div>
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;padding:4px 0;cursor:pointer">
      <input type="radio" name="mto-imp-mode" value="replace" checked> <b>Заменить</b> текущий список (${mtoItems.length} позиций)
    </label>
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;padding:4px 0;cursor:pointer">
      <input type="radio" name="mto-imp-mode" value="append"> <b>Добавить</b> к текущему списку
    </label>`,
    [{label:'Отмена',cls:'bs',fn:closeModal},
     {label:'✅ Импортировать',cls:'bp',fn:async()=>{
       const replace=(document.querySelector('input[name="mto-imp-mode"]:checked')||{}).value!=='append';
       closeModal();
       toast('⏳ Импортирую…','ok');
       const r=await fetch(`${API}/mto/bulk`,{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({items:window._mtoImportItems,replace,user_name:un()})});
       if(r.ok){const j=await r.json();await loadMTO();toast(`✅ Импортировано, всего позиций: ${j.total}`,'ok');}
       else toast('Ошибка импорта','err');
       window._mtoImportItems=null;
     }}]);
}

// ── ЭКСПОРТ Excel ───────────────────────────────────────────
function mtoExportXlsx(){
  if(!mtoItems.length){toast('Список пуст','err');return;}
  const aoa=[MTO_DOC_HEADERS];
  let num=0;
  _mtoCategories().forEach(cat=>{
    const items=mtoItems.filter(it=>(it.category||'')===cat);
    if(!items.length)return;
    if(cat)aoa.push([cat]);
    items.forEach(it=>{num++;aoa.push([num,it.name,it.quantity||'',it.year||'',it.condition||'',it.ownership||'',it.notes||'']);});
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:6},{wch:60},{wch:12},{wch:14},{wch:16},{wch:24},{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'МТО');
  XLSX.writeFile(wb,`МТО_ПурГеоКом_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Excel сохранён','ok');
}

// ── ЭКСПОРТ Word (.docx) ────────────────────────────────────
function _mtoXml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _mtoDocxCell(text,opts){
  opts=opts||{};
  const w=opts.w?`<w:tcW w:w="${opts.w}" w:type="dxa"/>`:'<w:tcW w:w="0" w:type="auto"/>';
  const span=opts.span?`<w:gridSpan w:val="${opts.span}"/>`:'';
  const shd=opts.shade?`<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>`:'';
  const b=opts.bold?'<w:b/>':'';
  const jc=opts.center?'<w:jc w:val="center"/>':'';
  return `<w:tc><w:tcPr>${w}${span}${shd}<w:vAlign w:val="center"/></w:tcPr>`+
    `<w:p><w:pPr>${jc}</w:pPr><w:r><w:rPr>${b}<w:sz w:val="${opts.sz||20}"/></w:rPr><w:t xml:space="preserve">${_mtoXml(text)}</w:t></w:r></w:p></w:tc>`;
}
async function mtoExportDocx(){
  if(!mtoItems.length){toast('Список пуст','err');return;}
  let JSZip;
  try{JSZip=await _mtoLoadJSZip();}catch(e){toast(e.message,'err');return;}
  const widths=[600,4400,1000,1200,1300,1700,1200];
  let xmlRows='<w:tr>'+MTO_DOC_HEADERS.map((h,i)=>_mtoDocxCell(h,{bold:true,center:true,shade:true,w:widths[i],sz:18})).join('')+'</w:tr>';
  let num=0;
  _mtoCategories().forEach(cat=>{
    const items=mtoItems.filter(it=>(it.category||'')===cat);
    if(!items.length)return;
    if(cat)xmlRows+='<w:tr>'+_mtoDocxCell(cat,{bold:true,center:true,span:7,shade:true})+'</w:tr>';
    items.forEach(it=>{
      num++;
      xmlRows+='<w:tr>'
        +_mtoDocxCell(String(num),{center:true,w:widths[0]})
        +_mtoDocxCell(it.name,{w:widths[1]})
        +_mtoDocxCell(it.quantity||'',{center:true,w:widths[2]})
        +_mtoDocxCell(it.year||'',{center:true,w:widths[3]})
        +_mtoDocxCell(it.condition||'',{center:true,w:widths[4]})
        +_mtoDocxCell(it.ownership||'',{w:widths[5]})
        +_mtoDocxCell(it.notes||'',{w:widths[6]})
        +'</w:tr>';
    });
  });
  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
<w:t>СПРАВКА о материально-техническом обеспечении ООО «ПурГеоКом»</w:t></w:r></w:p>
<w:p/>
<w:tbl>
<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
</w:tblBorders></w:tblPr>
${xmlRows}
</w:tbl>
<w:p/>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134"/></w:sectPr>
</w:body></w:document>`;
  const zip=new JSZip();
  zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml',documentXml);
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`МТО_ПурГеоКом_${new Date().toISOString().slice(0,10)}.docx`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  toast('Word сохранён','ok');
}
