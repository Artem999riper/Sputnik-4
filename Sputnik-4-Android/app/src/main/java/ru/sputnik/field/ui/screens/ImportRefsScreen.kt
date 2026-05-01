package ru.sputnik.field.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.sputnik.field.data.spk.ImportResult
import ru.sputnik.field.data.spk.importRefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportRefsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<ImportState>(ImportState.Idle) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        state = ImportState.Loading
        scope.launch {
            state = try {
                val result = importRefs(context, uri)
                ImportState.Done(result)
            } catch (e: Exception) {
                ImportState.Error(e.message ?: "Ошибка")
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Импорт справочников") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, null)
                    }
                }
            )
        }
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically)
        ) {
            when (val s = state) {
                ImportState.Idle -> {
                    Icon(Icons.Default.Download, null,
                        modifier = Modifier.size(72.dp),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Импорт refs.json", fontWeight = FontWeight.Bold)
                    Text(
                        "Получите файл refs.json от оператора Sputnik-4 " +
                        "(кнопка «Экспорт справочников») и откройте его здесь.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f)
                    )
                    Button(onClick = { picker.launch(arrayOf("application/json", "*/*")) }) {
                        Text("Открыть refs.json")
                    }
                }
                ImportState.Loading -> CircularProgressIndicator()
                is ImportState.Done -> {
                    Icon(Icons.Default.Download, null,
                        modifier = Modifier.size(72.dp),
                        tint = MaterialTheme.colorScheme.primary)
                    Text("Справочники загружены ✓", fontWeight = FontWeight.Bold)
                    ResultRow("Сотрудников", s.result.workers)
                    ResultRow("Транспорт", s.result.transport)
                    ResultRow("Объекты", s.result.sites)
                    ResultRow("KML-точки скважин", s.result.kmlPoints)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onBack) { Text("Готово") }
                }
                is ImportState.Error -> {
                    Text("Ошибка: ${s.message}", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { state = ImportState.Idle }) { Text("Повторить") }
                }
            }
        }
    }
}

@Composable
private fun ResultRow(label: String, count: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .7f))
        Text("$count", fontWeight = FontWeight.Bold)
    }
}

private sealed interface ImportState {
    object Idle : ImportState
    object Loading : ImportState
    data class Done(val result: ImportResult) : ImportState
    data class Error(val message: String) : ImportState
}
