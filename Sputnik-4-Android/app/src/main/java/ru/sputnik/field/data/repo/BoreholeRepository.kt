package ru.sputnik.field.data.repo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*

data class ValidationIssue(val boreholeName: String, val issues: List<String>)

class BoreholeRepository(private val db: AppDatabase) {

    // ── Скважины ────────────────────────────────────────────────
    fun bySite(siteId: String): Flow<List<Borehole>> = db.boreholes().bySite(siteId)
    fun byVolume(volumeId: String): Flow<List<Borehole>> = db.boreholes().byVolume(volumeId)

    suspend fun byUuid(uuid: String): Borehole? = withContext(Dispatchers.IO) {
        db.boreholes().byUuid(uuid)
    }

    suspend fun bySiteOnce(siteId: String): List<Borehole> = withContext(Dispatchers.IO) {
        db.boreholes().bySiteOnce(siteId)
    }

    suspend fun upsert(b: Borehole) = withContext(Dispatchers.IO) {
        db.boreholes().upsert(b)
    }

    suspend fun delete(b: Borehole) = withContext(Dispatchers.IO) {
        db.boreholes().delete(b)
    }

    suspend fun forExport(brigadeId: String, from: String, to: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().forExport(brigadeId, from, to) }

    suspend fun forExportAll(from: String, to: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().forExportAll(from, to) }

    suspend fun forExportBySite(siteId: String, from: String, to: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().forExportBySite(siteId, from, to) }

    suspend fun completedOn(volumeId: String, date: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().completedOn(volumeId, date) }

    suspend fun completedInRange(volumeId: String, from: String, to: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().completedInRange(volumeId, from, to) }

    suspend fun allCompleted(volumeId: String): List<Borehole> =
        withContext(Dispatchers.IO) { db.boreholes().allCompleted(volumeId) }

    suspend fun deleteDraftsBySite(siteId: String) = withContext(Dispatchers.IO) {
        db.boreholes().deleteDraftsBySite(siteId)
    }

    suspend fun deleteAll() = withContext(Dispatchers.IO) { db.boreholes().deleteAll() }

    // ── Слои ────────────────────────────────────────────────────
    fun layersByBorehole(uuid: String): Flow<List<SoilLayer>> = db.soilLayers().byBorehole(uuid)

    suspend fun layersByBoreholeOnce(uuid: String): List<SoilLayer> = withContext(Dispatchers.IO) {
        db.soilLayers().byBoreholeOnce(uuid)
    }

    suspend fun upsertLayer(l: SoilLayer) = withContext(Dispatchers.IO) {
        db.soilLayers().upsert(l)
    }

    suspend fun deleteLayer(l: SoilLayer) = withContext(Dispatchers.IO) {
        db.soilLayers().delete(l)
    }

    // ── Пробы ───────────────────────────────────────────────────
    fun samplesByLayer(layerUuid: String): Flow<List<Sample>> = db.samples().byLayer(layerUuid)

    suspend fun samplesByLayers(layerUuids: List<String>): List<Sample> =
        withContext(Dispatchers.IO) { db.samples().byLayers(layerUuids) }

    suspend fun insertSample(s: Sample) = withContext(Dispatchers.IO) {
        db.samples().insert(s)
    }

    suspend fun deleteSample(s: Sample) = withContext(Dispatchers.IO) {
        db.samples().delete(s)
    }

    // ── УГВ ─────────────────────────────────────────────────────
    fun ugvByBorehole(uuid: String): Flow<List<UgvEntry>> = db.ugv().byBorehole(uuid)

    suspend fun ugvByBoreholeOnce(uuid: String): List<UgvEntry> = withContext(Dispatchers.IO) {
        db.ugv().byBoreholeOnce(uuid)
    }

    suspend fun insertUgv(u: UgvEntry) = withContext(Dispatchers.IO) {
        db.ugv().insert(u)
    }

    suspend fun deleteUgv(u: UgvEntry) = withContext(Dispatchers.IO) {
        db.ugv().delete(u)
    }

    // ── ММГ ─────────────────────────────────────────────────────
    fun mmgByBorehole(uuid: String): Flow<List<MmgEntry>> = db.mmg().byBorehole(uuid)

    suspend fun mmgByBoreholeOnce(uuid: String): List<MmgEntry> = withContext(Dispatchers.IO) {
        db.mmg().byBoreholeOnce(uuid)
    }

    suspend fun insertMmg(m: MmgEntry) = withContext(Dispatchers.IO) {
        db.mmg().insert(m)
    }

    suspend fun deleteMmg(m: MmgEntry) = withContext(Dispatchers.IO) {
        db.mmg().delete(m)
    }

    // ── Фото ────────────────────────────────────────────────────
    fun photosByBorehole(uuid: String): Flow<List<Photo>> = db.photos().byBorehole(uuid)

    suspend fun photosByBoreholeOnce(uuid: String): List<Photo> = withContext(Dispatchers.IO) {
        db.photos().byBoreholeOnce(uuid)
    }

    suspend fun insertPhoto(p: Photo) = withContext(Dispatchers.IO) {
        db.photos().insert(p)
    }

    suspend fun deletePhoto(p: Photo) = withContext(Dispatchers.IO) {
        db.photos().delete(p)
    }

    // ── Композитные запросы ─────────────────────────────────────

    /**
     * Возвращает список незаполненных done-скважин для бейджа в HomeScreen.
     * Всё на IO — на ~100 скважин обходится без подвисаний.
     */
    suspend fun loadValidationIssues(): List<ValidationIssue> = withContext(Dispatchers.IO) {
        val done = db.boreholes().allDone()
        done.mapNotNull { bh ->
            val issueList = buildList {
                if (db.photos().byBoreholeOnce(bh.uuid).isEmpty())
                    add("нет фотографий")
                if (bh.plannedDepthM <= 0.0)
                    add("плановая глубина не указана")
                if (db.soilLayers().byBoreholeOnce(bh.uuid).any { it.depthM <= 0.0 })
                    add("слой без глубины подошвы")
            }
            if (issueList.isEmpty()) null
            else ValidationIssue(bh.name.ifBlank { bh.uuid.take(6) }, issueList)
        }
    }
}
