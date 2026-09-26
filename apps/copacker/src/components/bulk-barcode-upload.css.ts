import { globalStyle, style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// The sheet's body scrolls between its fixed header and footer.
export const panel = style({ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 })
export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space(4),
  padding: space(4),
  flex: 1,
  minHeight: 0,
  overflowY: "auto"
})

export const detail = style({ ...fontSize.sm, color: vars.color.mutedForeground })

export const results = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg
})
export const result = style({
  display: "flex",
  flexDirection: "column",
  gap: space(1),
  padding: space(3),
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const fileName = style({ ...fontSize.sm, fontWeight: 500, overflowWrap: "anywhere" })

export const saved = style({ display: "inline-flex", alignItems: "flex-start", gap: space(1), ...fontSize.xs })
globalStyle(`${saved} > svg`, {
  width: space(3.5),
  height: space(3.5),
  flexShrink: 0,
  marginTop: "0.0625rem",
  color: vars.color.success
})

// A SKU to try instead of the file name's.
export const retry = style({ display: "flex", alignItems: "flex-end", gap: space(2), marginTop: space(1) })
