import { globalStyle, style, styleVariants } from "@vanilla-extract/css"
import { alpha, fontSize, focusRing, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const page = style({ display: "flex", flexDirection: "column", gap: space(6) })

// Grids: four KPI tiles, a wide chart beside a narrow card, and two even halves.
export const kpis = style({
  display: "grid",
  gap: space(4),
  gridTemplateColumns: "minmax(0, 1fr)",
  "@media": {
    [media.sm]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [media.xl]: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }
  }
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
export const sparkline = style({ width: "6.5rem", height: space(10), flexShrink: 0 })

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
export const chart = style({ width: "100%", height: "16rem" })
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
export const stageDot = styleVariants({
  quiet: { width: space(2), height: space(2), borderRadius: vars.radius.full, backgroundColor: vars.color.border },
  active: { width: space(2), height: space(2), borderRadius: vars.radius.full, backgroundColor: vars.color.chart1 },
  you: { width: space(2), height: space(2), borderRadius: vars.radius.full, backgroundColor: vars.color.warning },
  problem: {
    width: space(2),
    height: space(2),
    borderRadius: vars.radius.full,
    backgroundColor: vars.color.destructive
  }
})

// Best sellers.
export const product = style({ display: "flex", alignItems: "center", gap: space(3), minWidth: "12rem" })
export const productText = style({ display: "flex", flexDirection: "column", minWidth: 0 })
export const productTitle = style({
  ...fontSize.sm,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "22rem"
})
export const productDetail = style({ ...fontSize.xs, color: vars.color.mutedForeground })
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
