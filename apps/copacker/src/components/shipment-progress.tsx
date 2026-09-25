"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export function ShipmentProgress({ processing, message }: { processing: boolean; message: string }) {
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
  return <output className="text-sm text-muted-foreground">{message}</output>
}
