import { style } from "@vanilla-extract/css"
import { space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Visually hidden until focused (was `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 ...`).
export const skipLink = style({
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
  selectors: {
    "&:focus": {
      position: "fixed",
      top: space(2),
      left: space(2),
      zIndex: 50,
      width: "auto",
      height: "auto",
      margin: 0,
      overflow: "visible",
      clip: "auto",
      whiteSpace: "normal",
      borderRadius: vars.radius.md,
      backgroundColor: vars.color.background,
      paddingInline: space(3),
      paddingBlock: space(2),
      boxShadow: `0 0 0 2px ${vars.color.ring}`
    }
  }
})
