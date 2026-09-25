import { globalStyle, style } from "@/styles/layers"
import { alpha, focusRing, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const destructiveRing = (percent: number) => `0 0 0 3px ${alpha(vars.color.destructive, percent)}`
const focusedLabel = "[data-slot='field-label']:has(:focus-visible)"

export const checkbox = style({
  position: "relative",
  display: "flex",
  width: space(4),
  height: space(4),
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  border: `1px solid ${vars.color.input}`,
  transition: "color 150ms, background-color 150ms, border-color 150ms",
  outline: "none",
  selectors: {
    // Widens the hit area without changing layout.
    "&::after": {
      content: '""',
      position: "absolute",
      insetInline: `-${space(3)}`,
      insetBlock: `-${space(2)}`
    },
    ".dark &": { backgroundColor: alpha(vars.color.input, 30) },
    "[data-slot='field']:has(:disabled) &": { opacity: 0.5 },
    "&:focus-visible": focusRing,
    [`${focusedLabel} &`]: { boxShadow: "none" },
    [`${focusedLabel} &:not([data-checked])`]: { borderColor: vars.color.input },
    "&:disabled, &[data-disabled]": { cursor: "not-allowed", opacity: 0.5 },
    "&[aria-invalid='true']": { borderColor: vars.color.destructive, boxShadow: destructiveRing(20) },
    ".dark &[aria-invalid='true']": { borderColor: alpha(vars.color.destructive, 50), boxShadow: destructiveRing(40) },
    "&[data-checked]": {
      borderColor: vars.color.primary,
      backgroundColor: vars.color.primary,
      color: vars.color.primaryForeground
    },
    ".dark &[data-checked]": { backgroundColor: vars.color.primary },
    [`${focusedLabel} &[data-checked]`]: { borderColor: vars.color.primary },
    "&[aria-invalid='true'][aria-checked='true']": { borderColor: vars.color.primary }
  }
})

export const indicator = style({
  display: "grid",
  placeContent: "center",
  color: "currentColor",
  transition: "none"
})
globalStyle(`${indicator} > svg`, { width: space(3.5), height: space(3.5) })
