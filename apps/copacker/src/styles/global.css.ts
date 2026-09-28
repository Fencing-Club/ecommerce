import { type GlobalStyleRule, globalLayer, globalStyle as unlayeredGlobalStyle } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// The reset sits in a layer, so everything unlayered (page styles and sx utilities) overrides it. This file is imported
// first by the root layout, which fixes the layer order.
const reset = globalLayer("reset")

const globalStyle = (selector: string, rule: GlobalStyleRule) =>
  unlayeredGlobalStyle(selector, { "@layer": { [reset]: rule } })

// Reset, replacing Tailwind's preflight.
globalStyle("*, *::before, *::after", {
  boxSizing: "border-box",
  margin: 0,
  padding: 0,
  borderWidth: 0,
  borderStyle: "solid",
  borderColor: vars.color.border
})
globalStyle("html", {
  lineHeight: 1.5,
  WebkitTextSizeAdjust: "100%",
  tabSize: 4,
  fontFamily: vars.font.sans,
  WebkitTapHighlightColor: "transparent"
})
globalStyle("body", {
  minHeight: "100svh",
  backgroundColor: vars.color.background,
  color: vars.color.foreground,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale"
})
globalStyle("h1, h2, h3, h4, h5, h6", { fontSize: "inherit", fontWeight: "inherit" })
globalStyle("a", { color: "inherit", textDecoration: "inherit" })
globalStyle("b, strong", { fontWeight: 600 })
globalStyle("ol, ul, menu", { listStyle: "none" })
globalStyle("img, svg, video, canvas, audio, iframe, embed, object", { display: "block", verticalAlign: "middle" })
globalStyle("img, video", { maxWidth: "100%", height: "auto" })
globalStyle("button, input, select, optgroup, textarea", {
  font: "inherit",
  fontFeatureSettings: "inherit",
  letterSpacing: "inherit",
  color: "inherit",
  backgroundColor: "transparent",
  borderRadius: 0
})
globalStyle("button, [role='button']", { cursor: "pointer" })
globalStyle(":disabled", { cursor: "default" })
globalStyle("textarea", { resize: "vertical" })
globalStyle("input::placeholder, textarea::placeholder", { opacity: 1, color: vars.color.mutedForeground })
globalStyle("[hidden]:where(:not([hidden='until-found']))", { display: "none" })
globalStyle("*", { outlineColor: `color-mix(in oklch, ${vars.color.ring} 50%, transparent)` })
