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
