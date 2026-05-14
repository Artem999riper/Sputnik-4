window.API = '/api';
window.state = {
  history: [],
  currentSite: null,
  currentVolume: null,
  currentBorehole: null,
};

window.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.api = async function (path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = ct.includes('json') ? (await r.json()).error || msg : await r.text(); } catch (_) {}
    throw new Error(msg);
  }
  return ct.includes('json') ? r.json() : r.text();
};

window.upload = async function (path, formData) {
  const r = await fetch(API + path, { method: 'POST', body: formData });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
};

window.fmtDate = function (s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('ru-RU');
};

window.todayStr = function () {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

window.WORK_TYPES = {
  SEARCH: 'Поиск',
  EXPLORATION: 'Разведка',
  TRENCH: 'Шурф',
  GEOLOGICAL: 'Геологическое',
};
window.VOLUME_KINDS = {
  DRILLING: 'Бурение',
  STATIC_PROBE: 'Статическое зондирование',
  THERMOMETRY: 'Термометрия',
};
window.PHOTO_CATEGORIES = {
  vyrabotka: 'Участок бурения',
  core_box:  'Керн',
  journal:   'Журнал',
};

window.SOIL_TYPES_DEFAULT = [
  'Суглинок', 'Супесь', 'Глина', 'Песок', 'Гравий', 'Галечник',
  'Торф', 'Сапропель', 'Алевролит', 'Аргиллит', 'Известняк', 'Песчаник',
];
window.SOIL_STATES_DEFAULT = [
  'Твердый', 'Полутвёрдый', 'Тугопластичный', 'Мягкопластичный', 'Текучепластичный',
  'Текучий', 'Плотный', 'Средней плотности', 'Рыхлый',
];
window.FROZEN_STATES = ['Талый', 'Мёрзлый'];
window.COLLECTION_TYPES = ['Монолит', 'Нарушенный'];
window.PACKAGING_TYPES = ['Контейнер', 'Полиэтилен', 'Мешок', 'Коробка', 'Банка', 'Пакет', 'Труба', 'Пробирка', 'Прочее'];
