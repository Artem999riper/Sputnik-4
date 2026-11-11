// ═══════════════════════════════════════════════════════════
// usage.js — сообщает серверу о действиях, которые выполняются только в браузере
// (сервер их иначе не видит): отчёт заказчику, каталог координат, ведомость,
// таблица атрибутов, пересчёт координат, снимок карты, ситуация по подложке,
// экспорт в CSV / GPX / GeoJSON. Для «📈 Активности» в Администрировании.
// Функции оборачиваются после загрузки страницы, сами они не меняются.
// ═══════════════════════════════════════════════════════════
function usageMark(f) {
  try { fetch(`${API}/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ f }) }).catch(() => {}); } catch (e) {}
}
(function () {
  const WRAP = [
    ['openSiteReport', 'Отчёт для заказчика'], ['coordCatalogLayer', 'Каталог координат'], ['coordCatalogSelection', 'Каталог координат'],
    ['featSemReport', 'Ведомость выработок'], ['kmlAttrTable', 'Таблица атрибутов'], ['loadCoordConvert', 'Пересчёт координат'],
    ['mapSnapshotOpen', 'Печать / снимок карты'], ['satRecognize', 'Ситуация по подложке (снимок/топокарта)'],
  ];
  const go = () => {
    WRAP.forEach(([fn, label]) => {
      const orig = window[fn]; if (typeof orig !== 'function' || orig._usage) return;
      const w = function () { usageMark(label); return orig.apply(this, arguments); }; w._usage = true;
      window[fn] = w;
    });
    // экспорт в форматы, которые собираются в браузере
    const kr = window._kexRun;
    if (typeof kr === 'function' && !kr._usage) {
      const w = function (parts, fmt) { const l = { csv: 'Экспорт: CSV', gpx: 'Экспорт: GPX', geojson: 'Экспорт: GeoJSON' }[fmt]; if (l) usageMark(l); return kr.apply(this, arguments); };
      w._usage = true; window._kexRun = w;
    }
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go);
})();
