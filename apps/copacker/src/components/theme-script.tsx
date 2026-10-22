import { useSyncExternalStore } from "react"
import { themeInitScript } from "@/lib/theme"

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
  return hydrating ? <script>{themeInitScript}</script> : null
}
