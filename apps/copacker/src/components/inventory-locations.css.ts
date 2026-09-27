import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const section = style({ display: "flex", flexDirection: "column", gap: space(2) })
export const heading = style({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space(3) })
export const title = style({ ...fontSize.sm, fontWeight: 500 })
export const tags = style({ display: "flex", flexWrap: "wrap", gap: space(1.5) })
export const list = style({ ...fontSize.sm, display: "flex", flexDirection: "column", gap: space(1) })
export const locations = style({ display: "flex", flexDirection: "column", gap: space(3) })
export const detail = style({ ...fontSize.sm, color: vars.color.mutedForeground })
export const form = style({ display: "flex", flexDirection: "column", gap: space(4) })
