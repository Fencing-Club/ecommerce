import { globalStyle, style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Large stat value. `&&` outranks CardTitle's base size and weight.
export const statValue = style({
  selectors: { "&&": { ...fontSize["2xl"], fontWeight: 600, fontVariantNumeric: "tabular-nums" } }
})

// Tighter spacing than ItemGroup's default.
export const documentList = style({ selectors: { "&&": { gap: space(2) } } })

// A short warning, such as a missing barcode. The icon keeps to the first line when the text wraps.
export const warningNote = style({
  display: "inline-flex",
  alignItems: "flex-start",
  gap: space(1),
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.foreground
})
// The warning color is too light for text, so only the icon uses it.
globalStyle(`${warningNote} > svg`, {
  width: space(3.5),
  height: space(3.5),
  flexShrink: 0,
  marginTop: "0.0625rem",
  color: vars.color.warning
})
