import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Omnira surface
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
        accent: {
          DEFAULT: '#2f6b4f', // muted forest green for primary action
          hover:   '#244f3a',
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
        serif: ['ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26,26,26,.04), 0 4px 16px rgba(26,26,26,.06)',
      },
    },
  },
  plugins: [],
};

export default config;
