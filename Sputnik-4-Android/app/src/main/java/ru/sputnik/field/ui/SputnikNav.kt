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
    object Boreholes : Screen("boreholes/{siteId}") {
        fun go(siteId: String) = "boreholes/$siteId"
    }
    object BoreholeEdit : Screen("borehole_edit/{boreholeUuid}/{siteId}") {
        fun go(uuid: String, siteId: String) = "borehole_edit/$uuid/$siteId"
        const val NEW = "new"
    }
    object Export : Screen("export")
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
                onExport = { nav.navigate(Screen.Export.route) }
            )
        }

        composable(Screen.ImportRefs.route) {
            ImportRefsScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.Brigade.route) {
            BrigadeScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.Sites.route) {
            SitesScreen(
                onBack = { nav.popBackStack() },
                onSiteClick = { siteId -> nav.navigate(Screen.Boreholes.go(siteId)) }
            )
        }

        composable(
            Screen.Boreholes.route,
            arguments = listOf(navArgument("siteId") { type = NavType.StringType })
        ) { back ->
            val siteId = back.arguments!!.getString("siteId")!!
            BoreholesScreen(
                siteId = siteId,
                onBack = { nav.popBackStack() },
                onBorehole = { uuid -> nav.navigate(Screen.BoreholeEdit.go(uuid, siteId)) },
                onAdd = { nav.navigate(Screen.BoreholeEdit.go(Screen.BoreholeEdit.NEW, siteId)) }
            )
        }

        composable(
            Screen.BoreholeEdit.route,
            arguments = listOf(
                navArgument("boreholeUuid") { type = NavType.StringType },
                navArgument("siteId") { type = NavType.StringType }
            )
        ) { back ->
            val uuid = back.arguments!!.getString("boreholeUuid")!!
            val siteId = back.arguments!!.getString("siteId")!!
            BoreholeEditScreen(
                boreholeUuid = uuid.takeIf { it != Screen.BoreholeEdit.NEW },
                siteId = siteId,
                onBack = { nav.popBackStack() }
            )
        }

        composable(Screen.Export.route) {
            ExportScreen(onBack = { nav.popBackStack() })
        }
    }
}
