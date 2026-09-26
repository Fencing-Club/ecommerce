import { style } from "@/styles/layers"
import { alpha, fontSize, focusRing, media, space } from "@/styles/tokens"
import { pop } from "@/styles/animations.css"
import { vars } from "@/styles/theme.css"

export const controls = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: space(2) })

export const positioner = style({ isolation: "isolate", zIndex: 50, outline: "none" })

export const popup = style([
  pop,
  {
    transformOrigin: "var(--transform-origin)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    maxWidth: `calc(100vw - ${space(4)})`,
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    borderRadius: vars.radius.lg,
    backgroundColor: vars.color.popover,
    color: vars.color.popoverForeground,
    boxShadow: `${vars.shadow.md}, 0 0 0 1px ${alpha(vars.color.foreground, 10)}`,
    outline: "none",
    "@media": { [media.sm]: { gridTemplateColumns: `${space(44)} minmax(0, 1fr)` } }
  }
])

export const presets = style({
  display: "flex",
  flexDirection: "column",
  gap: space(0.5),
  padding: space(2),
  borderBottom: `1px solid ${vars.color.border}`,
  "@media": { [media.sm]: { borderBottom: "none", borderRight: `1px solid ${vars.color.border}` } }
})

export const presetDivider = style({ height: 1, margin: `${space(1.5)} 0`, backgroundColor: vars.color.border })

export const preset = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(2),
  width: "100%",
  padding: `${space(1.5)} ${space(2)}`,
  border: "none",
  borderRadius: vars.radius.md,
  background: "none",
  color: vars.color.foreground,
  ...fontSize.sm,
  textAlign: "left",
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.accent },
    "&:focus-visible": focusRing,
    "&[aria-pressed='true']": { backgroundColor: vars.color.muted, fontWeight: 500 }
  }
})

export const presetHeading = style([preset, { fontWeight: 500, color: vars.color.mutedForeground }])

export const panel = style({ display: "flex", flexDirection: "column", gap: space(3), padding: space(3) })

export const dates = style({ display: "flex", alignItems: "center", gap: space(2) })

export const dateInput = style({
  flex: 1,
  minWidth: 0,
  height: space(9),
  padding: `0 ${space(2.5)}`,
  border: `1px solid ${vars.color.input}`,
  borderRadius: vars.radius.md,
  backgroundColor: "transparent",
  color: vars.color.foreground,
  ...fontSize.sm,
  selectors: { "&:focus-visible": focusRing }
})

export const arrow = style({ flexShrink: 0, width: space(4), height: space(4), color: vars.color.mutedForeground })

export const monthHeader = style({ display: "flex", alignItems: "center", justifyContent: "space-between" })

export const monthName = style({ ...fontSize.sm, fontWeight: 600 })

export const calendar = style({
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  rowGap: space(0.5),
  textAlign: "center"
})

export const weekday = style({ padding: `${space(1)} 0`, ...fontSize.xs, color: vars.color.mutedForeground })

export const day = style({
  height: space(9),
  minWidth: space(9),
  border: "none",
  borderRadius: vars.radius.md,
  background: "none",
  color: vars.color.foreground,
  ...fontSize.sm,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": { backgroundColor: vars.color.accent },
    "&:focus-visible": focusRing,
    "&:disabled": { color: alpha(vars.color.mutedForeground, 50), cursor: "default" },
    "&[data-in-range='true']": { borderRadius: 0, backgroundColor: vars.color.muted },
    "&[data-edge='true']": {
      borderRadius: vars.radius.md,
      backgroundColor: vars.color.foreground,
      color: vars.color.background,
      fontWeight: 600
    }
  }
})

export const footer = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: space(2),
  paddingTop: space(3),
  borderTop: `1px solid ${vars.color.border}`
})
