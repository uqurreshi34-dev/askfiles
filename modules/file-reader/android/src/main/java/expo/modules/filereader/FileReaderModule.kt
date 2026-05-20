package expo.modules.filereader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class FileReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FileReader")

    AsyncFunction("readDirectory") { path: String ->
      val dir = File(path)
      if (!dir.exists() || !dir.isDirectory) return@AsyncFunction emptyList<Map<String, Any>>()

      dir.listFiles()
        ?.filter { !it.name.startsWith('.') }
        ?.map { file ->
          mapOf(
            "name" to file.name,
            "uri" to "file://" + file.absolutePath + (if (file.isDirectory) "/" else ""),
            "isDirectory" to file.isDirectory
          )
        }
        ?.sortedWith(compareBy({ if (it["isDirectory"] as Boolean) 0 else 1 }, { it["name"] as String }))
        ?: emptyList()
    }
  }
}
