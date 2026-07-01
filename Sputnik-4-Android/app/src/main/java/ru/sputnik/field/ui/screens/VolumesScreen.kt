package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Volume
import ru.sputnik.field.data.model.VolumeKind
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VolumesScreen(
    siteId: String,
    onBack: () -> Unit,
    onOpenDrilling: (String) -> Unit,
    onOpenTaskPoints: (String) -> Unit
) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    val sites by db.sites().all().collectAsState(initial = emptyList())
    val siteName = sites.find { it.id == siteId }?.name ?: siteId
    val volumes by db.volumes().bySite(siteId).collectAsState(initial = emptyList())

    var showCreateDialog by remember { mutableStateOf(false) }
    var deleteConfirmVol by remember { mutableStateOf<Volume?>(null) }

    if (showCreateDialog) {
        CreateVolumeDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { kind, name ->
                showCreateDialog = false
                scope.launch {
                    db.volumes().upsert(Volume(
                        id = UUID.randomUUID().toString(),
                        siteId = siteId,
                        kind = kind,
                        name = name,
                        createdAt = java.time.Instant.now().toString()
                    ))
                }
            }
        )
    }

    deleteConfirmVol?.let { v ->
        AlertDialog(
            onDismissRequest = { deleteConfirmVol = null },
            title = { Text("Удалить вид работ?") },
            text = { Text("«${v.name}» и все связанные с ним точки/скважины будут удалены безвозвратно.") },
            confirmButton = {
                TextButton(onClick = {
                    val id = v.id
                    deleteConfirmVol = null
                    scope.launch { db.volumes().delete(id) }
                }) { Text("Удалить", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { deleteConfirmVol = null }) { Text("Отмена") } }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(siteName, maxLines = 1) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateDialog = true }) {
                Icon(Icons.Default.Add, "Добавить вид работ")
            }
        }
    ) { pad ->
        if (volumes.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("📋", style = MaterialTheme.typography.displayMedium)
                    Text("Нет видов работ", color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f))
                    Text("Нажмите + чтобы добавить",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                }
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(pad).padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(volumes, key = { it.id }) { v ->
                    VolumeCard(
                        v = v,
                        onClick = {
                            if (v.kind == VolumeKind.DRILLING) onOpenDrilling(v.id)
                            else onOpenTaskPoints(v.id)
                        },
                        onDelete = { deleteConfirmVol = v }
                    )
                }
            }
        }
    }
}

@Composable
private fun VolumeCard(v: Volume, onClick: () -> Unit, onDelete: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            val emoji = when (v.kind) {
                VolumeKind.DRILLING -> "⛏️"
                VolumeKind.STATIC_PROBE -> "📐"
                VolumeKind.THERMOMETRY -> "🌡️"
                else -> "📋"
            }
            Text(emoji, style = MaterialTheme.typography.headlineSmall)
            Column(Modifier.weight(1f)) {
                Text(v.name, fontWeight = FontWeight.SemiBold)
                Text(VolumeKind.label(v.kind),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
            }
            IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Delete, "Удалить",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(18.dp))
            }
            Icon(Icons.Default.ChevronRight, null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = .3f))
        }
    }
}

@Composable
private fun CreateVolumeDialog(onDismiss: () -> Unit, onCreate: (kind: String, name: String) -> Unit) {
    var kind by remember { mutableStateOf(VolumeKind.DRILLING) }
    var name by remember { mutableStateOf("") }

    val nameHint = when (kind) {
        VolumeKind.DRILLING -> "Бурение основное"
        VolumeKind.STATIC_PROBE -> "Зондирование торфа"
        VolumeKind.THERMOMETRY -> "Термометрия"
        else -> ""
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Новый вид работ") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Тип работ:", style = MaterialTheme.typography.labelMedium)
                listOf(VolumeKind.DRILLING, VolumeKind.STATIC_PROBE, VolumeKind.THERMOMETRY).forEach { k ->
                    Surface(
                        onClick = { kind = k },
                        modifier = Modifier.fillMaxWidth(),
                        color = if (k == kind) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surface
                    ) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = k == kind, onClick = { kind = k })
                            Text(VolumeKind.label(k))
                        }
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Имя") },
                    placeholder = { Text(nameHint) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = { onCreate(kind, name.trim()) }
            ) { Text("Создать") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } }
    )
}
