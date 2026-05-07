package ru.sputnik.field.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

// ── Справочники (импорт из refs.json) ──────────────────────

@Entity(tableName = "workers")
data class Worker(
    @PrimaryKey val id: String,
    val name: String,
    val role: String = "",
    val phone: String = ""
)

@Entity(tableName = "transport")
data class Transport(
    @PrimaryKey val id: String,
    val type: String = "",
    val name: String,
    val plate: String = ""
)

@Entity(tableName = "sites")
data class Site(
    @PrimaryKey val id: String,
    val name: String,
    val lat: Double? = null,
    val lng: Double? = null
)

@Entity(tableName = "kml_points")
data class KmlPoint(
    @PrimaryKey val id: String,
    val siteId: String,
    val name: String,
    val lat: Double,
    val lng: Double
)

// ── Бригада ─────────────────────────────────────────────────

@Entity(tableName = "brigades")
data class Brigade(
    @PrimaryKey val id: String,
    val createdAt: String,
    val transportId: String? = null
)

@Entity(
    tableName = "brigade_members",
    primaryKeys = ["brigadeId", "workerId"]
)
data class BrigadeMember(
    val brigadeId: String,
    val workerId: String
)

// ── Полевые данные ───────────────────────────────────────────

/** Виды работ */
enum class WorkType(val label: String) {
    SEARCH("Поисковая"),
    EXPLORATION("Разведочная"),
    TRENCH("Шурф"),
    GEOLOGICAL("Геологическая")
}

@Entity(tableName = "boreholes")
data class Borehole(
    @PrimaryKey val uuid: String,
    val siteId: String = "",
    val kmlPointId: String? = null,
    val manualLat: Double? = null,
    val manualLng: Double? = null,
    val name: String = "",
    val plannedDepthM: Double = 0.0,
    val diameterMm: Double = 0.0,
    val workType: String = WorkType.EXPLORATION.name,
    val geomorphDesc: String = "",
    val description: String = "",
    val drillDate: String = "",
    val status: String = "draft",   // draft | done
    val brigadeId: String? = null,
    val casingLengthM: Double = 0.0
)

@Entity(
    tableName = "soil_layers",
    foreignKeys = [ForeignKey(
        entity = Borehole::class,
        parentColumns = ["uuid"],
        childColumns = ["boreholeUuid"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("boreholeUuid")]
)
data class SoilLayer(
    @PrimaryKey val uuid: String,
    val boreholeUuid: String,
    val orderIdx: Int = 0,
    val soilType: String = "",
    val state: String = "",
    val description: String = "",
    val depthM: Double = 0.0,
    val frozenState: String = ""   // "Талый" | "Мёрзлый" | ""
)

@Entity(
    tableName = "samples",
    foreignKeys = [ForeignKey(
        entity = SoilLayer::class,
        parentColumns = ["uuid"],
        childColumns = ["layerUuid"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("layerUuid")]
)
data class Sample(
    @PrimaryKey val uuid: String,
    val layerUuid: String,
    val collectionType: String = "",
    val packaging: String = "",
    val depthM: Double = 0.0,           // совместимость: верхняя граница диапазона
    val depthTopM: Double = 0.0,
    val depthBottomM: Double = 0.0
)

@Entity(
    tableName = "ugv_entries",
    foreignKeys = [ForeignKey(
        entity = Borehole::class,
        parentColumns = ["uuid"],
        childColumns = ["boreholeUuid"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("boreholeUuid")]
)
data class UgvEntry(
    @PrimaryKey val uuid: String,
    val boreholeUuid: String,
    val orderIdx: Int = 0,
    val depthM: Double = 0.0
)

@Entity(
    tableName = "mmg_entries",
    foreignKeys = [ForeignKey(
        entity = Borehole::class,
        parentColumns = ["uuid"],
        childColumns = ["boreholeUuid"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("boreholeUuid")]
)
data class MmgEntry(
    @PrimaryKey val uuid: String,
    val boreholeUuid: String,
    val orderIdx: Int = 0,
    val topM: Double = 0.0,
    val bottomM: Double = 0.0,
    val description: String = ""
)

/** category: vyrabotka | drilling | core_box | journal */
@Entity(
    tableName = "photos",
    foreignKeys = [ForeignKey(
        entity = Borehole::class,
        parentColumns = ["uuid"],
        childColumns = ["boreholeUuid"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("boreholeUuid")]
)
data class Photo(
    @PrimaryKey val uuid: String,
    val boreholeUuid: String,
    val category: String,
    val filePath: String,
    val takenAt: String = ""
)

// ── Агрегированная карточка скважины ────────────────────────

data class BoreholeCard(
    val borehole: Borehole,
    val layers: List<SoilLayer> = emptyList(),
    val samples: List<Sample> = emptyList(),
    val ugv: List<UgvEntry> = emptyList(),
    val mmg: List<MmgEntry> = emptyList(),
    val photos: List<Photo> = emptyList()
)

// ── Пользовательские справочники ─────────────────────────────

@Entity(tableName = "custom_soil_types")
data class CustomSoilType(
    @PrimaryKey val name: String,
    val createdAt: String = java.time.Instant.now().toString()
)

@Entity(tableName = "custom_soil_states")
data class CustomSoilState(
    @PrimaryKey val name: String,
    val createdAt: String = java.time.Instant.now().toString()
)
