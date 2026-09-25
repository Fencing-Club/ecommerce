import { globalStyle, style } from "@/styles/layers"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const list = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space(1.5),
  ...fontSize.sm,
  overflowWrap: "break-word",
  color: vars.color.mutedForeground
})

export const item = style({ display: "inline-flex", alignItems: "center", gap: space(1) })

export const link = style({
  transition: "color 150ms cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: { "&:hover": { color: vars.color.foreground } }
})

export const page = style({ fontWeight: 400, color: vars.color.foreground })

export const separator = style({})
globalStyle(`${separator} > svg`, { width: space(3.5), height: space(3.5) })

// Mirrors the chevron in right-to-left layouts (was shadcn's cn-rtl-flip).
export const rtlFlip = style({ selectors: { "[dir='rtl'] &": { transform: "rotate(180deg)" } } })

export const ellipsis = style({
  display: "flex",
  width: space(5),
  height: space(5),
  alignItems: "center",
  justifyContent: "center"
})
globalStyle(`${ellipsis} > svg`, { width: space(4), height: space(4) })
