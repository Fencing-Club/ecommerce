import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// The sheet's body scrolls between its fixed header and footer.
export const panel = style({ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 })
export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space(3),
  padding: space(4),
  flex: 1,
  minHeight: 0,
  overflowY: "auto"
})

export const list = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg
})
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: space(3),
  padding: `${space(2)} ${space(3)}`,
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const name = style({ display: "flex", flexDirection: "column", gap: space(0.5), flex: 1, minWidth: 0 })
export const title = style({ ...fontSize.sm, fontWeight: 500, overflowWrap: "anywhere" })
export const detail = style({ ...fontSize.xs, color: vars.color.mutedForeground })

export const footer = style({ display: "flex", flexDirection: "column", alignItems: "stretch", gap: space(2) })
export const actions = style({ display: "flex", flexWrap: "wrap", gap: space(2) })
