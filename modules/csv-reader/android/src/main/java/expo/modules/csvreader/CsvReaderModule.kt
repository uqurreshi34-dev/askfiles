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

        // Call from JS when user exits CSV reader to free memory
        AsyncFunction("evictCache") { _: String ->
            cache = null
            mapOf("evicted" to true)
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
