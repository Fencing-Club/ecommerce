import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const base = style({
  position: "relative",
  display: "grid",
  width: "100%",
  gap: space(0.5),
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  paddingInline: space(2.5),
  paddingBlock: space(2),
  textAlign: "left",
  ...fontSize.sm,
  selectors: {
    "&:has([data-slot='alert-action'])": { paddingRight: space(18) },
    "&:has(> svg)": { gridTemplateColumns: "auto 1fr", columnGap: space(2) }
  }
})
globalStyle(`${base} > svg`, {
  gridRow: "span 2 / span 2",
  transform: `translateY(${space(0.5)})`,
  color: "currentColor"
})
globalStyle(`${base} > svg:not([data-size])`, { width: space(4), height: space(4) })

const destructive = style({ backgroundColor: vars.color.card, color: vars.color.destructive })
globalStyle(`${destructive} > [data-slot='alert-description']`, { color: alpha(vars.color.destructive, 90) })

export const alert = recipe({
  base,
  variants: {
    variant: {
      default: { backgroundColor: vars.color.card, color: vars.color.cardForeground },
      destructive
    }
  },
  defaultVariants: { variant: "default" }
})

export type AlertVariants = NonNullable<RecipeVariants<typeof alert>>

const linkStyles = (cls: string) => {
  globalStyle(`${cls} a`, { textDecoration: "underline", textUnderlineOffset: "3px" })
  globalStyle(`${cls} a:hover`, { color: vars.color.foreground })
}

export const title = style({
  fontWeight: 500,
  selectors: { [`${base}:has(> svg) &`]: { gridColumnStart: 2 } }
})
linkStyles(title)

export const description = style({
  ...fontSize.sm,
  textWrap: "balance",
  color: vars.color.mutedForeground,
  "@media": { [media.md]: { textWrap: "pretty" } }
})
linkStyles(description)
globalStyle(`${description} p:not(:last-child)`, { marginBottom: space(4) })

export const action = style({ position: "absolute", top: space(2), right: space(2) })
