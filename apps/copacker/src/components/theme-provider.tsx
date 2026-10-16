import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import type { Theme } from "@/lib/theme"
import { themeScript, themeStorageKey, themes } from "@/lib/theme"

const darkQuery = "(prefers-color-scheme: dark)"

// The stored choice, or "system" when there's none or storage isn't available (a private window, say).
function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(themeStorageKey)
    return themes.find((theme) => theme === stored) ?? "system"
  } catch {
    return "system"
  }
}

// Changes to the choice: from this page, and from other tabs (which the storage event reports).
const choiceListeners = new Set<() => void>()
function subscribeToChoice(onChange: () => void) {
  choiceListeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    choiceListeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function subscribeToSystem(onChange: () => void) {
  const media = matchMedia(darkQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

type ThemeContext = {
  // What was chosen: light, dark or system.
  theme: Theme
  // What shows: light or dark.
  resolved: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContext | null>(null)

// Keeps the page's theme: the choice made in the account menu, or the computer's setting until one is made (and
// whenever System is chosen). The script in the root layout applies it before the first paint; this keeps it current.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server can't read the choice, so it renders "system"; the script has already applied the real one by then.
  const theme = useSyncExternalStore(subscribeToChoice, readTheme, () => "system" as const)
  const systemDark = useSyncExternalStore(
    subscribeToSystem,
    () => matchMedia(darkQuery).matches,
    () => false
  )
  const resolved: ThemeContext["resolved"] = theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light"

  // Reads the live values rather than `resolved`, which on the first render after loading is the server's guess and
  // would briefly undo what the layout script applied.
  useEffect(() => {
    const current = readTheme()
    const dark = current === "dark" || (current === "system" && matchMedia(darkQuery).matches)
    document.documentElement.classList.toggle("dark", dark)
  }, [theme, systemDark])

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") {
        localStorage.removeItem(themeStorageKey)
      } else {
        localStorage.setItem(themeStorageKey, next)
      }
    } catch {
      // Without storage the choice can't be kept, and the computer's setting stays.
    }
    for (const listener of choiceListeners) {
      listener()
    }
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme needs a ThemeProvider")
  }
  return context
}

// Nothing to subscribe to: all that matters is whether React is hydrating the server's HTML.
const noSubscription = () => () => undefined

// Applies the theme as the page's HTML is read, before its first paint. The script is in the server's HTML and stays
// while React hydrates it. A browser never runs a script React adds, and React warns when it would add one, as when it
// renders a 404's root layout itself, so after hydrating, and in a render of its own, there's no script.
export function ThemeScript() {
  const hydrating = useSyncExternalStore(
    noSubscription,
    () => false,
    () => true
  )
  return hydrating ? <script>{themeScript}</script> : null
}
