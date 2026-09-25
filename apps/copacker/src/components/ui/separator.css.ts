import { style } from "@/styles/layers"
import { vars } from "@/styles/theme.css"

// :where() keeps the orientation rules at single-class specificity so callers can still override width and height.
export const separator = style({
  flexShrink: 0,
  backgroundColor: vars.color.border,
  selectors: {
    "&:where([data-orientation='horizontal'])": { height: "1px", width: "100%" },
    "&:where([data-orientation='vertical'])": { width: "1px", alignSelf: "stretch" }
  }
})
