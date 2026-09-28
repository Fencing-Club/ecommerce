"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

// The page's bar takes the tone of whatever it's over: dark on the dark stages, which carry data-tone="dark", and light
// on the paper between them. It starts in the tone of the top of its page, so it doesn't flash before it can look.
export function Bar({ tone, children }: { tone: "dark" | "light"; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [dark, setDark] = useState(tone === "dark")
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const middle = (ref.current?.offsetHeight ?? 0) / 2
      setDark(
        Array.from(document.querySelectorAll("[data-tone=dark]")).some((stage) => {
          const box = stage.getBoundingClientRect()
          return box.top <= middle && box.bottom >= middle
        })
      )
    }
    const request = () => {
      frame ||= requestAnimationFrame(check)
    }
    // The first look waits for a frame too, rather than making the browser lay out the page in the middle of hydrating it.
    request()
    addEventListener("scroll", request, { passive: true })
    addEventListener("resize", request)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener("scroll", request)
      removeEventListener("resize", request)
    }
  }, [])
  // Each tone's ground is its own layer under the bar, and changing tone cross-fades them, since the compositor can fade
  // a layer's opacity but has to repaint a changing background or shadow.
  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-40 text-foreground backdrop-blur-xl",
        "before:absolute before:inset-0 before:-z-10 before:bg-(--ink)/60 before:transition-opacity before:duration-500",
        "after:absolute after:inset-0 after:-z-10 after:bg-(--paper)/80 after:shadow-[0_1px_0_rgb(0_0_0/0.06)] after:transition-opacity after:duration-500",
        dark ? "dark after:opacity-0" : "light before:opacity-0"
      )}
    >
      {children}
    </header>
  )
}
