/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--hq-bg) / <alpha-value>)',
        surface: 'rgb(var(--hq-surface) / <alpha-value>)',
        line: 'rgb(var(--hq-line) / <alpha-value>)',
        ink: 'rgb(var(--hq-ink) / <alpha-value>)',
        muted: 'rgb(var(--hq-muted) / <alpha-value>)',
        accent: 'rgb(var(--hq-accent) / <alpha-value>)',
        teal: 'rgb(var(--hq-teal) / <alpha-value>)',
        warn: 'rgb(var(--hq-warn) / <alpha-value>)',
        good: 'rgb(var(--hq-good) / <alpha-value>)',
      },
      borderRadius: { card: '10px' },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
