import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        matcha: {
          50: '#f8f8ef',
          100: '#E5E3B2',
          200: '#d8d69c',
          300: '#c2c98a',
          400: '#aabd73',
          500: '#91A560',
          600: '#6B8136',
          700: '#5d702f',
          800: '#4d5d29',
          900: '#3e4b22',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 32px rgba(22, 25, 18, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
