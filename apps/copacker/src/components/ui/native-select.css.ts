import { style } from "@/styles/layers"
import { alpha, focusRing, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const wrapper = style({
  position: "relative",
  width: "fit-content",
  selectors: { "&:has(select:disabled)": { opacity: 0.5 } }
})

export const select = style({
  height: space(8),
  width: "100%",
  minWidth: 0,
  appearance: "none",
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.input}`,
  backgroundColor: "transparent",
  paddingBlock: space(1),
  paddingRight: space(8),
  paddingLeft: space(2.5),
  ...fontSize.sm,
  transitionProperty: "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  outline: "none",
  userSelect: "none",
  selectors: {
    "&::selection": { backgroundColor: vars.color.primary, color: vars.color.primaryForeground },
    "&::placeholder": { color: vars.color.mutedForeground },
    "&:focus-visible": focusRing,
    "&:disabled": { pointerEvents: "none", cursor: "not-allowed" },
    "&[aria-invalid='true']": {
      borderColor: vars.color.destructive,
      boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 20)}`
    },
    "&[data-size='sm']": {
      height: space(7),
      borderRadius: `min(${vars.radius.md}, 10px)`,
      paddingBlock: space(0.5)
    },
    ".dark &": { backgroundColor: alpha(vars.color.input, 30) },
    ".dark &:hover": { backgroundColor: alpha(vars.color.input, 50) },
    ".dark &[aria-invalid='true']": {
      borderColor: alpha(vars.color.destructive, 50),
      boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 40)}`
    }
  }
})

export const icon = style({
  pointerEvents: "none",
  position: "absolute",
  top: "50%",
  right: space(2.5),
  width: space(4),
  height: space(4),
  translate: "0 -50%",
  color: vars.color.mutedForeground,
  userSelect: "none"
})

export const option = style({ backgroundColor: "Canvas", color: "CanvasText" })
