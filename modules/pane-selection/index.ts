import { requireNativeModule } from 'expo-modules-core';

const PaneSelection = requireNativeModule('PaneSelection');

export interface PaneItem {
  name: string;
  uri: string;
  isDirectory: boolean;
  size: number;
  date: number;
}

export function setSelection(pane: 'left' | 'right', items: PaneItem[]): void {
  PaneSelection.setSelection(pane, items.map(i => ({
    name: i.name,
    uri: i.uri,
    isDirectory: i.isDirectory,
    size: i.size,
    date: i.date,
  })));
}

export function getSelection(pane: 'left' | 'right'): PaneItem[] {
  return PaneSelection.getSelection(pane) ?? [];
}

export function clearSelection(pane: 'left' | 'right'): void {
  PaneSelection.clearSelection(pane);
}

export function clearAll(): void {
  PaneSelection.clearAll();
}
