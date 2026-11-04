import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function SwipeBackground({ dark = false }: { dark?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 400 700" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={dark ? '#49417D' : '#F4ABAB'} />
            <Stop offset="0.5" stopColor={dark ? '#302958' : '#C5ADD8'} />
            <Stop offset="1" stopColor={dark ? '#191A35' : '#9198E5'} />
          </LinearGradient>
        </Defs>
        <Rect width="400" height="700" fill={`url(#${id})`} />
        <Circle cx="370" cy="150" r="170" fill="#FFFFFF" opacity="0.06" />
        <Circle cx="20" cy="640" r="210" fill="#FFFFFF" opacity="0.05" />
      </Svg>
    </View>
  );
}
