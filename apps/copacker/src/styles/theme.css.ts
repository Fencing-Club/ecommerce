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
      // Chart series, in fixed order: Amazon, Shopify, then eBay: the design's blue and orange, a pair that stays apart
      // for color vision deficiency on the card surface, and eBay's Okabe-Ito reddish purple, which stays apart from both.
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
      // Each tone's soft fill: status pills, icon tiles, banners and count pills.
      primarySoft: "primary-soft",
      infoSoft: "info-soft",
      successSoft: "success-soft",
      warningSoft: "warning-soft",
      destructiveSoft: "destructive-soft",
      // Lighter tints and borders: the "Your next step" card, banners, danger zones and changed, failing or added rows.
      primaryTint: "primary-tint",
      primaryBorder: "primary-border",
      warningTint: "warning-tint",
      warningBorder: "warning-border",
      destructiveTint: "destructive-tint",
      destructiveBorder: "destructive-border",
      successTint: "success-tint",
      // Checkbox and switch outlines, and disabled text and icons.
      borderStrong: "border-strong",
      disabledForeground: "disabled-foreground",
      // Each workspace kind's mark and its soft tile, in the workspace menu only. Never on actions.
      kindBuyer: "kind-buyer",
      kindBuyerSoft: "kind-buyer-soft",
      kindSupplier: "kind-supplier",
      kindSupplierSoft: "kind-supplier-soft",
      kindForwarder: "kind-forwarder",
      kindForwarderSoft: "kind-forwarder-soft",
      // Behind dialogs, sheets and the command menu.
      scrim: "scrim",
      // A lighter first series, and the gray for "other" and comparisons.
      chart1Soft: "chart-1-soft",
      chartMuted: "chart-muted",
      // Lead times: the pickup and forwarder handoffs' bars, and text on the light info bar.
      handoffPickup: "handoff-pickup",
      handoffForwarderSoft: "handoff-forwarder-soft",
      onLightInfo: "on-light-info"
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

// A tone mixed into the page's background. The design gives light values only, so the dark theme's tints are mixed.
const mix = (tone: string, percent: number) => `color-mix(in oklab, var(--${tone}) ${percent}%, var(--background))`

// The light colors, which :root takes, and which a .light element takes back inside a dark one, such as the product
// shots on the dark marketing page. The redesign's values are the design's own (copacker.pen's rd-* variables).
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
  destructive: "#dc2626",
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
  chart1: "#1f63b8",
  chart2: "#eb6834",
  chart3: "#b14f9a",
  success: "#006300",
  warning: "#fab219",
  warningForeground: "#7a4b00",
  info: "#1f63b8",
  primarySoft: "#fff1ea",
  infoSoft: "#eaf2fc",
  successSoft: "#e7f4e7",
  warningSoft: "#fff5dc",
  destructiveSoft: "#fdecec",
  primaryTint: "#fff8f4",
  primaryBorder: "#f6d5c4",
  warningTint: "#fffbf0",
  warningBorder: "#f3d48a",
  destructiveTint: "#fff7f7",
  destructiveBorder: "#f5c2c2",
  successTint: "#f4faf4",
  borderStrong: "#d4d4d4",
  disabledForeground: "#b5b5b5",
  kindBuyer: "#c2410c",
  kindBuyerSoft: "#fff1ea",
  kindSupplier: "#0f766e",
  kindSupplierSoft: "#e6f4f2",
  kindForwarder: "#4338ca",
  kindForwarderSoft: "#ecebfb",
  scrim: "#0a0a0a66",
  chart1Soft: "#a9c4ea",
  chartMuted: "#94a3b8",
  handoffPickup: "#8cb4e6",
  handoffForwarderSoft: "#a5a1f0",
  onLightInfo: "#0b2e5c"
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
  chart1: "#3987e5",
  chart2: "#d95926",
  chart3: "#cf6fb9",
  success: "#0ca30c",
  warning: "#fab219",
  warningForeground: "#fcd57a",
  info: "#3987e5",
  borderStrong: "oklch(1 0 0 / 22%)",
  disabledForeground: "oklch(0.45 0 0)",
  primarySoft: mix("primary", 18),
  infoSoft: mix("info", 18),
  successSoft: mix("success", 18),
  warningSoft: mix("warning", 16),
  destructiveSoft: mix("destructive", 18),
  primaryTint: mix("primary", 8),
  primaryBorder: mix("primary", 35),
  warningTint: mix("warning", 8),
  warningBorder: mix("warning", 45),
  destructiveTint: mix("destructive", 8),
  destructiveBorder: mix("destructive", 40),
  successTint: mix("success", 8),
  kindBuyer: "oklch(0.705 0.187 47.604)",
  kindBuyerSoft: mix("kind-buyer", 18),
  kindSupplier: "#2dd4bf",
  kindSupplierSoft: mix("kind-supplier", 18),
  kindForwarder: "#818cf8",
  kindForwarderSoft: mix("kind-forwarder", 18),
  scrim: "oklch(0 0 0 / 60%)",
  chart1Soft: mix("chart-1", 45),
  chartMuted: "#64748b",
  handoffPickup: mix("chart-1", 65),
  handoffForwarderSoft: mix("kind-forwarder", 70),
  onLightInfo: "#dbeafe"
})

createGlobalTheme(".light", vars.color, light)
