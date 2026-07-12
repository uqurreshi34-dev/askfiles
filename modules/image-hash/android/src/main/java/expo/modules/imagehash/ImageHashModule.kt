package expo.modules.imagehash

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.cos
import kotlin.math.sqrt

class ImageHashModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("ImageHash")

        Events("onScanProgress")

        AsyncFunction("scanImageDuplicates") {
            val ctx = appContext.reactContext
                ?: throw Exception("No context")
            scanDuplicates(ctx)
        }
    }

    // ── pHash ────────────────────────────────────────────────────────────────

    private fun computePhash(path: String): LongArray? {
        val opts = BitmapFactory.Options().apply {
            inSampleSize = 4          // pre-scale before full decode
            inPreferredConfig = Bitmap.Config.RGB_565  // half the memory of ARGB_8888
        }
        val raw = try {
            BitmapFactory.decodeFile(path, opts) ?: return null
        } catch (oom: OutOfMemoryError) {
            return null
        }

        // Scale to 32×32 for DCT input
        val scaled = try {
            Bitmap.createScaledBitmap(raw, 32, 32, true)
        } catch (oom: OutOfMemoryError) {
            raw.recycle()
            return null
        } finally {
            if (!raw.isRecycled) raw.recycle()
        }

        // Convert to greyscale float array
        val pixels = FloatArray(32 * 32)
        for (y in 0 until 32) {
            for (x in 0 until 32) {
                val c = scaled.getPixel(x, y)
                pixels[y * 32 + x] =
                    0.299f * Color.red(c) +
                    0.587f * Color.green(c) +
                    0.114f * Color.blue(c)
            }
        }
        scaled.recycle()

        // 2-D DCT — keep top-left 8×8
        val dct = FloatArray(8 * 8)
        for (u in 0 until 8) {
            for (v in 0 until 8) {
                var sum = 0.0
                val cu = if (u == 0) 1.0 / sqrt(2.0) else 1.0
                val cv = if (v == 0) 1.0 / sqrt(2.0) else 1.0
                for (y in 0 until 32) {
                    for (x in 0 until 32) {
                        sum += pixels[y * 32 + x] *
                               cos((2 * x + 1) * u * Math.PI / 64) *
                               cos((2 * y + 1) * v * Math.PI / 64)
                    }
                }
                dct[u * 8 + v] = (cu * cv * sum / 4).toFloat()
            }
        }

        // Skip DC component (index 0) — use remaining 63 values
        val vals = dct.copyOfRange(1, 64)
        val median = vals.sorted().let {
            (it[it.size / 2 - 1] + it[it.size / 2]) / 2f
        }

        // Build two 64-bit longs (128 bits total for better accuracy)
        var h0 = 0L; var h1 = 0L
        for (i in 0 until 63) {
            if (i < 63) {
                if (dct[i] > median) h0 = h0 or (1L shl i)
            }
        }
        return longArrayOf(h0, h1)
    }

    private fun hammingDistance(a: LongArray, b: LongArray): Int {
        var dist = 0
        for (i in a.indices) {
            dist += java.lang.Long.bitCount(a[i] xor b[i])
        }
        return dist
    }

    // ── scan ─────────────────────────────────────────────────────────────────

    private fun scanDuplicates(ctx: Context): List<Map<String, Any>> {
        val executor = Executors.newSingleThreadExecutor()
        try {
            return executor.submit<List<Map<String, Any>>> {
                doScan(ctx)
            }.get(5, TimeUnit.MINUTES) ?: emptyList()
        } catch (e: Exception) {
            android.util.Log.e("ImageHash", "scan failed: ${e.message}")
            return emptyList()
        } finally {
            executor.shutdownNow()
        }
    }

    private fun doScan(ctx: Context): List<Map<String, Any>> {
        data class ImgEntry(
            val uri: String,
            val path: String,
            val name: String,
            val size: Long,
            val dateAdded: Long
        )

        // Query MediaStore for images > 10 KB
        val images = mutableListOf<ImgEntry>()
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_ADDED
        )
        ctx.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            "${MediaStore.Images.Media.SIZE} > 10240",
            null,
            null
        )?.use { cursor ->
            val idCol    = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val dataCol  = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
            val nameCol  = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val sizeCol  = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val dateCol  = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            while (cursor.moveToNext()) {
                val id   = cursor.getLong(idCol)
                val path = cursor.getString(dataCol) ?: continue
                val name = cursor.getString(nameCol) ?: continue
                val size = cursor.getLong(sizeCol)
                val date = cursor.getLong(dateCol)
                val uri = "file://$path"
                images.add(ImgEntry(uri, path, name, size, date))
            }
        }
        val seen = mutableSetOf<String>()
        val deduped = images.filter { seen.add(it.path) }
        images.clear()
        images.addAll(deduped)

        if (images.isEmpty()) return emptyList()

        // Compute hashes — skip on OOM, null = skip
        data class Hashed(val entry: ImgEntry, val hash: LongArray)
        val total = images.size
        val hashed = mutableListOf<Hashed>()
        for ((index, img) in images.withIndex()) {
            val h = try { computePhash(img.path) } catch (e: Exception) { null }
            if (h != null) hashed.add(Hashed(img, h))
            if (index % 50 == 0) {
                sendEvent("onScanProgress", mapOf(
                    "scanned" to index + 1,
                    "total" to total
                ))
            }
        }

        // LSH grouping — 7 bands of 9 bits each
        // Images similar within THRESHOLD collide in at least one band (~99.9% recall)
        val THRESHOLD = 10
        val BANDS = 7
        val BITS_PER_BAND = 9
        val BAND_MASK = (1L shl BITS_PER_BAND) - 1L

        val lshBuckets = Array(BANDS) { HashMap<Long, MutableList<Int>>() }
        for (i in hashed.indices) {
            for (band in 0 until BANDS) {
                val key = (hashed[i].hash[0] ushr (band * BITS_PER_BAND)) and BAND_MASK
                lshBuckets[band].getOrPut(key) { mutableListOf() }.add(i)
            }
        }

        val used = BooleanArray(hashed.size)
        val groups = mutableListOf<List<ImgEntry>>()

        for (i in hashed.indices) {
            if (used[i]) continue
            val candidates = mutableSetOf<Int>()
            for (band in 0 until BANDS) {
                val key = (hashed[i].hash[0] ushr (band * BITS_PER_BAND)) and BAND_MASK
                lshBuckets[band][key]?.forEach { j -> if (j > i) candidates.add(j) }
            }

            val group = mutableListOf(hashed[i].entry)
            for (j in candidates) {
                if (used[j]) continue
                if (hammingDistance(hashed[i].hash, hashed[j].hash) <= THRESHOLD) {
                    group.add(hashed[j].entry)
                    used[j] = true
                }
            }

            if (group.size >= 2) {
                used[i] = true
                groups.add(group)
            }
        }

        // Sort groups by wasted space descending
        return groups
            .sortedByDescending { g ->
                val maxSize = g.maxOf { it.size }
                maxSize * (g.size - 1)
            }
            .mapIndexed { idx, group ->
                mapOf(
                    "key" to "img_group_$idx",
                    "files" to group.map { f ->
                        mapOf(
                            "uri"       to f.uri,
                            "path"      to f.path,
                            "name"      to f.name,
                            "size"      to f.size,
                            "dateAdded" to f.dateAdded
                        )
                    }
                )
            }
    }
}
