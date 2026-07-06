import { requireNativeModule } from 'expo-modules-core';

const CsvReader = requireNativeModule('CsvReader');

export interface CsvData {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export async function parseCsv(path: string): Promise<CsvData> {
  return CsvReader.parseCsv(path);
}

export async function filterCsv(path: string, query: string, colIndex: number, sortColIndex: number, sortDirection: string): Promise<CsvData & { cacheHit: boolean }> {
    return CsvReader.filterCsv(path, query, colIndex, sortColIndex, sortDirection);
  }
  
  export async function evictCache(path: string): Promise<void> {
    return CsvReader.evictCache(path);
  }
