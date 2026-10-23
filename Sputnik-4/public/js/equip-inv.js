// ═══════════════════════════════════════════════════════════
// equip-inv.js — QR-наклейки на оборудование и инвентаризация.
//  • QR ведёт на карточку позиции: <адрес сервера>/#eq=<id> — телефон в сети
//    открывает программу сразу на этой карточке.
//  • Инвентаризация: что проверяем → отмечаем найденное сканером QR/штрихкодов
//    (он «печатает» текст в поле), по S/N или галочкой → отчёт.
// ═══════════════════════════════════════════════════════════
let _eqBaseUrl = null;
async function _eqUrlBase() {
  if (_eqBaseUrl) return _eqBaseUrl;
  try { const j = await fetch(`${API}/server-info`).then(r => r.json()); _eqBaseUrl = (j && j.lanUrl) || location.origin; }
  catch (e) { _eqBaseUrl = location.origin; }
  return _eqBaseUrl;
}
const _eqQrUrl = (base, id) => `${base}/#eq=${id}`;

// ── Наклейки ─────────────────────────────────────────────────
const QR_LAYOUTS = {
  big:   { n: 'Крупные — 3 × 7 (70 × 42 мм)', cols: 3, rows: 7, w: 70, h: 42.3, qr: 34, fs: 3.4 },
  mid:   { n: 'Средние — 4 × 10 (52,5 × 29,7 мм)', cols: 4, rows: 10, w: 52.5, h: 29.7, qr: 24, fs: 2.7 },
  small: { n: 'Мелкие — 5 × 13 (38 × 21 мм)', cols: 5, rows: 13, w: 38, h: 21.2, qr: 17, fs: 2.1 },
};
function equipQrLabels(ids) {
  const list = (ids && ids.length ? ids : (window._eqShownIds || pgkEquipment.map(e => e.id))).map(id => pgkEquipment.find(e => e.id === id)).filter(Boolean);
  if (!list.length) { toast('Нет позиций для наклеек', 'warn'); return; }
  let last = {}; try { last = JSON.parse(localStorage.getItem('qr_labels') || '{}'); } catch (e) {}
  showModal(`🏷 QR-наклейки — ${list.length} поз.`, `<div class="fgr">
    <div class="fg s2"><label>Формат листа A4</label><select id="ql-lay">${Object.entries(QR_LAYOUTS).map(([k, v]) => `<option value="${k}" ${(last.lay || 'big') === k ? 'selected' : ''}>${v.n}</option>`).join('')}</select></div>
    <div class="fg s2" style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px">
      <label style="display:flex;gap:5px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="ql-sn" ${last.sn !== false ? 'checked' : ''} style="width:auto;margin:0"> серийный №</label>
      <label style="display:flex;gap:5px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="ql-type" ${last.type !== false ? 'checked' : ''} style="width:auto;margin:0"> тип</label>
      <label style="display:flex;gap:5px;align-items:center;text-transform:none;font-weight:500;margin:0"><input type="checkbox" id="ql-org" ${last.org !== false ? 'checked' : ''} style="width:auto;margin:0"> «ПурГеоКом»</label>
    </div>
    <div class="fg"><label>Пропустить первые наклейки</label><input id="ql-skip" type="number" min="0" value="0" title="Если часть листа уже использована"></div>
    <div class="fg s2" style="font-size:11px;color:var(--tx3);line-height:1.5">QR открывает карточку позиции на телефоне (телефон в той же сети, что и сервер). В окне печати выберите «Масштаб 100%» и отключите поля/колонтитулы.</div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '🖨 Открыть для печати', cls: 'bp', fn: async () => {
    const o = { lay: v('ql-lay'), sn: document.getElementById('ql-sn').checked, type: document.getElementById('ql-type').checked, org: document.getElementById('ql-org').checked };
    try { localStorage.setItem('qr_labels', JSON.stringify(o)); } catch (e) {}
    const skip = Math.max(0, parseInt(v('ql-skip')) || 0);
    closeModal();
    await _qrPrint(list, o, skip);
  } }]);
}
async function _qrPrint(list, o, skip) {
  const L = QR_LAYOUTS[o.lay] || QR_LAYOUTS.big, base = await _eqUrlBase();
  const cell = e => {
    const gr = (pgkEquipGroups.find(g => g.id === e.group_id) || {}).name || '';
    return `<div class="c"><div class="q">${qrSvg(_eqQrUrl(base, e.id), { quiet: 1 })}</div><div class="t">
      <div class="n">${esc(e.name)}</div>
      ${o.sn && e.serial_number ? `<div>S/N ${esc(e.serial_number)}</div>` : ''}
      ${o.type && (e.type || gr) ? `<div>${esc(e.type || gr)}</div>` : ''}
      ${o.org ? '<div class="o">ПурГеоКом</div>' : ''}</div></div>`;
  };
  const cells = [...Array(skip).fill('<div class="c"></div>'), ...list.map(cell)];
  const per = L.cols * L.rows, pages = [];
  for (let i = 0; i < cells.length; i += per) pages.push(`<div class="p">${cells.slice(i, i + per).join('')}</div>`);
  const mx = (210 - L.cols * L.w) / 2, my = (297 - L.rows * L.h) / 2;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>QR-наклейки</title><style>
    @page{size:A4;margin:0} *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif}
    .p{width:210mm;height:297mm;padding:${my}mm ${mx}mm;display:grid;grid-template-columns:repeat(${L.cols},${L.w}mm);grid-auto-rows:${L.h}mm;page-break-after:always;overflow:hidden}
    .c{display:flex;align-items:center;gap:1.5mm;padding:1.5mm 2mm;overflow:hidden}
    .q{width:${L.qr}mm;height:${L.qr}mm;flex-shrink:0}.q svg{width:100%;height:100%;display:block}
    .t{font-size:${L.fs}mm;line-height:1.2;overflow:hidden;min-width:0}.n{font-weight:700;max-height:3.6em;overflow:hidden}.o{color:#555;margin-top:.4em}
    @media screen{body{background:#888}.p{background:#fff;margin:10px auto;box-shadow:0 2px 10px #0005}.c{outline:1px dashed #ccc}}
  </style></head><body>${pages.join('')}<script>setTimeout(()=>print(),400)<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Браузер заблокировал окно печати — разрешите всплывающие окна', 'err'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ── Открытие по QR: #eq=<id> ─────────────────────────────────
async function _eqHashOpen() {
  const m = /#eq=([\w-]+)/.exec(location.hash || ''); if (!m) return;
  const id = m[1];
  const g = document.getElementById('name-gate');
  if (g && getComputedStyle(g).display !== 'none') { setTimeout(_eqHashOpen, 1500); return; }   // сначала ввод имени
  if (typeof switchView === 'function') switchView('equipment');
  const has = () => typeof pgkEquipment !== 'undefined' && (pgkEquipment || []).some(e => e.id === id);
  for (let i = 0; i < 40 && !has(); i++) await new Promise(r => setTimeout(r, 250));
  if (!(pgkEquipment || []).some(e => e.id === id)) { toast('Позиция из QR не найдена', 'err'); return; }
  openEquipDetail(id);
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  // идёт инвентаризация — предложить отметку
  try {
    const s = await fetch(`${API}/inventory/active`).then(r => r.json());
    if (s && s.id) _invOfferMark(s, id);
  } catch (e) {}
}
function _invOfferMark(s, id) {
  const e = pgkEquipment.find(x => x.id === id);
  document.getElementById('inv-bar')?.remove();
  const bar = document.createElement('div'); bar.id = 'inv-bar';
  bar.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10050;background:#065f46;color:#fff;border-radius:10px;padding:10px 14px;display:flex;gap:10px;align-items:center;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,.4);max-width:94vw';
  bar.innerHTML = `<span>📋 «${esc(s.name)}»: ${esc(e ? e.name : '')}</span>
    <button class="btn bsm" style="background:#10b981;color:#fff;border:none;font-weight:800">✅ Найдено</button>
    <button class="btn bsm" style="background:none;border:none;color:#a7f3d0">✕</button>`;
  bar.children[1].onclick = async () => { await _invMark(s.id, id, true); bar.remove(); };
  bar.children[2].onclick = () => bar.remove();
  document.body.appendChild(bar);
}
window.addEventListener('hashchange', _eqHashOpen);
setTimeout(_eqHashOpen, 1500);

// ── Инвентаризация ───────────────────────────────────────────
async function _invMark(sid, eid, found, note) {
  const r = await fetch(`${API}/inventory/${sid}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipment_id: eid, found, note: note || '' }) });
  const j = await r.json().catch(() => ({}));
  if (r.ok && found !== false) toast(`✅ Найдено: ${j.name || ''}`, 'ok');
  return r.ok;
}
const _invPlace = sc => sc.base_id ? '🏕 ' + ((bases.find(b => b.id === sc.base_id) || {}).name || '?')
  : sc.site_id ? '📍 ' + (((sites || []).find(s => s.id === sc.site_id) || {}).name || '?') : 'Всё оборудование';
async function equipInventory() {
  let list = [];
  try { list = await fetch(`${API}/inventory`).then(r => r.json()); } catch (e) {}
  showModal('📋 Инвентаризация оборудования', `
    <div style="display:flex;gap:6px;margin-bottom:10px"><button class="btn bp bsm" onclick="_invNew()">＋ Новая инвентаризация</button></div>
    ${list.length ? `<table class="wt-tbl" style="min-width:min(640px,88vw)"><thead><tr><th class="no-sort">Название</th><th class="no-sort">Что проверяем</th><th class="no-sort">Дата</th><th class="no-sort">Найдено</th><th class="no-sort">Статус</th></tr></thead><tbody>
      ${list.map(s => `<tr style="cursor:pointer" onclick="_invOpen('${escAttr(s.id)}')"><td class="td-link"><b>${esc(s.name)}</b></td><td>${esc(_invPlace(s.scope))}${s.scope.group_id ? ' · ' + esc((pgkEquipGroups.find(g => g.id === s.scope.group_id) || {}).name || '') : ''}</td>
        <td style="font-size:11px">${esc(String(s.created_at).slice(0, 16))}<br><span style="color:var(--tx3)">${esc(s.created_by || '')}</span></td>
        <td><b>${s.found}</b> / ${s.expected}</td><td>${s.status === 'open' ? '🟢 идёт' : '✅ закрыта'}</td></tr>`).join('')}</tbody></table>`
      : '<div style="padding:16px;color:var(--tx3);text-align:center">Инвентаризаций ещё не было</div>'}`,
    [{ label: 'Закрыть', cls: 'bs', fn: closeModal }]);
}
function _invNew() {
  const o = (v, l) => `<option value="${escAttr(v)}">${esc(l)}</option>`;
  showModal('＋ Новая инвентаризация', `<div class="fgr">
    <div class="fg s2"><label>Название</label><input id="inv-n" value="Инвентаризация ${new Date().toLocaleDateString('ru-RU')}"></div>
    <div class="fg s2"><label>Что проверяем (по учёту)</label><select id="inv-p">${o('', 'Всё оборудование')}
      <optgroup label="База">${bases.map(b => o('b:' + b.id, b.name)).join('')}</optgroup>
      <optgroup label="Объект">${(sites || []).map(s => o('s:' + s.id, s.name)).join('')}</optgroup></select></div>
    <div class="fg s2"><label>Группа (необязательно)</label><select id="inv-g">${o('', '— все группы —')}${pgkEquipGroups.map(g => o(g.id, g.name)).join('')}</select></div>
    <div class="fg s2" style="font-size:11px;color:var(--tx3)">В список попадёт оборудование, которое <b>числится</b> на выбранном месте. Найденное «чужое» оборудование отметится как «не на своём месте».</div>
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: equipInventory }, { label: 'Начать', cls: 'bp', fn: async () => {
    const p = v('inv-p'), sc = {};
    if (p.startsWith('b:')) sc.base_id = p.slice(2); if (p.startsWith('s:')) sc.site_id = p.slice(2);
    if (v('inv-g')) sc.group_id = v('inv-g');
    const r = await fetch(`${API}/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v('inv-n'), scope: sc }) });
    const j = await r.json(); if (j.id) _invOpen(j.id);
  } }]);
}
async function _invOpen(id, tab) {
  let d; try { d = await fetch(`${API}/inventory/${id}`).then(r => r.json()); } catch (e) { return; }
  if (!d || !d.session) return;
  window._invCur = d; window._invTab = tab || window._invTab || 'left';
  const s = d.session, found = new Set(d.marks.map(m => m.equipment_id));
  const left = d.expected.filter(e => !found.has(e.id)), got = d.expected.filter(e => found.has(e.id)), extra = d.extra;
  const pct = d.expected.length ? Math.round(got.length / d.expected.length * 100) : 0;
  const open = s.status === 'open';
  const row = (e, mode) => `<tr><td style="width:26px">${mode !== 'extra' ? `<input type="checkbox" ${found.has(e.id) ? 'checked' : ''} ${open ? '' : 'disabled'} onchange="_invToggle('${escAttr(e.id)}',this.checked)" style="width:auto;margin:0">` : '⚠'}</td>
    <td><b>${esc(e.name)}</b>${e.serial_number ? ` <span style="color:var(--tx3);font-size:10px">S/N ${esc(e.serial_number)}</span>` : ''}</td>
    <td style="font-size:11px">${esc(e.responsible || '')}</td>
    <td style="font-size:11px">${mode === 'extra' ? 'числится: ' + esc(_invPlace({ base_id: e.base_id, site_id: e.site_id })) : esc((d.marks.find(m => m.equipment_id === e.id) || {}).found_by || '')}</td>
    ${mode === 'extra' && open && (s.scope.base_id || s.scope.site_id) ? `<td><button class="btn bs bxs" onclick="_invMoveHere('${escAttr(e.id)}')">→ Числить здесь</button></td>` : '<td></td>'}</tr>`;
  const tabs = [['left', `❌ Не найдено (${left.length})`], ['got', `✅ Найдено (${got.length})`], ['extra', `⚠ Не на своём месте (${extra.length})`]];
  const cur = window._invTab, rows = cur === 'left' ? left : cur === 'got' ? got : extra;
  showModal(`📋 ${s.name}`, `
    <div style="font-size:12px;margin-bottom:6px">${esc(_invPlace(s.scope))}${s.scope.group_id ? ' · ' + esc((pgkEquipGroups.find(g => g.id === s.scope.group_id) || {}).name || '') : ''} · ${open ? '🟢 идёт' : '✅ закрыта ' + esc(String(s.closed_at || '').slice(0, 16))}</div>
    <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:${pct}%;background:#10b981"></div></div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:10px">Найдено <b>${got.length}</b> из <b>${d.expected.length}</b> (${pct}%)${extra.length ? ` · не на своём месте: <b>${extra.length}</b>` : ''}</div>
    ${open ? `<div style="display:flex;gap:6px;margin-bottom:10px"><input id="inv-scan" placeholder="📷 Сканер QR/штрихкода, S/N или название — Enter" style="flex:1;font-size:13px;padding:7px 10px" onkeydown="if(event.key==='Enter'){event.preventDefault();_invScan(this.value);this.value='';}">
      <button class="btn bp" onclick="const i=document.getElementById('inv-scan');_invScan(i.value);i.value='';i.focus();">Отметить</button></div>` : ''}
    <div style="display:flex;gap:4px;margin-bottom:6px">${tabs.map(([k, l]) => `<button class="btn bsm ${cur === k ? 'bp' : 'bs'}" onclick="_invOpen('${escAttr(s.id)}','${k}')">${l}</button>`).join('')}</div>
    <div style="max-height:min(360px,45vh);overflow:auto;border:1.5px solid var(--bd);border-radius:var(--rs);min-width:min(680px,88vw)">
      <table class="wt-tbl"><tbody>${rows.map(e => row(e, cur)).join('') || '<tr><td style="padding:16px;text-align:center;color:var(--tx3)">Пусто</td></tr>'}</tbody></table></div>
    <div style="font-size:10px;color:var(--tx3);margin-top:6px">Можно отмечать и с телефона: отсканируйте QR-наклейку камерой — откроется карточка с кнопкой «✅ Найдено».</div>`,
    [{ label: '← Все', cls: 'bs', fn: equipInventory },
     { label: '📤 Отчёт Excel', cls: 'bs', fn: () => _invReport(d) },
     { label: open ? '🔒 Закрыть инвентаризацию' : '🔓 Открыть снова', cls: 'bs', fn: async () => {
        if (open && left.length && !await confirmDlg(`Не найдено ${left.length} поз. Закрыть инвентаризацию?`)) return;
        await fetch(`${API}/inventory/${s.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reopen: !open }) }); _invOpen(s.id); } },
     { label: '🗑', cls: 'bs', fn: async () => { if (await confirmDlg('Удалить эту инвентаризацию?')) { await fetch(`${API}/inventory/${s.id}`, { method: 'DELETE' }); equipInventory(); } } }]);
  setTimeout(() => document.getElementById('inv-scan')?.focus(), 80);
}
async function _invToggle(eid, on) { const d = window._invCur; if (!d) return; await _invMark(d.session.id, eid, on); _invOpen(d.session.id); }
// Скан: QR-ссылка (#eq=…), точный S/N или однозначное название
async function _invScan(raw) {
  const d = window._invCur; if (!d) return;
  const q = String(raw || '').trim(); if (!q) return;
  let e = null;
  const m = /#eq=([\w-]+)/.exec(q) || /^([0-9a-f]{8}-[0-9a-f-]{27})$/i.exec(q);
  if (m) e = pgkEquipment.find(x => x.id === m[1]);
  if (!e && typeof _serialKey === 'function') { const k = _serialKey(q); if (k) { const c = pgkEquipment.filter(x => _serialKey(x.serial_number) === k); if (c.length === 1) e = c[0]; } }
  if (!e) { const c = pgkEquipment.filter(x => x.name.toLowerCase().includes(q.toLowerCase())); if (c.length === 1) e = c[0]; else if (c.length > 1) { toast(`Найдено ${c.length} позиций — уточните (S/N или QR)`, 'warn'); return; } }
  if (!e) { toast('Не найдено: ' + q, 'err'); return; }
  const inScope = d.expected.some(x => x.id === e.id);
  await _invMark(d.session.id, e.id, true);
  if (!inScope) toast(`⚠ «${e.name}» числится в другом месте — отмечено как «не на своём месте»`, 'warn');
  _invOpen(d.session.id);
}
async function _invMoveHere(eid) {
  const d = window._invCur; if (!d) return;
  const sc = d.session.scope, patch = {};
  if (sc.base_id) patch.base_id = sc.base_id; if (sc.site_id) patch.site_id = sc.site_id;
  await _equipApply([eid], patch, 'Перемещено в учёте');
  _invOpen(d.session.id);
}
function _invReport(d) {
  const s = d.session, found = new Map(d.marks.map(m => [m.equipment_id, m]));
  const r = e => [e.name, e.serial_number || '', e.type || '', e.responsible || '', _invPlace({ base_id: e.base_id, site_id: e.site_id }).replace(/^\S+\s/, '')];
  const H = ['Наименование', 'Серийный №', 'Тип', 'Ответственный', 'Числится'];
  const got = d.expected.filter(e => found.has(e.id)), left = d.expected.filter(e => !found.has(e.id));
  const wb = XLSX.utils.book_new();
  const sum = XLSX.utils.aoa_to_sheet([[s.name], ['Что проверяли', _invPlace(s.scope).replace(/^\S+\s/, '')], ['Начата', s.created_at, s.created_by || ''], ['Статус', s.status === 'open' ? 'идёт' : 'закрыта ' + (s.closed_at || '')], [],
    ['Числится', d.expected.length], ['Найдено', got.length], ['Не найдено', left.length], ['Не на своём месте', d.extra.length]]);
  sum['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, sum, 'Итог');
  const sh = (name, list, extraCols) => { const ws = XLSX.utils.aoa_to_sheet([H.concat(extraCols ? ['Кто отметил', 'Когда'] : []), ...list.map(e => r(e).concat(extraCols ? [(found.get(e.id) || {}).found_by || '', (found.get(e.id) || {}).found_at || ''] : []))]);
    ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 18 }]; XLSX.utils.book_append_sheet(wb, ws, name); };
  sh('Не найдено', left); sh('Найдено', got, true); sh('Не на своём месте', d.extra, true);
  XLSX.writeFile(wb, `Инвентаризация_${String(s.name).replace(/[\\/:*?"<>|]+/g, '_')}.xlsx`);
}
