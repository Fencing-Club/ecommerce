import { keyframes } from "@vanilla-extract/css"
import { style } from "./layers"

// Enter and exit motion for Base UI popups and dialogs.
const zoomIn = keyframes({ from: { opacity: 0, transform: "scale(0.95)" } })
const zoomOut = keyframes({ to: { opacity: 0, transform: "scale(0.95)" } })
const slideInFromTop = keyframes({ from: { opacity: 0, transform: "translateY(-0.5rem)" } })
const slideInFromBottom = keyframes({ from: { opacity: 0, transform: "translateY(0.5rem)" } })
export const spin = keyframes({ to: { transform: "rotate(360deg)" } })

const motion = "150ms cubic-bezier(0.4, 0, 0.2, 1)"
const reduce = "(prefers-reduced-motion: reduce)"

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
