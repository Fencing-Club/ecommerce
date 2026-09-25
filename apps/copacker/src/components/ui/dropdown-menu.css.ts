import { keyframes } from "@vanilla-extract/css"
import { globalStyle, style } from "@/styles/layers"
import { alpha, fontSize, space } from "@/styles/tokens"
import { pop } from "@/styles/animations.css"
import { vars } from "@/styles/theme.css"

// `pop` covers top/bottom; these add the sideways drift for menus that open left or right.
const slideInFromLeft = keyframes({ from: { opacity: 0, transform: `translateX(-${space(2)}) scale(0.95)` } })
const slideInFromRight = keyframes({ from: { opacity: 0, transform: `translateX(${space(2)}) scale(0.95)` } })
const motion = "150ms cubic-bezier(0.4, 0, 0.2, 1)"
const ring = `0 0 0 1px ${alpha(vars.color.foreground, 10)}`

const sidewaysMotion = style({
  selectors: {
    "&[data-open][data-side='right'], &[data-open][data-side='inline-end']": {
      animation: `${slideInFromLeft} ${motion}`
    },
    "&[data-open][data-side='left'], &[data-open][data-side='inline-start']": {
      animation: `${slideInFromRight} ${motion}`
    }
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      selectors: { "&[data-open], &[data-closed], &[data-open][data-side]": { animation: "none" } }
    }
  }
})

export const positioner = style({ isolation: "isolate", zIndex: 50, outline: "none" })

export const content = style([
  pop,
  sidewaysMotion,
  {
    zIndex: 50,
    maxHeight: "var(--available-height)",
    width: "var(--anchor-width)",
    minWidth: space(32),
    transformOrigin: "var(--transform-origin)",
    overflowX: "hidden",
    overflowY: "auto",
    borderRadius: vars.radius.lg,
    backgroundColor: vars.color.popover,
    padding: space(1),
    color: vars.color.popoverForeground,
    boxShadow: `${vars.shadow.md}, ${ring}`,
    outline: "none",
    selectors: { "&[data-closed]": { overflow: "hidden" } }
  }
])

// Applied on top of `content`, so it is declared after it to win the cascade.
export const subContent = style({
  width: "auto",
  minWidth: "96px",
  boxShadow: `${vars.shadow.lg}, ${ring}`
})

export const label = style({
  paddingInline: space(1.5),
  paddingBlock: space(1),
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.mutedForeground,
  selectors: { "&[data-inset]": { paddingLeft: space(7) } }
})

const row = style({
  position: "relative",
  display: "flex",
  cursor: "default",
  alignItems: "center",
  gap: space(1.5),
  borderRadius: vars.radius.md,
  paddingInline: space(1.5),
  paddingBlock: space(1),
  ...fontSize.sm,
  outline: "2px solid transparent",
  outlineOffset: "2px",
  userSelect: "none",
  selectors: {
    "&:focus": { backgroundColor: vars.color.accent, color: vars.color.accentForeground },
    "&[data-inset]": { paddingLeft: space(7) },
    "&[data-disabled]": { pointerEvents: "none", opacity: 0.5 }
  }
})
globalStyle(`${row} svg`, { pointerEvents: "none", flexShrink: 0 })
globalStyle(`${row} svg:not([data-size])`, { width: space(4), height: space(4) })

export const item = style([
  row,
  {
    selectors: {
      "&[data-variant='destructive']": { color: vars.color.destructive },
      "&[data-variant='destructive']:focus": {
        backgroundColor: alpha(vars.color.destructive, 10),
        color: vars.color.destructive
      },
      ".dark &[data-variant='destructive']:focus": { backgroundColor: alpha(vars.color.destructive, 20) }
    }
  }
])
globalStyle(`${item}:not([data-variant='destructive']):focus *`, { color: vars.color.accentForeground })
globalStyle(`${item}[data-variant='destructive'] > svg`, { color: vars.color.destructive })

export const subTrigger = style([
  row,
  {
    selectors: {
      "&[data-popup-open], &[data-open]": { backgroundColor: vars.color.accent, color: vars.color.accentForeground }
    }
  }
])
globalStyle(`${subTrigger}:not([data-variant='destructive']):focus *`, { color: vars.color.accentForeground })

export const subTriggerIcon = style({
  marginLeft: "auto",
  selectors: { "[dir='rtl'] &": { transform: "rotate(180deg)" } }
})

export const choiceItem = style([row, { paddingRight: space(8) }])
globalStyle(`${choiceItem}:focus *`, { color: vars.color.accentForeground })

export const choiceIndicator = style({
  pointerEvents: "none",
  position: "absolute",
  right: space(2),
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
})

export const separator = style({
  marginInline: `-${space(1)}`,
  marginBlock: space(1),
  height: "1px",
  backgroundColor: vars.color.border
})

export const shortcut = style({
  marginLeft: "auto",
  ...fontSize.xs,
  letterSpacing: "0.1em",
  color: vars.color.mutedForeground,
  selectors: { [`${item}:focus &`]: { color: vars.color.accentForeground } }
})
