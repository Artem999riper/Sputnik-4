package ru.sputnik.field.data.summary

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Borehole
import ru.sputnik.field.data.model.SoilLayer
import ru.sputnik.field.data.model.TaskPoint
import ru.sputnik.field.data.model.Volume
import ru.sputnik.field.data.model.VolumeKind

private data class SnapInfo(val transportLabel: String, val memberNames: List<String>) {
    val key: String get() = "$transportLabel|${memberNames.joinToString("|")}"
}

private fun parseSnap(json: String): SnapInfo {
    if (json.isBlank()) return SnapInfo("", emptyList())
    return try {
        val obj = JSONObject(json)
        val arr = obj.optJSONArray("memberNames")
        val names = if (arr != null) (0 until arr.length()).map { arr.getString(it) } else emptyList()
        SnapInfo(obj.optString("transportLabel", ""), names)
    } catch (e: Exception) {
        SnapInfo("", emptyList())
    }
}

private data class DrillEntry(val name: String, val depthM: Double, val layerHints: String)
private data class TaskEntry(val name: String, val notes: String)

private class BrigadeBucket(val snap: SnapInfo) {
    val boreholes = mutableListOf<DrillEntry>()
    val thermometry = mutableListOf<TaskEntry>()
    val probe = mutableListOf<TaskEntry>()
}

private fun fmtNum(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString()
    else "%.1f".format(v).replace('.', ',')

private fun formatLayerHints(layers: List<SoilLayer>): String {
    val out = mutableListOf<String>()
    layers.forEach { l ->
        val isIce = l.soilType.contains("лед", ignoreCase = true) || l.soilType.contains("лёд", ignoreCase = true)
        val isThaw = l.frozenState.equals("Талый", ignoreCase = true) || l.frozenState.equals("талый", ignoreCase = true)
        if (isIce || isThaw) {
            val top = l.depthTopM.takeIf { it > 0 } ?: 0.0
            val bot = l.depthBottomM.takeIf { it > 0 } ?: l.depthM
            if (bot > 0) {
                val tag = if (isIce) "лёд" else "талый грунт"
                out += "${fmtNum(top)}-${fmtNum(bot)} $tag"
            }
        }
    }
    return out.joinToString(", ")
}

suspend fun generateSummary(
    db: AppDatabase,
    siteId: String?,
    fromDate: String,
    toDate: String
): String = withContext(Dispatchers.IO) {
    val volumes: List<Volume> =
        if (siteId != null) db.volumes().bySiteOnce(siteId)
        else db.volumes().all()

    val sb = StringBuilder()
    sb.appendLine("Выполнение за $toDate")
    sb.appendLine()

    // ── По бригадам за toDate ────────────────────────────────
    val buckets = linkedMapOf<String, BrigadeBucket>()

    volumes.filter { it.kind == VolumeKind.DRILLING }.forEach { vol ->
        val drilledToday = db.boreholes().completedOn(vol.id, toDate)
        drilledToday.forEach { bh ->
            val info = parseSnap(bh.brigadeSnapshot)
            val bucket = buckets.getOrPut(info.key) { BrigadeBucket(info) }
            val layers = db.soilLayers().byBoreholeOnce(bh.uuid)
            bucket.boreholes += DrillEntry(
                name = bh.name.ifEmpty { "Скв-${bh.uuid.take(6)}" },
                depthM = bh.plannedDepthM,
                layerHints = formatLayerHints(layers)
            )
        }
    }

    volumes.filter { it.kind != VolumeKind.DRILLING }.forEach { vol ->
        val tps = db.taskPoints().completedOn(vol.id, toDate)
        tps.forEach { tp ->
            val info = parseSnap(tp.brigadeSnapshot)
            val bucket = buckets.getOrPut(info.key) { BrigadeBucket(info) }
            val entry = TaskEntry(tp.name.ifEmpty { tp.uuid.take(6) }, tp.notes)
            when (vol.kind) {
                VolumeKind.THERMOMETRY -> bucket.thermometry += entry
                VolumeKind.STATIC_PROBE -> bucket.probe += entry
            }
        }
    }

    if (buckets.isEmpty()) {
        sb.appendLine("Нет выполненных работ за $toDate.")
        sb.appendLine()
    } else {
        buckets.values.forEachIndexed { idx, b ->
            if (idx > 0) sb.appendLine("─".repeat(30))
            val bortPart = b.snap.transportLabel.takeIf { it.isNotBlank() }?.let { "Борт $it " } ?: ""
            val membersPart = b.snap.memberNames.joinToString(", ").ifBlank { "—" }
            sb.appendLine("$bortPart$membersPart выполнили:")
            b.boreholes.forEach { bs ->
                val hints = if (bs.layerHints.isNotBlank()) " ( ${bs.layerHints} )" else ""
                sb.appendLine("Скв: ${bs.name}$hints")
            }
            if (b.boreholes.isNotEmpty()) {
                val sumDepth = b.boreholes.sumOf { it.depthM }
                sb.appendLine("Итого - ${b.boreholes.size} скв - ${fmtNum(sumDepth)} п.м")
            }
            if (b.thermometry.isNotEmpty()) {
                sb.appendLine("Термометрия ${b.thermometry.size} скв: " +
                    b.thermometry.joinToString(", ") { tp ->
                        if (tp.notes.isNotBlank()) "${tp.name} (${tp.notes})" else tp.name
                    })
            }
            if (b.probe.isNotEmpty()) {
                sb.appendLine("Зондирование ${b.probe.size} точек: " +
                    b.probe.joinToString(", ") { tp ->
                        if (tp.notes.isNotBlank()) "${tp.name} (${tp.notes})" else tp.name
                    })
            }
            sb.appendLine()
        }
    }

    // ── Пройдено за день ────────────────────────────────────
    val dayDrillCount = buckets.values.sumOf { it.boreholes.size }
    val dayDrillDepth = buckets.values.sumOf { b -> b.boreholes.sumOf { it.depthM } }
    val dayThermoCount = buckets.values.sumOf { it.thermometry.size }
    val dayProbeCount = buckets.values.sumOf { it.probe.size }
    if (dayDrillCount + dayThermoCount + dayProbeCount > 0) {
        sb.appendLine("Пройдено за день:")
        if (dayThermoCount > 0) sb.appendLine("$dayThermoCount скв термометрия")
        if (dayProbeCount > 0) sb.appendLine("$dayProbeCount точек зондирования")
        if (dayDrillCount > 0) sb.appendLine("$dayDrillCount скв бурения - ${fmtNum(dayDrillDepth)} п.м.")
        sb.appendLine()
    }

    // ── Всего пройдено за период ─────────────────────────────
    val periodDrill: List<Borehole> = volumes.filter { it.kind == VolumeKind.DRILLING }
        .flatMap { db.boreholes().completedInRange(it.id, fromDate, toDate) }
    val periodTaskByKind: Map<String, List<TaskPoint>> = volumes
        .filter { it.kind != VolumeKind.DRILLING }
        .groupBy { it.kind }
        .mapValues { (_, vs) -> vs.flatMap { db.taskPoints().completedInRange(it.id, fromDate, toDate) } }

    sb.appendLine("Всего пройдено за период $fromDate — $toDate:")
    periodTaskByKind[VolumeKind.THERMOMETRY]?.size?.takeIf { it > 0 }?.let { sb.appendLine("$it скв термометрия") }
    periodTaskByKind[VolumeKind.STATIC_PROBE]?.size?.takeIf { it > 0 }?.let { sb.appendLine("$it точек зондирования") }
    if (periodDrill.isNotEmpty()) {
        val depth = periodDrill.sumOf { it.plannedDepthM }
        sb.appendLine("${periodDrill.size} скв бурения - ${fmtNum(depth)} п.м")
    }
    sb.appendLine()

    // ── Общий объём (план) ───────────────────────────────────
    val totalsByKind = volumes.groupBy { it.kind }
        .mapValues { (_, vs) -> vs.sumOf { it.totalVolume } }
    if (totalsByKind.values.any { it > 0 }) {
        sb.appendLine("Общий объём выданный в работу:")
        totalsByKind[VolumeKind.STATIC_PROBE]?.takeIf { it > 0 }?.let {
            sb.appendLine("${fmtNum(it)} точек статического зондирования")
        }
        totalsByKind[VolumeKind.THERMOMETRY]?.takeIf { it > 0 }?.let {
            sb.appendLine("${fmtNum(it)} скв термометрия")
        }
        totalsByKind[VolumeKind.DRILLING]?.takeIf { it > 0 }?.let {
            sb.appendLine("${fmtNum(it)} п.м бурения (план)")
        }
        sb.appendLine()
    }

    // ── Остаток ──────────────────────────────────────────────
    val allDoneDrill = volumes.filter { it.kind == VolumeKind.DRILLING }
        .flatMap { db.boreholes().allCompleted(it.id) }
    val allDoneTaskByKind = volumes.filter { it.kind != VolumeKind.DRILLING }
        .groupBy { it.kind }
        .mapValues { (_, vs) -> vs.flatMap { db.taskPoints().allCompleted(it.id) } }

    val probeRemain = (totalsByKind[VolumeKind.STATIC_PROBE] ?: 0.0) -
        (allDoneTaskByKind[VolumeKind.STATIC_PROBE]?.size ?: 0)
    val thermoRemain = (totalsByKind[VolumeKind.THERMOMETRY] ?: 0.0) -
        (allDoneTaskByKind[VolumeKind.THERMOMETRY]?.size ?: 0)
    val drillRemain = (totalsByKind[VolumeKind.DRILLING] ?: 0.0) -
        allDoneDrill.sumOf { it.plannedDepthM }

    if (probeRemain > 0 || thermoRemain > 0 || drillRemain > 0) {
        sb.appendLine("Остаток:")
        if (probeRemain > 0) sb.appendLine("${fmtNum(probeRemain)} точек статического зондирования")
        if (thermoRemain > 0) sb.appendLine("${fmtNum(thermoRemain)} скв термометрия")
        if (drillRemain > 0) sb.appendLine("${fmtNum(drillRemain)} п.м бурения")
    }

    sb.toString().trimEnd()
}
