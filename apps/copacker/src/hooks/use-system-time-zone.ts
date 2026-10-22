import { useEffect, useEffectEvent } from "react"
import { timeZoneCookie } from "@/lib/time-zone"

// Tells the server the computer's time zone, which days and months follow unless Settings chooses one. When it changes
// (or on the first visit), `refresh` shows the page again in it.
export function useSystemTimeZone(refresh: () => void) {
  const changed = useEffectEvent(refresh)
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const current = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${timeZoneCookie}=`))
      ?.slice(timeZoneCookie.length + 1)
    if (zone && decodeURIComponent(current ?? "") !== zone) {
      document.cookie = `${timeZoneCookie}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
      changed()
    }
  }, [])
}
