// ═══════════════════════════════════════════════════════════
// table-kit.js — общие инструменты таблиц (Сотрудники, Техника,
// Материалы, МТО): выделение строк (галочки, Ctrl/Shift+клик, рамка,
// Esc), скрытие столбцов (ПКМ по заголовку), меню экспорта
// (всё / показанное / выделенное), массовое изменение и удаление
// с отменой, сворачиваемая группировка строк.
// Строки таблиц помечаются атрибутом data-rid="<id>".
// ═══════════════════════════════════════════════════════════
const TK = {
  sel: {},        // key → Set(id) — выделение переживает перерисовку
  anchor: {},     // key → id строки-якоря для Shift+клик
  collapsed: {},  // key → {groupKey:true}
  reg: {},        // tbodyId → key (для Esc)

  // ── Скрытые столбцы ──────────────────────────────────────
  hidden(key) {
    try { return new Set(JSON.parse(localStorage.getItem('cols_hidden_' + key) || '[]')); }
    catch (e) { return new Set(); }
  },
  // cols: [[key,label],...]; rerender() — перерисовать таблицу
  colsMenu(ev, key, cols, rerender) {
    ev.preventDefault();
    document.getElementById('tk-cols-menu')?.remove();
    const hidden = TK.hidden(key);
    const box = document.createElement('div');
    box.id = 'tk-cols-menu';
    box.style.cssText = 'position:fixed;z-index:10000;background:var(--s);border:1.5px solid var(--bd);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:8px 10px;font-size:12px;min-width:190px';
    box.innerHTML = `<div style="font-weight:800;font-size:11px;color:var(--tx2);margin-bottom:6px">Показывать столбцы</div>` +
      cols.map(([k, l]) => `<label style="display:flex;gap:6px;align-items:center;padding:3px 0;cursor:pointer">
        <input type="checkbox" data-k="${k}" ${hidden.has(k) ? '' : 'checked'} style="width:auto;margin:0"> ${esc(l)}</label>`).join('') +
      `<div style="display:flex;gap:6px;margin-top:8px"><button class="btn bs bsm" data-act="all">Все</button><button class="btn bs bsm" data-act="w">Сбросить ширину</button></div>`;
    document.body.appendChild(box);
    box.style.left = Math.min(ev.clientX, window.innerWidth - box.offsetWidth - 8) + 'px';
    box.style.top = Math.min(ev.clientY, window.innerHeight - box.offsetHeight - 8) + 'px';
    const save = set => { try { localStorage.setItem('cols_hidden_' + key, JSON.stringify([...set])); } catch (e) {} rerender(); };
    box.addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return;
      const h = TK.hidden(key); e.target.checked ? h.delete(k) : h.add(k); save(h);
    });
    box.addEventListener('click', e => {
      const a = e.target.dataset.act; if (!a) return;
      box.remove();
      if (a === 'all') save(new Set());
      if (a === 'w') { try { localStorage.removeItem('colw_' + key); } catch (_) {} rerender(); }
    });
    const outside = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('mousedown', outside, true); } };
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  },

  // ── Выделение ─────────────────────────────────────────────
  set(key) { return TK.sel[key] || (TK.sel[key] = new Set()); },
  chkTh(key) { return `<th class="no-sort tk-chk-td" data-col="chk" style="width:26px"><input type="checkbox" id="${key}-chk-all" title="Выделить все показанные"></th>`; },
  chkTd(on) { return `<td class="tk-chk-td"><input type="checkbox" class="tk-chk" ${on ? 'checked' : ''}></td>`; },
  selBar(key, extra) {
    return `<span id="${key}-sel-info" style="color:var(--acc);display:none">Выбрано: <b id="${key}-sel-cnt">0</b> ${extra || ''}
      <button class="btn bs bsm" style="padding:1px 6px;font-size:10px" onclick="TK.clear('${key}')" title="Снять выделение (Esc)">✕</button></span>`;
  },
  rows(tbodyId) { const tb = document.getElementById(tbodyId); return tb ? [...tb.querySelectorAll('tr[data-rid]')] : []; },
  selectedIds(key) {
    const tbId = Object.keys(TK.reg).find(t => TK.reg[t] === key);
    return TK.rows(tbId).filter(r => r.classList.contains('lasso-sel')).map(r => r.dataset.rid);
  },
  update(key) {
    const tbId = Object.keys(TK.reg).find(t => TK.reg[t] === key);
    const rows = TK.rows(tbId), set = TK.set(key);
    rows.forEach(r => {
      const on = r.classList.contains('lasso-sel');
      on ? set.add(r.dataset.rid) : set.delete(r.dataset.rid);
      const c = r.querySelector('.tk-chk'); if (c && c.checked !== on) c.checked = on;
    });
    // убрать «синее» выделение текста, которое браузер ставит при Shift+клике и протягивании рамкой
    try { const sl = window.getSelection(); const tb = document.getElementById(tbId);
      if (sl && !sl.isCollapsed && tb && tb.closest('table').contains(sl.anchorNode)) sl.removeAllRanges(); } catch (e) {}
    const n = rows.filter(r => r.classList.contains('lasso-sel')).length;
    const si = document.getElementById(key + '-sel-info'), sc = document.getElementById(key + '-sel-cnt');
    if (si && sc) { si.style.display = n ? '' : 'none'; sc.textContent = n; }
    const all = document.getElementById(key + '-chk-all');
    if (all) { const vis = rows.filter(r => r.style.display !== 'none' && !r.classList.contains('tk-fhide')); all.checked = vis.length > 0 && vis.every(r => r.classList.contains('lasso-sel')); }
  },
  clear(key) {
    const tbId = Object.keys(TK.reg).find(t => TK.reg[t] === key);
    TK.rows(tbId).forEach(r => { r.classList.remove('lasso-sel'); const c = r.querySelector('.tk-chk'); if (c) c.checked = false; });
    TK.update(key);
  },
  // Подключить выделение к отрисованной таблице. Вызывать после innerHTML.
  initSelect(tbodyId, key) {
    TK.reg[tbodyId] = key;
    try { TK.applyCF(tbodyId); } catch (e) {}
    const tb = document.getElementById(tbodyId); if (!tb) return;
    const vis = () => TK.rows(tbodyId).filter(r => r.style.display !== 'none' && !r.classList.contains('tk-fhide'));
    const setRow = (tr, on) => { tr.classList.toggle('lasso-sel', on); const c = tr.querySelector('.tk-chk'); if (c) c.checked = on; };
    // убрать из выделения строки, которых больше нет
    const ids = new Set(TK.rows(tbodyId).map(r => r.dataset.rid));
    const set = TK.set(key); set.forEach(id => { if (!ids.has(id)) set.delete(id); });
    TK.rows(tbodyId).forEach(r => { if (set.has(r.dataset.rid)) setRow(r, true); });
    // повторный вызов для того же tbody (перерисованы только строки) — обработчики уже есть
    if (tb._tkInit) { TK.update(key); return; }
    tb._tkInit = true;
    // Shift/Ctrl+щелчок не должен выделять текст строк
    tb.addEventListener('mousedown', ev => { if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault(); }, true);
    tb.addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-rid]'); if (!tr) return;
      const isChk = ev.target.classList && ev.target.classList.contains('tk-chk');
      const onChkCell = !!ev.target.closest('.tk-chk-td');
      if (!isChk && !onChkCell && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) return; // обычный клик — правка ячейки
      ev.stopPropagation();
      if (!isChk) ev.preventDefault();
      const rows = vis();
      if (ev.shiftKey && TK.anchor[key]) {
        const a = rows.findIndex(r => r.dataset.rid === TK.anchor[key]), b = rows.indexOf(tr);
        if (a >= 0 && b >= 0) { const [x, y] = a < b ? [a, b] : [b, a]; for (let i = x; i <= y; i++) setRow(rows[i], true); }
      } else {
        setRow(tr, isChk ? ev.target.checked : !tr.classList.contains('lasso-sel'));
        TK.anchor[key] = tr.dataset.rid;
      }
      TK.update(key);
    }, true);
    const all = document.getElementById(key + '-chk-all');
    if (all) all.addEventListener('change', () => { vis().forEach(r => setRow(r, all.checked)); TK.update(key); });
    if (typeof _initLasso === 'function') setTimeout(() => _initLasso(tbodyId, () => TK.update(key)), 0);
    TK.update(key);
  },
  // ПКМ по строке: если она в выделении — действие для всех выделенных, иначе только для неё
  ctxIds(key, id) {
    let sel = TK.selectedIds(key);
    if (sel.length && !sel.includes(id)) { TK.clear(key); sel = []; }
    return sel.length > 1 ? sel : [id];
  },

  // ── Группировка строк ─────────────────────────────────────
  // Возвращает html: заголовки групп + строки. gKey(item) → подпись группы.
  grouped(items, gKey, key, nCols, rowHtml) {
    const col = TK.collapsed[key] || (TK.collapsed[key] = {});
    const order = new Map();
    items.forEach(e => { const k = gKey(e); if (!order.has(k)) order.set(k, []); order.get(k).push(e); });
    const keys = [...order.keys()].sort((a, b) => (!a !== !b) ? (a ? -1 : 1) : String(a).localeCompare(String(b), 'ru'));
    let html = '', n = 0;
    keys.forEach(k => {
      const list = order.get(k), c = !!col[k];
      html += `<tr class="tk-gh" data-gk="${esc(k)}" onclick="TK.toggleGroup('${key}',this.dataset.gk)">
        <td colspan="${nCols}">${c ? '▸' : '▾'} ${k ? esc(k) : '<i>— не указано —</i>'} <span style="color:var(--tx3);font-weight:600">· ${list.length}</span></td></tr>`;
      if (!c) list.forEach(e => { html += rowHtml(e, ++n); }); else n += list.length;
    });
    return html;
  },
  toggleGroup(key, gk) {
    const col = TK.collapsed[key] || (TK.collapsed[key] = {});
    col[gk] = !col[gk];
    (TK.rerender[key] || (() => {}))();
  },
  rerender: {},   // key → функция перерисовки (регистрирует каждая вкладка)

  // ── Экспорт: всё / показанное / выделенное ────────────────
  // opts: {all:[...], shown:[...], selected:[...], run:list=>{}, extra:[ctx items]}
  exportMenu(ev, opts) {
    ev.stopPropagation();
    // строки, спрятанные фильтром по столбцам, — не «показанное»
    const hid = new Set([...document.querySelectorAll('tr.tk-fhide')].map(r => r.dataset.rid || r.dataset.eid || r.dataset.matid).filter(Boolean));
    if (hid.size) opts = { ...opts, shown: opts.shown.filter(x => !hid.has(String(x.id))) };
    window._ctxKeepUntil = Date.now() + 250;   // не закрыть меню этим же щелчком
    const r = ev.currentTarget.getBoundingClientRect();
    showCtx(r.left, r.bottom + 4, [
      { i: '📤', l: `Всё (${opts.all.length})`, f: () => opts.run(opts.all) },
      { i: '🔎', l: `Только показанное (${opts.shown.length})`, f: () => opts.run(opts.shown) },
      ...(opts.selected && opts.selected.length ? [{ i: '☑️', l: `Только выделенное (${opts.selected.length})`, f: () => opts.run(opts.selected) }] : []),
      ...(opts.extra || []),
    ]);
  },

  // Панель «↩ Отменить» для изменения (не удаления): undoFn возвращает прежние значения
  undoBar(msg, undoFn) { if (typeof showUndoBar === 'function') showUndoBar(msg, undoFn); else toast(msg, 'ok'); },
  // Снимок прежних значений тех полей, которые меняет patch (объект или функция от записи)
  snapshot(list, patch) {
    return list.map(e => { const p = typeof patch === 'function' ? patch(e) : patch;
      return { id: e.id, old: Object.fromEntries(Object.keys(p || {}).map(k => [k, e[k] === undefined ? null : e[k]])) }; });
  },

  // ── Массовые операции ────────────────────────────────────
  async bulkDelete(ids, urlFn, refresh, noun) {
    if (!await confirmDlg(`Удалить выбранное (${ids.length} ${noun || 'поз.'})?`)) return;
    const items = [];
    for (const id of ids) {
      try { const r = await fetch(`${API}${urlFn(id)}`, { method: 'DELETE' }).then(r => r.json()); if (r && r._restore) items.push(r._restore); } catch (e) {}
    }
    try { await refresh(); } catch (e) {}
    if (items.length) showUndoBar(`Удалено: ${items.length}`, { items }, refresh);
    else toast('Не удалось удалить', 'err');
  },
  // Примечание сразу нескольким: заменить или дописать. save(list of {id, notes}) → Promise
  notesModal(count, current, save) {
    const one = count === 1;
    showModal(one ? '📝 Примечание' : `📝 Примечание — ${count} поз.`, `<div class="fgr">
      <div class="fg s2"><textarea id="tk-nt" style="min-height:90px">${esc(one ? current || '' : '')}</textarea></div>
    </div>
    ${one ? '' : `<div style="display:flex;gap:18px;align-items:center;margin-top:8px;font-size:12px">
      <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:500;color:var(--tx);margin:0"><input type="radio" name="tk-ntm" value="replace" checked style="width:auto;margin:0;accent-color:var(--acc)"> Заменить текст</label>
      <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:500;color:var(--tx);margin:0"><input type="radio" name="tk-ntm" value="append" style="width:auto;margin:0;accent-color:var(--acc)"> Дописать в конец</label>
    </div>`}`, [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: 'Сохранить', cls: 'bp', fn: async () => {
      const txt = (document.getElementById('tk-nt') || {}).value || '';
      const mode = (document.querySelector('input[name="tk-ntm"]:checked') || {}).value || 'replace';
      closeModal();
      await save(txt, mode === 'append');
    } }]);
    setTimeout(() => document.getElementById('tk-nt')?.focus(), 50);
  },
  // Значения поля для выпадающего списка: уникальные непустые + счётчик
  distinct(list, fn) {
    const cnt = {};
    list.forEach(x => { const v = String(fn(x) || '').trim(); if (v) cnt[v] = (cnt[v] || 0) + 1; });
    return Object.keys(cnt).sort((a, b) => a.localeCompare(b, 'ru')).map(v => ({ v, l: v, sub: cnt[v] + ' шт.' }));
  },
  // Простой однострочный редактор текста в ячейке (Enter/потеря фокуса — сохранить, Esc — отмена)
  cellText(ev, td, value, onSave, type) {
    ev.stopPropagation();
    if (td.querySelector('input')) return;
    const orig = td.innerHTML;
    const inp = document.createElement('input');
    inp.type = type || 'text';
    inp.value = value == null ? '' : value;
    inp.style.cssText = 'width:100%;min-width:60px;font-size:11px;padding:2px 4px;border:1.5px solid var(--acc);border-radius:4px;background:var(--s);color:var(--tx);box-sizing:border-box';
    td.innerHTML = ''; td.appendChild(inp); inp.focus(); inp.select && inp.select();
    let done = false;
    const save = () => { if (done) return; done = true; const v = inp.value; td.innerHTML = orig; if (v !== String(value == null ? '' : value)) onSave(v); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.stopPropagation(); done = true; td.innerHTML = orig; } };
    inp.onblur = save;
  },
};

// Esc — снять выделение в видимой таблице (если не открыто окно/меню и не идёт ввод)
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (document.getElementById('search-pick') || document.getElementById('tk-cols-menu')) return;
  if (document.querySelector('#ctx.show')) return;
  const mo = document.getElementById('mov'); if (mo && mo.classList.contains('open')) return;
  const a = document.activeElement;
  if (a && a.closest && a.closest('tbody') && (a.tagName === 'INPUT' && a.type !== 'checkbox')) return;
  for (const tbId in TK.reg) {
    const tb = document.getElementById(tbId);
    if (!tb || !tb.offsetParent) continue;
    if (tb.querySelector('tr.lasso-sel')) TK.clear(TK.reg[tbId]);
  }
});

// ═══ Меню заголовка столбца (ЛКМ по названию) ═════════════════════════
// Сортировка ↑/↓, группировка по столбцу, фильтр по значениям (галочки).
// Работает во всех таблицах .wt-tbl: сортировку и группировку выполняет сама
// таблица (её щелчок по заголовку и её список «Группировать»), фильтр —
// общий: строки с исключёнными значениями прячутся (класс tk-fhide) и
// остаются спрятанными после перерисовки. Отдельные выпадающие списки
// «Все статусы / Все базы / Без группировки» над таблицей больше не нужны.
TK.cf = {};   // id tbody → { столбец: Set(исключённые значения) }
TK._rowSel = 'tr[data-rid],tr[data-eid],tr[data-matid]';
TK._cellVal = td => {
  if (!td) return '';
  const s = (td.querySelector('input,select') ? (td.querySelector('select')?.selectedOptions[0]?.textContent || td.querySelector('input')?.value || '') : td.textContent)
    .replace(/\s+/g, ' ').trim();
  return s === '—' || s === '-' ? '' : s;
};
TK._colIdx = (table, col) => [...table.tHead.rows[0].cells].findIndex(th => th.dataset.col === col);
TK.applyCF = tbodyId => {
  const tb = document.getElementById(tbodyId); if (!tb) return;
  const table = tb.closest('table'); if (!table || !table.tHead) return;
  const f = TK.cf[tbodyId] || {};
  const act = Object.entries(f).filter(([, s]) => s.size).map(([c, s]) => [TK._colIdx(table, c), s]).filter(([i]) => i >= 0);
  [...table.tHead.rows[0].cells].forEach(th => th.classList.toggle('tk-filtered', !!(f[th.dataset.col] && f[th.dataset.col].size)));
  let gh = null, ghAny = 0, ghRows = 0;
  const closeGh = () => {
    if (!gh) return;
    gh.classList.toggle('tk-fhide', ghRows > 0 && !ghAny);
    const sp = [...gh.querySelectorAll('span')].find(x => /^·\s*\d+/.test(x.textContent.trim()));   // «· 12» — сколько в группе
    if (sp && ghRows) { if (!sp.dataset.n) sp.dataset.n = sp.textContent; sp.textContent = ghAny < ghRows ? `· ${ghAny} из ${ghRows}` : sp.dataset.n; }
  };
  for (const tr of tb.rows) {
    if (tr.classList.contains('tk-gh')) { closeGh(); gh = tr; ghAny = 0; ghRows = 0; continue; }
    if (!tr.matches(TK._rowSel)) continue;
    const hide = act.some(([i, s]) => s.has(TK._cellVal(tr.cells[i])));
    tr.classList.toggle('tk-fhide', hide);
    if (hide && tr.classList.contains('lasso-sel')) { tr.classList.remove('lasso-sel'); const c = tr.querySelector('.tk-chk'); if (c) c.checked = false; }
    ghRows++; if (!hide) ghAny++;
  }
  closeGh();
  // строка «Показано по фильтру столбцов»
  const n = act.length ? tb.querySelectorAll('tr.tk-fhide:not(.tk-gh)').length : 0;
  let info = table.parentElement.querySelector('.tk-cf-info');
  if (n) {
    if (!info) { info = document.createElement('div'); info.className = 'tk-cf-info'; table.parentElement.insertBefore(info, table); }
    info.innerHTML = `🔽 Фильтр по столбцам: скрыто строк — <b>${n}</b> <button class="btn bs bxs" onclick="TK.cfReset('${tbodyId}')">✕ Сбросить</button>`;
  } else if (info) info.remove();
  // старые выпадающие фильтры над таблицей — прятать (если в них ничего не выбрано)
  const bar = TK._bar(table);
  if (bar) bar.querySelectorAll('select').forEach(s => {
    const first = (s.options[0] && s.options[0].textContent || '').trim();
    if (/^(Все |Без группировки)/.test(first)) s.classList.toggle('tk-hsel', s.selectedIndex === 0 || /^Без группировки/.test(first));
  });
};
TK.cfReset = tbodyId => { delete TK.cf[tbodyId]; TK.applyCF(tbodyId); };

// панель инструментов над таблицей (в пределах своей страницы)
TK._bar = table => {
  for (let box = table; box && box !== document.body; box = box.parentElement) {
    const b = box.querySelector('.wt-toolbar,.spare-main-hd'); if (b) return b;
    if (/-page$/.test(box.id || '')) break;
  }
  return null;
};
TK._groupSel = (table, label) => {
  // список «Группировать: …» над таблицей и пункт, подходящий к столбцу
  const bar = TK._bar(table); if (!bar) return null;
  const s = [...bar.querySelectorAll('select')].find(x => /^Без группировки/.test((x.options[0] && x.options[0].textContent || '').trim()));
  if (!s) return null;
  const words = label.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(w => w.length >= 3);
  const opt = [...s.options].find(o => {
    const m = o.textContent.toLowerCase().replace(/ё/g, 'е').match(/группировать:\s*(.+)/); if (!m) return false;
    const stem = m[1].trim().slice(0, 4);
    return words.some(w => w.slice(0, 4) === stem);
  });
  return opt ? { s, opt } : { s, opt: null };
};

TK.headMenu = (ev, th) => {
  const table = th.closest('table'), tb = table.tBodies[0];
  if (!tb || !tb.id) return;
  const col = th.dataset.col, label = (th.childNodes[0] && th.textContent || '').trim() || col;
  document.getElementById('tk-hm')?.remove();
  const canSort = !th.classList.contains('no-sort') && th.hasAttribute('onclick');
  const asc = th.classList.contains('wt-asc'), desc = th.classList.contains('wt-desc');
  const grp = TK._groupSel(table, label);
  const grpOn = grp && grp.opt && grp.s.value === grp.opt.value;
  // значения столбца
  const idx = [...th.parentElement.cells].indexOf(th);
  const cnt = new Map();
  [...tb.rows].filter(tr => tr.matches(TK._rowSel)).forEach(tr => { const v = TK._cellVal(tr.cells[idx]); cnt.set(v, (cnt.get(v) || 0) + 1); });
  const vals = [...cnt.keys()].sort((a, b) => (!a !== !b) ? (a ? -1 : 1) : a.localeCompare(b, 'ru', { numeric: true }));
  const ex = (TK.cf[tb.id] || {})[col] || new Set();
  const box = document.createElement('div'); box.id = 'tk-hm';
  box.innerHTML = `<div class="tk-hm-t">${esc(label)}</div>
    ${canSort ? `<div class="tk-hm-i${asc ? ' on' : ''}" data-a="asc">↑ Сортировать по возрастанию (А→Я, 1→9)</div>
    <div class="tk-hm-i${desc ? ' on' : ''}" data-a="desc">↓ Сортировать по убыванию (Я→А, 9→1)</div>` : ''}
    ${grp && grp.opt ? `<div class="tk-hm-i${grpOn ? ' on' : ''}" data-a="grp">🗂 ${grpOn ? 'Не группировать' : 'Группировать по этому столбцу'}</div>`
      : grp && grp.s.selectedIndex > 0 ? `<div class="tk-hm-i" data-a="ungrp">🗂 Не группировать</div>` : ''}
    ${vals.length > 1 && vals.length <= 400 ? `<div class="tk-hm-sep"></div>
      <div class="tk-hm-sub">🔽 Фильтр — показывать:</div>
      ${vals.length > 8 ? '<input class="tk-hm-q" type="search" placeholder="Найти значение…">' : ''}
      <label class="tk-hm-v tk-hm-all"><input type="checkbox" data-all="1" ${ex.size ? '' : 'checked'}> <b>Все</b></label>
      <div class="tk-hm-list">${vals.map(v => `<label class="tk-hm-v" data-txt="${escAttr(v.toLowerCase())}"><input type="checkbox" data-v="${escAttr(v)}" ${ex.has(v) ? '' : 'checked'}> <span>${v ? esc(v) : '<i>— пусто —</i>'}</span><small>${cnt.get(v)}</small></label>`).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:6px"><button class="btn bp bsm" data-a="ok">Применить</button>${ex.size ? '<button class="btn bs bsm" data-a="clr">Сбросить</button>' : ''}</div>` : ''}
    <div class="tk-hm-foot">ПКМ по заголовку — какие столбцы показывать</div>`;
  document.body.appendChild(box);
  const r = th.getBoundingClientRect();
  box.style.left = Math.max(4, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
  box.style.top = Math.min(r.bottom + 2, innerHeight - box.offsetHeight - 8) + 'px';
  const close = () => { box.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc_, true); };
  const out = e => { if (!box.contains(e.target)) close(); };
  const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc_, true); }, 0);
  const tid = table.id, tbid = tb.id;
  const sortTo = want => {
    // щелчок таблицы по заголовку переключает порядок; жмём, пока не станет нужным (≤2 раз)
    for (let k = 0; k < 2; k++) {
      const t = (tid && document.getElementById(tid)) || document.getElementById(tbid)?.closest('table'); if (!t) return;
      const h = [...t.tHead.rows[0].cells].find(x => x.dataset.col === col); if (!h) return;
      if (h.classList.contains(want === 'asc' ? 'wt-asc' : 'wt-desc')) return;
      TK._passClick = true; try { h.click(); } finally { TK._passClick = false; }
    }
  };
  const apply = () => {
    const s = new Set(); box.querySelectorAll('.tk-hm-list input[data-v]').forEach(c => { if (!c.checked) s.add(c.dataset.v); });
    if (s.size === vals.length) { toast('Нужно оставить хотя бы одно значение', 'warn'); return; }
    (TK.cf[tbid] || (TK.cf[tbid] = {}))[col] = s;
    TK.applyCF(tbid); close();
  };
  box.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'asc' || a === 'desc') { close(); sortTo(a); }
    if (a === 'grp') { close(); grp.s.value = grpOn ? grp.s.options[0].value : grp.opt.value; grp.s.dispatchEvent(new Event('change', { bubbles: true })); }
    if (a === 'ungrp') { close(); grp.s.value = grp.s.options[0].value; grp.s.dispatchEvent(new Event('change', { bubbles: true })); }
    if (a === 'ok') apply();
    if (a === 'clr') { const f = TK.cf[tbid]; if (f) delete f[col]; TK.applyCF(tbid); close(); }
  });
  box.addEventListener('change', e => {
    if (e.target.dataset.all) box.querySelectorAll('.tk-hm-list input[data-v]').forEach(c => { if (c.closest('label').style.display !== 'none') c.checked = e.target.checked; });
    else { const all = box.querySelector('input[data-all]'); if (all) all.checked = [...box.querySelectorAll('.tk-hm-list input[data-v]')].every(c => c.checked); }
  });
  const q = box.querySelector('.tk-hm-q');
  if (q) { q.oninput = () => { const t = q.value.toLowerCase().trim(); box.querySelectorAll('.tk-hm-list label').forEach(l => { l.style.display = !t || l.dataset.txt.includes(t) ? '' : 'none'; }); };
    q.onkeydown = e => { if (e.key === 'Enter') apply(); }; setTimeout(() => q.focus(), 30); }
};
// ЛКМ по заголовку — меню вместо мгновенной сортировки
document.addEventListener('click', ev => {
  if (TK._passClick || ev.button !== 0) return;
  const th = ev.target.closest && ev.target.closest('table.wt-tbl thead th');
  if (!th || !th.dataset.col || th.classList.contains('tk-chk-td') || th.dataset.col === 'num' || th.dataset.col === 'chk') return;
  if (ev.target.closest('.col-rsz,input,button,select')) return;
  if (!th.closest('table').tBodies[0]?.id) return;
  ev.preventDefault(); ev.stopPropagation();
  TK.headMenu(ev, th);
}, true);
// после каждой перерисовки таблицы — снова применить фильтры столбцов
(function () {
  const hook = () => {
    if (typeof _initLasso !== 'function' || _initLasso._tk) return;
    const orig = _initLasso;
    window._initLasso = _initLasso = function (tbodyId) { const r = orig.apply(this, arguments); try { TK.applyCF(tbodyId); } catch (e) {} return r; };
    _initLasso._tk = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
