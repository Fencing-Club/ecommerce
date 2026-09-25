import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const locations = style({ display: "flex", flexDirection: "column", gap: space(3) })
export const legend = style({ ...fontSize.sm, fontWeight: 500, marginBottom: space(2) })
export const detail = style({ ...fontSize.sm, color: vars.color.mutedForeground })
