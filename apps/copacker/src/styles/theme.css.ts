import { createGlobalTheme, createGlobalThemeContract } from "@vanilla-extract/css"

// Design tokens. Colors keep shadcn's semantic names so components read the same as before the migration.
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
      // Chart series, in fixed order: Amazon, then Shopify. Validated for color vision deficiency on the card surface.
      chart1: "chart-1",
      chart2: "chart-2",
      // Status marks and positive-change text. Always paired with an icon or label.
      success: "success",
      warning: "warning"
    },
    radius: { sm: "radius-sm", md: "radius-md", lg: "radius-lg", xl: "radius-xl", full: "radius-full" },
    font: { sans: "font-sans", mono: "font-mono" },
    shadow: { xs: "shadow-xs", sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" }
  },
  (value, path) => value ?? path.join("-")
)

const radius = "0.625rem"

createGlobalTheme(":root", vars, {
  color: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    card: "oklch(1 0 0)",
    cardForeground: "oklch(0.145 0 0)",
    popover: "oklch(1 0 0)",
    popoverForeground: "oklch(0.145 0 0)",
    primary: "oklch(0.646 0.222 41.116)",
    primaryForeground: "oklch(0.98 0.016 73.684)",
    secondary: "oklch(0.97 0 0)",
    secondaryForeground: "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    mutedForeground: "oklch(0.556 0 0)",
    accent: "oklch(0.97 0 0)",
    accentForeground: "oklch(0.205 0 0)",
    destructive: "oklch(0.577 0.245 27.325)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.922 0 0)",
    ring: "oklch(0.75 0.183 55.934)",
    sidebar: "oklch(0.985 0 0)",
    sidebarForeground: "oklch(0.145 0 0)",
    sidebarPrimary: "oklch(0.646 0.222 41.116)",
    sidebarPrimaryForeground: "oklch(0.98 0.016 73.684)",
    sidebarAccent: "oklch(0.97 0 0)",
    sidebarAccentForeground: "oklch(0.205 0 0)",
    sidebarBorder: "oklch(0.922 0 0)",
    sidebarRing: "oklch(0.75 0.183 55.934)",
    chart1: "#2a78d6",
    chart2: "#eb6834",
    success: "#006300",
    warning: "#fab219"
  },
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
  }
})

createGlobalTheme(".dark", vars.color, {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.205 0 0)",
  cardForeground: "oklch(0.985 0 0)",
  popover: "oklch(0.205 0 0)",
  popoverForeground: "oklch(0.985 0 0)",
  primary: "oklch(0.705 0.213 47.604)",
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
  sidebarPrimary: "oklch(0.705 0.213 47.604)",
  sidebarPrimaryForeground: "oklch(0.98 0.016 73.684)",
  sidebarAccent: "oklch(0.269 0 0)",
  sidebarAccentForeground: "oklch(0.985 0 0)",
  sidebarBorder: "oklch(1 0 0 / 10%)",
  sidebarRing: "oklch(0.408 0.123 38.172)",
  chart1: "#3987e5",
  chart2: "#d95926",
  success: "#0ca30c",
  warning: "#fab219"
})
