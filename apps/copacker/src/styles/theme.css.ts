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
      // Chart series, in fixed order: Amazon, Shopify, then eBay. Amazon's and Shopify's were validated for color vision
      // deficiency on the card surface; eBay's is the Okabe-Ito reddish purple, which stays apart from both.
      chart1: "chart-1",
      chart2: "chart-2",
      chart3: "chart-3",
      // Status marks and positive-change text. Always paired with an icon or label.
      success: "success",
      warning: "warning",
      // Text and icons on a warning surface, where the warning color itself is too light to read.
      warningForeground: "warning-foreground",
      // In progress: someone else is working on it. Statuses, current lifecycle stages and proposals to review.
      info: "info",
      // Surfaces tinted by a tone: the "Your next step" card, banners, danger zones and changed, failing or added rows.
      primaryTint: "primary-tint",
      primaryBorder: "primary-border",
      infoTint: "info-tint",
      infoBorder: "info-border",
      warningTint: "warning-tint",
      warningBorder: "warning-border",
      destructiveTint: "destructive-tint",
      destructiveBorder: "destructive-border",
      successTint: "success-tint",
      // Checkbox and switch outlines, and disabled text and icons.
      borderStrong: "border-strong",
      disabledForeground: "disabled-foreground",
      // Each workspace kind's mark, in the workspace menu only. Never on actions.
      kindBuyer: "kind-buyer",
      kindSupplier: "kind-supplier",
      kindForwarder: "kind-forwarder"
    },
    radius: { sm: "radius-sm", md: "radius-md", lg: "radius-lg", xl: "radius-xl", full: "radius-full" },
    font: { sans: "font-sans", mono: "font-mono" },
    shadow: { xs: "shadow-xs", sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" }
  },
  (value, path) => value ?? path.join("-")
)

const radius = "0.625rem"

// A tone mixed into the page's background, so tints and borders follow the theme without a dark value of their own.
const mix = (tone: string, percent: number) => `color-mix(in oklab, var(--${tone}) ${percent}%, var(--background))`

// The tinted surfaces, the same in both themes because they're mixed from the tone and the background.
const tints = {
  primaryTint: mix("primary", 4),
  primaryBorder: mix("primary", 24),
  infoTint: mix("info", 6),
  infoBorder: mix("info", 24),
  warningTint: mix("warning", 8),
  warningBorder: mix("warning", 50),
  destructiveTint: mix("destructive", 4),
  destructiveBorder: mix("destructive", 28),
  successTint: mix("success", 5),
  kindBuyer: "oklch(0.553 0.195 38.402)",
  kindSupplier: "#0f766e",
  kindForwarder: "#4338ca"
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
  mutedForeground: "oklch(0.556 0 0)",
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
  chart1: "#2a78d6",
  chart2: "#eb6834",
  chart3: "#b14f9a",
  success: "#006300",
  warning: "#fab219",
  warningForeground: "#7a4b00",
  info: "#1f63b8",
  borderStrong: "oklch(0.87 0 0)",
  disabledForeground: "oklch(0.76 0 0)",
  ...tints
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
  chart1: "#3987e5",
  chart2: "#d95926",
  chart3: "#cf6fb9",
  success: "#0ca30c",
  warning: "#fab219",
  warningForeground: "#fcd57a",
  info: "#3987e5",
  borderStrong: "oklch(1 0 0 / 22%)",
  disabledForeground: "oklch(0.45 0 0)",
  ...tints,
  kindSupplier: "#2dd4bf",
  kindForwarder: "#818cf8"
})

createGlobalTheme(".light", vars.color, light)
