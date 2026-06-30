import { NativeModule, requireNativeModule } from 'expo';

declare class WebdavClientModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<WebdavClientModule>('WebdavClient');
