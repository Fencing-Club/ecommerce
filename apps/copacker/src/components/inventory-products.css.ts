import { globalStyle, style } from "@vanilla-extract/css"
import { alpha, focusRing, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const toolbar = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})

// The search box takes the toolbar's spare width, and at least enough to read what's typed.
export const search = style({ position: "relative", flex: "1 1 16rem", minWidth: 0 })
export const searchIcon = style({
  position: "absolute",
  left: space(2.5),
  top: "50%",
  transform: "translateY(-50%)",
  width: "1rem",
  height: "1rem",
  color: vars.color.mutedForeground,
  pointerEvents: "none"
})
export const searchInput = style({ selectors: { "&&": { paddingLeft: space(8) } } })
export const warningIcon = style({ color: vars.color.warning })

export const listHeader = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})

export const pageSize = style({ selectors: { "&&": { width: "auto", alignItems: "center" } } })

export const pager = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})

export const pagerButtons = style({ display: "flex", alignItems: "center", gap: space(3) })

export const summary = style({ ...fontSize.sm, color: vars.color.mutedForeground })

// Stock columns show once the list itself is wide enough, whatever the sidebar leaves it.
const wide = "(min-width: 44rem)"

export const list = style({
  containerType: "inline-size",
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflow: "hidden"
})

export const product = style({
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})

export const productRow = style({
  display: "grid",
  gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: space(3),
  width: "100%",
  padding: space(3),
  textAlign: "left",
  outline: "none",
  selectors: {
    "&:is(button):hover": { backgroundColor: alpha(vars.color.muted, 60) },
    "&:focus-visible": { ...focusRing, borderColor: "transparent" }
  },
  "@container": { [wide]: { gridTemplateColumns: "auto auto minmax(0, 1fr) repeat(4, 5.5rem)" } }
})

export const chevron = style({
  width: "1rem",
  height: "1rem",
  color: vars.color.mutedForeground,
  transition: "transform 150ms",
  selectors: { "[data-panel-open] &": { transform: "rotate(90deg)" } }
})

// Keeps single-variant rows aligned with expandable ones.
export const chevronSpacer = style({ width: "1rem" })

export const thumb = style({
  width: space(12),
  height: space(12),
  flexShrink: 0,
  borderRadius: vars.radius.md,
  objectFit: "cover",
  backgroundColor: vars.color.muted,
  border: `1px solid ${vars.color.border}`
})

export const thumbSmall = style([thumb, { width: space(8), height: space(8) }])

export const placeholder = style([
  thumb,
  { display: "flex", alignItems: "center", justifyContent: "center", color: vars.color.mutedForeground }
])
export const placeholderSmall = style([placeholder, { width: space(8), height: space(8) }])
globalStyle(`${placeholder} svg`, { width: "1.25rem", height: "1.25rem" })

export const name = style({ display: "flex", flexDirection: "column", gap: space(0.5), minWidth: 0 })
export const title = style({ ...fontSize.sm, fontWeight: 500, overflowWrap: "anywhere" })
export const detail = style({ ...fontSize.xs, color: vars.color.mutedForeground, overflowWrap: "anywhere" })

export const quantity = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  fontVariantNumeric: "tabular-nums",
  ...fontSize.sm,
  fontWeight: 500
})
export const quantityLabel = style({ ...fontSize.xs, fontWeight: 400, color: vars.color.mutedForeground })
export const negative = style({ color: vars.color.destructive })
export const unknown = style({ color: vars.color.mutedForeground, fontWeight: 400 })

// In a narrow list only Available shows; On hand, Incoming and On order appear once it's wide.
export const secondary = style({ display: "none", "@container": { [wide]: { display: "flex" } } })

export const variants = style({
  display: "flex",
  flexDirection: "column",
  backgroundColor: alpha(vars.color.muted, 40),
  borderTop: `1px solid ${vars.color.border}`
})

export const variantRow = style([
  productRow,
  {
    paddingLeft: space(10),
    selectors: { "& + &": { borderTop: `1px solid ${alpha(vars.color.border, 60)}` } }
  }
])

export const locations = style({ display: "flex", flexWrap: "wrap", gap: space(1), marginTop: space(1) })

// PO links and Reorder, under an expanded product's header or a single product's name.
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space(2),
  ...fontSize.xs,
  color: vars.color.mutedForeground
})
export const panelActions = style([actions, { padding: `${space(2)} ${space(3)}`, paddingLeft: space(10) }])

// A sheet's body scrolls between its fixed header and footer.
export const locationSettings = style({
  display: "flex",
  flexDirection: "column",
  gap: space(5),
  padding: space(4),
  flex: 1,
  minHeight: 0,
  overflowY: "auto"
})
export const listActions = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: space(3) })
export const detailsForm = style({ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 })

// Product details sheet: synced Shopify values and case pack templates.
export const fromShopify = style({ display: "flex", flexDirection: "column", gap: space(2) })
export const facts = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: `${space(1)} ${space(3)}`,
  ...fontSize.sm
})
globalStyle(`${facts} dt`, { color: vars.color.mutedForeground })
globalStyle(`${facts} dd`, { textAlign: "right", fontVariantNumeric: "tabular-nums" })
export const casePacks = style({ display: "flex", flexDirection: "column", gap: space(3) })
export const casePacksHeading = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})
export const casePack = style({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: space(3),
  padding: space(3),
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md
})
export const casePackName = style({ gridColumn: "1 / -1" })
export const casePackRemove = style({ gridColumn: "1 / -1", justifySelf: "start" })
export const srOnlyLegend = style({
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap"
})

// Amazon SKUs that don't match a Shopify product, below the list.
export const amazonOnly = style({ display: "flex", flexDirection: "column", gap: space(3) })
export const amazonOnlyTrigger = style({
  display: "flex",
  alignItems: "center",
  gap: space(2),
  ...fontSize.sm,
  fontWeight: 500,
  outline: "none",
  selectors: { "&:focus-visible": focusRing }
})
export const numberCell = style({ textAlign: "right", fontVariantNumeric: "tabular-nums" })
export const skuCell = style({ overflowWrap: "anywhere", whiteSpace: "normal" })
export const duplicateList = style({ display: "flex", flexDirection: "column", gap: space(0.5) })

// Product details sheet: each variation's barcode label.
export const barcodes = style({ display: "flex", flexDirection: "column", gap: space(2) })
export const barcodeList = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg
})
export const barcode = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(2),
  padding: space(3),
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const barcodeInfo = style({ display: "flex", flexDirection: "column", gap: space(0.5), minWidth: 0 })
export const barcodeActions = style({ display: "flex", flexWrap: "wrap", gap: space(1) })
export const barcodeError = style({ flexBasis: "100%" })
// A label shown in the browser's PDF viewer, wide enough to read the first rows of a sheet.
export const preview = style({
  flexBasis: "100%",
  width: "100%",
  height: "18rem",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.muted
})

// Each variation's supplier SKU in the product's Edit panel, saved to Shopify one row at a time.
export const supplierSkus = style({ display: "flex", flexDirection: "column", gap: space(2) })
export const supplierSkuList = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg
})
export const supplierSku = style({
  display: "flex",
  flexDirection: "column",
  gap: space(1.5),
  padding: space(3),
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const supplierSkuField = style({ display: "flex", alignItems: "center", gap: space(2) })
