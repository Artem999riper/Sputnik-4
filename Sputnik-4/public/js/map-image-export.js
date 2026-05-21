// Экспорт выделенной области карты как PNG-изображение
let _imgExStart = null, _imgExTmp = null, _imgExOpts = null;

function openMapImageExport() {
  showModal('🖼 Экспорт PNG',
    `<p style="margin:0 0 10px;color:var(--text-secondary)">Выберите слои для экспорта:</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-kml" checked> KML слои</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-facts" checked> Объёмы (+факты)</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-mach" checked> Техника</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="pex-bases" checked> Базы</label>
    </div>`,
    [
      {label: 'Отмена', cls: 'bs', fn: closeModal},
      {label: 'Выбрать область →', cls: 'bp', fn: function() {
        _imgExOpts = {
          kml:      document.getElementById('pex-kml').checked,
          facts:    document.getElementById('pex-facts').checked,
          machinery: document.getElementById('pex-mach').checked,
          bases:    document.getElementById('pex-bases').checked
        };
        closeModal();
        _imgExBeginDraw();
      }}
    ]
  );
}

function _imgExBeginDraw() {
  _imgExStart = null;
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = 'crosshair';
  const bnr = document.getElementById('bnr');
  bnr.className = 'show draw';
  document.getElementById('bnr-t').textContent = '🖼 Первый угол области (ПКМ — отмена)';
  map.once('click', _imgExFirst);
  map.once('contextmenu', _imgExCancel);
}

function _imgExFirst(e) {
  _imgExStart = e.latlng;
  document.getElementById('bnr-t').textContent = '🖼 Второй угол области';
  map.on('mousemove', _imgExMove);
  map.once('click', _imgExSecond);
  map.off('contextmenu', _imgExCancel);
  map.once('contextmenu', _imgExCancel);
}

function _imgExMove(e) {
  if (!_imgExStart) return;
  const b = L.latLngBounds(_imgExStart, e.latlng);
  if (_imgExTmp) _imgExTmp.setBounds(b);
  else _imgExTmp = L.rectangle(b, {color:'#e11d48', weight:2, dashArray:'6 4', fillColor:'#e11d48', fillOpacity:.08}).addTo(map);
}

function _imgExSecond(e) {
  map.off('mousemove', _imgExMove);
  map.off('contextmenu', _imgExCancel);
  const bounds = L.latLngBounds(_imgExStart, e.latlng);
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  _imgExRender(bounds);
}

function _imgExCancel() {
  map.off('mousemove', _imgExMove);
  map.off('click', _imgExFirst);
  map.off('click', _imgExSecond);
  if (_imgExTmp) { try { map.removeLayer(_imgExTmp); } catch(e){} _imgExTmp = null; }
  map.getContainer().style.cursor = '';
  document.getElementById('bnr').className = '';
  toast('Экспорт PNG отменён', 'ok');
}

async function _imgExRender(bounds) {
  if (typeof html2canvas === 'undefined') {
    toast('html2canvas не загружен', 'err');
    return;
  }

  const mapEl = document.getElementById('map');
  const tl = map.latLngToContainerPoint(bounds.getNorthWest());
  const br = map.latLngToContainerPoint(bounds.getSouthEast());
  const cropX = Math.round(Math.min(tl.x, br.x));
  const cropY = Math.round(Math.min(tl.y, br.y));
  const cropW = Math.round(Math.abs(br.x - tl.x));
  const cropH = Math.round(Math.abs(br.y - tl.y));

  if (cropW < 10 || cropH < 10) { toast('Область слишком маленькая', 'warn'); return; }

  const opts = _imgExOpts || {kml: true, facts: true, machinery: true, bases: true};

  // Собираем элементы для скрытия перед html2canvas.
  // Важно: html2canvas захватывает ВСЕ canvas-элементы карты, включая kmlPane,
  // поэтому нужно скрыть pane-контейнеры невыбранных слоёв до захвата.
  const hiddenEls = [];
  function _hide(el) { if (el) { el.style.display = 'none'; hiddenEls.push(el); } }

  // Pane-контейнеры canvas-слоёв
  if (!opts.kml)   _hide(map.getPanes()['kmlPane']);
  if (!opts.facts) { _hide(map.getPanes()['overlayPane']); _hide(map.getPanes()['volPointsPane']); }

  // divIcon-маркеры
  if (!opts.machinery) Object.values(mMarkers || {}).forEach(function(m) { _hide(m.getElement ? m.getElement() : null); });
  if (!opts.bases)     Object.values(bMarkers || {}).forEach(function(m) { _hide(m.getElement ? m.getElement() : null); });

  // Тултипы
  const _tips = document.querySelectorAll('.leaflet-tooltip');
  _tips.forEach(function(el) { el.style.visibility = 'hidden'; });

  toast('Создание изображения…', 'ok');
  try {
    const dpr = window.devicePixelRatio || 1;

    // Шаг 1: html2canvas — тайлы + divIcon-маркеры (которые не скрыты)
    const baseCanvas = await html2canvas(mapEl, {
      useCORS: true,
      allowTaint: false,
      scale: dpr,
      logging: false,
      imageTimeout: 8000,
    });

    const out = document.createElement('canvas');
    out.width  = cropW * dpr;
    out.height = cropH * dpr;
    const ctx = out.getContext('2d');

    // Рисуем базовый слой
    ctx.drawImage(baseCanvas, cropX * dpr, cropY * dpr, cropW * dpr, cropH * dpr, 0, 0, cropW * dpr, cropH * dpr);

    // Шаг 2: поверх добавляем canvas-элементы Leaflet-пейнов напрямую.
    // map.getPanes()[name] — официальный Leaflet API, без угадывания CSS-классов.
    // kmlPane — KML-слои; overlayPane+volPointsPane — объёмы и +факты.
    var panesToDraw = [];
    if (opts.kml)   panesToDraw.push('kmlPane');
    if (opts.facts) panesToDraw.push('overlayPane', 'volPointsPane');

    panesToDraw.forEach(function(paneName) {
      var paneEl = map.getPanes()[paneName];
      if (!paneEl) return;
      paneEl.querySelectorAll('canvas').forEach(function(c) {
        // Leaflet двигает canvas через CSS transform: translate(tx, ty).
        // Учитываем этот сдвиг при кропе.
        var tx = 0, ty = 0;
        try {
          var t = window.getComputedStyle(c).transform;
          if (t && t !== 'none') { var dm = new DOMMatrix(t); tx = dm.m41; ty = dm.m42; }
        } catch(e) {}
        ctx.drawImage(c, (cropX - tx) * dpr, (cropY - ty) * dpr, cropW * dpr, cropH * dpr, 0, 0, cropW * dpr, cropH * dpr);
      });
    });

    out.toBlob(function(blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'map_' + new Date().toISOString().slice(0, 10) + '.png';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 3000);
      toast('PNG сохранён', 'ok');
    }, 'image/png');

  } catch(err) {
    console.error('PNG export error:', err);
    toast('Ошибка экспорта: ' + err.message, 'err');
  } finally {
    hiddenEls.forEach(function(el) { el.style.display = ''; });
    _tips.forEach(function(el) { el.style.visibility = ''; });
  }
}
