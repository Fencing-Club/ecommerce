import { style } from "@/styles/layers"
import { alpha, focusRing, fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const textarea = style({
  display: "flex",
  fieldSizing: "content",
  minHeight: space(16),
  width: "100%",
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.input}`,
  backgroundColor: "transparent",
  paddingInline: space(2.5),
  paddingBlock: space(2),
  ...fontSize.base,
  transitionProperty: "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  outline: "none",
  "@media": { [media.md]: fontSize.sm },
  selectors: {
    "&::placeholder": { color: vars.color.mutedForeground },
    "&:focus-visible": focusRing,
    "&:disabled": { cursor: "not-allowed", backgroundColor: alpha(vars.color.input, 50), opacity: 0.5 },
    "&[aria-invalid='true']": {
      borderColor: vars.color.destructive,
      boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 20)}`
    },
    ".dark &": { backgroundColor: alpha(vars.color.input, 30) },
    ".dark &:disabled": { backgroundColor: alpha(vars.color.input, 80) },
    ".dark &[aria-invalid='true']": {
      borderColor: alpha(vars.color.destructive, 50),
      boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 40)}`
    }
  }
})
