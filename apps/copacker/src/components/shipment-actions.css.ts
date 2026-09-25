import { style } from "@vanilla-extract/css"
import { space } from "@/styles/tokens"

// Ghost button pulled flush with the card edge.
export const trigger = style({ marginInline: `calc(${space(2.5)} * -1)`, width: "fit-content" })

// The chevron flips while the collapsible panel is open.
export const chevron = style({
  transitionProperty: "transform",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: { [`${trigger}[data-panel-open] &`]: { transform: "rotate(180deg)" } }
})
