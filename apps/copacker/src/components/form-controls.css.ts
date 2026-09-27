import { style } from "@vanilla-extract/css"
import { vars } from "@/styles/theme.css"

// Stretches NativeSelect, whose wrapper is fit-content by default.
export const fullWidth = style({ selectors: { "&&": { width: "100%" } } })

export const required = style({ color: vars.color.destructive, marginInlineStart: "0.125rem" })
