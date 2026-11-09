package dev.jonashw.adhdassist.listen

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

/*
 * A test of the Pixel's on-device speech recogniser for the spoken map's live screen (E7 phase 2).
 * It only listens and logs. Partial words show grey, final words black, and every restart is marked
 * with how long the recogniser was deaf. "Copy log" puts the whole log on the clipboard to paste
 * into the Claude thread.
 *
 * Two modes:
 *  - Restart at pauses: the classic way. Each session ends after a silence and is started again.
 *  - Segmented session (Android 13+): one long session that hands back a segment at each pause,
 *    if the recogniser supports it. That would be cut and commit with no deaf gap.
 */
class MainActivity : Activity() {

    private enum class Mode(val label: String) {
        RESTART("Restart at pauses"),
        SEGMENTED("Segmented session")
    }

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var mode = Mode.RESTART
    private var onDevice = false

    // What's on screen
    private val committed = SpannableStringBuilder()
    private var partial = ""

    // Measurements
    private var startedAt = 0L
    private var sessionEndedAt = 0L
    private var speechBeganAt = 0L
    private var firstPartialSeen = false
    private val gaps = mutableListOf<Long>()
    private val firstPartialDelays = mutableListOf<Long>()
    private var finals = 0
    private var partials = 0
    private var words = 0
    private var errors = 0
    private val log = StringBuilder()

    private lateinit var startButton: Button
    private lateinit var modeButton: Button
    private lateinit var stats: TextView
    private lateinit var transcript: TextView
    private lateinit var scroll: ScrollView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        buildViews()
        onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
        note("Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), ${Build.MANUFACTURER} ${Build.MODEL}")
        note(if (onDevice) "On-device recogniser: available" else "On-device recogniser: NOT available, falling back to the default recogniser")
        note("Language: ${language()}")
        showStats()
    }

    private fun buildViews() {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        startButton = Button(this).apply {
            text = "Start"
            setOnClickListener { if (listening) stop() else start() }
        }
        modeButton = Button(this).apply {
            text = mode.label
            setOnClickListener {
                if (listening) {
                    toast("Stop first to change the mode")
                } else {
                    mode = if (mode == Mode.RESTART) Mode.SEGMENTED else Mode.RESTART
                    text = mode.label
                }
            }
        }
        val copyButton = Button(this).apply {
            text = "Copy log"
            setOnClickListener { copyLog() }
        }
        val weight = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        buttons.addView(startButton, weight)
        buttons.addView(modeButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.6f))
        buttons.addView(copyButton, weight)
        stats = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setPadding(0, pad / 2, 0, pad / 2)
        }
        transcript = TextView(this).apply {
            textSize = 20f
            setTextColor(Color.BLACK)
            setTextIsSelectable(true)
        }
        scroll = ScrollView(this).apply { addView(transcript) }
        root.addView(buttons)
        root.addView(stats)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    private fun language(): String = Locale.getDefault().toLanguageTag()

    private fun recognitionIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language())
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        if (mode == Mode.SEGMENTED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // One session for up to 30 minutes, handing back a segment at each pause
            putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30L * 60 * 1000)
        }
    }

    private fun start() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            return
        }
        if (mode == Mode.SEGMENTED && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            toast("Segmented sessions need Android 13")
            return
        }
        listening = true
        startedAt = SystemClock.elapsedRealtime()
        sessionEndedAt = 0L
        startButton.text = "Stop"
        note("START mode=${mode.label} engine=${if (onDevice) "on-device" else "default"}")
        recognizer = (if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
                      else SpeechRecognizer.createSpeechRecognizer(this)).also {
            it.setRecognitionListener(listener)
        }
        listen()
    }

    private fun listen() {
        firstPartialSeen = false
        recognizer?.startListening(recognitionIntent())
    }

    private fun stop() {
        listening = false
        startButton.text = "Start"
        recognizer?.stopListening()
        recognizer?.destroy()
        recognizer = null
        note("STOP after ${seconds(SystemClock.elapsedRealtime() - startedAt)}")
        note(summary())
        partial = ""
        render()
    }

    /* A session ended; start the next one at once, and time how long we were deaf */
    private fun restart(why: String) {
        if (!listening) return
        sessionEndedAt = SystemClock.elapsedRealtime()
        note("restart ($why)")
        listen()
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            if (sessionEndedAt > 0) {
                val gap = SystemClock.elapsedRealtime() - sessionEndedAt
                gaps.add(gap)
                mark("⏎ ${gap} ms")
                note("ready again after ${gap} ms deaf")
                sessionEndedAt = 0L
            } else {
                note("ready")
            }
            showStats()
        }

        override fun onBeginningOfSpeech() {
            speechBeganAt = SystemClock.elapsedRealtime()
        }

        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            note("end of speech")
        }

        override fun onError(error: Int) {
            if (!listening) return
            errors++
            note("error ${errorName(error)}")
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> restart(errorName(error))
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT ->
                    main.postDelayed({ restart(errorName(error)) }, 150)
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        note("asking the phone to download the ${language()} speech model; try again once it's done")
                        recognizer?.triggerModelDownload(recognitionIntent())
                    }
                    stop()
                }
                else -> stop()
            }
            showStats()
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val text = best(partialResults) ?: return
            partials++
            if (!firstPartialSeen && speechBeganAt > 0) {
                firstPartialSeen = true
                firstPartialDelays.add(SystemClock.elapsedRealtime() - speechBeganAt)
            }
            partial = text
            render()
        }

        override fun onResults(results: Bundle?) {
            commit(best(results), "final")
            restart("session ended")
        }

        override fun onSegmentResults(segmentResults: Bundle) {
            commit(best(segmentResults), "segment")
        }

        override fun onEndOfSegmentedSession() {
            note("segmented session ended")
            restart("segmented session ended")
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun commit(text: String?, kind: String) {
        partial = ""
        if (!text.isNullOrBlank()) {
            finals++
            words += text.trim().split(Regex("\\s+")).size
            if (committed.isNotEmpty()) committed.append(' ')
            committed.append(text.trim())
            note("$kind: $text")
        } else {
            note("$kind: (empty)")
        }
        render()
        showStats()
    }

    private fun best(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

    private fun mark(text: String) {
        val start = committed.length
        committed.append("  $text  ")
        committed.setSpan(ForegroundColorSpan(Color.rgb(0xD9, 0x77, 0x57)), start, committed.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        render()
    }

    private fun render() {
        val shown = SpannableStringBuilder(committed)
        if (partial.isNotEmpty()) {
            val start = shown.length
            shown.append(' ').append(partial)
            shown.setSpan(ForegroundColorSpan(Color.GRAY), start, shown.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        transcript.text = shown
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun summary(): String {
        val gapText = if (gaps.isEmpty()) "none" else "n=${gaps.size} avg=${gaps.average().toLong()}ms max=${gaps.max()}ms"
        val partialText = if (firstPartialDelays.isEmpty()) "none" else "avg=${firstPartialDelays.average().toLong()}ms max=${firstPartialDelays.max()}ms"
        return "SUMMARY mode=${mode.label} engine=${if (onDevice) "on-device" else "default"} " +
            "finals=$finals words=$words partials=$partials errors=$errors deaf gaps: $gapText; first partial after speech: $partialText"
    }

    private fun showStats() {
        val elapsed = if (listening) seconds(SystemClock.elapsedRealtime() - startedAt) else "-"
        val maxGap = gaps.maxOrNull()?.let { "${it}ms" } ?: "-"
        stats.text = "${if (onDevice) "on-device" else "default engine"} · ${mode.label}\n" +
            "time $elapsed · words $words · restarts ${gaps.size} · worst gap $maxGap · errors $errors"
    }

    private fun note(text: String) {
        val at = if (startedAt > 0) seconds(SystemClock.elapsedRealtime() - startedAt) else "0.0s"
        log.append("+").append(at).append(' ').append(text).append('\n')
    }

    private fun copyLog() {
        val text = log.toString() + summary() + "\n"
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Listen test log", text))
        toast("Log copied; paste it into the Claude thread")
    }

    private fun seconds(ms: Long) = String.format(Locale.US, "%.1fs", ms / 1000.0)

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private fun errorName(code: Int) = when (code) {
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network timeout"
        SpeechRecognizer.ERROR_NETWORK -> "network"
        SpeechRecognizer.ERROR_AUDIO -> "audio"
        SpeechRecognizer.ERROR_SERVER -> "server"
        SpeechRecognizer.ERROR_CLIENT -> "client"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech timeout"
        SpeechRecognizer.ERROR_NO_MATCH -> "no match"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "no permission"
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "too many requests"
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "server disconnected"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "language not supported"
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language unavailable"
        SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT -> "cannot check support"
        else -> "code $code"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) start()
        else toast("The test needs the microphone")
    }

    override fun onDestroy() {
        recognizer?.destroy()
        super.onDestroy()
    }
}
