/** @type {import('tailwindcss').Config} */

// Eflow's four playful brand colours. The 100-300 steps are the soft pastel
// palette the design is based on; the 500+ steps are deepened versions of
// the same hues so white button text stays readable (>= 4.5:1 on 500).
// Sunny yellow is the exception: it is only ever used with dark text.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        berry: {
          50: '#FFF3F5',
          100: '#FCE4E8',
          200: '#F3C1CA',
          300: '#ECA0A9',
          400: '#E07A88',
          500: '#C94A5E',
          600: '#B03A4E',
          700: '#8E2F40',
          800: '#6E2533',
          900: '#4E1A24',
        },
        ocean: {
          50: '#F0F8FA',
          100: '#D4EDEE',
          200: '#A5CEDB',
          300: '#91B5D2',
          400: '#6D98C0',
          500: '#4A77A6',
          600: '#3D6590',
          700: '#325275',
          800: '#28415D',
          900: '#1D3043',
        },
        mint: {
          50: '#F2FAF2',
          100: '#D1F0C1',
          200: '#B1DEBC',
          300: '#8BCB9C',
          400: '#5DAF78',
          500: '#357F52',
          600: '#2C6E46',
          700: '#265E3C',
          800: '#1F4B30',
          900: '#163723',
        },
        sunny: {
          50: '#FFFEF0',
          100: '#FDFED6',
          200: '#FBF4A6',
          300: '#F6E27A',
          400: '#EFCB4B',
          500: '#D9AC23',
          600: '#A9821A',
          700: '#846516',
          800: '#634C12',
          900: '#453509',
        },
        cream: '#FFFCF4',
      },
      fontFamily: {
        sans: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
