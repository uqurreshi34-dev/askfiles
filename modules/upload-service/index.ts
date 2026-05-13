// Reexport the native module. On web, it will be resolved to UploadServiceModule.web.ts
// and on native platforms to UploadServiceModule.ts
export { default } from './src/UploadServiceModule';
export { default as UploadServiceView } from './src/UploadServiceView';
export * from  './src/UploadService.types';
