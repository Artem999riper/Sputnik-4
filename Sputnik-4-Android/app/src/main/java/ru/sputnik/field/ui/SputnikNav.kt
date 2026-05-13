package ru.sputnik.field.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import ru.sputnik.field.ui.screens.*

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object ImportRefs : Screen("import_refs")
    object Brigade : Screen("brigade")
    object Sites : Screen("sites")
    object Volumes : Screen("volumes/{siteId}") {
        fun go(siteId: String) = "volumes/$siteId"
    }
    object Boreholes : Screen("boreholes/{volumeId}") {
        fun go(volumeId: String) = "boreholes/$volumeId"
    }
    object TaskPoints : Screen("task_points/{volumeId}") {
        fun go(volumeId: String) = "task_points/$volumeId"
    }
    object BoreholeEdit : Screen("borehole_edit/{boreholeUuid}/{volumeId}") {
        fun go(uuid: String, volumeId: String) = "borehole_edit/$uuid/$volumeId"
        const val NEW = "new"
    }
    object Export : Screen("export")
    object Vedomosti : Screen("vedomosti")
    object Summary : Screen("summary")
}

@Composable
fun SputnikNav() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = Screen.Home.route) {

        composable(Screen.Home.route) {
            HomeScreen(
                onImportRefs = { nav.navigate(Screen.ImportRefs.route) },
                onBrigade = { nav.navigate(Screen.Brigade.route) },
                onSites = { nav.navigate(Screen.Sites.route) },
                onExport = { nav.navigate(Screen.Export.route) },
                onVedomosti = { nav.navigate(Screen.Vedomosti.route) },
                onSummary = { nav.navigate(Screen.Summary.route) }
            )
        }

        composable(Screen.ImportRefs.route) {
            ImportRefsScreen(onBack = { nav.navigateUp() })
        }

        composable(Screen.Brigade.route) {
            BrigadeScreen(onBack = { nav.navigateUp() })
        }

        composable(Screen.Sites.route) {
            SitesScreen(
                onBack = { nav.navigateUp() },
                onSiteClick = { siteId -> nav.navigate(Screen.Volumes.go(siteId)) }
            )
        }

        composable(
            Screen.Volumes.route,
            arguments = listOf(navArgument("siteId") { type = NavType.StringType })
        ) { back ->
            val siteId = back.arguments!!.getString("siteId")!!
            VolumesScreen(
                siteId = siteId,
                onBack = { nav.navigateUp() },
                onOpenDrilling = { volumeId -> nav.navigate(Screen.Boreholes.go(volumeId)) },
                onOpenTaskPoints = { volumeId -> nav.navigate(Screen.TaskPoints.go(volumeId)) }
            )
        }

        composable(
            Screen.Boreholes.route,
            arguments = listOf(navArgument("volumeId") { type = NavType.StringType })
        ) { back ->
            val volumeId = back.arguments!!.getString("volumeId")!!
            BoreholesScreen(
                volumeId = volumeId,
                onBack = { nav.navigateUp() },
                onBorehole = { uuid -> nav.navigate(Screen.BoreholeEdit.go(uuid, volumeId)) },
                onAdd = { nav.navigate(Screen.BoreholeEdit.go(Screen.BoreholeEdit.NEW, volumeId)) },
                onNavigateToBrigade = { nav.navigate(Screen.Brigade.route) }
            )
        }

        composable(
            Screen.TaskPoints.route,
            arguments = listOf(navArgument("volumeId") { type = NavType.StringType })
        ) { back ->
            val volumeId = back.arguments!!.getString("volumeId")!!
            TaskPointsScreen(
                volumeId = volumeId,
                onBack = { nav.navigateUp() },
                onNavigateToBrigade = { nav.navigate(Screen.Brigade.route) }
            )
        }

        composable(
            Screen.BoreholeEdit.route,
            arguments = listOf(
                navArgument("boreholeUuid") { type = NavType.StringType },
                navArgument("volumeId") { type = NavType.StringType }
            )
        ) { back ->
            val uuid = back.arguments!!.getString("boreholeUuid")!!
            val volumeId = back.arguments!!.getString("volumeId")!!
            BoreholeEditScreen(
                boreholeUuid = uuid.takeIf { it != Screen.BoreholeEdit.NEW },
                volumeId = volumeId,
                onBack = { nav.navigateUp() }
            )
        }

        composable(Screen.Export.route) {
            ExportScreen(onBack = { nav.navigateUp() })
        }

        composable(Screen.Vedomosti.route) {
            VedomostiScreen(onBack = { nav.navigateUp() })
        }

        composable(Screen.Summary.route) {
            SummaryScreen(onBack = { nav.navigateUp() })
        }
    }
}
