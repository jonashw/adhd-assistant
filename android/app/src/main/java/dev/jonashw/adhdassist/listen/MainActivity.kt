package dev.jonashw.adhdassist.listen

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.provider.MediaStore
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
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
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
 *  - Own mic, no gaps (Android 13+): the app records the microphone itself and feeds the recogniser
 *    through a pipe. Audio that arrives while the recogniser restarts is held and handed to the next
 *    session, so nothing said at the edge of a pause is lost.
 *
 * Build 2 (after the first log): segmented sessions fell back to plain restarts on the Pixel 11, and
 * each restart left about 0.4 s deaf, which dropped words at the start of the next phrase.
 */
class MainActivity : Activity() {

    private enum class Mode(val label: String) {
        RESTART("Restart at pauses"),
        SEGMENTED("Segmented session"),
        OWN_MIC("Own mic, no gaps")
    }

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var mode = Mode.OWN_MIC
    private var onDevice = false
    private var punctuation = true

    // Own mic: the app records, and a pump thread writes into the current session's pipe
    private val pipeLock = Object()
    private var recorder: AudioRecord? = null
    private var pump: Thread? = null
    private var pipeOut: OutputStream? = null
    private val heldAudio = ByteArrayOutputStream()
    private val sampleRate = 16000

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
    private var segments = 0
    private var partials = 0
    private var words = 0
    private var errors = 0
    private val log = StringBuilder()

    private lateinit var startButton: Button
    private lateinit var modeLabel: TextView
    private lateinit var modeGroup: RadioGroup
    private lateinit var punctuationSwitch: Switch
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
        // Settings show their current state: a radio list for the mode, a switch for punctuation.
        // Both are locked while listening.
        modeLabel = TextView(this).apply {
            text = "Mode"
            textSize = 14f
            setPadding(0, pad / 2, 0, 0)
        }
        modeGroup = RadioGroup(this).apply {
            orientation = RadioGroup.VERTICAL
            Mode.values().forEach { m ->
                addView(RadioButton(this@MainActivity).apply {
                    id = View.generateViewId()
                    text = m.label
                    tag = m
                    isChecked = m == mode
                })
            }
            setOnCheckedChangeListener { group, checkedId ->
                mode = group.findViewById<RadioButton>(checkedId).tag as Mode
            }
        }
        punctuationSwitch = Switch(this).apply {
            text = "Punctuation"
            isChecked = punctuation
            setOnCheckedChangeListener { _, on -> punctuation = on }
        }
        val copyButton = Button(this).apply {
            text = "Save log"
            setOnClickListener { saveLog() }
        }
        val weight = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        buttons.addView(startButton, weight)
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
        root.addView(modeLabel)
        root.addView(modeGroup)
        root.addView(punctuationSwitch)
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (punctuation) {
                // Punctuation and capitals, if the recogniser can add them
                putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY)
            }
            if (mode == Mode.SEGMENTED) {
                // One session for up to 30 minutes, handing back a segment at each pause
                putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30L * 60 * 1000)
            }
            if (mode == Mode.OWN_MIC) {
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, newPipe())
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, sampleRate)
                // A segmented session over our own audio, if the recogniser supports it
                putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
            }
        }
    }

    /* A fresh pipe for the next session. Audio held since the last one ended goes in first. */
    private fun newPipe(): ParcelFileDescriptor {
        val (read, write) = ParcelFileDescriptor.createPipe()
        val out = ParcelFileDescriptor.AutoCloseOutputStream(write)
        synchronized(pipeLock) {
            closePipe()
            val held = heldAudio.size()
            if (held > 0) {
                try {
                    out.write(heldAudio.toByteArray())
                    note("handed ${held / (sampleRate * 2 / 1000)} ms of held audio to the new session")
                } catch (e: IOException) {
                    note("couldn't hand over held audio: ${e.message}")
                }
                heldAudio.reset()
            }
            pipeOut = out
        }
        return read
    }

    /* Ends the current session's audio; anything recorded from now on is held for the next one */
    private fun closePipe() {
        synchronized(pipeLock) {
            try { pipeOut?.close() } catch (_: IOException) {}
            pipeOut = null
        }
    }

    private fun startOwnMic(): Boolean {
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuffer, sampleRate * 2))
        } catch (e: SecurityException) {
            note("no microphone: ${e.message}")
            return false
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            note("the microphone wouldn't open")
            rec.release()
            return false
        }
        rec.startRecording()
        recorder = rec
        heldAudio.reset()
        pump = Thread {
            val buffer = ByteArray(sampleRate / 10 * 2) // 100 ms
            while (!Thread.currentThread().isInterrupted) {
                val n = rec.read(buffer, 0, buffer.size)
                if (n <= 0) continue
                synchronized(pipeLock) {
                    val out = pipeOut
                    if (out == null) {
                        // Between sessions: hold it, up to 10 s
                        if (heldAudio.size() < sampleRate * 2 * 10) heldAudio.write(buffer, 0, n)
                    } else {
                        try {
                            out.write(buffer, 0, n)
                        } catch (e: IOException) {
                            // The recogniser closed its end; hold audio until the next session
                            pipeOut = null
                            heldAudio.write(buffer, 0, n)
                        }
                    }
                }
            }
        }.apply { name = "mic pump"; start() }
        note("own mic recording at $sampleRate Hz")
        return true
    }

    private fun stopOwnMic() {
        pump?.interrupt()
        pump = null
        closePipe()
        recorder?.let {
            try { it.stop() } catch (_: IllegalStateException) {}
            it.release()
        }
        recorder = null
    }

    private fun start() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            return
        }
        if (mode != Mode.RESTART && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            toast("This mode needs Android 13")
            return
        }
        if (mode == Mode.OWN_MIC && !startOwnMic()) {
            toast("The microphone wouldn't open")
            return
        }
        listening = true
        startedAt = SystemClock.elapsedRealtime()
        sessionEndedAt = 0L
        startButton.text = "Stop"
        lockSettings(true)
        note("START mode=${mode.label} engine=${if (onDevice) "on-device" else "default"} punctuation=${if (punctuation) "on" else "off"}")
        recognizer = (if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
                      else SpeechRecognizer.createSpeechRecognizer(this)).also {
            it.setRecognitionListener(listener)
        }
        listen()
    }

    private fun lockSettings(locked: Boolean) {
        for (i in 0 until modeGroup.childCount) modeGroup.getChildAt(i).isEnabled = !locked
        punctuationSwitch.isEnabled = !locked
        modeLabel.text = if (locked) "Mode (stop to change)" else "Mode"
    }

    private fun listen() {
        firstPartialSeen = false
        recognizer?.startListening(recognitionIntent())
    }

    private fun stop() {
        listening = false
        startButton.text = "Start"
        lockSettings(false)
        recognizer?.stopListening()
        recognizer?.destroy()
        recognizer = null
        stopOwnMic()
        note("STOP after ${seconds(SystemClock.elapsedRealtime() - startedAt)}")
        note(summary())
        partial = ""
        render()
    }

    /* A session ended; start the next one at once, and time how long we were deaf */
    private fun restart(why: String) {
        if (!listening) return
        sessionEndedAt = SystemClock.elapsedRealtime()
        closePipe()
        note("restart ($why)")
        listen()
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            if (sessionEndedAt > 0) {
                val gap = SystemClock.elapsedRealtime() - sessionEndedAt
                gaps.add(gap)
                if (mode == Mode.OWN_MIC) {
                    mark("⏎")
                    note("ready again after ${gap} ms (audio held, so nothing should be lost)")
                } else {
                    mark("⏎ ${gap} ms")
                    note("ready again after ${gap} ms deaf")
                }
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
            segments++
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
            "finals=$finals segments=$segments words=$words partials=$partials errors=$errors deaf gaps: $gapText; first partial after speech: $partialText"
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

    /* A long log is too big to paste into a chat, so it's also saved as a file in Downloads to attach */
    private fun saveLog() {
        val text = log.toString() + summary() + "\n"
        val name = "listen-test-" + java.text.SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.US).format(java.util.Date()) + ".txt"
        try {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, "text/plain")
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Downloads refused the file")
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
            copyLog(quiet = true)
            toast("Saved Downloads/$name (also copied). Attach the file in the Claude thread")
        } catch (e: Exception) {
            copyLog()
            toast("Couldn't save the file (${e.message}); copied instead")
        }
    }

    private fun copyLog(quiet: Boolean = false) {
        val text = log.toString() + summary() + "\n"
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Listen test log", text))
        if (!quiet) toast("Log copied; paste it into the Claude thread")
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
        stopOwnMic()
        super.onDestroy()
    }
}
