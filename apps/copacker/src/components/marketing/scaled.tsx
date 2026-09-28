"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// A product shot drawn at the app's own size and scaled to its column, like a screenshot, so its type and spacing keep
// the app's proportions at any width. The box holds its shape before it's measured. The scale goes straight onto the
// element as --scale whenever its width changes, rather than through React state and an animation frame, so a shot
// shows as soon as it's laid out, even while the page's frames are throttled.
export function Scaled({
  width,
  height,
  className,
  children
}: {
  width: number
  height: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = ref.current
    if (!box) {
      return
    }
    const fit = () => box.style.setProperty("--scale", String(box.clientWidth / width))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [width])
  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ aspectRatio: `${width} / ${height}` }}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width, height, transform: "scale(var(--scale, 0))" }}
      >
        {children}
      </div>
    </div>
  )
}
