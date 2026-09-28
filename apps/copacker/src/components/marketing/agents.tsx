"use client"

import { useMediaQuery } from "@mantine/hooks"
import { Bot, Box, Check } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Scaled } from "./scaled"
import { Ticker } from "./ticker"

// Agents working through Copacker over MCP: yours on the left, running a restock, and your partners' on the right,
// posting their updates, with requests and answers pulsing along the links. The motion is SVG animation; with reduced
// motion the pulses stay put and the steps show only the first. It's a picture, described in one line for screen
// readers. A phone scrolls it sideways, so there it takes focus too, for the keyboard to scroll it.

const stage = { width: 1200, height: 520 }
const hub = { x: 600, y: 260 }
const yours = { left: 40, top: 110, width: 400, height: 300 }
// A card's box. It grows taller than its height when a language's words need the room.
const place = ({ height, ...box }: { left: number; top: number; width: number; height: number }) => ({
  ...box,
  minHeight: height
})
const partners = (
  [
    { key: "supplier", name: "Shenzhen Metalworks", top: 70 },
    { key: "forwarder", name: "Pacific Link", top: 300 }
  ] as const
).map(({ top, ...partner }) => ({ ...partner, box: { left: 800, top, width: 360, height: 150 } }))

const links = [
  `M ${yours.left + yours.width} ${hub.y} L ${hub.x - 70} ${hub.y}`,
  ...partners.map(
    ({ box }) => `M ${hub.x + 70} ${hub.y} C 720 ${hub.y}, 700 ${box.top + 75}, ${box.left} ${box.top + 75}`
  )
]

// What your agent does, each a key under marketing.agentsDiagram.steps.
const steps = ["checked", "created", "sent", "planned"] as const

const card =
  "absolute rounded-2xl bg-[oklch(0.21_0.006_285)] p-5 shadow-[0_30px_60px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/12"

export function Agents() {
  const wide = useMediaQuery("(min-width: 48rem)")
  const t = useTranslations("marketing.agentsDiagram")
  const format = useFormatter()
  const messages = {
    supplier: t("packingList", { number: 1043 }),
    forwarder: t("pickup", {
      date: format.dateTime(new Date(Date.UTC(2026, 9, 6)), { month: "short", day: "numeric", timeZone: "UTC" })
    })
  }
  return (
    <figure
      tabIndex={wide ? undefined : 0}
      className="-mx-6 overflow-x-auto px-6 pb-2 outline-none [scrollbar-width:none] focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:ring-inset md:mx-0 md:overflow-visible md:px-0"
    >
      <figcaption className="sr-only">{t("caption")}</figcaption>
      <div className="min-w-[46rem] md:min-w-0">
        <Scaled width={stage.width} height={stage.height}>
          <div aria-hidden className="relative select-none" style={stage}>
            <svg width={stage.width} height={stage.height} className="absolute inset-0 overflow-visible">
              <defs>
                {links.map((d, i) => (
                  <path key={d} id={`agents-link-${i}`} d={d} />
                ))}
                <radialGradient id="agents-hub">
                  <stop offset="0" stopColor="#ff7a2e" stopOpacity={0.55} />
                  <stop offset="1" stopColor="#ff7a2e" stopOpacity={0} />
                </radialGradient>
              </defs>
              <circle cx={hub.x} cy={hub.y} r={170} fill="url(#agents-hub)" />
              <circle
                cx={hub.x}
                cy={hub.y}
                r={80}
                fill="none"
                stroke="#ff7a2e"
                strokeOpacity={0.5}
                className="motion-reduce:hidden"
              >
                <animate attributeName="r" values="70;150" dur="3s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.5;0" dur="3s" repeatCount="indefinite" />
              </circle>
              {links.map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke="rgb(255 255 255 / 0.22)"
                  strokeWidth={2}
                  strokeDasharray="4 6"
                />
              ))}
              <g className="motion-reduce:hidden">
                {links.map((d, i) =>
                  [0, 1].map((back) => (
                    <circle key={`${d}-${back}`} r={5} fill={back ? "#fafafa" : "#ff9d5c"}>
                      <animateMotion
                        dur="2.4s"
                        repeatCount="indefinite"
                        begin={`${i * 0.8 + back * 1.2}s`}
                        keyPoints={back ? "1;0" : "0;1"}
                        keyTimes="0;1"
                        calcMode="linear"
                      >
                        <mpath href={`#agents-link-${i}`} />
                      </animateMotion>
                    </circle>
                  ))
                )}
              </g>
            </svg>
            <div
              className="absolute flex size-[8.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-[2rem] bg-[linear-gradient(180deg,#ff9d5c,#f54a00)] text-white shadow-[0_0_80px_rgb(245_74_0/0.55)]"
              style={{ left: hub.x, top: hub.y }}
            >
              <Box className="size-11" strokeWidth={1.8} />
              <span className="text-[1.05rem] font-semibold tracking-wide">MCP</span>
            </div>
            <div className={cn(card, "flex flex-col gap-4")} style={place(yours)}>
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#ff8a3d]/15 text-[#ff8a3d]">
                  <Bot className="size-5" />
                </span>
                <span className="text-[1.25rem] font-semibold">{t("yours")}</span>
              </span>
              <p className="ms-auto max-w-[88%] rounded-2xl rounded-ee-md bg-[#ff8a3d]/12 px-4 py-3 text-[1.1rem] ring-1 ring-[#ff8a3d]/30">
                {t("prompt")}
              </p>
              <Ticker
                className="min-h-16 items-center"
                lines={steps.map((step) => ({
                  key: step,
                  content: (
                    <span className="flex items-center gap-3 text-[1.05rem] text-white/85">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-background">
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                      {t(`steps.${step}`, { number: 1043, count: 2, supplier: "Shenzhen Metalworks" })}
                    </span>
                  )
                }))}
              />
            </div>
            {partners.map(({ key, name, box }) => (
              <div key={key} className={cn(card, "flex flex-col gap-3")} style={place(box)}>
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] text-white/80">
                    <Bot className="size-5" />
                  </span>
                  <span className="text-[1.15rem] font-semibold">{t("partner", { name })}</span>
                </span>
                <span className="rounded-xl bg-white/[0.05] px-4 py-3 text-[1.05rem] text-white/80">
                  {messages[key]}
                </span>
              </div>
            ))}
          </div>
        </Scaled>
      </div>
    </figure>
  )
}
