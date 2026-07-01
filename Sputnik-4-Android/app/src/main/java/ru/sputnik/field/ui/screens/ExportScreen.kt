package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Site
import ru.sputnik.field.data.spk.ExportResult
import ru.sputnik.field.data.spk.buildShareIntent
import ru.sputnik.field.data.spk.exportSpk
import ru.sputnik.field.data.spk.saveSpkToDownloads
import ru.sputnik.field.ui.components.ConfirmDialog
import java.io.File
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExportScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()
    val sites by db.sites().all().collectAsState(initial = emptyList())

    val today = LocalDate.now()
    val weekAgo = today.minusDays(7)

    val prefs = remember { context.getSharedPreferences("sputnik_field_prefs", Context.MODE_PRIVATE) }
    var geologistName by remember { mutableStateOf(prefs.getString("geologist_name", "") ?: "") }

    var selectedSite by remember { mutableStateOf<Site?>(null) }
    var fromDate by remember { mutableStateOf(weekAgo) }
    var toDate by remember { mutableStateOf(today) }
    var exportState by remember { mutableStateOf<ExportState>(ExportState.Idle) }

    var showSitePicker by remember { mutableStateOf(false) }
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }
    var showNoBrigadeWarning by remember { mutableStateOf(false) }
    var hasBrigade by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { hasBrigade = db.brigades().current() != null }

    // ── Предупреждение: бригада не назначена ─────────────────
    if (showNoBrigadeWarning) {
        ConfirmDialog(
            title = "Бригада не назначена",
            message = "Перед экспортом назначьте бригаду в разделе «Бригада». Без бригады архив не будет содержать информацию об исполнителях.",
            confirmLabel = "Экспортировать всё равно",
            dismissLabel = "Назначить бригаду",
            destructive = false,
            onDismiss = { showNoBrigadeWarning = false },
            onConfirm = {
                showNoBrigadeWarning = false
                exportState = ExportState.Loading
                scope.launch {
                    exportState = try {
                        ExportState.Done(
                            exportSpk(context, fromDate.toString(), toDate.toString(),
                                selectedSite?.id, selectedSite?.name, geologistName)
                        )
                    } catch (e: Exception) {
                        ExportState.Error(e.message ?: "Ошибка")
                    }
                }
            }
        )
    }

    // ── Диалог выбора объекта ─────────────────────────────────
    if (showSitePicker) {
        AlertDialog(
            onDismissRequest = { showSitePicker = false },
            title = { Text("Выбрать объект") },
            text = {
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    item {
                        Surface(
                            onClick = { selectedSite = null; showSitePicker = false },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Все объекты",
                                Modifier.padding(horizontal = 4.dp, vertical = 12.dp),
                                color = if (selectedSite == null)
                                    MaterialTheme.colorScheme.primary
                                else
                                    MaterialTheme.colorScheme.onSurface)
                        }
                        HorizontalDivider()
                    }
                    items(sites) { site ->
                        Surface(
                            onClick = { selectedSite = site; showSitePicker = false },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(site.name,
                                Modifier.padding(horizontal = 4.dp, vertical = 12.dp),
                                color = if (selectedSite?.id == site.id)
                                    MaterialTheme.colorScheme.primary
                                else
                                    MaterialTheme.colorScheme.onSurface)
                        }
                        HorizontalDivider()
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showSitePicker = false }) { Text("Закрыть") }
            }
        )
    }

    // ── Диалог выбора даты «с» ────────────────────────────────
    if (showFromPicker) {
        val dpState = rememberDatePickerState(
            initialSelectedDateMillis = fromDate.toEpochMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    dpState.selectedDateMillis?.toLocalDate()?.let { fromDate = it }
                    showFromPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showFromPicker = false }) { Text("Отмена") }
            }
        ) { DatePicker(state = dpState) }
    }

    // ── Диалог выбора даты «по» ───────────────────────────────
    if (showToPicker) {
        val dpState = rememberDatePickerState(
            initialSelectedDateMillis = toDate.toEpochMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    dpState.selectedDateMillis?.toLocalDate()?.let { toDate = it }
                    showToPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showToPicker = false }) { Text("Отмена") }
            }
        ) { DatePicker(state = dpState) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Экспорт .spk") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                }
            )
        }
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when (val s = exportState) {
                ExportState.Idle -> {
                    Icon(Icons.Default.Share, null, Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.primary)

                    Text("Настройте параметры экспорта",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium)

                    // Я геолог (имя сохраняется в SharedPreferences)
                    OutlinedTextField(
                        value = geologistName,
                        onValueChange = {
                            geologistName = it
                            prefs.edit().putString("geologist_name", it).apply()
                        },
                        label = { Text("Я геолог") },
                        placeholder = { Text("Иванов И.И.") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    // Объект
                    OutlinedButton(
                        onClick = { showSitePicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(selectedSite?.name ?: "Все объекты")
                    }

                    // Начало периода
                    OutlinedButton(
                        onClick = { showFromPicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CalendarToday, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("С: $fromDate")
                    }

                    // Конец периода
                    OutlinedButton(
                        onClick = { showToPicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CalendarToday, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("По: $toDate")
                    }

                    Button(
                        onClick = {
                            if (!hasBrigade) {
                                showNoBrigadeWarning = true
                            } else {
                                exportState = ExportState.Loading
                                scope.launch {
                                    exportState = try {
                                        ExportState.Done(
                                            exportSpk(context, fromDate.toString(), toDate.toString(),
                                                selectedSite?.id, selectedSite?.name, geologistName)
                                        )
                                    } catch (e: Exception) {
                                        ExportState.Error(e.message ?: "Ошибка")
                                    }
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Сформировать архив") }
                }

                ExportState.Loading -> {
                    CircularProgressIndicator()
                    Text("Создаётся .spk архив…")
                }

                is ExportState.Done -> {
                    Icon(Icons.Default.Share, null, Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Архив готов ✓", fontWeight = FontWeight.Bold)
                    Text("${s.result.boreholes} скважин · ${s.result.photos} фото",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .7f))
                    Text("Файл: ${s.result.fileName}", fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f))
                    Button(
                        onClick = {
                            val intent = buildShareIntent(s.result.uri, s.result.fileName)
                            context.startActivity(
                                android.content.Intent.createChooser(intent, "Отправить .spk"))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Share, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Отправить оператору")
                    }
                    OutlinedButton(
                        onClick = {
                            val srcFile = File(context.getExternalFilesDir(null), "exports/${s.result.fileName}")
                            val ok = saveSpkToDownloads(context, srcFile, s.result.fileName)
                            android.widget.Toast.makeText(
                                context,
                                if (ok) "Сохранено в Загрузки" else "Ошибка сохранения",
                                android.widget.Toast.LENGTH_SHORT
                            ).show()
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Download, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Сохранить в Загрузки")
                    }
                    OutlinedButton(onClick = { exportState = ExportState.Idle },
                        modifier = Modifier.fillMaxWidth()) { Text("Новый экспорт") }
                }

                is ExportState.Error -> {
                    Text("Ошибка: ${s.message}", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { exportState = ExportState.Idle },
                        modifier = Modifier.fillMaxWidth()) { Text("Повторить") }
                }
            }
        }
    }
}

private sealed interface ExportState {
    object Idle : ExportState
    object Loading : ExportState
    data class Done(val result: ExportResult) : ExportState
    data class Error(val message: String) : ExportState
}

private fun LocalDate.toEpochMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toLocalDate(): LocalDate =
    java.time.Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
