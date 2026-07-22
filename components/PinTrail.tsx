import Svg, { Path, Circle } from 'react-native-svg';
import { View, StyleSheet } from 'react-native';

type Props = {
  pathD: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;   // keypad width
  height: number;  // keypad height
};

export default function PinTrail({ pathD, points, color, width, height }: Props) {
  if (!pathD) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={pathD} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={6} fill={color} />
        ))}
      </Svg>
    </View>
  );
}
