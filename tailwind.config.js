/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ── Stitch "Luminous Obsidian" Color System ── */
      colors: {
        /* shadcn/ui semantic tokens */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* Stitch surface hierarchy */
        surface: {
          DEFAULT: "#10141a",
          void: "#0a0e14",
          low: "#181c22",
          mid: "#1c2026",
          high: "#262a31",
          highest: "#31353c",
          bright: "#3a3f47",
        },

        /* Stitch accent palette */
        teal: {
          DEFAULT: "#44e5c2",
          dark: "#00c9a7",
          glow: "rgba(68, 229, 194, 0.3)",
        },
        orange: {
          DEFAULT: "#f5a623",
          dark: "#d4891a",
        },

        /* Semantic */
        success: "#44e5c2",
        warning: "#f5a623",
        error: "#ff6b6b",
        info: "#64b5f6",
      },

      /* ── Typography ── */
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Manrope'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },

      /* ── Spacing (Stitch scale) ── */
      spacing: {
        "stitch-1": "0.25rem",
        "stitch-2": "0.5rem",
        "stitch-3": "0.75rem",
        "stitch-4": "1rem",
        "stitch-6": "1.5rem",
        "stitch-8": "2rem",
        "stitch-10": "2.5rem",
        "stitch-12": "3rem",
      },

      /* ── Border Radius ── */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        stitch: "0.75rem",
        "stitch-lg": "1rem",
        "stitch-xl": "1.5rem",
      },

      /* ── Ambient Shadows (no drop shadows) ── */
      boxShadow: {
        "glow-teal": "0 20px 40px rgba(0, 201, 167, 0.08)",
        "glow-teal-strong": "0 8px 30px rgba(68, 229, 194, 0.2)",
        "glow-error": "0 0 4px #ff6b6b",
        "glow-warning": "0 0 4px #f5a623",
        "glow-success": "0 0 4px #44e5c2",
      },

      /* ── Backdrop Blur ── */
      backdropBlur: {
        glass: "20px",
        "glass-heavy": "30px",
      },

      /* ── Animations ── */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "node-pulse": {
          "0%, 100%": {
            opacity: "0.4",
          },
          "50%": {
            opacity: "0.7",
          },
        },
        "glow-breathe": {
          "0%, 100%": {
            boxShadow: "0 0 4px rgba(68, 229, 194, 0.3)",
          },
          "50%": {
            boxShadow: "0 0 12px rgba(68, 229, 194, 0.5)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "node-pulse": "node-pulse 3s ease-in-out infinite",
        "glow-breathe": "glow-breathe 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
