package expo.modules.csvreader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.FileReader

private const val MAX_ROWS = 100_000

private data class CsvCache(
    val path: String,
    val headers: List<String>,
    val rows: List<List<String>>,
    val delimiter: String
)

class CsvReaderModule : Module() {

    companion object {
        @Volatile private var cache: CsvCache? = null

        fun evict() {
            cache = null
        }
    }

    override fun definition() = ModuleDefinition {
        Name("CsvReader")

        // Parse file, populate cache, return headers + first page of rows
        AsyncFunction("parseCsv") { path: String ->
            // Evict previous cache immediately — one file at a time
            cache = null

            val lines = mutableListOf<String>()
            BufferedReader(FileReader(path)).use { reader ->
                val sb = StringBuilder()
                var inQuotes = false
                var c: Int
                while (reader.read().also { c = it } != -1) {
                    val ch = c.toChar()
                    when {
                        ch == '"' -> { inQuotes = !inQuotes; sb.append(ch) }
                        ch == '\n' && !inQuotes -> { lines.add(sb.toString()); sb.clear() }
                        ch == '\r' && !inQuotes -> {}
                        else -> sb.append(ch)
                    }
                }
                if (sb.isNotEmpty()) lines.add(sb.toString())
            }

            if (lines.isEmpty()) return@AsyncFunction mapOf(
                "headers" to emptyList<String>(),
                "rows" to emptyList<List<String>>(),
                "delimiter" to ",",
                "totalRows" to 0,
                "truncated" to false
            )

            // Auto-detect delimiter from first line
            val sample = lines.first()
            val delimiter = listOf(",", ";", "\t", "|")
                .maxByOrNull { delim -> sample.count { it == delim.first() } } ?: ","

            val headers = parseLine(lines.first(), delimiter)

            // Cap at MAX_ROWS, drop blank lines
            val dataLines = lines.drop(1).filter { it.isNotBlank() }
            val truncated = dataLines.size > MAX_ROWS
            val cappedLines = if (truncated) dataLines.take(MAX_ROWS) else dataLines
            val rows = cappedLines.map { parseLine(it, delimiter) }

            // Populate cache
            cache = CsvCache(path = path, headers = headers, rows = rows, delimiter = delimiter)

            mapOf(
                "headers" to headers,
                "rows" to rows,
                "delimiter" to delimiter,
                "totalRows" to rows.size,
                "truncated" to truncated
            )
        }

        AsyncFunction("resolveContentUri") { uriString: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction null
            val uri = android.net.Uri.parse(uriString)

            // Query display name from ContentResolver
            var displayName = "file.csv"
            ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (col >= 0) displayName = cursor.getString(col)
                }
            }

            val cacheFile = java.io.File(ctx.cacheDir, "pending_import.csv")
            ctx.contentResolver.openInputStream(uri)?.use { input ->
                cacheFile.outputStream().buffered(65536).use { output ->
                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                    output.flush()
                }
            }
            mapOf("path" to cacheFile.absolutePath, "name" to displayName)
        }

        // Filter against in-memory cache — no file re-read
        AsyncFunction("filterCsv") { path: String, query: String, colIndex: Int, sortColIndex: Int, sortDirection: String ->
            val c = cache
            if (c == null || c.path != path) {
                return@AsyncFunction mapOf(
                    "headers" to emptyList<String>(),
                    "rows" to emptyList<List<String>>(),
                    "delimiter" to ",",
                    "cacheHit" to false
                )
            }

            val q = query.trim().lowercase()

            // Filter
            val filtered = if (q.isEmpty()) {
                c.rows
            } else if (colIndex >= 0 && colIndex < c.headers.size) {
                c.rows.filter { row ->
                    (row.getOrNull(colIndex) ?: "").lowercase().contains(q)
                }
            } else {
                c.rows.filter { row ->
                    row.any { cell -> cell.lowercase().contains(q) }
                }
            }

            // Sort
            val sorted = if (sortColIndex >= 0 && sortColIndex < c.headers.size && sortDirection != "none") {
                filtered.sortedWith(Comparator { a, b ->
                    val av = a.getOrNull(sortColIndex) ?: ""
                    val bv = b.getOrNull(sortColIndex) ?: ""
                    val an = av.toDoubleOrNull()
                    val bn = bv.toDoubleOrNull()
                    val cmp = if (an != null && bn != null) an.compareTo(bn)
                              else av.compareTo(bv)
                    if (sortDirection == "asc") cmp else -cmp
                })
            } else filtered

            mapOf(
                "headers" to c.headers,
                "rows" to sorted,
                "delimiter" to c.delimiter,
                "cacheHit" to true
            )
        }

        AsyncFunction("groupAndSum") { path: String, groupColIndex: Int, valueColIndex: Int ->
            val c = cache
            if (c == null || c.path != path) return@AsyncFunction emptyList<Map<String, Any>>()

            // Group rows by groupCol, sum valueCol per group
            val groups = mutableMapOf<String, Double>()
            for (row in c.rows) {
                val key = (row.getOrNull(groupColIndex) ?: "").trim().ifEmpty { "(empty)" }
                val value = (row.getOrNull(valueColIndex) ?: "").toDoubleOrNull() ?: 0.0
                groups[key] = (groups[key] ?: 0.0) + value
            }

            // Sort by value descending, cap at 20 groups
            groups.entries
                .sortedByDescending { it.value }
                .take(20)
                .map { mapOf("label" to it.key, "value" to it.value) }
        }

        // Call from JS when user exits CSV reader to free memory
        AsyncFunction("evictCache") { _: String ->
            cache = null
            mapOf("evicted" to true)
        }

        AsyncFunction("analyzeColumn") { path: String, colIndex: Int, selectedIndices: List<Int> ->
            val c = cache
            if (c == null || c.path != path) {
                return@AsyncFunction mapOf("isNumeric" to false)
            }

            // Use selected indices if provided, otherwise all cached rows
            val targetRows = if (selectedIndices.isNotEmpty())
                selectedIndices.mapNotNull { c.rows.getOrNull(it) }
            else c.rows

            if (targetRows.isEmpty()) return@AsyncFunction mapOf("isNumeric" to false)

            // Numeric detection — check first 50 rows, 80%+ must parse as Double
            val sample = targetRows.take(50)
            val sampleNumeric = sample.count { row ->
                (row.getOrNull(colIndex) ?: "").toDoubleOrNull() != null
            }
            if (sampleNumeric < sample.size * 0.8) {
                return@AsyncFunction mapOf("isNumeric" to false)
            }

            // Parse all values
            val values = targetRows.mapNotNull { row ->
                (row.getOrNull(colIndex) ?: "").toDoubleOrNull()
            }

            if (values.isEmpty()) return@AsyncFunction mapOf("isNumeric" to false)

            val count = values.size
            val sum = values.sum()
            val avg = sum / count
            val min = values.min()
            val max = values.max()

            // Population standard deviation
            val variance = values.sumOf { (it - avg) * (it - avg) } / count
            val stdDev = kotlin.math.sqrt(variance)

            fun fmt(n: Double): String {
                return if (n % 1.0 == 0.0) "%.0f".format(n)
                else "%.2f".format(n)
            }

            mapOf(
                "isNumeric" to true,
                "count" to count,
                "sum" to fmt(sum),
                "avg" to fmt(avg),
                "min" to fmt(min),
                "max" to fmt(max),
                "stdDev" to fmt(stdDev)
            )
        }
    }

    private fun parseLine(line: String, delimiter: String): List<String> {
        val fields = mutableListOf<String>()
        val sb = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < line.length) {
            val ch = line[i]
            when {
                ch == '"' && !inQuotes -> inQuotes = true
                ch == '"' && inQuotes && i + 1 < line.length && line[i + 1] == '"' -> {
                    sb.append('"'); i++
                }
                ch == '"' && inQuotes -> inQuotes = false
                !inQuotes && line.startsWith(delimiter, i) -> {
                    fields.add(sb.toString()); sb.clear(); i += delimiter.length - 1
                }
                else -> sb.append(ch)
            }
            i++
        }
        fields.add(sb.toString())
        return fields
    }
}
