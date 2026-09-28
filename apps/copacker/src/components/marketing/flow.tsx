import { Factory, FileText, Globe, Ship, Warehouse } from "lucide-react"
import { StatusBadge } from "@/components/common"
import { cn } from "@/lib/utils"
import { Scaled } from "./scaled"

// One purchase order on its way: cartons stream from the supplier, through the forwarder, and split between Amazon's
// networks, down to AWD in China and Vietnam, while every party's updates rise to the one order they all share. The
// motion is SVG animation along the routes, so it needs no script; with reduced motion the cartons stay put.

const stage = { width: 1200, height: 640 }
const supplier = { left: 10, top: 420, width: 310, height: 104 }
const forwarder = { left: 395, top: 420, width: 310, height: 104 }
const record = { left: 330, top: 24, width: 440, height: 236 }
const lane = supplier.top + supplier.height / 2
const destinations = [
  { name: "Amazon FBA", units: "780 units", y: 250, icon: Warehouse },
  { name: "AWD in the US", units: "960 units", y: 342, icon: Warehouse },
  { name: "AWD in China", units: "720 units", y: 434, icon: Globe },
  { name: "AWD in Vietnam", units: "720 units", y: 526, icon: Globe }
].map(({ y, ...destination }) => ({ ...destination, box: { left: 840, top: y, width: 350, height: 72 } }))

// A carton's whole route, supplier to forwarder to a network, and the part after the forwarder that's drawn in orange.
const route = (to: number) =>
  `M ${supplier.left + supplier.width} ${lane} L ${forwarder.left + forwarder.width} ${lane} C 780 ${lane}, 760 ${to}, 840 ${to}`
const branch = (to: number) => `M ${forwarder.left + forwarder.width} ${lane} C 780 ${lane}, 760 ${to}, 840 ${to}`

// Updates rising from each party to the order.
const updates = [
  `M ${supplier.left + supplier.width / 2} ${supplier.top} C ${supplier.left + supplier.width / 2} 320, 400 330, 400 ${record.top + record.height}`,
  `M ${forwarder.left + forwarder.width / 2} ${forwarder.top} L ${forwarder.left + forwarder.width / 2} ${record.top + record.height}`,
  `M 1015 250 C 1015 190, 880 150, ${record.left + record.width} 150`
]

const news = [
  "Packing list submitted by Shenzhen Metalworks",
  "Carton labels downloaded by Shenzhen Metalworks",
  "Picked up by Pacific Link Logistics",
  "Checked in at Amazon AWD"
]

function Party({
  icon: Icon,
  name,
  job,
  className,
  style
}: {
  icon: typeof Factory
  name: string
  job: string
  className?: string
  style: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-4 rounded-2xl bg-[oklch(0.21_0.006_285)] px-5 shadow-[0_30px_60px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/12",
        className
      )}
      style={style}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/80">
        <Icon className="size-6" strokeWidth={1.7} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[1.2rem] font-semibold tracking-tight">{name}</span>
        <span className="text-[1.05rem] text-white/50">{job}</span>
      </span>
    </div>
  )
}

export function Flow() {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0">
      <div className="min-w-[46rem] md:min-w-0">
        <Scaled width={stage.width} height={stage.height}>
          <div aria-hidden className="relative select-none" style={stage}>
            <svg width={stage.width} height={stage.height} className="absolute inset-0 overflow-visible">
              <defs>
                <linearGradient id="flow-branch" x1="705" y1="0" x2="840" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ff7a2e" stopOpacity={0.2} />
                  <stop offset="1" stopColor="#ff7a2e" stopOpacity={0.9} />
                </linearGradient>
                <filter id="flow-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" />
                </filter>
                {destinations.map((destination, i) => (
                  <path
                    key={destination.name}
                    id={`flow-route-${i}`}
                    d={route(destination.box.top + destination.box.height / 2)}
                  />
                ))}
                {updates.map((d, i) => (
                  <path key={d} id={`flow-update-${i}`} d={d} />
                ))}
              </defs>
              {updates.map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke="rgb(255 255 255 / 0.14)"
                  strokeWidth={2}
                  strokeDasharray="3 7"
                />
              ))}
              <path
                d={`M ${supplier.left + supplier.width} ${lane} L ${forwarder.left} ${lane}`}
                fill="none"
                stroke="rgb(255 255 255 / 0.22)"
                strokeWidth={2.5}
              />
              {destinations.map((destination) => (
                <path
                  key={destination.name}
                  d={branch(destination.box.top + destination.box.height / 2)}
                  fill="none"
                  stroke="url(#flow-branch)"
                  strokeWidth={2.5}
                />
              ))}
              <g className="motion-reduce:hidden">
                {destinations.flatMap((destination, i) =>
                  [0, 1, 2].map((wave) => (
                    <g key={`${destination.name}-${wave}`}>
                      <rect
                        x={-8}
                        y={-8}
                        width={16}
                        height={16}
                        rx={4}
                        fill="#ff7a2e"
                        filter="url(#flow-glow)"
                        opacity={0.7}
                      />
                      <rect x={-6.5} y={-6.5} width={13} height={13} rx={3} fill="#ffb27a" />
                      <animateMotion dur="6s" repeatCount="indefinite" begin={`${wave * 2 + i * 0.5}s`}>
                        <mpath href={`#flow-route-${i}`} />
                      </animateMotion>
                    </g>
                  ))
                )}
                {updates.map((d, i) => (
                  <circle key={d} r={4} fill="#fafafa">
                    <animateMotion dur="3s" repeatCount="indefinite" begin={`${i * 1.3}s`}>
                      <mpath href={`#flow-update-${i}`} />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      dur="3s"
                      repeatCount="indefinite"
                      begin={`${i * 1.3}s`}
                    />
                  </circle>
                ))}
              </g>
            </svg>
            <div
              className="light absolute flex flex-col gap-4 rounded-2xl bg-background p-5 text-foreground shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/20"
              style={record}
            >
              <div className="flex items-center gap-3">
                <span className="text-[1.6rem] font-semibold tracking-tight">PO 1043</span>
                <StatusBadge tone="info">With supplier</StatusBadge>
              </div>
              <div className="grid h-12 items-center rounded-xl bg-muted px-4 text-[1.05rem]">
                {news.map((item, i) => (
                  <span
                    key={item}
                    className={cn(
                      "col-start-1 row-start-1 flex items-center gap-2.5 motion-safe:animate-turn",
                      i > 0 && "motion-reduce:hidden"
                    )}
                    style={{ animationDelay: `${i * 3 - 12}s` }}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                    {item}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["Purchase order", "Packing list", "Carton labels", "Box labels"].map((document) => (
                  <span
                    key={document}
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.95rem]"
                  >
                    <FileText className="size-4 text-muted-foreground" />
                    {document}
                  </span>
                ))}
              </div>
            </div>
            <Party icon={Factory} name="Shenzhen Metalworks" job="Supplier" style={supplier} />
            <Party icon={Ship} name="Pacific Link Logistics" job="Forwarder" style={forwarder} />
            {destinations.map(({ icon: Icon, name, units, box }) => (
              <div
                key={name}
                className="absolute flex items-center gap-3 rounded-xl bg-[oklch(0.21_0.006_285)] px-4 ring-1 ring-white/12"
                style={box}
              >
                <Icon className="size-5 shrink-0 text-[#ff9d5c]" strokeWidth={1.8} />
                <span className="flex-1 truncate text-[1.1rem] font-medium">{name}</span>
                <span className="text-[1.1rem] font-semibold text-[#ff9d5c] tabular-nums">{units}</span>
              </div>
            ))}
          </div>
        </Scaled>
      </div>
    </div>
  )
}
