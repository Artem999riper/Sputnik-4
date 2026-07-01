// Сводка — текст прямо в приложении (как в Android)

let _suSites = [];
let _suVolumes = [];

async function renderSummary() {
  const screen = document.getElementById('screen');
  _suSites = await api('/sites');
  const today = todayStr();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const fromDef = weekAgo.toISOString().slice(0, 10);
  setPageActions('');
  screen.innerHTML = `
    <div style="max-width:700px">
      <h3>📄 Сводка</h3>
      <div class="field-row">
        <div class="field"><label>С</label><input id="su-from" type="date" value="${fromDef}"></div>
        <div class="field"><label>По</label><input id="su-to" type="date" value="${today}"></div>
      </div>
      <div class="field"><label>Объект</label>
        <select id="su-site" onchange="suLoadVolumes()">
          <option value="">— все —</option>
          ${_suSites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>

      <div id="su-volumes-section" style="margin-bottom:16px"></div>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn primary" style="flex:1;padding:12px" onclick="doSummaryText()">📄 Сформировать сводку</button>
        <button class="btn" style="padding:12px" onclick="doSummaryWord()" title="Скачать Word">⬇️ Word</button>
      </div>
      <div id="su-result"></div>
    </div>
  `;
  await suLoadVolumes();
}

async function suLoadVolumes() {
  const siteId = document.getElementById('su-site')?.value || '';
  const sec = document.getElementById('su-volumes-section');
  if (!sec) return;
  try {
    _suVolumes = siteId
      ? await api('/volumes?site_id=' + siteId)
      : await api('/volumes');
  } catch (e) { _suVolumes = []; }
  if (!_suVolumes.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px">
      <div style="font-weight:600;margin-bottom:8px;font-size:13px">📐 Плановые объёмы</div>
      ${_suVolumes.map(v => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="flex:1;font-size:13px">${esc(v.name)} <span class="badge">${esc(VOLUME_KINDS[v.kind] || v.kind)}</span></span>
          <input type="number" min="0" step="0.1" value="${v.total_volume || 0}"
            style="width:90px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px"
            onchange="suSaveVolume('${v.id}', this.value)" title="Плановый объём">
          <span style="font-size:12px;color:var(--text3)">м</span>
        </div>`).join('')}
    </div>`;
}

async function suSaveVolume(id, val) {
  try {
    await api('/volumes/' + id, { method: 'PUT', body: JSON.stringify({ total_volume: Number(val) || 0 }) });
    toast('Сохранено', 'ok');
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
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
