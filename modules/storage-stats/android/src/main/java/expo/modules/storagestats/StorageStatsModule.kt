package expo.modules.storagestats

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.os.Environment
import android.os.StatFs

class StorageStatsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("StorageStats")

        AsyncFunction("getStorageStats") {
            val extPath = Environment.getExternalStorageDirectory().absolutePath
            val extStat = StatFs(extPath)
            val rawTotal = extStat.blockCountLong * extStat.blockSizeLong
            val free = extStat.availableBlocksLong * extStat.blockSizeLong
            val used = rawTotal - free
            val GB = 1_073_741_824L
            val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }
            val marketedTotal = sizes.first { it >= rawTotal }
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
