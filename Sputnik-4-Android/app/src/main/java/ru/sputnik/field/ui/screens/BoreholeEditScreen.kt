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
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*
import java.util.UUID

private val WORK_TYPES = listOf("SEARCH" to "Поисковая", "EXPLORATION" to "Разведочная",
    "TRENCH" to "Шурф", "GEOLOGICAL" to "Геологическая")
private val SOIL_TYPES = listOf("Торф", "Супесь", "Суглинок", "Глина", "Песок", "Гравий",
    "Галечник", "Мерзлота", "Скала", "Прочее")
private val SOIL_STATES = listOf("Мягкопластичный", "Тугопластичный", "Полутвёрдый", "Твёрдый",
    "Текучий", "Текучепластичный", "Плотный", "Средней плотности", "Рыхлый", "Прочее")
private val SAMPLE_TYPES = listOf("Монолит", "Нарушенный", "Воды", "Газ")
private val PACKAGING = listOf("Полиэтилен", "Мешок", "Коробка", "Банка", "Пакет",
    "Труба", "Контейнер", "Пробирка", "Прочее")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoreholeEditScreen(boreholeUuid: String?, siteId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { AppDatabase.get(context) }
    val scope = rememberCoroutineScope()

    val isNew = boreholeUuid == null
    val uuid = remember { boreholeUuid ?: UUID.randomUUID().toString() }

    // ── Шапка ─────────────────────────────────────────────────
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

    val layers by db.soilLayers().byBorehole(uuid).collectAsState(initial = emptyList())
    val ugvList by db.ugv().byBorehole(uuid).collectAsState(initial = emptyList())
    val mmgList by db.mmg().byBorehole(uuid).collectAsState(initial = emptyList())
    val photos by db.photos().byBorehole(uuid).collectAsState(initial = emptyList())

    // Load existing borehole
    LaunchedEffect(boreholeUuid) {
        if (boreholeUuid != null) {
            db.boreholes().byUuid(boreholeUuid)?.let { bh ->
                name = bh.name
                workType = bh.workType
                depthStr = bh.plannedDepthM.toString()
                diameterStr = bh.diameterMm.toString()
                drillDate = bh.drillDate
                geomorphDesc = bh.geomorphDesc
                description = bh.description
                latStr = bh.manualLat?.toString() ?: ""
                lngStr = bh.manualLng?.toString() ?: ""
                status = bh.status
            }
        } else {
            drillDate = java.time.LocalDate.now().toString()
        }
    }

    fun save() {
        scope.launch {
            db.boreholes().insert(Borehole(
                uuid = uuid, siteId = siteId, name = name, workType = workType,
                plannedDepthM = depthStr.toDoubleOrNull() ?: 0.0,
                diameterMm = diameterStr.toDoubleOrNull() ?: 0.0,
                drillDate = drillDate, geomorphDesc = geomorphDesc, description = description,
                manualLat = latStr.toDoubleOrNull(), manualLng = lngStr.toDoubleOrNull(),
                status = status
            ))
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isNew) "Новая скважина" else name.ifEmpty { "Скважина" }) },
                navigationIcon = {
                    IconButton(onClick = { save(); onBack() }) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    if (status != "done") {
                        TextButton(onClick = { status = "done"; save(); onBack() }) { Text("✓ Завершить") }
                    }
                    TextButton(onClick = { save(); onBack() }) { Text("Сохранить") }
                }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad)) {
            TabRow(selectedTab) {
                listOf("Шапка", "Слои (${layers.size})", "УГВ (${ugvList.size})",
                    "ММГ (${mmgList.size})", "Фото (${photos.size})")
                    .forEachIndexed { i, t ->
                        Tab(i == selectedTab, onClick = { selectedTab = i }, text = { Text(t) })
                    }
            }

            when (selectedTab) {
                0 -> HeaderTab(
                    name, workType, depthStr, diameterStr, drillDate, geomorphDesc, description, latStr, lngStr,
                    onName = { name = it }, onWorkType = { workType = it },
                    onDepth = { depthStr = it }, onDiameter = { diameterStr = it },
                    onDate = { drillDate = it }, onGeo = { geomorphDesc = it },
                    onDesc = { description = it }, onLat = { latStr = it }, onLng = { lngStr = it },
                    onSave = ::save
                )
                1 -> LayersTab(uuid, db, scope, layers)
                2 -> UgvTab(uuid, db, scope, ugvList)
                3 -> MmgTab(uuid, db, scope, mmgList)
                4 -> PhotosTab(uuid, db, scope, photos, context)
            }
        }
    }
}

// ── Шапка ──────────────────────────────────────────────────

@Composable
private fun HeaderTab(
    name: String, workType: String, depth: String, diameter: String,
    date: String, geomorph: String, description: String, lat: String, lng: String,
    onName: (String) -> Unit, onWorkType: (String) -> Unit,
    onDepth: (String) -> Unit, onDiameter: (String) -> Unit,
    onDate: (String) -> Unit, onGeo: (String) -> Unit,
    onDesc: (String) -> Unit, onLat: (String) -> Unit, onLng: (String) -> Unit,
    onSave: () -> Unit
) {
    LazyColumn(Modifier.padding(horizontal = 16.dp)) {
        item { Spacer(Modifier.height(12.dp)) }
        item { FieldInput("Название скважины", name, onName) }
        item { Spacer(Modifier.height(8.dp)) }

        // Тип работ — сегментированный выбор
        item {
            Text("Тип работ", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
            Spacer(Modifier.height(4.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                WORK_TYPES.forEachIndexed { i, (key, label) ->
                    SegmentedButton(
                        selected = workType == key,
                        onClick = { onWorkType(key) },
                        shape = SegmentedButtonDefaults.itemShape(i, WORK_TYPES.size),
                        label = { Text(label, maxLines = 1) }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
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
        item { FieldInput("Геоморфология", geomorph, onGeo, multiline = true) }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Описание", description, onDesc, multiline = true) }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Слои ────────────────────────────────────────────────────

@Composable
private fun LayersTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, layers: List<SoilLayer>
) {
    var showAdd by remember { mutableStateOf(false) }
    var editLayer by remember { mutableStateOf<SoilLayer?>(null) }

    if (showAdd || editLayer != null) {
        val layer = editLayer ?: SoilLayer(uuid = UUID.randomUUID().toString(),
            boreholeUuid = boreholeUuid, orderIdx = layers.size)
        LayerEditSheet(
            layer = layer,
            onDismiss = { showAdd = false; editLayer = null },
            onSave = { l ->
                scope.launch { db.soilLayers().insert(l) }
                showAdd = false; editLayer = null
            },
            onDelete = { l ->
                scope.launch { db.soilLayers().delete(l) }
                editLayer = null
            }
        )
        return
    }

    LazyColumn(Modifier.padding(horizontal = 16.dp)) {
        item { Spacer(Modifier.height(8.dp)) }
        items(layers, key = { it.uuid }) { l ->
            Card(
                onClick = { editLayer = l },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
            ) {
                Column(Modifier.padding(12.dp)) {
                    Text("Слой ${l.orderIdx + 1} · до ${l.depthM} м",
                        fontWeight = FontWeight.Bold)
                    if (l.soilType.isNotEmpty())
                        Text("${l.soilType}  ${l.state}",
                            style = MaterialTheme.typography.bodySmall)
                    if (l.description.isNotEmpty())
                        Text(l.description, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
                }
            }
        }
        item {
            OutlinedButton(
                onClick = { showAdd = true },
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

@Composable
private fun LayerEditSheet(
    layer: SoilLayer, onDismiss: () -> Unit,
    onSave: (SoilLayer) -> Unit, onDelete: (SoilLayer) -> Unit
) {
    var soilType by remember { mutableStateOf(layer.soilType) }
    var state by remember { mutableStateOf(layer.state) }
    var depthStr by remember { mutableStateOf(layer.depthM.let { if (it == 0.0) "" else it.toString() }) }
    var desc by remember { mutableStateOf(layer.description) }

    LazyColumn(Modifier.padding(16.dp)) {
        item { Text("Слой", fontWeight = FontWeight.Bold); Spacer(Modifier.height(12.dp)) }
        item { DropdownField("Тип грунта", soilType, SOIL_TYPES) { soilType = it } }
        item { Spacer(Modifier.height(8.dp)) }
        item { DropdownField("Состояние", state, SOIL_STATES) { state = it } }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Глубина подошвы, м", depthStr, { depthStr = it }, KeyboardType.Decimal) }
        item { Spacer(Modifier.height(8.dp)) }
        item { FieldInput("Описание", desc, { desc = it }, multiline = true) }
        item { Spacer(Modifier.height(16.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Отмена") }
                if (layer.soilType.isNotEmpty())
                    OutlinedButton(
                        onClick = { onDelete(layer) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
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

// ── УГВ ─────────────────────────────────────────────────────

@Composable
private fun UgvTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, list: List<UgvEntry>
) {
    var depthStr by remember { mutableStateOf("") }
    LazyColumn(Modifier.padding(16.dp)) {
        items(list, key = { it.uuid }) { u ->
            ListItem(
                headlineContent = { Text("УГВ ${list.indexOf(u) + 1}: ${u.depthM} м") },
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
            FieldInput("Описание", desc, { desc = it }, multiline = true)
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
    }
}

// ── Фото ────────────────────────────────────────────────────

@Composable
private fun PhotosTab(
    boreholeUuid: String, db: AppDatabase,
    scope: kotlinx.coroutines.CoroutineScope, photos: List<Photo>,
    context: android.content.Context
) {
    val categories = listOf("vyrabotka" to "Выработка", "drilling" to "Бурение",
        "core_box" to "Керновый ящик", "journal" to "Журнал")
    val maxPerCat = mapOf("vyrabotka" to 2, "drilling" to 5, "core_box" to 5, "journal" to 4)
    var activeCategory by remember { mutableStateOf("vyrabotka") }

    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.TakePicture()
    ) { saved ->
        // Camera result handled by PhotoCapture helper — see CameraHelper.kt
    }
    var pendingPhotoUri by remember { mutableStateOf<android.net.Uri?>(null) }
    var pendingPhotoFile by remember { mutableStateOf<java.io.File?>(null) }

    LazyColumn(Modifier.padding(16.dp)) {
        item {
            ScrollableTabRow(
                selectedTabIndex = categories.indexOfFirst { it.first == activeCategory }
            ) {
                categories.forEachIndexed { i, (key, label) ->
                    val cnt = photos.count { it.category == key }
                    Tab(activeCategory == key,
                        onClick = { activeCategory = key },
                        text = { Text("$label ($cnt)") })
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        val catPhotos = photos.filter { it.category == activeCategory }
        val max = maxPerCat[activeCategory] ?: 5

        items(catPhotos, key = { it.uuid }) { p ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically) {
                coil.compose.AsyncImage(
                    model = p.filePath,
                    contentDescription = null,
                    modifier = Modifier.size(80.dp)
                        .padding(end = 8.dp),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = {
                    scope.launch { db.photos().delete(p) }
                }) { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) }
            }
            HorizontalDivider()
        }

        if (catPhotos.size < max) {
            item {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        // Create temp file and launch camera
                        val photoDir = java.io.File(context.getExternalFilesDir(null), "photos").also { it.mkdirs() }
                        val file = java.io.File(photoDir, "${UUID.randomUUID()}.jpg")
                        pendingPhotoFile = file
                        val uri = androidx.core.content.FileProvider.getUriForFile(
                            context, "${context.packageName}.fileprovider", file)
                        pendingPhotoUri = uri
                        scope.launch {
                            launcher.launch(uri)
                            if (pendingPhotoFile?.exists() == true && pendingPhotoFile!!.length() > 0) {
                                db.photos().insert(Photo(
                                    uuid = UUID.randomUUID().toString(),
                                    boreholeUuid = boreholeUuid,
                                    category = activeCategory,
                                    filePath = file.absolutePath,
                                    takenAt = java.time.Instant.now().toString()
                                ))
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.CameraAlt, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Сфотографировать (${catPhotos.size}/$max)")
                }
            }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Переиспользуемые UI-компоненты ──────────────────────────

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
            label = { Text(label) },
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt) },
                    onClick = { onSelect(opt); expanded = false }
                )
            }
        }
    }
}
