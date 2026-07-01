package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrigadeScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    val allWorkers by db.workers().all().collectAsState(initial = emptyList())
    val allTransport by db.transport().all().collectAsState(initial = emptyList())

    var brigadeId by remember { mutableStateOf(UUID.randomUUID().toString()) }
    var selectedWorkerIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var selectedTransport by remember { mutableStateOf<Transport?>(null) }
    var saved by remember { mutableStateOf(false) }

    var showWorkerPicker by remember { mutableStateOf(false) }
    var showTransportPicker by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val b = db.brigades().current()
        if (b != null) {
            brigadeId = b.id
            selectedWorkerIds = db.brigades().members(b.id).map { it.workerId }.toSet()
            selectedTransport = b.transportId?.let { tid -> allTransport.find { it.id == tid } }
        }
    }

    // Обновляем транспорт после загрузки списка
    LaunchedEffect(allTransport) {
        val b = db.brigades().current()
        if (b?.transportId != null && selectedTransport == null) {
            selectedTransport = allTransport.find { it.id == b.transportId }
        }
    }

    val selectedWorkers = allWorkers.filter { it.id in selectedWorkerIds }

    fun save() {
        scope.launch {
            db.brigades().insert(Brigade(brigadeId, java.time.LocalDate.now().toString(),
                selectedTransport?.id))
            db.brigades().clearMembers(brigadeId)
            selectedWorkerIds.forEach { wid ->
                db.brigades().insertMember(BrigadeMember(brigadeId, wid))
            }
            saved = true
        }
    }

    // Диалог выбора сотрудников
    if (showWorkerPicker) {
        SelectDialog(
            title = "Добавить сотрудника",
            items = allWorkers.filter { it.id !in selectedWorkerIds },
            itemLabel = { "${it.name}  •  ${it.role}" },
            onSelect = { w -> selectedWorkerIds = selectedWorkerIds + w.id; saved = false },
            onDismiss = { showWorkerPicker = false }
        )
    }

    // Диалог выбора транспорта
    if (showTransportPicker) {
        SelectDialog(
            title = "Выбрать технику",
            items = allTransport,
            itemLabel = { "${it.name}  •  ${it.type}  ${it.plate}" },
            onSelect = { t -> selectedTransport = t; saved = false },
            onDismiss = { showTransportPicker = false }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Бригада") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    Button(onClick = ::save, modifier = Modifier.padding(end = 8.dp)) {
                        Icon(Icons.Default.Save, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Сохранить")
                    }
                }
            )
        }
    ) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp)) {
            // Статус сохранения
            if (saved) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    ) {
                        Text("✓ Бригада сохранена", Modifier.padding(12.dp),
                            color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
            }

            // ── Транспорт ────────────────────────────────────────
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("Техника", fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { showTransportPicker = true }) {
                        Icon(Icons.Default.Add, "Выбрать технику",
                            tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            if (allTransport.isEmpty()) {
                item {
                    Text("Нет техники — импортируйте refs.json",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                }
            } else if (selectedTransport == null) {
                item {
                    OutlinedButton(
                        onClick = { showTransportPicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Add, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Выбрать технику")
                    }
                }
            } else {
                item {
                    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
                        ListItem(
                            headlineContent = {
                                Text(selectedTransport!!.name, fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Text("${selectedTransport!!.type}  ${selectedTransport!!.plate}")
                            },
                            trailingContent = {
                                IconButton(onClick = {
                                    selectedTransport = null; saved = false
                                }) {
                                    Icon(Icons.Default.Close, null,
                                        tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        )
                    }
                }
            }

            // ── Состав бригады ───────────────────────────────────
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("Состав (${selectedWorkers.size} чел.)",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { showWorkerPicker = true }) {
                        Icon(Icons.Default.PersonAdd, "Добавить сотрудника",
                            tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            if (allWorkers.isEmpty()) {
                item {
                    Text("Нет сотрудников — импортируйте refs.json",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                }
            }

            if (selectedWorkers.isEmpty() && allWorkers.isNotEmpty()) {
                item {
                    OutlinedButton(
                        onClick = { showWorkerPicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.PersonAdd, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Добавить сотрудника")
                    }
                }
            }

            items(selectedWorkers, key = { it.id }) { w ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    ListItem(
                        leadingContent = {
                            Icon(Icons.Default.Person, null,
                                tint = MaterialTheme.colorScheme.primary)
                        },
                        headlineContent = {
                            Text(w.name, fontWeight = FontWeight.SemiBold)
                        },
                        supportingContent = { Text(w.role) },
                        trailingContent = {
                            IconButton(onClick = {
                                selectedWorkerIds = selectedWorkerIds - w.id; saved = false
                            }) {
                                Icon(Icons.Default.Close, null,
                                    tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    )
                }
            }

            item { Spacer(Modifier.height(80.dp)) }
        }
    }
}

// ── Универсальный диалог выбора с поиском ────────────────────

@Composable
private fun <T> SelectDialog(
    title: String,
    items: List<T>,
    itemLabel: (T) -> String,
    onSelect: (T) -> Unit,
    onDismiss: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    val filtered = items.filter { itemLabel(it).contains(query, ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    placeholder = { Text("Поиск...") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(8.dp))
                if (filtered.isEmpty()) {
                    Box(Modifier.fillMaxWidth().padding(16.dp), Alignment.Center) {
                        Text("Ничего не найдено",
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                    }
                } else {
                    LazyColumn(Modifier.heightIn(max = 320.dp)) {
                        items(filtered) { item ->
                            Surface(
                                onClick = { onSelect(item); onDismiss() },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(itemLabel(item),
                                    Modifier.padding(horizontal = 4.dp, vertical = 12.dp))
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Отмена") }
        }
    )
}
