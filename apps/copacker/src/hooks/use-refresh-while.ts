import { useDocumentVisibility } from "@mantine/hooks"
import { useEffect, useEffectEvent } from "react"

// Reloads the page's server data every few seconds while something it shows is still running, such as a first sync,
// and only while the page is in view.
export function useRefreshWhile(active: boolean, refresh: () => void) {
  const visible = useDocumentVisibility() === "visible"
  const running = active && visible
  const tick = useEffectEvent(refresh)
  useEffect(() => {
    if (!running) {
      return
    }
    const timer = setInterval(() => tick(), 5000)
    return () => clearInterval(timer)
  }, [running])
}
