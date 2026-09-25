import { style } from "@vanilla-extract/css"
import { space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Full-viewport centered page used by error, invite, onboarding, and setup (was `flex min-h-svh items-center justify-center p-6`).
export const centeredPage = style({
  display: "flex",
  minHeight: "100svh",
  alignItems: "center",
  justifyContent: "center",
  padding: space(6)
})

// Adds the muted backdrop (was `bg-muted`).
export const mutedBackground = style({ backgroundColor: vars.color.muted })

// Brand tile above the card title (was `mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground`).
export const brandTile = style({
  marginBottom: space(2),
  display: "flex",
  width: space(10),
  height: space(10),
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.primary,
  color: vars.color.primaryForeground
})
