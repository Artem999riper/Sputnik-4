// ═══════════════════════════════════════════════════════════
// audit-ui.js — окно «Журнал изменений»: кто, когда и что изменил
// (было → стало), с откатом любого изменения (администратор).
// ═══════════════════════════════════════════════════════════
const AU_FIELDS = {
  name: 'Название', title: 'Название', status: 'Статус', base_id: 'База', site_id: 'Объект', group_id: 'Группа',
  responsible: 'Ответственный', responsibles: 'Ответственные', notes: 'Примечание', description: 'Описание', type: 'Тип',
  serial_number: 'Серийный №', calib_date: 'Поверка до', amount: 'Количество', unit: 'Ед.', min_amount: 'Мин. запас',
  weight: 'Вес', category: 'Группа/раздел', quantity: 'Кол-во', year: 'Год', condition: 'Состояние', ownership: 'Принадлежность',
  priority: 'Приоритет', due_date: 'Срок', driver_id: 'Водитель', plate_number: 'Гос. номер', geojson: 'Геометрия',
  color: 'Цвет', visible: 'Видимость', role: 'Должность', start_date: 'Начало вахты', phone: 'Телефон', total_weight: 'Вес, т',
  items: 'Позиции', eta_date: 'Прибытие (план)', depart_date: 'Отправка', actual_arrive: 'Прибыл', num: '№', from_desc: 'Откуда',
  driver: 'Водитель', vehicle: 'Транспорт', lat: 'Широта', lng: 'Долгота', client: 'Заказчик', contract_number: 'Договор',
  end_date: 'Срок', completion_percent: '% выполнения', machine_id: 'Машина', show_labels: 'Подписи', symbol: 'Значок',
};
const AU_KIND = { update: '✏️ изменено', delete: '🗑 удалено', create: '➕ создано', rollback: '↩ откат' };
const AU_TBL = { pgk_workers: 'Сотрудники', pgk_machinery: 'Техника', pgk_equipment: 'Оборудование', materials: 'Материалы', mto_items: 'МТО',
  cargo_orders: 'Груз', global_tasks: 'Задачи', sites: 'Объекты', bases: 'Базы', volumes: 'Объёмы', vol_progress: 'Факты по объёмам', kml_layers: 'Слои' };
function _auVal(k, v) {
  if (v === null || v === undefined || v === '') return '<i style="color:var(--tx3)">пусто</i>';
  if (k === 'geojson') return '<i>геометрия</i>';
  const nm = (arr, id) => ((arr || []).find(x => x.id === id) || {}).name;
  let s = k === 'base_id' ? nm(typeof bases !== 'undefined' ? bases : [], v) || v
    : k === 'site_id' ? nm(typeof sites !== 'undefined' ? sites : [], v) || v
    : k === 'driver_id' ? nm(typeof pgkWorkers !== 'undefined' ? pgkWorkers : [], v) || v
    : k === 'group_id' ? nm(typeof pgkEquipGroups !== 'undefined' ? pgkEquipGroups : [], v) || v
    : (k === 'items' || k === 'responsibles') ? (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(x => x.name || x).join(', ') : v; } catch (e) { return v; } })()
    : v;
  s = String(s);
  return esc(s.length > 90 ? s.slice(0, 90) + '…' : s);
}
async function openAuditLog(filter) {
  window._auF = Object.assign({ user: '', tbl: '', q: '', date: '' }, filter || {});
  showModal('🔁 Журнал изменений', `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <select id="au-u" onchange="window._auF.user=this.value;_auLoad()" style="font-size:11px;padding:3px 6px"><option value="">Все пользователи</option></select>
      <select id="au-t" onchange="window._auF.tbl=this.value;_auLoad()" style="font-size:11px;padding:3px 6px"><option value="">Все разделы</option>
        ${Object.entries(AU_TBL).map(([k, v]) => `<option value="${k}" ${window._auF.tbl === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input id="au-q" type="search" placeholder="🔍 Название…" value="${esc(window._auF.q)}" oninput="window._auF.q=this.value;clearTimeout(window._auT);window._auT=setTimeout(_auLoad,300)" style="font-size:11px;padding:3px 8px;flex:1;min-width:120px">
      <input id="au-d" type="date" value="${esc(window._auF.date)}" title="Только за этот день" onchange="window._auF.date=this.value;_auLoad()" style="font-size:11px;padding:2px 6px;width:auto">
      ${window._auF.date ? `<button class="btn bs bxs" onclick="window._auF.date='';document.getElementById('au-d').value='';_auLoad()" title="Все дни">✕ день</button>` : ''}
    </div>
    <div style="font-size:10px;color:var(--tx3);margin-bottom:6px">Хранится 120 дней. «↩ Откатить» возвращает прежние значения (нужны права администратора).</div>
    <div id="au-list" style="max-height:min(520px,65vh);overflow:auto;min-width:min(760px,90vw)"><div style="padding:16px;color:var(--tx3)">⏳ Загрузка…</div></div>`,
    [{ label: '👥 По пользователям', cls: 'bs', fn: () => openAuditUsers(window._auF.date) }, { label: '📋 Журнал действий', cls: 'bs', fn: () => { closeModal(); openGLog(); } }, { label: 'Закрыть', cls: 'bp', fn: closeModal }]);
  _auLoad();
}
// Сводка «кто и что делал за день»: сеансы (вход, выход, компьютер) и изменения по разделам
async function openAuditUsers(date) {
  const d = date || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let data = { users: [] };
  try { data = await fetch(`${API}/audit/users?date=${d}`).then(r => r.json()); } catch (e) {}
  const t = s => s ? String(s).slice(11, 16) : '';
  const isToday = d === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const rows = data.users.map(u => `<tr>
      <td><span title="${u.online ? 'сейчас в сети' : ''}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${u.online ? '#16a34a' : '#d1d5db'};margin-right:6px"></span><b>${esc(u.user_name)}</b>
        ${u.ips.length ? `<div style="font-size:10px;color:var(--tx3)">💻 ${esc(u.ips.join(', '))}</div>` : ''}</td>
      <td style="white-space:nowrap">${u.first ? t(u.first) : '—'}${u.last ? ' – ' + (u.online && isToday ? 'сейчас' : t(u.last)) : ''}
        ${u.sessions.length ? `<div style="font-size:10px;color:var(--tx3)">${u.sessions.map(s => `${t(s.start)}–${s.end ? t(s.end) : '…'}`).join(', ')}</div>` : ''}</td>
      <td style="text-align:center">${u.changes ? `<a href="#" onclick="event.preventDefault();openAuditLog({user:'${escAttr(u.user_name)}',date:'${d}'})"><b>${u.changes}</b></a>` : '<span style="color:var(--tx3)">0</span>'}</td>
      <td style="white-space:normal">${Object.entries(u.by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip" style="margin:1px;display:inline-block">${esc(k)}: ${n}</span>`).join(' ') || ''}</td></tr>`).join('');
  showModal('👥 Кто и что делал', `<div style="min-width:min(760px,90vw)">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:12px">День:
      <input type="date" value="${d}" onchange="openAuditUsers(this.value)" style="width:auto;font-size:12px;padding:2px 6px">
      <button class="btn bs bxs" onclick="openAuditUsers(new Date(new Date('${d}').getTime()-864e5).toISOString().slice(0,10))">◀</button>
      <button class="btn bs bxs" onclick="openAuditUsers(new Date(new Date('${d}').getTime()+864e5).toISOString().slice(0,10))">▶</button>
      </div><div style="color:var(--tx3);font-size:10px;margin:-2px 0 6px">Время — по открытым окнам программы; 💻 — адрес компьютера. Щелчок по числу изменений — подробно.</div>
    ${rows ? `<div style="max-height:60vh;overflow:auto"><table class="wt-tbl" style="min-width:0;width:100%;font-size:12px;table-layout:auto"><thead><tr><th>Пользователь</th><th>В программе</th><th>Изменений</th><th>Что менял</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div style="padding:20px;text-align:center;color:var(--tx3)">За этот день никого не было</div>'}
  </div>`, [{ label: '🔁 Журнал изменений', cls: 'bs', fn: () => openAuditLog({ date: d }) }, { label: 'Закрыть', cls: 'bp', fn: closeModal }]);
}
async function _auLoad() {
  const f = window._auF || {};
  const qs = new URLSearchParams(); ['user', 'tbl', 'q', 'row', 'date'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  let data = { rows: [], users: [] };
  try { data = await fetch(`${API}/audit?${qs}`).then(r => r.json()); } catch (e) {}
  const us = document.getElementById('au-u');
  if (us && us.options.length <= 1) data.users.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; if (u === f.user) o.selected = true; us.appendChild(o); });
  const box = document.getElementById('au-list'); if (!box) return;
  window._auRows = data.rows;
  box.innerHTML = data.rows.length ? data.rows.map(r => {
    let B = {}, A = {}; try { B = r.before ? JSON.parse(r.before) : {}; } catch (e) {} try { A = r.after ? JSON.parse(r.after) : {}; } catch (e) {}
    let det = '';
    if (r.kind === 'update' || r.kind === 'rollback') {
      const keys = [...new Set([...Object.keys(B), ...Object.keys(A)])].filter(k => k !== 'id' && k !== 'восстановлено');
      det = keys.map(k => `<div style="font-size:11px"><span style="color:var(--tx3)">${esc(AU_FIELDS[k] || k)}:</span> <span style="text-decoration:line-through;color:var(--tx3)">${_auVal(k, B[k])}</span> → <b>${_auVal(k, A[k])}</b></div>`).join('');
      if (A.восстановлено) det = '<div style="font-size:11px">восстановлена удалённая запись</div>';
    }
    const canUndo = !r.undone && r.kind !== 'rollback';
    return `<div style="display:flex;gap:10px;padding:7px 4px;border-bottom:1px solid var(--bd);${r.undone ? 'opacity:.55' : ''}">
      <div style="width:108px;flex-shrink:0;font-size:10px;color:var(--tx3)">${esc(String(r.at || '').replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}).*/, '$3.$2.$1 $4'))}<br>${esc(r.user_name || '—')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px"><span style="color:var(--tx3)">${esc(r.label)}</span> <b>${esc(r.name || '')}</b> · ${AU_KIND[r.kind] || r.kind}${r.undone ? ' · <i>откачено</i>' : ''}</div>${det}</div>
      ${canUndo ? `<button class="btn bs bxs" style="align-self:center;flex-shrink:0" onclick="_auRollback('${escAttr(r.id)}')">↩ Откатить</button>` : ''}
    </div>`;
  }).join('') : '<div style="padding:16px;text-align:center;color:var(--tx3)">Записей нет</div>';
}
async function _auRollback(id, force) {
  const r0 = (window._auRows || []).find(x => x.id === id);
  if (!force && !await confirmDlg(`Откатить: ${r0 ? r0.label + ' «' + (r0.name || '') + '» — ' + (AU_KIND[r0.kind] || '') : ''}?`)) return;
  const r = await fetch(`${API}/admin/audit/${id}/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: !!force }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409 && j.conflict) {
    if (await confirmDlg(`После этого изменения поля ещё раз менялись (${j.fields.map(f => AU_FIELDS[f] || f).join(', ')}).\n\nВсё равно вернуть прежние значения?`)) return _auRollback(id, true);
    return;
  }
  if (!r.ok) return;   // ошибку уже показал общий обработчик запросов
  toast('Откачено', 'ok');
  _auLoad();
  try { if (typeof loadAll === 'function') loadAll(); if (typeof renderPGK === 'function' && typeof pgkTab !== 'undefined') loadPGK(); } catch (e) {}
}
