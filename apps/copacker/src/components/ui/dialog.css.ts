import { globalStyle, style } from "@/styles/layers"
import { alpha, fontSize, media, space } from "@/styles/tokens"
import { fade, pop } from "@/styles/animations.css"
import { vars } from "@/styles/theme.css"

// Shared with alert-dialog.css.ts.
export const overlay = style([
  fade,
  {
    position: "fixed",
    inset: 0,
    isolation: "isolate",
    zIndex: 50,
    backgroundColor: "oklch(0 0 0 / 0.1)",
    "@supports": { "(backdrop-filter: blur(0))": { backdropFilter: "blur(4px)" } }
  }
])

// Centered with `translate` rather than `transform` so the zoom keyframes in `pop` do not undo the centering.
export const popup = style([
  pop,
  {
    position: "fixed",
    top: "50%",
    left: "50%",
    zIndex: 50,
    display: "grid",
    width: "100%",
    translate: "-50% -50%",
    gap: space(4),
    borderRadius: vars.radius.xl,
    backgroundColor: vars.color.popover,
    padding: space(4),
    color: vars.color.popoverForeground,
    boxShadow: `0 0 0 1px ${alpha(vars.color.foreground, 10)}`,
    outline: "none"
  }
])

export const content = style({
  maxWidth: "calc(100% - 2rem)",
  ...fontSize.sm,
  "@media": { [media.sm]: { maxWidth: "24rem" } }
})

export const closeButton = style({ position: "absolute", top: space(2), right: space(2) })

export const header = style({ display: "flex", flexDirection: "column", gap: space(2) })

export const footer = style({
  marginInline: `-${space(4)}`,
  marginBottom: `-${space(4)}`,
  display: "flex",
  flexDirection: "column-reverse",
  gap: space(2),
  borderBottomLeftRadius: vars.radius.xl,
  borderBottomRightRadius: vars.radius.xl,
  borderTop: `1px solid ${vars.color.border}`,
  backgroundColor: alpha(vars.color.muted, 50),
  padding: space(4),
  "@media": { [media.sm]: { flexDirection: "row", justifyContent: "flex-end" } }
})

export const title = style({ ...fontSize.base, lineHeight: 1, fontWeight: 500 })

export const description = style({ ...fontSize.sm, color: vars.color.mutedForeground })
globalStyle(`${description} > a`, { textDecoration: "underline", textUnderlineOffset: "3px" })
globalStyle(`${description} > a:hover`, { color: vars.color.foreground })
