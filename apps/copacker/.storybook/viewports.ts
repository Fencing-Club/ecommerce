import type { ViewportMap } from "storybook/viewport"

// The screen sizes Copacker is looked at in: the toolbar's Viewport menu offers only these. One story covers all three;
// its play function checks a layout that changes with the screen's width where it does (`atLeast` in
// src/stories/play.tsx), so a story is never a copy for one size.
export const viewports = {
  desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" }, type: "desktop" },
  tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" }, type: "tablet" },
  mobile: { name: "Mobile", styles: { width: "390px", height: "844px" }, type: "mobile" }
} satisfies ViewportMap
