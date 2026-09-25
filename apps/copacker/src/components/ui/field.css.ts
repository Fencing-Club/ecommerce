import { type RecipeVariants } from "@vanilla-extract/recipes"
import { globalStyle, recipe, style } from "@/styles/layers"
import { alpha, fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Tailwind's @md container breakpoint on the field-group container.
const fieldGroupMd = "field-group (min-width: 28rem)"
const choiceControl = ":is([role='checkbox'], [role='radio'])"
const disabledField = "[data-slot='field'][data-disabled='true'] &"

export const fieldSet = style({
  display: "flex",
  flexDirection: "column",
  gap: space(4),
  selectors: {
    "&:has(> [data-slot='checkbox-group']), &:has(> [data-slot='radio-group'])": { gap: space(3) }
  }
})

export const legend = style({
  marginBottom: space(1.5),
  fontWeight: 500,
  selectors: {
    "&[data-variant='label']": fontSize.sm,
    "&[data-variant='legend']": fontSize.base
  }
})

export const group = style({
  containerType: "inline-size",
  containerName: "field-group",
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: space(5),
  selectors: { "&[data-slot='checkbox-group']": { gap: space(3) } }
})
globalStyle(`${group} > [data-slot='field-group']`, { gap: space(4) })

const fieldBase = style({
  display: "flex",
  width: "100%",
  gap: space(2),
  selectors: { "&[data-invalid='true']": { color: vars.color.destructive } }
})

const vertical = style({ flexDirection: "column" })
globalStyle(`${vertical} > *`, { width: "100%" })

const horizontal = style({
  flexDirection: "row",
  alignItems: "center",
  selectors: { "&:has(> [data-slot='field-content'])": { alignItems: "flex-start" } }
})
globalStyle(`${horizontal} > [data-slot='field-label']`, { flex: "1 1 auto" })
globalStyle(`${horizontal}:has(> [data-slot='field-content']) > ${choiceControl}`, { marginTop: "1px" })

const responsive = style({
  flexDirection: "column",
  "@container": {
    [fieldGroupMd]: {
      flexDirection: "row",
      alignItems: "center",
      selectors: { "&:has(> [data-slot='field-content'])": { alignItems: "flex-start" } }
    }
  }
})
globalStyle(`${responsive} > *`, {
  width: "100%",
  "@container": { [fieldGroupMd]: { width: "auto" } }
})
globalStyle(`${responsive} > [data-slot='field-label']`, {
  "@container": { [fieldGroupMd]: { flex: "1 1 auto" } }
})
globalStyle(`${responsive}:has(> [data-slot='field-content']) > ${choiceControl}`, {
  "@container": { [fieldGroupMd]: { marginTop: "1px" } }
})

export const field = recipe({
  base: fieldBase,
  variants: { orientation: { vertical, horizontal, responsive } },
  defaultVariants: { orientation: "vertical" }
})

export type FieldVariants = NonNullable<RecipeVariants<typeof field>>

export const content = style({
  display: "flex",
  flex: "1 1 0%",
  flexDirection: "column",
  gap: space(0.5),
  lineHeight: 1.375
})

const wrapsField = "&:has(> [data-slot='field'])"

export const label = style({
  display: "flex",
  width: "fit-content",
  gap: space(2),
  lineHeight: 1.375,
  selectors: {
    [disabledField]: { opacity: 0.5 },
    "&:has([data-checked])": {
      borderColor: alpha(vars.color.primary, 30),
      backgroundColor: alpha(vars.color.primary, 5)
    },
    ".dark &:has([data-checked])": {
      borderColor: alpha(vars.color.primary, 20),
      backgroundColor: alpha(vars.color.primary, 10)
    },
    [wrapsField]: {
      width: "100%",
      flexDirection: "column",
      borderRadius: vars.radius.lg,
      borderWidth: "1px"
    },
    [`${wrapsField}:not(:has(:disabled, [data-disabled])):hover`]: {
      backgroundColor: alpha(vars.color.muted, 50)
    },
    [`${wrapsField}:has(:focus-visible)`]: {
      borderColor: vars.color.ring,
      boxShadow: `0 0 0 3px ${alpha(vars.color.ring, 50)}`
    }
  }
})
globalStyle(`${label} > [data-slot='field']`, { padding: space(2.5) })

export const title = style({
  display: "flex",
  width: "fit-content",
  alignItems: "center",
  gap: space(2),
  ...fontSize.sm,
  fontWeight: 500,
  selectors: { [disabledField]: { opacity: 0.5 } }
})

export const description = style({
  textAlign: "left",
  fontSize: fontSize.sm.fontSize,
  lineHeight: 1.5,
  fontWeight: 400,
  color: vars.color.mutedForeground,
  selectors: {
    "[data-slot='field']:has([data-horizontal]) &": { textWrap: "balance" },
    "[data-variant='legend'] + &": { marginTop: `-${space(1.5)}` },
    "&:last-child": { marginTop: 0 },
    "&:nth-last-child(2)": { marginTop: `-${space(1)}` }
  }
})
globalStyle(`${description} > a`, { textDecoration: "underline", textUnderlineOffset: "4px" })
globalStyle(`${description} > a:hover`, { color: vars.color.primary })

export const separator = style({
  position: "relative",
  marginBlock: `-${space(2)}`,
  height: space(5),
  ...fontSize.sm,
  selectors: { "[data-slot='field-group'][data-variant='outline'] &": { marginBottom: `-${space(2)}` } }
})

export const separatorLine = style({ position: "absolute", inset: 0, top: "50%" })

export const separatorContent = style({
  position: "relative",
  marginInline: "auto",
  display: "block",
  width: "fit-content",
  backgroundColor: vars.color.background,
  paddingInline: space(2),
  color: vars.color.mutedForeground
})

export const errorList = style({
  marginLeft: space(4),
  display: "flex",
  listStyleType: "disc",
  flexDirection: "column",
  gap: space(1)
})

export const error = style({ ...fontSize.sm, fontWeight: 400, color: vars.color.destructive })
