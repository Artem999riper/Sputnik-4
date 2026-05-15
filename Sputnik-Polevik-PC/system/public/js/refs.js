// Импорт справочника refs.json

async function renderRefs() {
  const screen = document.getElementById('screen');
  const counts = await api('/refs/counts').catch(() => ({}));

  setPageActions(`<button class="btn primary" onclick="pickRefsFile()">📥 Импорт refs.json</button>`);

  screen.innerHTML = `
    <div style="max-width:480px;margin:0 auto">
      <div style="text-align:center;font-size:48px;margin:20px 0">📥</div>
      <p style="text-align:center;color:var(--text2);margin-bottom:24px">
        Загрузите файл <b>refs.json</b>, выгруженный из «Спутника» (через
        кнопку «⬇️ Экспорт справочников» во вкладке «Полевые материалы»).
        После импорта старые справочники очищаются.
      </p>
      <div class="row-item"><div class="main">
        <div class="name">Работники</div></div>
        <div class="badge">${counts.workers || 0}</div></div>
      <div class="row-item"><div class="main">
        <div class="name">Транспорт</div></div>
        <div class="badge">${counts.transport || 0}</div></div>
      <div class="row-item"><div class="main">
        <div class="name">Объекты</div></div>
        <div class="badge">${counts.sites || 0}</div></div>
      <div class="row-item"><div class="main">
        <div class="name">KML-точки</div></div>
        <div class="badge">${counts.kml_points || 0}</div></div>
    </div>
  `;
}

function pickRefsFile() {
  pickFile('.json,application/json', async (file) => {
    const fd = new FormData();
    fd.append('refs', file);
    try {
      const r = await upload('/refs/import', fd);
      toast(`Загружено: работников ${r.counts.workers}, транспорта ${r.counts.transport}, объектов ${r.counts.sites}, KML ${r.counts.kml_points}`, 'ok');
      renderRefs();
    } catch (e) {
      toast('Ошибка импорта: ' + e.message, 'err');
    }
  });
}
