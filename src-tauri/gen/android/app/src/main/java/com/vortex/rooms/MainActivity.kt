package com.vortex.rooms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {

    companion object {
        private const val MIC_PERMISSION_REQUEST_CODE = 1001
    }

    private var cachedInsetsJs: String? = null
    private lateinit var audioManager: AudioManager

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        // Default to speakerphone so users don't have to hold phone to ear
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true

        // Request microphone permission at startup so getUserMedia works in WebView
        requestMicrophonePermission()

        // Inject safe area insets into the WebView after layout
        setupInsetsInjection()

        // Add JavaScript bridge for audio routing after WebView is available
        window.decorView.post { setupAudioRoutingBridge() }
    }

    private fun requestMicrophonePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                MIC_PERMISSION_REQUEST_CODE
            )
        }
    }

    private fun setupAudioRoutingBridge() {
        val rootView = findViewById<android.view.View>(android.R.id.content)
        val webView = findWebView(rootView) ?: return
        webView.addJavascriptInterface(AudioRoutingBridge(audioManager), "VortexAudioRouting")
    }

    private fun setupInsetsInjection() {
        val rootView = findViewById<android.view.View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(rootView) { _, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            val density = resources.displayMetrics.density

            // Convert px to CSS px (dp)
            val topDp = insets.top / density
            val bottomDp = insets.bottom / density
            val leftDp = insets.left / density
            val rightDp = insets.right / density

            // Build JS to inject CSS custom properties
            cachedInsetsJs = """
                (function() {
                    document.documentElement.style.setProperty('--safe-area-top', '${topDp}px');
                    document.documentElement.style.setProperty('--safe-area-bottom', '${bottomDp}px');
                    document.documentElement.style.setProperty('--safe-area-left', '${leftDp}px');
                    document.documentElement.style.setProperty('--safe-area-right', '${rightDp}px');
                })();
            """.trimIndent()

            // Inject immediately and also on subsequent page loads
            injectInsetsIntoWebView()

            windowInsets
        }
    }

    private fun injectInsetsIntoWebView() {
        val js = cachedInsetsJs ?: return
        val rootView = findViewById<android.view.View>(android.R.id.content)
        val webView = findWebView(rootView) ?: return
        webView.evaluateJavascript(js, null)
    }

    override fun onResume() {
        super.onResume()
        // Re-inject insets when returning from background (e.g. after permission grant)
        window.decorView.post { injectInsetsIntoWebView() }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Reset audio mode when activity is destroyed
        audioManager.mode = AudioManager.MODE_NORMAL
        audioManager.isSpeakerphoneOn = false
    }

    private fun findWebView(view: android.view.View): WebView? {
        if (view is WebView) return view
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                val found = findWebView(view.getChildAt(i))
                if (found != null) return found
            }
        }
        return null
    }
}

class AudioRoutingBridge(private val audioManager: AudioManager) {

    @JavascriptInterface
    fun getOutputMode(): String {
        return if (audioManager.isSpeakerphoneOn) "speaker" else "earpiece"
    }

    @JavascriptInterface
    fun setOutputMode(mode: String) {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = (mode == "speaker")
    }
}
