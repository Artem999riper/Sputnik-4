package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.spk.ExportResult
import ru.sputnik.field.data.spk.buildShareIntent
import ru.sputnik.field.data.spk.exportSpk

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExportScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val today = java.time.LocalDate.now().toString()
    val weekAgo = java.time.LocalDate.now().minusDays(7).toString()

    var fromDate by remember { mutableStateOf(weekAgo) }
    var toDate by remember { mutableStateOf(today) }
    var state by remember { mutableStateOf<ExportState>(ExportState.Idle) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Экспорт .spk") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }
            )
        }
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when (val s = state) {
                ExportState.Idle -> {
                    Icon(Icons.Default.Share, null, Modifier.size(72.dp),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Выберите период", fontWeight = FontWeight.Bold)
                    Text("Будут экспортированы все скважины, пробуренные в этом диапазоне дат.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                    FieldInput("Начало (ГГГГ-ММ-ДД)", fromDate, { fromDate = it })
                    FieldInput("Конец (ГГГГ-ММ-ДД)", toDate, { toDate = it })
                    Button(
                        onClick = {
                            state = ExportState.Loading
                            scope.launch {
                                state = try {
                                    ExportState.Done(exportSpk(context, fromDate, toDate))
                                } catch (e: Exception) {
                                    ExportState.Error(e.message ?: "Ошибка")
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Сформировать архив") }
                }
                ExportState.Loading -> {
                    CircularProgressIndicator()
                    Text("Создаётся .spk архив…")
                }
                is ExportState.Done -> {
                    Icon(Icons.Default.Share, null, Modifier.size(72.dp),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Архив готов ✓", fontWeight = FontWeight.Bold)
                    Text("${s.result.boreholes} скважин · ${s.result.photos} фото")
                    Button(
                        onClick = {
                            val intent = buildShareIntent(s.result.uri, "spk_${fromDate}_${toDate}.spk")
                            context.startActivity(android.content.Intent.createChooser(intent, "Отправить .spk"))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Share, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Отправить оператору")
                    }
                    OutlinedButton(onClick = { state = ExportState.Idle },
                        modifier = Modifier.fillMaxWidth()) { Text("Новый экспорт") }
                }
                is ExportState.Error -> {
                    Text("Ошибка: ${s.message}", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { state = ExportState.Idle },
                        modifier = Modifier.fillMaxWidth()) { Text("Повторить") }
                }
            }
        }
    }
}

private sealed interface ExportState {
    object Idle : ExportState
    object Loading : ExportState
    data class Done(val result: ExportResult) : ExportState
    data class Error(val message: String) : ExportState
}
