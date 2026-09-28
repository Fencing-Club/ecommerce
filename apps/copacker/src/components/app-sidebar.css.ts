import { style } from "@vanilla-extract/css"
import { fontSize, space } from "@/styles/tokens"
import { vars } from "@/styles/theme.css"

// Keeps the menu trigger highlighted while its dropdown is open.
export const menuTrigger = style({
  selectors: {
    "&&[data-popup-open]": {
      backgroundColor: vars.color.sidebarAccent,
      color: vars.color.sidebarAccentForeground
    }
  }
})

export const trailingIcon = style({ marginInlineStart: "auto" })

export const menuContent = style({ selectors: { "&&": { minWidth: space(56) } } })

// Square avatars: workspaces use the medium radius, people the large one.
export const workspaceAvatar = style({
  selectors: {
    "&&": { borderRadius: vars.radius.md },
    "&&::after": { borderRadius: vars.radius.md }
  }
})

export const workspaceFallback = style({
  selectors: {
    "&&": { borderRadius: vars.radius.md, fontSize: "0.625rem" },
    "[data-slot='avatar'][data-size] &&": { fontSize: "0.625rem" }
  }
})

export const userAvatar = style({
  selectors: {
    "&&": { borderRadius: vars.radius.lg },
    "&&::after": { borderRadius: vars.radius.lg }
  }
})

export const userFallback = style({ selectors: { "&&": { borderRadius: vars.radius.lg } } })

// The identity block repeated as the dropdown label, in body text rather than the muted label style.
export const identityLabel = style({
  selectors: {
    "&&": {
      display: "flex",
      alignItems: "center",
      gap: space(2),
      paddingBlock: space(1.5),
      textAlign: "start",
      ...fontSize.sm,
      fontWeight: 400,
      color: vars.color.foreground
    }
  }
})
