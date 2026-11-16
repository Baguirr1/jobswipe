/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'media' (the default) makes NativeWind's web runtime throw
  // "Cannot manually set color scheme" on load. The app is light-only.
  darkMode: 'class',
  theme: {
    extend: {
      // "Pinned" palette: calm green-grey canvas, deep teal accent, ink text.
      // Keep in sync with src/lib/theme.ts (used where a raw color is needed).
      colors: {
        brand: { DEFAULT: '#0B6E66', light: '#D6ECE8', dark: '#08524C' },
        like: { DEFAULT: '#12865A', soft: '#DCF1E7' },
        nope: { DEFAULT: '#C23B4E', soft: '#FBE4E8' },
        gold: { DEFAULT: '#B7791F', soft: '#FAEFD8', ink: '#8A6B12' },
        canvas: '#EDF1EF',
        surface2: '#E4EAE7',
        line: '#D0DAD6',
        ink: { DEFAULT: '#10201D', 2: '#43524E', 3: '#72817D' },
      },
    },
  },
  plugins: [],
};
