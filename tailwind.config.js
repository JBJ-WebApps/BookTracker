/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Mulish', 'Soleil', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        navy: {
          50:  '#eef0f7',
          100: '#d6daea',
          200: '#aeb5d4',
          300: '#7d86b5',
          400: '#525e95',
          500: '#363f7c',
          600: '#262262',
          700: '#1f1c52',
          800: '#181640',
          900: '#10102d',
        },
        teal: {
          50:  '#eaf6f6',
          100: '#cfeaeb',
          200: '#9bd5d7',
          300: '#67bfc3',
          400: '#3ea6ab',
          500: '#3E979C',
          600: '#327e83',
          700: '#28666a',
          800: '#1f4f52',
          900: '#163638',
        },
        gold: {
          50:  '#fbf8ef',
          100: '#f4eeda',
          200: '#e8dbac',
          300: '#d4c281',
          400: '#c4ae6e',
          500: '#BAA360',
          600: '#9a884f',
          700: '#7c6c3f',
          800: '#5b4f2d',
          900: '#3a321c',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(38, 34, 98, 0.06), 0 4px 12px rgba(38, 34, 98, 0.06)',
        ring: '0 0 0 4px rgba(62, 151, 156, 0.18)',
      },
    },
  },
  plugins: [],
};
