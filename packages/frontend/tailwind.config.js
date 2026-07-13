/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontSize: {
      'xs': ['11px', { lineHeight: '16px' }],
      'sm': ['13px', { lineHeight: '20px' }],
      'base': ['15px', { lineHeight: '24px' }],
      'lg': ['17px', { lineHeight: '28px' }],
      'xl': ['20px', { lineHeight: '28px' }],
      '2xl': ['24px', { lineHeight: '32px' }],
      '3xl': ['30px', { lineHeight: '36px' }],
      '4xl': ['36px', { lineHeight: '40px' }]
    },
    borderRadius: {
      DEFAULT: '6px',
      'sm': '4px',
      'md': '6px',
      'lg': '8px',
      'xl': '12px',
      '2xl': '16px',
      'full': '9999px'
    },
    boxShadow: {
      'card': 'var(--shadow-card)',
      'modal': 'var(--shadow-modal)',
      'none': 'none'
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        cyber: {
          teal: 'var(--teal-500)',
          'teal-light': 'var(--teal-400)',
          'teal-subtle': 'var(--teal-100)',
          'teal-dark': 'var(--teal-900)'
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'Menlo', 'monospace']
      },
    },
  },
  plugins: [],
};
