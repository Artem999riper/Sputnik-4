// Симуляция зоны затопления по рельефу ArcticDEM
let _floodLayer = null, _floodStart = null, _floodTmp = null, _floodLevel = 50;
let _floodGeoidN = null; // N (м): WGS84_ellipsoid = BSV77 + N (N обычно отрицательный для России)
let _floodLastBbox = null, _floodLastWgs = null; // для DXF-экспорта последнего расчёта

function _floodCalcWgs(bsv77) {
  if (_floodGeoidN === null) return null;
  return (parseFloat(bsv77) || 0) + _floodGeoidN;
}

function _floodUpdateWgsField(val) {
  const el = document.getElementById('fl-level-wgs');
  if (!el) return;
  const wgs = _floodCalcWgs(val);
  if (wgs === null) {
    el.value = '';
    el.placeholder = 'нет данных';
  } else {
    el.value = wgs.toFixed(2);
  }
}

async function openFloodTool() {
  // Загружаем N для текущего центра карты
  _floodGeoidN = null;
  const center = map.getCenter();
  try {
    const r = await fetch(`/api/dem/geoid-n?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}`);
    if (r.ok) { const d = await r.json(); _floodGeoidN = (d.n !== null && !isNaN(d.n)) ? d.n : null; }
  } catch(e) {}

  const initWgs = _floodCalcWgs(_floodLevel);
  const wgsVal  = initWgs !== null ? initWgs.toFixed(2) : '';
  const nHint   = _floodGeoidN !== null
    ? `<span style="color:var(--text-secondary);font-size:11px">N = ${_floodGeoidN.toFixed(1)} м (геоид центра карты)</span>`
    : `<span style="color:var(--text-secondary);font-size:11px">N неизвестен — нет PROJ-данных, используется WGS84</span>`;

  const inputStyle = 'width:100px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)';

  showModal('🌊 Зона затопления',
    `<p style="margin:0 0 12px;color:var(--text-secondary)">Вычисляет зону затопления по рельефу ArcticDEM (10м разрешение).</p>
    <div style="display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px 12px;font-size:14px;margin-bottom:8px">
      <label for="fl-level" style="white-space:nowrap">Уровень воды (м, БСВ-77):</label>
      <input type="number" id="fl-level" value="${_floodLevel}" min="-500" max="5000" step="0.1"
        style="${inputStyle}" oninput="_floodUpdateWgsField(this.value)">
      <label for="fl-level-wgs" style="white-space:nowrap;color:var(--text-secondary)">WGS84 (м):</label>
      <input type="number" id="fl-level-wgs" value="${wgsVal}" readonly
        style="${inputStyle};background:var(--surface-3,var(--surface-2));color:var(--accent);cursor:default"
        placeholder="нет данных" title="Автоматически: БСВ-77 + N геоида">
    </div>
    <div style="margin-bottom:10px">${nHint}</div>
    <p style="margin:0;font-size:12px;color:var(--text-secondary)">Расчёт ведётся по WGS84 эллипсоиду. Вводите уровень в БСВ-77 — WGS84 считается автоматически.<br>⏱ 1–3 мин. GDAL + интернет. Покрытие: ≥55°с.ш.</p>`,
    [
      { label: 'Отмена', cls: 'bs', fn: closeModal },
      { label: 'Выбрать область →', cls: 'bp', fn: function() {
        _floodLevel = parseFloat(document.getElementById('fl-level').value) || 0;
        closeModal();
        _floodBeginDraw();
      }}
    ]
  );
}

function _floodBeginDraw() {
  _floodStart = null;
  if (_floodTmp) { try { map.removeLayer(_floodTmp); } catch(e) {} _floodTmp = null; }
  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  bnr.className = 'show draw';
  document.getElementById('bnr-t').textContent = '🌊 Первый угол области (ПКМ — отмена)';
  map.once('click', _floodFirst);
  map.once('contextmenu', _floodCancel);
}

function _floodFirst(e) {
  _floodStart = e.latlng;
  document.getElementById('bnr-t').textContent = '🌊 Второй угол области';
  map.on('mousemove', _floodMove);
  map.once('click', _floodSecond);
  map.off('contextmenu', _floodCancel);
  map.once('contextmenu', _floodCancel);
}

function _floodMove(e) {
  if (!_floodStart) return;
  const b = L.latLngBounds(_floodStart, e.latlng);
  if (_floodTmp) _floodTmp.setBounds(b);
  else _floodTmp = L.rectangle(b, { color: '#1d4ed8', weight: 2, dashArray: '6 4', fillColor: '#3b82f6', fillOpacity: 0.08 }).addTo(map);
}

function _floodSecond(e) {
  map.off('mousemove', _floodMove);
  map.off('contextmenu', _floodCancel);
  const bounds = L.latLngBounds(_floodStart, e.latlng);
  if (_floodTmp) { try { map.removeLayer(_floodTmp); } catch(e) {} _floodTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  _floodRender(bounds);
}

function _floodCancel() {
  map.off('mousemove', _floodMove);
  map.off('click', _floodFirst);
  map.off('click', _floodSecond);
  if (_floodTmp) { try { map.removeLayer(_floodTmp); } catch(e) {} _floodTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  toast('Расчёт затопления отменён', 'ok');
}

async function _floodRender(bounds) {
  const bbox = {
    minLat: bounds.getSouth(), maxLat: bounds.getNorth(),
    minLng: bounds.getWest(),  maxLng: bounds.getEast()
  };

  const areaKm2 = Math.abs((bbox.maxLat - bbox.minLat) * (bbox.maxLng - bbox.minLng) * 12308);
  if (areaKm2 > 2000) {
    toast('Область слишком большая (максимум ~2000 км²)', 'warn');
    return;
  }

  // Конвертируем BSV-77 → WGS84 если N известен
  const wgsLevel = (_floodGeoidN !== null) ? _floodLevel + _floodGeoidN : _floodLevel;
  const levelDisplay = (_floodGeoidN !== null)
    ? `${_floodLevel}м BSV-77 (${wgsLevel.toFixed(2)}м WGS84)`
    : `${_floodLevel}м`;
  toast(`🌊 Расчёт зоны затопления [${levelDisplay}]… 1–3 мин`, 'ok');

  try {
    const resp = await fetch('/api/dem/flood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox, waterLevel: wgsLevel })
    });
    const gj = await resp.json();
    if (!resp.ok) throw new Error(gj.error || resp.statusText);

    if (_floodLayer) { try { map.removeLayer(_floodLayer); } catch(e) {} }
    _floodLayer = L.geoJSON(gj, {
      style: { color: '#1d4ed8', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.45, opacity: 0.7 }
    }).addTo(map);

    const count = gj.features ? gj.features.length : 0;
    if (count === 0) {
      toast('Затопленных территорий не найдено при уровне ' + _floodLevel + ' м', 'warn');
      return;
    }

    // Сохраняем данные для DXF-экспорта
    _floodLastBbox = bbox;
    _floodLastWgs  = wgsLevel;

    toast('🌊 Зона затопления при ' + _floodLevel + ' м БСВ-77 построена', 'ok');

    showModal('Зона затопления построена',
      `<p>Уровень воды: <b>${_floodLevel} м БСВ-77</b>.<br>Полигонов: ${count}.</p>
      <p style="font-size:12px;color:var(--text-secondary)">Сохранить слой или экспортировать контуры в DXF.</p>`,
      [
        { label: 'Закрыть', cls: 'bs', fn: closeModal },
        { label: '📐 DXF', cls: 'bs', fn: function() { closeModal(); openFloodDxfExport(); } },
        { label: '💾 Сохранить слой', cls: 'bp', fn: function() { closeModal(); _floodSaveLayer(gj); } }
      ]
    );
  } catch (err) {
    console.error('[FLOOD]', err);
    const msg = err.message || String(err);
    if (msg.includes('dem_tiles') || msg.includes('HTTPS_PROXY') || msg.includes('тайлы ArcticDEM')) {
      showModal(
        'Нет данных рельефа',
        '<div style="white-space:pre-wrap;font-size:13px;line-height:1.5">' + msg.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>',
        [{ label: 'Закрыть', fn: closeModal, cls: 'bp' }]
      );
    } else {
      toast('Ошибка расчёта: ' + msg, 'err');
    }
  }
}

function openFloodDxfExport() {
  if (!_floodLastBbox) { toast('Сначала выполните расчёт затопления', 'warn'); return; }

  // Авто-выбор проекции по долготе центра bbox
  const lonC = (_floodLastBbox.minLng + _floodLastBbox.maxLng) / 2;
  const projs = typeof DEM_PROJECTIONS !== 'undefined' ? DEM_PROJECTIONS : [];
  let defId = projs.length ? projs[0].id : '';
  if (lonC >= 66 && lonC < 72)  defId = 'msk86_z3';
  else if (lonC >= 72 && lonC < 78) defId = 'msk86_z4';
  else if (lonC >= 60 && lonC < 66) defId = 'gsk2011_z12';
  else if (lonC >= 78 && lonC < 84) defId = 'gsk2011_z14';

  const projOpts = projs.map(p =>
    `<option value="${p.id}" ${p.id === defId ? 'selected' : ''}>${p.label}</option>`
  ).join('');

  const wgsLabel = _floodLastWgs != null ? `${_floodLastWgs.toFixed(2)} м WGS84` : `${_floodLevel} м`;

  showModal('📐 Экспорт затопления в DXF',
    `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;
                background:var(--accl);border:1.5px solid var(--accm);border-radius:var(--rs);padding:8px 11px">
      Уровень: <b>${_floodLevel} м БСВ-77</b> (${wgsLabel})<br>
      Слой DXF: <b>ГРАНИЦА_ЗАТОПЛЕНИЯ</b> (синий), Z = ${_floodLevel} м БСВ-77
    </div>
    <div class="fgr">
      <div class="fg s2">
        <label>Система координат</label>
        <select id="fldxf-proj" style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)">
          ${projOpts}
        </select>
      </div>
    </div>`,
    [
      { label: 'Отмена', cls: 'bs', fn: closeModal },
      { label: '⬇️ Скачать ZIP', cls: 'bp', fn: async function() {
        const selId = document.getElementById('fldxf-proj')?.value;
        const proj  = projs.find(p => p.id === selId) || {};
        closeModal();
        await _floodExportDxf(proj);
      }}
    ]
  );
}

async function _floodExportDxf(proj) {
  toast('📐 Формирование DXF… подождите', 'ok');
  try {
    const body = {
      bbox:           _floodLastBbox,
      waterLevel:     _floodLastWgs != null ? _floodLastWgs : _floodLevel,
      waterLevelBsv77: _floodLevel,
      proj4:    proj.proj4  || null,
      epsg:     proj.epsg   || null,
      projName: proj.name   || proj.id || 'WGS84',
    };
    const resp = await fetch('/api/dem/flood/dxf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || resp.statusText);
    }
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flood_${_floodLevel}m_${proj.name || 'WGS84'}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('✅ DXF скачан', 'ok');
  } catch(e) {
    toast('Ошибка экспорта DXF: ' + e.message, 'err');
  }
}

async function _floodSaveLayer(gj) {
  const name = '🌊 Затопление ' + _floodLevel + ' м БСВ-77';
  try {
    const resp = await fetch('/api/layers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, geojson: JSON.stringify(gj), color: '#3b82f6' })
    });
    if (resp.ok) {
      toast('Слой «' + name + '» сохранён', 'ok');
      if (typeof renderKmlPanel === 'function') renderKmlPanel();
    } else {
      toast('Не удалось сохранить слой', 'err');
    }
  } catch (err) {
    toast('Ошибка сохранения: ' + err.message, 'err');
  }
}
