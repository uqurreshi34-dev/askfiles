import { requireNativeModule } from 'expo-modules-core';

export interface RecentSearch {
  query: string;
  searchedAt: number;   // mirrors RecentFile.openedAt naming
}

const Native = requireNativeModule('RecentSearches');

// Add or bump a query to the top with a fresh timestamp (dedup on query, native).
export function addRecentSearch(query: string): void {
  Native.add(query);
}

// Synchronous read — newest first. Empty array if none.
export function getRecentSearches(): RecentSearch[] {
  return Native.getAll();
}

// Remove one query.
export function removeRecentSearch(query: string): void {
  Native.remove(query);
}

// Clear all.
export function clearRecentSearches(): void {
  Native.clear();
}
