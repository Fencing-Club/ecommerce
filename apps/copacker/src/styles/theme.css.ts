import { createGlobalTheme, createGlobalThemeContract } from "@vanilla-extract/css"

// Design tokens. The colors are shadcn's own tokens and nothing else; a color shadcn has no token for, such as a
// success green or a workspace kind's teal, is a Tailwind palette class with its dark: pair (docs/styling.md).
export const vars = createGlobalThemeContract(
  {
    color: {
      background: "background",
      foreground: "foreground",
      card: "card",
      cardForeground: "card-foreground",
      popover: "popover",
      popoverForeground: "popover-foreground",
      primary: "primary",
      primaryForeground: "primary-foreground",
      secondary: "secondary",
      secondaryForeground: "secondary-foreground",
      muted: "muted",
      mutedForeground: "muted-foreground",
      accent: "accent",
      accentForeground: "accent-foreground",
      destructive: "destructive",
      border: "border",
      input: "input",
      ring: "ring",
      sidebar: "sidebar",
      sidebarForeground: "sidebar-foreground",
      sidebarPrimary: "sidebar-primary",
      sidebarPrimaryForeground: "sidebar-primary-foreground",
      sidebarAccent: "sidebar-accent",
      sidebarAccentForeground: "sidebar-accent-foreground",
      sidebarBorder: "sidebar-border",
      sidebarRing: "sidebar-ring",
      // Chart series: shadcn's orange theme, from light to dark. As in the designs, a series that has to stand out
      // against the card is chart-4, and chart-1 is the soft one: Amazon, Shopify and eBay are chart-4, chart-2 and
      // chart-3, and a single series is chart-4.
      chart1: "chart-1",
      chart2: "chart-2",
      chart3: "chart-3",
      chart4: "chart-4",
      chart5: "chart-5"
    },
    radius: { sm: "radius-sm", md: "radius-md", lg: "radius-lg", xl: "radius-xl", full: "radius-full" },
    font: { sans: "font-sans", mono: "font-mono" },
    shadow: { xs: "shadow-xs", sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" },
    // The kit's shadows, which only overlays and the action bar take: menus and popovers, dialogs, the command menu, a
    // phone's bottom sheet, the floating and docked action bar, and tooltips.
    elevation: {
      menu: "elevation-menu",
      dialog: "elevation-dialog",
      command: "elevation-command",
      sheet: "elevation-sheet",
      actionBar: "elevation-action-bar",
      actionBarDocked: "elevation-action-bar-docked",
      tooltip: "elevation-tooltip"
    }
  },
  (value, path) => value ?? path.join("-")
)

const radius = "0.625rem"

// shadcn's orange theme on neutral, in Tailwind v4's colors, as in designs/CopackerShadcn.lib.pen. Two values are
// darker than shadcn's for contrast: primary and sidebar-primary are orange-700, and muted-foreground is #6b6b6b.
const chart = {
  chart1: "oklch(0.837 0.128 66.29)",
  chart2: "oklch(0.705 0.213 47.604)",
  chart3: "oklch(0.646 0.222 41.116)",
  chart4: "oklch(0.553 0.195 38.402)",
  chart5: "oklch(0.47 0.157 37.304)"
}

// The light colors, which :root takes, and which a .light element takes back inside a dark one, such as the product
// shots on the dark marketing page.
const light = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.145 0 0)",
  popover: "oklch(1 0 0)",
  popoverForeground: "oklch(0.145 0 0)",
  primary: "oklch(0.553 0.195 38.402)",
  primaryForeground: "oklch(0.98 0.016 73.684)",
  secondary: "oklch(0.97 0 0)",
  secondaryForeground: "oklch(0.205 0 0)",
  muted: "oklch(0.97 0 0)",
  mutedForeground: "#6b6b6b",
  accent: "oklch(0.97 0 0)",
  accentForeground: "oklch(0.205 0 0)",
  destructive: "oklch(0.577 0.245 27.325)",
  border: "oklch(0.922 0 0)",
  input: "oklch(0.922 0 0)",
  ring: "oklch(0.75 0.183 55.934)",
  sidebar: "oklch(0.985 0 0)",
  sidebarForeground: "oklch(0.145 0 0)",
  sidebarPrimary: "oklch(0.553 0.195 38.402)",
  sidebarPrimaryForeground: "oklch(0.98 0.016 73.684)",
  sidebarAccent: "oklch(0.97 0 0)",
  sidebarAccentForeground: "oklch(0.205 0 0)",
  sidebarBorder: "oklch(0.922 0 0)",
  sidebarRing: "oklch(0.75 0.183 55.934)",
  ...chart
}

createGlobalTheme(":root", vars, {
  color: light,
  radius: {
    sm: `calc(${radius} * 0.6)`,
    md: `calc(${radius} * 0.8)`,
    lg: radius,
    xl: `calc(${radius} * 1.4)`,
    full: "9999px"
  },
  font: {
    sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-geist-mono), ui-monospace, monospace"
  },
  shadow: {
    xs: "0 1px 2px 0 oklch(0 0 0 / 0.05)",
    sm: "0 1px 3px 0 oklch(0 0 0 / 0.1), 0 1px 2px -1px oklch(0 0 0 / 0.1)",
    md: "0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1)"
  },
  // copacker.pen's own shadows.
  elevation: {
    menu: "0 8px 24px rgb(0 0 0 / 0.12)",
    dialog: "0 16px 40px rgb(15 15 15 / 0.2)",
    command: "0 16px 48px rgb(10 10 10 / 0.2)",
    sheet: "0 -8px 24px rgb(15 15 15 / 0.14)",
    actionBar: "0 10px 28px rgb(15 15 15 / 0.12), 0 1px 3px rgb(15 15 15 / 0.08)",
    actionBarDocked: "0 -4px 16px rgb(15 15 15 / 0.08)",
    tooltip: "0 4px 12px rgb(15 15 15 / 0.16)"
  }
})

createGlobalTheme(".dark", vars.color, {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.205 0 0)",
  cardForeground: "oklch(0.985 0 0)",
  popover: "oklch(0.205 0 0)",
  popoverForeground: "oklch(0.985 0 0)",
  primary: "oklch(0.553 0.195 38.402)",
  primaryForeground: "oklch(0.98 0.016 73.684)",
  secondary: "oklch(0.269 0 0)",
  secondaryForeground: "oklch(0.985 0 0)",
  muted: "oklch(0.269 0 0)",
  mutedForeground: "oklch(0.708 0 0)",
  accent: "oklch(0.269 0 0)",
  accentForeground: "oklch(0.985 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
  ring: "oklch(0.408 0.123 38.172)",
  sidebar: "oklch(0.205 0 0)",
  sidebarForeground: "oklch(0.985 0 0)",
  sidebarPrimary: "oklch(0.553 0.195 38.402)",
  sidebarPrimaryForeground: "oklch(0.98 0.016 73.684)",
  sidebarAccent: "oklch(0.269 0 0)",
  sidebarAccentForeground: "oklch(0.985 0 0)",
  sidebarBorder: "oklch(1 0 0 / 10%)",
  sidebarRing: "oklch(0.408 0.123 38.172)",
  ...chart
})

createGlobalTheme(".light", vars.color, light)
