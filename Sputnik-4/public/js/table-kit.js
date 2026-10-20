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
    if (all) { const vis = rows.filter(r => r.style.display !== 'none'); all.checked = vis.length > 0 && vis.every(r => r.classList.contains('lasso-sel')); }
  },
  clear(key) {
    const tbId = Object.keys(TK.reg).find(t => TK.reg[t] === key);
    TK.rows(tbId).forEach(r => { r.classList.remove('lasso-sel'); const c = r.querySelector('.tk-chk'); if (c) c.checked = false; });
    TK.update(key);
  },
  // Подключить выделение к отрисованной таблице. Вызывать после innerHTML.
  initSelect(tbodyId, key) {
    TK.reg[tbodyId] = key;
    const tb = document.getElementById(tbodyId); if (!tb) return;
    const vis = () => TK.rows(tbodyId).filter(r => r.style.display !== 'none');
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
    window._ctxKeepUntil = Date.now() + 250;   // не закрыть меню этим же щелчком
    const r = ev.currentTarget.getBoundingClientRect();
    showCtx(r.left, r.bottom + 4, [
      { i: '📤', l: `Всё (${opts.all.length})`, f: () => opts.run(opts.all) },
      { i: '🔎', l: `Только показанное (${opts.shown.length})`, f: () => opts.run(opts.shown) },
      ...(opts.selected && opts.selected.length ? [{ i: '☑️', l: `Только выделенное (${opts.selected.length})`, f: () => opts.run(opts.selected) }] : []),
      ...(opts.extra || []),
    ]);
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
