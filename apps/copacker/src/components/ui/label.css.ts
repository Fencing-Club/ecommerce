import { style } from "@/styles/layers"
import { fontSize, space } from "@/styles/tokens"

export const label = style({
  display: "flex",
  alignItems: "center",
  gap: space(2),
  ...fontSize.sm,
  lineHeight: 1,
  fontWeight: 500,
  userSelect: "none",
  selectors: {
    "[data-disabled='true'] &": { pointerEvents: "none", opacity: 0.5 },
    ":disabled ~ &": { cursor: "not-allowed", opacity: 0.5 }
  }
})
