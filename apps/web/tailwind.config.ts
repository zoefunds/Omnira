import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Omnira surface — parchment cream, brand base
        parchment: {
          DEFAULT: '#efece4',
          50:  '#fbfaf6',
          100: '#f6f4ee',
          200: '#efece4', // brand surface
          300: '#e3dfd2',
          400: '#cfc9b7',
          500: '#b3ac96',
        },
        ink: {
          DEFAULT: '#1a1a1a',
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#c4c4c4',
          400: '#737373',
          600: '#404040',
          900: '#171717',
        },
        // Primary accent — warm gold, evokes engraved chess clocks
        gold: {
          DEFAULT: '#b8901f',
          50:  '#fbf6e6',
          100: '#f3e7b8',
          200: '#e8d488',
          300: '#d8bd5c',
          400: '#c5a637',
          500: '#b8901f',
          600: '#9a771a',
          700: '#7a5d14',
          800: '#5a440f',
        },
        accent: {
          DEFAULT: '#b8901f', // alias of gold for compatibility
          hover:   '#9a771a',
        },
        success: {
          DEFAULT: '#2f6b4f',
        },
        danger: {
          DEFAULT: '#a13a2e',
        },
        // Chess board palette tuned to parchment
        board: {
          light: '#f1ecd9',
          dark:  '#a89f7b',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26,26,26,.04), 0 4px 16px rgba(26,26,26,.06)',
        card: '0 1px 0 rgba(184,144,31,.08), 0 6px 24px rgba(26,26,26,.05)',
        gold: '0 0 0 1px rgba(184,144,31,.25), 0 4px 14px rgba(184,144,31,.15)',
      },
      backgroundImage: {
        'gold-shine': 'linear-gradient(135deg, #d8bd5c 0%, #b8901f 50%, #9a771a 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
