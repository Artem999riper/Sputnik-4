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

// ── Генерация текстовой сводки (как в Android) ───────────────

function fmtNum(v) {
  const n = Number(v) || 0;
  if (n === Math.floor(n)) return String(Math.floor(n));
  return n.toFixed(1).replace('.', ',');
}

function parseSnap(json) {
  if (!json) return { transportLabel: '', memberNames: [] };
  try { const o = JSON.parse(json); return { transportLabel: o.transportLabel || '', memberNames: o.memberNames || [] }; }
  catch { return { transportLabel: '', memberNames: [] }; }
}

function formatLayerHints(layers) {
  const out = [];
  let top = 0;
  for (const l of layers) {
    const bot = Number(l.depth_m) || 0;
    if (!bot) continue;
    const type = (l.soil_type || 'грунт').toLowerCase();
    const fr = l.frozen_state;
    const frozen = (fr === 'Мёрзлый' || fr === 'Мерзлый') ? ' мёрзлый' : fr === 'Талый' ? ' талый' : '';
    out.push(`${fmtNum(top)}-${fmtNum(bot)} ${type}${frozen}`);
    top = bot;
  }
  return out.join(', ');
}

function collectBuckets(d, volumes, day) {
  const buckets = new Map();
  const getOrAdd = (snap) => {
    if (!buckets.has(snap.key)) buckets.set(snap.key, { snap, boreholes: [], thermometry: [], probe: [] });
    return buckets.get(snap.key);
  };
  volumes.filter(v => v.kind === 'DRILLING').forEach(vol => {
    const bhs = all(d, "SELECT * FROM boreholes WHERE volume_id=? AND status='done' AND drill_date=?", [vol.id, day]);
    bhs.forEach(bh => {
      const snap = parseSnap(bh.brigade_snapshot);
      snap.key = snap.transportLabel + '|' + snap.memberNames.join('|');
      const layers = all(d, 'SELECT * FROM soil_layers WHERE borehole_uuid=? ORDER BY order_idx', [bh.uuid]);
      getOrAdd(snap).boreholes.push({ name: bh.name || bh.uuid.slice(0,6), depthM: Number(bh.planned_depth_m) || 0, hints: formatLayerHints(layers) });
    });
  });
  volumes.filter(v => v.kind !== 'DRILLING').forEach(vol => {
    const tps = all(d, "SELECT * FROM task_points WHERE volume_id=? AND completed_date=?", [vol.id, day]);
    tps.forEach(tp => {
      const snap = parseSnap(tp.brigade_snapshot);
      snap.key = snap.transportLabel + '|' + snap.memberNames.join('|');
      const entry = { name: tp.name || tp.uuid.slice(0,6), notes: tp.notes || '' };
      if (vol.kind === 'THERMOMETRY') getOrAdd(snap).thermometry.push(entry);
      else getOrAdd(snap).probe.push(entry);
    });
  });
  return buckets;
}

function appendDaySection(lines, day, buckets) {
  lines.push(`Выполнение за ${day}`);
  lines.push('');
  if (!buckets.size) { lines.push(`Нет выполненных работ за ${day}.`); lines.push(''); return; }
  let first = true;
  for (const { snap, boreholes, thermometry, probe } of buckets.values()) {
    if (!first) lines.push('─'.repeat(30));
    first = false;
    const bort = snap.transportLabel ? `Борт ${snap.transportLabel} ` : '';
    const members = snap.memberNames.join(', ') || '—';
    lines.push(`${bort}${members} выполнили:`);
    boreholes.forEach(bs => {
      const hints = bs.hints ? ` ( ${bs.hints} )` : '';
      lines.push(`Скв: ${bs.name}${hints}`);
    });
    if (boreholes.length) {
      const sum = boreholes.reduce((s, b) => s + b.depthM, 0);
      lines.push(`Итого - ${boreholes.length} скв - ${fmtNum(sum)} п.м`);
    }
    if (thermometry.length) lines.push(`Термометрия ${thermometry.length} скв: ` + thermometry.map(t => t.notes ? `${t.name} (${t.notes})` : t.name).join(', '));
    if (probe.length) lines.push(`Зондирование ${probe.length} точек: ` + probe.map(t => t.notes ? `${t.name} (${t.notes})` : t.name).join(', '));
    lines.push('');
  }
}

function generateSummaryText(d, siteId, from, to) {
  const volumes = siteId
    ? all(d, 'SELECT * FROM volumes WHERE site_id=?', [siteId])
    : all(d, 'SELECT * FROM volumes');

  const fromD = from ? new Date(from) : (to ? new Date(to) : new Date());
  const toD = to ? new Date(to) : (from ? new Date(from) : new Date());
  const days = [];
  for (let cur = new Date(fromD); cur <= toD; cur.setDate(cur.getDate() + 1))
    days.push(cur.toISOString().slice(0, 10));
  if (!days.length) days.push(new Date().toISOString().slice(0, 10));

  const lines = [];
  let lastBuckets = new Map();
  days.forEach((day, idx) => {
    if (idx > 0) { lines.push('═'.repeat(32)); lines.push(''); }
    const buckets = collectBuckets(d, volumes, day);
    appendDaySection(lines, day, buckets);
    if (idx === days.length - 1) lastBuckets = buckets;
  });
  lines.push('═'.repeat(32));
  lines.push('');

  // Пройдено за последний день
  const dayDrill = [...lastBuckets.values()].flatMap(b => b.boreholes);
  const dayThermo = [...lastBuckets.values()].flatMap(b => b.thermometry).length;
  const dayProbe  = [...lastBuckets.values()].flatMap(b => b.probe).length;
  if (dayDrill.length + dayThermo + dayProbe > 0) {
    lines.push(`Пройдено за день (${days[days.length-1]}):`);
    if (dayThermo) lines.push(`${dayThermo} скв термометрия`);
    if (dayProbe)  lines.push(`${dayProbe} точек зондирования`);
    if (dayDrill.length) lines.push(`${dayDrill.length} скв бурения - ${fmtNum(dayDrill.reduce((s,b) => s+b.depthM, 0))} п.м.`);
    lines.push('');
  }

  // Всего за период
  const periodDrill = volumes.filter(v => v.kind === 'DRILLING')
    .flatMap(v => all(d, "SELECT * FROM boreholes WHERE volume_id=? AND status='done' AND drill_date>=? AND drill_date<=?", [v.id, from || days[0], to || days[days.length-1]]));
  const periodThermo = volumes.filter(v => v.kind === 'THERMOMETRY')
    .flatMap(v => all(d, "SELECT * FROM task_points WHERE volume_id=? AND completed_date>=? AND completed_date<=?", [v.id, from || days[0], to || days[days.length-1]]));
  const periodProbe = volumes.filter(v => v.kind === 'STATIC_PROBE')
    .flatMap(v => all(d, "SELECT * FROM task_points WHERE volume_id=? AND completed_date>=? AND completed_date<=?", [v.id, from || days[0], to || days[days.length-1]]));

  lines.push(`Всего пройдено за период ${from || days[0]} — ${to || days[days.length-1]}:`);
  if (periodThermo.length) lines.push(`${periodThermo.length} скв термометрия`);
  if (periodProbe.length)  lines.push(`${periodProbe.length} точек зондирования`);
  if (periodDrill.length) {
    const depth = periodDrill.reduce((s, bh) => s + (Number(bh.planned_depth_m) || 0), 0);
    lines.push(`${periodDrill.length} скв бурения - ${fmtNum(depth)} п.м`);
  }
  lines.push('');

  // Общий объём (план)
  const byKind = {};
  volumes.forEach(v => { byKind[v.kind] = (byKind[v.kind] || 0) + (Number(v.total_volume) || 0); });
  if (Object.values(byKind).some(x => x > 0)) {
    lines.push('Общий объём выданный в работу:');
    if (byKind.STATIC_PROBE > 0) lines.push(`${fmtNum(byKind.STATIC_PROBE)} точек статического зондирования`);
    if (byKind.THERMOMETRY > 0)  lines.push(`${fmtNum(byKind.THERMOMETRY)} скв термометрия`);
    if (byKind.DRILLING > 0)     lines.push(`${fmtNum(byKind.DRILLING)} п.м бурения (план)`);
    lines.push('');
  }

  // Остаток
  const allDoneDrill = volumes.filter(v => v.kind === 'DRILLING')
    .flatMap(v => all(d, "SELECT * FROM boreholes WHERE volume_id=? AND status='done'", [v.id]));
  const allDoneThermo = volumes.filter(v => v.kind === 'THERMOMETRY')
    .flatMap(v => all(d, "SELECT * FROM task_points WHERE volume_id=? AND completed_date IS NOT NULL", [v.id]));
  const allDoneProbe = volumes.filter(v => v.kind === 'STATIC_PROBE')
    .flatMap(v => all(d, "SELECT * FROM task_points WHERE volume_id=? AND completed_date IS NOT NULL", [v.id]));

  const remProbe = (byKind.STATIC_PROBE || 0) - allDoneProbe.length;
  const remThermo = (byKind.THERMOMETRY || 0) - allDoneThermo.length;
  const remDrill = (byKind.DRILLING || 0) - allDoneDrill.reduce((s, bh) => s + (Number(bh.planned_depth_m) || 0), 0);
  if (remProbe > 0 || remThermo > 0 || remDrill > 0) {
    lines.push('Остаток:');
    if (remProbe > 0)  lines.push(`${fmtNum(remProbe)} точек статического зондирования`);
    if (remThermo > 0) lines.push(`${fmtNum(remThermo)} скв термометрия`);
    if (remDrill > 0)  lines.push(`${fmtNum(remDrill)} п.м бурения`);
  }

  return lines.join('\n').trimEnd();
}

module.exports = (app, ctx) => {
  const { db, wrap } = ctx;

  // Текстовая сводка (отображается прямо в приложении)
  app.get('/api/summary/text', wrap((req, res) => {
    const d = db();
    const { from, to, site_id } = req.query;
    const text = generateSummaryText(d, site_id || null, from || '', to || '');
    res.json({ text });
  }));

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
