import { style } from "@/styles/layers"
import { fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: 50,
  backgroundColor: "oklch(0 0 0 / 10%)",
  transitionProperty: "opacity",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  "@supports": {
    "(backdrop-filter: blur(0))": { backdropFilter: "blur(4px)" }
  },
  selectors: {
    "&[data-starting-style], &[data-ending-style]": { opacity: 0 }
  }
})

const offset = "2.5rem"

export const content = style({
  position: "fixed",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  gap: space(4),
  backgroundColor: vars.color.popover,
  backgroundClip: "padding-box",
  ...fontSize.sm,
  color: vars.color.popoverForeground,
  boxShadow: vars.shadow.lg,
  transitionProperty: "opacity, transform, translate",
  transitionDuration: "200ms",
  transitionTimingFunction: "ease-in-out",
  selectors: {
    "&[data-starting-style], &[data-ending-style]": { opacity: 0 },
    "&[data-side='bottom']": {
      insetInline: 0,
      bottom: 0,
      height: "auto",
      borderTop: `1px solid ${vars.color.border}`
    },
    "&[data-side='bottom'][data-starting-style], &[data-side='bottom'][data-ending-style]": {
      translate: `0 ${offset}`
    },
    "&[data-side='left']": {
      insetBlock: 0,
      left: 0,
      height: "100%",
      width: "75%",
      borderRight: `1px solid ${vars.color.border}`
    },
    "&[data-side='left'][data-starting-style], &[data-side='left'][data-ending-style]": {
      translate: `-${offset} 0`
    },
    "&[data-side='right']": {
      insetBlock: 0,
      right: 0,
      height: "100%",
      width: "75%",
      borderLeft: `1px solid ${vars.color.border}`
    },
    "&[data-side='right'][data-starting-style], &[data-side='right'][data-ending-style]": {
      translate: `${offset} 0`
    },
    "&[data-side='top']": {
      insetInline: 0,
      top: 0,
      height: "auto",
      borderBottom: `1px solid ${vars.color.border}`
    },
    "&[data-side='top'][data-starting-style], &[data-side='top'][data-ending-style]": {
      translate: `0 -${offset}`
    }
  },
  "@media": {
    [media.sm]: {
      selectors: {
        "&[data-side='left'], &[data-side='right']": { maxWidth: "24rem" }
      }
    }
  }
})

export const close = style({ position: "absolute", top: space(3), right: space(3) })

export const header = style({ display: "flex", flexDirection: "column", gap: space(0.5), padding: space(4) })

export const footer = style({
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  gap: space(2),
  padding: space(4)
})

export const title = style({ ...fontSize.base, fontWeight: 500, color: vars.color.foreground })

export const description = style({ ...fontSize.sm, color: vars.color.mutedForeground })
