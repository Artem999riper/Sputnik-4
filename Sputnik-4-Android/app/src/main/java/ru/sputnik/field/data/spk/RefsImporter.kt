package ru.sputnik.field.data.spk

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*

@Serializable
private data class RefsJson(
    val version: Int = 1,
    val workers: List<WorkerJson> = emptyList(),
    val transport: List<TransportJson> = emptyList(),
    val sites: List<SiteJson> = emptyList(),
    val kml_points: List<KmlPointJson> = emptyList()
)

@Serializable
private data class WorkerJson(val id: String, val name: String, val role: String = "", val phone: String = "")
@Serializable
private data class TransportJson(val id: String, val type: String = "", val name: String, val plate: String = "")
@Serializable
private data class SiteJson(val id: String, val name: String, val lat: Double? = null, val lng: Double? = null)
@Serializable
private data class KmlPointJson(val id: String, val site_id: String, val name: String, val lat: Double, val lng: Double)

private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

data class ImportResult(val workers: Int, val transport: Int, val sites: Int, val kmlPoints: Int)

suspend fun importRefs(context: Context, uri: Uri): ImportResult = withContext(Dispatchers.IO) {
    val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
        ?: error("Не удалось прочитать файл")
    val refs = json.decodeFromString<RefsJson>(text)
    val db = AppDatabase.get(context)

    db.workers().clear()
    db.workers().insertAll(refs.workers.map { Worker(it.id, it.name, it.role, it.phone) })

    db.transport().clear()
    db.transport().insertAll(refs.transport.map { Transport(it.id, it.type, it.name, it.plate) })

    db.sites().clear()
    db.sites().insertAll(refs.sites.map { Site(it.id, it.name, it.lat, it.lng) })

    db.kmlPoints().clear()
    db.kmlPoints().insertAll(refs.kml_points.map {
        KmlPoint(it.id, it.site_id, it.name, it.lat, it.lng)
    })

    ImportResult(refs.workers.size, refs.transport.size, refs.sites.size, refs.kml_points.size)
}
