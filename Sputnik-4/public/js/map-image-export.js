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
  // Закрываем все открытые тултипы чтобы они не попали на снимок
  map.eachLayer(function(l) { try { l.closeTooltip && l.closeTooltip(); } catch(e){} });

  const mapEl = document.getElementById('map');
  const tl = map.latLngToContainerPoint(bounds.getNorthWest());
  const br = map.latLngToContainerPoint(bounds.getSouthEast());
  const cropX = Math.round(Math.min(tl.x, br.x));
  const cropY = Math.round(Math.min(tl.y, br.y));
  const cropW = Math.round(Math.abs(br.x - tl.x));
  const cropH = Math.round(Math.abs(br.y - tl.y));

  if (cropW < 10 || cropH < 10) { toast('Область слишком маленькая', 'warn'); return; }

  toast('Создание изображения…', 'ok');
  try {
    const dpr = window.devicePixelRatio || 1;
    const canvas = await html2canvas(mapEl, {
      useCORS: true,
      allowTaint: false,
      scale: dpr,
      logging: false,
      imageTimeout: 8000,
    });
    const out = document.createElement('canvas');
    out.width  = cropW * dpr;
    out.height = cropH * dpr;
    out.getContext('2d').drawImage(
      canvas,
      cropX * dpr, cropY * dpr, cropW * dpr, cropH * dpr,
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
    console.error('PNG export error:', err);
    toast('Ошибка экспорта: ' + err.message, 'err');
  }
}
