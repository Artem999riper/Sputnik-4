package ru.sputnik.field.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Primary = Color(0xFF0891B2)      // cyan-600
private val OnPrimary = Color.White
private val Background = Color(0xFFF8FAFC)
private val Surface = Color.White
private val OnSurface = Color(0xFF1E293B)

private val FieldColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = Color(0xFFE0F2FE),
    onPrimaryContainer = Color(0xFF0C4A6E),
    secondary = Color(0xFF7C3AED),
    onSecondary = Color.White,
    background = Background,
    surface = Surface,
    onBackground = OnSurface,
    onSurface = OnSurface,
    outline = Color(0xFFCBD5E1),
    error = Color(0xFFDC2626),
)

@Composable
fun SputnikTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = FieldColorScheme, content = content)
