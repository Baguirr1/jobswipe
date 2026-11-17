import AsyncStorage from '@react-native-async-storage/async-storage';
import { vars } from 'nativewind';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme, View } from 'react-native';

import { cssVariables, PALETTES, type Palette, type Scheme } from '@/lib/theme';

/** What the user picked: day, night, or follow the device. */
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeValue {
  mode: ThemeMode;
  /** The scheme actually showing (resolves 'system'). */
  scheme: Scheme;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'jobswipe.theme';
const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Restore the saved choice. Storage can be unavailable (private browsing):
  // then the app just follows the device.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const scheme: Scheme = mode === 'system' ? (device === 'dark' ? 'dark' : 'light') : mode;
  const palette = PALETTES[scheme];
  const variables = useMemo(() => cssVariables(palette), [palette]);

  // On the web, modals render outside this tree (in a portal on <body>), so the
  // variables also go on the document root for them to inherit.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(variables)) root.style.setProperty(k, v);
    root.style.colorScheme = scheme;
    document.body.style.backgroundColor = palette.canvas;
  }, [variables, scheme, palette]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      scheme,
      palette,
      setMode: (next) => {
        setModeState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [mode, scheme, palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: palette.canvas }, vars(variables)]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** The current palette, for colors that can't come from a className. */
export function usePalette(): Palette {
  return useTheme().palette;
}
