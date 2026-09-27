"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { timeZoneCookie } from "@/lib/time-zone"

// Tells the server the computer's time zone, which days and months follow unless Settings chooses one. When it changes
// (or on the first visit), the page is shown again in it.
export function SystemTimeZone() {
  const router = useRouter()
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const current = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${timeZoneCookie}=`))
      ?.slice(timeZoneCookie.length + 1)
    if (zone && decodeURIComponent(current ?? "") !== zone) {
      document.cookie = `${timeZoneCookie}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
      router.refresh()
    }
  }, [router])
  return null
}
