import { globalStyle, style } from "@/styles/layers"
import { fontSize, media, space } from "@/styles/tokens"
import { footer as dialogFooter, overlay as dialogOverlay, popup } from "./dialog.css"
import { vars } from "@/styles/theme.css"

export const overlay = dialogOverlay

export const content = style([
  popup,
  {
    maxWidth: "20rem",
    "@media": { [media.sm]: { selectors: { "&[data-size='default']": { maxWidth: "24rem" } } } }
  }
])

const defaultSize = `${content}[data-size='default']`
const withMedia = ":has([data-slot='alert-dialog-media'])"

export const header = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  placeItems: "center",
  gap: space(1.5),
  textAlign: "center",
  selectors: {
    [`&${withMedia}`]: { gridTemplateRows: "auto auto 1fr", columnGap: space(4) }
  },
  "@media": {
    [media.sm]: {
      selectors: {
        [`${defaultSize} &`]: { placeItems: "start", textAlign: "left" },
        [`${defaultSize} &${withMedia}`]: { gridTemplateRows: "auto 1fr" }
      }
    }
  }
})

export const footer = style([
  dialogFooter,
  {
    selectors: {
      [`${content}[data-size='sm'] &`]: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
    }
  }
])

export const mediaBox = style({
  marginBottom: space(2),
  display: "inline-flex",
  width: space(10),
  height: space(10),
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.muted,
  "@media": { [media.sm]: { selectors: { [`${defaultSize} &`]: { gridRow: "span 2 / span 2" } } } }
})
globalStyle(`${mediaBox} > svg:not([data-size])`, { width: space(6), height: space(6) })

export const title = style({
  ...fontSize.base,
  fontWeight: 500,
  "@media": { [media.sm]: { selectors: { [`${defaultSize}${withMedia} &`]: { gridColumnStart: 2 } } } }
})

export const description = style({
  ...fontSize.sm,
  textWrap: "balance",
  color: vars.color.mutedForeground,
  "@media": { [media.md]: { textWrap: "pretty" } }
})
globalStyle(`${description} > a`, { textDecoration: "underline", textUnderlineOffset: "3px" })
globalStyle(`${description} > a:hover`, { color: vars.color.foreground })
