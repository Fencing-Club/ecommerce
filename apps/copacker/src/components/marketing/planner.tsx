"use client"

import { useMediaQuery, useReducedMotion } from "@mantine/hooks"
import { Check, GlassWater } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// The forecast, for the visitor to play with: one product's stock, sold through Amazon, Shopify and eBay, with the
// holiday rush ahead. Copacker works back from the day it would run out, through the supplier's lead time, to the day
// to order and how much. Changing the lead time, the stores or the rush glides everything to its new place.

type Store = { key: "amazon" | "shopify" | "ebay"; name: string; perDay: number }
type Inputs = { lead: number; amazon: number; shopify: number; ebay: number; rush: number }

const product = { name: "Steel Bottle 32 oz", sku: "SM-3201", stock: 3400, price: 32, casePack: 24 }
const stores: Store[] = [
  { key: "amazon", name: "Amazon", perDay: 21 },
  { key: "shopify", name: "Shopify", perDay: 8 },
  { key: "ebay", name: "eBay", perDay: 4 }
]
const horizon = 150
const rush = { from: 56, to: 92, lift: 2.1 }
// Stock left when an order lands, in days of sales, and how many days of sales an order covers.
const buffer = 10
const cover = 90

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// How far into the rush a day is, easing in and out over a few days at each end.
const rushShare = (day: number) => clamp((day - rush.from) / 4 + 0.5) * clamp((rush.to - day) / 4 + 0.5)

// Units sold on a day: the stores' daily sales, lifted through the rush, with a small weekly rhythm.
function rate(inputs: Inputs, day: number) {
  const base = stores.reduce((total, store) => total + store.perDay * inputs[store.key], 0)
  return base * (1 + (rush.lift - 1) * inputs.rush * rushShare(day)) * (1 + 0.06 * Math.sin((day / 7) * Math.PI * 2))
}

function plan(inputs: Inputs) {
  const days = horizon + 130 + cover
  const sold = [0]
  for (let day = 0; day < days; day++) {
    sold.push((sold[day] ?? 0) + rate(inputs, day))
  }
  const soldBy = (day: number) => {
    const i = clamp(Math.floor(day), 0, days - 1)
    return lerp(sold[i] ?? 0, sold[i + 1] ?? 0, clamp(day - i))
  }
  const crossing = sold.findIndex((units) => units >= product.stock)
  const before = sold[crossing - 1] ?? 0
  const after = sold[crossing] ?? 0
  const out = crossing > 0 ? crossing - 1 + (product.stock - before) / Math.max(1e-6, after - before) : Infinity
  const late = out - inputs.lead - buffer < 0
  const orderBy = Number.isFinite(out) ? Math.max(0, out - inputs.lead - buffer) : horizon
  const lands = orderBy + inputs.lead
  const units = Math.ceil((soldBy(lands + cover) - soldBy(lands)) / product.casePack) * product.casePack
  // Amazon checks a shipment in over several days, and slower in the rush, while the sales go on. They stop when the
  // shelf is empty, and what can't be sold then is lost.
  const receiving = 5 + 4 * inputs.rush * rushShare(lands)
  const received = (day: number) => units * clamp((day - lands) / receiving)
  const level = [product.stock]
  let short = 0
  for (let day = 0; day < horizon; day++) {
    const supply = (level[day] ?? 0) + received(day + 1) - received(day)
    const demand = rate(inputs, day)
    short += Math.max(0, demand - supply)
    level.push(Math.max(0, supply - demand))
  }
  const levelAt = (day: number) => {
    const i = clamp(Math.floor(day), 0, horizon - 1)
    return lerp(level[i] ?? 0, level[i + 1] ?? 0, clamp(day - i))
  }
  const restocked = level.findIndex((stock, day) => day > out && stock > 0)
  return {
    out,
    late,
    orderBy,
    lands,
    units,
    receiving,
    level,
    levelAt,
    back: restocked < 0 ? horizon : restocked,
    lost: short * product.price,
    soldBy
  }
}

// Moves the shown inputs to new ones over half a second, or at once with reduced motion.
function useGlide(target: Inputs) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    if (reduced) {
      current.current = target
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = clamp((now - start) / 520)
      const k = 1 - (1 - t) ** 3
      const next: Inputs = {
        lead: lerp(from.lead, target.lead, k),
        amazon: lerp(from.amazon, target.amazon, k),
        shopify: lerp(from.shopify, target.shopify, k),
        ebay: lerp(from.ebay, target.ebay, k),
        rush: lerp(from.rush, target.rush, k)
      }
      current.current = next
      setShown(next)
      if (t < 1) {
        frame = requestAnimationFrame(step)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, reduced])
  return reduced ? target : shown
}

// The chart's layout: wide, or tall with bigger type for a phone. Sizes are in the chart's own units, and `unit` scales
// the lines, marks and type so they come out the same size on screen in both.
type Layout = {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  unit: number
  ticks: number[]
}
const wideLayout: Layout = {
  width: 1000,
  height: 360,
  left: 24,
  right: 918,
  top: 44,
  bottom: 280,
  unit: 1,
  ticks: [0, 30, 60, 90, 120, 150]
}
const tallLayout: Layout = {
  width: 1000,
  height: 900,
  left: 24,
  right: 790,
  top: 150,
  bottom: 690,
  unit: 2.6,
  ticks: [0, 60, 120]
}
const most = 5000
const path = (points: [number, number][]) =>
  points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")
const anchor = (day: number) => {
  if (day === 0) {
    return "start"
  }
  return day === horizon ? "end" : "middle"
}
const days = (value: number) => `${Math.round(value)} ${Math.round(value) === 1 ? "day" : "days"}`
const money = (value: number) => `$${(Math.round(value / 100) * 100).toLocaleString("en-US")}`

export function Planner() {
  const [inputs, setInputs] = useState<Inputs>({ lead: 60, amazon: 1, shopify: 1, ebay: 1, rush: 1 })
  const shown = useGlide(inputs)
  const figure = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const element = figure.current
    if (!element) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const wide = useMediaQuery("(min-width: 640px)", true)
  const chart = wide ? wideLayout : tallLayout
  const u = chart.unit
  const type = { fontSize: 13 * u }
  const x = (day: number) => chart.left + (clamp(day, 0, horizon) / horizon) * (chart.right - chart.left)
  const y = (units: number) => chart.bottom - (clamp(units, 0, most) / most) * (chart.bottom - chart.top)
  const result = plan(shown)
  const final = plan(inputs)
  const stock = (day: number) => product.stock - result.soldBy(day)
  const samples = Array.from({ length: horizon + 1 }, (_, day) => day)
  const without = path(samples.map((day) => [x(day), y(stock(day))]))
  const withLine = path(samples.map((day) => [x(day), y(result.level[day] ?? 0)]))
  // The top of the climb, once the shipment is all checked in.
  const topDay = result.lands + result.receiving
  const topY = y(result.levelAt(topDay))
  const area = `${withLine} L${x(horizon)} ${chart.bottom} L${x(0)} ${chart.bottom} Z`
  const orderX = x(result.orderBy)
  const landX = x(result.lands)
  const outX = x(result.out)
  const toggle = (key: Store["key"]) =>
    setInputs((current) => {
      const on = stores.filter((store) => current[store.key] === 1)
      // One store always stays on, so there are sales to forecast.
      if (current[key] === 1 && on.length === 1) {
        return current
      }
      return { ...current, [key]: current[key] === 1 ? 0 : 1 }
    })

  return (
    <div
      ref={figure}
      className="relative rounded-[1.75rem] bg-background shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_40px_90px_-40px_rgb(90_45_10/0.35)]"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b px-5 py-4 sm:px-7">
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border bg-muted/60 text-muted-foreground">
            <GlassWater className="size-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-semibold">{product.name}</span>
            <span className="text-sm text-muted-foreground">
              {product.sku}, {product.stock.toLocaleString("en-US")} in stock
            </span>
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className="mr-1 text-sm text-muted-foreground">Sold a day</span>
          {stores.map((store) => (
            <button
              key={store.key}
              type="button"
              aria-pressed={inputs[store.key] === 1}
              onClick={() => toggle(store.key)}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground/15 aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90"
            >
              {store.name}
              <span className="tabular-nums opacity-60">{store.perDay}</span>
            </button>
          ))}
        </div>
      </div>
      <figure className="relative px-2 pt-3 sm:px-4">
        <figcaption className="sr-only">{`Stock of the ${product.name} over the next ${horizon} days. Without a reorder it runs out in ${days(final.out)}. ${final.late ? "Ordered today" : `Ordered in ${days(final.orderBy)}`}, ${final.units.toLocaleString("en-US")} units land ${final.late ? `after it runs out, losing about ${money(final.lost)} in sales` : "before it runs out"}.`}</figcaption>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="planner-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f54a00" stopOpacity={0.18} />
              <stop offset="1" stopColor="#f54a00" stopOpacity={0} />
            </linearGradient>
            <clipPath id="planner-reveal">
              <rect
                x={0}
                y={0}
                width={chart.width}
                height={chart.height}
                className="origin-left transition-transform duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ transform: seen ? "scaleX(1)" : "scaleX(0)", transformBox: "fill-box" }}
              />
            </clipPath>
          </defs>
          {[1000, 2000, 3000, 4000, 5000].map((units) => (
            <g key={units}>
              <line
                x1={chart.left}
                x2={chart.right}
                y1={y(units)}
                y2={y(units)}
                strokeWidth={u}
                className="stroke-foreground/[0.06]"
              />
              <text
                x={chart.width - 6}
                y={y(units) + 4 * u}
                textAnchor="end"
                className="fill-muted-foreground"
                style={type}
              >
                {units.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          <line
            x1={chart.left}
            x2={chart.right}
            y1={chart.bottom}
            y2={chart.bottom}
            strokeWidth={u}
            className="stroke-foreground/15"
          />
          <g style={{ opacity: shown.rush }}>
            <rect
              x={x(rush.from)}
              y={chart.top - 24 * u}
              width={x(rush.to) - x(rush.from)}
              height={chart.bottom - chart.top + 24 * u}
              rx={10 * u}
              className="fill-primary/[0.07]"
            />
            <text
              x={(x(rush.from) + x(rush.to)) / 2}
              y={chart.top - 8 * u}
              textAnchor="middle"
              className="fill-primary font-medium"
              style={type}
            >
              Holiday rush
            </text>
          </g>
          <g clipPath="url(#planner-reveal)">
            <path d={area} fill="url(#planner-area)" />
            <path
              d={without}
              fill="none"
              strokeWidth={2 * u}
              strokeDasharray={`${5 * u} ${6 * u}`}
              className="stroke-foreground/30"
            />
            <path d={withLine} fill="none" strokeWidth={3 * u} strokeLinejoin="round" className="stroke-primary" />
            {Number.isFinite(result.out) && result.out <= horizon && (
              <line
                x1={outX}
                x2={x(result.back)}
                y1={chart.bottom}
                y2={chart.bottom}
                strokeWidth={4 * u}
                strokeLinecap="round"
                className={cn("stroke-destructive transition-opacity", result.late ? "opacity-100" : "opacity-0")}
              />
            )}
          </g>
          <g className={cn("transition-opacity duration-700", seen ? "opacity-100" : "opacity-0")}>
            {Number.isFinite(result.out) && result.out <= horizon && (
              <g>
                <circle cx={outX} cy={chart.bottom} r={5 * u} className="fill-destructive" />
                <text
                  x={outX}
                  y={chart.bottom - 12 * u}
                  textAnchor="middle"
                  className="fill-destructive font-medium"
                  style={type}
                >
                  Runs out
                </text>
              </g>
            )}
            <line
              x1={orderX}
              x2={orderX}
              y1={chart.top}
              y2={y(result.levelAt(result.orderBy))}
              strokeWidth={u}
              strokeDasharray={`${3 * u} ${4 * u}`}
              className="stroke-foreground/40"
            />
            <circle
              cx={orderX}
              cy={y(result.levelAt(result.orderBy))}
              r={6 * u}
              strokeWidth={3 * u}
              className="fill-background stroke-primary"
            />
            <g transform={`translate(${clamp(orderX, 64 * u, chart.right - 64 * u)} ${chart.top - 4 * u})`}>
              <rect x={-58 * u} y={-30 * u} width={116 * u} height={26 * u} rx={13 * u} className="fill-foreground" />
              <text y={-12 * u} textAnchor="middle" className="fill-background font-medium" style={type}>
                {result.late ? "Order today" : "Order by"}
              </text>
            </g>
            {result.lands <= horizon && (
              <g>
                <circle cx={x(topDay)} cy={topY} r={5 * u} className="fill-primary" />
                <text
                  x={x(topDay) + 10 * u}
                  y={(y(result.levelAt(result.lands)) + topY) / 2 + 4 * u}
                  className="fill-foreground font-medium tabular-nums"
                  style={type}
                >
                  +{result.units.toLocaleString("en-US")}
                </text>
                <g strokeWidth={u} className="stroke-foreground/35">
                  <line x1={orderX} x2={landX} y1={chart.bottom + 26 * u} y2={chart.bottom + 26 * u} />
                  <line x1={orderX} x2={orderX} y1={chart.bottom + 20 * u} y2={chart.bottom + 32 * u} />
                  <line x1={landX} x2={landX} y1={chart.bottom + 20 * u} y2={chart.bottom + 32 * u} />
                </g>
                <text
                  x={(orderX + landX) / 2}
                  y={chart.bottom + 48 * u}
                  textAnchor="middle"
                  className="fill-muted-foreground tabular-nums"
                  style={type}
                >
                  {Math.round(shown.lead)}-day lead time
                </text>
              </g>
            )}
          </g>
          {chart.ticks.map((day) => (
            <text
              key={day}
              x={x(day)}
              y={chart.height - 6 * u}
              textAnchor={anchor(day)}
              className="fill-muted-foreground"
              style={type}
            >
              {day === 0 ? "Today" : days(day)}
            </text>
          ))}
        </svg>
      </figure>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-5 border-t px-5 py-5 sm:px-7">
        <div className="flex min-w-64 flex-1 items-center gap-4">
          <span id="planner-lead" className="shrink-0 text-sm font-medium">
            Lead time
          </span>
          <Slider
            aria-labelledby="planner-lead"
            value={[inputs.lead]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value
              if (typeof next === "number") {
                setInputs((current) => ({ ...current, lead: next }))
              }
            }}
            min={20}
            max={120}
            step={5}
            className="max-w-sm [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-track]]:h-1.5"
          />
          <span className="w-16 shrink-0 text-sm tabular-nums">{days(inputs.lead)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="planner-rush">Holiday rush</Label>
          <Switch
            id="planner-rush"
            checked={inputs.rush === 1}
            onCheckedChange={(checked) => setInputs((current) => ({ ...current, rush: checked ? 1 : 0 }))}
          />
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t lg:grid-cols-4">
        {[
          {
            term: "Order by",
            value: result.late ? "Today" : `In ${days(result.orderBy)}`,
            note: result.late ? "It lands after it runs out" : "Lands before it runs out",
            tone: result.late ? "text-destructive" : ""
          },
          {
            term: "Order",
            value: `${result.units.toLocaleString("en-US")} units`,
            note: `${Math.round(result.units / product.casePack)} cartons`,
            tone: ""
          },
          {
            term: "Runs out without it",
            value: Number.isFinite(result.out) && result.out <= horizon ? `In ${days(result.out)}` : "Not this season",
            note: "At today’s pace",
            tone: ""
          },
          {
            term: "Lost sales",
            value: result.lost > 50 ? money(result.lost) : "None",
            note: result.lost > 50 ? "While it’s out of stock" : "In stock the whole way",
            tone: result.lost > 50 ? "text-destructive" : "text-success"
          }
        ].map((stat, i) => (
          <div
            key={stat.term}
            className={cn(
              "flex flex-col gap-1 px-5 py-5 sm:px-7",
              i % 2 === 1 && "border-l",
              i > 1 && "border-t lg:border-t-0",
              i === 2 && "lg:border-l"
            )}
          >
            <dt className="text-sm text-muted-foreground">{stat.term}</dt>
            <dd className={cn("flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums", stat.tone)}>
              {stat.term === "Lost sales" && result.lost <= 50 && <Check className="size-5" />}
              {stat.value}
            </dd>
            <dd className="text-sm text-muted-foreground">{stat.note}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
