import { style } from "@vanilla-extract/css"
import { alpha } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Nested carton cards sit on a faint muted background. `&&` outranks Card's own background.
export const cartonCard = style({ selectors: { "&&": { backgroundColor: alpha(vars.color.muted, 30) } } })
