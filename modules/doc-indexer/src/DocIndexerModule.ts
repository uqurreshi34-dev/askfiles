import { NativeModule, requireNativeModule } from 'expo';

export interface IndexedFile {
  uri: string;
  name: string;
  snippet: string;
}

declare class DocIndexerModule extends NativeModule {
  indexFile(uri: string, name: string): Promise<boolean>;
  indexFiles(files: { uri: string; name: string }[]): Promise<number>;
  searchFiles(query: string): Promise<IndexedFile[]>;
  isIndexed(uri: string): Promise<boolean>;
  getIndexCount(): Promise<number>;
  removeFromIndex(uri: string): Promise<void>;
  clearIndex(): Promise<void>;
}

export default requireNativeModule<DocIndexerModule>('DocIndexer');
