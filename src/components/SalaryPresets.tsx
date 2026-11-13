import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SalaryRange } from '@/components/SalaryRange';
import { formatSalaryRange } from '@/lib/format';

export const SALARY_PRESETS: readonly [number, number][] = [
  [40_000, 60_000],
  [60_000, 80_000],
  [80_000, 100_000],
  [100_000, 130_000],
  [130_000, 180_000],
];

const isPreset = (min: number, max: number) =>
  SALARY_PRESETS.some(([lo, hi]) => lo === min && hi === max);

/** Tap a common range, or choose "Custom" to fine-tune with sliders. */
export function SalaryPresets({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const [custom, setCustom] = useState(() => !isPreset(min, max));

  return (
    <View>
      <View className="flex-row flex-wrap">
        {SALARY_PRESETS.map(([lo, hi]) => {
          const selected = !custom && lo === min && hi === max;
          return (
            <Chip
              key={lo}
              label={formatSalaryRange(lo, hi)}
              selected={selected}
              onPress={() => {
                setCustom(false);
                onChange(lo, hi);
              }}
            />
          );
        })}
        <Chip label="Custom" selected={custom} onPress={() => setCustom(true)} />
      </View>
      {custom ? (
        <View className="mt-4">
          <SalaryRange min={min} max={max} onChange={onChange} />
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`mb-2 mr-2 rounded-full border px-4 py-2.5 ${
        selected ? 'border-brand bg-brand' : 'border-gray-200 bg-white'
      }`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  );
}
