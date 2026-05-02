package ru.sputnik.field.data.kml

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.w3c.dom.Element
import org.w3c.dom.NodeList
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Borehole
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory

data class KmlImportResult(val added: Int, val skipped: Int)

suspend fun importKmlForSite(context: Context, uri: Uri, siteId: String): KmlImportResult =
    withContext(Dispatchers.IO) {
        val stream = context.contentResolver.openInputStream(uri)
            ?: error("Не удалось открыть файл")
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(stream)
        doc.documentElement.normalize()

        val placemarks = doc.getElementsByTagName("Placemark")
        val db = AppDatabase.get(context)
        var added = 0; var skipped = 0

        (0 until placemarks.length).forEach { i ->
            val pm = placemarks.item(i) as? Element ?: return@forEach
            val name = pm.getElementsByTagName("name").item(0)?.textContent?.trim() ?: ""

            // Ищем координаты — Point/coordinates
            val coordNode = pm.getElementsByTagName("coordinates").item(0)
                ?: return@forEach
            val raw = coordNode.textContent.trim().split(Regex("\\s+")).firstOrNull()
                ?: return@forEach
            val parts = raw.split(",")
            if (parts.size < 2) { skipped++; return@forEach }
            val lng = parts[0].toDoubleOrNull() ?: run { skipped++; return@forEach }
            val lat = parts[1].toDoubleOrNull() ?: run { skipped++; return@forEach }

            // Проверяем дубликат по имени + объекту
            val exists = db.boreholes().bySiteOnce(siteId)
                .any { it.name == name && it.manualLat == lat && it.manualLng == lng }
            if (exists) { skipped++; return@forEach }

            db.boreholes().upsert(Borehole(
                uuid = UUID.randomUUID().toString(),
                siteId = siteId,
                name = name,
                manualLat = lat,
                manualLng = lng,
                drillDate = java.time.LocalDate.now().toString(),
                status = "draft"
            ))
            added++
        }
        KmlImportResult(added, skipped)
    }

// Рекурсивно ищет элементы по тегу (для вложенных структур KML)
private fun NodeList.asSequence() = sequence {
    for (i in 0 until length) yield(item(i))
}
