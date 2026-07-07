package expo.modules.pdfviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.widget.ImageView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File

class PdfViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onPageCount by EventDispatcher()

    private var pdfRenderer: PdfRenderer? = null
    private var currentPage: Int = 0
    private val imageView = ImageView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        scaleType = ImageView.ScaleType.FIT_CENTER
        setBackgroundColor(Color.WHITE)
    }

    init {
        addView(imageView)
    }

    fun loadPdf(uri: String) {
        try {
            pdfRenderer?.close()
            val file = File(uri.removePrefix("file://"))
            val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            pdfRenderer = PdfRenderer(fd)
            onPageCount(mapOf("count" to pdfRenderer!!.pageCount))
            renderPage(currentPage)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun goToPage(page: Int) {
        currentPage = page
        renderPage(page)
    }

    private fun renderPage(pageIndex: Int) {
        val renderer = pdfRenderer ?: return
        if (pageIndex < 0 || pageIndex >= renderer.pageCount) return

        val page = renderer.openPage(pageIndex)
        val scale = resources.displayMetrics.density * 2f
        val width = (page.width * scale).toInt()
        val height = (page.height * scale).toInt()

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()

        imageView.setImageBitmap(bitmap)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        pdfRenderer?.close()
        pdfRenderer = null
    }
}
