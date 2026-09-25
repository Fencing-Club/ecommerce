import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const colorTransition = {
  transitionProperty: "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)"
} as const

export const group = style({
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: space(4),
  selectors: {
    "&:has([data-size='sm'])": { gap: space(2.5) },
    "&:has([data-size='xs'])": { gap: space(2) }
  }
})

export const separator = style({ marginBlock: space(2) })

const itemBase = style({
  display: "flex",
  width: "100%",
  flexWrap: "wrap",
  alignItems: "center",
  borderRadius: vars.radius.lg,
  border: "1px solid",
  ...fontSize.sm,
  ...colorTransition,
  transitionDuration: "100ms",
  outline: "none",
  selectors: {
    "&:focus-visible": {
      borderColor: vars.color.ring,
      boxShadow: `0 0 0 3px ${alpha(vars.color.ring, 50)}`
    },
    "&:is(a)": { ...colorTransition, transitionDuration: "150ms" },
    "&:is(a):hover": { backgroundColor: vars.color.muted }
  }
})

export const item = recipe({
  base: itemBase,
  variants: {
    variant: {
      default: { borderColor: "transparent" },
      outline: { borderColor: vars.color.border },
      muted: { borderColor: "transparent", backgroundColor: alpha(vars.color.muted, 50) }
    },
    size: {
      default: { gap: space(2.5), paddingInline: space(3), paddingBlock: space(2.5) },
      sm: { gap: space(2.5), paddingInline: space(3), paddingBlock: space(2.5) },
      xs: {
        gap: space(2),
        paddingInline: space(2.5),
        paddingBlock: space(2),
        selectors: { "[data-slot='dropdown-menu-content'] &": { padding: 0 } }
      }
    }
  },
  defaultVariants: { variant: "default", size: "default" }
})

export type ItemVariants = NonNullable<RecipeVariants<typeof item>>

const mediaBase = style({
  display: "flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  gap: space(2),
  selectors: {
    [`${itemBase}:has([data-slot='item-description']) &`]: { translate: `0 ${space(0.5)}`, alignSelf: "flex-start" }
  }
})
globalStyle(`${mediaBase} svg`, { pointerEvents: "none" })

const mediaIcon = style({})
globalStyle(`${mediaIcon} svg:not([data-size])`, { width: space(4), height: space(4) })

const mediaImage = style({
  width: space(10),
  height: space(10),
  overflow: "hidden",
  borderRadius: vars.radius.sm,
  selectors: {
    [`${itemBase}[data-size='sm'] &`]: { width: space(8), height: space(8) },
    [`${itemBase}[data-size='xs'] &`]: { width: space(6), height: space(6) }
  }
})
globalStyle(`${mediaImage} img`, { width: "100%", height: "100%", objectFit: "cover" })

export const media = recipe({
  base: mediaBase,
  variants: {
    variant: {
      default: { backgroundColor: "transparent" },
      icon: mediaIcon,
      image: mediaImage
    }
  },
  defaultVariants: { variant: "default" }
})

export type ItemMediaVariants = NonNullable<RecipeVariants<typeof media>>

export const content = style({
  display: "flex",
  flex: "1 1 0%",
  flexDirection: "column",
  gap: space(1),
  selectors: { [`${itemBase}[data-size='xs'] &`]: { gap: 0 } }
})
globalStyle(`${content} + [data-slot='item-content']`, { flex: "none" })

export const title = style({
  display: "flex",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 1,
  width: "fit-content",
  alignItems: "center",
  gap: space(2),
  ...fontSize.sm,
  lineHeight: 1.375,
  fontWeight: 500,
  textUnderlineOffset: "4px"
})

export const description = style({
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  textAlign: "left",
  ...fontSize.sm,
  lineHeight: 1.5,
  fontWeight: 400,
  color: vars.color.mutedForeground,
  selectors: { [`${itemBase}[data-size='xs'] &`]: { fontSize: fontSize.xs.fontSize } }
})
globalStyle(`${description} > a`, { textDecoration: "underline", textUnderlineOffset: "4px" })
globalStyle(`${description} > a:hover`, { color: vars.color.primary })

export const actions = style({ display: "flex", alignItems: "center", gap: space(2) })

export const bar = style({
  display: "flex",
  flexBasis: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space(2)
})
