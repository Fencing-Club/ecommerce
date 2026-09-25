import { style } from "@vanilla-extract/css"
import { alpha, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Product rows align their cells to the top (was `align-top`).
export const alignTop = style({ verticalAlign: "top" })

// Revision disclosure button (was `group/trigger flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50`).
export const revisionTrigger = style({
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(2),
  borderRadius: vars.radius.md,
  paddingBlock: space(1),
  textAlign: "left",
  ...fontSize.sm,
  fontWeight: 500,
  outline: "none",
  selectors: { "&:focus-visible": { boxShadow: `0 0 0 3px ${alpha(vars.color.ring, 50)}` } }
})

// Chevron flips while the revision panel is open (was `transition-transform group-data-panel-open/trigger:rotate-180`).
export const revisionChevron = style({
  transitionProperty: "transform",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: { [`${revisionTrigger}[data-panel-open] &`]: { transform: "rotate(180deg)" } }
})
