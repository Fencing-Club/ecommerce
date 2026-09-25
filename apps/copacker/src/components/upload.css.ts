import { style } from "@vanilla-extract/css"
import { alpha } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Dashed drop-zone card. `&&` outranks Card's background and ring shadow.
export const card = style({
  selectors: {
    "&&": {
      border: `1px dashed ${vars.color.border}`,
      backgroundColor: alpha(vars.color.muted, 30),
      boxShadow: "none"
    }
  }
})
