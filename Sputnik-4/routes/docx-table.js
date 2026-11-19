// ═══════════════════════════════════════════════════════════
// routes/docx-table.js — таблица в Word (.docx) на сервере, без интернета:
//   POST /api/export/docx-table {file, title, lines:[…], head:[…], rows:[[…]], foot:[…], landscape, widths:[…]}
// → .docx (adm-zip). Используется каталогом координат; годится для любых ведомостей.
// ═══════════════════════════════════════════════════════════
const AdmZip = require('adm-zip');
const { wrap } = require('./validate');

const X = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (t, o = {}) => `<w:tc><w:tcPr>${o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : ''}${o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ''}${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>`
  + `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr><w:r><w:rPr>${o.b ? '<w:b/>' : ''}<w:sz w:val="${o.sz || 18}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r></w:p></w:tc>`;
const para = (t, o = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="${o.after ?? 60}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr><w:r><w:rPr>${o.b ? '<w:b/>' : ''}<w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r></w:p>`;

function buildDocx(b) {
  const head = (b.head || []).map(String), rows = Array.isArray(b.rows) ? b.rows : [], n = head.length || (rows[0] || []).length || 1;
  const land = !!b.landscape, pageW = land ? 16838 : 11906, pageH = land ? 11906 : 16838, usable = pageW - 1134 - 850;
  let widths = Array.isArray(b.widths) && b.widths.length === n ? b.widths.map(Number) : null;
  if (!widths) widths = head.map(() => 1);
  const tot = widths.reduce((s, v) => s + (v > 0 ? v : 1), 0), W = widths.map(v => Math.round((v > 0 ? v : 1) / tot * usable));
  const num = v => typeof v === 'number' || /^-?\d+([.,]\d+)?$/.test(String(v || ''));
  let tbl = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + head.map((h, i) => cell(h, { b: 1, shade: 1, jc: 'center', w: W[i] })).join('') + '</w:tr>';
  rows.forEach(r => { tbl += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + Array.from({ length: n }, (_, i) => { const v = r[i]; return cell(typeof v === 'number' ? String(v).replace('.', ',') : v, { w: W[i], jc: i === 0 || num(v) ? 'center' : undefined }); }).join('') + '</w:tr>'; });
  if (Array.isArray(b.foot) && b.foot.length) tbl += '<w:tr>' + Array.from({ length: n }, (_, i) => cell(b.foot[i] == null ? '' : (typeof b.foot[i] === 'number' ? String(b.foot[i]).replace('.', ',') : b.foot[i]), { b: 1, w: W[i], jc: i ? 'center' : undefined, shade: 1 })).join('') + '</w:tr>';
  const B = 'w:val="single" w:sz="4" w:space="0" w:color="000000"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${b.title ? para(b.title, { b: 1, sz: 26, jc: 'center', after: 120 }) : ''}
${(b.lines || []).map(t => para(t, { sz: 20 })).join('')}
<w:p/>
<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top ${B}/><w:left ${B}/><w:bottom ${B}/><w:right ${B}/><w:insideH ${B}/><w:insideV ${B}/></w:tblBorders>
<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
${tbl}</w:tbl>
${(b.after || []).map(t => para(t, { sz: 20 })).join('')}
<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`));
  z.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`));
  z.addFile('word/document.xml', Buffer.from(doc, 'utf8'));
  return z.toBuffer();
}

module.exports = app => {
  app.post('/api/export/docx-table', wrap((req, res) => {
    const b = req.body || {};
    if (!Array.isArray(b.rows)) return res.status(400).json({ error: 'Нет строк таблицы' });
    if (b.rows.length > 50000) return res.status(400).json({ error: 'Слишком много строк для Word (больше 50 000)' });
    const buf = buildDocx(b);
    const name = String(b.file || 'Таблица').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.end(buf);
  }));
};
module.exports.buildDocx = buildDocx;
