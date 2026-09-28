import { type LucideIcon, Package, TriangleAlert } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

// The ad's holiday forecast (apps/video/src/scenes/holiday.tsx), drawn for the web: the same model and geometry, with
// scroll progress in place of video time. Positions are in the ad's 1920 × 1080 frame; the page scales the chart to fit.

// The forecast's model, in days from Sep 1 and units in stock: 3,000 on hand today, sales steady until November, then
// climbing into the holiday rush, Black Friday to New Year's Eve. The recommended order lands a lead time after it's
// placed, just before the rush.
const leadTime = 60
const today = 11
const orderDay = 24
const arrivalDay = orderDay + leadTime
const rush = { from: 87, to: 121 }
const onHand = 3000
const delivery = 2640
const lostSales = 41_200

const demand = (day: number) => {
  if (day < 66) {
    return 20
  }
  return day < 86 ? 20 + ((day - 66) / 20) * 70 : 90
}

type Point = { day: number; units: number }

// Stock from today to the end of the rush, with the order or without it. Without it, stock runs out and goes below
// zero: the sales it can't make.
const projection = (withOrder: boolean) => {
  const points: Point[] = []
  let units = onHand
  for (let day = today; day <= rush.to; day++) {
    if (withOrder && day === arrivalDay) {
      units += delivery
    }
    points.push({ day, units })
    units -= demand(day)
  }
  return points
}
const without = projection(false)
const withOrder = projection(true)
const unitsOn = (points: readonly Point[], day: number) => points.find((point) => point.day === day)?.units ?? 0
const runsOutDay = without.find(({ units }) => units <= 0)?.day ?? rush.to
const beforeArrival = unitsOn(without, arrivalDay)
const dateOf = (day: number) =>
  new Date(2026, 8, 1 + day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
export const forecastDates = {
  runsOut: dateOf(runsOutDay),
  orderBy: dateOf(orderDay),
  arrives: dateOf(arrivalDay),
  rushEnds: dateOf(rush.to)
}
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`

// The chart on the frame: Sep 1 to Jan 1 across, 3,800 units above zero and 2,400 below.
const plot = { left: 200, right: 1720, top: 270, zero: 600, bottom: 808, days: 122 }
const x = (day: number) => plot.left + (day / plot.days) * (plot.right - plot.left)
const y = (units: number) => plot.zero - (units / 3800) * (plot.zero - plot.top)

type Spot = { x: number; y: number }
const mixed = (from: number, to: number, amount: number) => from + (to - from) * amount
const clamp = (value: number) => Math.min(1, Math.max(0, value))
const spots = (points: readonly Point[]) => points.map(({ day, units }) => ({ x: x(day), y: y(units) }))
const pathOf = (points: readonly Spot[]) =>
  points.map((spot, i) => `${i === 0 ? "M" : "L"} ${spot.x.toFixed(1)} ${spot.y.toFixed(1)}`).join(" ")
const areaOf = (points: readonly Spot[]) => {
  const first = points[0] ?? { x: 0, y: 0 }
  const last = points.at(-1) ?? first
  return `${pathOf(points)} L ${last.x.toFixed(1)} ${plot.zero} L ${first.x.toFixed(1)} ${plot.zero} Z`
}
const lengthOf = (points: readonly Spot[]) =>
  points.slice(1).reduce((sum, spot, i) => sum + Math.hypot(spot.x - points[i]!.x, spot.y - points[i]!.y), 0)

// The stock line down to the stockout, in two parts: up to the order's arrival, which happens either way, and on from
// there, which only happens without the order. Then the shortfall after the stockout, and the plan: the order lands and
// lifts stock through the rush.
const stockLine = spots(
  without.filter(({ day }) => day <= runsOutDay).map((p) => ({ ...p, units: Math.max(0, p.units) }))
)
const earlyLine = stockLine.slice(0, arrivalDay - today + 1)
const lateLine = stockLine.slice(arrivalDay - today)
const earlyShare = lengthOf(earlyLine) / lengthOf(stockLine)
const lostLine = spots(
  without.filter(({ day }) => day >= runsOutDay).map((p) => ({ ...p, units: Math.min(0, p.units) }))
)
const planLine = spots(withOrder.filter(({ day }) => day >= arrivalDay))
const landing = { x: x(arrivalDay), y: y(beforeArrival) }
const stockout = { x: x(runsOutDay), y: plot.zero }

// The point a fraction of the way along a line, by length, for the light that draws it.
const along = (points: readonly Spot[], fraction: number): Spot => {
  const lengths = points.slice(1).map((spot, i) => Math.hypot(spot.x - points[i]!.x, spot.y - points[i]!.y))
  let left = clamp(fraction) * lengths.reduce((sum, length) => sum + length, 0)
  for (const [i, length] of lengths.entries()) {
    if (left <= length) {
      const from = points[i]!
      const to = points[i + 1]!
      const k = length === 0 ? 0 : left / length
      return { x: mixed(from.x, to.x, k), y: mixed(from.y, to.y, k) }
    }
    left -= length
  }
  return points.at(-1) ?? { x: 0, y: 0 }
}

// The order's flight: from the Order by pin, over the chart, down to where it lands.
const pin = { x: x(orderDay), y: 228 }
const placed = { x: x(orderDay), y: y(unitsOn(without, orderDay)) }
const bend = { x: 900, y: 110 }
const flight = (s: number) => ({
  x: (1 - s) ** 2 * pin.x + 2 * (1 - s) * s * bend.x + s ** 2 * landing.x,
  y: (1 - s) ** 2 * pin.y + 2 * (1 - s) * s * bend.y + s ** 2 * landing.y
})
const trail = Array.from({ length: 34 }, (_, i) => (i + 1) / 35)

const red = "#ff5a4f"
const orange = "#ff7a2e"
const green = "#4ade80"
const litText = (gradient: string): CSSProperties => ({
  backgroundImage: gradient,
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent"
})
const redText = litText("linear-gradient(180deg, #ffc4be 0%, #ff5a4f 55%, #d92d20 100%)")
const greenText = litText("linear-gradient(180deg, #dcfce7 0%, #4ade80 55%, #16a34a 100%)")

type Tone = "danger" | "primary" | "success"
const tones: Record<Tone, { color: string; border: string }> = {
  danger: { color: "#ff8078", border: "rgba(255, 90, 79, 0.55)" },
  primary: { color: "#ff9d5c", border: "rgba(255, 138, 61, 0.55)" },
  success: { color: green, border: "rgba(74, 222, 128, 0.5)" }
}

// A label pinned to the chart: a dark pill, popping in as it's shown.
const Chip = ({
  tone,
  icon: Icon,
  shown = 1,
  children
}: {
  tone: Tone
  icon?: LucideIcon
  shown?: number
  children: ReactNode
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 14px",
      borderRadius: 999,
      background: "rgba(20, 20, 23, 0.92)",
      border: `1px solid ${tones[tone].border}`,
      color: tones[tone].color,
      fontSize: 18,
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: "0 14px 30px -14px rgba(0, 0, 0, 0.9)",
      opacity: Math.min(1, shown * 1.5),
      transform: `scale(${0.85 + 0.15 * Math.min(shown, 1.1)})`
    }}
  >
    {Icon ? <Icon size={18} strokeWidth={2.2} /> : null}
    {children}
  </span>
)

// A line drawn on as far as `drawn`, over a soft glow. Nothing shows before it starts: a round cap would leave a dot.
const Glowing = ({
  points,
  stroke,
  drawn,
  opacity = 1
}: {
  points: readonly Spot[]
  stroke: string
  drawn: number
  opacity?: number
}) =>
  drawn > 0 ? (
    <g opacity={opacity}>
      <path
        d={pathOf(points)}
        fill="none"
        stroke={stroke}
        strokeWidth={10}
        filter="url(#forecast-glow)"
        opacity={0.55}
        pathLength={1}
        strokeDasharray={`${drawn} 1`}
      />
      <path
        d={pathOf(points)}
        fill="none"
        stroke={stroke}
        strokeWidth={4.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${drawn} 1`}
      />
    </g>
  ) : null

const anchors = { left: undefined, middle: "translateX(-50%)", right: "translateX(-100%)" }

// A chip placed on the chart: anchored at a point, from its left edge, right edge or middle.
const Pinned = ({ at, from, children }: { at: Spot; from: keyof typeof anchors; children: ReactNode }) => (
  <div style={{ position: "absolute", left: at.x, top: at.y, transform: anchors[from] }}>{children}</div>
)

const months = [
  { label: "Sep", day: 15 },
  { label: "Oct", day: 45.5 },
  { label: "Nov", day: 76 },
  { label: "Dec", day: 106.5 }
]

export type Forecast = {
  // How far each part of the forecast has played, 0 to 1: the chart's arrival, the rush, the stock line, the stockout,
  // the lost sales, the order date, the order's lead time, its arrival and the stock it brings. The pops overshoot 1.
  card: number
  busy: number
  drawn: number
  out: number
  lost: number
  ordered: number
  lead: number
  arrived: number
  refilled: number
  // The outcome: the order has landed, the shortfall is gone and stock runs solid through the rush.
  stocked: number
}

// The frame the chart is cut from: the ad's frame, less its empty margins.
export const chartFrame = { width: 1620, height: 800, left: 150, top: 70 }

// The holiday forecast: stock falls through the rush until it runs out, then keeps falling below zero into the sales it
// can't make, which count up in red. Then the day to order: the order flies its lead time and lands just before the
// rush, lifting stock clear of zero. Stocked, the shortfall is gone for good.
export function ForecastChart({ state }: { state: Forecast }) {
  const { card, busy, drawn, out, lost, ordered, lead, arrived, refilled, stocked } = state
  const risk = 1 - stocked
  // Once the plan is in, the shortfall stays as a warning, dimmed; stocked, it's gone.
  const shortfall = (1 - 0.55 * refilled) * risk
  const head = along(stockLine, drawn)
  const lostHead = along(lostLine, lost)
  const shock = Math.min(1, out)
  const jump = clamp(refilled / 0.3)
  const rest = clamp((refilled - 0.25) / 0.75)
  const planTop = planLine[0] ?? landing
  const planEnd = along(planLine, rest)
  const parcel = flight(lead)
  const results = stocked > 0.5
  const counting = lost < 1 ? 3 * (1 - lost) ** (2 / 3) : 0
  return (
    <div
      className="relative overflow-hidden text-[#fafafa]"
      style={{ width: chartFrame.width, height: chartFrame.height }}
    >
      <div
        style={{
          position: "absolute",
          left: -chartFrame.left,
          top: -chartFrame.top,
          width: 1920,
          height: 1080,
          opacity: Math.min(1, card * 1.5),
          transformOrigin: "50% 55%",
          transform: `translateY(${(1 - card) * 50}px) perspective(2400px) rotateX(${(1 - card) * 10}deg) scale(${0.97 + 0.03 * card})`
        }}
      >
        <div
          style={{
            position: "absolute",
            left: stockout.x - 420,
            top: plot.zero - 280,
            width: 840,
            height: 620,
            background: "radial-gradient(closest-side, rgba(255, 90, 79, 0.3), rgba(255, 90, 79, 0))",
            opacity: 0.6 * Math.min(1, lost * 2) * shortfall + (out > 0 ? 0.7 * (1 - shock) * risk : 0)
          }}
        />
        <span
          style={{
            position: "absolute",
            left: plot.left,
            top: 120,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.02em"
          }}
        >
          Camp Tumbler 20 oz
        </span>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <linearGradient
              id="forecast-rush"
              x1="0"
              y1={plot.top}
              x2="0"
              y2={plot.bottom}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#ff8a3d" stopOpacity={0.16} />
              <stop offset="1" stopColor="#ff8a3d" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient
              id="forecast-stock"
              x1="0"
              y1={plot.top}
              x2="0"
              y2={plot.zero}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={orange} stopOpacity={0.34} />
              <stop offset="1" stopColor={orange} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient
              id="forecast-lost"
              x1="0"
              y1={plot.zero}
              x2="0"
              y2={plot.bottom}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={red} stopOpacity={0.5} />
              <stop offset="1" stopColor={red} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient
              id="forecast-line"
              x1={x(today)}
              y1="0"
              x2={stockout.x}
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#ffb27a" />
              <stop offset="0.6" stopColor={orange} />
              <stop offset="0.86" stopColor={orange} />
              <stop offset="1" stopColor={red} />
            </linearGradient>
            <filter id="forecast-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <clipPath id="forecast-drawn">
              <rect x={0} y={0} width={head.x} height={1080} />
            </clipPath>
            <clipPath id="forecast-short">
              <rect x={stockout.x} y={0} width={Math.max(0, lostHead.x - stockout.x)} height={1080} />
            </clipPath>
            <clipPath id="forecast-plan">
              <rect x={landing.x - 12} y={0} width={Math.max(0, planEnd.x - landing.x + 12)} height={1080} />
            </clipPath>
          </defs>
          <rect
            x={x(rush.from)}
            y={plot.top}
            width={x(rush.to) - x(rush.from)}
            height={plot.bottom - plot.top}
            rx={18}
            fill="url(#forecast-rush)"
            stroke="rgba(255, 138, 61, 0.22)"
            opacity={busy}
          />
          {[30, 61, 91].map((day) => (
            <line
              key={day}
              x1={x(day)}
              y1={plot.top}
              x2={x(day)}
              y2={plot.bottom}
              stroke="rgba(250, 250, 250, 0.06)"
              strokeWidth={1.5}
            />
          ))}
          <line
            x1={plot.left}
            y1={plot.zero}
            x2={plot.right}
            y2={plot.zero}
            stroke="rgba(250, 250, 250, 0.3)"
            strokeWidth={2}
            pathLength={1}
            strokeDasharray={`${card} 1`}
          />
          <line
            x1={x(today)}
            y1={plot.top}
            x2={x(today)}
            y2={plot.bottom}
            stroke="rgba(250, 250, 250, 0.3)"
            strokeWidth={1.5}
            strokeDasharray="5 7"
            opacity={card}
          />
          <path d={areaOf(earlyLine)} fill="url(#forecast-stock)" clipPath="url(#forecast-drawn)" />
          <path d={areaOf(lateLine)} fill="url(#forecast-stock)" clipPath="url(#forecast-drawn)" opacity={risk} />
          <Glowing points={earlyLine} stroke="url(#forecast-line)" drawn={Math.min(1, drawn / earlyShare)} />
          <Glowing
            points={lateLine}
            stroke="url(#forecast-line)"
            drawn={Math.max(0, (drawn - earlyShare) / (1 - earlyShare))}
            opacity={risk}
          />
          <g opacity={shortfall}>
            <path d={areaOf(lostLine)} fill="url(#forecast-lost)" clipPath="url(#forecast-short)" />
            <Glowing points={lostLine} stroke={red} drawn={lost} />
          </g>
          {stocked > 0 ? (
            <path d={areaOf(planLine)} fill="url(#forecast-stock)" opacity={stocked} clipPath="url(#forecast-plan)" />
          ) : null}
          <g clipPath="url(#forecast-plan)" opacity={refilled > 0 ? 1 : 0}>
            <path
              d={pathOf(planLine)}
              fill="none"
              stroke={orange}
              strokeWidth={10}
              filter="url(#forecast-glow)"
              opacity={0.5}
            />
            <path
              d={pathOf(planLine)}
              fill="none"
              stroke={orange}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="12 10"
              opacity={1 - stocked}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-44" dur="1.2s" repeatCount="indefinite" />
            </path>
            <path
              d={pathOf(planLine)}
              fill="none"
              stroke="#ff9d5c"
              strokeWidth={4.5}
              strokeLinecap="round"
              opacity={stocked}
            />
          </g>
          <line
            x1={landing.x}
            y1={landing.y}
            x2={landing.x}
            y2={mixed(landing.y, planTop.y, jump)}
            stroke={orange}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={refilled > 0 ? 1 : 0}
          />
          {trail.map((s) =>
            s <= lead ? (
              <circle
                key={s}
                cx={flight(s).x}
                cy={flight(s).y}
                r={3}
                fill="#ff9d5c"
                opacity={0.75 * (1 - 0.6 * stocked)}
              />
            ) : null
          )}
          <line
            x1={placed.x}
            y1={placed.y}
            x2={placed.x}
            y2={mixed(placed.y, pin.y, Math.min(1, ordered))}
            stroke="#ff9d5c"
            strokeWidth={2.5}
            opacity={Math.min(1, ordered * 2)}
          />
          <circle
            cx={placed.x}
            cy={placed.y}
            r={7 * Math.min(1, ordered * 2)}
            fill={orange}
            stroke="#fff"
            strokeWidth={3}
          />
          {drawn > 0 && drawn < 1 ? (
            <>
              <circle cx={head.x} cy={head.y} r={24} fill={orange} opacity={0.3} filter="url(#forecast-glow)" />
              <circle cx={head.x} cy={head.y} r={7} fill="#fff" />
            </>
          ) : null}
          {lost > 0 && lost < 1 ? (
            <>
              <circle cx={lostHead.x} cy={lostHead.y} r={24} fill={red} opacity={0.35} filter="url(#forecast-glow)" />
              <circle cx={lostHead.x} cy={lostHead.y} r={7} fill="#fff" />
            </>
          ) : null}
          <g opacity={risk}>
            <circle
              cx={stockout.x}
              cy={stockout.y}
              r={14 + 80 * shock}
              fill="none"
              stroke={red}
              strokeWidth={3}
              opacity={out > 0 ? 1 - shock : 0}
            />
            <circle
              cx={stockout.x}
              cy={stockout.y}
              r={10 * Math.min(1, out)}
              fill={red}
              stroke="#fff"
              strokeWidth={3.5}
            />
          </g>
          {arrived > 0 ? (
            <circle
              cx={landing.x}
              cy={landing.y}
              r={12 + 60 * Math.min(1, arrived)}
              fill="none"
              stroke="#ff9d5c"
              strokeWidth={3}
              opacity={1 - Math.min(1, arrived)}
            />
          ) : null}
          <circle
            cx={landing.x}
            cy={landing.y}
            r={8 * Math.min(1, arrived)}
            fill="#fff"
            stroke={orange}
            strokeWidth={4}
          />
        </svg>
        {lead > 0 && arrived < 1 ? (
          <div
            style={{
              position: "absolute",
              left: parcel.x,
              top: parcel.y,
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(180deg, #ff9d5c, #f54a00)",
              boxShadow: "0 0 28px rgba(255, 122, 46, 0.7)",
              transform: `translate(-50%, -50%) scale(${1 - 0.6 * Math.min(1, arrived)})`,
              opacity: 1 - Math.min(1, arrived)
            }}
          >
            <Package size={24} color="#fff" strokeWidth={2.2} />
          </div>
        ) : null}
        {months.map(({ label, day }) => (
          <span
            key={label}
            style={{
              position: "absolute",
              left: x(day),
              top: plot.bottom + 16,
              transform: "translateX(-50%)",
              fontSize: 18,
              color: "rgba(250, 250, 250, 0.62)",
              opacity: card
            }}
          >
            {label}
          </span>
        ))}
        <span
          style={{
            position: "absolute",
            left: x(today),
            top: plot.top - 28,
            transform: "translateX(-50%)",
            fontSize: 16,
            color: "rgba(250, 250, 250, 0.62)",
            opacity: card
          }}
        >
          Today
        </span>
        <span
          style={{
            position: "absolute",
            left: x(today) + 18,
            top: y(onHand) - 42,
            fontSize: 17,
            fontWeight: 500,
            opacity: Math.min(1, drawn * 4) * risk
          }}
        >
          {onHand.toLocaleString("en-US")} in stock
        </span>
        <span
          style={{
            position: "absolute",
            left: x(rush.to) - 18,
            top: plot.top + 14,
            transform: "translateX(-100%)",
            fontSize: 17,
            fontWeight: 500,
            color: "#ffb27a",
            opacity: busy
          }}
        >
          Holiday rush
        </span>
        <span
          style={{
            position: "absolute",
            left: (pin.x + landing.x) / 2 + 30,
            top: 196,
            transform: "translateX(-50%)",
            fontSize: 17,
            color: "rgba(250, 250, 250, 0.62)",
            opacity: clamp((lead - 0.3) / 0.4) * (1 - 0.5 * stocked)
          }}
        >
          {leadTime}-day lead time
        </span>
        <Pinned at={{ x: pin.x, y: pin.y - 40 }} from="middle">
          <Chip tone="primary" shown={ordered}>
            {results ? `Ordered ${forecastDates.orderBy}` : `Order by ${forecastDates.orderBy}`}
          </Chip>
        </Pinned>
        <Pinned at={{ x: landing.x - 20, y: landing.y + 18 }} from="right">
          <Chip tone="primary" shown={arrived}>
            {results ? `Arrived ${forecastDates.arrives}` : `Arrives ${forecastDates.arrives}`}
          </Chip>
        </Pinned>
        <Pinned at={{ x: stockout.x + 22, y: stockout.y - 46 }} from="left">
          <Chip tone="danger" icon={TriangleAlert} shown={out * risk}>
            Runs out {forecastDates.runsOut}
          </Chip>
        </Pinned>
        <Pinned at={{ x: x(110), y: y(unitsOn(withOrder, 110)) - 72 }} from="middle">
          {results ? (
            <Chip tone="success" shown={stocked}>
              In stock through {forecastDates.rushEnds}
            </Chip>
          ) : (
            <Chip tone="primary" shown={rest}>
              With the order
            </Chip>
          )}
        </Pinned>
        <div
          style={{
            position: "absolute",
            right: 1920 - (stockout.x - 34),
            top: plot.zero + 18,
            display: "grid",
            justifyItems: "end",
            gap: 4
          }}
        >
          <span style={{ fontSize: 21, color: "rgba(250, 250, 250, 0.62)", opacity: Math.min(1, lost * 3) }}>
            {results ? "Lost sales avoided" : "Lost sales if you don’t reorder"}
          </span>
          <span style={{ display: "grid" }}>
            <span
              style={{
                gridArea: "1 / 1",
                justifySelf: "end",
                fontSize: 112,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.045em",
                fontVariantNumeric: "tabular-nums",
                ...redText,
                opacity: Math.min(1, lost * 3) * (1 - 0.3 * refilled) * risk,
                filter: `drop-shadow(0 0 30px rgba(255, 90, 79, 0.45))${counting > 0.1 ? ` blur(${counting}px)` : ""}`
              }}
            >
              {money(lostSales * lost)}
            </span>
            <span
              style={{
                gridArea: "1 / 1",
                justifySelf: "end",
                fontSize: 112,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.045em",
                fontVariantNumeric: "tabular-nums",
                ...greenText,
                opacity: stocked,
                filter: "drop-shadow(0 0 30px rgba(74, 222, 128, 0.35))"
              }}
            >
              {money(lostSales)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
