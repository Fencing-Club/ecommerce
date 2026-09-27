import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Name on top, details below, the actions level with the name, or below everything when the row is too narrow.
export const row = style({ alignItems: "flex-start", flexWrap: "wrap" })

// Wide enough for a name and a detail line; narrower and the actions wrap below.
export const content = style({ flex: "1 1 14rem", minWidth: 0 })

// Contact details and lead time on one wrapping line.
export const details = style({
  ...fontSize.xs,
  display: "flex",
  flexWrap: "wrap",
  columnGap: space(4),
  rowGap: space(1),
  color: vars.color.mutedForeground
})

export const detailIcon = style({ width: 14, height: 14, flexShrink: 0 })

export const link = style({
  color: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  ":hover": { color: vars.color.foreground }
})
