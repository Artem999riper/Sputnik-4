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

    val workers by db.workers().all().collectAsState(initial = emptyList())
    val transport by db.transport().all().collectAsState(initial = emptyList())

    var currentBrigade by remember { mutableStateOf<Brigade?>(null) }
    var memberIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var selectedTransport by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val b = db.brigades().current()
        currentBrigade = b
        if (b != null) {
            memberIds = db.brigades().members(b.id).map { it.workerId }.toSet()
            selectedTransport = b.transportId
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Бригада") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = {
                    TextButton(onClick = {
                        scope.launch {
                            val brigadeId = currentBrigade?.id ?: UUID.randomUUID().toString()
                            val brigade = Brigade(
                                id = brigadeId,
                                createdAt = java.time.LocalDate.now().toString(),
                                transportId = selectedTransport
                            )
                            db.brigades().insert(brigade)
                            db.brigades().clearMembers(brigadeId)
                            memberIds.forEach { wid ->
                                db.brigades().insertMember(BrigadeMember(brigadeId, wid))
                            }
                            currentBrigade = brigade
                            saved = true
                        }
                    }) { Text("Сохранить") }
                }
            )
        }
    ) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp)) {
            if (saved) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    ) {
                        Text("✓ Бригада сохранена", Modifier.padding(12.dp),
                            color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
            }

            item {
                Text("Транспорт", fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(vertical = 10.dp))
            }
            if (transport.isEmpty()) {
                item { Text("Нет транспорта — импортируйте refs.json",
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f)) }
            } else {
                items(transport) { t ->
                    val on = selectedTransport == t.id
                    ListItem(
                        headlineContent = { Text(t.name) },
                        supportingContent = { Text("${t.type}  ${t.plate}") },
                        trailingContent = {
                            RadioButton(on, onClick = {
                                selectedTransport = if (on) null else t.id
                                saved = false
                            })
                        }
                    )
                    HorizontalDivider()
                }
            }

            item {
                Text("Состав (${memberIds.size} чел.)", fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(vertical = 10.dp))
            }
            if (workers.isEmpty()) {
                item { Text("Нет сотрудников — импортируйте refs.json",
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f)) }
            } else {
                items(workers) { w ->
                    val checked = w.id in memberIds
                    ListItem(
                        headlineContent = { Text(w.name) },
                        supportingContent = { Text(w.role) },
                        trailingContent = {
                            Checkbox(checked, onCheckedChange = { on ->
                                memberIds = if (on) memberIds + w.id else memberIds - w.id
                                saved = false
                            })
                        }
                    )
                    HorizontalDivider()
                }
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }
}
