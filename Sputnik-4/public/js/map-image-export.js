// Экспорт выделенной области карты как PNG-изображение
let _imgExStart = null, _imgExTmp = null;

function openMapImageExport() {
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
  const rect  = mapEl.getBoundingClientRect();
  const tl = map.latLngToContainerPoint(bounds.getNorthWest());
  const br = map.latLngToContainerPoint(bounds.getSouthEast());
  const cropX = Math.round(Math.min(tl.x, br.x));
  const cropY = Math.round(Math.min(tl.y, br.y));
  const cropW = Math.round(Math.abs(br.x - tl.x));
  const cropH = Math.round(Math.abs(br.y - tl.y));

  if (cropW < 10 || cropH < 10) { toast('Область слишком маленькая', 'warn'); return; }

  // Скрываем тултипы и UI-элементы — не должны попасть на снимок
  const _tips = document.querySelectorAll('.leaflet-tooltip');
  _tips.forEach(function(el) { el.style.visibility = 'hidden'; });
  // Скрываем панели интерфейса
  var _hiddenEls = [];
  ['#tb','#sidebar','#panel','#mini-panel','#mtb','#bnr','#ctx','#lp','#bcard',
   '#kml-panel','#personnel-page','#dash-page'].forEach(function(sel) {
    var el = document.querySelector(sel);
    if (el && el.style.display !== 'none') { el.style.visibility = 'hidden'; _hiddenEls.push(el); }
  });

  function _restore() {
    _tips.forEach(function(el) { el.style.visibility = ''; });
    _hiddenEls.forEach(function(el) { el.style.visibility = ''; });
  }

  toast('Создание изображения…', 'ok');
  try {
    const dpr = window.devicePixelRatio || 1;
    // Рендерим весь documentElement — это решает проблему с position:fixed #map:
    // html2canvas некорректно рендерит absolute-потомков fixed-элемента как корня.
    // Затем вырезаем нужную область (позиция карты в viewport + offset выделения).
    const canvas = await html2canvas(document.documentElement, {
      useCORS: true,
      allowTaint: false,
      scale: dpr,
      logging: false,
      imageTimeout: 8000,
      windowWidth:  window.innerWidth,
      windowHeight: window.innerHeight,
    });
    _restore();

    // Координаты выделения в системе полной страницы
    const pageX = Math.round((rect.left + cropX) * dpr);
    const pageY = Math.round((rect.top  + cropY) * dpr);
    const out = document.createElement('canvas');
    out.width  = cropW * dpr;
    out.height = cropH * dpr;
    out.getContext('2d').drawImage(
      canvas,
      pageX, pageY, cropW * dpr, cropH * dpr,
      0, 0, cropW * dpr, cropH * dpr
    );
    out.toBlob(function(blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'map_' + new Date().toISOString().slice(0, 10) + '.png';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 3000);
      toast('PNG сохранён', 'ok');
    }, 'image/png');
  } catch(err) {
    _restore();
    console.error('PNG export error:', err);
    toast('Ошибка экспорта: ' + err.message, 'err');
  }
}
