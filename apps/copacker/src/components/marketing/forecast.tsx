"use client"

import { useState } from "react"
import { chartFrame, type Forecast as State, ForecastChart, forecastDates } from "./forecast-chart"
import { Scaled } from "./scaled"
import { through, useScrollProgress } from "./scroll"

// Scroll drives the holiday forecast from start to finish: the chart arrives, stock falls through the rush and runs
// out, the lost sales count up, then the order date, the order's flight through its lead time, its landing, and the
// stock it brings, until the season ends fully stocked.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeIn = (t: number) => t * t
// Overshoots a little before settling, for the moments that pop.
const pop = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const phase = (progress: number, from: number, to: number, curve = ease) =>
  Math.max(0, curve(Math.min(1, Math.max(0, (progress - from) / (to - from)))))

const stateAt = (p: number): State => ({
  card: phase(p, 0, 0.05, easeOut),
  busy: phase(p, 0.03, 0.09),
  drawn: phase(p, 0.06, 0.28, easeIn),
  out: phase(p, 0.28, 0.33, pop),
  lost: phase(p, 0.31, 0.46, easeOut),
  ordered: phase(p, 0.52, 0.57, pop),
  lead: phase(p, 0.57, 0.7),
  arrived: phase(p, 0.7, 0.74, pop),
  refilled: phase(p, 0.72, 0.84, easeOut),
  stocked: phase(p, 0.88, 0.95)
})

// What the chart is showing, a line at a time, as the voiceover tells it in the ad.
const lines = [
  { at: 0, text: "3,000 in stock today, and the holiday rush ahead." },
  { at: 0.28, text: `Without a reorder, it runs out ${forecastDates.runsOut}.` },
  { at: 0.38, text: "That’s about $41,200 in lost sales." },
  {
    at: 0.52,
    text: `Order by ${forecastDates.orderBy}, and with a 60-day lead time it lands ${forecastDates.arrives}, before Black Friday.`
  },
  { at: 0.88, text: "Fully stocked, all the way through the rush." }
]

export function Forecast() {
  const [progress, setProgress] = useState(0)
  const ref = useScrollProgress<HTMLElement>(through, { onChange: setProgress, reduced: 1 })
  const line = lines.findLast(({ at }) => progress >= at) ?? lines[0]!
  return (
    <section
      id="forecast"
      ref={ref}
      aria-labelledby="forecast-title"
      className="relative h-[340svh] scroll-mt-0 motion-reduce:h-auto"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center gap-10 overflow-hidden py-16 motion-reduce:static motion-reduce:h-auto">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2
            id="forecast-title"
            className="max-w-3xl text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance"
          >
            See the stockout before it happens.
          </h2>
          <p
            key={line.text}
            aria-hidden
            className="mt-5 max-w-2xl text-lg text-white/65 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 sm:text-xl"
          >
            {line.text}
          </p>
        </div>
        <figure className="mx-auto w-full max-w-[min(72rem,calc((100svh-17rem)*2.025))] px-6">
          <Scaled width={chartFrame.width} height={chartFrame.height}>
            <ForecastChart state={stateAt(progress)} />
          </Scaled>
          <figcaption className="sr-only">
            A holiday forecast for the Camp Tumbler 20 oz. With 3,000 in stock and the rush ahead, it runs out{" "}
            {forecastDates.runsOut} without a reorder, losing about $41,200 in sales. Ordered by {forecastDates.orderBy}
            , the stock lands {forecastDates.arrives}, before Black Friday, and the product stays in stock through{" "}
            {forecastDates.rushEnds}.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
