"use client"

import { useReducedMotion } from "@mantine/hooks"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Lines that take turns in one place, a few seconds each: the leaving line rises out as the next rises in. One clock
// drives them all, so two never show at once. With reduced motion the first line stays.
export function Ticker({
  lines,
  every = 3000,
  className
}: {
  lines: { key: string; content: React.ReactNode }[]
  every?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduced) {
      return
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % lines.length), every)
    return () => clearInterval(timer)
  }, [reduced, every, lines.length])
  const shown = reduced ? 0 : index
  const previous = (shown - 1 + lines.length) % lines.length
  return (
    <div className={cn("grid", className)}>
      {lines.map((line, i) => (
        <div
          key={line.key}
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            i === shown && "translate-y-0 opacity-100",
            i !== shown && "opacity-0",
            i !== shown && (i === previous ? "-translate-y-2" : "translate-y-2")
          )}
        >
          {line.content}
        </div>
      ))}
    </div>
  )
}
