package expo.modules.texteditor

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class TextEditorView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onTextChange by EventDispatcher()

  // Prevents the onTextChange event from firing when WE set the text
  // programmatically (e.g. loading a file, or mic dictation pushing value down).
  private var isSettingProgrammatically = false

  internal val editText = object : EditText(context) {
    override fun onTextContextMenuItem(id: Int): Boolean {
      // This is the "Paste" bubble. Intercept both paste variants and only
      // allow the clipboard through if it actually contains TEXT.
      if (id == android.R.id.paste || id == android.R.id.pasteAsPlainText) {
        pastePlainTextOnly()
        return true
      }
      return super.onTextContextMenuItem(id)
    }

    private fun pastePlainTextOnly() {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
      val clip = clipboard.primaryClip ?: return
      val desc: ClipDescription? = clip.description

      // Only proceed if the clip advertises plain or HTML text.
      // An image clip is rejected here BEFORE coerceToText is ever called,
      // which is exactly what was producing the \uFFFD byte-garbage.
      val isText = desc?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true ||
                   desc?.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML) == true
      if (!isText) return // image or other non-text clip -> silently ignore

      for (i in 0 until clip.itemCount) {
        val text = clip.getItemAt(i).coerceToText(context)?.toString() ?: continue
        val start = selectionStart.coerceAtLeast(0)
        val end = selectionEnd.coerceAtLeast(0)
        editableText.replace(minOf(start, end), maxOf(start, end), text)
      }
    }
  }

  init {
    editText.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    // Match the current RN TextInput styling
    editText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    editText.setLineSpacing(7f, 1f)            // ~22 line height at 15sp
    editText.gravity = Gravity.TOP or Gravity.START
    editText.setPadding(dp(16), dp(16), dp(16), dp(16))
    editText.background = null
    editText.inputType = InputType.TYPE_CLASS_TEXT or
      InputType.TYPE_TEXT_FLAG_MULTI_LINE or
      InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or
      InputType.TYPE_TEXT_FLAG_AUTO_CORRECT

    editText.addTextChangedListener(object : android.text.TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
      override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
      override fun afterTextChanged(s: android.text.Editable?) {
        if (isSettingProgrammatically) return
        onTextChange(mapOf("value" to (s?.toString() ?: "")))
      }
    })

    addView(editText)
  }

  fun setText(value: String) {
    if (editText.text.toString() == value) return // no-op if unchanged (prevents cursor jumps)
    isSettingProgrammatically = true
    editText.setText(value)
    editText.setSelection(value.length) // cursor to end (matters for mic dictation append)
    isSettingProgrammatically = false
  }

  fun setTextColor(color: Int) = editText.setTextColor(color)
  fun setPlaceholder(text: String) { editText.hint = text }
  fun setPlaceholderColor(color: Int) = editText.setHintTextColor(color)

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
