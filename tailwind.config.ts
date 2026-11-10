import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07060C',
        coal: '#15121D',
        plum: '#26153D',
        violet: '#9C6BFF',
        lilac: '#D4C4FF',
        beam: '#FFB547',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        floatUp: {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '0' },
          '10%': { opacity: '1' },
          '100%': { transform: 'translateY(-320px) scale(1.3)', opacity: '0' },
        },
      },
      animation: { floatUp: 'floatUp 2.6s ease-out forwards' },
    },
  },
  plugins: [],
};
export default config;
