package ru.sputnik.field.data.repo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*

class SitesRepository(private val db: AppDatabase) {

    // ── Объекты ─────────────────────────────────────────────────
    fun allSites(): Flow<List<Site>> = db.sites().all()

    suspend fun insertAllSites(items: List<Site>) = withContext(Dispatchers.IO) {
        db.sites().insertAll(items)
    }

    suspend fun clearSites() = withContext(Dispatchers.IO) { db.sites().clear() }

    /**
     * Каскадно удаляет объект и связанные с ним КМЛ-точки.
     * Виды работ/скважины удаляются автоматически через FK CASCADE.
     */
    suspend fun deleteSiteCascade(site: Site) = withContext(Dispatchers.IO + NonCancellable) {
        db.kmlPoints().deleteBySite(site.id)
        db.sites().delete(site)
    }

    // ── КМЛ-точки ───────────────────────────────────────────────
    fun kmlBySite(siteId: String): Flow<List<KmlPoint>> = db.kmlPoints().bySite(siteId)

    suspend fun insertAllKml(items: List<KmlPoint>) = withContext(Dispatchers.IO) {
        db.kmlPoints().insertAll(items)
    }

    suspend fun clearKml() = withContext(Dispatchers.IO) { db.kmlPoints().clear() }

    suspend fun deleteKmlBySite(siteId: String) = withContext(Dispatchers.IO) {
        db.kmlPoints().deleteBySite(siteId)
    }

    // ── Виды работ ──────────────────────────────────────────────
    fun volumesBySite(siteId: String): Flow<List<Volume>> = db.volumes().bySite(siteId)

    suspend fun volumesBySiteOnce(siteId: String): List<Volume> = withContext(Dispatchers.IO) {
        db.volumes().bySiteOnce(siteId)
    }

    suspend fun volumeById(id: String): Volume? = withContext(Dispatchers.IO) {
        db.volumes().byId(id)
    }

    suspend fun allVolumes(): List<Volume> = withContext(Dispatchers.IO) { db.volumes().all() }

    suspend fun upsertVolume(v: Volume) = withContext(Dispatchers.IO) { db.volumes().upsert(v) }

    suspend fun deleteVolume(id: String) = withContext(Dispatchers.IO) { db.volumes().delete(id) }

    // ── Точки работ (зондирование/термометрия) ──────────────────
    fun taskPointsByVolume(volumeId: String): Flow<List<TaskPoint>> = db.taskPoints().byVolume(volumeId)

    suspend fun taskPointsByVolumeOnce(volumeId: String): List<TaskPoint> =
        withContext(Dispatchers.IO) { db.taskPoints().byVolumeOnce(volumeId) }

    suspend fun taskPointByUuid(uuid: String): TaskPoint? = withContext(Dispatchers.IO) {
        db.taskPoints().byUuid(uuid)
    }

    suspend fun taskPointsCompletedOn(volumeId: String, date: String): List<TaskPoint> =
        withContext(Dispatchers.IO) { db.taskPoints().completedOn(volumeId, date) }

    suspend fun taskPointsCompletedInRange(volumeId: String, from: String, to: String): List<TaskPoint> =
        withContext(Dispatchers.IO) { db.taskPoints().completedInRange(volumeId, from, to) }

    suspend fun taskPointsAllCompleted(volumeId: String): List<TaskPoint> =
        withContext(Dispatchers.IO) { db.taskPoints().allCompleted(volumeId) }

    suspend fun upsertTaskPoint(p: TaskPoint) = withContext(Dispatchers.IO) {
        db.taskPoints().upsert(p)
    }

    suspend fun insertTaskPointsIgnore(points: List<TaskPoint>) = withContext(Dispatchers.IO) {
        db.taskPoints().insertAllIgnore(points)
    }

    suspend fun deleteTaskPoint(uuid: String) = withContext(Dispatchers.IO) {
        db.taskPoints().delete(uuid)
    }
}
