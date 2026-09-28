import { Check, Ship, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandMark, Stage } from "./stage"

// The panel beside the sign-in forms: Copacker's promise over a glimpse of the product at work, in the order it
// happens: Restock finds what runs out, a purchase order goes to the supplier, and the shipment heads for Amazon. The
// figures are the ad's demo restock (docs/video.md), so the cards agree. It's dark in both themes.

const restock = [
  { name: "Steel Bottle 32 oz", days: 18, order: "2,520", tone: "bg-orange-400" },
  { name: "Trail Mug 12 oz", days: 40, order: "660", tone: "bg-amber-300" },
  { name: "Camp Tumbler 20 oz", days: 133, order: null, tone: "bg-emerald-400" }
]
// The bars run to this many days of stock; the tick marks the 60-day lead time.
const scale = 140
const leadTime = 60

const legs = [
  { name: "Shenzhen Metalworks", state: "done" },
  { name: "Pacific Link", state: "current" },
  { name: "Amazon AWD", state: "next" }
] as const

// Solid cards, a step lighter than the stage, so a card on top of another reads cleanly.
const card =
  "rounded-2xl bg-[oklch(0.225_0.012_55)] ring-1 ring-white/[0.12] shadow-[0_28px_56px_-16px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.06)]"

// Rises in after `delay`, then drifts, out of step with the other cards.
function Enter({
  delay,
  drift,
  className,
  children
}: {
  delay: string
  drift: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative motion-safe:animate-in motion-safe:fill-mode-both motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-1000 motion-safe:ease-out",
        delay,
        className
      )}
    >
      <div className={cn("motion-safe:animate-float", drift)}>{children}</div>
    </div>
  )
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.08]">{children}</span>
}

export function ProductShowcase() {
  return (
    <Stage>
      <div className="relative flex flex-col gap-10 px-12 pt-10 xl:px-16">
        <BrandMark />
        <div className="flex flex-col gap-4">
          <p className="text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance xl:text-[3.25rem]">
            Restocking,{" "}
            <span className="bg-linear-to-r from-orange-300 via-orange-200 to-amber-100 bg-clip-text text-transparent">
              handled.
            </span>
          </p>
          <p className="max-w-sm text-base text-pretty text-white/65">
            Forecast demand, send purchase orders and ship to Amazon with your suppliers and forwarders.
          </p>
        </div>
      </div>

      <div aria-hidden className="relative flex flex-1 items-center justify-center px-10 py-12 xl:px-14">
        <div className="flex w-full max-w-[31rem] flex-col">
          {/* Restock: how long each product lasts against the lead time, and what to order. */}
          <Enter delay="motion-safe:delay-150" drift="[animation-delay:-2s]" className="mr-[14%]">
            <div className={card}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <Icon>
                    <TrendingDown className="size-3.5 text-orange-300" />
                  </Icon>
                  <span className="text-sm font-medium">Restock</span>
                </div>
                <span className="text-[11px] text-white/55">Lead time 60 days</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-5 border-t border-white/[0.08] px-5 pt-3 pb-6 text-xs">
                <span className="pb-1.5 text-white/50">Product</span>
                <span className="pb-1.5 text-right text-white/50">Runs out</span>
                <span className="pb-1.5 text-right text-white/50">Order</span>
                {restock.map((row) => (
                  <div key={row.name} className="contents">
                    <div className="flex min-w-0 flex-col gap-1.5 py-2">
                      <span className="truncate text-white/90">{row.name}</span>
                      <span className="relative h-1 rounded-full bg-white/[0.08]">
                        <span
                          className={cn("absolute inset-y-0 left-0 rounded-full", row.tone)}
                          style={{ width: `${Math.min(row.days / scale, 1) * 100}%` }}
                        />
                        <span
                          className="absolute -inset-y-0.5 w-px bg-white/60"
                          style={{ left: `${(leadTime / scale) * 100}%` }}
                        />
                      </span>
                    </div>
                    <span className="self-center py-2 text-right text-white/75 tabular-nums">{row.days} days</span>
                    <span className="self-center py-2 text-right font-medium tabular-nums">{row.order ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </Enter>

          {/* The purchase order Restock wrote, now with the supplier. */}
          <Enter delay="motion-safe:delay-500" drift="[animation-delay:-5s]" className="z-10 -mt-3 ml-[34%]">
            <div className={cn(card, "flex flex-col gap-3.5 p-4")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Purchase order</span>
                <span className="flex items-center gap-1.5 rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-200">
                  <span className="size-1.5 rounded-full bg-sky-300" />
                  With supplier
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[10px] font-semibold">
                    SM
                  </span>
                  <span className="truncate text-xs text-white/75">Shenzhen Metalworks</span>
                </div>
                <span className="shrink-0 text-base leading-none font-semibold tracking-tight tabular-nums">
                  $13,650
                </span>
              </div>
            </div>
          </Enter>

          {/* The shipment on its way: packed by the supplier, with the forwarder, then Amazon. */}
          <Enter
            delay="motion-safe:delay-700"
            drift="[animation-delay:-3.5s]"
            className="z-20 -mt-3 mr-[8%] ml-[6%] [@media(max-height:46rem)]:hidden"
          >
            <div className={cn(card, "flex flex-col gap-4 p-4")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon>
                    <Ship className="size-3.5 text-sky-200" />
                  </Icon>
                  <span className="text-sm font-medium">Shipment to AWD US</span>
                </div>
                <span className="text-xs text-white/55 tabular-nums">40 cartons</span>
              </div>
              <ol className="grid grid-cols-3">
                {legs.map((leg, index) => (
                  <li key={leg.name} className="relative flex flex-col gap-2">
                    <div className="flex items-center">
                      <span
                        className={cn(
                          "relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full",
                          leg.state === "done" && "bg-orange-400 text-[oklch(0.17_0.01_55)]",
                          leg.state === "current" && "bg-orange-400/20 ring-2 ring-orange-400",
                          leg.state === "next" && "bg-white/10 ring-1 ring-white/30"
                        )}
                      >
                        {leg.state === "done" && <Check className="size-2.5" strokeWidth={3} />}
                        {leg.state === "current" && (
                          <span className="absolute inset-0 rounded-full bg-orange-400/60 motion-safe:animate-ping" />
                        )}
                      </span>
                      {index < legs.length - 1 && (
                        <span className="relative mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          {leg.state === "done" && <span className="absolute inset-0 bg-orange-400" />}
                          {leg.state === "current" && (
                            <span className="absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-orange-300 to-transparent motion-safe:animate-travel" />
                          )}
                        </span>
                      )}
                    </div>
                    <span className="truncate pr-2 text-[11px] text-white/65">{leg.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Enter>
        </div>
      </div>
    </Stage>
  )
}
