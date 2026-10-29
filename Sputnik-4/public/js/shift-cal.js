// ═══════════════════════════════════════════════════════════
// shift-cal.js — календарь смен (вкладка «Сотрудники» → «📅 Календарь»).
// Строка — сотрудник, полоса — вахта (цвет — база). Открытая вахта идёт до
// сегодня (штрих справа). Пересекающиеся вахты одного человека — красная рамка.
// Тянуть полосу — сдвинуть вахту, тянуть край — изменить даты; щелчок —
// правка/удаление; двойной щелчок по пустому месту — добавить вахту.
// Снизу — сколько человек на вахте в каждый день и строки норм по базам
// («на Юрхаре нужно 6»): дни, где людей меньше нормы, — красные.
// План вахт — будущие заезды (бледная полоса с пунктиром): видно, кто когда
// заедет; в строке нормы на будущие дни учитываются и плановые заезды.
// «📄 Табель» — Excel: люди по дням, В — вахта, Д — дома, итоги за месяц.
// ═══════════════════════════════════════════════════════════
const SC = Object.assign({ months: 1, base: '', q: '', fired: false, from: null, shifts: [], dayW: 26 },
  (() => { try { return JSON.parse(localStorage.getItem('shift_cal') || '{}'); } catch (e) { return {}; } })());
SC.from = null;
const SC_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ea580c', '#0d9488', '#4f46e5'];
const _scD = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const _scS = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _scAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _scDiff = (a, b) => Math.round((b - a) / 86400000);
const _scToday = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const _scColor = baseId => { const i = bases.findIndex(b => b.id === baseId); return i < 0 ? '#6b7280' : SC_COLORS[i % SC_COLORS.length]; };
function _scSave() { try { localStorage.setItem('shift_cal', JSON.stringify({ months: SC.months, base: SC.base, fired: SC.fired, dayW: SC.dayW })); } catch (e) {} }

function shiftCalToggle(on) { window._pgkWCal = on == null ? !window._pgkWCal : on; renderPGK(); }
async function shiftCalLoad() {
  if (!SC.from) { const t = _scToday(); SC.from = SC.months === 12 ? new Date(t.getFullYear(), 0, 1) : new Date(t.getFullYear(), t.getMonth(), 1); }   // год — с января
  const to = new Date(SC.from.getFullYear(), SC.from.getMonth() + SC.months, 0);
  SC.to = to;
  try { SC.shifts = await fetch(`${API}/pgk/shifts?from=${_scS(SC.from)}&to=${_scS(to)}`).then(r => r.json()); } catch (e) { SC.shifts = []; }
  try { const j = await fetch(`${API}/app-settings/base_norms`).then(r => r.json()); SC.norms = (j && j.value) || {}; } catch (e) { SC.norms = SC.norms || {}; }
}
async function shiftCalRender(pb) {
  pb = pb || _getPGKContainer(); if (!pb) return;
  await shiftCalLoad();
  const from = SC.from, to = SC.to, nd = _scDiff(from, to) + 1, W = SC.dayW, today = _scToday();
  // полосы: завершённые вахты + открытые (worker.start_date → сегодня)
  const bars = SC.shifts.filter(s => s.start_date).map(s => ({ id: s.id, wid: s.worker_id, base: s.base_id, s: _scD(s.start_date), e: s.end_date ? _scD(s.end_date) : today, open: false, plan: !!s.planned, notes: s.notes || '' }));
  pgkWorkers.forEach(w => { if (w.start_date && w.status !== 'fired') bars.push({ id: 'open:' + w.id, wid: w.id, base: w.base_id, s: _scD(w.start_date), e: today, open: true }); });
  const q = SC.q.trim().toLowerCase();
  let ws = pgkWorkers.filter(w => (SC.fired || w.status !== 'fired') && (!q || (w.name + ' ' + (w.role || '')).toLowerCase().includes(q)));
  if (SC.base) ws = ws.filter(w => w.base_id === SC.base || bars.some(b => b.wid === w.id && b.base === SC.base && b.e >= from && b.s <= to));
  const baseName = id => (bases.find(b => b.id === id) || {}).name || 'без базы';
  // сначала те, у кого есть вахты в периоде
  const has = w => bars.some(b => b.wid === w.id && b.e >= from && b.s <= to);
  ws.sort((a, b) => (has(b) - has(a)) || baseName(a.base_id).localeCompare(baseName(b.base_id), 'ru') || a.name.localeCompare(b.name, 'ru'));
  // пересечения
  const byW = {}; bars.forEach(b => (byW[b.wid] = byW[b.wid] || []).push(b));
  Object.values(byW).forEach(list => list.forEach(a => { a.over = list.some(b => b !== a && b.s <= a.e && a.s <= b.e); }));
  // сколько человек в день
  const perDay = new Array(nd).fill(0);
  ws.forEach(w => (byW[w.id] || []).forEach(b => { if (b.plan || (SC.base && b.base !== SC.base)) return; for (let d = Math.max(0, _scDiff(from, b.s)); d <= Math.min(nd - 1, _scDiff(from, b.e)); d++) perDay[d]++; }));
  const days = []; for (let i = 0; i < nd; i++) days.push(_scAdd(from, i));
  const MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const title = SC.months === 1 ? `${MON[from.getMonth()]} ${from.getFullYear()}` : `${MON[from.getMonth()]} — ${MON[to.getMonth()]} ${to.getFullYear()}`;
  const head = days.map(d => { const we = d.getDay() === 0 || d.getDay() === 6, td = +d === +today;
    return `<div class="sc-day${we ? ' we' : ''}${td ? ' td' : ''}${d.getDate() === 1 ? ' m1' : ''}" style="width:${W}px">${d.getDate() === 1 && SC.months > 1 ? `<b>${MON[d.getMonth()].slice(0, 3)}</b>` : d.getDate()}</div>`; }).join('');
  const bg = days.map(d => `<div class="sc-cell${d.getDay() === 0 || d.getDay() === 6 ? ' we' : ''}${+d === +today ? ' td' : ''}" style="width:${W}px"></div>`).join('');
  const rowsHtml = ws.map(w => {
    const bs = (byW[w.id] || []).filter(b => b.e >= from && b.s <= to).map(b => {
      const l = Math.max(0, _scDiff(from, b.s)), r = Math.min(nd - 1, _scDiff(from, b.e)), len = _scDiff(b.s, b.e) + 1;
      const c = _scColor(b.base);
      return `<div class="sc-bar${b.open ? ' open' : ''}${b.plan ? ' plan' : ''}${b.over ? ' over' : ''}${SC.base && b.base !== SC.base ? ' dim' : ''}" data-id="${escAttr(b.id)}" data-wid="${escAttr(w.id)}"
        style="left:${l * W + 1}px;width:${(r - l + 1) * W - 2}px;background:${c}"
        title="${escAttr(`${b.plan ? 'ПЛАН: ' : ''}${w.name.trim()} — ${baseName(b.base)}\n${fmt(_scS(b.s))} — ${b.open ? 'сейчас' : fmt(_scS(b.e))} (${len} дн.)${b.over ? '\n⚠ пересекается с другой вахтой' : ''}${b.notes ? '\n' + b.notes : ''}`)}">
        ${b.s >= from ? '<i class="sc-h l"></i>' : ''}<span>${b.plan ? 'план · ' : ''}${(r - l + 1) * W > 70 ? esc(baseName(b.base)) + ' · ' : ''}${len} дн.</span>${!b.open && b.e <= to ? '<i class="sc-h r"></i>' : ''}</div>`;
    }).join('');
    return `<div class="sc-row" data-wid="${escAttr(w.id)}"><div class="sc-name" title="${escAttr(w.role || '')}">${esc(w.name.trim())}<small>${esc(w.role || '')}</small></div>
      <div class="sc-track" style="width:${nd * W}px">${bg}${bs}</div></div>`;
  }).join('');
  const usedBases = [...new Set(bars.filter(b => b.e >= from && b.s <= to).map(b => b.base))];
  // строки норм: сколько людей на базе в каждый день (будущие дни — с плановыми заездами)
  const normRows = bases.filter(b => +SC.norms[b.id] > 0 && (!SC.base || SC.base === b.id)).map(b => {
    const norm = +SC.norms[b.id], cnt = days.map(() => new Set());
    bars.forEach(x => { if (x.base !== b.id) return;
      for (let d = Math.max(0, _scDiff(from, x.s)); d <= Math.min(nd - 1, _scDiff(from, x.e)); d++) { if (x.plan && days[d] <= today) continue; cnt[d].add(x.wid); } });
    // открытая вахта продолжается в будущее (до конца периода) — человек ещё на базе
    bars.filter(x => x.open && x.base === b.id).forEach(x => { for (let d = Math.max(0, _scDiff(from, today) + 1); d < nd; d++) cnt[d].add(x.wid); });
    const low = cnt.filter(c => c.size < norm).length;
    return `<div class="sc-row sc-foot sc-norm"><div class="sc-name" title="Норма: ${norm} чел. Красное — меньше нормы${low ? ` (${low} дн.)` : ''}">${esc(b.name)}<small>норма ${norm}${low ? ` · не хватает ${low} дн.` : ''}</small></div>
      <div class="sc-track" style="width:${nd * W}px">${cnt.map((c, i) => `<div class="sc-day ${c.size < norm ? 'low' : 'okn'}${days[i] > today ? ' fut' : ''}" style="width:${W}px" title="${fmt(_scS(days[i]))}: ${c.size} из ${norm}">${c.size}</div>`).join('')}</div></div>`;
  }).join('');
  pb.innerHTML = `<div class="wt-outer" id="sc-root">
    <div class="wt-toolbar" style="flex-wrap:wrap;row-gap:6px">
      <span style="font-size:13px;font-weight:800">📅 Календарь смен</span>
      <button class="btn bs bsm" onclick="shiftCalToggle(false)" title="Вернуться к таблице">☰ Таблица</button>
      <button class="btn bs bsm" onclick="shiftCalNav(-1)">◀</button>
      <b style="min-width:150px;text-align:center;font-size:12px">${title}</b>
      <button class="btn bs bsm" onclick="shiftCalNav(1)">▶</button>
      <button class="btn bs bsm" onclick="SC.from=null;shiftCalRender()">Сегодня</button>
      <select onchange="SC.months=+this.value;if(SC.months===12)SC.from=null;_scSave();shiftCalRender()" style="font-size:11px">${[1, 2, 3, 6, 12].map(n => `<option value="${n}" ${SC.months === n ? 'selected' : ''}>${n === 1 ? '1 месяц' : n === 12 ? '12 мес. (год)' : n + ' мес.'}</option>`).join('')}</select>
      <select onchange="SC.base=this.value;_scSave();shiftCalRender()" style="font-size:11px;max-width:170px"><option value="">Все базы</option>${bases.map(b => `<option value="${b.id}" ${SC.base === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      <input type="search" placeholder="🔍 Сотрудник…" value="${escAttr(SC.q)}" oninput="SC.q=this.value;clearTimeout(SC.t);SC.t=setTimeout(()=>{shiftCalRender().then(()=>{const e=document.querySelector('#sc-root input[type=search]');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}})},250)" style="font-size:11px;padding:3px 8px;min-width:140px">
      <label style="display:flex;gap:4px;align-items:center;font-size:11px;text-transform:none;font-weight:500;margin:0"><input type="checkbox" ${SC.fired ? 'checked' : ''} onchange="SC.fired=this.checked;_scSave();shiftCalRender()" style="width:auto;margin:0"> уволенные</label>
      <button class="btn bs bsm" onclick="shiftCalNorms()" title="Сколько человек нужно на каждой базе">👥 Нормы баз</button>
      <button class="btn bs bsm" onclick="shiftCalTabel()" title="Табель в Excel: В — вахта, Д — дома, итоги">📄 Табель</button>
      <span style="margin-left:auto;display:flex;gap:4px;align-items:center;font-size:10px;color:var(--tx3)">масштаб
        <input type="range" min="12" max="48" value="${W}" oninput="SC.dayW=+this.value;_scSave();clearTimeout(SC.t2);SC.t2=setTimeout(shiftCalRender,120)" style="width:80px"></span>
    </div>
    <div class="wt-summary" style="flex-wrap:wrap">${usedBases.map(b => `<span style="display:inline-flex;gap:4px;align-items:center"><i style="width:10px;height:10px;border-radius:3px;background:${_scColor(b)};display:inline-block"></i>${esc(baseName(b))}</span>`).join('')}
      <span style="display:inline-flex;gap:4px;align-items:center"><i class="sc-leg-plan"></i>план</span>
      <span style="margin-left:auto;color:var(--tx3);font-size:10px">тяните полосу — сдвинуть, край — даты · щелчок — изменить · двойной щелчок по пустому — добавить вахту</span></div>
    <div class="sc-scroll" id="sc-scroll">
      <div class="sc-row sc-head"><div class="sc-name">Сотрудник (${ws.length})</div><div class="sc-track" style="width:${nd * W}px">${head}</div></div>
      ${rowsHtml || '<div style="padding:24px;color:var(--tx3)">Нет сотрудников</div>'}
      ${normRows}
      <div class="sc-row sc-foot"><div class="sc-name">На вахте, чел.</div><div class="sc-track" style="width:${nd * W}px">${perDay.map((n, i) => `<div class="sc-day${days[i].getDay() === 0 || days[i].getDay() === 6 ? ' we' : ''}${n ? '' : ' zero'}" style="width:${W}px">${n || '·'}</div>`).join('')}</div></div>
    </div></div>`;
  _scBind();
  const sc = document.getElementById('sc-scroll');
  if (sc && today >= from && today <= to && !SC._scrolled) { sc.scrollLeft = Math.max(0, _scDiff(from, today) * W - sc.clientWidth / 2); SC._scrolled = true; }
}
function shiftCalNav(d) { SC.from = new Date(SC.from.getFullYear(), SC.from.getMonth() + d * SC.months, 1); SC._scrolled = true; shiftCalRender(); }

function _scBind() {
  const root = document.getElementById('sc-scroll'); if (!root) return;
  root.addEventListener('mousedown', ev => {
    const bar = ev.target.closest('.sc-bar'); if (!bar || ev.button !== 0) return;
    ev.preventDefault();
    const W = SC.dayW, mode = ev.target.classList.contains('l') ? 'l' : ev.target.classList.contains('r') ? 'r' : 'm';
    if (bar.classList.contains('open') && mode !== 'l') { // открытую вахту двигаем только за начало
      const up0 = () => { document.removeEventListener('mouseup', up0); _scEdit(bar.dataset.id); }; document.addEventListener('mouseup', up0); return;
    }
    const x0 = ev.clientX, L0 = parseFloat(bar.style.left), W0 = parseFloat(bar.style.width);
    let dd = 0, moved = false;
    const mv = e => {
      dd = Math.round((e.clientX - x0) / W); if (Math.abs(e.clientX - x0) > 3) moved = true;
      if (mode === 'm') bar.style.left = (L0 + dd * W) + 'px';
      if (mode === 'l') { bar.style.left = (L0 + dd * W) + 'px'; bar.style.width = Math.max(W - 2, W0 - dd * W) + 'px'; }
      if (mode === 'r') bar.style.width = Math.max(W - 2, W0 + dd * W) + 'px';
      bar.classList.add('drag');
    };
    const up = () => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      bar.classList.remove('drag');
      if (!moved) { _scEdit(bar.dataset.id); return; }
      if (!dd) { shiftCalRender(); return; }
      _scShift(bar.dataset.id, mode === 'r' ? 0 : dd, mode === 'l' ? 0 : dd);
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  root.addEventListener('dblclick', ev => {
    if (ev.target.closest('.sc-bar')) return;
    const tr = ev.target.closest('.sc-track'), row = ev.target.closest('.sc-row[data-wid]'); if (!tr || !row) return;
    const d = Math.floor((ev.clientX - tr.getBoundingClientRect().left) / SC.dayW);
    _scNew(row.dataset.wid, _scS(_scAdd(SC.from, d)));
  });
}
function _scFind(id) {
  if (String(id).startsWith('open:')) { const w = pgkWorkers.find(x => x.id === id.slice(5)); return w ? { open: true, w } : null; }
  const s = SC.shifts.find(x => x.id === id); return s ? { open: false, s, w: pgkWorkers.find(x => x.id === s.worker_id) } : null;
}
async function _scPutShift(s, patch) {
  const r = await fetch(`${API}/pgk/workers/shifts/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, ...patch }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Ошибка сохранения'); }
}
async function _scPutWorker(w, patch) {
  const body = { ...w, ...patch, user_name: un() }; delete body.base_name;
  const r = await fetch(`${API}/pgk/workers/${w.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Ошибка сохранения');
}
// сдвиг начала на ds дней и конца на de дней
async function _scShift(id, ds, de) {
  const f = _scFind(id); if (!f) return;
  try {
    if (f.open) {
      const old = f.w.start_date, nv = _scS(_scAdd(_scD(old), ds));
      if (_scD(nv) > _scToday()) throw new Error('Начало вахты не может быть позже сегодня');
      await _scPutWorker(f.w, { start_date: nv });
      await loadPGK(); shiftCalRender();
      TK.undoBar(`${f.w.name.trim()}: заезд ${fmt(nv)}`, async () => { await _scPutWorker(pgkWorkers.find(x => x.id === f.w.id) || f.w, { start_date: old }); await loadPGK(); shiftCalRender(); });
    } else {
      const s = f.s, old = { start_date: s.start_date, end_date: s.end_date };
      const nv = { start_date: _scS(_scAdd(_scD(s.start_date), ds)), end_date: s.end_date ? _scS(_scAdd(_scD(s.end_date), de)) : s.end_date };
      await _scPutShift(s, nv);
      shiftCalRender();
      TK.undoBar(`Вахта: ${fmt(nv.start_date)} — ${fmt(nv.end_date)}`, async () => { await _scPutShift(s, old); shiftCalRender(); });
    }
  } catch (e) { toast(e.message, 'err'); shiftCalRender(); }
}
const _scBaseSel = cur => `<select id="sc-base"><option value="">— без базы —</option>${bases.map(b => `<option value="${b.id}" ${b.id === cur ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
function _scEdit(id) {
  const f = _scFind(id); if (!f) return;
  if (f.open) {
    showModal(`📅 ${f.w.name.trim()} — текущая вахта`, `<div class="fgr">
      <div class="fg"><label>Заезд</label><input id="sc-s" type="date" value="${f.w.start_date}"></div>
      <div class="fg"><label>База</label>${_scBaseSel(f.w.base_id)}</div></div>
      <div style="font-size:11px;color:var(--tx3);margin-top:6px">Вахта открыта — идёт до сегодня. Завершить её можно сменой статуса сотрудника.</div>`,
      [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: 'Сохранить', cls: 'bp', fn: async () => {
        const s = document.getElementById('sc-s').value, b = document.getElementById('sc-base').value || null;
        if (!s) return toast('Укажите дату', 'warn');
        closeModal(); try { await _scPutWorker(f.w, { start_date: s, base_id: b }); await loadPGK(); shiftCalRender(); toast('Сохранено', 'ok'); } catch (e) { toast(e.message, 'err'); }
      } }]);
    return;
  }
  const s = f.s;
  showModal(`📅 ${(f.w || {}).name || ''} — вахта`, `<div class="fgr">
    <div class="fg"><label>Начало</label><input id="sc-s" type="date" value="${s.start_date || ''}"></div>
    <div class="fg"><label>Окончание</label><input id="sc-e" type="date" value="${s.end_date || ''}"></div>
    <div class="fg s2"><label>База</label>${_scBaseSel(s.base_id)}</div>
    <div class="fg s2"><label>Примечание</label><input id="sc-n" value="${escAttr(s.notes || '')}"></div></div>
    <label class="sc-chk"><input type="checkbox" id="sc-plan" ${s.planned ? 'checked' : ''}> 📅 План (ещё не заехал)</label>`,
    [...(s.planned ? [{ label: '✅ Заехал', cls: 'bp', fn: () => _scArrive(s, f.w) }] : []),
     { label: '🗑 Удалить', cls: 'bd', fn: async () => {
        if (!await confirmDlg(s.planned ? 'Удалить плановую вахту?' : 'Удалить эту вахту из истории?')) return;
        closeModal(); await fetch(`${API}/pgk/workers/shifts/${s.id}`, { method: 'DELETE' });
        shiftCalRender();
        TK.undoBar('Вахта удалена', async () => { await fetch(`${API}/pgk/workers/${s.worker_id}/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); shiftCalRender(); });
      } },
     { label: 'Отмена', cls: 'bs', fn: closeModal },
     { label: 'Сохранить', cls: 'bp', fn: async () => {
        const p = { start_date: document.getElementById('sc-s').value, end_date: document.getElementById('sc-e').value, base_id: document.getElementById('sc-base').value || null, notes: document.getElementById('sc-n').value, planned: document.getElementById('sc-plan').checked ? 1 : 0 };
        if (!p.start_date || !p.end_date) return toast('Укажите даты', 'warn');
        closeModal(); try { await _scPutShift(s, p); shiftCalRender(); toast('Сохранено', 'ok'); } catch (e) { toast(e.message, 'err'); }
      } }]);
}
function _scNew(wid, day) {
  const w = pgkWorkers.find(x => x.id === wid); if (!w) return;
  const end = _scS(_scAdd(_scD(day), 29));
  showModal(`📅 ${w.name.trim()} — добавить вахту`, `<div class="fgr">
    <div class="fg"><label>Начало</label><input id="sc-s" type="date" value="${day}"></div>
    <div class="fg"><label>Окончание</label><input id="sc-e" type="date" value="${end}"></div>
    <div class="fg s2"><label>База</label>${_scBaseSel(w.base_id || SC.base)}</div>
    <div class="fg s2"><label>Примечание</label><input id="sc-n"></div></div>
    <label class="sc-chk"><input type="checkbox" id="sc-plan" ${_scD(day) > _scToday() ? 'checked' : ''}> 📅 План — будущий заезд (бледная полоса; в историю вахт не идёт)</label>
    <div style="font-size:11px;color:var(--tx3);margin-top:6px">Без галочки — запись в истории вахт. Текущую вахту открывает статус «В работе» с датой заезда (или «✅ Заехал» у плановой).</div>`,
    [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '＋ Добавить', cls: 'bp', fn: async () => {
      const s = document.getElementById('sc-s').value, e = document.getElementById('sc-e').value;
      if (!s || !e || e < s) return toast('Проверьте даты', 'warn');
      closeModal();
      const r = await fetch(`${API}/pgk/workers/${wid}/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_id: document.getElementById('sc-base')?.value || null, start_date: s, end_date: e, days: _scDiff(_scD(s), _scD(e)) + 1, notes: document.getElementById('sc-n')?.value || '', planned: document.getElementById('sc-plan')?.checked ? 1 : 0 }) }).then(x => x.json()).catch(() => ({}));
      shiftCalRender();
      if (r.id) TK.undoBar('Вахта добавлена', async () => { await fetch(`${API}/pgk/workers/shifts/${r.id}`, { method: 'DELETE' }); shiftCalRender(); });
    } }]);
}
// Плановая вахта → человек заехал: открыть вахту (статус «В работе», дата заезда, база), план убрать
async function _scArrive(s, w) {
  if (!w) return;
  if (w.start_date) { toast(`У ${w.name.trim()} уже открыта вахта с ${fmt(w.start_date)}`, 'warn'); return; }
  const start = _scD(s.start_date) > _scToday() ? _scS(_scToday()) : s.start_date;
  const d = document.getElementById('sc-s'); const day = d && d.value && _scD(d.value) <= _scToday() ? d.value : start;
  closeModal();
  try {
    await _scPutWorker(w, { start_date: day, base_id: s.base_id || w.base_id, status: 'working' });
    await fetch(`${API}/pgk/workers/shifts/${s.id}`, { method: 'DELETE' });
    await loadPGK(); shiftCalRender();
    toast(`✅ ${w.name.trim()}: вахта открыта с ${fmt(day)}`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
// Нормы по базам: сколько человек нужно на базе (общие для всех, app_settings.base_norms)
function shiftCalNorms() {
  const n = SC.norms || {};
  showModal('👥 Нормы по базам', `<div style="min-width:min(380px,86vw);font-size:12px">
    <div class="vl-hint" style="margin-bottom:8px">Сколько человек должно быть на базе. В календаре появится строка базы: дни, где людей меньше нормы, — красные (будущие дни считаются с плановыми заездами). Пусто или 0 — без нормы.</div>
    ${bases.map(b => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--bd)"><span style="flex:1">🏕 ${esc(b.name)}</span>
      <input type="number" min="0" step="1" class="sc-norm-in" data-b="${escAttr(b.id)}" value="${+n[b.id] || ''}" placeholder="—" style="width:70px;text-align:right"> чел.</div>`).join('') || '<div class="empty">Нет баз</div>'}
  </div>`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '💾 Сохранить', cls: 'bp', fn: async () => {
    const v = {}; document.querySelectorAll('.sc-norm-in').forEach(i => { const x = parseInt(i.value); if (x > 0) v[i.dataset.b] = x; });
    const r = await fetch(`${API}/app-settings/base_norms`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: v }) });
    if (!r.ok) { toast('Ошибка сохранения', 'err'); return; }
    closeModal(); SC.norms = v; shiftCalRender(); toast('Нормы сохранены', 'ok');
  } }]);
}
// Табель в Excel: лист на каждый месяц периода. В — на вахте, Д — дома, П — плановая вахта (будущие дни)
async function shiftCalTabel() {
  if (typeof XLSX === 'undefined') { toast('Библиотека Excel не загрузилась', 'err'); return; }
  await shiftCalLoad();
  const today = _scToday(), wb = XLSX.utils.book_new();
  const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const bars = SC.shifts.filter(s => s.start_date).map(s => ({ wid: s.worker_id, base: s.base_id, s: _scD(s.start_date), e: s.end_date ? _scD(s.end_date) : today, plan: !!s.planned }));
  pgkWorkers.forEach(w => { if (w.start_date && w.status !== 'fired') bars.push({ wid: w.id, base: w.base_id, s: _scD(w.start_date), e: today, open: true }); });
  const baseName = id => (bases.find(b => b.id === id) || {}).name || '';
  for (let m = 0; m < SC.months; m++) {
    const f = new Date(SC.from.getFullYear(), SC.from.getMonth() + m, 1), l = new Date(f.getFullYear(), f.getMonth() + 1, 0), nd = l.getDate();
    const inMonth = b => b.e >= f && b.s <= l && (!SC.base || b.base === SC.base);
    let ws = pgkWorkers.filter(w => bars.some(b => b.wid === w.id && inMonth(b)) || (!SC.base && w.status !== 'fired') || (SC.base && w.base_id === SC.base && w.status !== 'fired'));
    const q = SC.q.trim().toLowerCase(); if (q) ws = ws.filter(w => (w.name + ' ' + (w.role || '')).toLowerCase().includes(q));
    ws.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const head = ['№', 'Ф.И.О.', 'Должность', 'База'], days = [];
    for (let d = 1; d <= nd; d++) { days.push(new Date(f.getFullYear(), f.getMonth(), d)); head.push(String(d)); }
    head.push('Вахта, дн.', 'Дома, дн.', 'План, дн.');
    const rows = ws.map((w, i) => {
      const mine = bars.filter(b => b.wid === w.id && (!SC.base || b.base === SC.base));
      let v = 0, h = 0, p = 0; const bs = new Set();
      const cells = days.map(d => {
        const act = mine.find(b => !b.plan && b.s <= d && b.e >= d);
        if (act) { v++; if (act.base) bs.add(baseName(act.base)); return 'В'; }
        if (d > today) { if (mine.some(b => b.plan && b.s <= d && b.e >= d)) { p++; return 'П'; } return ''; }
        h++; return 'Д';
      });
      return [i + 1, w.name.trim(), w.role || '', [...bs].join(', ') || baseName(w.base_id), ...cells, v, h, p || ''];
    });
    const tot = ['', 'Итого на вахте', '', '', ...days.map((d, k) => rows.filter(r => r[4 + k] === 'В').length || ''), rows.reduce((s, r) => s + r[4 + nd], 0), rows.reduce((s, r) => s + r[5 + nd], 0), ''];
    const aoa = [[`Табель вахт — ${MON[f.getMonth()]} ${f.getFullYear()}${SC.base ? ' — ' + baseName(SC.base) : ''}`], ['В — на вахте, Д — дома, П — плановая вахта'], [], head, ...rows, tot];
    const sh = XLSX.utils.aoa_to_sheet(aoa);
    sh['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, ...days.map(() => ({ wch: 3.2 })), { wch: 10 }, { wch: 9 }, { wch: 8 }];
    sh['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } }];
    sh['!freeze'] = { xSplit: 2, ySplit: 4 };
    XLSX.utils.book_append_sheet(wb, sh, `${MON[f.getMonth()].slice(0, 3)} ${f.getFullYear()}`);
  }
  const fname = `Табель_${_scS(SC.from).slice(0, 7)}${SC.months > 1 ? '_' + SC.months + 'мес' : ''}.xlsx`;
  XLSX.writeFile(wb, fname); toast(`📄 Табель сохранён: ${fname}`, 'ok');
}
// вкладка «Сотрудники»: в режиме календаря рисуем его вместо таблицы; кнопка в панели таблицы
(function () {
  const go = () => {
    if (typeof pgkPageWorkers !== 'function') return setTimeout(go, 300);
    const orig = pgkPageWorkers;
    window.pgkPageWorkers = pgkPageWorkers = function (pb) {
      if (window._pgkWCal) { shiftCalRender(pb); return; }
      orig.apply(this, arguments);
      const bar = pb.querySelector('.wt-toolbar > div[style*="margin-left:auto"]');
      if (bar && !bar.querySelector('.sc-open')) {
        const b = document.createElement('button'); b.className = 'btn bs bsm sc-open'; b.textContent = '📅 Календарь';
        b.title = 'Календарь смен: кто на какой базе по дням'; b.onclick = () => shiftCalToggle(true);
        bar.insertBefore(b, bar.firstChild);
      }
    };
  };
  go();
})();
