package expo.modules.texteditor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileReader
import java.io.FileWriter
import android.graphics.Color

class TextEditorModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TextEditor")

        AsyncFunction("readTextFile") { path: String ->
            val file = java.io.File(path)
            if (file.length() > 1 * 1024 * 1024) {
                throw Exception("FILE_TOO_LARGE")
            }
            val sb = StringBuilder()
            BufferedReader(FileReader(path)).use { reader ->
                var line = reader.readLine()
                while (line != null) {
                    sb.append(line).append('\n')
                    line = reader.readLine()
                }
            }
            sb.toString()
        }

        AsyncFunction("writeTextFile") { path: String, content: String ->
            val target = File(path)
            val temp = File(target.parent, "${target.name}.tmp")
            BufferedWriter(FileWriter(temp)).use { writer ->
                writer.write(content)
                writer.flush()
            }
            temp.renameTo(target)
        }

        AsyncFunction("resolveContentUri") { uriString: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction null
            val uri = android.net.Uri.parse(uriString)

            var displayName = "file.txt"
            ctx.contentResolver.query(
                uri,
                arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (col >= 0) displayName = cursor.getString(col)
                }
            }

            val cacheFile = File(ctx.cacheDir, "pending_import_${System.currentTimeMillis()}.txt")
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

        AsyncFunction("writeContentUri") { uriString: String, content: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val uri = android.net.Uri.parse(uriString)
            ctx.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                output.write(content.toByteArray(Charsets.UTF_8))
                output.flush()
            }
            true
        }

        View(TextEditorView::class) {
            Events("onTextChange")

            Prop("value") { view: TextEditorView, value: String ->
                view.setText(value)
            }

            Prop("placeholder") { view: TextEditorView, value: String ->
                view.setPlaceholder(value)
            }

            Prop("color") { view: TextEditorView, value: String ->
                view.setTextColor(Color.parseColor(value))
            }

            Prop("placeholderColor") { view: TextEditorView, value: String ->
                view.setPlaceholderColor(Color.parseColor(value))
            }
        }
    }
}
