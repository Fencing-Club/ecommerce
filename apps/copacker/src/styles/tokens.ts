// Build-time helpers for .css.ts files. They live outside theme.css.ts because .css.ts exports must be serializable.

// Spacing follows Tailwind's 0.25rem step so converted layouts keep their rhythm.
export const space = (step: number) => `${step * 0.25}rem`

export const breakpoints = { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" }

export const fontSize = {
  xs: { fontSize: "0.75rem", lineHeight: "1rem" },
  sm: { fontSize: "0.875rem", lineHeight: "1.25rem" },
  base: { fontSize: "1rem", lineHeight: "1.5rem" },
  lg: { fontSize: "1.125rem", lineHeight: "1.75rem" },
  xl: { fontSize: "1.25rem", lineHeight: "1.75rem" },
  "2xl": { fontSize: "1.5rem", lineHeight: "2rem" }
} as const
