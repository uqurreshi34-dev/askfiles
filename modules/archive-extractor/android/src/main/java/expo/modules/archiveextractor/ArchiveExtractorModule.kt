package expo.modules.archiveextractor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.PasswordRequiredException
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import java.io.File
import java.io.FileOutputStream

class ArchiveExtractorModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("ArchiveExtractor")

        Events("onExtractProgress")

        AsyncFunction("extract7z") { srcPath: String, destDir: String, password: String? ->
            android.util.Log.d("ArchiveExtractor", "STEP 1: starting, srcPath=$srcPath")
            val file = File(srcPath)
            android.util.Log.d("ArchiveExtractor", "STEP 2: exists=${file.exists()} isFile=${file.isFile} length=${file.length()} canRead=${file.canRead()}")
            val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
            try {
                android.util.Log.d("ArchiveExtractor", "STEP 3: submitting to dedicated thread")
                val result = executor.submit<String> {
                    android.util.Log.d("ArchiveExtractor", "STEP 3b: inside dedicated thread, constructing SevenZFile")

                    val builder = SevenZFile.builder().setFile(file)
                    if (!password.isNullOrEmpty()) {
                        builder.setPassword(password.toCharArray())
                    }

                    val sevenZFile = try {
                        builder.get()
                    } catch (e: PasswordRequiredException) {
                        android.util.Log.d("ArchiveExtractor", "STEP 3c: PasswordRequiredException at construction")
                        throw RuntimeException("WRONG_PASSWORD")
                    }

                    android.util.Log.d("ArchiveExtractor", "STEP 4: SevenZFile constructed successfully")
                    val destRoot = File(destDir)
                    try {
                        var current = 0
                        var entry = sevenZFile.nextEntry
                        android.util.Log.d("ArchiveExtractor", "STEP 5: first nextEntry = ${entry?.name}")
                        val buffer = ByteArray(8192)

                        while (entry != null) {
                            if (!entry.isDirectory) {
                                val outFile = File(destDir, entry.name)
                                val canonicalDest = destRoot.canonicalPath
                                val canonicalOut = outFile.canonicalPath
                                if (!canonicalOut.startsWith(canonicalDest + File.separator) && canonicalOut != canonicalDest) {
                                    throw java.io.IOException("Archive entry escapes destination directory: ${entry.name}")
                                }

                                // Read the FIRST chunk before creating any output file.
                                // This is where decryption actually happens (read() decrypts
                                // lazily), so if the password is wrong or missing, it throws
                                // right here - before FileOutputStream ever touches disk.
                                // For a zero-byte entry, bytesRead will be -1/0 immediately,
                                // which is fine - it's not a password failure, just an empty file.
                                var bytesRead: Int
                                try {
                                    bytesRead = sevenZFile.read(buffer)
                                } catch (e: PasswordRequiredException) {
                                    android.util.Log.d("ArchiveExtractor", "STEP 5b: PasswordRequiredException on first read (no password supplied) - no file created")
                                    throw RuntimeException("WRONG_PASSWORD")
                                } catch (e: Exception) {
                                    if (!password.isNullOrEmpty()) {
                                        android.util.Log.d("ArchiveExtractor", "STEP 5c: decode failure on first read with password supplied - treating as wrong password, no file created")
                                        throw RuntimeException("WRONG_PASSWORD")
                                    }
                                    throw e
                                }

                                // First chunk decrypted successfully - now safe to create the file.
                                outFile.parentFile?.mkdirs()
                                FileOutputStream(outFile).use { out ->
                                    if (bytesRead > 0) out.write(buffer, 0, bytesRead)
                                    while (bytesRead > 0) {
                                        bytesRead = sevenZFile.read(buffer)
                                        if (bytesRead > 0) out.write(buffer, 0, bytesRead)
                                    }
                                }
                                current++
                                sendEvent("onExtractProgress", mapOf("current" to current, "total" to current))
                            }
                            entry = sevenZFile.nextEntry
                        }
                        android.util.Log.d("ArchiveExtractor", "STEP 6: done, files=$current")
                        destDir
                    } finally {
                        sevenZFile.close()
                    }
                }.get()
                android.util.Log.d("ArchiveExtractor", "STEP 7: thread returned: $result")
                result
            } catch (t: Throwable) {
                val cause = t.cause ?: t
                android.util.Log.e("ArchiveExtractor", "THROWABLE: ${cause.javaClass.simpleName}: ${cause.message}", cause)
                throw RuntimeException(cause.message, cause)
            } finally {
                executor.shutdown()
            }
        }
    }
}
