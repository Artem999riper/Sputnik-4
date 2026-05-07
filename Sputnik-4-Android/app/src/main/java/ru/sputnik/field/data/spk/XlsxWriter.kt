package ru.sputnik.field.data.spk

import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Минимальный xlsx-writer без внешних зависимостей.
 * Поддерживает: строки, числа, формулы, merged cells, несколько листов,
 * базовое форматирование (жирный, выравнивание, границы), задание ширины колонок.
 *
 * Каждое значение ячейки указывается через CellValue.
 */

sealed class CellValue {
    data class Str(val value: String) : CellValue()
    data class Num(val value: Double) : CellValue()
    data class Formula(val expr: String) : CellValue()
    object Empty : CellValue()
}

/** Стиль ячейки. styleId 0 = default, 1 = title (bold,center,wrap), 2 = header (bold,center,wrap,border),
 *  3 = body (border,center), 4 = body-left (border,left). */
enum class CellStyle(val id: Int) {
    DEFAULT(0), TITLE(1), HEADER(2), BODY_CENTER(3), BODY_LEFT(4)
}

data class XlsxRow(val cells: List<Pair<CellValue, CellStyle>>)

class SheetBuilder(val name: String) {
    val rows = mutableListOf<XlsxRow>()
    val merges = mutableListOf<String>()  // e.g. "A1:F1"
    val colWidths = mutableMapOf<Int, Double>()  // 1-based col index → width

    val nextRowNum: Int get() = rows.size + 1

    fun row(vararg cells: Pair<CellValue, CellStyle>) {
        rows.add(XlsxRow(cells.toList()))
    }
    fun row(cells: List<Pair<CellValue, CellStyle>>) {
        rows.add(XlsxRow(cells))
    }
    fun merge(range: String) { merges.add(range) }
    fun colWidth(col: Int, w: Double) { colWidths[col] = w }
}

class XlsxBuilder {
    private val sheets = mutableListOf<SheetBuilder>()

    fun sheet(name: String, body: SheetBuilder.() -> Unit): SheetBuilder {
        val s = SheetBuilder(name); s.body(); sheets.add(s); return s
    }

    fun writeTo(out: OutputStream) {
        ZipOutputStream(out).use { zos ->
            entry(zos, "[Content_Types].xml", contentTypesXml(sheets.size))
            entry(zos, "_rels/.rels", relsXml())
            entry(zos, "xl/workbook.xml", workbookXml(sheets))
            entry(zos, "xl/_rels/workbook.xml.rels", workbookRelsXml(sheets.size))
            entry(zos, "xl/styles.xml", stylesXml())
            sheets.forEachIndexed { i, sh ->
                entry(zos, "xl/worksheets/sheet${i + 1}.xml", sheetXml(sh))
            }
        }
    }

    private fun entry(zos: ZipOutputStream, name: String, content: String) {
        zos.putNextEntry(ZipEntry(name))
        zos.write(content.toByteArray(Charsets.UTF_8))
        zos.closeEntry()
    }

    private fun contentTypesXml(numSheets: Int): String {
        val sheetOverrides = (1..numSheets).joinToString("") {
            """<Override PartName="/xl/worksheets/sheet$it.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"""
        }
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
$sheetOverrides
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""
    }

    private fun relsXml() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

    private fun workbookXml(sheets: List<SheetBuilder>): String {
        val sb = StringBuilder()
        sheets.forEachIndexed { i, sh ->
            sb.append("""<sheet name="${escAttr(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>""")
        }
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>$sb</sheets>
</workbook>"""
    }

    private fun workbookRelsXml(numSheets: Int): String {
        val sb = StringBuilder()
        for (i in 1..numSheets) {
            sb.append("""<Relationship Id="rId$i" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet$i.xml"/>""")
        }
        sb.append("""<Relationship Id="rId${numSheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>""")
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
$sb
</Relationships>"""
    }

    private fun stylesXml() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="FF000000"/></left>
<right style="thin"><color rgb="FF000000"/></right>
<top style="thin"><color rgb="FF000000"/></top>
<bottom style="thin"><color rgb="FF000000"/></bottom>
</border>
</borders>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
</cellXfs>
</styleSheet>"""

    private fun sheetXml(sh: SheetBuilder): String {
        val sb = StringBuilder()
        sb.append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")

        if (sh.colWidths.isNotEmpty()) {
            sb.append("<cols>")
            sh.colWidths.forEach { (col, w) ->
                sb.append("""<col min="$col" max="$col" width="$w" customWidth="1"/>""")
            }
            sb.append("</cols>")
        }

        sb.append("<sheetData>")
        sh.rows.forEachIndexed { rIdx, row ->
            val rowNum = rIdx + 1
            sb.append("""<row r="$rowNum">""")
            row.cells.forEachIndexed { cIdx, (value, style) ->
                val ref = colLetter(cIdx + 1) + rowNum
                appendCell(sb, ref, value, style)
            }
            sb.append("</row>")
        }
        sb.append("</sheetData>")

        if (sh.merges.isNotEmpty()) {
            sb.append("""<mergeCells count="${sh.merges.size}">""")
            sh.merges.forEach { sb.append("""<mergeCell ref="$it"/>""") }
            sb.append("</mergeCells>")
        }

        sb.append("</worksheet>")
        return sb.toString()
    }

    private fun appendCell(sb: StringBuilder, ref: String, value: CellValue, style: CellStyle) {
        when (value) {
            is CellValue.Empty -> sb.append("""<c r="$ref" s="${style.id}"/>""")
            is CellValue.Str -> sb.append("""<c r="$ref" s="${style.id}" t="inlineStr"><is><t xml:space="preserve">${escText(value.value)}</t></is></c>""")
            is CellValue.Num -> sb.append("""<c r="$ref" s="${style.id}"><v>${value.value}</v></c>""")
            is CellValue.Formula -> sb.append("""<c r="$ref" s="${style.id}"><f>${escText(value.expr)}</f></c>""")
        }
    }

    companion object {
        fun colLetter(col: Int): String {
            var n = col; val sb = StringBuilder()
            while (n > 0) { val r = (n - 1) % 26; sb.insert(0, ('A' + r)); n = (n - 1) / 26 }
            return sb.toString()
        }
        fun escText(s: String) = s
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        fun escAttr(s: String) = escText(s).replace("\"", "&quot;")
    }
}

// ── Удобные конструкторы ячеек ──────────────────────────────
fun txt(s: String?, style: CellStyle = CellStyle.BODY_CENTER): Pair<CellValue, CellStyle> {
    val v: CellValue = if (s.isNullOrEmpty()) CellValue.Empty else CellValue.Str(s)
    return v to style
}
fun num(v: Double?, style: CellStyle = CellStyle.BODY_CENTER): Pair<CellValue, CellStyle> {
    val cv: CellValue = if (v == null) CellValue.Empty else CellValue.Num(v)
    return cv to style
}
fun num(v: Int?, style: CellStyle = CellStyle.BODY_CENTER): Pair<CellValue, CellStyle> {
    val cv: CellValue = if (v == null) CellValue.Empty else CellValue.Num(v.toDouble())
    return cv to style
}
fun formula(expr: String, style: CellStyle = CellStyle.BODY_CENTER): Pair<CellValue, CellStyle> =
    (CellValue.Formula(expr) as CellValue) to style
fun empty(style: CellStyle = CellStyle.DEFAULT): Pair<CellValue, CellStyle> =
    (CellValue.Empty as CellValue) to style
