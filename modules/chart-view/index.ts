import { requireNativeViewManager } from 'expo-modules-core';
import { ViewStyle } from 'react-native';

export interface ChartViewProps {
  xLabels: string[];
  yValues: number[];
  chartType: 'bar' | 'line';
  style?: ViewStyle;
}

export const ChartView = requireNativeViewManager('ChartView');
