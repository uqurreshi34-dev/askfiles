package expo.modules.mediagrid

import android.content.Context
import com.bumptech.glide.GlideBuilder
import com.bumptech.glide.annotation.GlideModule
import com.bumptech.glide.load.engine.bitmap_recycle.LruBitmapPool
import com.bumptech.glide.load.engine.cache.LruResourceCache
import com.bumptech.glide.module.AppGlideModule

@GlideModule
class AskFilesGlideModule : AppGlideModule() {
    override fun applyOptions(context: Context, builder: GlideBuilder) {
        builder
            .setMemoryCache(LruResourceCache(20L * 1024 * 1024))  // 20MB
            .setBitmapPool(LruBitmapPool(10L * 1024 * 1024))       // 10MB
    }
}
