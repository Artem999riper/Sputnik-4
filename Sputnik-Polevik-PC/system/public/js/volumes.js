// Список объёмов в объекте

async function renderVolumes(siteId) {
  const screen = document.getElementById('screen');
  const volumes = await api('/volumes?site_id=' + encodeURIComponent(siteId));
  state.currentSite = state.currentSite || (await api('/sites')).find(s => s.id === siteId);
  setSubtitle(state.currentSite?.name || '');
  setPageActions(`<button class="btn primary" onclick="addVolume('${siteId}')">＋ Объём</button>`);

  if (!volumes.length) {
    screen.innerHTML = `<div class="empty">Объёмов нет. Создайте новый.</div>`;
    return;
  }
  screen.innerHTML = volumes.map(v => {
    const targetScreen = v.kind === 'DRILLING' ? 'boreholes' : 'task_points';
    return `
    <div class="row-item clickable" onclick="state.currentVolume=${JSON.stringify(v).replace(/"/g, '&quot;')};nav('${targetScreen}',{volumeId:'${v.id}'})">
      <div class="main">
        <div class="name">${esc(v.name)} <span class="badge kind-${v.kind}">${esc(VOLUME_KINDS[v.kind] || v.kind)}</span></div>
        <div class="meta">${v.kind === 'DRILLING'
          ? `Скважин: ${v.boreholes_count} (готово ${v.done_count}), план: ${v.total_volume || 0} м`
          : `Точек: ${v.task_points_count}, план: ${v.total_volume || 0}`}</div>
      </div>
      <button class="btn small danger" onclick="event.stopPropagation();delVolume('${v.id}','${esc(v.name)}')">🗑</button>
    </div>`;
  }).join('');
}

function addVolume(siteId) {
  showModal('Новый объём', `
    <div class="field">
      <label>Тип объёма</label>
      <select id="vol-kind">
        <option value="DRILLING">Бурение</option>
        <option value="STATIC_PROBE">Статическое зондирование</option>
        <option value="THERMOMETRY">Термометрия</option>
      </select>
    </div>
    <div class="field"><label>Название</label><input id="vol-name" placeholder="Бурение 100 м"></div>
  `, [
    { label: 'Отмена', fn: closeModal },
    { label: 'Создать', cls: 'primary', fn: async () => {
      const body = {
        site_id: siteId,
        kind: document.getElementById('vol-kind').value,
        name: document.getElementById('vol-name').value.trim(),
        total_volume: 0,
      };
      if (!body.name) return toast('Укажите название', 'warn');
      closeModal();
      try { await api('/volumes', { method: 'POST', body: JSON.stringify(body) }); toast('Создано', 'ok'); renderVolumes(siteId); }
      catch (e) { toast('Ошибка: ' + e.message, 'err'); }
    } },
  ]);
}

function delVolume(id, name) {
  confirm2('Удалить объём?', `Объём «${name}» и все его скважины/точки/фото будут удалены.`, async () => {
    try { await api('/volumes/' + id, { method: 'DELETE' }); toast('Удалено', 'ok'); renderVolumes(state.currentSite.id); }
    catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  }, { confirmLabel: 'Удалить', danger: true });
}
