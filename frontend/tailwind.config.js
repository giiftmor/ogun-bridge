/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Design System Tokens */
        page: "hsl(var(--bg-page))",
        surface: "hsl(var(--bg-surface))",
        elevated: "hsl(var(--bg-elevated))",
        subtle: "hsl(var(--bg-subtle))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        primary: "hsl(var(--text-primary))",
        secondary: "hsl(var(--text-secondary))",
        tertiary: "hsl(var(--text-tertiary))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          hover: "hsl(var(--accent-hover))",
          tint: "hsl(var(--accent-tint))",
          "tint-border": "hsl(var(--accent-tint-border))",
        },
        success: {
          bg: "hsl(var(--success-bg))",
          text: "hsl(var(--success-text))",
        },
        danger: {
          bg: "hsl(var(--danger-bg))",
          text: "hsl(var(--danger-text))",
        },
        inverse: {
          bg: "hsl(var(--inverse-bg))",
          text: "hsl(var(--inverse-text))",
          muted: "hsl(var(--inverse-muted))",
        },

        /* Backward compatibility with shadcn/ui */
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        kpi: ['22px', { lineHeight: '1.2', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        pill: "var(--radius-pill)",
      },
    },
  },
  plugins: [],
}
