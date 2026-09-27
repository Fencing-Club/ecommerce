// A drop-in replacement for vanilla-extract's style that places rules in the `components` cascade layer, so page
// styles and sx() utilities, which stay unlayered, always override them.
import { type ComplexStyleRule, style as unlayeredStyle } from "@vanilla-extract/css"
import { components } from "./global.css"

function inLayer(rule: ComplexStyleRule): ComplexStyleRule {
  if (Array.isArray(rule)) {
    return rule.map((part) =>
      typeof part === "string" || Array.isArray(part) ? part : { "@layer": { [components]: part } }
    )
  }
  return { "@layer": { [components]: rule } }
}

export const style: typeof unlayeredStyle = (rule, debugId) => unlayeredStyle(inLayer(rule), debugId)
