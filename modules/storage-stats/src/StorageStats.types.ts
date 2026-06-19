import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type StorageStatsModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type StorageStatsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

export type DonutViewProps = {
  usedBytes: number;
  totalBytes: number;
  trackColor?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};
