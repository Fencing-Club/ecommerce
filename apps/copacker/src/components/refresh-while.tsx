"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Reloads the page's server data every few seconds while something it shows is still running, such as a first sync.
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [active, router])
  return null
}
