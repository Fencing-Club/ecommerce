// Drop-in replacements for vanilla-extract's style, globalStyle, and recipe that place rules in the `components` cascade
// layer. Shared UI components use these so page styles and sx() utilities, which stay unlayered, always override them.
import {
  type ComplexStyleRule,
  globalStyle as unlayeredGlobalStyle,
  style as unlayeredStyle
} from "@vanilla-extract/css"
import { recipe as unlayeredRecipe } from "@vanilla-extract/recipes"
import { components } from "./global.css"

function inLayer(rule: ComplexStyleRule): ComplexStyleRule {
  if (Array.isArray(rule)) {
    return rule.map((part) =>
      typeof part === "string" || Array.isArray(part) ? part : { "@layer": { [components]: part } }
    )
  }
  return { "@layer": { [components]: rule } }
}

// Recipes also accept a bare class name, which is already styled elsewhere and passes through unchanged.
const inLayerOrClass = (rule: ComplexStyleRule | string) => (typeof rule === "string" ? rule : inLayer(rule))

export const style: typeof unlayeredStyle = (rule, debugId) => unlayeredStyle(inLayer(rule), debugId)

export const globalStyle: typeof unlayeredGlobalStyle = (selector, rule) =>
  unlayeredGlobalStyle(selector, { "@layer": { [components]: rule } })

export const recipe: typeof unlayeredRecipe = (options, debugId) => {
  // Variant definitions are fresh object literals at each call site, so they are layered in place.
  for (const group of Object.values(options.variants ?? {})) {
    for (const [name, rule] of Object.entries(group)) {
      group[name] = inLayerOrClass(rule)
    }
  }
  for (const compound of options.compoundVariants ?? []) {
    compound.style = inLayerOrClass(compound.style)
  }
  return unlayeredRecipe(
    { ...options, base: options.base === undefined ? undefined : inLayerOrClass(options.base) },
    debugId
  )
}
