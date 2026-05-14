// Генератор Word-документа «Акт приёма-передачи оборудования»
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle,
  HeadingLevel, TableLayoutType,
} = require('docx');

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const CELL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function cell(text, opts = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!opts.bold,
        size: opts.size || 22,
        font: 'Times New Roman',
      })],
    })],
  });
}

const STATUS_RU = { working: 'В работе', idle: 'Не используется', broken: 'Неисправно' };

function generateEquipActDocx(responsible, items) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

  const headerRows = [
    new TableRow({
      tableHeader: true,
      children: [
        cell('№', { bold: true, center: true, shade: 'D9E1F2', width: 600 }),
        cell('Наименование', { bold: true, center: true, shade: 'D9E1F2', width: 4000 }),
        cell('Тип / модель', { bold: true, center: true, shade: 'D9E1F2', width: 2200 }),
        cell('Серийный №', { bold: true, center: true, shade: 'D9E1F2', width: 2000 }),
        cell('Состояние', { bold: true, center: true, shade: 'D9E1F2', width: 1800 }),
        cell('Примечания', { bold: true, center: true, shade: 'D9E1F2', width: 3000 }),
      ],
    }),
  ];

  const dataRows = items.map((e, i) =>
    new TableRow({
      children: [
        cell(i + 1, { center: true, width: 600 }),
        cell(e.name, { width: 4000 }),
        cell(e.type || '—', { center: true, width: 2200 }),
        cell(e.serial_number || '—', { center: true, width: 2000 }),
        cell(STATUS_RU[e.status] || e.status || 'В работе', { center: true, width: 1800 }),
        cell(e.notes || '', { width: 3000 }),
      ],
    })
  );

  const para = (text, opts = {}) =>
    new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: opts.spaceAfter ?? 120 },
      children: [new TextRun({
        text,
        bold: !!opts.bold,
        size: opts.size || 24,
        font: 'Times New Roman',
      })],
    });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 850, bottom: 1134, left: 1701 },
        },
      },
      children: [
        para('АКТ ПРИЁМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ', { bold: true, center: true, size: 28, spaceAfter: 200 }),
        para(`г. _____________                                                                               ${dateStr}`, { spaceAfter: 200 }),
        para(
          `Настоящий акт составлен о том, что нижеперечисленное оборудование передаётся на ответственное хранение сотруднику:`,
          { spaceAfter: 100 }
        ),
        para(`${responsible}`, { bold: true, size: 26, spaceAfter: 240 }),
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [...headerRows, ...dataRows],
        }),
        para('', { spaceAfter: 80 }),
        para(`Итого передано: ${items.length} (${numToWords(items.length)}) единиц оборудования.`, { spaceAfter: 300 }),
        para('Сдал:                                            Принял:', { spaceAfter: 60 }),
        para('________________  /________________________/    ________________  /________________________/', { spaceAfter: 40 }),
        para('       (подпись)              (ФИО)                       (подпись)              (ФИО)', { size: 18, spaceAfter: 300 }),
        para('Дата: _______________________                   Дата: _______________________', { spaceAfter: 0 }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

function numToWords(n) {
  const ones = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять',
    'десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
    'шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const tens = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  if (n < 20) return ones[n] || String(n);
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim();
}

module.exports = { generateEquipActDocx };
