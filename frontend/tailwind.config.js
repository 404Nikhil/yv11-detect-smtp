/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        space: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        deep: '#050c17',
        card: '#0d1a2e',
        surface: '#111e33',
        glass: 'rgba(13, 26, 46, 0.7)',
        accent: {
          DEFAULT: '#38bdf8',
          glow: 'rgba(56, 189, 248, 0.2)',
          2: '#818cf8',
        },
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
      animation: {
        slideIn: 'slideIn 0.25s ease forwards',
      }
    },
  },
  plugins: [],
}
