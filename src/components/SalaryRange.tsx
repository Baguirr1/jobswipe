import Slider from '@react-native-community/slider';
import { Text, View } from 'react-native';

import { formatSalaryRange } from '@/lib/format';
import { usePalette } from '@/providers/ThemeProvider';

const MIN = 30_000;
const MAX = 400_000;
const STEP = 5_000;

/** Two linked sliders: moving one past the other pushes it along. */
export function SalaryRange({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const C = usePalette();
  return (
    <View>
      <Text className="mb-3 text-center text-2xl font-bold text-gray-900">
        {formatSalaryRange(min, max)}
      </Text>
      <Text className="text-xs font-medium text-gray-500">Minimum</Text>
      <Slider
        minimumValue={MIN}
        maximumValue={MAX}
        step={STEP}
        value={min}
        onValueChange={(v) => onChange(v, Math.max(v, max))}
        minimumTrackTintColor={C.accent}
        maximumTrackTintColor={C.surface2}
        thumbTintColor={C.accent}
        accessibilityLabel="Minimum salary"
      />
      <Text className="mt-2 text-xs font-medium text-gray-500">Maximum</Text>
      <Slider
        minimumValue={MIN}
        maximumValue={MAX}
        step={STEP}
        value={max}
        onValueChange={(v) => onChange(Math.min(v, min), v)}
        minimumTrackTintColor={C.accent}
        maximumTrackTintColor={C.surface2}
        thumbTintColor={C.accent}
        accessibilityLabel="Maximum salary"
      />
    </View>
  );
}
