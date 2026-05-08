package expo.modules.mediagrid

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaGridModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaGrid")

    View(MediaGridView::class) {
      // Array of file URIs to display
      Prop("uris") { view: MediaGridView, uris: List<String> ->
        view.setUris(uris)
      }

      // Number of columns in the grid
      Prop("numColumns") { view: MediaGridView, numColumns: Int ->
        view.setNumColumns(numColumns)
      }

      // Set of selected URIs for multi-select mode
      Prop("selectedUris") { view: MediaGridView, selectedUris: List<String> ->
        view.setSelectedUris(selectedUris.toSet())
      }

      // Whether select mode is active
      Prop("selectMode") { view: MediaGridView, selectMode: Boolean ->
        view.setSelectMode(selectMode)
      }

      // Category: "images" or "videos"
      Prop("category") { view: MediaGridView, category: String ->
        view.setCategory(category)
      }

      // URI that is currently opening (shows spinner)
      Prop("openingUri") { view: MediaGridView, openingUri: String ->
        view.setOpeningUri(openingUri)
      }

      // Events back to JS
      Events("onItemPress", "onItemLongPress")
    }
  }
}
