/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdbff',
          300: '#8ec3ff',
          400: '#599eff',
          500: '#2b77ff',
          600: '#1354f5',
          700: '#0d3fe1',
          800: '#1134b6',
          900: '#14308e',
          950: '#101e56',
        },
        dark: {
          bg: '#0B0F17',
          surface: '#121824',
          card: '#1A2234',
          border: '#26334D',
          hover: '#2A3752',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'speaking-glow': 'speaking 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        speaking: {
          '0%': { boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.4), 0 0 15px rgba(34, 197, 94, 0.3)' },
          '100%': { boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.9), 0 0 25px rgba(34, 197, 94, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
