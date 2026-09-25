import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, fontSize, media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Sidebar-specific focus ring (was `ring-sidebar-ring outline-hidden focus-visible:ring-2`).
const ring = { outline: "2px solid transparent", outlineOffset: "2px" } as const
const focusRing = { boxShadow: `0 0 0 2px ${vars.color.sidebarRing}` } as const
const accent = { backgroundColor: vars.color.sidebarAccent, color: vars.color.sidebarAccentForeground } as const
const disabled = { pointerEvents: "none", opacity: 0.5 } as const
const truncate = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const
const linear = "200ms linear"

// SidebarProvider's wrapper; it sets --sidebar-width and --sidebar-width-icon inline.
export const wrapper = style({
  display: "flex",
  minHeight: "100svh",
  width: "100%",
  selectors: { "&:has([data-variant='inset'])": { backgroundColor: vars.color.sidebar } }
})

// collapsible="none"
export const staticSidebar = style({
  display: "flex",
  height: "100%",
  width: "var(--sidebar-width)",
  flexDirection: "column",
  backgroundColor: vars.color.sidebar,
  color: vars.color.sidebarForeground
})

// Mobile sidebar rendered in a Sheet.
export const mobile = style({
  width: "var(--sidebar-width)",
  backgroundColor: vars.color.sidebar,
  padding: 0,
  color: vars.color.sidebarForeground
})
globalStyle(`${mobile} > button`, { display: "none" })

export const mobileInner = style({ display: "flex", height: "100%", width: "100%", flexDirection: "column" })

// Desktop root. Carries data-state, data-collapsible, data-variant, and data-side for its descendants and for
// SidebarInset (its next sibling).
export const root = style({
  display: "none",
  color: vars.color.sidebarForeground,
  "@media": { [media.md]: { display: "block" } }
})

const collapsed = `${root}[data-collapsible='icon']`
const offcanvas = `${root}[data-collapsible='offcanvas']`
const detached = `${root}:is([data-variant='floating'], [data-variant='inset'])`

// Reserves the sidebar's space in the page flow.
export const gap = style({
  position: "relative",
  width: "var(--sidebar-width)",
  backgroundColor: "transparent",
  transition: `width ${linear}`,
  selectors: {
    [`${offcanvas} &`]: { width: 0 },
    [`${root}[data-side='right'] &`]: { rotate: "180deg" },
    [`${collapsed} &`]: { width: "var(--sidebar-width-icon)" },
    [`${detached}[data-collapsible='icon'] &`]: { width: `calc(var(--sidebar-width-icon) + ${space(4)})` }
  }
})

export const container = style({
  position: "fixed",
  insetBlock: 0,
  zIndex: 10,
  display: "none",
  height: "100svh",
  width: "var(--sidebar-width)",
  transition: `left ${linear}, right ${linear}, width ${linear}`,
  "@media": { [media.md]: { display: "flex" } },
  selectors: {
    "&[data-side='left']": { left: 0 },
    [`${offcanvas} &[data-side='left']`]: { left: "calc(var(--sidebar-width) * -1)" },
    "&[data-side='right']": { right: 0 },
    [`${offcanvas} &[data-side='right']`]: { right: "calc(var(--sidebar-width) * -1)" },
    // variant="sidebar"
    [`${root}[data-variant='sidebar'][data-collapsible='icon'] &`]: { width: "var(--sidebar-width-icon)" },
    [`${root}[data-variant='sidebar'][data-side='left'] &`]: { borderRight: `1px solid ${vars.color.border}` },
    [`${root}[data-variant='sidebar'][data-side='right'] &`]: { borderLeft: `1px solid ${vars.color.border}` },
    // variant="floating" and variant="inset"
    [`${detached} &`]: { padding: space(2) },
    [`${detached}[data-collapsible='icon'] &`]: { width: `calc(var(--sidebar-width-icon) + ${space(4)} + 2px)` }
  }
})

export const inner = style({
  display: "flex",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  backgroundColor: vars.color.sidebar,
  selectors: {
    [`${root}[data-variant='floating'] &`]: {
      borderRadius: vars.radius.lg,
      boxShadow: `0 0 0 1px ${vars.color.sidebarBorder}, ${vars.shadow.sm}`
    }
  }
})

export const rail = style({
  position: "absolute",
  insetBlock: 0,
  zIndex: 20,
  display: "none",
  width: space(4),
  translate: "-50% 0",
  transitionProperty: "all",
  transitionDuration: "150ms",
  transitionTimingFunction: "linear",
  "@media": { [media.sm]: { display: "flex" } },
  selectors: {
    "&::after": {
      content: "''",
      position: "absolute",
      insetBlock: 0,
      insetInlineStart: "50%",
      width: "2px"
    },
    "&:hover::after": { backgroundColor: vars.color.sidebarBorder },
    [`${root}[data-side='left'] &`]: { right: `-${space(4)}` },
    [`${root}[data-side='right'] &`]: { left: 0 },
    "[data-side='left'] &": { cursor: "w-resize" },
    "[data-side='right'] &": { cursor: "e-resize" },
    "[data-side='left'][data-state='collapsed'] &": { cursor: "e-resize" },
    "[data-side='right'][data-state='collapsed'] &": { cursor: "w-resize" },
    [`${offcanvas} &`]: { translate: "0 0" },
    [`${offcanvas} &::after`]: { left: "100%" },
    [`${offcanvas} &:hover`]: { backgroundColor: vars.color.sidebar },
    "[data-side='left'][data-collapsible='offcanvas'] &": { right: `-${space(2)}` },
    "[data-side='right'][data-collapsible='offcanvas'] &": { left: `-${space(2)}` }
  }
})

export const inset = style({
  position: "relative",
  display: "flex",
  width: "100%",
  flex: "1 1 0%",
  flexDirection: "column",
  backgroundColor: vars.color.background,
  "@media": {
    [media.md]: {
      selectors: {
        [`${root}[data-variant='inset'] ~ &`]: {
          margin: space(2),
          marginLeft: 0,
          borderRadius: vars.radius.xl,
          boxShadow: vars.shadow.sm
        },
        [`${root}[data-variant='inset'][data-state='collapsed'] ~ &`]: { marginLeft: space(2) }
      }
    }
  }
})

export const input = style({
  height: space(8),
  width: "100%",
  backgroundColor: vars.color.background,
  boxShadow: "none"
})

export const section = style({ display: "flex", flexDirection: "column", gap: space(2), padding: space(2) })

export const separator = style({
  marginInline: space(2),
  width: "auto",
  backgroundColor: vars.color.sidebarBorder
})

export const content = style({
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  display: "flex",
  minHeight: 0,
  flex: "1 1 0%",
  flexDirection: "column",
  gap: 0,
  overflow: "auto",
  selectors: {
    "&::-webkit-scrollbar": { display: "none" },
    [`${collapsed} &`]: { overflow: "hidden" }
  }
})

export const group = style({
  position: "relative",
  display: "flex",
  width: "100%",
  minWidth: 0,
  flexDirection: "column",
  padding: space(2)
})

export const groupLabel = style({
  display: "flex",
  height: space(8),
  flexShrink: 0,
  alignItems: "center",
  borderRadius: vars.radius.md,
  paddingInline: space(2),
  ...fontSize.xs,
  fontWeight: 500,
  color: alpha(vars.color.sidebarForeground, 70),
  ...ring,
  transition: `margin ${linear}, opacity ${linear}`,
  selectors: {
    [`${collapsed} &`]: { marginTop: `-${space(8)}`, opacity: 0 },
    "&:focus-visible": focusRing
  }
})

// Absolutely positioned icon buttons shared by SidebarGroupAction and SidebarMenuAction.
const iconAction = style({
  position: "absolute",
  display: "flex",
  aspectRatio: "1 / 1",
  width: space(5),
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.md,
  padding: 0,
  color: vars.color.sidebarForeground,
  ...ring,
  transitionProperty: "transform, translate, scale, rotate",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    // Widens the touch target on mobile.
    "&::after": { content: "''", position: "absolute", inset: `-${space(2)}` },
    "&:hover": accent,
    "&:focus-visible": focusRing,
    [`${collapsed} &`]: { display: "none" }
  },
  "@media": { [media.md]: { selectors: { "&::after": { display: "none" } } } }
})

export const groupAction = style([iconAction, { top: space(3.5), right: space(3) }])

export const groupContent = style({ width: "100%", ...fontSize.sm })

export const menu = style({ display: "flex", width: "100%", minWidth: 0, flexDirection: "column", gap: 0 })

export const menuItem = style({ position: "relative" })

const menuButtonBase = style({
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: space(2),
  overflow: "hidden",
  borderRadius: vars.radius.md,
  padding: space(2),
  textAlign: "left",
  ...fontSize.sm,
  ...ring,
  transitionProperty: "width, height, padding",
  transitionDuration: "150ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    [`${menuItem}:has([data-sidebar='menu-action']) &`]: { paddingRight: space(8) },
    [`${collapsed} &`]: {
      width: `${space(8)} !important`,
      height: `${space(8)} !important`,
      padding: `${space(2)} !important`
    },
    "&:hover": accent,
    "&:focus-visible": focusRing,
    "&:active": accent,
    "&:disabled, &[aria-disabled='true']": disabled,
    "&[data-open]:not([data-open='false']):hover, &[data-state='open']:hover": accent,
    "&[data-active]:not([data-active='false']), &[data-state='active']": { ...accent, fontWeight: 500 }
  }
})
globalStyle(`${menuButtonBase} svg:not([data-size])`, { width: space(4), height: space(4) })
globalStyle(`${menuButtonBase} svg`, { flexShrink: 0 })
globalStyle(`${menuButtonBase} > span:last-child`, truncate)

export const menuButton = recipe({
  base: menuButtonBase,
  variants: {
    variant: {
      default: { selectors: { "&:hover": accent } },
      outline: {
        backgroundColor: vars.color.background,
        boxShadow: `0 0 0 1px ${vars.color.sidebarBorder}`,
        selectors: { "&:hover": { ...accent, boxShadow: `0 0 0 1px ${vars.color.sidebarAccent}` } }
      }
    },
    size: {
      default: { height: space(8), ...fontSize.sm },
      sm: { height: space(7), ...fontSize.xs },
      lg: { height: space(12), ...fontSize.sm, selectors: { [`${collapsed} &`]: { padding: "0 !important" } } }
    }
  },
  defaultVariants: { variant: "default", size: "default" }
})

export type MenuButtonVariants = NonNullable<RecipeVariants<typeof menuButton>>

// Badges and actions sit beside a SidebarMenuButton and follow its size, hover, and active state.
const followsMenuButton = {
  [`${menuButtonBase}:hover ~ &`]: { color: vars.color.sidebarAccentForeground },
  [`${menuButtonBase}[data-size='default'] ~ &`]: { top: space(1.5) },
  [`${menuButtonBase}[data-size='lg'] ~ &`]: { top: space(2.5) },
  [`${menuButtonBase}[data-size='sm'] ~ &`]: { top: space(1) }
}
const activeMenuButton = `${menuButtonBase}:is([data-active]:not([data-active='false']), [data-state='active']) ~ &`

export const menuAction = style([
  iconAction,
  {
    top: space(1.5),
    right: space(1),
    selectors: followsMenuButton
  }
])

export const menuActionShowOnHover = style({
  "@media": { [media.md]: { opacity: 0 } },
  selectors: {
    [`${menuItem}:focus-within &, ${menuItem}:hover &`]: { opacity: 1 },
    [activeMenuButton]: { color: vars.color.sidebarAccentForeground },
    "&[aria-expanded='true']": { opacity: 1 }
  }
})

export const menuBadge = style({
  pointerEvents: "none",
  position: "absolute",
  right: space(1),
  display: "flex",
  height: space(5),
  minWidth: space(5),
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.md,
  paddingInline: space(1),
  ...fontSize.xs,
  fontWeight: 500,
  color: vars.color.sidebarForeground,
  fontVariantNumeric: "tabular-nums",
  userSelect: "none",
  selectors: {
    [`${collapsed} &`]: { display: "none" },
    ...followsMenuButton,
    [activeMenuButton]: { color: vars.color.sidebarAccentForeground }
  }
})

export const menuSkeleton = style({
  display: "flex",
  height: space(8),
  alignItems: "center",
  gap: space(2),
  borderRadius: vars.radius.md,
  paddingInline: space(2)
})

export const menuSkeletonIcon = style({ width: space(4), height: space(4), borderRadius: vars.radius.md })

export const menuSkeletonText = style({ height: space(4), maxWidth: "var(--skeleton-width)", flex: "1 1 0%" })

export const menuSub = style({
  marginInline: space(3.5),
  display: "flex",
  minWidth: 0,
  translate: "1px 0",
  flexDirection: "column",
  gap: space(1),
  borderLeft: `1px solid ${vars.color.sidebarBorder}`,
  paddingInline: space(2.5),
  paddingBlock: space(0.5),
  selectors: { [`${collapsed} &`]: { display: "none" } }
})

export const menuSubItem = style({ position: "relative" })

export const menuSubButton = style({
  display: "flex",
  height: space(7),
  minWidth: 0,
  translate: "-1px 0",
  alignItems: "center",
  gap: space(2),
  overflow: "hidden",
  borderRadius: vars.radius.md,
  paddingInline: space(2),
  color: vars.color.sidebarForeground,
  ...ring,
  selectors: {
    [`${collapsed} &`]: { display: "none" },
    "&:hover": accent,
    "&:focus-visible": focusRing,
    "&:active": accent,
    "&:disabled, &[aria-disabled='true']": disabled,
    "&[data-size='md']": fontSize.sm,
    "&[data-size='sm']": fontSize.xs,
    "&[data-active]:not([data-active='false']), &[data-state='active']": accent
  }
})
globalStyle(`${menuSubButton} > span:last-child`, truncate)
globalStyle(`${menuSubButton} > svg`, {
  flexShrink: 0,
  color: vars.color.sidebarAccentForeground
})
globalStyle(`${menuSubButton} > svg:not([data-size])`, { width: space(4), height: space(4) })

// Icons inside group labels and actions.
globalStyle(`${groupLabel} > svg, ${iconAction} > svg`, { flexShrink: 0 })
globalStyle(`${groupLabel} > svg:not([data-size]), ${iconAction} > svg:not([data-size])`, {
  width: space(4),
  height: space(4)
})
