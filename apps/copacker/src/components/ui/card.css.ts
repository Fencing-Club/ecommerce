import { createVar } from "@vanilla-extract/css"
import { style } from "@/styles/layers"
import { alpha, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const spacing = createVar()

export const card = style({
  vars: { [spacing]: space(4) },
  display: "flex",
  flexDirection: "column",
  gap: spacing,
  overflow: "hidden",
  borderRadius: vars.radius.xl,
  backgroundColor: vars.color.card,
  paddingBlock: spacing,
  ...fontSize.sm,
  color: vars.color.cardForeground,
  boxShadow: `0 0 0 1px ${alpha(vars.color.foreground, 10)}`,
  selectors: {
    "&[data-size='sm']": { vars: { [spacing]: space(3) } },
    "&:has(> [data-slot='card-footer'])": { paddingBottom: 0 }
  }
})

export const header = style({
  display: "grid",
  gridAutoRows: "min-content",
  alignItems: "start",
  gap: space(1),
  paddingInline: spacing,
  selectors: {
    "&:has(> [data-slot='card-action'])": { gridTemplateColumns: "minmax(0, 1fr) auto" },
    "&:has(> [data-slot='card-description'])": { gridTemplateRows: "auto auto" }
  }
})

export const title = style({
  ...fontSize.base,
  lineHeight: 1.375,
  fontWeight: 500,
  selectors: { [`${card}[data-size='sm'] &`]: fontSize.sm }
})

export const description = style({ ...fontSize.sm, color: vars.color.mutedForeground })

export const action = style({
  gridColumnStart: 2,
  gridRow: "1 / span 2",
  alignSelf: "start",
  justifySelf: "end"
})

export const content = style({ paddingInline: spacing })

export const footer = style({
  display: "flex",
  alignItems: "center",
  borderTop: `1px solid ${vars.color.border}`,
  backgroundColor: alpha(vars.color.muted, 50),
  padding: spacing
})
