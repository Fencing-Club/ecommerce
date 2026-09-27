import { globalStyle, style, styleVariants } from "@vanilla-extract/css"
import { alpha, fontSize, focusRing, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const page = style({ display: "flex", flexDirection: "column", gap: space(6) })

// Grids: four KPI tiles, a wide chart beside a narrow card, and two even halves.
// Two tiles a row on phones (an odd last tile spans the row), three on tablets, six on wide screens.
export const kpis = style({
  display: "grid",
  gap: space(3),
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  "@media": {
    [media.sm]: { gap: space(4) },
    [media.lg]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
    [media.xl]: { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }
  }
})
globalStyle(`${kpis} > :last-child:nth-child(odd)`, {
  gridColumn: "1 / -1",
  "@media": { [media.lg]: { gridColumn: "auto" } }
})
export const wide = style({
  display: "grid",
  gap: space(4),
  gridTemplateColumns: "minmax(0, 1fr)",
  "@media": { [media.xl]: { gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" } }
})
export const halves = style({
  display: "grid",
  gap: space(4),
  gridTemplateColumns: "minmax(0, 1fr)",
  "@media": { [media.lg]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }
})
export const stack = style({ display: "flex", flexDirection: "column", gap: space(4), minWidth: 0 })

export const sectionTitle = style({ display: "flex", alignItems: "center", gap: space(2) })
globalStyle(`${sectionTitle} > svg`, { width: "1rem", height: "1rem", color: vars.color.mutedForeground })

// Attention list: one row per item, each a link to where it's fixed.
export const attentionList = style({ display: "flex", flexDirection: "column", gap: space(1) })
export const attentionRow = style({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  columnGap: space(3),
  rowGap: space(2),
  paddingBlock: space(2.5),
  paddingInline: space(3),
  marginInline: `calc(${space(3)} * -1)`,
  borderRadius: vars.radius.lg,
  color: "inherit",
  textDecoration: "none",
  transition: "background-color 150ms ease",
  selectors: {
    "&:hover": { backgroundColor: alpha(vars.color.muted, 80) },
    "&:focus-visible": { ...focusRing, outline: "none" }
  },
  "@media": { [media.sm]: { gridTemplateColumns: "auto minmax(0, 1fr) auto" } }
})
export const attentionText = style({ display: "flex", flexDirection: "column", gap: space(0.5), minWidth: 0 })
export const attentionTitle = style({ ...fontSize.sm, fontWeight: 500 })
export const attentionDetail = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const attentionAction = style({
  gridColumn: "2",
  display: "inline-flex",
  alignItems: "center",
  gap: space(1),
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.mutedForeground,
  whiteSpace: "nowrap",
  selectors: { [`${attentionRow}:hover &`]: { color: vars.color.foreground } },
  "@media": { [media.sm]: { gridColumn: "3" } }
})
globalStyle(`${attentionAction} svg`, { width: "0.875rem", height: "0.875rem" })

const iconBase = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: space(8),
  height: space(8),
  borderRadius: vars.radius.md,
  flexShrink: 0
})
export const toneIcon = styleVariants({
  critical: [iconBase, { color: vars.color.destructive, backgroundColor: alpha(vars.color.destructive, 12) }],
  warning: [
    iconBase,
    {
      color: `color-mix(in oklch, ${vars.color.warning} 70%, ${vars.color.foreground})`,
      backgroundColor: alpha(vars.color.warning, 18)
    }
  ],
  info: [iconBase, { color: vars.color.chart1, backgroundColor: alpha(vars.color.chart1, 12) }],
  success: [iconBase, { color: vars.color.success, backgroundColor: alpha(vars.color.success, 12) }]
})
globalStyle(`${iconBase} svg`, { width: "1rem", height: "1rem" })

// KPI tiles.
export const kpi = style({ selectors: { "&&": { gap: space(3) } } })
export const kpiHead = style({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space(2) })
export const kpiLabel = style({ ...fontSize.sm, fontWeight: 500, color: vars.color.mutedForeground })
export const kpiIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: space(7),
  height: space(7),
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.muted,
  color: vars.color.mutedForeground
})
globalStyle(`${kpiIcon} svg`, { width: "0.875rem", height: "0.875rem" })
export const kpiValue = style({
  fontSize: "1.875rem",
  lineHeight: "2.25rem",
  fontWeight: 600,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums"
})
// A figure that can't be worked out yet reads as a note, not a number.
export const kpiLoss = style({ color: vars.color.destructive })
export const kpiUnavailable = style({
  ...fontSize.lg,
  fontWeight: 500,
  color: vars.color.mutedForeground,
  paddingBlock: "0.25rem"
})
export const kpiFoot = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space(1.5),
  ...fontSize.xs,
  color: vars.color.mutedForeground
})
export const kpiBody = style({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: space(3)
})
// Hidden on phones, where two tiles share a row and the number needs the width.
export const sparkline = style({
  display: "none",
  width: "6.5rem",
  height: space(10),
  flexShrink: 0,
  "@media": { [media.sm]: { display: "block" } }
})

const deltaBase = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space(0.5),
  borderRadius: vars.radius.full,
  paddingInline: space(1.5),
  paddingBlock: "1px",
  ...fontSize.xs,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums"
})
globalStyle(`${deltaBase} svg`, { width: "0.75rem", height: "0.75rem" })
export const delta = styleVariants({
  up: [deltaBase, { color: vars.color.success, backgroundColor: alpha(vars.color.success, 12) }],
  down: [deltaBase, { color: vars.color.destructive, backgroundColor: alpha(vars.color.destructive, 10) }],
  flat: [deltaBase, { color: vars.color.mutedForeground, backgroundColor: vars.color.muted }]
})

// Chart cards.
// A chart that grows to fill its card, so it matches the height of the card beside it.
export const chartGrow = style({ width: "100%", flex: 1, minHeight: "16rem" })
export const fillCard = style({ display: "flex", flexDirection: "column" })
export const fill = style({ display: "flex", flexDirection: "column", gap: space(4), flex: 1, minWidth: 0 })
export const chartShort = style({ width: "100%", height: "13rem" })
export const legend = style({ display: "flex", flexWrap: "wrap", gap: space(5), ...fontSize.xs })
export const legendItem = style({ display: "flex", flexDirection: "column", gap: space(0.5) })
export const legendLabel = style({
  display: "flex",
  alignItems: "center",
  gap: space(1.5),
  color: vars.color.mutedForeground
})
export const legendValue = style({ ...fontSize.lg, fontWeight: 600, fontVariantNumeric: "tabular-nums" })
export const swatch = style({ width: space(2.5), height: space(2.5), borderRadius: "3px", flexShrink: 0 })
// The compared period's line: dashed, in muted ink.
export const swatchDashed = style({
  width: space(3),
  height: 0,
  borderTop: `2px dashed ${vars.color.mutedForeground}`,
  flexShrink: 0
})
export const note = style({ ...fontSize.xs, color: vars.color.mutedForeground })

// Chart tooltip.
export const tooltip = style({
  display: "flex",
  flexDirection: "column",
  gap: space(1.5),
  minWidth: "9rem",
  padding: space(2.5),
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.popover,
  color: vars.color.popoverForeground,
  boxShadow: `0 0 0 1px ${alpha(vars.color.foreground, 10)}, ${vars.shadow.md}`,
  ...fontSize.xs
})
export const tooltipTitle = style({ fontWeight: 500 })
export const tooltipRow = style({ display: "flex", alignItems: "center", gap: space(2) })
export const tooltipName = style({ flex: 1, color: vars.color.mutedForeground })
export const tooltipValue = style({ fontWeight: 500, fontVariantNumeric: "tabular-nums" })

// Range switch.
export const range = style({
  display: "inline-flex",
  gap: space(0.5),
  padding: space(0.5),
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.muted
})
export const rangeItem = style({
  height: space(7),
  paddingInline: space(2.5),
  borderRadius: vars.radius.md,
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.mutedForeground,
  cursor: "pointer",
  transition: "color 150ms ease, background-color 150ms ease",
  selectors: {
    "&:hover": { color: vars.color.foreground },
    "&:focus-visible": focusRing,
    "&[data-pressed]": {
      color: vars.color.foreground,
      backgroundColor: vars.color.background,
      boxShadow: `0 0 0 1px ${alpha(vars.color.foreground, 8)}, ${vars.shadow.xs}`
    }
  }
})

// Horizontal meters: stock by channel and open PO value by supplier.
export const meters = style({ display: "flex", flexDirection: "column", gap: space(4) })
export const meter = style({ display: "flex", flexDirection: "column", gap: space(1.5) })
export const meterHead = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: space(3),
  ...fontSize.sm
})
export const meterName = style({
  display: "flex",
  alignItems: "center",
  gap: space(2),
  minWidth: 0,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
})
export const meterValue = style({ fontVariantNumeric: "tabular-nums", fontWeight: 500, whiteSpace: "nowrap" })
export const meterTrack = style({
  display: "flex",
  gap: "2px",
  height: space(2),
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.muted,
  overflow: "hidden"
})
export const meterFill = style({ height: "100%", minWidth: "2px", borderRadius: vars.radius.full })
export const meterDetail = style({
  display: "flex",
  justifyContent: "space-between",
  gap: space(3),
  ...fontSize.xs,
  color: vars.color.mutedForeground,
  fontVariantNumeric: "tabular-nums"
})

// Summary figures under a card's content.
export const figures = style({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: space(4),
  paddingTop: space(4),
  borderTop: `1px solid ${vars.color.border}`
})
// Figures that open a card, without the rule above them.
export const figuresOnly = style({ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space(4) })
export const figure = style({ display: "flex", flexDirection: "column", gap: space(0.5) })
export const figureLabel = style({ ...fontSize.xs, color: vars.color.mutedForeground })
export const figureValue = style({ ...fontSize.base, fontWeight: 600, fontVariantNumeric: "tabular-nums" })

// Shipment pipeline.
export const stages = style({ display: "flex", flexDirection: "column" })
export const stage = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3),
  paddingBlock: space(2),
  ...fontSize.sm,
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border}` } }
})
export const stageName = style({
  display: "flex",
  alignItems: "center",
  gap: space(2),
  color: vars.color.mutedForeground
})
export const stageCount = style({ fontWeight: 600, fontVariantNumeric: "tabular-nums" })
export const stageDot = style({ width: space(2), height: space(2), borderRadius: vars.radius.full, flexShrink: 0 })

// Best sellers.
// Product names and details wrap to two lines at most, so a table fits its card instead of scrolling sideways.
export const product = style({
  display: "flex",
  alignItems: "center",
  gap: space(3),
  minWidth: "10rem",
  whiteSpace: "normal"
})
export const productText = style({ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 })
const twoLines = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  overflowWrap: "anywhere"
} as const
export const productTitle = style({ ...fontSize.sm, fontWeight: 500, maxWidth: "22rem", ...twoLines })
export const productDetail = style({ ...fontSize.xs, color: vars.color.mutedForeground, ...twoLines })
export const thumb = style({
  width: space(9),
  height: space(9),
  flexShrink: 0,
  borderRadius: vars.radius.md,
  objectFit: "cover",
  backgroundColor: vars.color.muted,
  boxShadow: `0 0 0 1px ${alpha(vars.color.foreground, 8)}`
})
export const thumbEmpty = style([
  thumb,
  { display: "flex", alignItems: "center", justifyContent: "center", color: vars.color.mutedForeground }
])
globalStyle(`${thumbEmpty} svg`, { width: "1rem", height: "1rem" })
export const number = style({ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" })
export const cardLink = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space(1),
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.mutedForeground,
  textDecoration: "none",
  borderRadius: vars.radius.sm,
  selectors: { "&:hover": { color: vars.color.foreground }, "&:focus-visible": focusRing }
})
globalStyle(`${cardLink} svg`, { width: "0.875rem", height: "0.875rem" })

export const skeleton = styleVariants({
  attention: { height: "9rem", borderRadius: vars.radius.xl },
  kpi: { height: "8.5rem", borderRadius: vars.radius.xl },
  panel: { height: "24rem", borderRadius: vars.radius.xl }
})

// Chart legend with its switches; they wrap under the legend on narrow screens.
export const chartControls = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})
export const switches = style({ display: "flex", flexWrap: "wrap", gap: space(2) })

export const kpiNote = style({ flexBasis: "100%", color: vars.color.mutedForeground })
export const figureNote = style({ ...fontSize.xs, color: vars.color.mutedForeground })

// Links under the days-of-cover chart, one per group, opening those items in Restock.
// Days of cover: one row per group, each a link to its items.
export const coverRows = style({ display: "flex", flexDirection: "column", gap: space(0.5), listStyle: "none" })
export const coverRow = style({
  display: "grid",
  gridTemplateColumns: "7rem minmax(0, 1fr) 3rem",
  alignItems: "center",
  gap: space(3),
  padding: `${space(1.5)} ${space(2)}`,
  borderRadius: vars.radius.md,
  ...fontSize.sm,
  color: vars.color.foreground,
  textDecoration: "none",
  transition: "background-color 150ms ease",
  selectors: {
    "a&:hover": { backgroundColor: vars.color.muted },
    "a&:focus-visible": focusRing,
    "span&": { color: vars.color.mutedForeground }
  }
})
export const coverLabel = style({ whiteSpace: "nowrap" })
export const coverTrack = style({
  height: space(2.5),
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.muted,
  overflow: "hidden"
})
export const coverFill = style({
  display: "block",
  height: "100%",
  minWidth: space(0.5),
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.chart1
})
export const coverCount = style({ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 })

// Freshness line and channel filter above the cards.
export const toolbar = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3)
})
export const filters = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: space(2) })
export const channelFilter = style({ selectors: { "&&": { width: "auto", alignItems: "center" } } })

// Setup checklist.
export const progressTrack = style({
  height: space(1.5),
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.muted,
  overflow: "hidden"
})
export const progressFill = style({
  display: "block",
  height: "100%",
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.primary,
  transition: "width 300ms ease"
})
export const steps = style({
  display: "grid",
  gap: space(1),
  listStyle: "none",
  gridTemplateColumns: "minmax(0, 1fr)",
  "@media": { [media.md]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }
})
export const step = style({
  display: "flex",
  alignItems: "center",
  gap: space(3),
  paddingBlock: space(2),
  paddingInline: space(3),
  borderRadius: vars.radius.lg,
  color: "inherit",
  textDecoration: "none",
  transition: "background-color 150ms ease",
  selectors: {
    "a&:hover": { backgroundColor: alpha(vars.color.muted, 80) },
    "&:focus-visible": focusRing,
    "&[data-done]": { color: vars.color.mutedForeground }
  }
})
export const stepTitle = style({ ...fontSize.sm, fontWeight: 500 })
export const stepDone = style({ width: "1.125rem", height: "1.125rem", flexShrink: 0, color: vars.color.success })
export const stepTodo = style({ width: "1.125rem", height: "1.125rem", flexShrink: 0, color: vars.color.border })
export const stepChevron = style({
  width: "1rem",
  height: "1rem",
  marginLeft: "auto",
  flexShrink: 0,
  color: vars.color.mutedForeground
})

// A card's single large figure.
export const hero = style({ display: "flex", flexDirection: "column", gap: space(0.5) })
export const heroValue = style({
  fontSize: "1.875rem",
  lineHeight: "2.25rem",
  fontWeight: 600,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums"
})
export const spendRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(3),
  paddingBlock: space(2),
  paddingInline: space(2),
  marginInline: `calc(${space(2)} * -1)`,
  borderRadius: vars.radius.md,
  color: "inherit",
  textDecoration: "none",
  selectors: {
    "&:hover": { backgroundColor: alpha(vars.color.muted, 80) },
    "&:focus-visible": focusRing,
    "& + &": { borderTop: `1px solid ${vars.color.border}`, borderTopLeftRadius: 0, borderTopRightRadius: 0 }
  }
})

// Trending products.
export const movers = style({
  display: "grid",
  gap: space(6),
  gridTemplateColumns: "minmax(0, 1fr)",
  "@media": { [media.md]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }
})
export const listHeading = style({
  ...fontSize.xs,
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: vars.color.mutedForeground
})
export const moverList = style({ display: "flex", flexDirection: "column", gap: space(3), listStyle: "none" })
export const mover = style({ display: "flex", alignItems: "center", gap: space(3), minWidth: 0 })
export const productLink = style([
  productTitle,
  {
    color: "inherit",
    textDecoration: "none",
    borderRadius: vars.radius.sm,
    selectors: {
      "&:hover": { textDecoration: "underline", textUnderlineOffset: "2px" },
      "&:focus-visible": focusRing
    }
  }
])

export const profitLine = style({ display: "flex", alignItems: "baseline", gap: space(3) })
export const legendUnit = style({ ...fontSize.sm, fontWeight: 400, color: vars.color.mutedForeground })
