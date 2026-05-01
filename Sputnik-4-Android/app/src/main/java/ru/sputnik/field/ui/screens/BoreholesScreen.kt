package ru.sputnik.field.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.sputnik.field.data.db.AppDatabase
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
    val sites by db.sites().all().collectAsState(initial = emptyList())
    val boreholes by db.boreholes().bySite(siteId).collectAsState(initial = emptyList())
    val siteName = sites.find { it.id == siteId }?.name ?: siteId

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(siteName, maxLines = 1) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAdd) {
                Icon(Icons.Default.Add, "Добавить скважину")
            }
        }
    ) { pad ->
        if (boreholes.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("🕳️", style = MaterialTheme.typography.displayMedium)
                    Text("Нет скважин", color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                    Text("Нажмите + чтобы добавить",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad)) {
                items(boreholes, key = { it.uuid }) { bh ->
                    BoreholeItem(bh, onClick = { onBorehole(bh.uuid) })
                    HorizontalDivider()
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
                    Modifier
                        .size(10.dp)
                        .background(if (isDone) Color(0xFF0E9F6E) else Color(0xFFF59E0B), CircleShape)
                )
            },
            headlineContent = {
                Text(bh.name.ifEmpty { "Скв-${bh.uuid.take(6)}" }, fontWeight = FontWeight.SemiBold)
            },
            supportingContent = {
                Text("${bh.workType.lowercase().replaceFirstChar { it.uppercase() }} · ${bh.plannedDepthM} м · ${bh.drillDate.ifEmpty { "Дата не указана" }}")
            },
            trailingContent = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (isDone) {
                        Badge(containerColor = Color(0xFF0E9F6E)) { Text("Готово") }
                    } else {
                        Badge(containerColor = Color(0xFFF59E0B)) { Text("Черновик") }
                    }
                    Icon(Icons.Default.ChevronRight, null)
                }
            }
        )
    }
}
