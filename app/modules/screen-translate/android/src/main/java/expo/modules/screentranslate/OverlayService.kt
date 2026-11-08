package expo.modules.screentranslate

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.PathInterpolator
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Foreground service that:
 *  1. holds the MediaProjection (screen capture) the user granted,
 *  2. draws a draggable gold bubble over every app,
 *  3. on tap: hides its own UI, grabs the latest screen frame, sends it to the Vaie server
 *     (/api/ai/ocr → Gemini reads the text, Sarvam translates it), and
 *  4. shows the translation in a panel at the bottom of the screen.
 *
 * Colours follow the app theme (Latent palette). Motion: short fades and small slides on one curve.
 */
class OverlayService : Service() {
  companion object {
    const val ACTION_START = "vaie.screentranslate.START"
    const val ACTION_STOP = "vaie.screentranslate.STOP"
    const val ACTION_TARGET = "vaie.screentranslate.TARGET"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    const val EXTRA_SERVER = "serverUrl"
    const val EXTRA_TARGET = "target"
    const val EXTRA_TARGET_LABEL = "targetLabel"

    private const val CHANNEL = "vaie_screen_translate"
    private const val NOTIF_ID = 4711
    private const val MAX_CAPTURE_SIDE = 1600

    // Theme (matches app/src/theme.ts)
    private const val BG = 0xFF181614.toInt()
    private const val RAISED = 0xFF22201D.toInt()
    private const val TEXT = 0xFFF7F3EA.toInt()
    private const val MUTED = 0xFFB5B0A7.toInt()
    private const val ACCENT = 0xFFE8C95F.toInt()
    private const val ON_ACCENT = 0xFF1A1508.toInt()
    private const val HAIRLINE = 0x24FFFFFF

    @Volatile
    var running = false
      private set
  }

  private val ease = PathInterpolator(0.22f, 1f, 0.36f, 1f)
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private lateinit var wm: WindowManager

  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var reader: ImageReader? = null
  private var captureThread: HandlerThread? = null
  private var captureHandler: Handler? = null
  /** Most recent frame. Only touched on [captureHandler]'s thread. */
  private var latest: Image? = null

  private var bubble: TextView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var panel: LinearLayout? = null
  private var panelTitle: TextView? = null
  private var panelBody: TextView? = null

  private var serverUrl = ""
  private var target = "hi"
  private var targetLabel = "हिन्दी"
  private var busy = false
  private var screenW = 0
  private var screenH = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
      }
      ACTION_TARGET -> {
        intent.getStringExtra(EXTRA_TARGET)?.let { target = it }
        intent.getStringExtra(EXTRA_TARGET_LABEL)?.let { targetLabel = it }
        panelTitle?.text = "Vaie · $targetLabel"
      }
      ACTION_START -> {
        // Must be in the foreground (typed mediaProjection) BEFORE asking for the projection.
        startInForeground()
        if (projection != null) return START_NOT_STICKY
        serverUrl = (intent.getStringExtra(EXTRA_SERVER) ?: "").trimEnd('/')
        target = intent.getStringExtra(EXTRA_TARGET) ?: target
        targetLabel = intent.getStringExtra(EXTRA_TARGET_LABEL) ?: targetLabel
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data: Intent? =
          if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
          else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_DATA)
        if (data == null) {
          stopSelf()
          return START_NOT_STICKY
        }
        try {
          wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
          val mpm = getSystemService(MediaProjectionManager::class.java)
          projection = mpm.getMediaProjection(resultCode, data)
          // Android 14+ requires a callback before creating the virtual display.
          projection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
              main.post { stopSelf() }
            }
          }, main)
          setupCapture()
          showBubble()
          running = true
        } catch (e: Exception) {
          stopSelf()
        }
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    bubble?.let { runCatching { wm.removeView(it) } }
    panel?.let { runCatching { wm.removeView(it) } }
    bubble = null
    panel = null
    captureHandler?.post {
      latest?.close()
      latest = null
    }
    runCatching { virtualDisplay?.release() }
    runCatching { reader?.close() }
    runCatching { projection?.stop() }
    captureThread?.quitSafely()
    io.shutdownNow()
    super.onDestroy()
  }

  // ------------------------------------------------------------------ foreground notification

  private fun startInForeground() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Screen translate", NotificationManager.IMPORTANCE_LOW))
    }
    val stop = PendingIntent.getService(
      this, 1, Intent(this, OverlayService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_view)
      .setContentTitle("Vaie screen translate is on")
      .setContentText("Tap the gold bubble to translate what's on screen.")
      .setOngoing(true)
      .addAction(0, "Stop", stop)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  // ------------------------------------------------------------------ capture

  private fun realScreenSize(): Pair<Int, Int> {
    return if (Build.VERSION.SDK_INT >= 30) {
      val b = wm.maximumWindowMetrics.bounds
      b.width() to b.height()
    } else {
      val m = DisplayMetrics()
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getRealMetrics(m)
      m.widthPixels to m.heightPixels
    }
  }

  private fun setupCapture() {
    val (w, h) = realScreenSize()
    screenW = w
    screenH = h
    // Capture at up to 1600px on the long side: sharp enough for small text, light to send.
    val scale = min(1f, MAX_CAPTURE_SIDE.toFloat() / max(w, h))
    val cw = (w * scale).toInt().coerceAtLeast(1)
    val ch = (h * scale).toInt().coerceAtLeast(1)

    val thread = HandlerThread("vaie-capture").also { it.start() }
    captureThread = thread
    val handler = Handler(thread.looper)
    captureHandler = handler

    val r = ImageReader.newInstance(cw, ch, PixelFormat.RGBA_8888, 3)
    r.setOnImageAvailableListener({ ir ->
      val img = try { ir.acquireLatestImage() } catch (e: Exception) { null }
      if (img != null) {
        latest?.close()
        latest = img
      }
    }, handler)
    reader = r
    virtualDisplay = projection?.createVirtualDisplay(
      "vaie-screen", cw, ch, resources.displayMetrics.densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler,
    )
  }

  private fun imageToBitmap(img: Image): Bitmap {
    val plane = img.planes[0]
    val pixelStride = plane.pixelStride
    val rowPadding = plane.rowStride - pixelStride * img.width
    val padded = Bitmap.createBitmap(img.width + rowPadding / pixelStride, img.height, Bitmap.Config.ARGB_8888)
    padded.copyPixelsFromBuffer(plane.buffer)
    return if (rowPadding == 0) padded else Bitmap.createBitmap(padded, 0, 0, img.width, img.height)
  }

  private fun translateScreen() {
    if (busy) return
    busy = true
    // Hide our own UI so it isn't part of the screenshot, then wait for a fresh frame.
    panel?.visibility = View.GONE
    bubble?.visibility = View.INVISIBLE
    captureHandler?.postDelayed({
      val img = latest
      latest = null
      val bmp = try { img?.let { imageToBitmap(it) } } catch (e: Exception) { null } finally { img?.close() }
      main.post {
        bubble?.visibility = View.VISIBLE
        if (bmp == null) {
          busy = false
          showPanel("Couldn't see the screen. Tap the bubble again.")
          return@post
        }
        showPanel("Reading the screen…", loading = true)
        io.execute { sendToServer(bmp) }
      }
    }, 280)
  }

  private fun sendToServer(bmp: Bitmap) {
    val result: String = try {
      val out = ByteArrayOutputStream()
      bmp.compress(Bitmap.CompressFormat.JPEG, 72, out)
      val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
      val conn = (URL("$serverUrl/api/ai/ocr").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8000
        readTimeout = 60000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
      }
      val body = JSONObject().put("image", b64).put("mime", "image/jpeg").put("target", target).toString()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
      conn.disconnect()
      val json = if (text.isNotBlank()) JSONObject(text) else JSONObject()
      when {
        code !in 200..299 -> json.optString("error", "The Vaie server had a problem ($code).")
        json.optString("extracted").isBlank() -> "No text found on this screen."
        else -> json.optString("translated", "")
      }
    } catch (e: java.net.SocketTimeoutException) {
      "This is taking too long. Try again."
    } catch (e: Exception) {
      "Can't reach the Vaie server. Is the laptop on the same Wi-Fi?"
    } finally {
      bmp.recycle()
    }
    main.post {
      busy = false
      showPanel(result)
    }
  }

  // ------------------------------------------------------------------ overlay UI

  private fun dp(v: Int): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
  private fun showBubble() {
    val size = dp(58)
    val view = TextView(this).apply {
      text = "文A"
      setTextColor(ON_ACCENT)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(ACCENT)
        setStroke(dp(1), 0x33000000)
      }
      elevation = dp(6).toFloat()
      contentDescription = "Translate this screen"
      alpha = 0f
      scaleX = 0.7f
      scaleY = 0.7f
    }
    val params = WindowManager.LayoutParams(
      size, size, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screenW - size - dp(12)
      y = screenH / 3
    }

    val slop = ViewConfiguration.get(this).scaledTouchSlop
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var dragging = false
    view.setOnTouchListener { v, e ->
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; dragging = false
          v.animate().scaleX(0.9f).scaleY(0.9f).setDuration(110).setInterpolator(ease).start()
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) dragging = true
          if (dragging) {
            params.x = (startX + dx).toInt()
            params.y = (startY + dy).toInt().coerceIn(0, screenH - size)
            runCatching { wm.updateViewLayout(v, params) }
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          v.animate().scaleX(1f).scaleY(1f).setDuration(260).setInterpolator(ease).start()
          if (dragging) snapToEdge(v, params, size)
          else if (e.actionMasked == MotionEvent.ACTION_UP) translateScreen()
        }
      }
      true
    }
    wm.addView(view, params)
    view.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(360).setInterpolator(ease).start()
    bubble = view
    bubbleParams = params
  }

  private fun snapToEdge(v: View, params: WindowManager.LayoutParams, size: Int) {
    val toX = if (params.x + size / 2 < screenW / 2) dp(12) else screenW - size - dp(12)
    ValueAnimator.ofInt(params.x, toX).apply {
      duration = 320
      interpolator = ease
      addUpdateListener {
        params.x = it.animatedValue as Int
        runCatching { wm.updateViewLayout(v, params) }
      }
      start()
    }
  }

  private fun pill(label: String, filled: Boolean, onClick: () -> Unit): TextView =
    TextView(this).apply {
      text = label
      setTextColor(if (filled) ON_ACCENT else TEXT)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(dp(16), dp(10), dp(16), dp(10))
      background = GradientDrawable().apply {
        cornerRadius = dp(99).toFloat()
        setColor(if (filled) ACCENT else RAISED)
      }
      setOnClickListener { onClick() }
    }

  @SuppressLint("SetTextI18n")
  private fun buildPanel(): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(16), dp(18), dp(16))
      background = GradientDrawable().apply {
        cornerRadius = dp(24).toFloat()
        setColor(BG)
        setStroke(dp(1), HAIRLINE)
      }
      elevation = dp(12).toFloat()
    }
    val header = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val title = TextView(this).apply {
      text = "Vaie · $targetLabel"
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      letterSpacing = 0.04f
    }
    val close = TextView(this).apply {
      text = "✕"
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      setPadding(dp(12), dp(4), dp(4), dp(4))
      contentDescription = "Close"
      setOnClickListener { hidePanel() }
    }
    header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    header.addView(close)

    val body = TextView(this).apply {
      setTextColor(TEXT)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      setLineSpacing(dp(4).toFloat(), 1f)
      setTextIsSelectable(true)
    }
    val scroll = object : ScrollView(this) {
      override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val cap = View.MeasureSpec.makeMeasureSpec((screenH * 0.42f).toInt(), View.MeasureSpec.AT_MOST)
        super.onMeasure(widthMeasureSpec, cap)
      }
    }.apply { addView(body) }

    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.END
    }
    val again = pill("Translate again", true) { translateScreen() }
    val stop = pill("Stop", false) { stopSelf() }
    val gap = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(8) }
    actions.addView(stop)
    actions.addView(again, gap)

    val block = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    root.addView(header, block)
    root.addView(scroll, LinearLayout.LayoutParams(block).apply { topMargin = dp(8) })
    root.addView(actions, LinearLayout.LayoutParams(block).apply { topMargin = dp(14) })

    panelTitle = title
    panelBody = body
    return root
  }

  private fun showPanel(text: String, loading: Boolean = false) {
    var view = panel
    if (view == null) {
      view = buildPanel()
      val params = WindowManager.LayoutParams(
        screenW - dp(24), WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        y = dp(28)
      }
      view.visibility = View.GONE
      wm.addView(view, params)
      panel = view
    }
    panelTitle?.text = "Vaie · $targetLabel"
    panelBody?.text = text
    panelBody?.setTextColor(if (loading) MUTED else TEXT)
    if (view.visibility != View.VISIBLE) {
      view.visibility = View.VISIBLE
      view.alpha = 0f
      view.translationY = dp(20).toFloat()
      view.animate().alpha(1f).translationY(0f).setDuration(340).setInterpolator(ease).start()
    } else {
      // Cross-fade new text in place.
      panelBody?.alpha = 0.3f
      panelBody?.animate()?.alpha(1f)?.setDuration(260)?.setInterpolator(ease)?.start()
    }
  }

  private fun hidePanel() {
    val view = panel ?: return
    view.animate().alpha(0f).translationY(dp(16).toFloat()).setDuration(220).setInterpolator(ease)
      .withEndAction { view.visibility = View.GONE }
      .start()
  }
}
