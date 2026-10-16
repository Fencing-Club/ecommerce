import { useEffect } from "react"

// Reloads the page's server data every few seconds while something it shows is still running, such as a first sync.
export function RefreshWhile({ active, refresh }: { active: boolean; refresh: () => void }) {
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh()
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [active, refresh])
  return null
}
