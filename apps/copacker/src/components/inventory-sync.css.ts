import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const sources = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg
})
export const source = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3),
  padding: space(3),
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const sourceName = style({ display: "flex", flexDirection: "column", gap: space(0.5), minWidth: 0 })
export const sourceActions = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: space(2) })
export const title = style({ ...fontSize.sm, fontWeight: 500 })
export const detail = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const problem = style({ ...fontSize.xs, color: vars.color.destructive })
