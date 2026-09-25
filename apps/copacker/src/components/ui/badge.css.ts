import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, focusRing, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const destructiveRing = (percent: number) => `0 0 0 3px ${alpha(vars.color.destructive, percent)}`

const base = style({
  display: "inline-flex",
  height: space(5),
  width: "fit-content",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  gap: space(1),
  overflow: "hidden",
  // Tailwind rounded-4xl from the old shadcn theme.
  borderRadius: `calc(${vars.radius.lg} * 2.6)`,
  border: "1px solid transparent",
  paddingInline: space(2),
  paddingBlock: space(0.5),
  ...fontSize.xs,
  fontWeight: 500,
  whiteSpace: "nowrap",
  transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    "&:focus-visible": focusRing,
    "&:has([data-icon='inline-end'])": { paddingRight: space(1.5) },
    "&:has([data-icon='inline-start'])": { paddingLeft: space(1.5) },
    "&[aria-invalid='true']": { borderColor: vars.color.destructive },
    "&[aria-invalid='true']:focus-visible": { boxShadow: destructiveRing(20) },
    ".dark &[aria-invalid='true']:focus-visible": { boxShadow: destructiveRing(40) }
  }
})
globalStyle(`${base} > svg`, {
  pointerEvents: "none",
  width: `${space(3)} !important`,
  height: `${space(3)} !important`
})

export const badge = recipe({
  base,
  variants: {
    variant: {
      default: {
        backgroundColor: vars.color.primary,
        color: vars.color.primaryForeground,
        selectors: { "&:is(a):hover": { backgroundColor: alpha(vars.color.primary, 80) } }
      },
      secondary: {
        backgroundColor: vars.color.secondary,
        color: vars.color.secondaryForeground,
        selectors: { "&:is(a):hover": { backgroundColor: alpha(vars.color.secondary, 80) } }
      },
      destructive: {
        backgroundColor: alpha(vars.color.destructive, 10),
        color: vars.color.destructive,
        selectors: {
          "&:focus-visible": { boxShadow: destructiveRing(20) },
          ".dark &": { backgroundColor: alpha(vars.color.destructive, 20) },
          ".dark &:focus-visible": { boxShadow: destructiveRing(40) },
          "&:is(a):hover": { backgroundColor: alpha(vars.color.destructive, 20) }
        }
      },
      outline: {
        borderColor: vars.color.border,
        color: vars.color.foreground,
        selectors: {
          "&:is(a):hover": { backgroundColor: vars.color.muted, color: vars.color.mutedForeground }
        }
      },
      ghost: {
        selectors: {
          "&:hover": { backgroundColor: vars.color.muted, color: vars.color.mutedForeground },
          ".dark &:hover": { backgroundColor: alpha(vars.color.muted, 50) }
        }
      },
      link: {
        color: vars.color.primary,
        textUnderlineOffset: "4px",
        selectors: { "&:hover": { textDecoration: "underline" } }
      }
    }
  },
  defaultVariants: { variant: "default" }
})

export type BadgeVariants = NonNullable<RecipeVariants<typeof badge>>
