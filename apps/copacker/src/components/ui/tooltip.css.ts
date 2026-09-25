import { keyframes } from "@vanilla-extract/css"
import { globalStyle, style } from "@/styles/layers"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const positioner = style({ isolation: "isolate", zIndex: 50 })

// The shared `pop` animation only drifts in for top and bottom; tooltips also open to the sides.
const motion = "150ms cubic-bezier(0.4, 0, 0.2, 1)"
const enterFromLeft = keyframes({ from: { opacity: 0, transform: "translateX(-0.5rem) scale(0.95)" } })
const enterFromRight = keyframes({ from: { opacity: 0, transform: "translateX(0.5rem) scale(0.95)" } })

export const popup = style({
  zIndex: 50,
  display: "inline-flex",
  width: "fit-content",
  maxWidth: "20rem",
  transformOrigin: "var(--transform-origin)",
  alignItems: "center",
  gap: space(1.5),
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.foreground,
  paddingInline: space(3),
  paddingBlock: space(1.5),
  ...fontSize.xs,
  color: vars.color.background,
  selectors: {
    "&:has([data-slot='kbd'])": { paddingRight: space(1.5) },
    "&[data-open][data-side='right'], &[data-open][data-side='inline-end']": {
      animation: `${enterFromLeft} ${motion}`
    },
    "&[data-open][data-side='left'], &[data-open][data-side='inline-start']": {
      animation: `${enterFromRight} ${motion}`
    }
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { selectors: { "&[data-open][data-side]": { animation: "none" } } }
  }
})
globalStyle(`${popup} [data-slot='kbd']`, {
  position: "relative",
  isolation: "isolate",
  zIndex: 50,
  borderRadius: vars.radius.sm
})

const centerY = { top: "50% !important", translate: "0 -50%" } as const

export const arrow = style({
  zIndex: 50,
  width: space(2.5),
  height: space(2.5),
  translate: "0 calc(-50% - 2px)",
  rotate: "45deg",
  borderRadius: "2px",
  backgroundColor: vars.color.foreground,
  fill: vars.color.foreground,
  selectors: {
    "&[data-side='bottom']": { top: space(1) },
    "&[data-side='top']": { bottom: `-${space(2.5)}` },
    "&[data-side='right'], &[data-side='inline-end']": { ...centerY, left: `-${space(1)}` },
    "&[data-side='left'], &[data-side='inline-start']": { ...centerY, right: `-${space(1)}` }
  }
})
