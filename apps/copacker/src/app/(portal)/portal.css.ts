import { style } from "@vanilla-extract/css"

// Table row link to a detail page (was `font-medium underline-offset-4 hover:underline`).
export const rowLink = style({
  fontWeight: 500,
  textUnderlineOffset: 4,
  selectors: { "&:hover": { textDecorationLine: "underline" } }
})
