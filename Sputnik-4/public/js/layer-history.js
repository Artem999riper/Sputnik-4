// ═══════════════════════════════════════════════════════════
// layer-history.js — «🗑 Корзина» слоёв (7 дней) и «🕓 Версии слоя»
// (сервер: routes/layer-history.js). Версия показывается на карте оранжевым
// пунктиром поверх текущего слоя; «↩ Вернуть» — текущее состояние тоже
// сохраняется версией, так что возврат можно отменить.
// ═══════════════════════════════════════════════════════════
const LHV = { prev: null, prevId: null, layerId: null };
const _lhDate = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const _lhSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
async function _lhReloadLayers() {
  try { layers = await fetch(`${API}/layers`).then(r => r.json()); } catch (e) {}
  try { renderKmlPanel(); } catch (e) {}
  try { renderLP(); renderLayerGroups(); } catch (e) {}
  try { if (typeof volLoad === 'function') await volLoad(); } catch (e) {}
}

// ── Корзина ──
async function kmlTrashOpen() {
  let list = [];
  try { const r = await fetch(`${API}/layers-trash`); if (!r.ok) throw new Error(r.status); list = await r.json(); } catch (e) { toast('Не удалось открыть корзину: ' + e.message, 'err'); return; }
  showModal('🗑 Корзина слоёв', `<div style="width:100%">
    <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Удалённые слои хранятся <b>7 дней</b>, потом удаляются сами. «Вернуть» — слой появится как был: объекты, стиль, группа${list.length ? '' : ''}.</div>
    ${list.length ? `<div class="lh-list">${list.map(t => `<div class="lh-row">
        <span class="lh-dot" style="background:${escAttr(t.color || '#888')}"></span>
        <div class="lh-main"><b>${esc(t.name || 'без названия')}</b><span>${t.n_features} объект(ов) · ${_lhSize(t.bytes || 0)} · удалён ${_lhDate(t.deleted_at)}${t.deleted_by ? ' — ' + esc(t.deleted_by) : ''}</span></div>
        <span class="lh-left${t.days_left <= 1 ? ' red' : ''}" title="Сколько дней ещё хранится">${t.days_left} дн.</span>
        <button class="btn bp bxs" onclick="kmlTrashRestore('${escAttr(t.id)}')">↩ Вернуть</button>
        <button class="btn bd bxs" onclick="kmlTrashPurge('${escAttr(t.id)}','${escAttr(t.name || '')}')" title="Удалить навсегда">✕</button>
      </div>`).join('')}</div>` : '<div style="padding:20px;text-align:center;color:var(--tx3)">Корзина пуста</div>'}
  </div>`, [...(list.length > 1 ? [{ label: 'Очистить корзину', cls: 'bd', fn: () => kmlTrashPurgeAll(list) }] : []), { label: 'Закрыть', cls: 'bs', fn: closeModal }]);
}
async function kmlTrashRestore(tid) {
  const r = await fetch(`${API}/layers-trash/${tid}/restore`, { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Не удалось вернуть', 'err'); return; }
  await _lhReloadLayers();
  toast(j.already ? 'Слой уже на месте' : `↩ Слой «${j.name || ''}» возвращён`, 'ok');
  kmlTrashOpen();
}
async function kmlTrashPurge(tid, name) {
  if (!await confirmDlg(`Удалить «${name}» навсегда? Вернуть будет нельзя.`)) return;
  await fetch(`${API}/layers-trash/${tid}`, { method: 'DELETE' });
  kmlTrashOpen();
}
async function kmlTrashPurgeAll(list) {
  if (!await confirmDlg(`Удалить навсегда все слои из корзины (${list.length})?`)) return;
  for (const t of list) { try { await fetch(`${API}/layers-trash/${t.id}`, { method: 'DELETE' }); } catch (e) {} }
  kmlTrashOpen();
}

// ── Версии слоя ──
async function kmlVersionsOpen(lid) {
  const l = (layers || []).find(x => x.id === lid); if (!l) return;
  LHV.layerId = lid;
  let vs = [];
  try { const r = await fetch(`${API}/layers/${lid}/versions`); if (!r.ok) throw new Error(r.status); vs = await r.json(); } catch (e) { toast('Не удалось загрузить версии: ' + e.message, 'err'); return; }
  const kind = v => v.kind === 'manual' ? '📌' : v.kind === 'before' ? '↩' : '🕓';
  const kindT = v => v.kind === 'manual' ? 'сохранена вручную' : v.kind === 'before' ? 'состояние перед возвратом версии' : 'автоматически, перед изменением';
  showModal(`🕓 Версии слоя «${l.name}»`, `<div style="width:100%">
    <div style="font-size:11px;color:var(--tx3);margin-bottom:8px;line-height:1.5">Перед каждым изменением объектов или стиля прежнее состояние сохраняется само (не чаще раза в 15 минут). Хранятся 30 дней (сохранённые вручную — 90), до 30 версий на слой.
      «👁» — показать версию на карте оранжевым пунктиром, «↩ Вернуть» — сделать слой таким, как в версии (текущее тоже сохранится версией).</div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap"><input id="lhv-note" placeholder="Подпись, например «до полевых», «сдано заказчику»" style="flex:1;min-width:180px">
      <button class="btn bp bsm" onclick="kmlVersionSave('${escAttr(lid)}')">📌 Сохранить версию сейчас</button></div>
    <div class="lh-list"><div class="lh-row lh-cur"><span class="lh-k">●</span><div class="lh-main"><b>Сейчас</b><span>${_kmlFeatureCount(l)} объект(ов) · ${_lhSize((l.geojson || '').length)}</span></div></div>
    ${vs.length ? vs.map(v => `<div class="lh-row${LHV.prevId === v.id ? ' on' : ''}" title="${escAttr(kindT(v))}">
        <span class="lh-k">${kind(v)}</span>
        <div class="lh-main"><b>${_lhDate(v.created_at)}${v.note ? ' — ' + esc(v.note) : ''}</b><span>${v.n_features} объект(ов) · ${_lhSize(v.bytes || 0)}${v.user_name ? ' · ' + esc(v.user_name) : ''}${v.name && v.name !== l.name ? ' · называлась «' + esc(v.name) + '»' : ''}</span></div>
        <button class="btn bs bxs" onclick="kmlVersionPreview('${escAttr(lid)}','${escAttr(v.id)}')" title="Показать на карте">${LHV.prevId === v.id ? '🙈' : '👁'}</button>
        <button class="btn bp bxs" onclick="kmlVersionRestore('${escAttr(lid)}','${escAttr(v.id)}','${escAttr(_lhDate(v.created_at))}')">↩ Вернуть</button>
        <button class="btn bd bxs" onclick="kmlVersionDel('${escAttr(lid)}','${escAttr(v.id)}')" title="Удалить версию">✕</button>
      </div>`).join('') : '<div style="padding:14px;text-align:center;color:var(--tx3);font-size:12px">Версий пока нет — они появятся после первого изменения слоя</div>'}</div>
  </div>`, [{ label: 'Закрыть', cls: 'bs', fn: () => { kmlVersionPreviewOff(); closeModal(); } }]);
}
async function kmlVersionSave(lid) {
  const note = (document.getElementById('lhv-note') || {}).value || '';
  const r = await fetch(`${API}/layers/${lid}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }) });
  if (!r.ok) { toast('Не удалось сохранить версию', 'err'); return; }
  toast('📌 Версия сохранена', 'ok'); kmlVersionsOpen(lid);
}
function kmlVersionPreviewOff() {
  if (LHV.prev) { try { map.removeLayer(LHV.prev); } catch (e) {} LHV.prev = null; }
  LHV.prevId = null;
}
async function kmlVersionPreview(lid, vid) {
  if (LHV.prevId === vid) { kmlVersionPreviewOff(); kmlVersionsOpen(lid); return; }
  kmlVersionPreviewOff();
  let v; try { v = await fetch(`${API}/layers/${lid}/versions/${vid}`).then(r => r.json()); } catch (e) { return; }
  let gj; try { gj = JSON.parse(v.geojson); } catch (e) { toast('Версия повреждена', 'err'); return; }
  LHV.prev = L.geoJSON(gj, { interactive: false,
    style: { color: '#f97316', weight: 3, dashArray: '6 5', fillColor: '#fb923c', fillOpacity: 0.12 },
    pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 7, color: '#f97316', weight: 2.5, dashArray: '3 3', fillOpacity: 0.1, interactive: false }) }).addTo(map);
  LHV.prevId = vid;
  try { const b = LHV.prev.getBounds(); if (b.isValid() && !map.getBounds().intersects(b)) map.fitBounds(b, { padding: [40, 40] }); } catch (e) {}
  kmlVersionsOpen(lid);
}
async function kmlVersionRestore(lid, vid, when) {
  if (!await confirmDlg(`Вернуть слой к версии от ${when}?\nТекущее состояние сохранится версией — вернуть обратно можно будет так же.`, { okLabel: 'Вернуть', danger: false })) return;
  const r = await fetch(`${API}/layers/${lid}/versions/${vid}/restore`, { method: 'POST' });
  if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || 'Не удалось вернуть', 'err'); return; }
  kmlVersionPreviewOff();
  if (typeof kmlInvalidateLayerCache === 'function') kmlInvalidateLayerCache(lid);
  await _lhReloadLayers();
  try { if (typeof katLayerChanged === 'function') katLayerChanged(lid, true); } catch (e) {}
  try { if (typeof kselCount === 'function' && kselCount()) kselClear(); } catch (e) {}
  toast(`↩ Слой возвращён к версии от ${when}`, 'ok');
  kmlVersionsOpen(lid);
}
async function kmlVersionDel(lid, vid) {
  if (!await confirmDlg('Удалить эту версию?')) return;
  if (LHV.prevId === vid) kmlVersionPreviewOff();
  await fetch(`${API}/layers/${lid}/versions/${vid}`, { method: 'DELETE' });
  kmlVersionsOpen(lid);
}
