package expo.modules.csvreader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.FileReader

class CsvReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CsvReader")

    AsyncFunction("parseCsv") { path: String ->
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
        "delimiter" to ","
      )

      // Auto-detect delimiter from first line
      val sample = lines.first()
      val delimiter = listOf(",", ";", "\t", "|")
        .maxByOrNull { delim ->
          sample.count { it == delim.first() }
        } ?: ","

      fun parseLine(line: String): List<String> {
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

      val headers = parseLine(lines.first())
      val rows = lines.drop(1)
        .filter { it.isNotBlank() }
        .map { parseLine(it) }

      mapOf(
        "headers" to headers,
        "rows" to rows,
        "delimiter" to delimiter
      )
    }
  }
}
