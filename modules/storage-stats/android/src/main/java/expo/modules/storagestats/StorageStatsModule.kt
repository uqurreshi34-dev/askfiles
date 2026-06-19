package expo.modules.storagestats

import android.app.usage.StorageStatsManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.storage.StorageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

class StorageStatsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("StorageStats")

         View(StorageStatsView::class) {
            Prop("usedBytes") { view: StorageStatsView, value: Double ->
                view.usedBytes = value
            }
            Prop("totalBytes") { view: StorageStatsView, value: Double ->
                view.totalBytes = value
            }
            Prop("trackColor") { view: StorageStatsView, color: String ->
                view.trackColor = color
            }
            Prop("strokeWidth") { view: StorageStatsView, width: Float ->
                view.strokeWidth = width
            }
        }

        AsyncFunction("getStorageStats") {
            val context = appContext.reactContext ?: return@AsyncFunction mapOf("error" to "No context")

            val GB = 1_073_741_824L
            val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val storageStatsManager = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
                    val uuid: UUID = StorageManager.UUID_DEFAULT
                    val total = storageStatsManager.getTotalBytes(uuid)
                    val free = storageStatsManager.getFreeBytes(uuid)
                    val used = total - free
                    val marketedTotal = sizes.minByOrNull { kotlin.math.abs(it - total) } ?: total
                    return@AsyncFunction mapOf(
                        "total" to marketedTotal.toDouble(),
                        "used" to used.toDouble(),
                        "free" to free.toDouble()
                    )
                } catch (e: Exception) {
                    // fall through to StatFs fallback
                }
            }

            // Fallback for Android < 8
            val extPath = Environment.getExternalStorageDirectory().absolutePath
            val extStat = StatFs(extPath)
            val rawTotal = extStat.blockCountLong * extStat.blockSizeLong
            val free = extStat.availableBlocksLong * extStat.blockSizeLong
            val used = rawTotal - free
            val marketedTotal = sizes.minByOrNull { kotlin.math.abs(it - rawTotal) } ?: rawTotal
            mapOf(
                "total" to marketedTotal.toDouble(),
                "used" to used.toDouble(),
                "free" to free.toDouble()
            )
        }

        AsyncFunction("getVolumeStats") { path: String ->
            try {
                val stat = StatFs(path)
                val total = stat.blockCountLong * stat.blockSizeLong
                val free = stat.availableBlocksLong * stat.blockSizeLong
                mapOf(
                    "total" to total.toDouble(),
                    "free" to free.toDouble(),
                    "used" to (total - free).toDouble()
                )
            } catch (e: Exception) {
                mapOf("error" to "Could not read volume")
            }
        }

        AsyncFunction("isStorageManager") {
            Environment.isExternalStorageManager()
        }

        AsyncFunction("getStorageVolumes") {
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
            val volumes = mutableListOf<Map<String, String>>()

            // Always add internal storage
            volumes.add(mapOf(
                "name" to "Internal Storage",
                "path" to "/storage/emulated/0",
                "type" to "internal"
            ))

            // Check for removable SD cards
            val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
                ?: return@AsyncFunction volumes

            storageManager.storageVolumes.forEach { vol ->
                if (vol.isRemovable && vol.state == Environment.MEDIA_MOUNTED) {
                    val path = vol.directory?.absolutePath ?: return@forEach
                    volumes.add(mapOf(
                        "name" to (vol.getDescription(context) ?: "SD Card"),
                        "path" to path,
                        "type" to "sdcard"
                    ))
                }
            }

            volumes
        }

        Function("isAppLockEnabledSync") {
            val context = appContext.reactContext ?: return@Function false
            val prefs = context.getSharedPreferences("askfiles_lock", Context.MODE_PRIVATE)
            prefs.getBoolean("app_lock_enabled", false)
        }

        Function("setAppLockEnabledSync") { enabled: Boolean ->
            val context = appContext.reactContext ?: return@Function
            val prefs = context.getSharedPreferences("askfiles_lock", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("app_lock_enabled", enabled).apply()
        }

        AsyncFunction("showBiometricPrompt") { title: String, subtitle: String ->
            val activity = appContext.activityProvider?.currentActivity as? FragmentActivity
                ?: return@AsyncFunction "error"

            val biometricManager = BiometricManager.from(activity)
            val canAuth = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
                return@AsyncFunction "unavailable"
            }

            val future = java.util.concurrent.CompletableFuture<String>()

            activity.runOnUiThread {
                val executor = ContextCompat.getMainExecutor(activity)
                val callback = object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        future.complete("success")
                    }
                    override fun onAuthenticationFailed() {
                        // let user try again — don't complete
                    }
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        future.complete("cancelled")
                    }
                }

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText("Use PIN")
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG or
                        BiometricManager.Authenticators.BIOMETRIC_WEAK
                    )
                    .build()

                BiometricPrompt(activity, executor, callback).authenticate(promptInfo)
            }

            future.get()
        }
    }
}
