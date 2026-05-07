package ru.sputnik.field.data.dao

import androidx.room.*
import kotlinx.coroutines.flow.Flow
import ru.sputnik.field.data.model.*

@Dao
interface WorkerDao {
    @Query("SELECT * FROM workers ORDER BY name")
    fun all(): Flow<List<Worker>>
    @Query("SELECT * FROM workers WHERE id IN (:ids)")
    suspend fun byIds(ids: List<String>): List<Worker>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(items: List<Worker>)
    @Query("DELETE FROM workers") suspend fun clear()
}

@Dao
interface TransportDao {
    @Query("SELECT * FROM transport ORDER BY name")
    fun all(): Flow<List<Transport>>
    @Query("SELECT * FROM transport WHERE id = :id LIMIT 1")
    suspend fun byId(id: String): Transport?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(items: List<Transport>)
    @Query("DELETE FROM transport") suspend fun clear()
}

@Dao
interface SiteDao {
    @Query("SELECT * FROM sites ORDER BY name")
    fun all(): Flow<List<Site>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(items: List<Site>)
    @Query("DELETE FROM sites") suspend fun clear()
}

@Dao
interface KmlPointDao {
    @Query("SELECT * FROM kml_points WHERE siteId = :siteId ORDER BY name")
    fun bySite(siteId: String): Flow<List<KmlPoint>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(items: List<KmlPoint>)
    @Query("DELETE FROM kml_points") suspend fun clear()
}

@Dao
interface BrigadeDao {
    @Query("SELECT * FROM brigades ORDER BY createdAt DESC LIMIT 1")
    suspend fun current(): Brigade?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(b: Brigade)
    @Query("SELECT * FROM brigade_members WHERE brigadeId = :brigadeId")
    suspend fun members(brigadeId: String): List<BrigadeMember>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertMember(m: BrigadeMember)
    @Query("DELETE FROM brigade_members WHERE brigadeId = :brigadeId") suspend fun clearMembers(brigadeId: String)
}

@Dao
interface BoreholeDao {
    @Query("SELECT * FROM boreholes WHERE siteId = :siteId ORDER BY drillDate DESC")
    fun bySite(siteId: String): Flow<List<Borehole>>

    @Query("SELECT * FROM boreholes WHERE uuid = :uuid")
    suspend fun byUuid(uuid: String): Borehole?

    @Query("SELECT * FROM boreholes WHERE siteId = :siteId")
    suspend fun bySiteOnce(siteId: String): List<Borehole>

    // @Upsert = INSERT OR IGNORE + UPDATE — does NOT delete the row, so FK CASCADE is not triggered.
    // Never use @Insert(REPLACE) for Borehole — it would DELETE the row first, cascade-deleting all layers/photos.
    @Upsert suspend fun upsert(b: Borehole)
    @Delete suspend fun delete(b: Borehole)

    @Query("SELECT * FROM boreholes WHERE brigadeId = :brigadeId AND drillDate BETWEEN :from AND :to")
    suspend fun forExport(brigadeId: String, from: String, to: String): List<Borehole>

    // Только завершённые скважины (status='done') — черновики не экспортируются.
    @Query("SELECT * FROM boreholes WHERE drillDate BETWEEN :from AND :to AND status='done'")
    suspend fun forExportAll(from: String, to: String): List<Borehole>

    @Query("SELECT * FROM boreholes WHERE siteId = :siteId AND drillDate BETWEEN :from AND :to AND status='done'")
    suspend fun forExportBySite(siteId: String, from: String, to: String): List<Borehole>

    @Query("DELETE FROM boreholes WHERE siteId = :siteId AND status != 'done'")
    suspend fun deleteDraftsBySite(siteId: String)

    @Query("DELETE FROM boreholes")
    suspend fun deleteAll()
}

@Dao
interface SoilLayerDao {
    @Query("SELECT * FROM soil_layers WHERE boreholeUuid = :uuid ORDER BY orderIdx, depthM")
    fun byBorehole(uuid: String): Flow<List<SoilLayer>>
    @Query("SELECT * FROM soil_layers WHERE boreholeUuid = :uuid ORDER BY orderIdx, depthM")
    suspend fun byBoreholeOnce(uuid: String): List<SoilLayer>
    // Same reason as BoreholeDao: @Upsert avoids cascade-deleting Samples when saving a layer.
    @Upsert suspend fun upsert(l: SoilLayer)
    @Delete suspend fun delete(l: SoilLayer)
}

@Dao
interface SampleDao {
    @Query("SELECT * FROM samples WHERE layerUuid = :layerUuid ORDER BY depthM")
    fun byLayer(layerUuid: String): Flow<List<Sample>>
    @Query("SELECT * FROM samples WHERE layerUuid IN (:layerUuids)")
    suspend fun byLayers(layerUuids: List<String>): List<Sample>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(s: Sample)
    @Delete suspend fun delete(s: Sample)
}

@Dao
interface UgvDao {
    @Query("SELECT * FROM ugv_entries WHERE boreholeUuid = :uuid ORDER BY orderIdx, depthM")
    fun byBorehole(uuid: String): Flow<List<UgvEntry>>
    @Query("SELECT * FROM ugv_entries WHERE boreholeUuid = :uuid ORDER BY orderIdx, depthM")
    suspend fun byBoreholeOnce(uuid: String): List<UgvEntry>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(u: UgvEntry)
    @Delete suspend fun delete(u: UgvEntry)
}

@Dao
interface MmgDao {
    @Query("SELECT * FROM mmg_entries WHERE boreholeUuid = :uuid ORDER BY orderIdx, topM")
    fun byBorehole(uuid: String): Flow<List<MmgEntry>>
    @Query("SELECT * FROM mmg_entries WHERE boreholeUuid = :uuid ORDER BY orderIdx, topM")
    suspend fun byBoreholeOnce(uuid: String): List<MmgEntry>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(m: MmgEntry)
    @Delete suspend fun delete(m: MmgEntry)
}

@Dao
interface PhotoDao {
    @Query("SELECT * FROM photos WHERE boreholeUuid = :uuid ORDER BY takenAt")
    fun byBorehole(uuid: String): Flow<List<Photo>>
    @Query("SELECT * FROM photos WHERE boreholeUuid = :uuid ORDER BY takenAt")
    suspend fun byBoreholeOnce(uuid: String): List<Photo>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(p: Photo)
    @Delete suspend fun delete(p: Photo)
}

@Dao
interface CustomRefsDao {
    @Query("SELECT name FROM custom_soil_types ORDER BY name")
    fun soilTypes(): Flow<List<String>>
    @Query("SELECT name FROM custom_soil_states ORDER BY name")
    fun soilStates(): Flow<List<String>>
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun addSoilType(t: CustomSoilType)
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun addSoilState(s: CustomSoilState)
}
