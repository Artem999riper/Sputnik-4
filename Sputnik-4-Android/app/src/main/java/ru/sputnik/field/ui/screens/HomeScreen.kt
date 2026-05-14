package ru.sputnik.field.ui.screens

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.repo.Repositories
import ru.sputnik.field.ui.components.ConfirmDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onImportRefs: () -> Unit,
    onBrigade: () -> Unit,
    onSites: () -> Unit,
    onExport: () -> Unit,
    onVedomosti: () -> Unit = {},
    onSummary: () -> Unit = {}
) {
    val boreholeRepo = remember { Repositories.borehole }
    val sitesRepo = remember { Repositories.sites }
    val refsRepo = remember { Repositories.refs }
    val scope = rememberCoroutineScope()
    var showResetDialog by remember { mutableStateOf(false) }
    var showValidation by remember { mutableStateOf(false) }
    var validationIssues by remember {
        mutableStateOf<List<ru.sputnik.field.data.repo.ValidationIssue>>(emptyList())
    }

    val activity = LocalContext.current as? Activity
    BackHandler { activity?.finish() }

    LaunchedEffect(Unit) {
        validationIssues = boreholeRepo.loadValidationIssues()
    }

    if (showResetDialog) {
        ConfirmDialog(
            title = "Сбросить все данные?",
            message = "Будут удалены все скважины, справочники, бригада и настройки. Это действие нельзя отменить.",
            confirmLabel = "Сбросить",
            onDismiss = { showResetDialog = false },
            onConfirm = {
                showResetDialog = false
                scope.launch {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                        refsRepo.clearWorkers()
                        refsRepo.clearTransport()
                        sitesRepo.clearSites()
                        sitesRepo.clearKml()
                        boreholeRepo.deleteAll()
                    }
                }
            }
        )
    }

    if (showValidation && validationIssues.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { showValidation = false },
            title = { Text("Незаполненные данные") },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    validationIssues.forEach { vi ->
                        Text(
                            "• ${vi.boreholeName}: ${vi.issues.joinToString(", ")}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showValidation = false }) { Text("OK") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                actions = {
                    if (validationIssues.isNotEmpty()) {
                        IconButton(onClick = { showValidation = true }) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = "Предупреждения",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            )
        }
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(pad)
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("🛰️", fontSize = 56.sp)
            Spacer(Modifier.height(8.dp))
            Text("Спутник Полевик", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text("Геологические полевые материалы",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
            Spacer(Modifier.height(36.dp))

            MenuCard("Справочники", "Импорт refs.json от оператора", Icons.Default.Download, onImportRefs)
            Spacer(Modifier.height(12.dp))
            MenuCard("Бригада", "Состав и транспорт", Icons.Default.Group, onBrigade)
            Spacer(Modifier.height(12.dp))
            MenuCard("Объекты / Скважины", "Ввод данных по скважинам", Icons.Default.Terrain, onSites)
            Spacer(Modifier.height(12.dp))
            MenuCard("Экспорт .spk", "Сформировать архив для оператора", Icons.Default.Share, onExport)
            Spacer(Modifier.height(12.dp))
            MenuCard("Ведомости в Excel", "Образцы и объёмы", Icons.Default.Description, onVedomosti)
            Spacer(Modifier.height(12.dp))
            MenuCard("Сводка", "Объёмы и текстовый отчёт за период", Icons.Default.Assessment, onSummary)
            Spacer(Modifier.height(24.dp))
            OutlinedButton(
                onClick = { showResetDialog = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Icon(Icons.Default.DeleteForever, null, Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Сбросить все данные", fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun MenuCard(title: String, subtitle: String, icon: ImageVector, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(subtitle, fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f))
            }
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.ChevronRight, null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = .3f))
        }
    }
}
