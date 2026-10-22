import { useEffect } from "react"
import { useMaintenanceQuery } from "@/lib/api"

// Asks every 10 seconds whether maintenance is over, and reloads into the page that was asked for once it is.
export function useReloadWhenBack() {
  const { data } = useMaintenanceQuery(undefined, { pollingInterval: 10_000 })
  const back = data !== undefined && !data.active
  useEffect(() => {
    if (back) {
      location.reload()
    }
  }, [back])
}
