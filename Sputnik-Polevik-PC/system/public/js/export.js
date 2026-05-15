// Экспорт .spk + импорт .spk

async function renderExport() {
  const screen = document.getElementById('screen');
  const sites = await api('/sites');
  const today = todayStr();
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fromDef = monthAgo.toISOString().slice(0, 10);

  setPageActions(`<button class="btn" onclick="importSpkAction()">📥 Импорт .spk</button>`);

  screen.innerHTML = `
    <div style="max-width:520px">
      <h3>📤 Экспорт .spk</h3>
      <p style="color:var(--text2)">Выгрузка завершённых скважин в архив .spk, совместимый с
        приложением Sputnik-4 на ПК (модуль «Полевые материалы») и Android-приложением «Полевик».</p>
      <div class="field-row">
        <div class="field"><label>С</label><input id="ex-from" type="date" value="${fromDef}"></div>
        <div class="field"><label>По</label><input id="ex-to"   type="date" value="${today}"></div>
      </div>
      <div class="field"><label>Объект (необязательно)</label>
        <select id="ex-site"><option value="">— все —</option>
          ${sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Геолог (для манифеста)</label>
        <input id="ex-geo" placeholder="ФИО геолога"></div>
      <button class="btn primary" style="width:100%;padding:12px" onclick="doExport()">📦 Сформировать .spk</button>
    </div>
  `;
}

async function doExport() {
  const params = new URLSearchParams();
  const from = document.getElementById('ex-from').value;
  const to   = document.getElementById('ex-to').value;
  const site = document.getElementById('ex-site').value;
  const geo  = document.getElementById('ex-geo').value;
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  if (site) params.set('site_id', site);
  if (geo)  params.set('geologist', geo);
  try {
    const r = await fetch(API + '/export/spk?' + params);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return toast('Ошибка: ' + (j.error || r.statusText), 'err');
    }
    const blob = await r.blob();
    const fname = (r.headers.get('content-disposition') || '').match(/filename\*?=(?:UTF-8'')?([^;]+)/i)?.[1] || 'polevik.spk';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = decodeURIComponent(fname); a.click();
    URL.revokeObjectURL(url);
    toast('Архив сформирован', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}

function importSpkAction() {
  pickFile('.spk,.zip', async (file) => {
    const fd = new FormData();
    fd.append('spk', file);
    try {
      const r = await upload('/import/spk', fd);
      const s = r.stats;
      toast(`Импортировано: ${s.boreholes} скваж., ${s.layers} слоёв, ${s.samples} проб, ${s.photos} фото`, 'ok');
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  });
}
