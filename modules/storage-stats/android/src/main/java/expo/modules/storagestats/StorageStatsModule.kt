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

class StorageStatsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("StorageStats")

        AsyncFunction("getStorageStats") {
            val context = appContext.reactContext ?: return@AsyncFunction mapOf("error" to "No context")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
                    val storageStatsManager = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
                    val uuid: UUID = StorageManager.UUID_DEFAULT
                    val total = storageStatsManager.getTotalBytes(uuid)
                    val free = storageStatsManager.getFreeBytes(uuid)
                    val used = total - free
                    val GB = 1_073_741_824L
                    val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }
                    val marketedTotal = sizes.firstOrNull { it >= total } ?: total
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
            val GB = 1_073_741_824L
            val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }
            val marketedTotal = sizes.firstOrNull { it >= rawTotal } ?: rawTotal
            mapOf(
                "total" to marketedTotal.toDouble(),
                "used" to used.toDouble(),
                "free" to free.toDouble()
            )
        }

        AsyncFunction("isStorageManager") {
            Environment.isExternalStorageManager()
        }
    }
}
