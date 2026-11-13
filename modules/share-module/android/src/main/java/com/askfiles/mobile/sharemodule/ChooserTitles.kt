package com.askfiles.mobile.sharemodule

/**
 * Titles for the system "Share" and "Open with" pickers, set from JavaScript
 * whenever the app language changes, so the picker heading matches the app.
 */
object ChooserTitles {
  @Volatile var share: String = "Share files"
  @Volatile var openWith: String = "Open with"
}
