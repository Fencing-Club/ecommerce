import { style } from "@vanilla-extract/css"
import { alpha, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Sticky page header that frosts the content scrolling beneath it.
export const header = style({
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  height: space(14),
  flexShrink: 0,
  alignItems: "center",
  gap: space(2),
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: alpha(vars.color.background, 95),
  paddingInline: space(4),
  backdropFilter: "blur(8px)",
  "@supports": {
    "(backdrop-filter: blur(0))": { backgroundColor: alpha(vars.color.background, 80) }
  }
})

export const trigger = style({ marginLeft: `calc(${space(1)} * -1)` })

export const separator = style({
  marginRight: space(2),
  selectors: { "&&[data-orientation='vertical']": { height: space(4), alignSelf: "auto" } }
})

export const main = style({ marginInline: "auto" })
