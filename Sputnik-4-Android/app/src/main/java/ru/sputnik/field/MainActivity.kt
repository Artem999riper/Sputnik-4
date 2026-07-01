package ru.sputnik.field

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import ru.sputnik.field.data.repo.Repositories
import ru.sputnik.field.ui.SputnikNav
import ru.sputnik.field.ui.theme.SputnikTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Repositories.init(this)
        enableEdgeToEdge()
        setContent {
            SputnikTheme {
                SputnikNav()
            }
        }
    }
}
