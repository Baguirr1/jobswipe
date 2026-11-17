/** @type {import('tailwindcss').Config} */
// Colors come from CSS variables that ThemeProvider sets for the day or night
// palette (src/lib/theme.ts), so every class below switches with the theme.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const grays = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, v(`gray-${k}`)]),
);

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'media' (the default) makes NativeWind's web runtime throw
  // "Cannot manually set color scheme" on load. Day / night is handled with
  // CSS variables instead (see above), not Tailwind's dark: variant.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: v('accent'), light: v('accent-soft'), dark: v('accent-dark') },
        'on-accent': v('on-accent'),
        like: { DEFAULT: v('like'), soft: v('like-soft') },
        nope: { DEFAULT: v('pass'), soft: v('pass-soft') },
        gold: { DEFAULT: v('gold'), soft: v('gold-soft'), ink: v('gold-ink') },
        canvas: v('canvas'),
        surface: v('surface'),
        surface2: v('surface2'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), 2: v('ink2'), 3: v('ink3') },
        gray: grays,
        red: { 50: v('red-50'), 500: v('red-500'), 700: v('red-700') },
        green: { 50: v('green-50'), 700: v('green-700') },
      },
    },
  },
  plugins: [],
};
