// ═══════════════════════════════════════════════════════════
// site-analytics.js — по объекту:
//   • прогноз окончания по текущему темпу (по каждому виду работ и в целом)
//     с предупреждением о срыве срока по договору;
//   • погода на 5 дней по координатам объекта (Open-Meteo, без ключа)
//     и отметка «простой из-за погоды» в журнале объекта.
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

// ── Погода ─────────────────────────────────────────────────
function siteCenter(o) {
  const pts = [];
  const walk = c => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  (o.volumes || []).forEach(v => { try { const g = JSON.parse(v.geojson); (g.features || [g]).forEach(f => walk((f.geometry || f).coordinates || [])); } catch (e) {} });
  if (!pts.length) (o.bases || []).forEach(b => { if (b.lat && b.lng) pts.push([b.lng, b.lat]); });
  if (!pts.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { lat: (Math.min(...ys) + Math.max(...ys)) / 2, lng: (Math.min(...xs) + Math.max(...xs)) / 2 };
}
const WMO = { 0: ['☀️', 'ясно'], 1: ['🌤', 'малооблачно'], 2: ['⛅', 'облачно'], 3: ['☁️', 'пасмурно'], 45: ['🌫', 'туман'], 48: ['🌫', 'туман, изморозь'],
  51: ['🌦', 'морось'], 53: ['🌦', 'морось'], 55: ['🌦', 'морось'], 56: ['🌧', 'ледяная морось'], 57: ['🌧', 'ледяная морось'],
  61: ['🌧', 'дождь'], 63: ['🌧', 'дождь'], 65: ['🌧', 'сильный дождь'], 66: ['🌧', 'ледяной дождь'], 67: ['🌧', 'ледяной дождь'],
  71: ['🌨', 'снег'], 73: ['🌨', 'снег'], 75: ['❄️', 'сильный снег'], 77: ['🌨', 'снежная крупа'], 80: ['🌦', 'ливень'], 81: ['🌧', 'ливень'], 82: ['⛈', 'сильный ливень'],
  85: ['🌨', 'снегопад'], 86: ['❄️', 'сильный снегопад'], 95: ['⛈', 'гроза'], 96: ['⛈', 'гроза с градом'], 99: ['⛈', 'гроза с градом'] };
const _swCache = new Map();
async function siteWeatherLoad(o, el) {
  if (!el) return;
  const c = siteCenter(o);
  if (!c) { el.innerHTML = ''; return; }
  const key = c.lat.toFixed(2) + ',' + c.lng.toFixed(2);
  let w = _swCache.get(key);
  if (!w || Date.now() - w.t > 30 * 60000) {
    el.innerHTML = '<div style="font-size:10px;color:var(--tx3);margin-bottom:6px">⏳ Погода…</div>';
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(4)}&longitude=${c.lng.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&wind_speed_unit=ms&timezone=auto&forecast_days=5`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      w = { t: Date.now(), d: (await r.json()).daily }; _swCache.set(key, w);
    } catch (e) { el.innerHTML = `<div style="font-size:10px;color:var(--tx3);margin-bottom:6px">🌥 Погода недоступна (нет интернета?) · <a href="#" onclick="event.preventDefault();siteDowntime('${escAttr(o.id)}')">отметить простой</a></div>`; return; }
  }
  const d = w.d, n = v => Math.round(v);
  const days = d.time.map((t, i) => {
    const [ic, txt] = WMO[d.weather_code[i]] || ['🌡', ''];
    const bad = d.wind_gusts_10m_max[i] >= 15 || d.precipitation_sum[i] >= 10 || [65, 75, 82, 86, 95, 96, 99].includes(d.weather_code[i]);
    const wd = new Date(t + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
    return `<div title="${esc(txt)}; ветер до ${n(d.wind_speed_10m_max[i])} м/с, порывы ${n(d.wind_gusts_10m_max[i])} м/с; осадки ${d.precipitation_sum[i]} мм"
      style="flex:1;min-width:52px;text-align:center;padding:4px 2px;border-radius:6px;background:${bad ? 'color-mix(in srgb,var(--red) 12%,transparent)' : 'var(--s2)'}">
      <div style="font-size:9px;color:var(--tx3)">${wd}</div><div style="font-size:18px;line-height:1.2">${ic}</div>
      <div style="font-size:10px;font-weight:700">${n(d.temperature_2m_max[i])}° / ${n(d.temperature_2m_min[i])}°</div>
      <div style="font-size:9px;color:var(--tx2)">💨 ${n(d.wind_gusts_10m_max[i])} м/с${d.precipitation_sum[i] >= 0.5 ? ` · 💧${n(d.precipitation_sum[i])}` : ''}</div></div>`;
  }).join('');
  el.innerHTML = `<div class="ic full" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="icl">Погода на объекте</div>
      <a href="#" style="font-size:10px" onclick="event.preventDefault();siteDowntime('${escAttr(o.id)}')">⛔ отметить простой</a></div>
    <div style="display:flex;gap:4px;margin-top:4px">${days}</div>
    <div style="font-size:9px;color:var(--tx3);margin-top:3px">Красным — порывы от 15 м/с, осадки от 10 мм, гроза/сильный снег. Open-Meteo.</div></div>`;
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
