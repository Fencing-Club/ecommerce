import { Bot, Box, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Scaled } from "./scaled"

// Agents working through Copacker over MCP: yours on the left, running a restock, and your partners' on the right,
// posting their updates, with requests and answers pulsing along the links. The motion is SVG animation; with reduced
// motion the pulses stay put and the steps show only the first.

const stage = { width: 1200, height: 520 }
const hub = { x: 600, y: 260 }
const yours = { left: 40, top: 110, width: 400, height: 300 }
const partners = [
  { name: "Shenzhen Metalworks’ agent", message: "Packing list submitted for PO 1043", top: 70 },
  { name: "Pacific Link’s agent", message: "Pickup booked for Dec 2", top: 300 }
].map(({ top, ...partner }) => ({ ...partner, box: { left: 800, top, width: 360, height: 150 } }))

const links = [
  `M ${yours.left + yours.width} ${hub.y} L ${hub.x - 70} ${hub.y}`,
  ...partners.map(
    ({ box }) => `M ${hub.x + 70} ${hub.y} C 720 ${hub.y}, 700 ${box.top + 75}, ${box.left} ${box.top + 75}`
  )
]

const steps = [
  "Checked restock: 2 products run out before they arrive",
  "Created PO 1043 for Shenzhen Metalworks",
  "Sent PO 1043 to the supplier",
  "Planned the Amazon AWD shipment"
]

const card =
  "absolute rounded-2xl bg-[oklch(0.21_0.006_285)] p-5 shadow-[0_30px_60px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/12"

export function Agents() {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0">
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
            <div className={cn(card, "flex flex-col gap-4")} style={yours}>
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#ff8a3d]/15 text-[#ff8a3d]">
                  <Bot className="size-5" />
                </span>
                <span className="text-[1.25rem] font-semibold">Your agent</span>
              </span>
              <p className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#ff8a3d]/12 px-4 py-3 text-[1.1rem] ring-1 ring-[#ff8a3d]/30">
                Reorder anything that runs out before it arrives, and send it to AWD.
              </p>
              <div className="grid min-h-14 items-center">
                {steps.map((step, i) => (
                  <span
                    key={step}
                    className={cn(
                      "col-start-1 row-start-1 flex items-center gap-3 text-[1.05rem] text-white/85 motion-safe:animate-turn",
                      i > 0 && "motion-reduce:hidden"
                    )}
                    style={{ animationDelay: `${i * 3 - 12}s` }}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-background">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    {step}
                  </span>
                ))}
              </div>
            </div>
            {partners.map(({ name, message, box }) => (
              <div key={name} className={cn(card, "flex flex-col gap-3")} style={box}>
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] text-white/80">
                    <Bot className="size-5" />
                  </span>
                  <span className="text-[1.15rem] font-semibold">{name}</span>
                </span>
                <span className="rounded-xl bg-white/[0.05] px-4 py-3 text-[1.05rem] text-white/80">{message}</span>
              </div>
            ))}
          </div>
        </Scaled>
      </div>
    </div>
  )
}
