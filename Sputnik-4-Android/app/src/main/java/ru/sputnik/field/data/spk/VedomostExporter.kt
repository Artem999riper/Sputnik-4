package ru.sputnik.field.data.spk

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import java.io.File
import java.io.FileOutputStream

data class VedomostResult(val uri: Uri, val fileName: String, val rowCount: Int)

private fun safeName(s: String?) = s?.takeIf { it.isNotBlank() }?.replace(Regex("[^\\p{L}\\p{N}_.-]"), "_") ?: "all"

private suspend fun gatherCards(
    db: AppDatabase, fromDate: String, toDate: String, siteId: String?
) = withContext(Dispatchers.IO) {
    val boreholes = if (siteId != null)
        db.boreholes().forExportBySite(siteId, fromDate, toDate)
    else
        db.boreholes().forExportAll(fromDate, toDate)
    boreholes.map { bh ->
        val layers = db.soilLayers().byBoreholeOnce(bh.uuid)
        val samples = db.samples().byLayers(layers.map { it.uuid })
        Triple(bh, layers, samples)
    }
}

/** Форматирует диапазон глубины пробы как "2,0-3,4" / "2,0" / "—" */
private fun fmtSampleDepth(top: Double, bot: Double, fallback: Double): String {
    val t = if (top > 0) top else fallback
    return when {
        bot > 0 && bot != t -> "${fmtNum(t)}-${fmtNum(bot)}"
        t > 0 -> fmtNum(t)
        else -> ""
    }
}

private fun fmtNum(v: Double): String {
    return if (v == v.toLong().toDouble()) v.toLong().toString()
    else v.toString().replace('.', ',')
}

// ─────────────────────────────────────────────────────────────
// Ведомость образцов
// ─────────────────────────────────────────────────────────────
suspend fun exportSamplesVedomost(
    context: Context,
    fromDate: String,
    toDate: String,
    siteId: String?,
    siteName: String?,
    geologistName: String?
): VedomostResult = withContext(Dispatchers.IO) {
    val db = AppDatabase.get(context)
    val cards = gatherCards(db, fromDate, toDate, siteId)
    val today = java.time.LocalDate.now().toString()

    // Собираем плоский список проб с привязкой к слою+скважине
    data class Row(val n: Int, val geo: String, val date: String, val borehole: String,
                   val depth: String, val collType: String, val frozen: String, val soil: String)
    val rows = mutableListOf<Row>()
    val geo = geologistName?.takeIf { it.isNotBlank() } ?: "—"
    var seq = 1
    cards.forEach { (bh, layers, samples) ->
        val layerByUuid = layers.associateBy { it.uuid }
        samples.forEach { s ->
            val layer = layerByUuid[s.layerUuid]
            val collShort = when (s.collectionType) {
                "Монолит" -> "мон"; "Нарушенный" -> "нар"; else -> s.collectionType
            }
            rows.add(Row(
                n = seq++,
                geo = geo,
                date = bh.drillDate,
                borehole = bh.name,
                depth = fmtSampleDepth(s.depthTopM, s.depthBottomM, s.depthM),
                collType = collShort,
                frozen = layer?.frozenState ?: "",
                soil = layer?.soilType ?: ""
            ))
        }
    }

    val xlsx = XlsxBuilder()
    xlsx.sheet("Лист1") {
        // Шапка-заголовок
        row(txt("Ведомость образцов грунтов, отобранных при бурении инженерно-геологических выработок", CellStyle.TITLE))
        merge("A1:I1")
        row()
        row(txt("На объекте (участке) ${siteName ?: "—"}", CellStyle.BODY_LEFT))
        merge("A3:I3")
        row(txt("направляемых в лабораторию ________________________________", CellStyle.BODY_LEFT))
        merge("A4:I4")
        row(txt("(наименование лаборатории)", CellStyle.BODY_LEFT))
        merge("A5:I5")
        row(txt("организация-исполнитель: ООО \"ПурГеоКом\"", CellStyle.BODY_LEFT))
        merge("A6:I6")
        // Шапка таблицы
        row(
            txt("№ п/п", CellStyle.HEADER),
            txt("Геолог", CellStyle.HEADER),
            txt("Дата отбора образцов", CellStyle.HEADER),
            txt("Наименование и номер выработки", CellStyle.HEADER),
            txt("Глубина отбора образца, м", CellStyle.HEADER),
            empty(CellStyle.HEADER),
            txt("Вид образца (монолит, нарушеной структуры)", CellStyle.HEADER),
            txt("талый/мерзлый", CellStyle.HEADER),
            txt("Наименование грунта", CellStyle.HEADER)
        )
        merge("E7:F7")
        // Данные
        rows.forEach { r ->
            row(
                num(r.n, CellStyle.BODY_CENTER),
                txt(r.geo, CellStyle.BODY_CENTER),
                txt(r.date, CellStyle.BODY_CENTER),
                txt(r.borehole, CellStyle.BODY_CENTER),
                txt(r.depth, CellStyle.BODY_CENTER),
                empty(CellStyle.BODY_CENTER),
                txt(r.collType, CellStyle.BODY_CENTER),
                txt(r.frozen, CellStyle.BODY_CENTER),
                txt(r.soil, CellStyle.BODY_LEFT)
            )
        }
        // Ширины
        colWidth(1, 6.0); colWidth(2, 14.0); colWidth(3, 14.0); colWidth(4, 22.0)
        colWidth(5, 12.0); colWidth(6, 6.0); colWidth(7, 22.0); colWidth(8, 14.0); colWidth(9, 30.0)
    }

    val sitePart = safeName(siteName)
    val geoPart = safeName(geologistName)
    val fileName = "Образцы_${sitePart}_${geoPart}_${today}.xlsx"
    val outFile = File(context.getExternalFilesDir(null), "exports").also { it.mkdirs() }.let { File(it, fileName) }
    FileOutputStream(outFile).use { xlsx.writeTo(it) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
    VedomostResult(uri, fileName, rows.size)
}

// ─────────────────────────────────────────────────────────────
// Ведомость объёмов
// ─────────────────────────────────────────────────────────────
suspend fun exportVolumesVedomost(
    context: Context,
    fromDate: String,
    toDate: String,
    siteId: String?,
    siteName: String?,
    geologistName: String?
): VedomostResult = withContext(Dispatchers.IO) {
    val db = AppDatabase.get(context)
    val cards = gatherCards(db, fromDate, toDate, siteId)
    val today = java.time.LocalDate.now().toString()

    // Бригада
    val brigade = db.brigades().current()
    val transport = brigade?.transportId?.let { db.transport().byId(it) }
    val members = brigade?.let {
        val ids = db.brigades().members(it.id).map { m -> m.workerId }
        db.workers().byIds(ids).joinToString(", ") { w -> w.name }
    } ?: ""
    val transportLabel = transport?.let {
        val plate = if (it.plate.isNotBlank()) " ${it.plate}" else ""
        "${it.name}$plate"
    } ?: "—"

    val xlsx = XlsxBuilder()
    xlsx.sheet("Объемы") {
        row(txt("Борт:", CellStyle.HEADER), txt(transportLabel, CellStyle.BODY_LEFT))
        merge("B1:H1")
        row(txt("Бригада:", CellStyle.HEADER), txt(members.ifBlank { "—" }, CellStyle.BODY_LEFT))
        merge("B2:H2")
        // Шапка таблицы (3-4 строки: некоторые ячейки с merged)
        row(
            txt("п/п", CellStyle.HEADER),
            txt("Имя скважины", CellStyle.HEADER),
            txt("Дата бурения", CellStyle.HEADER),
            txt("Координаты", CellStyle.HEADER),
            empty(CellStyle.HEADER),
            txt("Общая глубина, м", CellStyle.HEADER),
            txt("Обсад, м", CellStyle.HEADER),
            txt("Описание из шапки", CellStyle.HEADER)
        )
        row(
            empty(CellStyle.HEADER), empty(CellStyle.HEADER), empty(CellStyle.HEADER),
            txt("Широта", CellStyle.HEADER), txt("Долгота", CellStyle.HEADER),
            empty(CellStyle.HEADER), empty(CellStyle.HEADER), empty(CellStyle.HEADER)
        )
        merge("A3:A4"); merge("B3:B4"); merge("C3:C4")
        merge("D3:E3")
        merge("F3:F4"); merge("G3:G4"); merge("H3:H4")

        // Объект
        row(txt("Объект: ${siteName ?: "—"}", CellStyle.HEADER))
        merge("A5:H5")

        // Данные
        var seq = 0
        val firstDataRow = 6  // 1-based row number of first data row
        cards.forEach { (bh, _, _) ->
            seq++
            row(
                num(seq, CellStyle.BODY_CENTER),
                txt(bh.name, CellStyle.BODY_CENTER),
                txt(bh.drillDate, CellStyle.BODY_CENTER),
                num(bh.manualLat, CellStyle.BODY_CENTER),
                num(bh.manualLng, CellStyle.BODY_CENTER),
                num(bh.plannedDepthM.takeIf { it > 0 }, CellStyle.BODY_CENTER),
                num(bh.casingLengthM.takeIf { it > 0 }, CellStyle.BODY_CENTER),
                txt(bh.description, CellStyle.BODY_LEFT)
            )
        }
        // ИТОГО
        if (seq > 0) {
            val lastDataRow = firstDataRow + seq - 1
            row(
                txt("ИТОГО:", CellStyle.HEADER),
                empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                formula("SUM(F$firstDataRow:F$lastDataRow)", CellStyle.HEADER),
                formula("SUM(G$firstDataRow:G$lastDataRow)", CellStyle.HEADER),
                empty(CellStyle.BODY_CENTER)
            )
        }

        colWidth(1, 6.0); colWidth(2, 16.0); colWidth(3, 14.0); colWidth(4, 13.0); colWidth(5, 13.0)
        colWidth(6, 12.0); colWidth(7, 11.0); colWidth(8, 30.0)
    }

    val sitePart = safeName(siteName)
    val geoPart = safeName(geologistName)
    val fileName = "Объёмы_${sitePart}_${geoPart}_${today}.xlsx"
    val outFile = File(context.getExternalFilesDir(null), "exports").also { it.mkdirs() }.let { File(it, fileName) }
    FileOutputStream(outFile).use { xlsx.writeTo(it) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
    VedomostResult(uri, fileName, cards.size)
}

fun buildXlsxShareIntent(uri: Uri, fileName: String): android.content.Intent =
    android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        putExtra(android.content.Intent.EXTRA_STREAM, uri)
        putExtra(android.content.Intent.EXTRA_SUBJECT, fileName)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
