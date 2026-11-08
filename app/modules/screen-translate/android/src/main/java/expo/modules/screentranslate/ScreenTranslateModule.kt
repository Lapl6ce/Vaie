package expo.modules.screentranslate

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for system-wide screen translation.
 *
 * Flow: JS checks/requests the "display over other apps" permission, then calls start().
 * start() shows Android's own screen-capture consent dialog; on "Start now" we launch
 * [OverlayService], which owns the MediaProjection, the floating bubble and the panel.
 */
class ScreenTranslateModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingConfig: Triple<String, String, String>? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("ScreenTranslate")

    Function("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("isRunning") {
      OverlayService.running
    }

    AsyncFunction("start") { serverUrl: String, target: String, targetLabel: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Open Vaie and try again.", null)
        return@AsyncFunction
      }
      if (!Settings.canDrawOverlays(context)) {
        promise.reject("E_NO_OVERLAY", "Allow \"Display over other apps\" for Vaie first.", null)
        return@AsyncFunction
      }
      // Already running: just switch language.
      if (OverlayService.running) {
        sendTarget(target, targetLabel)
        promise.resolve(true)
        return@AsyncFunction
      }
      pendingPromise?.resolve(false)
      pendingPromise = promise
      pendingConfig = Triple(serverUrl, target, targetLabel)
      val mpm = context.getSystemService(MediaProjectionManager::class.java)
      activity.runOnUiThread {
        activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_CAPTURE)
      }
    }

    Function("setTarget") { target: String, targetLabel: String ->
      if (OverlayService.running) sendTarget(target, targetLabel)
    }

    Function("stop") {
      if (OverlayService.running) {
        context.startService(Intent(context, OverlayService::class.java).setAction(OverlayService.ACTION_STOP))
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CAPTURE) return@OnActivityResult
      val promise = pendingPromise ?: return@OnActivityResult
      val cfg = pendingConfig
      pendingPromise = null
      pendingConfig = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null || cfg == null) {
        promise.resolve(false)
        return@OnActivityResult
      }
      val intent = Intent(context, OverlayService::class.java).apply {
        action = OverlayService.ACTION_START
        putExtra(OverlayService.EXTRA_RESULT_CODE, payload.resultCode)
        putExtra(OverlayService.EXTRA_DATA, data)
        putExtra(OverlayService.EXTRA_SERVER, cfg.first)
        putExtra(OverlayService.EXTRA_TARGET, cfg.second)
        putExtra(OverlayService.EXTRA_TARGET_LABEL, cfg.third)
      }
      try {
        ContextCompat.startForegroundService(context, intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("E_START", e.message ?: "Could not start screen translate", e)
      }
    }
  }

  private fun sendTarget(target: String, label: String) {
    context.startService(
      Intent(context, OverlayService::class.java)
        .setAction(OverlayService.ACTION_TARGET)
        .putExtra(OverlayService.EXTRA_TARGET, target)
        .putExtra(OverlayService.EXTRA_TARGET_LABEL, label)
    )
  }

  companion object {
    private const val REQUEST_CAPTURE = 47110
  }
}
