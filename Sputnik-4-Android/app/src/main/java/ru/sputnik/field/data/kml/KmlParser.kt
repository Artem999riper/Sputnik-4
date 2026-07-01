package ru.sputnik.field.data.kml

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.w3c.dom.Element
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Borehole
import ru.sputnik.field.data.model.TaskPoint
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory

data class KmlImportResult(val added: Int, val skipped: Int)
data class KmlPlacemark(val name: String, val lat: Double, val lng: Double)

private suspend fun parseKmlPlacemarks(context: Context, uri: Uri): List<KmlPlacemark> =
    withContext(Dispatchers.IO) {
        val stream = context.contentResolver.openInputStream(uri)
            ?: error("Не удалось открыть файл")
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(stream)
        doc.documentElement.normalize()
        val placemarks = doc.getElementsByTagName("Placemark")
        val out = mutableListOf<KmlPlacemark>()
        (0 until placemarks.length).forEach { i ->
            val pm = placemarks.item(i) as? Element ?: return@forEach
            val name = pm.getElementsByTagName("name").item(0)?.textContent?.trim().orEmpty()
            val coordNode = pm.getElementsByTagName("coordinates").item(0) ?: return@forEach
            val raw = coordNode.textContent.trim().split(Regex("\\s+")).firstOrNull() ?: return@forEach
            val parts = raw.split(",")
            if (parts.size < 2) return@forEach
            val lng = parts[0].toDoubleOrNull() ?: return@forEach
            val lat = parts[1].toDoubleOrNull() ?: return@forEach
            out += KmlPlacemark(name, lat, lng)
        }
        out
    }

/** Импорт KML в скважины (для Volume kind=DRILLING). */
suspend fun importKmlAsBoreholes(
    context: Context, uri: Uri, siteId: String, volumeId: String
): KmlImportResult = withContext(Dispatchers.IO) {
    val placemarks = parseKmlPlacemarks(context, uri)
    val db = AppDatabase.get(context)
    val existing = db.boreholes().bySiteOnce(siteId)
    var added = 0; var skipped = 0
    val today = java.time.LocalDate.now().toString()
    placemarks.forEach { pm ->
        val dup = existing.any { it.name == pm.name && it.manualLat == pm.lat && it.manualLng == pm.lng }
        if (dup) { skipped++; return@forEach }
        db.boreholes().upsert(Borehole(
            uuid = UUID.randomUUID().toString(),
            siteId = siteId,
            volumeId = volumeId,
            name = pm.name,
            manualLat = pm.lat,
            manualLng = pm.lng,
            drillDate = today,
            status = "draft"
        ))
        added++
    }
    KmlImportResult(added, skipped)
}

/** Импорт KML в точки задачи (для Volume kind=THERMOMETRY|STATIC_PROBE). */
suspend fun importKmlAsTaskPoints(
    context: Context, uri: Uri, siteId: String, volumeId: String
): KmlImportResult = withContext(Dispatchers.IO) {
    val placemarks = parseKmlPlacemarks(context, uri)
    val db = AppDatabase.get(context)
    val existing = db.taskPoints().byVolumeOnce(volumeId)
    var added = 0; var skipped = 0
    placemarks.forEach { pm ->
        val dup = existing.any { it.name == pm.name && it.lat == pm.lat && it.lng == pm.lng }
        if (dup) { skipped++; return@forEach }
        db.taskPoints().upsert(TaskPoint(
            uuid = UUID.randomUUID().toString(),
            volumeId = volumeId,
            siteId = siteId,
            name = pm.name,
            lat = pm.lat,
            lng = pm.lng
        ))
        added++
    }
    KmlImportResult(added, skipped)
}
