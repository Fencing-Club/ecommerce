import { style } from "@vanilla-extract/css"

// Stretches NativeSelect, whose wrapper is fit-content by default.
export const fullWidth = style({ selectors: { "&&": { width: "100%" } } })
