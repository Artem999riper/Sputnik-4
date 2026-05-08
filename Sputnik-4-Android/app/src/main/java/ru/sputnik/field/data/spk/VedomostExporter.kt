package ru.sputnik.field.data.spk

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Borehole
import ru.sputnik.field.data.model.SoilLayer
import ru.sputnik.field.data.model.Sample
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

/** Форматирует пару координат под выбранный формат. Возвращает 2 ячейки. */
private fun formatCoordCells(lat: Double?, lng: Double?, fmt: String, zone: Int?):
        Pair<Pair<CellValue, CellStyle>, Pair<CellValue, CellStyle>> {
    if (lat == null || lng == null) {
        return empty(CellStyle.BODY_CENTER) to empty(CellStyle.BODY_CENTER)
    }
    return when {
        zone != null -> {
            val mck = CoordTransform.wgs84ToMsk86(lat, lng, zone)
            num(mck.north, CellStyle.BODY_CENTER) to num(mck.east, CellStyle.BODY_CENTER)
        }
        fmt == "WGS-84 DMS" -> {
            txt(CoordTransform.toDmsLat(lat), CellStyle.BODY_CENTER) to
                txt(CoordTransform.toDmsLng(lng), CellStyle.BODY_CENTER)
        }
        else -> num(lat, CellStyle.BODY_CENTER) to num(lng, CellStyle.BODY_CENTER)
    }
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
        val dataStart = nextRowNum
        rows.forEachIndexed { idx, r ->
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
            merge("E${dataStart + idx}:F${dataStart + idx}")
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
// Вспомогательные типы для снимка бригады
// ─────────────────────────────────────────────────────────────
private data class SnapshotData(
    val memberNames: List<String>,
    val transportLabel: String,
    val memberIds: List<String> = emptyList(),
    val transportId: String? = null
)

private fun parseSnapshot(json: String): SnapshotData {
    if (json.isBlank()) return SnapshotData(emptyList(), "")
    return try {
        val obj = org.json.JSONObject(json)
        val namesArr = obj.optJSONArray("memberNames")
        val names = if (namesArr != null) (0 until namesArr.length()).map { namesArr.getString(it) } else emptyList()
        val idsArr = obj.optJSONArray("memberIds")
        val ids = if (idsArr != null) (0 until idsArr.length()).map { idsArr.getString(it) } else emptyList()
        val tid = if (obj.isNull("transportId")) null else obj.optString("transportId", "").ifBlank { null }
        SnapshotData(names, obj.optString("transportLabel", ""), ids, tid)
    } catch (e: Exception) {
        SnapshotData(emptyList(), "")
    }
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
    geologistName: String?,
    coordFormat: String = "WGS-84 DMS"
): VedomostResult = withContext(Dispatchers.IO) {
    val db = AppDatabase.get(context)
    val cards = gatherCards(db, fromDate, toDate, siteId)
    val today = java.time.LocalDate.now().toString()

    // Разбиваем скважины на группы по снимку бригады, сохраняя порядок по дате внутри группы
    val sortedCards = cards.sortedWith(compareBy({ it.first.brigadeSnapshot }, { it.first.drillDate }))
    val groups = mutableListOf<Pair<SnapshotData, List<Triple<Borehole, List<SoilLayer>, List<Sample>>>>>()
    var lastSnapshot: String? = null
    var currentGroup = mutableListOf<Triple<Borehole, List<SoilLayer>, List<Sample>>>()
    for (card in sortedCards) {
        val snap = card.first.brigadeSnapshot
        if (snap != lastSnapshot) {
            if (currentGroup.isNotEmpty()) {
                groups.add(parseSnapshot(lastSnapshot ?: "") to currentGroup)
                currentGroup = mutableListOf()
            }
            lastSnapshot = snap
        }
        currentGroup.add(card)
    }
    if (currentGroup.isNotEmpty()) groups.add(parseSnapshot(lastSnapshot ?: "") to currentGroup)

    // Считаем суммарные объёмы по людям
    val personDepths = mutableMapOf<String, Double>()
    for ((snap, groupCards) in groups) {
        val totalDepth = groupCards.sumOf { it.first.plannedDepthM }
        snap.memberNames.forEach { name ->
            personDepths[name] = (personDepths[name] ?: 0.0) + totalDepth
        }
    }

    val zone = when (coordFormat) {
        "МСК-86 зона 3" -> 3
        "МСК-86 зона 4" -> 4
        else -> null
    }
    val coordsTitle = when (coordFormat) {
        "МСК-86 зона 3" -> "Координаты МСК-86 (зона 3), м"
        "МСК-86 зона 4" -> "Координаты МСК-86 (зона 4), м"
        else -> "Координаты WGS-84"
    }
    val coordsSubA = if (zone != null) "X (Север)" else "Широта"
    val coordsSubB = if (zone != null) "Y (Восток)" else "Долгота"

    val xlsx = XlsxBuilder()
    xlsx.sheet("Объемы") {
        // Шапка колонок (один раз)
        row(
            txt("п/п", CellStyle.HEADER),
            txt("Имя скважины", CellStyle.HEADER),
            txt("Дата бурения", CellStyle.HEADER),
            txt(coordsTitle, CellStyle.HEADER),
            empty(CellStyle.HEADER),
            txt("Общая глубина, м", CellStyle.HEADER),
            txt("Обсад, м", CellStyle.HEADER),
            txt("Описание из шапки", CellStyle.HEADER)
        )
        row(
            empty(CellStyle.HEADER), empty(CellStyle.HEADER), empty(CellStyle.HEADER),
            txt(coordsSubA, CellStyle.HEADER), txt(coordsSubB, CellStyle.HEADER),
            empty(CellStyle.HEADER), empty(CellStyle.HEADER), empty(CellStyle.HEADER)
        )
        merge("A1:A2"); merge("B1:B2"); merge("C1:C2")
        merge("D1:E1")
        merge("F1:F2"); merge("G1:G2"); merge("H1:H2")

        row(txt("Объект: ${siteName ?: "—"}", CellStyle.HEADER))
        merge("A3:H3")

        val firstDepthCol = 6  // колонка F (1-based)
        val depthRanges = mutableListOf<String>()   // для суммы ИТОГО по глубине
        val casingRanges = mutableListOf<String>()  // для суммы ИТОГО по обсаду
        var seq = 0

        for ((snapData, groupCards) in groups) {
            // Строка с составом бригады
            val brigadeLabel = buildString {
                if (snapData.transportLabel.isNotBlank()) append("Борт: ${snapData.transportLabel}  ")
                append("Бригада: ${snapData.memberNames.joinToString(", ").ifBlank { "—" }}")
            }
            val brigRow = nextRowNum
            row(txt(brigadeLabel, CellStyle.TITLE))
            merge("A$brigRow:H$brigRow")

            val groupFirstRow = nextRowNum
            for (card in groupCards) {
                val bh = card.first
                seq++
                val (cellLat, cellLng) = formatCoordCells(bh.manualLat, bh.manualLng, coordFormat, zone)
                row(
                    num(seq, CellStyle.BODY_CENTER),
                    txt(bh.name, CellStyle.BODY_CENTER),
                    txt(bh.drillDate, CellStyle.BODY_CENTER),
                    cellLat,
                    cellLng,
                    num(bh.plannedDepthM.takeIf { it > 0 }, CellStyle.BODY_CENTER),
                    num(bh.casingLengthM.takeIf { it > 0 }, CellStyle.BODY_CENTER),
                    txt(bh.description, CellStyle.BODY_LEFT)
                )
            }
            val groupLastRow = nextRowNum - 1
            if (groupCards.isNotEmpty()) {
                depthRanges.add("F$groupFirstRow:F$groupLastRow")
                casingRanges.add("G$groupFirstRow:G$groupLastRow")
            }
        }

        // Строка ИТОГО
        if (seq > 0) {
            val totalFormula = depthRanges.joinToString("+") { "SUM($it)" }
            val casingFormula = casingRanges.joinToString("+") { "SUM($it)" }
            row(
                txt("ИТОГО:", CellStyle.HEADER),
                empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                formula(totalFormula, CellStyle.HEADER),
                formula(casingFormula, CellStyle.HEADER),
                empty(CellStyle.BODY_CENTER)
            )
        }

        // Суммарный объём по каждому человеку
        if (personDepths.isNotEmpty()) {
            row() // пустая строка перед итогами по людям
            personDepths.forEach { (name, depth) ->
                row(
                    txt(name, CellStyle.BODY_LEFT),
                    empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                    empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER),
                    txt(fmtNum(depth) + " м", CellStyle.BODY_CENTER),
                    empty(CellStyle.BODY_CENTER), empty(CellStyle.BODY_CENTER)
                )
            }
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
