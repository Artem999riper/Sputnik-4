// ═══════════════════════════════════════════════════════════
// hotkeys.js — горячие клавиши (работают, когда курсор не в поле ввода)
//   Ctrl+F или /  — поиск во вкладке          Ctrl+K — глобальный поиск
//   N            — добавить запись             Delete — удалить выделенные строки
//   Ctrl+A       — выделить все строки         Ctrl+Z — «↩ Отменить» последнего действия
//   Alt+1…9      — переключение вкладок        F1 или ? — список клавиш
// ═══════════════════════════════════════════════════════════
const HK_VIEWS = {
  workers:   { search: '#pgk-w-search', add: () => pgkAddWorker(), tk: 'workers', del: id => `/pgk/workers/${id}`, after: () => loadPGK() },
  machinery: { search: '#mch-search', add: () => pgkAddMach(), tk: 'machinery', del: id => `/pgk/machinery/${id}`, after: () => loadPGK() },
  equipment: { search: '#pgk-e-search', add: () => pgkAddEquip(), eq: true },
  materials: { search: '#pgk-mat-search', add: () => pgkAddMatGlobal(), tk: 'materials', del: id => `/materials/${id}`, after: async () => { await loadPGK(); if (typeof loadAll === 'function') await loadAll(); } },
  mto:       { search: '#mto-search', add: () => mtoAddItem(), tk: 'mto', del: id => `/mto/${id}`, after: () => loadMTO() },
  gruz:      { search: '#gruz-search', add: () => gruzAddOrder(), tk: 'gruz', del: id => `/cargo/${id}`, after: () => loadGruz() },
  gtasks:    { search: '#gt-f-search', add: () => gtAddTask(), tk: 'gtasks', del: id => `/gtasks/${id}`, after: () => loadGTasks() },
  brigades:  { search: '#brigades-page input[type=search]', add: () => openBrigadeModal(), tk: 'brigades', del: id => `/pgk/brigades/${id}`, after: () => loadBrigades() },
  conv:      { search: '#cv-in-a, #cv-batch' },
  // map: Ctrl+F — штатное окно глобального поиска
};
function _hkView() { const t = document.querySelector('.nt.on'); return t ? t.dataset.v : 'map'; }
function _hkTyping(e) {
  const a = e.target;
  return a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && a.type !== 'checkbox' && a.type !== 'radio';
}
function _hkModalOpen() { const m = document.getElementById('mov'); return m && m.classList.contains('open'); }
function _hkFocus(sel) {
  const el = sel && document.querySelector(sel);
  if (!el || !el.offsetParent) return false;
  el.focus(); if (el.select) el.select();
  return true;
}
function _hkSelectedIds(cfg) {
  if (cfg.eq) return typeof _equipSelectedIds === 'function' ? _equipSelectedIds() : [];
  return cfg.tk ? TK.selectedIds(cfg.tk) : [];
}
function _hkSelectAll(cfg) {
  const all = document.getElementById(cfg.eq ? 'eq-chk-all' : cfg.tk + '-chk-all');
  if (!all || !all.offsetParent) return false;
  all.checked = true; all.dispatchEvent(new Event('change'));
  return true;
}

document.addEventListener('keydown', e => {
  // Ctrl+Z — если есть панель «Отменить», нажать её (раньше других обработчиков)
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey && !_hkTyping(e)) {
    const ub = document.querySelector('#undo-bar button');
    if (ub && !ub.disabled) { e.preventDefault(); e.stopImmediatePropagation(); ub.click(); return; }
  }
  if (_hkModalOpen()) return;
  const view = _hkView(), cfg = HK_VIEWS[view] || {};
  const typing = _hkTyping(e);

  // Поиск во вкладке
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { if (_hkFocus(cfg.search)) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { if (_hkFocus('#gsearch')) e.preventDefault(); return; }
  if (typing) return;
  if (e.key === '/' && !e.ctrlKey && !e.altKey) { if (_hkFocus(cfg.search || '#gsearch')) e.preventDefault(); return; }
  if (e.key === 'F1' || (e.key === '?' && !e.ctrlKey)) { e.preventDefault(); hkHelp(); return; }

  // Alt+цифра — вкладка по порядку (только видимые)
  if (e.altKey && !e.ctrlKey && /^Digit[0-9]$/.test(e.code)) {
    const n = +e.code.slice(5) || 10;
    const tabs = [...document.querySelectorAll('.nt[data-v]')].filter(t => t.offsetParent);
    if (tabs[n - 1]) { e.preventDefault(); tabs[n - 1].click(); }
    return;
  }
  // Ctrl+A — выделить все строки таблицы
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !e.shiftKey) { if (_hkSelectAll(cfg)) e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // N — добавить
  if (e.code === 'KeyN' && cfg.add) { e.preventDefault(); try { cfg.add(); } catch (er) {} return; }
  // Delete — удалить выделенные
  if (e.key === 'Delete') {
    const ids = _hkSelectedIds(cfg);
    if (!ids.length) return;
    e.preventDefault();
    if (cfg.eq) { _equipBulkDelete(ids); return; }
    if (cfg.tk && cfg.del) TK.bulkDelete(ids, cfg.del, cfg.after);
  }
});

function hkHelp() {
  const row = (k, d) => `<tr><td style="white-space:nowrap;padding:4px 10px 4px 0"><kbd>${k.split('+').join('</kbd>+<kbd>')}</kbd></td><td style="padding:4px 0">${d}</td></tr>`;
  showModal('⌨ Горячие клавиши', `
    <style>#mbd kbd{display:inline-block;min-width:18px;padding:1px 6px;border:1.5px solid var(--bd);border-bottom-width:3px;border-radius:5px;background:var(--s2);font:700 11px monospace;text-align:center}</style>
    <table style="font-size:12px;border-collapse:collapse">
      ${row('Ctrl+F', 'поиск в текущей вкладке (также <kbd>/</kbd>)')}
      ${row('Ctrl+K', 'глобальный поиск — объекты, люди, техника, <b>координаты</b>')}
      ${row('N', 'добавить запись в текущей вкладке')}
      ${row('Ctrl+A', 'выделить все показанные строки таблицы')}
      ${row('Ctrl+клик', 'добавить / убрать строку из выделения')}
      ${row('Shift+клик', 'выделить диапазон строк')}
      ${row('Delete', 'удалить выделенные строки (с подтверждением и отменой)')}
      ${row('Ctrl+Z', 'отменить последнее изменение (пока видна панель «↩ Отменить»)')}
      ${row('Esc', 'закрыть меню / окно, затем — снять выделение')}
      ${row('Alt+1…9', 'перейти на вкладку по порядку в верхнем меню')}
      ${row('F1', 'этот список (также <kbd>?</kbd>)')}
    </table>
    <div style="font-size:11px;color:var(--tx3);margin-top:10px">Клавиши не срабатывают, пока курсор стоит в поле ввода. ПКМ по строке — действия для выделенных, ПКМ по заголовку таблицы — выбор столбцов.</div>
    <div style="margin-top:10px"><button class="btn bs bsm" onclick="closeModal();tourStart(true)">🎓 Пройти обучение заново</button></div>`,
    [{ label: 'Закрыть', cls: 'bp', fn: closeModal }]);
}
