package com.vortex.rooms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
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

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Request microphone permission at startup so getUserMedia works in WebView
        requestMicrophonePermission()

        // Inject safe area insets into the WebView after layout
        setupInsetsInjection()
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
