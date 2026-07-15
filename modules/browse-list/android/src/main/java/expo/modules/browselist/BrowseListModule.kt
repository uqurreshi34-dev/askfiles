package expo.modules.browselist

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BrowseListModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BrowseList")

        View(BrowseListView::class) {
            Events(
                "onItemTap",
                "onItemLongPress",
                "onItemDotsPress",
                "onBookmarkPress",
                "onItemSwipeDelete",
                "onItemSwipeBookmark"
            )

            Prop("items") { view: BrowseListView, items: List<Map<String, Any?>> ->
                view.setItems(items)
            }

            Prop("folderCounts") { view: BrowseListView, counts: Map<String, Any?> ->
                val intCounts = counts.mapValues { (_, v) -> (v as? Number)?.toInt() ?: 0 }
                view.setFolderCounts(intCounts)
            }

            Prop("selectedUris") { view: BrowseListView, uris: List<String> ->
                view.setSelectedUris(uris)
            }

            Prop("selectMode") { view: BrowseListView, enabled: Boolean ->
                view.setSelectMode(enabled)
            }

            Prop("bookmarkedUris") { view: BrowseListView, uris: List<String> ->
                view.setBookmarkedUris(uris)
            }

            Prop("openingUri") { view: BrowseListView, uri: String ->
                view.setOpeningUri(uri)
            }

            Prop("movingUri") { view: BrowseListView, uri: String ->
                view.setMovingUri(uri)
            }

            Prop("colors") { view: BrowseListView, colors: Map<String, String> ->
                view.setColors(colors)
            }

            Prop("showFastScroll") { view: BrowseListView, enabled: Boolean ->
                view.setShowFastScroll(enabled)
            }

            Prop("sectionMode") { view: BrowseListView, mode: String ->
                view.setSectionMode(mode)
            }
        }
    }
}
