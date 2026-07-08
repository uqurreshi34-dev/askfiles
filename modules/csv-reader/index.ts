import { requireNativeModule } from 'expo-modules-core';

const CsvReader = requireNativeModule('CsvReader');

export interface CsvData {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export interface ColumnAnalysis {
    isNumeric: boolean;
    count?: number;
    sum?: string;
    avg?: string;
    min?: string;
    max?: string;
    stdDev?: string;
  }

  export interface GroupSumResult {
    label: string;
    value: number;
  }
  
  export async function groupAndSum(path: string, groupColIndex: number, valueColIndex: number): Promise<GroupSumResult[]> {
    return CsvReader.groupAndSum(path, groupColIndex, valueColIndex);
  }
  
export async function analyzeColumn(path: string, colIndex: number, selectedIndices: number[]): Promise<ColumnAnalysis> {
return CsvReader.analyzeColumn(path, colIndex, selectedIndices);
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

export async function resolveContentUri(uri: string): Promise<{ path: string; name: string } | null> {
  return CsvReader.resolveContentUri(uri);
}

export function getContentMimeType(uri: string): string | null {
  return CsvReader.getContentMimeType(uri);
}
