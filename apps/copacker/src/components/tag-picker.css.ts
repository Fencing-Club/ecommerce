import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Looks like a text input, with the chosen tags as chips before the typing area.
export const box = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space(1),
  minHeight: space(8),
  padding: `${space(1)} ${space(1.5)}`,
  border: `1px solid ${vars.color.input}`,
  borderRadius: vars.radius.lg,
  cursor: "text",
  selectors: {
    "&:focus-within": {
      borderColor: vars.color.ring,
      boxShadow: `0 0 0 3px color-mix(in oklch, ${vars.color.ring} 50%, transparent)`
    }
  }
})
export const chip = style({ display: "inline-flex", alignItems: "center", gap: space(0.5), paddingRight: space(0.5) })
export const remove = style({
  display: "inline-flex",
  borderRadius: vars.radius.full,
  color: vars.color.mutedForeground,
  cursor: "pointer",
  ":hover": { color: vars.color.foreground },
  ":focus-visible": { outline: `2px solid ${vars.color.ring}` }
})
export const input = style({
  ...fontSize.sm,
  flex: "1 1 6rem",
  minWidth: "6rem",
  height: space(6),
  border: "none",
  outline: "none",
  background: "transparent",
  "::placeholder": { color: vars.color.mutedForeground }
})
export const suggestions = style({ display: "flex", flexWrap: "wrap", gap: space(1) })
