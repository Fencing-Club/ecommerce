import { style } from "@vanilla-extract/css"
import { media, space } from "@/styles/tokens"

// Two-column address grid. `&&` outranks FieldGroup's own flex column layout.
export const grid = style({
  selectors: { "&&": { display: "grid", gap: space(4) } },
  "@media": { [media.sm]: { selectors: { "&&": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } } } }
})
