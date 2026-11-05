// ═══════════════════════════════════════════════════════════
// routes/dbinfo.js — «Состав базы» для админа: из чего состоит survey.db
// (таблицы по разделам с понятным описанием, число записей, место на диске,
// последнее изменение), папки рядом (фото, резервные копии, выгрузки),
// крупнейшие слои карты; по таблице — поля и последние записи.
// Только чтение.
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { all, get } = require('../database');
const { wrap } = require('./validate');

// раздел и описание таблиц (что лежит и где видно в программе)
const T = {
  sites: ['Объекты', 'Объекты работ: название, заказчик, договор, сроки, статус, готовность'],
  site_bases: ['Объекты', 'Связь объект ↔ база'],
  site_tasks: ['Объекты', 'Задачи внутри объекта'],
  volumes: ['Объекты', 'Объёмы работ: план, единицы, слой KML, второй показатель'],
  vol_progress: ['Объекты', 'Выполнение объёмов по дням (в т. ч. копия отметок со слоёв)'],
  progress_items: ['Объекты', 'Пункты хода работ'],
  photos: ['Объекты', 'Фото объектов и баз (сами файлы — в папке uploads)'],
  kameral_reports: ['Объекты', 'Камеральные отчёты'],
  kameral_remarks: ['Объекты', 'Замечания к камеральным отчётам'],
  known_clients: ['Объекты', 'Справочник заказчиков (подсказки при вводе)'],
  bases: ['Базы', 'Базы и вахтовые посёлки'],
  fuel_reserves: ['Базы', 'Запасы топлива на базах'],
  fuel_transactions: ['Базы', 'Движение топлива (приход, расход)'],
  pgk_workers: ['Люди и техника', 'Сотрудники: ФИО, должность, база, статус'],
  worker_shifts: ['Люди и техника', 'Вахты сотрудников (факт и план)'],
  worker_docs: ['Люди и техника', 'Документы сотрудников: удостоверения, допуски, медосмотры'],
  pgk_brigades: ['Люди и техника', 'Бригады'],
  pgk_brigade_members: ['Люди и техника', 'Состав бригад'],
  pgk_brigade_bases: ['Люди и техника', 'Бригада ↔ база'],
  pgk_brigade_sites: ['Люди и техника', 'Бригада ↔ объект'],
  pgk_machinery: ['Люди и техника', 'Техника: название, госномер, тип, состояние'],
  machine_moves: ['Люди и техника', 'Перемещения техники'],
  spare_parts: ['Люди и техника', 'Запчасти'],
  spare_parts_groups: ['Люди и техника', 'Группы запчастей'],
  pgk_equipment: ['Оборудование и материалы', 'Оборудование: приборы, серийные номера, поверка'],
  equipment_groups: ['Оборудование и материалы', 'Группы оборудования'],
  equipment_history: ['Оборудование и материалы', 'История перемещений оборудования'],
  equipment_responsible_history: ['Оборудование и материалы', 'История ответственных за оборудование'],
  inventory_sessions: ['Оборудование и материалы', 'Инвентаризации'],
  inventory_marks: ['Оборудование и материалы', 'Отметки инвентаризаций'],
  materials: ['Оборудование и материалы', 'Материалы и остатки'],
  materials_groups: ['Оборудование и материалы', 'Группы материалов'],
  materials_log: ['Оборудование и материалы', 'Движение материалов'],
  mto_items: ['Оборудование и материалы', 'Заявки МТО'],
  cargo_orders: ['Груз и задачи', 'Грузы: что, откуда, куда, статус'],
  global_tasks: ['Груз и задачи', 'Задачи (вкладка «Задачи»)'],
  notifications: ['Груз и задачи', 'Уведомления пользователям (🔔)'],
  kml_layers: ['Карта', 'Слои карты: KML, объёмы, заметки, ситуация (геометрия внутри)'],
  dem_jobs: ['Карта', 'Очередь выгрузок рельефа (архивы — в папке exports)'],
  field_boreholes: ['Полевые данные', 'Скважины из полевого приложения'],
  field_soil_layers: ['Полевые данные', 'Слои грунта скважин'],
  field_samples: ['Полевые данные', 'Пробы'],
  field_ugv: ['Полевые данные', 'Уровни грунтовых вод'],
  field_mmg: ['Полевые данные', 'Мёрзлые грунты'],
  field_photos: ['Полевые данные', 'Фото скважин (файлы — в uploads/field)'],
  field_imports: ['Полевые данные', 'Журнал импортов из полевого приложения'],
  activity_log: ['Служебное', 'Журнал действий (кто что изменил)'],
  audit_log: ['Служебное', 'Журнал изменений записей'],
  error_log: ['Служебное', 'Журнал ошибок'],
  app_settings: ['Служебное', 'Настройки программы (ключ → значение)'],
  user_sessions: ['Служебное', 'Сеансы пользователей'],
  backups: ['Служебное', 'Список резервных копий'],
};
const SECTIONS = ['Объекты', 'Базы', 'Люди и техника', 'Оборудование и материалы', 'Груз и задачи', 'Карта', 'Полевые данные', 'Служебное', 'Прочее'];
const q = n => '"' + String(n).replace(/"/g, '""') + '"';

// размер папки (рекурсивно), с ограничением по числу файлов
function dirSize(dir, cap = 200000) {
  let bytes = 0, files = 0;
  const walk = d => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const f of list) {
      if (files > cap) return;
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else { try { bytes += fs.statSync(p).size; files++; } catch (e) {} }
    }
  };
  walk(dir);
  return { bytes, files, exists: fs.existsSync(dir) };
}

module.exports = (app, getDb, { isAdmin, BACKUP_DIR, DB_PATH, ROOT }) => {
  const admin = (req, res) => { if (isAdmin(req)) return true; res.status(403).json({ error: 'Только для админа' }); return false; };

  app.get('/api/admin/dbinfo', wrap((req, res) => {
    if (!admin(req, res)) return;
    const d = getDb();
    const names = all(d, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r => r.name);
    // место на диске по таблицам (с индексами) — через dbstat, если SQLite его поддерживает
    let sizes = null;
    try {
      sizes = {};
      const idx = Object.fromEntries(all(d, "SELECT name, tbl_name FROM sqlite_master WHERE type='index'").map(r => [r.name, r.tbl_name]));
      all(d, 'SELECT name, SUM(pgsize) b FROM dbstat GROUP BY name').forEach(r => { const t = idx[r.name] || r.name; sizes[t] = (sizes[t] || 0) + r.b; });
    } catch (e) { sizes = null; }
    const tables = names.map(n => {
      const cols = all(d, `PRAGMA table_info(${q(n)})`);
      const rows = (get(d, `SELECT COUNT(*) n FROM ${q(n)}`) || {}).n || 0;
      // последнее изменение — по самому «свежему» полю даты, какое есть
      const dc = ['updated_at', 'last_at', 'created_at', 'at', 'work_date', 'date'].find(c => cols.some(x => x.name === c));
      let last = null; if (dc && rows) { try { last = (get(d, `SELECT MAX(${q(dc)}) v FROM ${q(n)}`) || {}).v || null; } catch (e) {} }
      const [sec, desc] = T[n] || ['Прочее', ''];
      return { name: n, section: sec, desc, rows, cols: cols.length, bytes: sizes ? (sizes[n] || 0) : null, last };
    });
    const st = f => { try { return fs.statSync(f).size; } catch (e) { return 0; } };
    // крупнейшие слои карты (геометрия хранится в самой базе)
    let layers = [];
    try {
      layers = all(d, 'SELECT id, name, LENGTH(geojson) b, style_json, site_id FROM kml_layers ORDER BY b DESC LIMIT 15').map(r => {
        let kind = 'слой'; try { const s = JSON.parse(r.style_json || '{}') || {}; kind = s.notes ? 'заметки' : s.situation ? 'ситуация' : 'слой'; } catch (e) {}
        if (get(d, 'SELECT 1 x FROM volumes WHERE layer_id=? LIMIT 1', [r.id])) kind = 'объём';
        if (r.site_id) kind += ' объекта';
        return { name: r.name, bytes: r.b || 0, kind };
      });
    } catch (e) {}
    const exportsDir = path.join(path.dirname(DB_PATH), 'exports');
    res.json({
      file: { path: DB_PATH, bytes: st(DB_PATH), wal: st(DB_PATH + '-wal') },
      folders: [
        { key: 'uploads', name: 'Фото и файлы (public/uploads)', ...dirSize(path.join(ROOT, 'public', 'uploads')) },
        { key: 'backups', name: 'Резервные копии', ...dirSize(BACKUP_DIR) },
        { key: 'exports', name: 'Выгрузки рельефа (exports)', ...dirSize(exportsDir) },
      ],
      sections: SECTIONS, tables, layers, sizesExact: !!sizes,
    });
  }));

  // поля и последние записи таблицы (длинные значения — обрезаны)
  app.get('/api/admin/dbinfo/:table', wrap((req, res) => {
    if (!admin(req, res)) return;
    const d = getDb(), n = req.params.table;
    if (!get(d, "SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?", [n])) return res.status(404).json({ error: 'Нет такой таблицы' });
    const cols = all(d, `PRAGMA table_info(${q(n)})`).map(c => ({ name: c.name, type: c.type || '', pk: !!c.pk }));
    const order = ['updated_at', 'created_at', 'at', 'rowid'].find(c => c === 'rowid' || cols.some(x => x.name === c));
    const rows = all(d, `SELECT * FROM ${q(n)} ORDER BY ${order === 'rowid' ? 'rowid' : q(order)} DESC LIMIT 5`).map(r => {
      const o = {}; for (const k in r) { const v = r[k]; o[k] = v == null ? null : typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + `… (${Math.round(v.length / 1024)} КБ)` : Buffer.isBuffer(v) ? `[двоичные данные ${v.length} байт]` : v; }
      return o;
    });
    res.json({ name: n, desc: (T[n] || [])[1] || '', cols, rows });
  }));
};
module.exports.TABLES = T;
