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
  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-40 text-foreground backdrop-blur-xl transition-[background-color,box-shadow] duration-500",
        dark ? "dark bg-(--ink)/60" : "light bg-(--paper)/80 shadow-[0_1px_0_rgb(0_0_0/0.06)]"
      )}
    >
      {children}
    </header>
  )
}
