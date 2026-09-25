import { style } from "@vanilla-extract/css"
import { media, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// A taller, wider dialog that scrolls when the address form exceeds the viewport.
export const dialog = style({
  selectors: { "&&": { maxHeight: "calc(100svh - 2rem)", overflowY: "auto" } },
  "@media": { [media.sm]: { selectors: { "&&": { maxWidth: "42rem" } } } }
})

export const list = style({ selectors: { "&&": { gap: space(2) } } })

export const item = style({ selectors: { "&&": { alignItems: "flex-start" } } })

// Shows the full address instead of clamping it to two lines.
export const unclamped = style({
  selectors: {
    "&&": {
      overflow: "visible",
      display: "block",
      WebkitBoxOrient: "horizontal",
      WebkitLineClamp: "unset"
    }
  }
})

export const contactLinks = style({
  selectors: {
    "&&": { display: "flex", flexWrap: "wrap", columnGap: space(4), rowGap: space(1) }
  }
})

export const warning = style({ selectors: { "&&": { color: vars.color.destructive } } })
