import { globalStyle, style } from "@/styles/layers"
import { alpha, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const container = style({ position: "relative", width: "100%", overflowX: "auto" })

export const table = style({ width: "100%", captionSide: "bottom", ...fontSize.sm })

export const header = style({})
globalStyle(`${header} tr`, { borderBottom: `1px solid ${vars.color.border}` })

export const body = style({})
globalStyle(`${body} tr:last-child`, { borderWidth: 0 })

export const footer = style({
  borderTop: `1px solid ${vars.color.border}`,
  backgroundColor: alpha(vars.color.muted, 50),
  fontWeight: 500
})
globalStyle(`${footer} > tr:last-child`, { borderBottomWidth: 0 })

export const row = style({
  borderBottom: `1px solid ${vars.color.border}`,
  transitionProperty: "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    "&:hover": { backgroundColor: alpha(vars.color.muted, 50) },
    "&:has([aria-expanded='true'])": { backgroundColor: alpha(vars.color.muted, 50) },
    "&[data-state='selected']": { backgroundColor: vars.color.muted }
  }
})

export const head = style({
  height: space(10),
  paddingInline: space(2),
  textAlign: "left",
  verticalAlign: "middle",
  fontWeight: 500,
  whiteSpace: "nowrap",
  color: vars.color.foreground,
  selectors: { "&:has([role='checkbox'])": { paddingRight: 0 } }
})

export const cell = style({
  padding: space(2),
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  selectors: { "&:has([role='checkbox'])": { paddingRight: 0 } }
})

export const caption = style({ marginTop: space(4), ...fontSize.sm, color: vars.color.mutedForeground })
