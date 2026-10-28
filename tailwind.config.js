/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'media' (the default) makes NativeWind's web runtime throw
  // "Cannot manually set color scheme" on load. The app is light-only.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#6C47FF', light: '#EEE9FF', dark: '#4B2BD9' },
        like: '#22C55E',
        nope: '#EF4444',
      },
    },
  },
  plugins: [],
};
