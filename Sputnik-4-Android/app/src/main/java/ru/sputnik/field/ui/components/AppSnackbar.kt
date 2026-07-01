package ru.sputnik.field.ui.components

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.compositionLocalOf

/**
 * Глобальный SnackbarHostState. Хост устанавливается в [ru.sputnik.field.ui.SputnikNav]
 * через Scaffold{snackbarHost=...}. Composable'ы получают его через LocalSnackbar.current
 * и могут показать сообщение об ошибке через snackbar.showSnackbar("...").
 */
val LocalSnackbar = compositionLocalOf<SnackbarHostState> {
    error("LocalSnackbar not provided — wrap content in SputnikNav scaffold")
}
