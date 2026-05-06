package ru.sputnik.field.ui.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

enum class SpeechState { IDLE, LISTENING, ERROR }

class SpeechHelper(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    private val _results = Channel<String>(Channel.BUFFERED)
    val results = _results.receiveAsFlow()

    var state by mutableStateOf(SpeechState.IDLE)
        private set

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start() {
        if (state == SpeechState.LISTENING) return
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { sr ->
            sr.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(p: Bundle?) { state = SpeechState.LISTENING }
                override fun onResults(bundle: Bundle?) {
                    val text = bundle
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull() ?: return
                    _results.trySend(text)
                    state = SpeechState.IDLE
                }
                override fun onError(error: Int) { state = SpeechState.ERROR }
                override fun onEndOfSpeech() { state = SpeechState.IDLE }
                // unused
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(v: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onPartialResults(b: Bundle?) {}
                override fun onEvent(t: Int, b: Bundle?) {}
            })
            sr.startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
            )
        }
    }

    fun stop() {
        recognizer?.stopListening()
        state = SpeechState.IDLE
    }

    fun destroy() {
        recognizer?.destroy()
        recognizer = null
    }
}

// ── Composable обёртка ───────────────────────────────────────

@Composable
fun rememberSpeechHelper(): SpeechHelper {
    val context = androidx.compose.ui.platform.LocalContext.current
    val helper = remember { SpeechHelper(context) }
    DisposableEffect(Unit) { onDispose { helper.destroy() } }
    return helper
}
