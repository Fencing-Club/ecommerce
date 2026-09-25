import { style } from "@vanilla-extract/css"
import { alpha, media, space } from "@/styles/tokens"
import { spin } from "@/styles/animations.css"
import { vars } from "@/styles/theme.css"

// Label issues list (was `list-disc pl-5`).
export const issueList = style({ listStyleType: "disc", paddingLeft: space(5) })

// Loading icon (was `animate-spin`).
export const spinning = style({ animation: `${spin} 1s linear infinite` })

// Ready-packet alert outline (was `border-primary/40`).
export const readyAlert = style({ borderColor: alpha(vars.color.primary, 40) })

// Download button sits under the text on small screens and top-right from sm up
// (was `static col-span-full mt-2 sm:absolute sm:mt-0`).
export const packetAction = style({
  position: "static",
  gridColumn: "1 / -1",
  marginTop: space(2),
  "@media": { [media.sm]: { position: "absolute", marginTop: 0 } }
})
