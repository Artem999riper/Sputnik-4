package ru.sputnik.field.ui.screens

import android.app.DatePickerDialog
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
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*
import ru.sputnik.field.data.repo.safeDb
import ru.sputnik.field.ui.components.LocalSnackbar
import ru.sputnik.field.ui.components.TextInputDialog
import ru.sputnik.field.ui.components.WarningsDialog
import ru.sputnik.field.ui.voice.VoiceTextField
import ru.sputnik.field.ui.voice.rememberSpeechHelper
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.util.Calendar
import java.util.UUID
import kotlin.math.abs

private val WORK_TYPES = listOf(
    "SEARCH" to "Поисковая", "EXPLORATION" to "Разведочная",
    "TRENCH" to "Шурф", "GEOLOGICAL" to "Геологическая"
)
private val SOIL_TYPES = listOf(
    "Торф", "Супесь", "Суглинок", "Глина", "Песок",
    "Гравий", "Галечник", "Мерзлота", "Ледогрунт", "Прочее"
)
private val SOIL_STATES = listOf(
    "Мягкопластичный", "Тугопластичный", "Полутвёрдый", "Твёрдый",
    "Текучий", "Текучепластичный", "Плотный", "Средней плотности", "Рыхлый", "Прочее"
)
private val SAMPLE_TYPES = listOf("Монолит", "Нарушенный")
private val FROZEN_STATES = listOf("Не указано", "Талый", "Мёрзлый")
private val PACKAGING_TYPES = listOf(
    "Полиэтилен", "Мешок", "Коробка", "Банка", "Пакет",
    "Труба", "Контейнер", "Пробирка", "Прочее"
)

// ── Главный экран ────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoreholeEditScreen(boreholeUuid: String?, volumeId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()
    val speech = rememberSpeechHelper()
    val snackbar = LocalSnackbar.current

    val isNew = boreholeUuid == null
    val uuid = remember { boreholeUuid ?: UUID.randomUUID().toString() }
    var siteId by remember { mutableStateOf("") }
    LaunchedEffect(volumeId) {
        siteId = db.volumes().byId(volumeId)?.siteId ?: ""
    }

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
    var casingStr by remember { mutableStateOf("") }
    var brigadeSnapshot by remember { mutableStateOf("") }

    var selectedTab by remember { mutableIntStateOf(0) }
    var showDoneDialog by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

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
                latStr = bh.manualLat?.let { toDMS(it, true) } ?: ""
                lngStr = bh.manualLng?.let { toDMS(it, false) } ?: ""
                status = bh.status
                casingStr = bh.casingLengthM.takeIf { it > 0 }?.toString() ?: ""
                brigadeSnapshot = bh.brigadeSnapshot
            }
        } else {
            // Pre-save empty placeholder so FK constraints are satisfied when layers are added.
            val today = java.time.LocalDate.now().toString()
            drillDate = today
            val sId = db.volumes().byId(volumeId)?.siteId ?: ""
            db.boreholes().upsert(Borehole(uuid = uuid, siteId = sId, volumeId = volumeId, drillDate = today))
        }
    }

    fun saveBorehole(then: () -> Unit = {}) {
        if (saving) return
        saving = true
        scope.launch {
            val ok = withContext(NonCancellable) {
                safeDb(snackbar) {
                    val snapshotToSave = if (status == "done" && brigadeSnapshot.isBlank()) {
                        val brigade = db.brigades().current()
                        if (brigade != null) {
                            val memberIds = db.brigades().members(brigade.id).map { m -> m.workerId }
                            val memberNames = db.workers().byIds(memberIds).map { w -> w.name }
                            val transport = brigade.transportId?.let { db.transport().byId(it) }
                            val transportLabel = transport?.let {
                                if (it.plate.isNotBlank()) "${it.name} ${it.plate}" else it.name
                            } ?: ""
                            buildBrigadeSnapshotJson(memberIds, memberNames, brigade.transportId, transportLabel)
                        } else ""
                    } else brigadeSnapshot
                    brigadeSnapshot = snapshotToSave
                    // @Upsert = INSERT OR IGNORE + UPDATE — does not delete the row,
                    // so FK-CASCADE on soil_layers/photos is never triggered.
                    db.boreholes().upsert(Borehole(
                        uuid = uuid, siteId = siteId, volumeId = volumeId,
                        name = name, workType = workType,
                        plannedDepthM = depthStr.toRusDouble() ?: 0.0,
                        diameterMm = diameterStr.toRusDouble() ?: 0.0,
                        drillDate = drillDate, geomorphDesc = geomorphDesc, description = description,
                        manualLat = parseLatLng(latStr), manualLng = parseLatLng(lngStr),
                        status = status,
                        casingLengthM = casingStr.toRusDouble() ?: 0.0,
                        brigadeSnapshot = snapshotToSave
                    ))
                    true
                } != null
            }
            saving = false
            if (ok) then()
        }
    }

    // Диалог валидации при завершении
    if (showDoneDialog) {
        val warnings = buildList {
            if (layers.isEmpty()) add("Не добавлено ни одного слоя грунта")
            if (photos.isEmpty()) add("Нет ни одной фотографии")
            if (name.isBlank()) add("Не указано название скважины")
        }
        WarningsDialog(
            title = if (warnings.isEmpty()) "Завершить скважину?" else "Есть незаполненные поля",
            warnings = warnings,
            successText = "Скважина будет отмечена как готова к экспорту.",
            confirmLabel = "Завершить",
            onDismiss = { showDoneDialog = false },
            onConfirm = {
                status = "done"
                saveBorehole { showDoneDialog = false; onBack() }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isNew) "Новая скважина" else name.ifEmpty { "Скважина" }) },
                navigationIcon = {
                    IconButton(onClick = { saveBorehole(onBack) }, enabled = !saving) {
                        Icon(Icons.Default.ArrowBack, null)
                    }
                },
                actions = {
                    if (saving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp).padding(end = 8.dp),
                            strokeWidth = 2.dp
                        )
                    }
                    if (status != "done") {
                        TextButton(
                            onClick = { saveBorehole { showDoneDialog = true } },
                            enabled = !saving
                        ) {
                            Text("✓ Завершить")
                        }
                    }
                    TextButton(
                        onClick = { saveBorehole(onBack) },
                        enabled = !saving
                    ) { Text("Сохранить") }
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
                    "Обсад",
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
                4 -> ObsadTab(casingStr) { casingStr = it }
                5 -> PhotosTab(uuid, db, scope, photos, context)
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
        item { DatePickerButton(date, onDate) }
        item { Spacer(Modifier.height(8.dp)) }
        item {
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FieldInput("Широта (DMS)", lat, onLat, KeyboardType.Text, Modifier.weight(1f))
                    FieldInput("Долгота (DMS)", lng, onLng, KeyboardType.Text, Modifier.weight(1f))
                }
                val latD = parseLatLng(lat)
                val lngD = parseLatLng(lng)
                Spacer(Modifier.height(2.dp))
                Text(
                    if (latD != null && lngD != null)
                        "≈ %.6f, %.6f".format(latD, lngD)
                    else
                        "Формат: 55°30'15.5\"N или 55.5042",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .55f)
                )
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
                db = db, scope = scope,
                onDismiss = { editLayer = null },
                onSave = { l ->
                    scope.launch { withContext(NonCancellable) { db.soilLayers().upsert(l) } }
                    editLayer = null
                },
                onDelete = { l ->
                    scope.launch { withContext(NonCancellable) { db.soilLayers().delete(l) } }
                    editLayer = null
                },
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
    layer: SoilLayer,
    db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope,
    onDismiss: () -> Unit,
    onSave: (SoilLayer) -> Unit, onDelete: (SoilLayer) -> Unit,
    onSamples: (SoilLayer) -> Unit
) {
    var soilType by remember { mutableStateOf(layer.soilType) }
    var state by remember { mutableStateOf(layer.state) }
    var frozenState by remember { mutableStateOf(layer.frozenState) }
    var depthStr by remember { mutableStateOf(layer.depthM.takeIf { it > 0 }?.toString() ?: "") }
    var desc by remember { mutableStateOf(layer.description) }
    var showCustomTypeDialog by remember { mutableStateOf(false) }
    var showCustomStateDialog by remember { mutableStateOf(false) }

    val customSoilTypes by db.customRefs().soilTypes().collectAsState(initial = emptyList())
    val customSoilStates by db.customRefs().soilStates().collectAsState(initial = emptyList())
    val allSoilTypes = remember(customSoilTypes) { (SOIL_TYPES + customSoilTypes).distinct() }
    val allSoilStates = remember(customSoilStates) { (SOIL_STATES + customSoilStates).distinct() }

    if (showCustomTypeDialog) {
        TextInputDialog(
            title = "Свой тип грунта",
            label = "Введите тип грунта",
            confirmLabel = "Применить",
            onDismiss = { showCustomTypeDialog = false },
            onConfirm = { v ->
                soilType = v
                scope.launch { db.customRefs().addSoilType(CustomSoilType(v)) }
                showCustomTypeDialog = false
            }
        )
    }

    if (showCustomStateDialog) {
        TextInputDialog(
            title = "Своё состояние",
            label = "Введите состояние",
            confirmLabel = "Применить",
            onDismiss = { showCustomStateDialog = false },
            onConfirm = { v ->
                state = v
                scope.launch { db.customRefs().addSoilState(CustomSoilState(v)) }
                showCustomStateDialog = false
            }
        )
    }

    LazyColumn(Modifier.padding(16.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text("Слой ${layer.orderIdx + 1}", fontWeight = FontWeight.Bold)
                TextButton(onClick = {
                    val updatedLayer = layer.copy(soilType = soilType, state = state, frozenState = frozenState,
                        depthM = depthStr.toRusDouble() ?: 0.0, description = desc)
                    onSave(updatedLayer)
                    onSamples(updatedLayer)
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
                    value = soilType.ifEmpty { "Выбрать..." }, onValueChange = {},
                    label = { Text("Тип грунта") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(soilExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(expanded = soilExpanded, onDismissRequest = { soilExpanded = false }) {
                    allSoilTypes.forEach { opt ->
                        DropdownMenuItem(text = { Text(opt) },
                            onClick = { soilType = opt; soilExpanded = false })
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("➕ Свой тип…") },
                        onClick = { soilExpanded = false; showCustomTypeDialog = true }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
        item {
            var stateExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = stateExpanded, onExpandedChange = { stateExpanded = it }) {
                OutlinedTextField(
                    value = state.ifEmpty { "Выбрать..." }, onValueChange = {},
                    label = { Text("Состояние") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(stateExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(expanded = stateExpanded, onDismissRequest = { stateExpanded = false }) {
                    allSoilStates.forEach { opt ->
                        DropdownMenuItem(text = { Text(opt) },
                            onClick = { state = opt; stateExpanded = false })
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("➕ Своё состояние…") },
                        onClick = { stateExpanded = false; showCustomStateDialog = true }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
        item {
            var frozenExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = frozenExpanded, onExpandedChange = { frozenExpanded = it }) {
                OutlinedTextField(
                    value = frozenState.ifEmpty { "Выбрать..." }, onValueChange = {},
                    label = { Text("Талый / Мёрзлый") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(frozenExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(expanded = frozenExpanded, onDismissRequest = { frozenExpanded = false }) {
                    FROZEN_STATES.forEach { opt ->
                        DropdownMenuItem(text = { Text(opt) },
                            onClick = { frozenState = opt; frozenExpanded = false })
                    }
                }
            }
        }
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
                        onSave(layer.copy(soilType = soilType, state = state, frozenState = frozenState,
                            depthM = depthStr.toRusDouble() ?: 0.0, description = desc))
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
    var topStr by remember { mutableStateOf("") }
    var botStr by remember { mutableStateOf("") }
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
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.weight(1f)) {
                                FieldInput("Глубина с, м", topStr, { topStr = it }, KeyboardType.Decimal)
                            }
                            Box(Modifier.weight(1f)) {
                                FieldInput("по, м", botStr, { botStr = it }, KeyboardType.Decimal)
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        val top = topStr.toRusDouble() ?: 0.0
                        val bot = botStr.toRusDouble() ?: top
                        scope.launch {
                            db.samples().insert(Sample(
                                uuid = UUID.randomUUID().toString(),
                                layerUuid = layer.uuid,
                                collectionType = collType,
                                packaging = packaging,
                                depthM = top,
                                depthTopM = top,
                                depthBottomM = bot
                            ))
                        }
                        topStr = ""; botStr = ""; showAdd = false
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
                        headlineContent = {
                            val depthLabel = when {
                                s.depthBottomM > 0 && s.depthBottomM != s.depthTopM ->
                                    "${s.depthTopM.takeIf { it > 0 } ?: s.depthM}-${s.depthBottomM} м"
                                s.depthTopM > 0 -> "${s.depthTopM} м"
                                else -> "${s.depthM} м"
                            }
                            Text("${s.collectionType} · $depthLabel")
                        },
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
                    val d = depthStr.toRusDouble() ?: return@Button
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
                    val top = topStr.toRusDouble() ?: return@Button
                    val bot = botStr.toRusDouble() ?: return@Button
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

// ── Обсад (длина обсадных труб) ──────────────────────────────
@Composable
private fun ObsadTab(casingStr: String, onChange: (String) -> Unit) {
    Column(Modifier.padding(16.dp)) {
        Text("Длина обсадных труб", fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.height(4.dp))
        Text("Введите количество метров обсадных труб для этой скважины. Значение сохранится в шапке скважины.",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
        Spacer(Modifier.height(16.dp))
        FieldInput("Обсад, м", casingStr, onChange, KeyboardType.Decimal)
        Spacer(Modifier.height(8.dp))
        Text("Значение сохраняется автоматически при выходе из карточки.",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .5f))
    }
}

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
    // Храним URI результата (фото идёт сразу в DCIM/Sputnik через MediaStore,
    // чтобы было видно в галерее телефона). Photo.filePath = content://… URI.
    var pendingUri by remember { mutableStateOf<android.net.Uri?>(null) }

    val cameraPerm = rememberPermissionState(android.Manifest.permission.CAMERA)

    // Выбор фото из галереи
    val galleryLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            // Берём постоянное разрешение на чтение, чтобы URI оставался доступным
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) {}
            scope.launch {
                db.photos().insert(Photo(
                    uuid = UUID.randomUUID().toString(),
                    boreholeUuid = boreholeUuid,
                    category = activeCategory,
                    filePath = uri.toString(),
                    takenAt = java.time.Instant.now().toString()
                ))
            }
        }
    }

    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.TakePicture()
    ) { saved ->
        if (saved) {
            pendingUri?.let { uri ->
                scope.launch {
                    db.photos().insert(Photo(
                        uuid = UUID.randomUUID().toString(),
                        boreholeUuid = boreholeUuid,
                        category = activeCategory,
                        filePath = uri.toString(),
                        takenAt = java.time.Instant.now().toString()
                    ))
                }
            }
        } else {
            // Снимок отменён — удаляем подготовленную (но пустую) запись MediaStore.
            pendingUri?.let { try { context.contentResolver.delete(it, null, null) } catch (_: Exception) {} }
        }
        pendingUri = null
    }

    fun launchCamera() {
        val resolver = context.contentResolver
        val displayName = "sputnik_${java.util.UUID.randomUUID()}.jpg"
        val values = android.content.ContentValues().apply {
            put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                // Альбом «Sputnik» внутри DCIM — будет виден в системной галерее.
                put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "DCIM/Sputnik")
            }
        }
        val uri = resolver.insert(
            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
        ) ?: return
        pendingUri = uri
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

                    // После выдачи разрешения — пользователь нажмёт кнопку ещё раз
                    LaunchedEffect(cameraPerm.status.isGranted) {
                        if (cameraPerm.status.isGranted && pendingUri == null) {
                            // разрешение получено
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { galleryLauncher.launch("image/*") },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Image, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Загрузить из галереи")
                    }

                    Spacer(Modifier.height(80.dp))
                }
            }
        }
    }
}

// ── Переиспользуемые компоненты ──────────────────────────────

fun toDMS(dd: Double, isLat: Boolean): String {
    val d = abs(dd).toInt()
    val mTotal = (abs(dd) - d) * 60
    val m = mTotal.toInt()
    val s = (mTotal - m) * 60
    val dir = if (isLat) (if (dd >= 0) "N" else "S") else (if (dd >= 0) "E" else "W")
    return "%d°%d'%.1f\"%s".format(d, m, s, dir)
}

// Парсит число с запятой или точкой как десятичным разделителем (ru-локаль).
private fun String.toRusDouble(): Double? = this.replace(',', '.').trim().toDoubleOrNull()

/**
 * Парсит строку в десятичные градусы.
 * Поддерживает: «55°30'15.5"N», «55 30 15.5», «55°30.5'», «55.5042», «-55.5042».
 * Возвращает null если строка не распознана.
 */
fun parseLatLng(input: String): Double? {
    val s = input.trim()
    if (s.isEmpty()) return null
    s.replace(',', '.').toDoubleOrNull()?.let { return it }
    val sign = when {
        s.endsWith("S", true) || s.endsWith("W", true) -> -1.0
        s.endsWith("N", true) || s.endsWith("E", true) -> 1.0
        s.startsWith("-") -> -1.0
        else -> 1.0
    }
    val nums = Regex("\\d+(?:[.,]\\d+)?").findAll(s).map { it.value.replace(',', '.').toDouble() }.toList()
    if (nums.isEmpty()) return null
    val deg = nums.getOrNull(0) ?: 0.0
    val min = nums.getOrNull(1) ?: 0.0
    val sec = nums.getOrNull(2) ?: 0.0
    if (min < 0 || min >= 60 || sec < 0 || sec >= 60) return null
    val dd = deg + min / 60.0 + sec / 3600.0
    return sign * dd
}

@Composable
fun DatePickerButton(value: String, onChange: (String) -> Unit) {
    val context = LocalContext.current
    val cal = remember(value) {
        Calendar.getInstance().also { c ->
            if (value.length == 10) {
                runCatching {
                    val parts = value.split("-")
                    c.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())
                }
            }
        }
    }
    OutlinedTextField(
        value = if (value.isEmpty()) "" else value,
        onValueChange = {},
        label = { Text("Дата бурения") },
        modifier = Modifier.fillMaxWidth(),
        readOnly = true,
        trailingIcon = {
            IconButton(onClick = {
                DatePickerDialog(
                    context,
                    { _, year, month, day ->
                        onChange("%04d-%02d-%02d".format(year, month + 1, day))
                    },
                    cal.get(Calendar.YEAR),
                    cal.get(Calendar.MONTH),
                    cal.get(Calendar.DAY_OF_MONTH)
                ).show()
            }) { Icon(Icons.Default.CalendarToday, "Выбрать дату") }
        }
    )
}

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

fun buildBrigadeSnapshotJson(
    memberIds: List<String>,
    memberNames: List<String>,
    transportId: String?,
    transportLabel: String
): String {
    fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")
    val idsJson = memberIds.joinToString(",") { "\"${esc(it)}\"" }
    val namesJson = memberNames.joinToString(",") { "\"${esc(it)}\"" }
    val tidJson = if (transportId == null) "null" else "\"${esc(transportId)}\""
    val labelEscaped = esc(transportLabel)
    return """{"memberIds":[$idsJson],"memberNames":[$namesJson],"transportId":$tidJson,"transportLabel":"$labelEscaped"}"""
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
