// Сводка — текст прямо в приложении (как в Android)

async function renderSummary() {
  const screen = document.getElementById('screen');
  const sites = await api('/sites');
  const today = todayStr();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const fromDef = weekAgo.toISOString().slice(0, 10);
  setPageActions('');
  screen.innerHTML = `
    <div style="max-width:600px">
      <h3>📄 Сводка</h3>
      <div class="field-row">
        <div class="field"><label>С</label><input id="su-from" type="date" value="${fromDef}"></div>
        <div class="field"><label>По</label><input id="su-to" type="date" value="${today}"></div>
      </div>
      <div class="field"><label>Объект</label>
        <select id="su-site"><option value="">— все —</option>
          ${sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn primary" style="flex:1;padding:12px" onclick="doSummaryText()">📄 Сформировать сводку</button>
        <button class="btn" style="padding:12px" onclick="doSummaryWord()" title="Скачать Word">⬇️ Word</button>
      </div>
      <div id="su-result"></div>
    </div>
  `;
}

async function doSummaryText() {
  const p = new URLSearchParams();
  const from = document.getElementById('su-from').value;
  const to   = document.getElementById('su-to').value;
  const site = document.getElementById('su-site').value;
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  if (site) p.set('site_id', site);
  const res = document.getElementById('su-result');
  res.innerHTML = '<div style="color:var(--text2)">Формирование…</div>';
  try {
    const r = await api('/summary/text?' + p);
    const text = r.text || '(нет данных)';
    res.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;position:relative">
        <button class="btn small" style="position:absolute;top:10px;right:10px" onclick="copySummary()" title="Копировать">📋</button>
        <pre id="su-text" style="font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;margin:0;padding-right:36px">${esc(text)}</pre>
      </div>`;
  } catch (e) { res.innerHTML = `<div style="color:var(--danger)">Ошибка: ${esc(e.message)}</div>`; }
}

function copySummary() {
  const el = document.getElementById('su-text');
  if (!el) return;
  navigator.clipboard?.writeText(el.textContent).then(() => toast('Скопировано', 'ok')).catch(() => toast('Ошибка копирования', 'err'));
}

async function doSummaryWord() {
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
