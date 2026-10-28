// ═══════════════════════════════════════════════════════════
// site-analytics.js — по объекту:
//   • прогноз окончания по текущему темпу (по каждому виду работ и в целом)
//     с предупреждением о срыве срока по договору;
//   • отметка «простой из-за погоды» в журнале объекта (видна в отчёте).
// ═══════════════════════════════════════════════════════════
const SF_WINDOW = 14;    // темп — по последним 14 дням (если за них нет работ — за всё время)
const _sfDay = d => new Date(String(d).slice(0, 10) + 'T00:00:00');
const _sfIso = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const _sfFmt = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '—';

// → { vols:[{id,name,unit,plan,done,rate,daysLeft,finish}], finish, end, lateDays, noData }
function siteForecast(o, today) {
  const now = _sfDay(today || _sfIso(Date.now())).getTime();
  const fact = (o.vol_progress || []).filter(p => (p.row_type || 'fact') !== 'plan' && !p.hidden && p.work_date);
  const vols = (o.volumes || []).filter(v => +v.amount > 0).map(v => {
    const rows = fact.filter(p => p.volume_id === v.id);
    const done = rows.reduce((s, p) => s + (+p.completed || 0), 0), plan = +v.amount;
    if (done >= plan) return { id: v.id, name: v.name, unit: v.unit, plan, done, rate: null, daysLeft: 0, finish: rows.length ? rows.map(p => p.work_date).sort().pop() : null, complete: true };
    const recent = rows.filter(p => (now - _sfDay(p.work_date).getTime()) / 864e5 < SF_WINDOW);
    let rate = recent.reduce((s, p) => s + (+p.completed || 0), 0) / SF_WINDOW;
    if (!(rate > 0) && rows.length) {
      const first = Math.min(...rows.map(p => _sfDay(p.work_date).getTime()));
      rate = done / Math.max(1, (now - first) / 864e5 + 1);
    }
    if (!(rate > 0)) return { id: v.id, name: v.name, unit: v.unit, plan, done, rate: 0, daysLeft: null, finish: null };
    const daysLeft = Math.ceil((plan - done) / rate);
    return { id: v.id, name: v.name, unit: v.unit, plan, done, rate, daysLeft, finish: _sfIso(now + daysLeft * 864e5) };
  });
  const open = vols.filter(v => !v.complete);
  const noData = open.some(v => v.finish == null);
  const finish = open.length ? (noData ? null : open.map(v => v.finish).sort().pop()) : (vols.length ? vols.map(v => v.finish).filter(Boolean).sort().pop() || null : null);
  const end = (o.end_date || '').slice(0, 10) || null;
  const lateDays = finish && end ? Math.round((_sfDay(finish) - _sfDay(end)) / 864e5) : null;
  return { vols, finish, end, lateDays, noData, allDone: vols.length > 0 && !open.length };
}
function siteForecastHtml(o) {
  const f = siteForecast(o);
  if (!f.vols.length) return '';
  let head, cls = '';
  if (f.allDone) head = `✅ Все объёмы выполнены${f.finish ? ' (' + _sfFmt(f.finish) + ')' : ''}`;
  else if (f.noData) head = '📈 Прогноз: по части видов работ ещё нет факта — темп не определить';
  else if (f.lateDays != null && f.lateDays > 0) { head = `🚨 При текущем темпе окончание <b>${_sfFmt(f.finish)}</b> — позже срока (${_sfFmt(f.end)}) на <b>${f.lateDays} дн.</b>`; cls = 'al-c'; }
  else if (f.lateDays != null) head = `📈 При текущем темпе окончание <b>${_sfFmt(f.finish)}</b> — в срок (${_sfFmt(f.end)}), запас ${-f.lateDays} дн.`;
  else head = `📈 При текущем темпе окончание <b>${_sfFmt(f.finish)}</b>`;
  const n = (v, d = 1) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d });
  return `<div class="ic full ${cls}" style="margin-bottom:8px"><div style="font-size:11px">${head}</div>
    <details style="margin-top:4px"><summary style="cursor:pointer;font-size:10px;color:var(--acc)">по видам работ (темп за ${SF_WINDOW} дн.)</summary>
    <table style="width:100%;font-size:10px;margin-top:4px;border-collapse:collapse">${f.vols.map(v => `<tr style="border-top:1px solid var(--bd)">
      <td style="padding:2px 4px">${esc(v.name)}</td><td style="text-align:right;white-space:nowrap">${n(v.done)} / ${n(v.plan)} ${esc(v.unit || '')}</td>
      <td style="text-align:right;white-space:nowrap;color:var(--tx3)">${v.complete ? 'готово' : v.rate ? n(v.rate, 2) + '/дн.' : 'нет факта'}</td>
      <td style="text-align:right;white-space:nowrap;${f.end && v.finish && v.finish > f.end ? 'color:var(--red);font-weight:700' : ''}">${v.complete ? '✅' : v.finish ? _sfFmt(v.finish) : '—'}</td></tr>`).join('')}</table></details></div>`;
}

// Простой из-за погоды → журнал объекта (виден в «Журнале» и в отчёте для заказчика)
function siteDowntime(siteId) {
  const today = _sfIso(Date.now());
  showModal('⛔ Простой из-за погоды', `<div class="fgr fone">
    <div class="fg"><label>Дата</label><input id="dt-d" type="date" value="${today}"></div>
    <div class="fg"><label>Причина</label><select id="dt-r"><option>Сильный ветер</option><option>Метель / снегопад</option><option>Дождь / распутица</option><option>Мороз</option><option>Туман / нет видимости</option><option>Гроза</option><option>Паводок</option><option>Другое</option></select></div>
    <div class="fg"><label>Сколько часов</label><input id="dt-h" type="number" min="0.5" step="0.5" value="8"></div>
    <div class="fg"><label>Примечание</label><input id="dt-n" placeholder="Например: порывы 22 м/с, бригада на базе"></div></div>`,
    [{ label: 'Отмена', cls: 'bs', fn: closeModal }, { label: '💾 Записать', cls: 'bp', fn: async () => {
      const d = document.getElementById('dt-d').value || today, r = document.getElementById('dt-r').value, h = document.getElementById('dt-h').value, nt = document.getElementById('dt-n').value.trim();
      const res = await fetch(`${API}/sites/${siteId}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Простой из-за погоды', details: `${_sfFmt(d)} · ${r} · ${h} ч${nt ? ' · ' + nt : ''}`, user_name: un() }) });
      if (!res.ok) return;
      closeModal(); toast('Простой записан в журнал объекта', 'ok');
      try { if (typeof refreshCurrent === 'function') refreshCurrent(); } catch (e) {}
    } }]);
}
