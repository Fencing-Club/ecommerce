import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const filters = style({ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: space(3) })
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
export const orderCell = style({ overflowWrap: "anywhere", whiteSpace: "normal" })
