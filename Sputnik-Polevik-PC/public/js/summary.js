// Сводка Word

async function renderSummary() {
  const screen = document.getElementById('screen');
  const sites = await api('/sites');
  const today = todayStr();
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fromDef = monthAgo.toISOString().slice(0, 10);
  setPageActions('');
  screen.innerHTML = `
    <div style="max-width:520px">
      <h3>📄 Сводка (Word)</h3>
      <p style="color:var(--text2)">Текстовый отчёт за период с разбивкой по объёмам и таблицей скважин.</p>
      <div class="field-row">
        <div class="field"><label>С</label><input id="su-from" type="date" value="${fromDef}"></div>
        <div class="field"><label>По</label><input id="su-to" type="date" value="${today}"></div>
      </div>
      <div class="field"><label>Объект</label>
        <select id="su-site"><option value="">— все —</option>
          ${sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
      <button class="btn primary" style="width:100%;padding:12px" onclick="doSummary()">📄 Сформировать Word</button>
    </div>
  `;
}

async function doSummary() {
  const p = new URLSearchParams();
  const from = document.getElementById('su-from').value;
  const to   = document.getElementById('su-to').value;
  const site = document.getElementById('su-site').value;
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  if (site) p.set('site_id', site);
  try {
    const r = await fetch(API + '/export/summary.docx?' + p);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return toast('Ошибка: ' + (j.error || r.statusText), 'err');
    }
    const blob = await r.blob();
    const fname = `Сводка_${from || 'all'}__${to || 'all'}.docx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
    toast('Word сохранён', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
}
