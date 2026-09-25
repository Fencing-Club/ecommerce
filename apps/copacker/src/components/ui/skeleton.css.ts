import { style } from "@/styles/layers"
import { pulse } from "@/styles/animations.css"
import { vars } from "@/styles/theme.css"

export const skeleton = style({
  animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.muted
})
