"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Chapter = { title: string; text: string; screen: React.ReactNode }

// The app, a chapter at a time: the words scroll by on the left while one window stays pinned on the right and changes
// to each chapter's screen as it reaches the middle of the page, the way the ad carries one window from chapter to
// chapter. On a phone each chapter shows its own screen instead.
export function Story({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(0)
  const blocks = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            setActive(Number(entry.target.dataset.index))
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    for (const block of blocks.current) {
      if (block) {
        observer.observe(block)
      }
    }
    return () => observer.disconnect()
  }, [])
  return (
    <div className="mx-auto grid max-w-6xl gap-x-16 px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <div>
        {chapters.map((chapter, i) => (
          <div
            key={chapter.title}
            ref={(block) => {
              blocks.current[i] = block
            }}
            data-index={i}
            className="flex flex-col justify-center gap-5 py-14 lg:min-h-[80svh] lg:py-0"
          >
            <h2
              className={cn(
                "text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance transition-opacity duration-500",
                i !== active && "lg:opacity-25"
              )}
            >
              {chapter.title}
            </h2>
            <p
              className={cn(
                "text-lg text-pretty text-white/60 transition-opacity duration-500",
                i !== active && "lg:opacity-40"
              )}
            >
              {chapter.text}
            </p>
            <div className="mt-6 lg:hidden">{chapter.screen}</div>
          </div>
        ))}
      </div>
      <div className="relative hidden lg:block">
        <div className="sticky top-0 h-svh">
          {chapters.map((chapter, i) => (
            <div
              key={chapter.title}
              aria-hidden={i !== active}
              className={cn(
                "absolute inset-x-0 top-1/2 transition-[opacity,translate,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                i === active ? "-translate-y-1/2 opacity-100" : "pointer-events-none opacity-0 blur-sm",
                i < active && "-translate-y-[calc(50%+2rem)]",
                i > active && "-translate-y-[calc(50%-2rem)]"
              )}
            >
              {chapter.screen}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
