package ru.sputnik.field.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Site
import ru.sputnik.field.data.spk.VedomostResult
import ru.sputnik.field.data.spk.buildXlsxShareIntent
import ru.sputnik.field.data.spk.exportSamplesVedomost
import ru.sputnik.field.data.spk.exportVolumesVedomost
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VedomostiScreen(onBack: () -> Unit) {
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
    var state by remember { mutableStateOf<VedoState>(VedoState.Idle) }

    val coordFormats = listOf("WGS-84 DMS", "МСК-86 зона 3", "МСК-86 зона 4")
    var coordFormat by rememberSaveable { mutableStateOf(coordFormats[0]) }

    var showSitePicker by remember { mutableStateOf(false) }
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }

    if (showSitePicker) {
        AlertDialog(
            onDismissRequest = { showSitePicker = false },
            title = { Text("Выбрать объект") },
            text = {
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    item {
                        Surface(onClick = { selectedSite = null; showSitePicker = false },
                            modifier = Modifier.fillMaxWidth()) {
                            Text("Все объекты", Modifier.padding(horizontal = 4.dp, vertical = 12.dp),
                                color = if (selectedSite == null) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurface)
                        }
                        HorizontalDivider()
                    }
                    items(sites) { s ->
                        Surface(onClick = { selectedSite = s; showSitePicker = false },
                            modifier = Modifier.fillMaxWidth()) {
                            Text(s.name, Modifier.padding(horizontal = 4.dp, vertical = 12.dp),
                                color = if (selectedSite?.id == s.id) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurface)
                        }
                        HorizontalDivider()
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showSitePicker = false }) { Text("Закрыть") } }
        )
    }

    if (showFromPicker) {
        val dpState = rememberDatePickerState(initialSelectedDateMillis = fromDate.toEpochMillis())
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = { TextButton(onClick = {
                dpState.selectedDateMillis?.toLocalDate()?.let { fromDate = it }
                showFromPicker = false
            }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { showFromPicker = false }) { Text("Отмена") } }
        ) { DatePicker(state = dpState) }
    }
    if (showToPicker) {
        val dpState = rememberDatePickerState(initialSelectedDateMillis = toDate.toEpochMillis())
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = { TextButton(onClick = {
                dpState.selectedDateMillis?.toLocalDate()?.let { toDate = it }
                showToPicker = false
            }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { showToPicker = false }) { Text("Отмена") } }
        ) { DatePicker(state = dpState) }
    }

    fun runExport(kind: VedoKind) {
        state = VedoState.Loading(kind)
        scope.launch {
            state = try {
                val res = when (kind) {
                    VedoKind.SAMPLES -> exportSamplesVedomost(
                        context, fromDate.toString(), toDate.toString(),
                        selectedSite?.id, selectedSite?.name, geologistName)
                    VedoKind.VOLUMES -> exportVolumesVedomost(
                        context, fromDate.toString(), toDate.toString(),
                        selectedSite?.id, selectedSite?.name, geologistName, coordFormat)
                }
                VedoState.Done(kind, res)
            } catch (e: Exception) {
                VedoState.Error(e.message ?: "Ошибка")
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ведомости в Excel") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        }
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (val s = state) {
                VedoState.Idle -> {
                    Icon(Icons.Default.Description, null, Modifier.size(56.dp).align(Alignment.CenterHorizontally),
                        tint = MaterialTheme.colorScheme.primary)

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

                    OutlinedButton(onClick = { showSitePicker = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(selectedSite?.name ?: "Все объекты")
                    }
                    OutlinedButton(onClick = { showFromPicker = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.CalendarToday, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("С: $fromDate")
                    }
                    OutlinedButton(onClick = { showToPicker = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.CalendarToday, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("По: $toDate")
                    }

                    Spacer(Modifier.height(8.dp))

                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("📋 Ведомость образцов", fontWeight = FontWeight.Bold)
                            Text("Список проб с глубиной, видом и грунтом",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { runExport(VedoKind.SAMPLES) },
                                modifier = Modifier.fillMaxWidth()) { Text("Сформировать") }
                        }
                    }
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("📦 Ведомость объёмов", fontWeight = FontWeight.Bold)
                            Text("Список скважин с глубиной и обсадом, бригада + борт",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                            Spacer(Modifier.height(8.dp))
                            DropdownField("Формат координат", coordFormat, coordFormats) { coordFormat = it }
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { runExport(VedoKind.VOLUMES) },
                                modifier = Modifier.fillMaxWidth()) { Text("Сформировать") }
                        }
                    }
                }

                is VedoState.Loading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            Spacer(Modifier.height(8.dp))
                            Text("Создаётся файл…")
                        }
                    }
                }

                is VedoState.Done -> {
                    Icon(Icons.Default.Description, null, Modifier.size(56.dp).align(Alignment.CenterHorizontally),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Файл готов ✓", fontWeight = FontWeight.Bold,
                        modifier = Modifier.align(Alignment.CenterHorizontally))
                    Text("${s.result.rowCount} ${if (s.kind == VedoKind.SAMPLES) "проб" else "скважин"}",
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .7f))
                    Text("Файл: ${s.result.fileName}", fontSize = 11.sp,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f))
                    Button(
                        onClick = {
                            val intent = buildXlsxShareIntent(s.result.uri, s.result.fileName)
                            context.startActivity(android.content.Intent.createChooser(intent, "Отправить ведомость"))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Share, null); Spacer(Modifier.width(8.dp))
                        Text("Отправить")
                    }
                    OutlinedButton(onClick = { state = VedoState.Idle }, modifier = Modifier.fillMaxWidth()) {
                        Text("Назад к параметрам")
                    }
                }

                is VedoState.Error -> {
                    Text("Ошибка: ${s.message}", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { state = VedoState.Idle }, modifier = Modifier.fillMaxWidth()) {
                        Text("Повторить")
                    }
                }
            }
        }
    }
}

private enum class VedoKind { SAMPLES, VOLUMES }
private sealed interface VedoState {
    object Idle : VedoState
    data class Loading(val kind: VedoKind) : VedoState
    data class Done(val kind: VedoKind, val result: VedomostResult) : VedoState
    data class Error(val message: String) : VedoState
}

private fun LocalDate.toEpochMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
private fun Long.toLocalDate(): LocalDate =
    java.time.Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
