// Бригада: список карточек + создание новой

let _brWorkers = [], _brTransport = [];
let _selWorkerIds = new Set(), _selTransportId = '';
let _brCards = [];

async function renderBrigade() {
  const screen = document.getElementById('screen');
  const [workers, transport, cards] = await Promise.all([
    api('/workers'), api('/transport'), api('/brigades').catch(() => []),
  ]);

  _brWorkers = workers;
  _brTransport = transport;
  _brCards = cards || [];

  if (!workers.length && !transport.length) {
    screen.innerHTML = `<div class="empty">Сначала импортируйте справочник работников и транспорта.<br><br>
      <button class="btn primary" onclick="nav('refs')">К справочникам</button></div>`;
    return;
  }

  // Предзаполнить из активной карточки
  const active = _brCards.find(c => c.is_active) || _brCards[0];
  _selWorkerIds = new Set(active?.members?.map(m => m.id) || []);
  _selTransportId = active?.transport_id || '';

  setPageActions('');

  screen.innerHTML = `
    <div style="max-width:620px">

      ${_brCards.length ? `
      <h3 style="margin-bottom:10px">💾 Сохранённые бригады</h3>
      <div id="brg-cards" style="margin-bottom:20px"></div>
      ` : ''}

      <h3 style="margin-bottom:8px">➕ ${_brCards.length ? 'Новая карточка бригады' : 'Создать бригаду'}</h3>
      <p style="color:var(--text2);margin-bottom:12px;font-size:13px">Выберите состав и сохраните карточку. Можно создать несколько для разных смен.</p>

      <h4 style="margin:0 0 6px;font-size:13px">🚚 Транспорт</h4>
      <input id="brg-t-search" class="search-input" placeholder="Поиск транспорта…" oninput="renderBrTransport()" style="margin-bottom:6px;width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px">
      <div id="brg-transport" style="margin-bottom:16px;max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px"></div>

      <h4 style="margin:0 0 6px;font-size:13px">👤 Работники</h4>
      <input id="brg-w-search" class="search-input" placeholder="Поиск работника…" oninput="renderBrWorkers()" style="margin-bottom:6px;width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px">
      <div id="brg-workers" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px"></div>

      <button class="btn primary" style="margin-top:14px;width:100%;padding:10px" onclick="saveBrigade()">💾 Сохранить как новую карточку</button>
    </div>
  `;

  renderBrCards();
  renderBrTransport();
  renderBrWorkers();
}

function renderBrCards() {
  const el = document.getElementById('brg-cards');
  if (!el) return;
  el.innerHTML = _brCards.map(c => {
    const memberNames = c.members?.map(m => m.name).join(', ') || '—';
    const tName = c.transport?.name || '';
    const tPlate = c.transport?.plate || '';
    return `<div class="brg-card${c.is_active ? ' active' : ''}" onclick="activateBrigade('${c.id}')">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${esc(c.label || 'Бригада')}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">
          ${tName ? `🚚 ${esc(tName)}${tPlate ? ' (' + esc(tPlate) + ')' : ''} · ` : ''}👤 ${esc(memberNames)}
        </div>
      </div>
      ${c.is_active ? '<span style="color:var(--primary);font-size:18px" title="Активная">✓</span>' : ''}
      <button class="btn small" style="flex-shrink:0;color:var(--error);border-color:var(--error)" onclick="deleteBrigadeCard(event,'${c.id}')">🗑</button>
    </div>`;
  }).join('');
}

function renderBrTransport() {
  const q = (document.getElementById('brg-t-search')?.value || '').toLowerCase();
  const el = document.getElementById('brg-transport');
  if (!el) return;
  const filtered = _brTransport.filter(t =>
    !q || (t.name + ' ' + (t.plate || '') + ' ' + (t.type || '')).toLowerCase().includes(q)
  );
  if (!filtered.length) { el.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:12px">Ничего не найдено.</div>'; return; }
  el.innerHTML = filtered.map(t => {
    const sel = _selTransportId === t.id;
    return `<div class="brg-row${sel ? ' selected' : ''}" onclick="toggleTransport('${t.id}')">
      <span class="brg-radio">${sel ? '●' : '○'}</span>
      <div class="brg-main">
        <span class="brg-name">${esc(t.name)}${t.plate ? ' <span class="badge">' + esc(t.plate) + '</span>' : ''}</span>
        <span class="brg-meta">${esc(t.type || '')}</span>
      </div>
    </div>`;
  }).join('');
}

function renderBrWorkers() {
  const q = (document.getElementById('brg-w-search')?.value || '').toLowerCase();
  const el = document.getElementById('brg-workers');
  if (!el) return;
  const filtered = _brWorkers.filter(w =>
    !q || (w.name + ' ' + (w.role || '') + ' ' + (w.phone || '')).toLowerCase().includes(q)
  );
  if (!filtered.length) { el.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:12px">Ничего не найдено.</div>'; return; }
  el.innerHTML = filtered.map(w => {
    const sel = _selWorkerIds.has(w.id);
    return `<div class="brg-row${sel ? ' selected' : ''}" onclick="toggleWorker('${w.id}')">
      <span class="brg-check">${sel ? '☑' : '☐'}</span>
      <div class="brg-main">
        <span class="brg-name">${esc(w.name)}</span>
        <span class="brg-meta">${esc(w.role || '')}${w.phone ? ' · ' + esc(w.phone) : ''}</span>
      </div>
    </div>`;
  }).join('');
}

function toggleTransport(id) {
  _selTransportId = _selTransportId === id ? '' : id;
  renderBrTransport();
}

function toggleWorker(id) {
  if (_selWorkerIds.has(id)) _selWorkerIds.delete(id);
  else _selWorkerIds.add(id);
  renderBrWorkers();
}

async function saveBrigade() {
  try {
    const r = await api('/brigade', { method: 'POST', body: JSON.stringify({
      worker_ids: [..._selWorkerIds],
      transport_id: _selTransportId || null,
    }) });
    _brCards = await api('/brigades').catch(() => []);
    renderBrCards();
    updateSidebarBrigade();
    toast('Бригада сохранена', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}

async function activateBrigade(id) {
  try {
    await api('/brigade/' + id + '/activate', { method: 'PATCH' });
    _brCards = await api('/brigades').catch(() => []);
    renderBrCards();
    updateSidebarBrigade();
    toast('Бригада активирована', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}

async function deleteBrigadeCard(event, id) {
  event.stopPropagation();
  if (!await confirm2Async('Удалить карточку бригады?', 'Это действие нельзя отменить.')) return;
  try {
    await api('/brigade/' + id, { method: 'DELETE' });
    _brCards = await api('/brigades').catch(() => []);
    renderBrCards();
    updateSidebarBrigade();
    toast('Карточка удалена', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}
