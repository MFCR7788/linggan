/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6",
        background: "#0A1629",
        surface: "rgba(255, 255, 255, 0.12)",
        border: "rgba(255, 255, 255, 0.3)",
        muted: {
          foreground: "#9CA3AF",
        },
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"Fira Code"',
          '"Fira Mono"',
          '"Roboto Mono"',
          'Menlo',
          'Monaco',
          'monospace',
        ],
      },
      fontSize: {
        h1: ['1.5rem', { lineHeight: '1.4', fontWeight: '700' }],
        h2: ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        subhead: ['0.875rem', { lineHeight: '1.5', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        aux: ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
        label: ['0.6875rem', { lineHeight: '1.5', fontWeight: '400' }],
        micro: ['0.5625rem', { lineHeight: '1.3', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
  darkMode: "class",
};
