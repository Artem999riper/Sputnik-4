// Список объектов

async function renderSites() {
  const screen = document.getElementById('screen');
  const sites = await api('/sites');
  setPageActions('');
  if (!sites.length) {
    screen.innerHTML = `<div class="empty">Объекты появятся после импорта справочника.<br><br>
      <button class="btn primary" onclick="nav('refs')">К справочникам</button></div>`;
    return;
  }
  screen.innerHTML = sites.map(s => `
    <div class="row-item clickable" onclick="state.currentSite=${JSON.stringify(s).replace(/"/g, '&quot;')}; nav('volumes',{siteId:'${s.id}'})">
      <div class="main">
        <div class="name">${esc(s.name)}</div>
        <div class="meta">Объёмов: ${s.volumes_count}, скважин: ${s.boreholes_count}${s.lat != null ? ` · ${(+s.lat).toFixed(4)}, ${(+s.lng).toFixed(4)}` : ''}</div>
      </div>
      <button class="btn small danger" onclick="event.stopPropagation();delSite('${s.id}','${esc(s.name)}')">🗑</button>
    </div>
  `).join('');
}

function delSite(id, name) {
  confirm2('Удалить объект?',
    `Объект «${name}» и все его объёмы, скважины, точки задач, фото будут удалены.`,
    async () => {
      try { await api('/sites/' + id, { method: 'DELETE' }); toast('Удалено', 'ok'); renderSites(); }
      catch (e) { toast('Ошибка: ' + e.message, 'err'); }
    }, { confirmLabel: 'Удалить', danger: true });
}
