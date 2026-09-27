// The color theme: light, dark, or the computer's setting. A light or dark choice is kept in this browser's
// localStorage; without one, the app follows the computer.
export const themes = ["light", "dark", "system"] as const
export type Theme = (typeof themes)[number]
export const themeStorageKey = "theme"

// Runs before the page paints, so a dark page never flashes light (or the reverse).
export const themeScript = `(() => {
  let stored = null
  try {
    stored = localStorage.getItem(${JSON.stringify(themeStorageKey)})
  } catch {}
  const dark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
})()`
