// Симуляция зоны затопления по рельефу ArcticDEM
let _floodLayer = null, _floodStart = null, _floodTmp = null, _floodLevel = 50;

function openFloodTool() {
  showModal('🌊 Зона затопления',
    `<p style="margin:0 0 12px;color:var(--text-secondary)">Вычисляет зону затопления по рельефу ArcticDEM (10м разрешение).</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:14px;margin-bottom:12px">
      Уровень воды (м над ур. моря):
      <input type="number" id="fl-level" value="${_floodLevel}" min="-500" max="5000" step="1"
        style="width:90px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)">
    </label>
    <p style="margin:0;font-size:12px;color:var(--text-secondary)">⏱ Расчёт занимает 1–3 мин. Требуется GDAL и доступ к ArcticDEM (Арктика/Субарктика, ≥55°с.ш.).<br>Изолированные впадины ниже уровня также закрашиваются.</p>`,
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

  toast('🌊 Расчёт зоны затопления… это займёт 1–3 мин', 'ok');

  try {
    const resp = await fetch('/api/dem/flood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox, waterLevel: _floodLevel })
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

    toast('🌊 Зона затопления при ' + _floodLevel + ' м построена', 'ok');

    showModal('Зона затопления построена',
      `<p>Уровень воды: <b>${_floodLevel} м</b> над ур. моря.<br>Полигонов: ${count}.</p>
      <p style="font-size:12px;color:var(--text-secondary)">Сохранить как слой KML для дальнейшей работы?</p>`,
      [
        { label: 'Закрыть', cls: 'bs', fn: closeModal },
        { label: '💾 Сохранить как слой', cls: 'bp', fn: function() { closeModal(); _floodSaveLayer(gj); } }
      ]
    );
  } catch (err) {
    console.error('[FLOOD]', err);
    toast('Ошибка расчёта: ' + err.message, 'err');
  }
}

async function _floodSaveLayer(gj) {
  const name = '🌊 Затопление ' + _floodLevel + ' м';
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
