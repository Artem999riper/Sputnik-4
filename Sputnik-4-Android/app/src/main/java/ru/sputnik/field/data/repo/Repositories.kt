package ru.sputnik.field.data.repo

import android.content.Context
import ru.sputnik.field.data.db.AppDatabase

object Repositories {
    @Volatile private var db: AppDatabase? = null

    fun init(ctx: Context) {
        if (db == null) {
            synchronized(this) {
                if (db == null) db = AppDatabase.get(ctx.applicationContext)
            }
        }
    }

    private fun requireDb(): AppDatabase =
        db ?: error("Repositories.init(context) must be called before access")

    val borehole: BoreholeRepository by lazy { BoreholeRepository(requireDb()) }
    val sites: SitesRepository by lazy { SitesRepository(requireDb()) }
    val refs: RefsRepository by lazy { RefsRepository(requireDb()) }
}
