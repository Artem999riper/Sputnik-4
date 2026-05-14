// Бригада: multi-select работников + транспорт (оба с поиском)

let _brWorkers = [], _brTransport = [];
let _selWorkerIds = new Set(), _selTransportId = '';

async function renderBrigade() {
  const screen = document.getElementById('screen');
  const [workers, transport, current] = await Promise.all([
    api('/workers'), api('/transport'), api('/brigade/current').catch(() => null),
  ]);

  if (!workers.length && !transport.length) {
    screen.innerHTML = `<div class="empty">Сначала импортируйте справочник работников и транспорта.<br><br>
      <button class="btn primary" onclick="nav('refs')">К справочникам</button></div>`;
    return;
  }

  _brWorkers = workers;
  _brTransport = transport;
  _selWorkerIds = new Set(current?.members?.map(m => m.id) || []);
  _selTransportId = current?.transport_id || '';

  setPageActions(`<button class="btn primary" onclick="saveBrigade()">Сохранить</button>`);

  screen.innerHTML = `
    <div style="max-width:560px">
      <p style="color:var(--text2);margin-bottom:16px">Выберите состав бригады на сегодня. Сохраняется в каждую завершённую скважину.</p>
      <h3 style="margin-bottom:8px">🚚 Транспорт</h3>
      <input id="brg-t-search" class="search-input" placeholder="Поиск транспорта…" oninput="renderBrTransport()" style="margin-bottom:8px;width:100%">
      <div id="brg-transport" style="margin-bottom:20px"></div>
      <h3 style="margin-bottom:8px">👤 Работники</h3>
      <input id="brg-w-search" class="search-input" placeholder="Поиск работника…" oninput="renderBrWorkers()" style="margin-bottom:8px;width:100%">
      <div id="brg-workers"></div>
    </div>
  `;

  renderBrTransport();
  renderBrWorkers();
}

function renderBrTransport() {
  const q = (document.getElementById('brg-t-search')?.value || '').toLowerCase();
  const el = document.getElementById('brg-transport');
  if (!el) return;
  const filtered = _brTransport.filter(t =>
    !q || (t.name + ' ' + t.plate + ' ' + t.type).toLowerCase().includes(q)
  );
  if (!filtered.length) { el.innerHTML = '<div class="empty" style="padding:8px">Ничего не найдено.</div>'; return; }
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
    !q || (w.name + ' ' + w.role + ' ' + (w.phone || '')).toLowerCase().includes(q)
  );
  if (!filtered.length) { el.innerHTML = '<div class="empty" style="padding:8px">Ничего не найдено.</div>'; return; }
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
    await api('/brigade', { method: 'POST', body: JSON.stringify({
      worker_ids: [..._selWorkerIds],
      transport_id: _selTransportId || null,
    }) });
    toast('Бригада сохранена', 'ok');
    navBack();
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}
