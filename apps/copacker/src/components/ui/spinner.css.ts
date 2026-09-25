import { style } from "@/styles/layers"
import { space } from "@/styles/tokens"
import { spin } from "@/styles/animations.css"

export const spinner = style({
  width: space(4),
  height: space(4),
  animation: `${spin} 1s linear infinite`
})
