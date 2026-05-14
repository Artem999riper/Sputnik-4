// Бригада: multi-select работников + транспорт

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

  const selectedWorkerIds = new Set(current?.members?.map(m => m.id) || []);
  let selectedTransportId = current?.transport_id || '';

  screen.innerHTML = `
    <div style="margin-bottom:16px;color:var(--text2)">
      Выберите состав бригады, работающей сегодня. Этот выбор сохраняется в каждую завершённую скважину как «снимок».
    </div>
    <h3 style="margin-top:8px">👤 Работники</h3>
    <div id="brg-workers" style="margin-bottom:20px"></div>
    <h3>🚚 Транспорт</h3>
    <div id="brg-transport" style="margin-bottom:20px"></div>
    <button class="btn primary" id="brg-save" style="width:100%;padding:12px">Сохранить бригаду</button>
  `;

  const wEl = document.getElementById('brg-workers');
  workers.forEach(w => {
    const sel = selectedWorkerIds.has(w.id);
    const div = document.createElement('div');
    div.className = 'row-item clickable';
    div.style.userSelect = 'none';
    div.innerHTML = `
      <input type="checkbox" ${sel ? 'checked' : ''} style="width:18px;height:18px">
      <div class="main"><div class="name">${esc(w.name)}</div>
      <div class="meta">${esc(w.role || '')} ${w.phone ? '· ' + esc(w.phone) : ''}</div></div>`;
    div.onclick = (e) => {
      const cb = div.querySelector('input');
      if (e.target !== cb) cb.checked = !cb.checked;
      if (cb.checked) selectedWorkerIds.add(w.id);
      else selectedWorkerIds.delete(w.id);
    };
    wEl.appendChild(div);
  });

  const tEl = document.getElementById('brg-transport');
  if (!transport.length) tEl.innerHTML = '<div class="empty">Транспорт не импортирован.</div>';
  transport.forEach(t => {
    const sel = selectedTransportId === t.id;
    const div = document.createElement('div');
    div.className = 'row-item clickable';
    div.style.borderColor = sel ? 'var(--primary)' : 'var(--border)';
    div.innerHTML = `
      <div class="main"><div class="name">${esc(t.name)} ${t.plate ? '<span class="badge">' + esc(t.plate) + '</span>' : ''}</div>
        <div class="meta">${esc(t.type || '')}</div></div>
      <div class="badge" style="background:var(--primary);color:#fff;display:${sel ? 'inline-block' : 'none'}">✓</div>`;
    div.onclick = () => {
      selectedTransportId = sel ? '' : t.id;
      renderBrigade(); // перерисовать
    };
    tEl.appendChild(div);
  });

  document.getElementById('brg-save').onclick = async () => {
    try {
      await api('/brigade', { method: 'POST', body: JSON.stringify({
        worker_ids: [...selectedWorkerIds],
        transport_id: selectedTransportId || null,
      }) });
      toast('Бригада сохранена', 'ok');
      navBack();
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  };
}
