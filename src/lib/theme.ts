/**
 * Raw color values for places a className can't reach (SVG fills, icon colors,
 * native props). Mirrors the palette in tailwind.config.js.
 */
export const C = {
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
  like: '#12865A',
  likeSoft: '#DCF1E7',
  pass: '#C23B4E',
  passSoft: '#FBE4E8',
  gold: '#B7791F',
  goldSoft: '#FAEFD8',
  goldInk: '#8A6B12',
  land: '#DDE5E1',
} as const;

/** Sequential salary ramp, low → high (yellow → deep blue). */
const RAMP = ['#E7B53F', '#9DB654', '#3E9C78', '#24788C', '#2E4B86'].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);
export const SALARY_RAMP_MIN = 45_000;
export const SALARY_RAMP_MAX = 135_000;

/** Color for a yearly salary on the $45k → $135k+ ramp. */
export function salaryColor(salary: number): string {
  const t =
    Math.min(1, Math.max(0, (salary - SALARY_RAMP_MIN) / (SALARY_RAMP_MAX - SALARY_RAMP_MIN))) *
    (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(',')})`;
}

/** Ring / bar color for a match %: strong, fair, weak. */
export function matchColor(pct: number): string {
  return pct >= 75 ? C.like : pct >= 60 ? C.gold : C.ink3;
}

/** Stable color per company, for letter logos. */
const LOGO = ['#1F5FD1', '#12865A', '#B7791F', '#C23B4E', '#5B4BB7', '#0E7490', '#9A3412', '#3F6212', '#334155'];
export function logoColor(name: string): string {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return LOGO[sum % LOGO.length]!;
}

/** Tabular digits so numbers line up and don't jitter. */
export const NUM = { fontVariant: ['tabular-nums' as const] };
