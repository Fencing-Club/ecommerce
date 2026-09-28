"use client"

import { useEffect, useState } from "react"

// Runs `callback` once the page has loaded and the browser has a moment to spare, for work the first view doesn't need,
// so it stays out of the way of the page's first paint and of hydration. Returns a function that cancels it.
export function whenPageIdle(callback: () => void) {
  let idle: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    // Safari has no requestIdleCallback, so there it waits a moment instead.
    if (typeof window.requestIdleCallback === "function") {
      idle = requestIdleCallback(callback, { timeout: 2000 })
    } else {
      timer = setTimeout(callback, 200)
    }
  }
  if (document.readyState === "complete") {
    schedule()
  } else {
    addEventListener("load", schedule, { once: true })
  }
  return () => {
    removeEventListener("load", schedule)
    clearTimeout(timer)
    if (idle !== undefined) {
      cancelIdleCallback(idle)
    }
  }
}

// False until the page has loaded and the browser is idle, then true.
export function usePageIdle() {
  const [idle, setIdle] = useState(false)
  useEffect(() => whenPageIdle(() => setIdle(true)), [])
  return idle
}
