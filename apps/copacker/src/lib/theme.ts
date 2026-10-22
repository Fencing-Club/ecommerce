import { createShadcnTheme, getThemeInitScript } from "@buildkitgg/shadcn-theme"

// The color theme: light, dark, or the computer's setting. A light or dark choice is kept in this browser's
// localStorage, as {"theme":"dark"}; without one, the app follows the computer.
const storageKey = "theme"

// The page's theme, shared by every component that reads or sets it. Creating it does nothing in the browser, so the
// server can too; Providers starts it in the browser, where it reads the choice, follows the computer's setting and
// other tabs, and sets the `dark` class and `color-scheme` on <html>.
export const themeStore = createShadcnTheme({ storageKey })

// The choice used to be kept as the bare word, "light" or "dark". This rewrites one in the store's format, once,
// before anything reads it, so the choice survives and still shows on the first paint.
const migrateChoice = `try{const s=localStorage.getItem(${JSON.stringify(storageKey)});if(s==="light"||s==="dark")localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify({theme:s}))}catch{}`

// Runs before the page paints, so a dark page never flashes light (or the reverse).
export const themeInitScript = `${migrateChoice};${getThemeInitScript({ storageKey })}`
