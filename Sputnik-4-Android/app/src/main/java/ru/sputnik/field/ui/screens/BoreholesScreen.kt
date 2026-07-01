package ru.sputnik.field.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.kml.importKmlAsBoreholes
import ru.sputnik.field.data.model.Borehole
import ru.sputnik.field.data.model.Volume
import ru.sputnik.field.ui.components.ConfirmDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoreholesScreen(
    volumeId: String,
    onBack: () -> Unit,
    onBorehole: (String) -> Unit,
    onAdd: () -> Unit,
    onNavigateToBrigade: () -> Unit
) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    var volume by remember { mutableStateOf<Volume?>(null) }
    LaunchedEffect(volumeId) { volume = db.volumes().byId(volumeId) }
    val siteId = volume?.siteId ?: ""

    val boreholes by db.boreholes().byVolume(volumeId).collectAsState(initial = emptyList())
    val title = volume?.name ?: "Скважины"

    var searchActive by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    val searchFocusRequester = remember { FocusRequester() }

    val filtered = if (searchQuery.isBlank()) boreholes
        else boreholes.filter { it.name.contains(searchQuery, ignoreCase = true) }

    val drafts = filtered.filter { it.status != "done" }
    val done = filtered.filter { it.status == "done" }
    val allDrafts = boreholes.filter { it.status != "done" }
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val displayList = if (selectedTab == 0) drafts else done

    var kmlStatus by remember { mutableStateOf<String?>(null) }
    var kmlLoading by remember { mutableStateOf(false) }
    var showClearDraftsDialog by remember { mutableStateOf(false) }
    var showNoBrigadeDialog by remember { mutableStateOf(false) }
    var hasBrigade by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) { hasBrigade = db.brigades().current() != null }

    if (showNoBrigadeDialog) {
        ConfirmDialog(
            title = "Сначала задайте бригаду",
            message = "Нельзя начать заполнение скважины пока не выбраны участники бригады и техника. Это нужно чтобы при завершении скважина зафиксировала состав исполнителей.",
            confirmLabel = "Перейти к бригаде",
            destructive = false,
            onDismiss = { showNoBrigadeDialog = false },
            onConfirm = { showNoBrigadeDialog = false; onNavigateToBrigade() }
        )
    }

    if (showClearDraftsDialog) {
        ConfirmDialog(
            title = "Удалить все черновики?",
            message = "Все ${allDrafts.size} черновиков по этому виду работ будут удалены безвозвратно.",
            confirmLabel = "Удалить все",
            onDismiss = { showClearDraftsDialog = false },
            onConfirm = {
                showClearDraftsDialog = false
                scope.launch {
                    withContext(kotlinx.coroutines.NonCancellable) {
                        allDrafts.forEach { db.boreholes().delete(it) }
                    }
                }
            }
        )
    }

    val kmlPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        if (siteId.isBlank()) return@rememberLauncherForActivityResult
        kmlLoading = true
        scope.launch {
            try {
                val result = importKmlAsBoreholes(context, uri, siteId, volumeId)
                kmlStatus = "✓ Добавлено ${result.added} скважин, пропущено ${result.skipped}"
            } catch (e: Exception) {
                kmlStatus = "Ошибка: ${e.message}"
            }
            kmlLoading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (searchActive) {
                        BasicTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            singleLine = true,
                            textStyle = TextStyle(
                                color = MaterialTheme.colorScheme.onSurface,
                                fontSize = 18.sp
                            ),
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(searchFocusRequester),
                            decorationBox = { inner ->
                                if (searchQuery.isEmpty()) {
                                    Text("Поиск скважин…",
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f),
                                        fontSize = 18.sp)
                                }
                                inner()
                            }
                        )
                        LaunchedEffect(Unit) { searchFocusRequester.requestFocus() }
                    } else {
                        Text(title, maxLines = 1)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (searchActive) {
                            searchActive = false
                            searchQuery = ""
                        } else {
                            onBack()
                        }
                    }) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    if (kmlLoading) {
                        CircularProgressIndicator(Modifier.size(24.dp).padding(end = 8.dp),
                            strokeWidth = 2.dp)
                    } else {
                        if (!searchActive) {
                            IconButton(onClick = { searchActive = true }) {
                                Icon(Icons.Default.Search, "Поиск")
                            }
                            if (selectedTab == 0 && allDrafts.isNotEmpty()) {
                                IconButton(onClick = { showClearDraftsDialog = true }) {
                                    Icon(Icons.Default.DeleteSweep, "Очистить черновики",
                                        tint = MaterialTheme.colorScheme.error)
                                }
                            }
                            IconButton(onClick = { kmlPicker.launch(arrayOf("application/vnd.google-earth.kml+xml", "*/*")) }) {
                                Icon(Icons.Default.Map, "Импорт KML")
                            }
                        } else if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Close, "Очистить поиск")
                            }
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                if (hasBrigade == false) showNoBrigadeDialog = true else onAdd()
            }) {
                Icon(Icons.Default.Add, "Добавить скважину")
            }
        }
    ) { pad ->
        Column(Modifier.padding(pad)) {
            // Статус KML-импорта
            kmlStatus?.let { msg ->
                val isErr = msg.startsWith("Ошибка")
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isErr)
                            MaterialTheme.colorScheme.errorContainer
                        else
                            MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Row(
                        Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(msg, Modifier.weight(1f),
                            color = if (isErr) MaterialTheme.colorScheme.onErrorContainer
                                    else MaterialTheme.colorScheme.onPrimaryContainer,
                            style = MaterialTheme.typography.bodySmall)
                        IconButton(onClick = { kmlStatus = null }, Modifier.size(20.dp)) {
                            Icon(Icons.Default.Close, null, Modifier.size(14.dp))
                        }
                    }
                }
            }

            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Черновики (${boreholes.count { it.status != "done" }})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Выполненные (${boreholes.count { it.status == "done" }})") }
                )
            }

            if (boreholes.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("🕳️", style = MaterialTheme.typography.displayMedium)
                        Text("Нет скважин",
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                        Text("Нажмите 🗺 чтобы загрузить KML\nили + чтобы добавить вручную",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                    }
                }
            } else if (displayList.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        when {
                            searchQuery.isNotBlank() -> "Ничего не найдено"
                            selectedTab == 0 -> "Все скважины выполнены"
                            else -> "Нет выполненных скважин"
                        },
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f)
                    )
                }
            } else {
                var deleteConfirmBh by remember { mutableStateOf<Borehole?>(null) }
                deleteConfirmBh?.let { bh ->
                    ConfirmDialog(
                        title = "Удалить скважину?",
                        message = "«${bh.name.ifEmpty { "Скв-${bh.uuid.take(6)}" }}» будет удалена безвозвратно.",
                        onDismiss = { deleteConfirmBh = null },
                        onConfirm = {
                            deleteConfirmBh = null
                            scope.launch { withContext(kotlinx.coroutines.NonCancellable) { db.boreholes().delete(bh) } }
                        }
                    )
                }
                LazyColumn {
                    items(displayList, key = { it.uuid }) { bh ->
                        BoreholeItem(
                            bh,
                            onClick = { onBorehole(bh.uuid) },
                            onDelete = { deleteConfirmBh = bh }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BoreholeItem(bh: Borehole, onClick: () -> Unit, onDelete: (() -> Unit)? = null) {
    val isDone = bh.status == "done"
    Surface(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        ListItem(
            leadingContent = {
                Box(
                    Modifier.size(10.dp).background(
                        if (isDone) Color(0xFF0E9F6E) else Color(0xFFF59E0B),
                        CircleShape
                    )
                )
            },
            headlineContent = {
                Text(
                    bh.name.ifEmpty { "Скв-${bh.uuid.take(6)}" },
                    fontWeight = FontWeight.SemiBold
                )
            },
            supportingContent = {
                val info = buildString {
                    if (bh.plannedDepthM > 0) append("${bh.plannedDepthM} м")
                    if (bh.drillDate.isNotEmpty()) {
                        if (isNotEmpty()) append(" · ")
                        append(bh.drillDate)
                    }
                    if (bh.manualLat != null) {
                        if (isNotEmpty()) append(" · ")
                        append("📍")
                    }
                }
                if (info.isNotEmpty()) Text(info)
            },
            trailingContent = {
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Badge(
                        containerColor = if (isDone) Color(0xFF0E9F6E) else Color(0xFFF59E0B)
                    ) { Text(if (isDone) "Готово" else "Черновик") }
                    if (onDelete != null) {
                        IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Delete, "Удалить", tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp))
                        }
                    } else {
                        Icon(Icons.Default.ChevronRight, null)
                    }
                }
            }
        )
    }
}
