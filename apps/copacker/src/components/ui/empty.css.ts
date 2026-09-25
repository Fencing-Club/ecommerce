import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

export const empty = style({
  display: "flex",
  width: "100%",
  minWidth: 0,
  flex: "1 1 0%",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space(4),
  borderRadius: vars.radius.xl,
  borderStyle: "dashed",
  padding: space(6),
  textAlign: "center",
  textWrap: "balance"
})

export const header = style({
  display: "flex",
  maxWidth: "24rem",
  flexDirection: "column",
  alignItems: "center",
  gap: space(2)
})

const mediaBase = style({
  marginBottom: space(2),
  display: "flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center"
})
globalStyle(`${mediaBase} svg`, { pointerEvents: "none", flexShrink: 0 })

const mediaIcon = style({
  width: space(8),
  height: space(8),
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.muted,
  color: vars.color.foreground
})
globalStyle(`${mediaIcon} svg:not([data-size])`, { width: space(4), height: space(4) })

export const media = recipe({
  base: mediaBase,
  variants: {
    variant: {
      default: { backgroundColor: "transparent" },
      icon: mediaIcon
    }
  },
  defaultVariants: { variant: "default" }
})

export type EmptyMediaVariants = NonNullable<RecipeVariants<typeof media>>

export const title = style({ ...fontSize.sm, fontWeight: 500, letterSpacing: "-0.025em" })

export const description = style({
  fontSize: fontSize.sm.fontSize,
  lineHeight: 1.625,
  color: vars.color.mutedForeground
})
globalStyle(`${description} > a`, { textDecoration: "underline", textUnderlineOffset: "4px" })
globalStyle(`${description} > a:hover`, { color: vars.color.primary })

export const content = style({
  display: "flex",
  width: "100%",
  maxWidth: "24rem",
  minWidth: 0,
  flexDirection: "column",
  alignItems: "center",
  gap: space(2.5),
  ...fontSize.sm,
  textWrap: "balance"
})
