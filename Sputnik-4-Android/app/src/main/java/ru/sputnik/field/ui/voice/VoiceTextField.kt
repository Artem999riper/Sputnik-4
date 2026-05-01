package ru.sputnik.field.ui.voice

import android.Manifest
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun VoiceTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    multiline: Boolean = true,
    speech: SpeechHelper = rememberSpeechHelper()
) {
    val micPerm = rememberPermissionState(Manifest.permission.RECORD_AUDIO)

    LaunchedEffect(speech) {
        speech.results.collect { text ->
            onValueChange(if (value.isBlank()) text else "$value $text")
        }
    }

    val isListening = speech.state == SpeechState.LISTENING
    val micColor by animateColorAsState(
        targetValue = when (speech.state) {
            SpeechState.LISTENING -> Color(0xFFDC2626)
            SpeechState.ERROR    -> Color(0xFFF59E0B)
            SpeechState.IDLE     -> MaterialTheme.colorScheme.primary
        },
        animationSpec = tween(250),
        label = "mic_color"
    )

    val scale by animateFloatAsState(
        targetValue = if (isListening) 1.2f else 1f,
        animationSpec = if (isListening)
            infiniteRepeatable(tween(600), RepeatMode.Reverse)
        else tween(200),
        label = "mic_scale"
    )

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        singleLine = !multiline,
        minLines = if (multiline) 2 else 1,
        trailingIcon = {
            if (!speech.isAvailable()) {
                Icon(Icons.Default.MicOff, null,
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = .3f))
            } else {
                IconButton(onClick = {
                    when {
                        !micPerm.status.isGranted -> micPerm.launchPermissionRequest()
                        isListening -> speech.stop()
                        else -> speech.start()
                    }
                }) {
                    Icon(
                        Icons.Default.Mic,
                        contentDescription = if (isListening) "Остановить" else "Голосовой ввод",
                        tint = micColor,
                        modifier = Modifier.graphicsLayer(scaleX = scale, scaleY = scale)
                    )
                }
            }
        }
    )
}
