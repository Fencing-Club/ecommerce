import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles"
import { breakpoints, fontSize, space } from "./tokens"
import { vars } from "./theme.css"

const spacing = {
  0: space(0),
  0.5: space(0.5),
  1: space(1),
  1.5: space(1.5),
  2: space(2),
  2.5: space(2.5),
  3: space(3),
  4: space(4),
  5: space(5),
  6: space(6),
  8: space(8),
  10: space(10),
  12: space(12),
  16: space(16),
  20: space(20)
}

// Square sizes for icons and avatars: sx({ size: 4 }) replaces Tailwind size-4.
const iconSizes = { 3: space(3), 3.5: space(3.5), 4: space(4), 5: space(5), 6: space(6), 8: space(8), 10: space(10) }

// Layout properties that change across breakpoints: sx({ display: "grid", gridTemplateColumns: { base: "1", lg: "mainAside" } })
const layout = defineProperties({
  conditions: {
    base: {},
    sm: { "@media": `screen and (min-width: ${breakpoints.sm})` },
    md: { "@media": `screen and (min-width: ${breakpoints.md})` },
    lg: { "@media": `screen and (min-width: ${breakpoints.lg})` },
    xl: { "@media": `screen and (min-width: ${breakpoints.xl})` }
  },
  defaultCondition: "base",
  properties: {
    display: ["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "contents"],
    flexDirection: ["row", "column"],
    flexWrap: ["wrap", "nowrap"],
    alignItems: ["stretch", "flex-start", "center", "flex-end", "baseline"],
    alignSelf: ["stretch", "flex-start", "center", "flex-end"],
    justifyContent: ["flex-start", "center", "flex-end", "space-between"],
    flex: { 1: "1 1 0%", auto: "1 1 auto", none: "none" },
    flexShrink: [0],
    gap: spacing,
    rowGap: spacing,
    columnGap: spacing,
    padding: spacing,
    paddingX: spacing,
    paddingY: spacing,
    paddingTop: spacing,
    marginTop: spacing,
    marginBottom: spacing,
    gridTemplateColumns: {
      "1": "minmax(0, 1fr)",
      "2": "repeat(2, minmax(0, 1fr))",
      "3": "repeat(3, minmax(0, 1fr))",
      "4": "repeat(4, minmax(0, 1fr))",
      "5": "repeat(5, minmax(0, 1fr))",
      mainAside: "minmax(0, 1fr) 320px",
      mainAsideWide: "minmax(0, 1fr) 360px",
      labelValue: "auto minmax(0, 1fr)",
      fieldWithPieces: "minmax(0, 1fr) 180px",
      itemPriceSku: "minmax(0, 1fr) 180px 160px"
    },
    gridColumn: { full: "1 / -1", span2: "span 2 / span 2", span3: "span 3 / span 3" },
    textAlign: ["left", "center", "right"],
    width: { full: "100%", fit: "fit-content", auto: "auto", ...iconSizes },
    height: iconSizes,
    maxWidth: { sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "7xl": "80rem" },
    minWidth: { 0: "0" }
  },
  shorthands: {
    size: ["width", "height"],
    px: ["paddingX"],
    py: ["paddingY"]
  }
})

// Typography that does not vary by breakpoint.
const text = defineProperties({
  properties: {
    // Sets font size with its matching line height, like Tailwind text-sm.
    text: {
      xs: fontSize.xs,
      sm: fontSize.sm,
      base: fontSize.base,
      lg: fontSize.lg,
      xl: fontSize.xl,
      "2xl": fontSize["2xl"]
    },
    lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625" },
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    color: {
      foreground: vars.color.foreground,
      muted: vars.color.mutedForeground,
      primary: vars.color.primary,
      destructive: vars.color.destructive
    },
    fontVariantNumeric: { tabular: "tabular-nums" },
    fontFamily: { mono: vars.font.mono },
    letterSpacing: { tight: "-0.025em" },
    whiteSpace: ["normal", "nowrap", "pre-line"],
    textWrap: ["balance", "pretty"],
    overflow: ["hidden", "auto"],
    textOverflow: ["ellipsis"],
    fontStyle: ["normal"],
    textDecoration: ["underline"]
  }
})

export const sx = createSprinkles(layout, text)
