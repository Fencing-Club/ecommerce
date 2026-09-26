import { globalStyle, style } from "@vanilla-extract/css"
import { fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const controls = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: space(3)
})
export const control = style({ selectors: { "&&": { width: "auto", minWidth: "10rem" } } })
export const summary = style({ ...fontSize.sm, color: vars.color.mutedForeground })
export const notes = style([summary, { display: "flex", flexDirection: "column", gap: space(1) }])
export const section = style({ display: "flex", flexDirection: "column", gap: space(3) })
export const heading = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})
export const sectionTitle = style({ ...fontSize.lg, fontWeight: 600 })
export const number = style({ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" })
export const name = style({ display: "flex", alignItems: "center", gap: space(3), minWidth: 0 })
export const title = style({ ...fontSize.sm, fontWeight: 500, whiteSpace: "normal", overflowWrap: "anywhere" })
export const detail = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const thumb = style({
  width: space(8),
  height: space(8),
  flexShrink: 0,
  borderRadius: vars.radius.md,
  objectFit: "cover",
  backgroundColor: vars.color.muted,
  border: `1px solid ${vars.color.border}`
})
export const placeholder = style([
  thumb,
  { display: "flex", alignItems: "center", justifyContent: "center", color: vars.color.mutedForeground }
])
globalStyle(`${placeholder} svg`, { width: "1rem", height: "1rem" })
// Narrow screens keep the product and the reorder quantity; the sales split scrolls with the table.
globalStyle(`${number}`, { "@media": { [media.md]: { minWidth: "6rem" } } })
// Day counts are short numbers.
export const days = style({ selectors: { "&&": { width: "9rem" } } })
export const quantity = style({ selectors: { "&&": { width: "6.5rem", marginLeft: "auto", textAlign: "right" } } })
export const explain = style([
  summary,
  { display: "flex", flexDirection: "column", gap: space(1), paddingLeft: space(4), listStyle: "decimal" }
])
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
