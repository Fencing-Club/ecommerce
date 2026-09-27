import { style } from "@vanilla-extract/css"
import { media } from "@/styles/tokens"

// Wide enough for the date fields' descriptions to sit side by side.
export const dialog = style({
  "@media": { [media.sm]: { selectors: { "&&": { maxWidth: "36rem" } } } }
})
