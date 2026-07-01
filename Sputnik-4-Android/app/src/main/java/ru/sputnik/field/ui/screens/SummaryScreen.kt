package ru.sputnik.field.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Site
import ru.sputnik.field.data.model.Volume
import ru.sputnik.field.data.model.VolumeKind
import ru.sputnik.field.data.summary.generateSummary
import java.time.LocalDate
import java.time.ZoneOffset

private sealed interface SummaryState {
    object Idle : SummaryState
    object Loading : SummaryState
    data class Result(val text: String) : SummaryState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummaryScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    val today = LocalDate.now()
    val weekAgo = today.minusDays(7)

    val sites by db.sites().all().collectAsState(initial = emptyList())

    var selectedSite by remember { mutableStateOf<Site?>(null) }
    var fromDate by remember { mutableStateOf(weekAgo) }
    var toDate by remember { mutableStateOf(today) }
    var summaryState by remember { mutableStateOf<SummaryState>(SummaryState.Idle) }

    var showSitePicker by remember { mutableStateOf(false) }
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }
    var showVolumePicker by remember { mutableStateOf(false) }

    // Date picker dialogs
    if (showFromPicker) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = fromDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        fromDate = java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    showFromPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showFromPicker = false }) { Text("Отмена") } }
        ) { DatePicker(state = state) }
    }

    if (showToPicker) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = toDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        toDate = java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    showToPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showToPicker = false }) { Text("Отмена") } }
        ) { DatePicker(state = state) }
    }

    if (showSitePicker) {
        AlertDialog(
            onDismissRequest = { showSitePicker = false },
            title = { Text("Выберите объект") },
            text = {
                Column {
                    TextButton(
                        onClick = { selectedSite = null; showSitePicker = false },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Все объекты") }
                    sites.forEach { site ->
                        TextButton(
                            onClick = { selectedSite = site; showSitePicker = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(site.name) }
                    }
                }
            },
            confirmButton = {}
        )
    }

    if (showVolumePicker) {
        VolumeVolumeDialog(
            db = db,
            siteId = selectedSite?.id,
            onDismiss = { showVolumePicker = false }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Сводка") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        }
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // ── Параметры ────────────────────────────────────────
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Параметры", fontWeight = FontWeight.Bold, fontSize = 15.sp)

                    OutlinedButton(
                        onClick = { showSitePicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(selectedSite?.name ?: "Все объекты")
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { showFromPicker = true },
                            modifier = Modifier.weight(1f)
                        ) { Text("С: $fromDate") }
                        OutlinedButton(
                            onClick = { showToPicker = true },
                            modifier = Modifier.weight(1f)
                        ) { Text("По: $toDate") }
                    }
                }
            }

            // ── Кнопки действий ─────────────────────────────────
            OutlinedButton(
                onClick = { showVolumePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Задать общий объём (план)")
            }

            Button(
                onClick = {
                    summaryState = SummaryState.Loading
                    scope.launch {
                        val text = generateSummary(db, selectedSite?.id, fromDate.toString(), toDate.toString())
                        summaryState = SummaryState.Result(text)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = summaryState !is SummaryState.Loading
            ) {
                if (summaryState is SummaryState.Loading) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary)
                    Spacer(Modifier.width(8.dp))
                }
                Text("Сформировать сводку")
            }

            // ── Результат ────────────────────────────────────────
            if (summaryState is SummaryState.Result) {
                val text = (summaryState as SummaryState.Result).text
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            IconButton(onClick = {
                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cm.setPrimaryClip(ClipData.newPlainText("Сводка", text))
                            }) {
                                Icon(Icons.Default.ContentCopy, "Скопировать",
                                    tint = MaterialTheme.colorScheme.primary)
                            }
                            IconButton(onClick = {
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, text)
                                }
                                context.startActivity(Intent.createChooser(intent, "Поделиться сводкой"))
                            }) {
                                Icon(Icons.Default.Share, "Поделиться",
                                    tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        HorizontalDivider()
                        SelectionContainer {
                            Text(
                                text = text,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolumeVolumeDialog(
    db: AppDatabase,
    siteId: String?,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var volumes by remember { mutableStateOf<List<Volume>>(emptyList()) }
    var editingVolume by remember { mutableStateOf<Volume?>(null) }
    var inputText by remember { mutableStateOf("") }

    LaunchedEffect(siteId) {
        volumes = if (siteId != null) db.volumes().bySiteOnce(siteId) else db.volumes().all()
    }

    if (editingVolume != null) {
        val vol = editingVolume!!
        AlertDialog(
            onDismissRequest = { editingVolume = null },
            title = { Text(vol.name) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${VolumeKind.label(vol.kind)} · текущий план: ${
                        if (vol.totalVolume > 0) "${vol.totalVolume} ${VolumeKind.unitLabel(vol.kind)}" else "не задан"
                    }")
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        label = { Text("Объём (${VolumeKind.unitLabel(vol.kind)})") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val v = inputText.replace(',', '.').toDoubleOrNull()
                    if (v != null) {
                        scope.launch {
                            db.volumes().upsert(vol.copy(totalVolume = v))
                            volumes = if (siteId != null) db.volumes().bySiteOnce(siteId) else db.volumes().all()
                        }
                    }
                    editingVolume = null
                    inputText = ""
                }) { Text("Сохранить") }
            },
            dismissButton = {
                TextButton(onClick = { editingVolume = null; inputText = "" }) { Text("Отмена") }
            }
        )
        return
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Общий объём (план)") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (volumes.isEmpty()) {
                    Text("Нет видов работ", color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                } else {
                    volumes.forEach { vol ->
                        Surface(
                            onClick = {
                                inputText = if (vol.totalVolume > 0) vol.totalVolume.toString() else ""
                                editingVolume = vol
                            },
                            shape = MaterialTheme.shapes.small,
                            tonalElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(vol.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(VolumeKind.label(vol.kind), fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                                }
                                Text(
                                    if (vol.totalVolume > 0) "${vol.totalVolume} ${VolumeKind.unitLabel(vol.kind)}"
                                    else "—",
                                    fontSize = 13.sp,
                                    color = if (vol.totalVolume > 0)
                                        MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurface.copy(alpha = .4f)
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } }
    )
}
