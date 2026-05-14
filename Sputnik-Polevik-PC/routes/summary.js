// Сводка Word за период
const { all, get } = require('../database');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} = require('docx');

const T_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const T_BORDERS = { top: T_BORDER, bottom: T_BORDER, left: T_BORDER, right: T_BORDER };

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: opts.spaceAfter ?? 100 },
    heading: opts.heading,
    children: [new TextRun({
      text: String(text || ''),
      bold: !!opts.bold,
      size: opts.size || 22,
      font: 'Times New Roman',
    })],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    borders: T_BORDERS,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!opts.bold,
        size: opts.size || 20,
        font: 'Times New Roman',
      })],
    })],
  });
}

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  app.get('/api/export/summary.docx', wrap(async (req, res) => {
    const d = db();
    const { from, to, site_id } = req.query;
    let sql = "SELECT b.*, v.kind AS vol_kind, v.name AS vol_name, v.total_volume AS vol_total, s.name AS site_name FROM boreholes b LEFT JOIN volumes v ON v.id=b.volume_id LEFT JOIN sites s ON s.id=b.site_id WHERE b.status='done'";
    const p_ = [];
    if (from) { sql += ' AND b.drill_date>=?'; p_.push(from); }
    if (to)   { sql += ' AND b.drill_date<=?'; p_.push(to); }
    if (site_id) { sql += ' AND b.site_id=?'; p_.push(site_id); }
    sql += ' ORDER BY b.drill_date, b.name';
    const boreholes = all(d, sql, p_);

    const periodStr = from || to ? `${from || '...'} – ${to || '...'}` : 'весь период';
    const siteName = site_id ? get(d, 'SELECT name FROM sites WHERE id=?', [site_id])?.name : 'все объекты';

    // Группировка по объёмам
    const byVol = {};
    boreholes.forEach(bh => {
      const k = bh.volume_id || '_';
      if (!byVol[k]) byVol[k] = { name: bh.vol_name, kind: bh.vol_kind, total: bh.vol_total, items: [] };
      byVol[k].items.push(bh);
    });

    const totalDepth = boreholes.reduce((s, bh) => s + (Number(bh.casing_length_m) || Number(bh.planned_depth_m) || 0), 0);

    const KIND_RU = { DRILLING: 'Бурение', STATIC_PROBE: 'Статическое зондирование', THERMOMETRY: 'Термометрия' };
    const tableRows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('№',          { bold: true, center: true, shade: 'D9E1F2' }),
          cell('Объём',      { bold: true, center: true, shade: 'D9E1F2' }),
          cell('Скважина',   { bold: true, center: true, shade: 'D9E1F2' }),
          cell('Дата',       { bold: true, center: true, shade: 'D9E1F2' }),
          cell('Глубина, м', { bold: true, center: true, shade: 'D9E1F2' }),
        ],
      }),
      ...boreholes.map((bh, i) => new TableRow({
        children: [
          cell(i + 1, { center: true }),
          cell(bh.vol_name || '—'),
          cell(bh.name || '—'),
          cell(bh.drill_date || '—', { center: true }),
          cell((Number(bh.casing_length_m) || Number(bh.planned_depth_m) || 0).toFixed(1), { center: true }),
        ],
      })),
    ];

    const children = [
      p('СВОДКА ПОЛЕВЫХ РАБОТ', { bold: true, center: true, size: 28, spaceAfter: 200 }),
      p(`Объект: ${siteName}`, { spaceAfter: 80 }),
      p(`Период: ${periodStr}`, { spaceAfter: 80 }),
      p(`Всего скважин (завершено): ${boreholes.length}`, { spaceAfter: 80 }),
      p(`Суммарная глубина: ${totalDepth.toFixed(1)} м`, { spaceAfter: 200 }),
      p('Объёмы:', { bold: true, spaceAfter: 80 }),
      ...Object.values(byVol).map(v =>
        p(`  • ${v.name} (${KIND_RU[v.kind] || v.kind}) — выполнено ${v.items.length} ${v.total ? 'из ' + v.total : ''}`, { spaceAfter: 60 })
      ),
      p('', { spaceAfter: 100 }),
      p('Список скважин:', { bold: true, spaceAfter: 100 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      }),
      p('', { spaceAfter: 200 }),
      p(`Документ сформирован: ${new Date().toLocaleString('ru-RU')}`,
        { size: 18, spaceAfter: 0 }),
    ];

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buf = await Packer.toBuffer(doc);
    const fname = `Сводка_${(from || 'all')}__${(to || 'all')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(buf);
  }));
};
