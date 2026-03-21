/**
 * Stitch Design System — "Luminous Obsidian" Tokens
 * HomePiNAS v3 · The Kinetic Observatory
 *
 * TypeScript design tokens for programmatic access.
 * CSS custom properties are the source of truth (index.css).
 * These tokens are for JS-side usage (charts, animations, dynamic styles).
 */

export const colors = {
  surface: {
    void: "#0a0e14",
    base: "#10141a",
    containerLow: "#181c22",
    container: "#1c2026",
    containerHigh: "#262a31",
    containerHighest: "#31353c",
    variant: "rgba(28, 32, 38, 0.6)",
    bright: "#3a3f47",
  },

  primary: {
    main: "#44e5c2",
    container: "#00c9a7",
    fixed: "rgba(68, 229, 194, 0.3)",
    onPrimary: "#002b24",
    onContainer: "rgba(0, 201, 167, 0.15)",
  },

  secondary: {
    main: "#f5a623",
    container: "#d4891a",
  },

  semantic: {
    error: "#ff6b6b",
    errorContainer: "rgba(255, 107, 107, 0.15)",
    warning: "#f5a623",
    warningContainer: "rgba(245, 166, 35, 0.15)",
    success: "#44e5c2",
    successContainer: "rgba(68, 229, 194, 0.15)",
    info: "#64b5f6",
    infoContainer: "rgba(100, 181, 246, 0.15)",
  },

  text: {
    primary: "#e8eaed",
    secondary: "#9aa0a6",
    disabled: "#5f6368",
  },

  outline: {
    variant: "rgba(60, 74, 69, 0.15)",
    standard: "rgba(60, 74, 69, 0.3)",
  },
} as const;

export const fonts = {
  display: "'Space Grotesk', sans-serif",
  body: "'Manrope', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const spacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
} as const;

export const radius = {
  sm: "0.375rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
} as const;

/** Chart.js-compatible color palette */
export const chartPalette = {
  primary: "#44e5c2",
  primaryFaded: "rgba(68, 229, 194, 0.2)",
  secondary: "#f5a623",
  secondaryFaded: "rgba(245, 166, 35, 0.2)",
  error: "#ff6b6b",
  errorFaded: "rgba(255, 107, 107, 0.2)",
  info: "#64b5f6",
  infoFaded: "rgba(100, 181, 246, 0.2)",
  grid: "rgba(60, 74, 69, 0.15)",
  text: "#9aa0a6",
} as const;

export type StitchColor = typeof colors;
export type StitchFonts = typeof fonts;
