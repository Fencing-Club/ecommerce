import { globalStyle, style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const sources = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  gap: space(4)
})
export const stats = style({ display: "flex", flexWrap: "wrap", gap: space(6) })
export const stat = style({ display: "flex", flexDirection: "column", gap: space(0.5) })
export const statValue = style({ ...fontSize.xl, fontWeight: 600, fontVariantNumeric: "tabular-nums" })
export const statLabel = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const problem = style({ ...fontSize.sm, color: vars.color.destructive, flexBasis: "100%" })
export const filters = style({ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: space(3) })
export const filter = style({ selectors: { "&&": { width: "auto", minWidth: "10rem" } } })
export const search = style({ selectors: { "&&": { width: "auto", minWidth: "14rem", flex: "1 1 14rem" } } })
export const searchBox = style({ position: "relative", display: "flex", alignItems: "center" })
globalStyle(`${searchBox} > svg`, {
  position: "absolute",
  left: space(2.5),
  width: "1rem",
  height: "1rem",
  color: vars.color.mutedForeground,
  pointerEvents: "none"
})
globalStyle(`${searchBox} input`, { paddingLeft: space(8) })
export const pager = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})
export const pagerButtons = style({ display: "flex", alignItems: "center", gap: space(3) })
export const summary = style({ ...fontSize.sm, color: vars.color.mutedForeground })
export const numberCell = style({ textAlign: "right", fontVariantNumeric: "tabular-nums" })
export const order = style({ display: "flex", flexDirection: "column", gap: space(0.5) })
export const orderLink = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space(1),
  fontWeight: 500,
  overflowWrap: "anywhere",
  whiteSpace: "normal"
})
globalStyle(`${orderLink} svg`, { width: "0.75rem", height: "0.75rem", flexShrink: 0, opacity: 0.6 })
export const date = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const items = style({ ...fontSize.sm, display: "flex", flexDirection: "column", gap: space(0.5) })
export const sku = style({ fontFamily: vars.font.mono, fontSize: "0.8em", overflowWrap: "anywhere" })
export const more = style({ ...fontSize.xs, color: vars.color.mutedForeground })
