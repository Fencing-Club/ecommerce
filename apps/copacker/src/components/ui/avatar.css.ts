import { globalStyle, style } from "@/styles/layers"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const ringBackground = `0 0 0 2px ${vars.color.background}`

export const avatar = style({
  position: "relative",
  display: "flex",
  width: space(8),
  height: space(8),
  flexShrink: 0,
  borderRadius: vars.radius.full,
  userSelect: "none",
  selectors: {
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      borderRadius: vars.radius.full,
      border: `1px solid ${vars.color.border}`,
      mixBlendMode: "darken"
    },
    ".dark &::after": { mixBlendMode: "lighten" },
    "&[data-size='lg']": { width: space(10), height: space(10) },
    "&[data-size='sm']": { width: space(6), height: space(6) }
  }
})

export const image = style({
  aspectRatio: "1 / 1",
  width: "100%",
  height: "100%",
  borderRadius: vars.radius.full,
  objectFit: "cover"
})

export const fallback = style({
  display: "flex",
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.muted,
  ...fontSize.sm,
  color: vars.color.mutedForeground,
  selectors: { [`${avatar}[data-size='sm'] &`]: fontSize.xs }
})

export const badge = style({
  position: "absolute",
  right: 0,
  bottom: 0,
  zIndex: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.primary,
  color: vars.color.primaryForeground,
  backgroundBlendMode: "color",
  boxShadow: ringBackground,
  userSelect: "none",
  selectors: {
    [`${avatar}[data-size='sm'] &`]: { width: space(2), height: space(2) },
    [`${avatar}[data-size='default'] &`]: { width: space(2.5), height: space(2.5) },
    [`${avatar}[data-size='lg'] &`]: { width: space(3), height: space(3) }
  }
})
globalStyle(`${avatar}[data-size='sm'] ${badge} > svg`, { display: "none" })
globalStyle(`${avatar}[data-size='default'] ${badge} > svg, ${avatar}[data-size='lg'] ${badge} > svg`, {
  width: space(2),
  height: space(2)
})

export const group = style({ display: "flex" })
globalStyle(`${group} > :not(:last-child)`, { marginInlineEnd: `-${space(2)}` })
globalStyle(`${group} > [data-slot='avatar']`, { boxShadow: ringBackground })

export const groupCount = style({
  position: "relative",
  display: "flex",
  width: space(8),
  height: space(8),
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.muted,
  ...fontSize.sm,
  color: vars.color.mutedForeground,
  boxShadow: ringBackground,
  selectors: {
    [`${group}:has([data-size='lg']) &`]: { width: space(10), height: space(10) },
    [`${group}:has([data-size='sm']) &`]: { width: space(6), height: space(6) }
  }
})
globalStyle(`${groupCount} > svg`, { width: space(4), height: space(4) })
globalStyle(`${group}:has([data-size='lg']) ${groupCount} > svg`, { width: space(5), height: space(5) })
globalStyle(`${group}:has([data-size='sm']) ${groupCount} > svg`, { width: space(3), height: space(3) })
