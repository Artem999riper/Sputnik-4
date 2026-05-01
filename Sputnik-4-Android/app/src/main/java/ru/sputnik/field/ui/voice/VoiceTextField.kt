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
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState

/**
 * OutlinedTextField с иконкой микрофона. При нажатии — голосовой ввод
 * через встроенный Android SpeechRecognizer (бесплатно, ru-RU).
 * Распознанный текст добавляется к уже введённому.
 */
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun VoiceTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier.fillMaxWidth(),
    multiline: Boolean = true,
    speech: SpeechHelper = rememberSpeechHelper()
) {
    val micPerm = rememberPermissionState(Manifest.permission.RECORD_AUDIO)

    // Collect voice results and append to field value
    LaunchedEffect(speech) {
        speech.results.collect { text ->
            onValueChange(if (value.isBlank()) text else "$value $text")
        }
    }

    val isListening = speech.state == SpeechState.LISTENING
    val micColor by animateColorAsState(
        targetValue = when (speech.state) {
            SpeechState.LISTENING -> Color(0xFFDC2626)   // red while recording
            SpeechState.ERROR -> Color(0xFFF59E0B)        // amber on error
            SpeechState.IDLE -> MaterialTheme.colorScheme.primary
        },
        animationSpec = tween(250),
        label = "mic_color"
    )

    // Pulsing scale when listening
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
        modifier = modifier,
        singleLine = !multiline,
        minLines = if (multiline) 2 else 1,
        trailingIcon = {
            if (!speech.isAvailable()) {
                Icon(Icons.Default.MicOff, null,
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = .3f))
            } else {
                IconButton(
                    onClick = {
                        when {
                            !micPerm.status.isGranted -> micPerm.launchPermissionRequest()
                            isListening -> speech.stop()
                            else -> speech.start()
                        }
                    }
                ) {
                    Icon(
                        if (isListening) Icons.Default.Mic else Icons.Default.Mic,
                        contentDescription = if (isListening) "Остановить запись" else "Голосовой ввод",
                        tint = micColor,
                        modifier = Modifier.then(
                            Modifier.graphicsLayer { scaleX = scale; scaleY = scale }
                        )
                    )
                }
            }
        }
    )
}
