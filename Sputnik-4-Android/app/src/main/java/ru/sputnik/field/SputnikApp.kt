package ru.sputnik.field

import android.app.Application
import ru.sputnik.field.data.db.AppDatabase

class SputnikApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Pre-warm database connection on first launch
        AppDatabase.get(this)
    }
}
