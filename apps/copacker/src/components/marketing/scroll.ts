import { useEffect, useEffectEvent, useRef } from "react"

// Tracks how far an element has scrolled, 0 to 1, as `measure` works it out from the element's box and the window's
// height, at most once a frame. The value lands on the element as --progress, for CSS to use, and goes to `onChange`.
// With reduced motion the element simply holds `reduced`.
export function useScrollProgress<T extends HTMLElement>(
  measure: (box: DOMRect, height: number) => number,
  { onChange, reduced = 1 }: { onChange?: (progress: number) => void; reduced?: number } = {}
) {
  const ref = useRef<T>(null)
  const update = useEffectEvent(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    const progress = still ? reduced : Math.min(1, Math.max(0, measure(element.getBoundingClientRect(), innerHeight)))
    element.style.setProperty("--progress", progress.toFixed(4))
    onChange?.(progress)
  })
  useEffect(() => {
    let frame = 0
    const request = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    update()
    addEventListener("scroll", request, { passive: true })
    addEventListener("resize", request)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener("scroll", request)
      removeEventListener("resize", request)
    }
  }, [])
  return ref
}

// How far a tall section has scrolled past a sticky view: 0 as its top reaches the top of the window, 1 as its bottom
// reaches the bottom.
export const through = (box: DOMRect, height: number) => -box.top / Math.max(1, box.height - height)
