import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        matcha: {
          50: '#f3f8eb',
          100: '#e5f0d5',
          200: '#cfe0ac',
          300: '#b2cc7d',
          400: '#90af5d',
          500: '#6e8a3c',
          600: '#57712e',
          700: '#475e22',
          800: '#384a1d',
          900: '#2d3b19',
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
