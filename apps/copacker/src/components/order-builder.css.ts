import { globalStyle, style } from "@vanilla-extract/css"
import { alpha, fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// `&&` outranks FieldGroup's own flex column layout.
export const detailsGrid = style({
  selectors: { "&&": { display: "grid", gap: space(4) } },
  "@media": {
    [media.sm]: { selectors: { "&&": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } } },
    [media.lg]: { selectors: { "&&": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" } } }
  }
})

export const lineGrid = style({
  selectors: { "&&": { display: "grid", gap: space(4) } },
  "@media": { [media.sm]: { selectors: { "&&": { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" } } } }
})

export const results = style({
  maxHeight: space(72),
  overflow: "auto",
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  padding: space(1)
})

export const result = style({
  selectors: {
    "&&": { width: "100%", textAlign: "left" },
    "&&:hover": { backgroundColor: vars.color.muted },
    "&&:disabled": { opacity: 0.5 }
  }
})

// Line item cards sit on a faint muted background. `&&` outranks Card's own background.
export const lineCard = style({ selectors: { "&&": { backgroundColor: alpha(vars.color.muted, 30) } } })

export const identifiers = style({
  display: "grid",
  alignContent: "start",
  gap: space(1),
  ...fontSize.sm,
  "@media": { [media.sm]: { gridColumn: "span 2 / span 2" } }
})

// The PO's totals, right-aligned under its charges, the PO total set apart.
export const totals = style({ display: "flex", justifyContent: "flex-end" })
globalStyle(`${totals} dl`, {
  display: "grid",
  gridTemplateColumns: "auto auto",
  columnGap: space(6),
  rowGap: space(1),
  ...fontSize.sm
})
globalStyle(`${totals} dt`, { color: vars.color.mutedForeground })
globalStyle(`${totals} dd`, { textAlign: "right", fontVariantNumeric: "tabular-nums" })
export const grandTotal = style({
  selectors: {
    "&&": {
      paddingTop: space(2),
      marginTop: space(1),
      borderTop: `1px solid ${vars.color.border}`,
      color: vars.color.foreground,
      fontWeight: 600
    }
  }
})
