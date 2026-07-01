package ru.sputnik.field.data.spk

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*
import java.io.File
import java.io.FileOutputStream
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private val json = Json { encodeDefaults = true; prettyPrint = false }

data class ExportResult(val uri: Uri, val fileName: String, val boreholes: Int, val photos: Int)

suspend fun exportSpk(
    context: Context,
    fromDate: String,
    toDate: String,
    siteId: String? = null,
    siteName: String? = null,
    geologistName: String? = null,
): ExportResult =
    withContext(Dispatchers.IO) {
        val db = AppDatabase.get(context)
        val resolver = context.contentResolver

        val boreholes = if (siteId != null)
            db.boreholes().forExportBySite(siteId, fromDate, toDate)
        else
            db.boreholes().forExportAll(fromDate, toDate)

        val cards = boreholes.map { bh ->
            val layers = db.soilLayers().byBoreholeOnce(bh.uuid)
            val samples = db.samples().byLayers(layers.map { it.uuid })
            val ugv = db.ugv().byBoreholeOnce(bh.uuid)
            val mmg = db.mmg().byBoreholeOnce(bh.uuid)
            val photos = db.photos().byBoreholeOnce(bh.uuid)
            BoreholeCard(bh, layers, samples, ugv, mmg, photos)
        }

        // Бригада: текущая активная (current) — она использовалась для всех скважин
        val brigade = db.brigades().current()
        val brigadeMembers = brigade?.let { db.brigades().members(it.id).map { m -> m.workerId } } ?: emptyList()
        val brigadeJson = brigade?.let { BrigadeJson(it.transportId, brigadeMembers) }

        val exportDir = File(context.getExternalFilesDir(null), "exports").also { it.mkdirs() }
        val safe: (String) -> String = { it.replace(Regex("[^\\p{L}\\p{N}_.-]"), "_") }
        val sitePart = siteName?.takeIf { it.isNotBlank() }?.let(safe) ?: "all"
        val geoPart = geologistName?.takeIf { it.isNotBlank() }?.let(safe) ?: "Геолог"
        val today = java.time.LocalDate.now().toString()
        val fileName = "${sitePart}_${geoPart}_${today}.spk"
        val outFile = File(exportDir, fileName)

        ZipOutputStream(FileOutputStream(outFile).buffered()).use { zos ->
            zos.setLevel(Deflater.BEST_COMPRESSION)
            zos.putEntry("boreholes.json", json.encodeToString(boreholes.map { it.toJson() }))
            val allLayers = cards.flatMap { it.layers }
            zos.putEntry("soil_layers.json", json.encodeToString(allLayers.map { it.toJson() }))
            val allSamples = cards.flatMap { it.samples }
            zos.putEntry("samples.json", json.encodeToString(allSamples.map { it.toJson() }))
            val allUgv = cards.flatMap { it.ugv }
            zos.putEntry("ugv.json", json.encodeToString(allUgv.map { it.toJson() }))
            val allMmg = cards.flatMap { it.mmg }
            zos.putEntry("mmg.json", json.encodeToString(allMmg.map { it.toJson() }))

            // photos/ — фото читаются через ContentResolver (URI хранится в Photo.filePath
            // как content://media/external/images/media/<id>, см. PhotosTab.launchCamera).
            val allPhotos = cards.flatMap { it.photos }
            var photosCopied = 0
            allPhotos.forEach { photo ->
                try {
                    val photoUri = Uri.parse(photo.filePath)
                    val ext = "jpg"  // фото всегда сохраняются как JPEG в DCIM/Sputnik
                    val entryName = "photos/${photo.boreholeUuid}_${photo.category}_${photo.uuid.take(8)}.$ext"
                    resolver.openInputStream(photoUri)?.use { input ->
                        zos.putNextEntry(ZipEntry(entryName))
                        input.copyTo(zos)
                        zos.closeEntry()
                        photosCopied++
                    }
                } catch (e: Exception) {
                    // Пропускаем удалённые / недоступные снимки
                    android.util.Log.w("SpkExporter", "Skip photo ${photo.uuid}: ${e.message}")
                }
            }

            // manifest.json (last — counts known)
            val manifest = ManifestJson(
                format_version = 1,
                app_version = "1.0.0",
                exported_at = java.time.Instant.now().toString(),
                period = PeriodJson(fromDate, toDate),
                counts = CountsJson(boreholes.size, photosCopied),
                brigade = brigadeJson,
                geologist_name = geologistName?.takeIf { it.isNotBlank() }
            )
            zos.putEntry("manifest.json", json.encodeToString(manifest))
        }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
        ExportResult(uri, fileName, boreholes.size, cards.sumOf { it.photos.size })
    }

fun saveSpkToDownloads(context: android.content.Context, srcFile: File, fileName: String): Boolean {
    return try {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/octet-stream")
                put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
            }
            val col = android.provider.MediaStore.Downloads
                .getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val uri = context.contentResolver.insert(col, values) ?: return false
            context.contentResolver.openOutputStream(uri)?.use { out ->
                srcFile.inputStream().use { it.copyTo(out) }
            }
            values.clear()
            values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            context.contentResolver.update(uri, values, null, null)
            true
        } else {
            val dest = File(
                android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                fileName
            )
            srcFile.copyTo(dest, overwrite = true)
            true
        }
    } catch (e: Exception) {
        android.util.Log.e("SpkExporter", "saveSpkToDownloads failed: ${e.message}")
        false
    }
}

fun buildShareIntent(uri: Uri, fileName: String): Intent = Intent(Intent.ACTION_SEND).apply {
    type = "application/octet-stream"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_SUBJECT, fileName)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}

// ── Helpers ──────────────────────────────────────────────────

private fun ZipOutputStream.putEntry(name: String, content: String) {
    putNextEntry(ZipEntry(name))
    write(content.toByteArray(Charsets.UTF_8))
    closeEntry()
}

@kotlinx.serialization.Serializable
private data class ManifestJson(
    val format_version: Int,
    val app_version: String,
    val exported_at: String,
    val period: PeriodJson,
    val counts: CountsJson,
    val brigade: BrigadeJson? = null,
    val geologist_name: String? = null
)

@kotlinx.serialization.Serializable
private data class PeriodJson(val from: String, val to: String)

@kotlinx.serialization.Serializable
private data class CountsJson(val boreholes: Int, val photos: Int)

@kotlinx.serialization.Serializable
private data class BrigadeJson(val transport_id: String?, val members: List<String>)

// ── Entity → JSON serialisable maps ─────────────────────────

@kotlinx.serialization.Serializable
private data class BhJson(
    val uuid: String, val site_id: String, val kml_point_id: String?,
    val lat: Double?, val lng: Double?, val name: String,
    val planned_depth_m: Double, val diameter_mm: Double,
    val work_type: String, val geomorph_desc: String,
    val description: String, val drill_date: String,
    val status: String, val brigade_id: String?,
    val casing_length_m: Double = 0.0,
    val brigade_snapshot: String? = null
)

private fun Borehole.toJson() = BhJson(
    uuid, siteId, kmlPointId, manualLat, manualLng, name,
    plannedDepthM, diameterMm, workType, geomorphDesc,
    description, drillDate, status, brigadeId, casingLengthM,
    brigadeSnapshot.takeIf { it.isNotBlank() }
)

@kotlinx.serialization.Serializable
private data class LayerJson(
    val uuid: String, val borehole_uuid: String, val order_idx: Int,
    val soil_type: String, val state: String, val description: String, val depth_m: Double,
    val frozen_state: String = ""
)

private fun SoilLayer.toJson() = LayerJson(uuid, boreholeUuid, orderIdx, soilType, state, description, depthM, frozenState)

@kotlinx.serialization.Serializable
private data class SampleJson(
    val uuid: String, val layer_uuid: String,
    val collection_type: String, val packaging: String, val depth_m: Double,
    val depth_top_m: Double = 0.0, val depth_bottom_m: Double = 0.0
)

private fun Sample.toJson() = SampleJson(uuid, layerUuid, collectionType, packaging, depthM, depthTopM, depthBottomM)

@kotlinx.serialization.Serializable
private data class UgvJson(val uuid: String, val borehole_uuid: String, val order_idx: Int, val depth_m: Double)

private fun UgvEntry.toJson() = UgvJson(uuid, boreholeUuid, orderIdx, depthM)

@kotlinx.serialization.Serializable
private data class MmgJson(
    val uuid: String, val borehole_uuid: String, val order_idx: Int,
    val top_m: Double, val bottom_m: Double, val description: String
)

private fun MmgEntry.toJson() = MmgJson(uuid, boreholeUuid, orderIdx, topM, bottomM, description)
