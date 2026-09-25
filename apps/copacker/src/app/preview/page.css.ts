import { style } from "@vanilla-extract/css"

// Shows the full description instead of the item's default two-line clamp (was `line-clamp-none`).
export const noLineClamp = style({
  display: "block",
  overflow: "visible",
  WebkitBoxOrient: "horizontal",
  WebkitLineClamp: "unset"
})
