import { registerWebModule, NativeModule } from 'expo';

import { PaneSelectionModuleEvents } from './PaneSelection.types';

class PaneSelectionModule extends NativeModule<PaneSelectionModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(PaneSelectionModule, 'PaneSelectionModule');
