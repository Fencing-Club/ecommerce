import { globalStyle, style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const list = style({ display: "flex", flexDirection: "column", gap: space(3), marginTop: space(3) })
export const trigger = style({
  display: "flex",
  alignItems: "center",
  gap: space(2),
  fontWeight: 500,
  outline: "none",
  selectors: { "&:focus-visible": { outline: `2px solid ${vars.color.ring}`, outlineOffset: 2 } }
})
export const chevron = style({
  width: "1rem",
  height: "1rem",
  transition: "transform 150ms",
  selectors: { "[data-panel-open] &": { transform: "rotate(90deg)" } }
})
export const assign = style({ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: space(3) })
export const select = style({ selectors: { "&&": { width: "auto", minWidth: "12rem" } } })
export const problem = style({ ...fontSize.sm, color: vars.color.destructive, flexBasis: "100%" })
export const name = style({ display: "flex", alignItems: "center", gap: space(3), whiteSpace: "normal" })
export const skus = style({ ...fontSize.xs, color: vars.color.mutedForeground, whiteSpace: "normal" })
export const thumb = style({
  width: space(8),
  height: space(8),
  flexShrink: 0,
  borderRadius: vars.radius.md,
  objectFit: "cover",
  backgroundColor: vars.color.muted
})
export const placeholder = style([
  thumb,
  { display: "flex", alignItems: "center", justifyContent: "center", color: vars.color.mutedForeground }
])
globalStyle(`${placeholder} svg`, { width: "1rem", height: "1rem" })
