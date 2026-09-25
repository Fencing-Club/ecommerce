import { keyframes } from "@vanilla-extract/css"
import { style } from "./layers"

// Enter and exit motion for Base UI popups and dialogs.
const fadeIn = keyframes({ from: { opacity: 0 } })
const fadeOut = keyframes({ to: { opacity: 0 } })
const zoomIn = keyframes({ from: { opacity: 0, transform: "scale(0.95)" } })
const zoomOut = keyframes({ to: { opacity: 0, transform: "scale(0.95)" } })
const slideInFromTop = keyframes({ from: { opacity: 0, transform: "translateY(-0.5rem)" } })
const slideInFromBottom = keyframes({ from: { opacity: 0, transform: "translateY(0.5rem)" } })
export const spin = keyframes({ to: { transform: "rotate(360deg)" } })
export const pulse = keyframes({ "50%": { opacity: 0.5 } })

const motion = "150ms cubic-bezier(0.4, 0, 0.2, 1)"
const reduce = "(prefers-reduced-motion: reduce)"

// Fades overlays and backdrops.
export const fade = style({
  selectors: {
    "&[data-open]": { animation: `${fadeIn} ${motion}` },
    "&[data-closed]": { animation: `${fadeOut} ${motion}` }
  },
  "@media": { [reduce]: { selectors: { "&[data-open], &[data-closed]": { animation: "none" } } } }
})

// Zooms dialogs and menus; menus also drift in from the side they open toward.
export const pop = style({
  selectors: {
    "&[data-open]": { animation: `${zoomIn} ${motion}` },
    "&[data-closed]": { animation: `${zoomOut} ${motion}` },
    "&[data-open][data-side='bottom']": { animation: `${slideInFromTop} ${motion}` },
    "&[data-open][data-side='top']": { animation: `${slideInFromBottom} ${motion}` }
  },
  "@media": { [reduce]: { selectors: { "&[data-open], &[data-closed]": { animation: "none" } } } }
})
