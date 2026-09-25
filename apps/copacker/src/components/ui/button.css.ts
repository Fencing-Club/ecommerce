import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, focusRing, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

const base = style({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.lg,
  border: "1px solid transparent",
  backgroundClip: "padding-box",
  ...fontSize.sm,
  fontWeight: 500,
  whiteSpace: "nowrap",
  transition: "color 150ms, background-color 150ms, border-color 150ms, box-shadow 150ms, opacity 150ms",
  outline: "none",
  userSelect: "none",
  selectors: {
    "&:focus-visible": focusRing,
    "&:active:not([aria-haspopup])": { transform: "translateY(1px)" },
    "&:disabled, &[data-disabled]": { pointerEvents: "none", opacity: 0.5 },
    "&[aria-invalid='true']": {
      borderColor: vars.color.destructive,
      boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 20)}`
    }
  }
})
globalStyle(`${base} svg`, { pointerEvents: "none", flexShrink: 0 })
globalStyle(`${base} svg:not([data-size])`, { width: "1rem", height: "1rem" })

const withInlineIcons = (end: string, start: string) => ({
  "&:has([data-icon='inline-end'])": { paddingRight: end },
  "&:has([data-icon='inline-start'])": { paddingLeft: start }
})

const sizeXs = style({
  height: space(6),
  gap: space(1),
  paddingInline: space(2),
  borderRadius: `min(${vars.radius.md}, 10px)`,
  ...fontSize.xs,
  selectors: withInlineIcons(space(1.5), space(1.5))
})
const sizeSm = style({
  height: space(7),
  gap: space(1),
  paddingInline: space(2.5),
  borderRadius: `min(${vars.radius.md}, 12px)`,
  fontSize: "0.8rem",
  selectors: withInlineIcons(space(1.5), space(1.5))
})
const sizeIconXs = style({ width: space(6), height: space(6), borderRadius: `min(${vars.radius.md}, 10px)` })
globalStyle(`${sizeXs} svg:not([data-size]), ${sizeIconXs} svg:not([data-size])`, {
  width: "0.75rem",
  height: "0.75rem"
})
globalStyle(`${sizeSm} svg:not([data-size])`, { width: "0.875rem", height: "0.875rem" })

export const button = recipe({
  base,
  variants: {
    variant: {
      default: {
        backgroundColor: vars.color.primary,
        color: vars.color.primaryForeground,
        selectors: { "&:hover": { backgroundColor: alpha(vars.color.primary, 80) } }
      },
      outline: {
        borderColor: vars.color.border,
        backgroundColor: vars.color.background,
        selectors: {
          "&:hover, &[aria-expanded='true']": { backgroundColor: vars.color.muted, color: vars.color.foreground },
          ".dark &": { borderColor: vars.color.input, backgroundColor: alpha(vars.color.input, 30) },
          ".dark &:hover": { backgroundColor: alpha(vars.color.input, 50) }
        }
      },
      secondary: {
        backgroundColor: vars.color.secondary,
        color: vars.color.secondaryForeground,
        selectors: {
          "&:hover": { backgroundColor: `color-mix(in oklch, ${vars.color.secondary}, ${vars.color.foreground} 5%)` }
        }
      },
      ghost: {
        selectors: {
          "&:hover, &[aria-expanded='true']": { backgroundColor: vars.color.muted, color: vars.color.foreground },
          ".dark &:hover": { backgroundColor: alpha(vars.color.muted, 50) }
        }
      },
      destructive: {
        backgroundColor: alpha(vars.color.destructive, 10),
        color: vars.color.destructive,
        selectors: {
          "&:hover": { backgroundColor: alpha(vars.color.destructive, 20) },
          "&:focus-visible": {
            borderColor: alpha(vars.color.destructive, 40),
            boxShadow: `0 0 0 3px ${alpha(vars.color.destructive, 20)}`
          },
          ".dark &": { backgroundColor: alpha(vars.color.destructive, 20) },
          ".dark &:hover": { backgroundColor: alpha(vars.color.destructive, 30) }
        }
      },
      link: {
        color: vars.color.primary,
        textUnderlineOffset: "4px",
        selectors: { "&:hover": { textDecoration: "underline" } }
      }
    },
    size: {
      default: {
        height: space(8),
        gap: space(1.5),
        paddingInline: space(2.5),
        selectors: withInlineIcons(space(2), space(2))
      },
      xs: sizeXs,
      sm: sizeSm,
      lg: {
        height: space(9),
        gap: space(1.5),
        paddingInline: space(2.5),
        selectors: withInlineIcons(space(2), space(2))
      },
      icon: { width: space(8), height: space(8) },
      "icon-xs": sizeIconXs,
      "icon-sm": { width: space(7), height: space(7), borderRadius: `min(${vars.radius.md}, 12px)` },
      "icon-lg": { width: space(9), height: space(9) }
    }
  },
  defaultVariants: { variant: "default", size: "default" }
})

export type ButtonVariants = NonNullable<RecipeVariants<typeof button>>
