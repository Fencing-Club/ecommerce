import { style } from "@vanilla-extract/css"
import { media } from "@/styles/tokens"

export const productDialog = style({
  selectors: { "&&": { maxHeight: "calc(100svh - 2rem)", overflowY: "auto" } },
  "@media": { [media.sm]: { selectors: { "&&": { maxWidth: "42rem" } } } }
})
