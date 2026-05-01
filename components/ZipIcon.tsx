import React from 'react';
import Svg, { Path, Rect, Ellipse, Line } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function ZipIcon({ size = 22, color = '#5F5E5A' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 148">
      {/* File body */}
      <Path
        d="M8 0 L72 0 L100 28 L100 140 Q100 148 92 148 L8 148 Q0 148 0 140 L0 8 Q0 0 8 0 Z"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      {/* Folded corner */}
      <Path
        d="M72 0 L72 28 L100 28"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Zip teeth - filled */}
      <Rect x="44" y="20" width="12" height="10" rx="2" fill={color} />
      {/* Zip teeth - outline */}
      <Rect x="44" y="36" width="12" height="10" rx="2" fill="none" stroke={color} strokeWidth={3} />
      {/* Zip teeth - filled */}
      <Rect x="44" y="52" width="12" height="10" rx="2" fill={color} />
      {/* Zip teeth - outline */}
      <Rect x="44" y="68" width="12" height="10" rx="2" fill="none" stroke={color} strokeWidth={3} />
      {/* Zipper pull circle */}
      <Ellipse cx="50" cy="92" rx="10" ry="14" fill="none" stroke={color} strokeWidth={5} />
      {/* Zipper pull stem */}
      <Line x1="50" y1="82" x2="50" y2="78" stroke={color} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}
