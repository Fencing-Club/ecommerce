import { style } from "@vanilla-extract/css"

// Visually hidden but still read by assistive technology (was Tailwind `sr-only`). Unlayered, so it wins over any
// component layout on the same element.
export const srOnly = style({
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0
})
