import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"

// Large stat value. `&&` outranks CardTitle's base size and weight.
export const statValue = style({
  selectors: { "&&": { ...fontSize["2xl"], fontWeight: 600, fontVariantNumeric: "tabular-nums" } }
})

// Tighter spacing than ItemGroup's default.
export const documentList = style({ selectors: { "&&": { gap: space(2) } } })
