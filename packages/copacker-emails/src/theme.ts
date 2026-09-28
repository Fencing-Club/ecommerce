// Copacker's look in email, from the app and the landing page: the brand orange, warm stone neutrals, and the dark
// band with an orange glow that the landing page's hero uses. `dark` is what each becomes in mail apps that show a dark
// inbox and let the email choose its colors.
export const color = {
  // The deeper orange the site moved to, so white text on it meets contrast (about 5:1).
  brand: "#c2410c",
  ink: "#0c0a09",
  body: "#44403c",
  muted: "#78716c",
  line: "#e7e5e4",
  panel: "#fafaf9",
  page: "#f5f5f4",
  card: "#ffffff",
  band: "#0c0a09",
  // On the dark band: the eyebrow in a lighter orange that reads on black, and the line under the title.
  glowText: "#ff8904",
  bandText: "#d6d3d1"
} as const

export const dark = {
  page: "#0c0a09",
  card: "#1c1917",
  panel: "#231f1d",
  line: "#2e2926",
  ink: "#fafaf9",
  body: "#d6d3d1",
  muted: "#a8a29e"
} as const

// The glow behind the header, as the landing page's hero has it. Mail apps that don't draw gradients keep the band's
// dark color.
export const glow =
  "radial-gradient(ellipse 75% 95% at 100% 0%, rgba(245,73,0,0.62), rgba(245,73,0,0.18) 45%, rgba(245,73,0,0) 75%), radial-gradient(ellipse 55% 70% at 0% 100%, rgba(255,178,122,0.14), rgba(255,178,122,0) 70%)"

// The reader's own system font: San Francisco on Apple devices, Segoe UI on Windows, Roboto on Android.
export const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// What inline styles can't say: the dark colors, and the tighter frame on phones. Elements take them by class.
export const css = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .cp-page { background-color: ${dark.page} !important; }
  .cp-card { background-color: ${dark.card} !important; border-color: ${dark.line} !important; }
  .cp-panel { background-color: ${dark.panel} !important; border-color: ${dark.line} !important; }
  .cp-rule { border-color: ${dark.line} !important; }
  .cp-ink { color: ${dark.ink} !important; }
  .cp-body { color: ${dark.body} !important; }
  .cp-muted { color: ${dark.muted} !important; }
}
@media only screen and (max-width: 620px) {
  .cp-outer { padding: 12px 10px 28px !important; }
  .cp-band { padding: 22px 22px 26px !important; }
  .cp-content { padding: 26px 22px 24px !important; }
  .cp-heading { font-size: 25px !important; line-height: 32px !important; }
  .cp-button { display: block !important; text-align: center !important; }
}
`
