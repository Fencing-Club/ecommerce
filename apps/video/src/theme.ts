import { loadFont as loadGeist } from "@remotion/google-fonts/Geist"
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono"

// The stage the ad plays on: near-black, lit by Copacker's orange.
export const stage = {
  background: "#09090b",
  text: "#fafafa",
  muted: "rgba(250, 250, 250, 0.62)",
  faint: "rgba(250, 250, 250, 0.1)",
  line: "rgba(250, 250, 250, 0.08)",
  glow: "rgba(245, 74, 0, 0.32)",
  danger: "#ff5a4f"
}

// Copacker's light theme (apps/copacker/src/styles/theme.css.ts), for the app itself.
export const app = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  muted: "oklch(0.556 0 0)",
  border: "oklch(0.922 0 0)",
  surface: "oklch(0.97 0 0)",
  sidebar: "oklch(0.985 0 0)",
  primary: "oklch(0.646 0.222 41.116)",
  primarySoft: "oklch(0.646 0.222 41.116 / 0.1)",
  primaryForeground: "oklch(0.98 0.016 73.684)",
  success: "#15803d",
  successSoft: "#dcfce7",
  warning: "#b45309",
  warningSoft: "#fef3c7",
  danger: "oklch(0.577 0.245 27.325)",
  dangerSoft: "#fee2e2"
}

// The accent for headline words: Copacker's orange, lit from above.
export const accent = "linear-gradient(180deg, #ffb27a 0%, #ff7a2e 45%, #f54a00 100%)"

const geist = loadGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] })
const geistMono = loadGeistMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] })

export const font = { sans: geist.fontFamily, mono: geistMono.fontFamily }
