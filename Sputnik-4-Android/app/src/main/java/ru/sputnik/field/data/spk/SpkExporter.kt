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
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private val json = Json { encodeDefaults = true; prettyPrint = false }

data class ExportResult(val uri: Uri, val boreholes: Int, val photos: Int)

suspend fun exportSpk(context: Context, fromDate: String, toDate: String, siteId: String? = null): ExportResult =
    withContext(Dispatchers.IO) {
        val db = AppDatabase.get(context)
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

        val exportDir = File(context.getExternalFilesDir(null), "exports").also { it.mkdirs() }
        val fileName = "spk_${fromDate}_${toDate}.spk"
        val outFile = File(exportDir, fileName)

        ZipOutputStream(FileOutputStream(outFile).buffered()).use { zos ->
            // boreholes.json
            zos.putEntry("boreholes.json", json.encodeToString(boreholes.map { it.toJson() }))

            // soil_layers.json
            val allLayers = cards.flatMap { it.layers }
            zos.putEntry("soil_layers.json", json.encodeToString(allLayers.map { it.toJson() }))

            // samples.json
            val allSamples = cards.flatMap { it.samples }
            zos.putEntry("samples.json", json.encodeToString(allSamples.map { it.toJson() }))

            // ugv.json
            val allUgv = cards.flatMap { it.ugv }
            zos.putEntry("ugv.json", json.encodeToString(allUgv.map { it.toJson() }))

            // mmg.json
            val allMmg = cards.flatMap { it.mmg }
            zos.putEntry("mmg.json", json.encodeToString(allMmg.map { it.toJson() }))

            // photos/ — copy files into zip
            val allPhotos = cards.flatMap { it.photos }
            var photosCopied = 0
            allPhotos.forEach { photo ->
                val src = File(photo.filePath)
                if (src.exists()) {
                    val ext = src.extension.ifEmpty { "jpg" }
                    val entryName = "photos/${photo.boreholeUuid}_${photo.category}_${photo.uuid.take(8)}.$ext"
                    zos.putFile(entryName, src)
                    photosCopied++
                }
            }

            // manifest.json (last — after we know counts)
            val manifest = buildManifest(
                fromDate, toDate, boreholes.size, photosCopied,
                cards.firstOrNull()?.borehole?.brigadeId
            )
            zos.putEntry("manifest.json", json.encodeToString(manifest))
        }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
        ExportResult(uri, boreholes.size, cards.sumOf { it.photos.size })
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

private fun ZipOutputStream.putFile(name: String, file: File) {
    putNextEntry(ZipEntry(name))
    file.inputStream().use { it.copyTo(this) }
    closeEntry()
}

@kotlinx.serialization.Serializable
private data class ManifestJson(
    val format_version: Int,
    val app_version: String,
    val exported_at: String,
    val period: PeriodJson,
    val counts: CountsJson
)

@kotlinx.serialization.Serializable
private data class PeriodJson(val from: String, val to: String)

@kotlinx.serialization.Serializable
private data class CountsJson(val boreholes: Int, val photos: Int)

private fun buildManifest(from: String, to: String, bh: Int, photos: Int, brigadeId: String?) =
    ManifestJson(
        format_version = 1,
        app_version = "1.0.0",
        exported_at = java.time.Instant.now().toString(),
        period = PeriodJson(from, to),
        counts = CountsJson(bh, photos)
    )

// ── Entity → JSON serialisable maps ─────────────────────────

@kotlinx.serialization.Serializable
private data class BhJson(
    val uuid: String, val site_id: String, val kml_point_id: String?,
    val lat: Double?, val lng: Double?, val name: String,
    val planned_depth_m: Double, val diameter_mm: Double,
    val work_type: String, val geomorph_desc: String,
    val description: String, val drill_date: String,
    val status: String, val brigade_id: String?
)

private fun Borehole.toJson() = BhJson(
    uuid, siteId, kmlPointId, manualLat, manualLng, name,
    plannedDepthM, diameterMm, workType, geomorphDesc,
    description, drillDate, status, brigadeId
)

@kotlinx.serialization.Serializable
private data class LayerJson(
    val uuid: String, val borehole_uuid: String, val order_idx: Int,
    val soil_type: String, val state: String, val description: String, val depth_m: Double
)

private fun SoilLayer.toJson() = LayerJson(uuid, boreholeUuid, orderIdx, soilType, state, description, depthM)

@kotlinx.serialization.Serializable
private data class SampleJson(
    val uuid: String, val layer_uuid: String,
    val collection_type: String, val packaging: String, val depth_m: Double
)

private fun Sample.toJson() = SampleJson(uuid, layerUuid, collectionType, packaging, depthM)

@kotlinx.serialization.Serializable
private data class UgvJson(val uuid: String, val borehole_uuid: String, val order_idx: Int, val depth_m: Double)

private fun UgvEntry.toJson() = UgvJson(uuid, boreholeUuid, orderIdx, depthM)

@kotlinx.serialization.Serializable
private data class MmgJson(
    val uuid: String, val borehole_uuid: String, val order_idx: Int,
    val top_m: Double, val bottom_m: Double, val description: String
)

private fun MmgEntry.toJson() = MmgJson(uuid, boreholeUuid, orderIdx, topM, bottomM, description)
