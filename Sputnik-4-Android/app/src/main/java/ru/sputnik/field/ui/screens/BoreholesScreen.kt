package ru.sputnik.field.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.kml.importKmlForSite
import ru.sputnik.field.data.model.Borehole

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoreholesScreen(
    siteId: String,
    onBack: () -> Unit,
    onBorehole: (String) -> Unit,
    onAdd: () -> Unit
) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    val sites by db.sites().all().collectAsState(initial = emptyList())
    val boreholes by db.boreholes().bySite(siteId).collectAsState(initial = emptyList())
    val siteName = sites.find { it.id == siteId }?.name ?: siteId

    var kmlStatus by remember { mutableStateOf<String?>(null) }
    var kmlLoading by remember { mutableStateOf(false) }

    val kmlPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        kmlLoading = true
        scope.launch {
            try {
                val result = importKmlForSite(context, uri, siteId)
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
                title = { Text(siteName, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    if (kmlLoading) {
                        CircularProgressIndicator(Modifier.size(24.dp).padding(end = 8.dp),
                            strokeWidth = 2.dp)
                    } else {
                        IconButton(onClick = { kmlPicker.launch(arrayOf("application/vnd.google-earth.kml+xml", "*/*")) }) {
                            Icon(Icons.Default.Map, "Импорт KML")
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAdd) {
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
            } else {
                LazyColumn {
                    items(boreholes, key = { it.uuid }) { bh ->
                        BoreholeItem(bh, onClick = { onBorehole(bh.uuid) })
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BoreholeItem(bh: Borehole, onClick: () -> Unit) {
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
                    Icon(Icons.Default.ChevronRight, null)
                }
            }
        )
    }
}
