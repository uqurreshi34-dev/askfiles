import { registerWebModule, NativeModule } from 'expo';

// WebdavClientModule is not available on the web platform.
class WebdavClientModule extends NativeModule<{}> {}

export default registerWebModule(WebdavClientModule, 'WebdavClientModule');
