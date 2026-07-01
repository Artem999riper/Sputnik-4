// Утилиты для построения безопасных имён папок и файлов.
// Скопировано из Sputnik-4/routes/field.js для 100% совместимости.

function safeFolderName(name) {
  return String(name || 'без_имени')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'без_имени';
}

function buildBhFolderName(bhRow) {
  const namePart = bhRow && (bhRow.name || (bhRow.uuid ? String(bhRow.uuid).slice(0, 6) : ''));
  const datePart = bhRow && bhRow.drill_date ? String(bhRow.drill_date).replace(/-/g, '') : '';
  return safeFolderName([namePart, datePart].filter(Boolean).join('_'));
}

function getCategorySubfolder(category) {
  // На Android: vyrabotka, drilling, core_box, journal.
  // В Sputnik-4 PC: vyrabotka/drilling → 01_…, kern → 02_…, journal → 03_….
  // Для совместимости core_box тоже даёт 02_…
  if (category === 'core_box' || category === 'kern') return '02_Фотофиксация_керна_в_ящиках';
  if (category === 'journal') return '03_Журнал_документации';
  return '01_Фотофиксация_участка_бурения';
}

module.exports = { safeFolderName, buildBhFolderName, getCategorySubfolder };
