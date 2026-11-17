/**
 * Day and night palettes. Tailwind classes (bg-canvas, text-ink, text-gray-500…)
 * read these through CSS variables set by ThemeProvider, so they switch live.
 * Code that needs a raw color (SVG fills, icon colors, native props) gets the
 * current palette from usePalette().
 */

const LIGHT = {
  canvas: '#EDF1EF',
  surface: '#FFFFFF',
  surface2: '#E4EAE7',
  line: '#D0DAD6',
  ink: '#10201D',
  ink2: '#43524E',
  ink3: '#72817D',
  accent: '#0B6E66',
  accentSoft: '#D6ECE8',
  accentDark: '#08524C',
  accentMuted: '#9CCBC4',
  /** Text and icons placed on an accent (or ink) fill. */
  onAccent: '#FFFFFF',
  like: '#12865A',
  likeSoft: '#DCF1E7',
  pass: '#C23B4E',
  passSoft: '#FBE4E8',
  gold: '#B7791F',
  goldSoft: '#FAEFD8',
  goldInk: '#8A6B12',
  land: '#DDE5E1',
  /** State borders and pin outlines on the map. */
  mapStroke: '#FFFFFF',
  /** Salary ramp, low → high. */
  ramp: ['#E7B53F', '#9DB654', '#3E9C78', '#24788C', '#2E4B86'],
  /** Older screens use Tailwind's gray / red / green scales; these are their values. */
  gray: {
    50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF',
    500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827',
  },
  red50: '#FEF2F2',
  red500: '#EF4444',
  red700: '#B91C1C',
  green50: '#F0FDF4',
  green700: '#15803D',
};

export type Palette = typeof LIGHT;

const DARK: Palette = {
  canvas: '#0B1311',
  surface: '#121E1C',
  surface2: '#192826',
  line: '#253734',
  ink: '#E4EEEB',
  ink2: '#A6B6B2',
  ink3: '#7F918D',
  accent: '#4FC2B5',
  accentSoft: '#143431',
  accentDark: '#86DCD1',
  accentMuted: '#2F6F68',
  onAccent: '#0B1311',
  like: '#3CC28B',
  likeSoft: '#15322A',
  pass: '#EE6A7C',
  passSoft: '#3A1D24',
  gold: '#E3A94A',
  goldSoft: '#372C16',
  goldInk: '#D8B34E',
  land: '#1D2E2B',
  mapStroke: '#0B1311',
  ramp: ['#F0C35A', '#AFC762', '#4DB58D', '#3C9DB3', '#6F8FD8'],
  gray: {
    50: '#0F1917', 100: '#192826', 200: '#253734', 300: '#33504B', 400: '#6E807C',
    500: '#8A9B97', 600: '#A6B6B2', 700: '#BFCCC8', 800: '#D3DEDB', 900: '#E4EEEB',
  },
  red50: '#3A1D24',
  red500: '#EE6A7C',
  red700: '#F08A98',
  green50: '#15322A',
  green700: '#6FD3A6',
};

export const PALETTES = { light: LIGHT, dark: DARK } as const;
export type Scheme = keyof typeof PALETTES;

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

/** CSS variables for tailwind.config.js, as "r g b" triplets. */
export function cssVariables(p: Palette): Record<string, string> {
  const v: Record<string, string> = {
    '--c-canvas': rgb(p.canvas),
    '--c-surface': rgb(p.surface),
    '--c-surface2': rgb(p.surface2),
    '--c-line': rgb(p.line),
    '--c-ink': rgb(p.ink),
    '--c-ink2': rgb(p.ink2),
    '--c-ink3': rgb(p.ink3),
    '--c-accent': rgb(p.accent),
    '--c-accent-soft': rgb(p.accentSoft),
    '--c-accent-dark': rgb(p.accentDark),
    '--c-on-accent': rgb(p.onAccent),
    '--c-like': rgb(p.like),
    '--c-like-soft': rgb(p.likeSoft),
    '--c-pass': rgb(p.pass),
    '--c-pass-soft': rgb(p.passSoft),
    '--c-gold': rgb(p.gold),
    '--c-gold-soft': rgb(p.goldSoft),
    '--c-gold-ink': rgb(p.goldInk),
    '--c-red-50': rgb(p.red50),
    '--c-red-500': rgb(p.red500),
    '--c-red-700': rgb(p.red700),
    '--c-green-50': rgb(p.green50),
    '--c-green-700': rgb(p.green700),
  };
  for (const [k, hex] of Object.entries(p.gray)) v[`--c-gray-${k}`] = rgb(hex);
  return v;
}

export const SALARY_RAMP_MIN = 45_000;
export const SALARY_RAMP_MAX = 135_000;

/** Color for a yearly salary on the $45k → $135k+ ramp of the given palette. */
export function salaryColor(salary: number, ramp: readonly string[] = LIGHT.ramp): string {
  const stops = ramp.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const t =
    Math.min(1, Math.max(0, (salary - SALARY_RAMP_MIN) / (SALARY_RAMP_MAX - SALARY_RAMP_MIN))) *
    (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(',')})`;
}

/** Ring / bar color for a match %: strong, fair, weak. */
export function matchColor(pct: number, p: Palette = LIGHT): string {
  return pct >= 75 ? p.like : pct >= 60 ? p.gold : p.ink3;
}

/** Stable color per company, for letter logos (white text reads on all of them). */
const LOGO = ['#1F5FD1', '#12865A', '#B7791F', '#C23B4E', '#5B4BB7', '#0E7490', '#9A3412', '#3F6212', '#334155'];
export function logoColor(name: string): string {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return LOGO[sum % LOGO.length]!;
}

/** Tabular digits so numbers line up and don't jitter. */
export const NUM = { fontVariant: ['tabular-nums' as const] };
