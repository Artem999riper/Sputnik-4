package ru.sputnik.field.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.kml.importKmlAsTaskPoints
import ru.sputnik.field.data.model.TaskPoint
import ru.sputnik.field.data.model.Volume
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskPointsScreen(
    volumeId: String,
    onBack: () -> Unit,
    onNavigateToBrigade: () -> Unit
) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    var volume by remember { mutableStateOf<Volume?>(null) }
    LaunchedEffect(volumeId) { volume = db.volumes().byId(volumeId) }
    val siteId = volume?.siteId ?: ""
    val title = volume?.name ?: "Точки"

    val points by db.taskPoints().byVolume(volumeId).collectAsState(initial = emptyList())

    var hasBrigade by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) { hasBrigade = db.brigades().current() != null }

    var kmlStatus by remember { mutableStateOf<String?>(null) }
    var kmlLoading by remember { mutableStateOf(false) }
    var showNoBrigadeDialog by remember { mutableStateOf(false) }
    var datePickerFor by remember { mutableStateOf<TaskPoint?>(null) }
    var filterTab by rememberSaveable { mutableIntStateOf(0) }   // 0=Все, 1=Невыполненные, 2=Выполненные

    val notDone = points.filter { it.completedDate.isBlank() }
    val done = points.filter { it.completedDate.isNotBlank() }
    val displayList = when (filterTab) { 1 -> notDone; 2 -> done; else -> points }

    val kmlPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null || siteId.isBlank()) return@rememberLauncherForActivityResult
        kmlLoading = true
        scope.launch {
            try {
                val res = importKmlAsTaskPoints(context, uri, siteId, volumeId)
                kmlStatus = "✓ Добавлено ${res.added}, пропущено ${res.skipped}"
            } catch (e: Exception) {
                kmlStatus = "Ошибка: ${e.message}"
            }
            kmlLoading = false
        }
    }

    if (showNoBrigadeDialog) {
        AlertDialog(
            onDismissRequest = { showNoBrigadeDialog = false },
            title = { Text("Сначала задайте бригаду") },
            text = { Text("Чтобы зафиксировать выполнение точки, нужно выбрать состав бригады и технику.") },
            confirmButton = {
                TextButton(onClick = { showNoBrigadeDialog = false; onNavigateToBrigade() }) { Text("Перейти к бригаде") }
            },
            dismissButton = { TextButton(onClick = { showNoBrigadeDialog = false }) { Text("Отмена") } }
        )
    }

    datePickerFor?.let { tp ->
        val initial = runCatching { LocalDate.parse(tp.completedDate) }.getOrNull() ?: LocalDate.now()
        val state = rememberDatePickerState(initialSelectedDateMillis =
            initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { datePickerFor = null },
            confirmButton = {
                TextButton(onClick = {
                    val newDate = state.selectedDateMillis?.let {
                        java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    } ?: tp.completedDate
                    val target = tp
                    datePickerFor = null
                    scope.launch {
                        withContext(NonCancellable) {
                            db.taskPoints().upsert(target.copy(completedDate = newDate))
                        }
                    }
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { datePickerFor = null }) { Text("Отмена") } }
        ) { DatePicker(state = state) }
    }

    suspend fun captureSnapshot(): String {
        val brigade = db.brigades().current() ?: return ""
        val memberIds = db.brigades().members(brigade.id).map { it.workerId }
        val memberNames = db.workers().byIds(memberIds).map { it.name }
        val transport = brigade.transportId?.let { db.transport().byId(it) }
        val transportLabel = transport?.let {
            if (it.plate.isNotBlank()) "${it.name} ${it.plate}" else it.name
        } ?: ""
        return buildBrigadeSnapshotJson(memberIds, memberNames, brigade.transportId, transportLabel)
    }

    fun toggleDone(tp: TaskPoint) {
        if (tp.completedDate.isBlank()) {
            if (hasBrigade == false) { showNoBrigadeDialog = true; return }
            scope.launch {
                withContext(NonCancellable) {
                    val snap = captureSnapshot()
                    db.taskPoints().upsert(tp.copy(
                        completedDate = LocalDate.now().toString(),
                        brigadeSnapshot = snap
                    ))
                }
            }
        } else {
            scope.launch {
                withContext(NonCancellable) {
                    db.taskPoints().upsert(tp.copy(completedDate = "", brigadeSnapshot = ""))
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = {
                    if (kmlLoading) {
                        CircularProgressIndicator(Modifier.size(24.dp).padding(end = 8.dp), strokeWidth = 2.dp)
                    } else {
                        IconButton(onClick = { kmlPicker.launch(arrayOf("application/vnd.google-earth.kml+xml", "*/*")) }) {
                            Icon(Icons.Default.Map, "Импорт KML")
                        }
                    }
                }
            )
        }
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            kmlStatus?.let { msg ->
                val isErr = msg.startsWith("Ошибка")
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isErr) MaterialTheme.colorScheme.errorContainer
                                         else MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(msg, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall,
                            color = if (isErr) MaterialTheme.colorScheme.onErrorContainer
                                    else MaterialTheme.colorScheme.onPrimaryContainer)
                        TextButton(onClick = { kmlStatus = null }) { Text("OK") }
                    }
                }
            }

            TabRow(selectedTabIndex = filterTab) {
                Tab(selected = filterTab == 0, onClick = { filterTab = 0 },
                    text = { Text("Все (${points.size})") })
                Tab(selected = filterTab == 1, onClick = { filterTab = 1 },
                    text = { Text("Невыполн. (${notDone.size})") })
                Tab(selected = filterTab == 2, onClick = { filterTab = 2 },
                    text = { Text("Готово (${done.size})") })
            }

            if (points.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("📍", style = MaterialTheme.typography.displayMedium)
                        Text("Нет точек", color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f))
                        Text("Нажмите 🗺 чтобы загрузить KML",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                    }
                }
            } else if (displayList.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        when (filterTab) { 1 -> "Все точки выполнены"; 2 -> "Нет выполненных точек"; else -> "—" },
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f)
                    )
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(displayList, key = { it.uuid }) { tp ->
                        TaskPointItem(tp, onToggle = { toggleDone(tp) }, onEditDate = { datePickerFor = tp })
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskPointItem(
    tp: TaskPoint,
    onToggle: () -> Unit,
    onEditDate: () -> Unit
) {
    val isDone = tp.completedDate.isNotBlank()
    val container = if (isDone) Color(0xFFD1FAE5) else MaterialTheme.colorScheme.surface
    Surface(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = container,
        tonalElevation = if (isDone) 0.dp else 1.dp
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                Modifier.size(28.dp).background(
                    if (isDone) Color(0xFF0E9F6E) else Color(0xFFD1D5DB),
                    CircleShape
                ),
                contentAlignment = Alignment.Center
            ) {
                if (isDone) Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(tp.name.ifEmpty { "Точка-${tp.uuid.take(6)}" }, fontWeight = FontWeight.SemiBold)
                val sub = buildString {
                    if (isDone) append(tp.completedDate)
                    else if (tp.lat != null && tp.lng != null) append("%.5f, %.5f".format(tp.lat, tp.lng))
                    if (tp.notes.isNotBlank()) {
                        if (isNotEmpty()) append(" · ")
                        append(tp.notes)
                    }
                }
                if (sub.isNotEmpty()) Text(sub, fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .7f))
            }
            if (isDone) {
                IconButton(onClick = onEditDate, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Edit, "Изменить дату",
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
