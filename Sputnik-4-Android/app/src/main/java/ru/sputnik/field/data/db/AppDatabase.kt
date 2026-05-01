package ru.sputnik.field.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import ru.sputnik.field.data.dao.*
import ru.sputnik.field.data.model.*

@Database(
    entities = [
        Worker::class, Transport::class, Site::class, KmlPoint::class,
        Brigade::class, BrigadeMember::class,
        Borehole::class, SoilLayer::class, Sample::class,
        UgvEntry::class, MmgEntry::class, Photo::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun workers(): WorkerDao
    abstract fun transport(): TransportDao
    abstract fun sites(): SiteDao
    abstract fun kmlPoints(): KmlPointDao
    abstract fun brigades(): BrigadeDao
    abstract fun boreholes(): BoreholeDao
    abstract fun soilLayers(): SoilLayerDao
    abstract fun samples(): SampleDao
    abstract fun ugv(): UgvDao
    abstract fun mmg(): MmgDao
    abstract fun photos(): PhotoDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "sputnik_field.db"
            ).build().also { INSTANCE = it }
        }
    }
}
