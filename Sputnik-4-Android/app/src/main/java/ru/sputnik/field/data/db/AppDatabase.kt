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
        UgvEntry::class, MmgEntry::class, Photo::class,
        CustomSoilType::class, CustomSoilState::class
    ],
    version = 3,
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
    abstract fun customRefs(): CustomRefsDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        private val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS custom_soil_types (name TEXT NOT NULL PRIMARY KEY, createdAt TEXT NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS custom_soil_states (name TEXT NOT NULL PRIMARY KEY, createdAt TEXT NOT NULL)")
            }
        }

        private val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE soil_layers ADD COLUMN frozenState TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE samples ADD COLUMN depthTopM REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE samples ADD COLUMN depthBottomM REAL NOT NULL DEFAULT 0")
                db.execSQL("UPDATE samples SET depthTopM = depthM WHERE depthTopM = 0 AND depthM > 0")
                db.execSQL("ALTER TABLE boreholes ADD COLUMN casingLengthM REAL NOT NULL DEFAULT 0")
            }
        }

        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "sputnik_field.db"
            ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build().also { INSTANCE = it }
        }
    }
}
