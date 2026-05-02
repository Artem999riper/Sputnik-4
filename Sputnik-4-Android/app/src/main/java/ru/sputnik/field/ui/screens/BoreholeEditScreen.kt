package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*
import ru.sputnik.field.ui.voice.VoiceTextField
import ru.sputnik.field.ui.voice.rememberSpeechHelper
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.util.UUID

private val WORK_TYPES = listOf(
    "SEARCH" to "Поисковая", "EXPLORATION" to "Разведочная",
    "TRENCH" to "Шурф", "GEOLOGICAL" to "Геологическая"
)
private val SOIL_TYPES = listOf(
    "Торф", "Супесь", "Суглинок", "Глина", "Песок",
    "Гравий", "Галечник", "Мерзлота", "Скала", "Прочее"
)
private val SOIL_STATES = listOf(
    "Мягкопластичный", "Тугопластичный", "Полутвёрдый", "Твёрдый",
    "Текучий", "Текучепластичный", "Плотный", "Средней плотности", "Рыхлый", "Прочее"
)
private val SAMPLE_TYPES = listOf("Монолит", "Нарушенный", "Вода", "Газ")
private val PACKAGING_TYPES = listOf(
    "Полиэтилен", "Мешок", "Коробка", "Банка", "Пакет",
    "Труба", "Контейнер", "Пробирка", "Прочее"
)

// ── Главный экран ────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoreholeEditScreen(boreholeUuid: String?, siteId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()
    val speech = rememberSpeechHelper()

    val isNew = boreholeUuid == null
    val uuid = remember { boreholeUuid ?: UUID.randomUUID().toString() }

    // Шапка
    var name by remember { mutableStateOf("") }
    var workType by remember { mutableStateOf("EXPLORATION") }
    var depthStr by remember { mutableStateOf("") }
    var diameterStr by remember { mutableStateOf("") }
    var drillDate by remember { mutableStateOf("") }
    var geomorphDesc by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var latStr by remember { mutableStateOf("") }
    var lngStr by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("draft") }

    var selectedTab by remember { mutableIntStateOf(0) }
    var showDoneDialog by remember { mutableStateOf(false) }

    val layers by db.soilLayers().byBorehole(uuid).collectAsState(initial = emptyList())
    val ugvList by db.ugv().byBorehole(uuid).collectAsState(initial = emptyList())
    val mmgList by db.mmg().byBorehole(uuid).collectAsState(initial = emptyList())
    val photos by db.photos().byBorehole(uuid).collectAsState(initial = emptyList())

    LaunchedEffect(boreholeUuid) {
        if (boreholeUuid != null) {
            db.boreholes().byUuid(boreholeUuid)?.let { bh ->
                name = bh.name; workType = bh.workType
                depthStr = bh.plannedDepthM.takeIf { it > 0 }?.toString() ?: ""
                diameterStr = bh.diameterMm.takeIf { it > 0 }?.toString() ?: ""
                drillDate = bh.drillDate; geomorphDesc = bh.geomorphDesc
                description = bh.description
                latStr = bh.manualLat?.toString() ?: ""; lngStr = bh.manualLng?.toString() ?: ""
                status = bh.status
            }
        } else {
            drillDate = java.time.LocalDate.now().toString()
        }
    }

    fun saveBorehole(then: () -> Unit = {}) {
        scope.launch {
            withContext(NonCancellable) {
                db.boreholes().insert(Borehole(
                    uuid = uuid, siteId = siteId, name = name, workType = workType,
                    plannedDepthM = depthStr.toDoubleOrNull() ?: 0.0,
                    diameterMm = diameterStr.toDoubleOrNull() ?: 0.0,
                    drillDate = drillDate, geomorphDesc = geomorphDesc, description = description,
                    manualLat = latStr.toDoubleOrNull(), manualLng = lngStr.toDoubleOrNull(),
                    status = status
                ))
            }
            then()
        }
    }

    // Диалог валидации при завершении
    if (showDoneDialog) {
        val warnings = buildList {
            if (layers.isEmpty()) add("Не добавлено ни одного слоя грунта")
            if (photos.isEmpty()) add("Нет ни одной фотографии")
            if (name.isBlank()) add("Не указано название скважины")
        }
        AlertDialog(
            onDismissRequest = { showDoneDialog = false },
            title = { Text(if (warnings.isEmpty()) "Завершить скважину?" else "Есть незаполненные поля") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (warnings.isNotEmpty()) {
                        warnings.forEach { w ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("⚠️"); Text(w)
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Text("Завершить всё равно?",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                    } else {
                        Text("Скважина будет отмечена как готова к экспорту.")
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    status = "done"
                    saveBorehole { showDoneDialog = false; onBack() }
                }) { Text("Завершить") }
            },
            dismissButton = {
                TextButton(onClick = { showDoneDialog = false }) { Text("Отмена") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isNew) "Новая скважина" else name.ifEmpty { "Скважина" }) },
                navigationIcon = {
                    IconButton(onClick = { saveBorehole(onBack) }) {
                        Icon(Icons.Default.ArrowBack, null)
                    }
                },
                actions = {
                    if (status != "done") {
                        TextButton(onClick = { saveBorehole { showDoneDialog = true } }) {
                            Text("✓ Завершить")
                        }
                    }
                    TextButton(onClick = { saveBorehole(onBack) }) { Text("Сохранить") }
                }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad)) {
            ScrollableTabRow(selectedTabIndex = selectedTab) {
                listOf(
                    "Шапка",
                    "Слои (${layers.size})",
                    "УГВ (${ugvList.size})",
                    "ММГ (${mmgList.size})",
                    "Фото (${photos.size})"
                ).forEachIndexed { i, title ->
                    Tab(i == selectedTab, onClick = { selectedTab = i },
                        text = { Text(title, maxLines = 1) })
                }
            }

            when (selectedTab) {
                0 -> HeaderTab(
                    name, workType, depthStr, diameterStr, drillDate,
                    geomorphDesc, description, latStr, lngStr,
                    onName = { name = it }, onWorkType = { workType = it },
                    onDepth = { depthStr = it }, onDiameter = { diameterStr = it },
                    onDate = { drillDate = it }, onGeo = { geomorphDesc = it },
                    onDesc = { description = it }, onLat = { latStr = it }, onLng = { lngStr = it },
                    speech = speech
                )
                1 -> LayersTab(uuid, db, scope, layers)
                2 -> UgvTab(uuid, db, scope, ugvList)
                3 -> MmgTab(uuid, db, scope, mmgList)
                4 -> PhotosTab(uuid, db, scope, photos, context)
            }
        }
    }
}

// ── Шапка ────────────────────────────────────────────────────

@Composable
private fun HeaderTab(
    name: String, workType: String, depth: String, diameter: String,
    date: String, geomorph: String, description: String, lat: String, lng: String,
    onName: (String) -> Unit, onWorkType: (String) -> Unit,
    onDepth: (String) -> Unit, onDiameter: (String) -> Unit,
    onDate: (String) -> Unit, onGeo: (String) -> Unit,
    onDesc: (String) -> Unit, onLat: (String) -> Unit, onLng: (String) -> Unit,
    speech: ru.sputnik.field.ui.voice.SpeechHelper
) {
    LazyColumn(Modifier.padding(horizontal = 16.dp)) {
        item { Spacer(Modifier.height(12.dp)) }
        item { FieldInput("Название скважины", name, onName) }
        item { Spacer(Modifier.height(10.dp)) }
        item {
            Text("Тип работ", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
            Spacer(Modifier.height(4.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                WORK_TYPES.forEachIndexed { i, (key, label) ->
                    SegmentedButton(
                        selected = workType == key, onClick = { onWorkType(key) },
                        shape = SegmentedButtonDefaults.itemShape(i, WORK_TYPES.size),
                        label = { Text(label, maxLines = 1) }
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        item { FieldInput("Плановая глубина, м", depth, onDepth, KeyboardType.Decimal) }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Диаметр, мм", diameter, onDiameter, KeyboardType.Decimal) }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Дата бурения (ГГГГ-ММ-ДД)", date, onDate) }
        item { Spacer(Modifier.height(8.dp)) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FieldInput("Широта", lat, onLat, KeyboardType.Decimal, Modifier.weight(1f))
                FieldInput("Долгота", lng, onLng, KeyboardType.Decimal, Modifier.weight(1f))
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
        item { VoiceTextField("Геоморфология", geomorph, onGeo, speech = speech) }
        item { Spacer(Modifier.height(8.dp)) }
        item { VoiceTextField("Описание", description, onDesc, speech = speech) }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Слои + Пробы ─────────────────────────────────────────────

@Composable
private fun LayersTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, layers: List<SoilLayer>
) {
    var editLayer by remember { mutableStateOf<SoilLayer?>(null) }
    var samplesForLayer by remember { mutableStateOf<SoilLayer?>(null) }

    when {
        samplesForLayer != null -> {
            val layer = samplesForLayer!!
            val samples by db.samples().byLayer(layer.uuid).collectAsState(initial = emptyList())
            SamplesSheet(
                layer = layer,
                samples = samples,
                db = db, scope = scope,
                onBack = { samplesForLayer = null }
            )
        }
        editLayer != null -> {
            LayerEditSheet(
                layer = editLayer!!,
                onDismiss = { editLayer = null },
                onSave = { l -> scope.launch { db.soilLayers().insert(l) }; editLayer = null },
                onDelete = { l -> scope.launch { db.soilLayers().delete(l) }; editLayer = null },
                onSamples = { l -> editLayer = null; samplesForLayer = l }
            )
        }
        else -> {
            LazyColumn(Modifier.padding(horizontal = 16.dp)) {
                item { Spacer(Modifier.height(8.dp)) }
                items(layers, key = { it.uuid }) { l ->
                    val sampleCount by db.samples().byLayer(l.uuid)
                        .collectAsState(initial = emptyList())
                    LayerCard(
                        layer = l,
                        sampleCount = sampleCount.size,
                        onClick = { editLayer = l }
                    )
                }
                item {
                    OutlinedButton(
                        onClick = {
                            editLayer = SoilLayer(
                                uuid = UUID.randomUUID().toString(),
                                boreholeUuid = boreholeUuid,
                                orderIdx = layers.size
                            )
                        },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    ) {
                        Icon(Icons.Default.Add, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Добавить слой")
                    }
                }
                item { Spacer(Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun LayerCard(layer: SoilLayer, sampleCount: Int, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Слой ${layer.orderIdx + 1} · до ${layer.depthM} м",
                    fontWeight = FontWeight.Bold)
                if (sampleCount > 0)
                    Badge(containerColor = MaterialTheme.colorScheme.secondary) {
                        Text("🧪 $sampleCount проб")
                    }
            }
            if (layer.soilType.isNotEmpty())
                Text("${layer.soilType}  ${layer.state}",
                    style = MaterialTheme.typography.bodySmall)
            if (layer.description.isNotEmpty())
                Text(layer.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f),
                    maxLines = 2)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LayerEditSheet(
    layer: SoilLayer, onDismiss: () -> Unit,
    onSave: (SoilLayer) -> Unit, onDelete: (SoilLayer) -> Unit,
    onSamples: (SoilLayer) -> Unit
) {
    var soilType by remember { mutableStateOf(layer.soilType) }
    var state by remember { mutableStateOf(layer.state) }
    var depthStr by remember { mutableStateOf(layer.depthM.takeIf { it > 0 }?.toString() ?: "") }
    var desc by remember { mutableStateOf(layer.description) }
    var showCustomTypeDialog by remember { mutableStateOf(false) }
    var customTypeInput by remember { mutableStateOf("") }

    if (showCustomTypeDialog) {
        AlertDialog(
            onDismissRequest = { showCustomTypeDialog = false; customTypeInput = "" },
            title = { Text("Свой тип грунта") },
            text = {
                OutlinedTextField(
                    value = customTypeInput,
                    onValueChange = { customTypeInput = it },
                    placeholder = { Text("Введите тип грунта") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (customTypeInput.isNotBlank()) soilType = customTypeInput.trim()
                    showCustomTypeDialog = false; customTypeInput = ""
                }) { Text("Применить") }
            },
            dismissButton = {
                TextButton(onClick = { showCustomTypeDialog = false; customTypeInput = "" }) {
                    Text("Отмена")
                }
            }
        )
    }

    LazyColumn(Modifier.padding(16.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text("Слой ${layer.orderIdx + 1}", fontWeight = FontWeight.Bold)
                TextButton(onClick = {
                    onSave(layer.copy(soilType = soilType, state = state,
                        depthM = depthStr.toDoubleOrNull() ?: 0.0, description = desc))
                    onSamples(layer.copy(soilType = soilType, state = state,
                        depthM = depthStr.toDoubleOrNull() ?: 0.0, description = desc))
                }) {
                    Icon(Icons.Default.Science, null, Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Пробы →")
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        item {
            var soilExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = soilExpanded, onExpandedChange = { soilExpanded = it }) {
                OutlinedTextField(
                    value = soilType, onValueChange = {},
                    label = { Text("Тип грунта") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(soilExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(expanded = soilExpanded, onDismissRequest = { soilExpanded = false }) {
                    SOIL_TYPES.forEach { opt ->
                        DropdownMenuItem(text = { Text(opt) },
                            onClick = { soilType = opt; soilExpanded = false })
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("✏️ Свой тип...") },
                        onClick = { soilExpanded = false; customTypeInput = ""; showCustomTypeDialog = true }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
        item { DropdownField("Состояние", state, SOIL_STATES) { state = it } }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Глубина подошвы, м", depthStr, { depthStr = it }, KeyboardType.Decimal) }
        item { Spacer(Modifier.height(8.dp)) }
        item { VoiceTextField("Описание слоя", desc, { desc = it }) }
        item { Spacer(Modifier.height(16.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text("Отмена")
                }
                if (layer.soilType.isNotEmpty())
                    OutlinedButton(
                        onClick = { onDelete(layer) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error)
                    ) { Text("Удалить") }
                Button(
                    onClick = {
                        onSave(layer.copy(soilType = soilType, state = state,
                            depthM = depthStr.toDoubleOrNull() ?: 0.0, description = desc))
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Сохранить") }
            }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Пробы ────────────────────────────────────────────────────

@Composable
private fun SamplesSheet(
    layer: SoilLayer,
    samples: List<Sample>,
    db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope,
    onBack: () -> Unit
) {
    var collType by remember { mutableStateOf(SAMPLE_TYPES[0]) }
    var packaging by remember { mutableStateOf(PACKAGING_TYPES[0]) }
    var depthStr by remember { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }

    Column {
        // Заголовок
        Surface(tonalElevation = 2.dp) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                Text("Пробы · Слой ${layer.orderIdx + 1}",
                    fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = { showAdd = true }) {
                    Icon(Icons.Default.Add, null, Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Добавить")
                }
            }
        }

        // Диалог добавления
        if (showAdd) {
            AlertDialog(
                onDismissRequest = { showAdd = false },
                title = { Text("Новая проба") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DropdownField("Вид отбора", collType, SAMPLE_TYPES) { collType = it }
                        DropdownField("Упаковка", packaging, PACKAGING_TYPES) { packaging = it }
                        FieldInput("Глубина отбора, м", depthStr, { depthStr = it }, KeyboardType.Decimal)
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        scope.launch {
                            db.samples().insert(Sample(
                                uuid = UUID.randomUUID().toString(),
                                layerUuid = layer.uuid,
                                collectionType = collType,
                                packaging = packaging,
                                depthM = depthStr.toDoubleOrNull() ?: 0.0
                            ))
                        }
                        depthStr = ""; showAdd = false
                    }) { Text("Добавить") }
                },
                dismissButton = {
                    TextButton(onClick = { showAdd = false }) { Text("Отмена") }
                }
            )
        }

        LazyColumn(Modifier.padding(horizontal = 16.dp)) {
            if (samples.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) {
                        Text("Проб нет. Нажмите «Добавить».",
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                    }
                }
            } else {
                items(samples, key = { it.uuid }) { s ->
                    ListItem(
                        leadingContent = { Text("🧪", style = MaterialTheme.typography.titleMedium) },
                        headlineContent = { Text("${s.collectionType} · ${s.depthM} м") },
                        supportingContent = { Text(s.packaging) },
                        trailingContent = {
                            IconButton(onClick = { scope.launch { db.samples().delete(s) } }) {
                                Icon(Icons.Default.Delete, null,
                                    tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    )
                    HorizontalDivider()
                }
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }
}

// ── УГВ ─────────────────────────────────────────────────────

@Composable
private fun UgvTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, list: List<UgvEntry>
) {
    var depthStr by remember { mutableStateOf("") }
    LazyColumn(Modifier.padding(16.dp)) {
        if (list.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(24.dp), Alignment.Center) {
                    Text("УГВ не зафиксированы",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                }
            }
        }
        items(list, key = { it.uuid }) { u ->
            ListItem(
                headlineContent = { Text("💧 УГВ ${list.indexOf(u) + 1}: ${u.depthM} м") },
                trailingContent = {
                    IconButton(onClick = { scope.launch { db.ugv().delete(u) } }) {
                        Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error)
                    }
                }
            )
            HorizontalDivider()
        }
        item {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                FieldInput("Глубина УГВ, м", depthStr, { depthStr = it },
                    KeyboardType.Decimal, Modifier.weight(1f))
                Button(onClick = {
                    val d = depthStr.toDoubleOrNull() ?: return@Button
                    scope.launch {
                        db.ugv().insert(UgvEntry(UUID.randomUUID().toString(),
                            boreholeUuid, list.size, d))
                    }
                    depthStr = ""
                }) { Icon(Icons.Default.Add, null) }
            }
        }
    }
}

// ── ММГ ─────────────────────────────────────────────────────

@Composable
private fun MmgTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, list: List<MmgEntry>
) {
    var topStr by remember { mutableStateOf("") }
    var botStr by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    LazyColumn(Modifier.padding(16.dp)) {
        if (list.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(24.dp), Alignment.Center) {
                    Text("ММГ не зафиксированы",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = .4f))
                }
            }
        }
        items(list, key = { it.uuid }) { m ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("ММГ ${list.indexOf(m) + 1}: кровля ${m.topM} м · подошва ${m.bottomM} м",
                            fontWeight = FontWeight.SemiBold)
                        if (m.description.isNotEmpty())
                            Text(m.description, style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { scope.launch { db.mmg().delete(m) } }) {
                        Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(12.dp))
            Text("Добавить ММГ", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FieldInput("Кровля, м", topStr, { topStr = it }, KeyboardType.Decimal, Modifier.weight(1f))
                FieldInput("Подошва, м", botStr, { botStr = it }, KeyboardType.Decimal, Modifier.weight(1f))
            }
            Spacer(Modifier.height(6.dp))
            VoiceTextField("Описание ММГ", desc, { desc = it })
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    val top = topStr.toDoubleOrNull() ?: return@Button
                    val bot = botStr.toDoubleOrNull() ?: return@Button
                    scope.launch {
                        db.mmg().insert(MmgEntry(UUID.randomUUID().toString(),
                            boreholeUuid, list.size, top, bot, desc))
                    }
                    topStr = ""; botStr = ""; desc = ""
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Добавить") }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Фото ────────────────────────────────────────────────────

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun PhotosTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, photos: List<Photo>,
    context: android.content.Context
) {
    val categories = listOf(
        "vyrabotka" to "Выработка",
        "drilling" to "Бурение",
        "core_box" to "Керновый ящик",
        "journal" to "Журнал"
    )
    val maxPerCat = mapOf("vyrabotka" to 2, "drilling" to 5, "core_box" to 5, "journal" to 4)
    var activeCategory by remember { mutableStateOf("vyrabotka") }
    var pendingFile by remember { mutableStateOf<java.io.File?>(null) }

    val cameraPerm = rememberPermissionState(android.Manifest.permission.CAMERA)

    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.TakePicture()
    ) { saved ->
        if (saved) {
            pendingFile?.let { file ->
                scope.launch {
                    db.photos().insert(Photo(
                        uuid = UUID.randomUUID().toString(),
                        boreholeUuid = boreholeUuid,
                        category = activeCategory,
                        filePath = file.absolutePath,
                        takenAt = java.time.Instant.now().toString()
                    ))
                }
            }
        }
        pendingFile = null
    }

    fun launchCamera() {
        val photoDir = java.io.File(
            context.getExternalFilesDir(null), "photos").also { it.mkdirs() }
        val file = java.io.File(photoDir, "${UUID.randomUUID()}.jpg")
        pendingFile = file
        val uri = androidx.core.content.FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", file)
        launcher.launch(uri)
    }

    Column {
        ScrollableTabRow(
            selectedTabIndex = categories.indexOfFirst { it.first == activeCategory }
        ) {
            categories.forEachIndexed { _, (key, label) ->
                val cnt = photos.count { it.category == key }
                Tab(activeCategory == key, onClick = { activeCategory = key },
                    text = { Text("$label ($cnt)") })
            }
        }

        val catPhotos = photos.filter { it.category == activeCategory }
        val max = maxPerCat[activeCategory] ?: 5

        LazyColumn(Modifier.padding(16.dp)) {
            items(catPhotos, key = { it.uuid }) { p ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    coil.compose.AsyncImage(
                        model = p.filePath, contentDescription = null,
                        modifier = Modifier.size(90.dp).padding(end = 10.dp),
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop
                    )
                    Column(Modifier.weight(1f)) {
                        Text(p.category, style = MaterialTheme.typography.labelSmall)
                        Text(p.takenAt.take(16), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
                    }
                    IconButton(onClick = { scope.launch { db.photos().delete(p) } }) {
                        Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error)
                    }
                }
                HorizontalDivider()
            }

            if (catPhotos.size < max) {
                item {
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (cameraPerm.status.isGranted) {
                                launchCamera()
                            } else {
                                cameraPerm.launchPermissionRequest()
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CameraAlt, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Сфотографировать (${catPhotos.size}/$max)")
                    }

                    // После выдачи разрешения — автозапуск камеры
                    LaunchedEffect(cameraPerm.status.isGranted) {
                        if (cameraPerm.status.isGranted && pendingFile == null) {
                            // разрешение только что выдано, пользователь нажмёт кнопку ещё раз
                        }
                    }

                    Spacer(Modifier.height(80.dp))
                }
            }
        }
    }
}

// ── Переиспользуемые компоненты ──────────────────────────────

@Composable
fun FieldInput(
    label: String, value: String, onChange: (String) -> Unit,
    keyboard: KeyboardType = KeyboardType.Text,
    modifier: Modifier = Modifier.fillMaxWidth(),
    multiline: Boolean = false
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) },
        modifier = modifier, singleLine = !multiline,
        minLines = if (multiline) 2 else 1,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownField(label: String, value: String, options: List<String>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = value, onValueChange = {},
            label = { Text(label) }, readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(text = { Text(opt) },
                    onClick = { onSelect(opt); expanded = false })
            }
        }
    }
}
