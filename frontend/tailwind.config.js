/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Primary navy — brand colour for MediConsent.
         * navy-900 (#082F49) is the canonical primary from the design spec.
         */
        navy: {
          50: '#f1f7fb',
          100: '#dcebf4',
          200: '#b9d6e8',
          300: '#8bb8d6',
          400: '#5593bd',
          500: '#31759f',
          600: '#245d83',
          700: '#1c4a69',
          800: '#123c5a',
          900: '#082f49',
          950: '#04202f',
        },
        /** Teal accent — spec value #0D9488 is Tailwind's built-in teal-600. */
        surface: '#f8fafc',
        ink: '#1e293b',
        muted: '#64748b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(8 47 73 / 0.08), 0 1px 2px -1px rgb(8 47 73 / 0.06)',
        'card-hover': '0 10px 24px -6px rgb(8 47 73 / 0.14)',
        pop: '0 12px 32px -8px rgb(8 47 73 / 0.22)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};
