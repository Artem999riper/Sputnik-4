package ru.sputnik.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun HomeScreen(
    onImportRefs: () -> Unit,
    onBrigade: () -> Unit,
    onSites: () -> Unit,
    onExport: () -> Unit
) {
    Scaffold { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
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
