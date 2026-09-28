"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Refreshes the page while Amazon creates the shipment, and says what happens next when the page doesn't show it.
export function ShipmentProgress({ processing, message }: { processing: boolean; message?: string }) {
  const router = useRouter()
  useEffect(() => {
    if (!processing) {
      return
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [processing, router])
  return message ? <output className="text-sm text-muted-foreground">{message}</output> : null
}
