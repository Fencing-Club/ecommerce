"use client"

import { cn } from "@/lib/utils"
import { useScrollProgress } from "./scroll"

const words = "Restocking a best-seller shouldn’t take 43 emails, 12 spreadsheets, and a stockout.".split(" ")

// The ad's opening line, lit a word at a time as it scrolls up the page, with the stockout landing in red.
export function Statement() {
  const ref = useScrollProgress<HTMLParagraphElement>((box, height) => (height * 0.9 - box.top) / (height * 0.55))
  return (
    <section className="mx-auto max-w-5xl px-6 py-36 sm:py-48">
      <p
        ref={ref}
        className="text-[clamp(2.1rem,5.4vw,4.25rem)] leading-[1.06] font-semibold tracking-[-0.04em] text-balance"
      >
        {words.map((word, i) => (
          <span
            key={`${i}-${word}`}
            className={cn(word === "stockout." && "text-[#ff5a4f]")}
            style={{ opacity: `clamp(0.14, calc(var(--progress, 1) * ${words.length + 2} - ${i}), 1)` }}
          >
            {word}{" "}
          </span>
        ))}
      </p>
    </section>
  )
}
