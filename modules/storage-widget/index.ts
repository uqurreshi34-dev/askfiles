// Reexport the native module. On web, it will be resolved to StorageWidgetModule.web.ts
// and on native platforms to StorageWidgetModule.ts
export { default } from './src/StorageWidgetModule';
export { default as StorageWidgetView } from './src/StorageWidgetView';
export * from  './src/StorageWidget.types';
