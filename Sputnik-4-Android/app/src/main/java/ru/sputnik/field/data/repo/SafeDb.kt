package ru.sputnik.field.data.repo

import android.database.sqlite.SQLiteException
import androidx.compose.material3.SnackbarHostState
import java.io.IOException

/**
 * Выполняет [block] и при ошибке БД/диска показывает Snackbar.
 * Возвращает null при ошибке, чтобы вызывающий код мог отличить успех от провала.
 */
suspend inline fun <T> safeDb(
    snackbar: SnackbarHostState?,
    crossinline block: suspend () -> T
): T? = try {
    block()
} catch (e: SQLiteException) {
    snackbar?.showSnackbar("Ошибка БД: ${e.message ?: "неизвестно"}")
    null
} catch (e: IOException) {
    snackbar?.showSnackbar("Ошибка диска: ${e.message ?: "нет места"}")
    null
} catch (e: IllegalStateException) {
    snackbar?.showSnackbar("Ошибка: ${e.message ?: "неизвестно"}")
    null
}
