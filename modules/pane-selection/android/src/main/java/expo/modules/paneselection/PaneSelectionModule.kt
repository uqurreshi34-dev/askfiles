package expo.modules.paneselection

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaneSelectionModule : Module() {

  companion object {
    private val store = mutableMapOf<String, List<Map<String, Any>>>()
  }

  override fun definition() = ModuleDefinition {
    Name("PaneSelection")

    Function("setSelection") { pane: String, items: List<Map<String, Any>> ->
      store[pane] = items
    }

    Function("getSelection") { pane: String ->
      store[pane] ?: emptyList<Map<String, Any>>()
    }

    Function("clearSelection") { pane: String ->
      store.remove(pane)
    }

    Function("clearAll") {
      store.clear()
    }
  }
}
