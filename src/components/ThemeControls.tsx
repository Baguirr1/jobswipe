import { Moon, MonitorSmartphone, Sun } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useTheme, type ThemeMode } from '@/providers/ThemeProvider';

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Day', Icon: Sun },
  { mode: 'dark', label: 'Night', Icon: Moon },
  { mode: 'system', label: 'Auto', Icon: MonitorSmartphone },
];

/** Day / Night / Auto (follow the device), for the Profile screen. */
export function ThemePicker() {
  const { mode, setMode, palette: C } = useTheme();
  return (
    <View>
      <View className="flex-row rounded-2xl bg-surface2 p-1" accessibilityRole="radiogroup">
        {OPTIONS.map(({ mode: m, label, Icon }) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} mode`}
              className={`min-h-11 flex-1 flex-row items-center justify-center rounded-xl ${on ? 'bg-surface' : ''}`}
              style={on ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : undefined}
            >
              <Icon size={16} color={on ? C.accent : C.ink3} />
              <Text className={`ml-2 text-sm font-semibold ${on ? 'text-ink' : 'text-ink-3'}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-2 text-xs text-ink-3">
        {mode === 'system' ? 'Auto follows your phone or computer’s own setting.' : 'Saved on this device.'}
      </Text>
    </View>
  );
}

/** One-tap switch between day and night, for screen headers. */
export function ThemeButton() {
  const { scheme, setMode, palette: C } = useTheme();
  const night = scheme === 'dark';
  return (
    <Pressable
      onPress={() => setMode(night ? 'light' : 'dark')}
      accessibilityRole="button"
      accessibilityLabel={night ? 'Switch to day mode' : 'Switch to night mode'}
      className="h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface"
    >
      {night ? <Sun size={18} color={C.ink2} /> : <Moon size={18} color={C.ink2} />}
    </Pressable>
  );
}
