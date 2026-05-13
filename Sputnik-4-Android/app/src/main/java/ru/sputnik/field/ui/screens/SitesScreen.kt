package ru.sputnik.field.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Terrain
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.Site

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SitesScreen(onBack: () -> Unit, onSiteClick: (String) -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val sites by db.sites().all().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()

    var deleteConfirm by remember { mutableStateOf<Site?>(null) }

    deleteConfirm?.let { site ->
        AlertDialog(
            onDismissRequest = { deleteConfirm = null },
            title = { Text("Удалить объект?") },
            text = { Text("«${site.name}» и все связанные виды работ, скважины и КМЛ-точки будут удалены безвозвратно.") },
            confirmButton = {
                TextButton(onClick = {
                    val s = site
                    deleteConfirm = null
                    scope.launch {
                        db.kmlPoints().deleteBySite(s.id)
                        db.sites().delete(s)
                    }
                }) { Text("Удалить", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { deleteConfirm = null }) { Text("Отмена") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Объекты") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        }
    ) { pad ->
        if (sites.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Terrain, null, Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = .25f))
                    Text("Нет объектов", color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                    Text("Импортируйте refs.json",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad)) {
                items(sites, key = { it.id }) { site ->
                    ListItem(
                        modifier = Modifier.fillMaxWidth().clickable { onSiteClick(site.id) },
                        headlineContent = { Text(site.name, fontWeight = FontWeight.SemiBold) },
                        supportingContent = {
                            if (site.lat != null && site.lng != null)
                                Text("%.5f, %.5f".format(site.lat, site.lng))
                        },
                        trailingContent = {
                            IconButton(onClick = { deleteConfirm = site }) {
                                Icon(Icons.Default.Delete, "Удалить",
                                    tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}
