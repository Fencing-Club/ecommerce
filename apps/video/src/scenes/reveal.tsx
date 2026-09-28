import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Info,
  type LucideIcon,
  Store,
  TriangleAlert
} from "lucide-react"
import { AbsoluteFill, Easing } from "remotion"
import { buyer, count, money, restockTotals } from "../data"
import { mixed, ramp, settle } from "../motion"
import { Stage } from "../stage"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Badge, Button, Card, Mark, PageHeader, Select } from "../ui"
import { Chaos } from "./chaos"

const { reveal, hook } = moments

// The six headline figures, in the app's order: each tile's value, its change against the previous period or a note,
// and the shape of its trend.
const tiles: readonly {
  label: string
  value: number
  format: (value: number) => string
  change?: number
  note?: string
  loss?: boolean
}[] = [
  { label: "Sales", value: 184920, format: money, change: 12 },
  { label: "Orders", value: 4815, format: count, change: 13 },
  { label: "Average order value", value: 38.4, format: (v) => `$${v.toFixed(2)}`, change: -1 },
  { label: "Units sold", value: 6112, format: count, change: 14 },
  { label: "Gross profit", value: 71340, format: money, note: "38.6% margin" },
  { label: "Stockout losses", value: restockTotals.lost, format: money, note: "$4,120 lost this period", loss: true }
]

// A tile's trend: a grey line over a faint fill, the same shape every render.
const Sparkline = ({ seed, rising }: { seed: number; rising: boolean }) => {
  const points = Array.from({ length: 14 }, (_, i) => {
    const drift = rising ? i * 1.6 : -i * 0.5
    return [i * 10, 32 - drift - Math.sin(i * 1.3 + seed) * 5 - Math.sin(i * 2.9 + seed * 2) * 2.5] as const
  })
  const line = points.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" ")
  return (
    <svg width="100%" height={46} viewBox="0 0 130 46" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={app.muted} stopOpacity={0.16} />
          <stop offset="1" stopColor={app.muted} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,46 ${line} 130,46`} fill={`url(#spark-${seed})`} />
      <polyline
        points={line}
        fill="none"
        stroke={app.muted}
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// A change as a small pill: green up, red down.
const Delta = ({ value }: { value: number }) => {
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        height: 23,
        padding: "0 7px",
        borderRadius: 999,
        background: `color-mix(in oklab, ${up ? app.success : app.danger} 10%, transparent)`,
        color: up ? app.success : app.danger,
        fontSize: 13.5,
        fontWeight: 500,
        fontVariantNumeric: "tabular-nums"
      }}
    >
      <Icon size={14} strokeWidth={2.2} />
      {`${up ? "+" : "-"}${Math.abs(value)}%`}
    </span>
  )
}

// What needs attention, as the Overview words it, most urgent first.
const attention: readonly { icon: LucideIcon; color: string; title: string; detail: string; action: string }[] = [
  {
    icon: CircleAlert,
    color: app.danger,
    title: "1 item runs out before a reorder arrives",
    detail: "Reorder now to limit lost sales",
    action: "Plan restock"
  },
  {
    icon: TriangleAlert,
    color: app.warning,
    title: "1 shipment needs approval or labels",
    detail: "Your supplier is waiting to ship",
    action: "View shipments"
  },
  {
    icon: TriangleAlert,
    color: app.warning,
    title: "1 item is due for a reorder",
    detail: "Order now to stay in stock",
    action: "Plan restock"
  },
  {
    icon: Info,
    color: app.muted,
    title: "1 purchase order is still a draft",
    detail: "Send them when you’re ready",
    action: "View purchase orders"
  }
]

// Copacker's Overview, filling in: the figures count up, then what needs attention arrives.
export const Overview = ({ t }: { t: number }) => {
  const counted = ramp(t, reveal.tiles, reveal.tiles + 1.1, Easing.out(Easing.cubic))
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        title="Overview"
        actions={
          <>
            <Button variant="outline" icon={CalendarDays} iconEnd={ChevronDown}>
              Last 30 days
            </Button>
            <Select icon={Store}>All channels</Select>
          </>
        }
      />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "18px 18px",
            borderBottom: `1px solid ${app.border}`
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 500 }}>Needs attention</span>
          <Badge variant="destructive">{attention.length}</Badge>
        </div>
        {attention.map(({ icon: Icon, color, title, detail, action }, i) => {
          const shown = settle(t, reveal.rows + i * 0.12, 20, 170)
          return (
            <div
              key={title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                height: 58,
                padding: "0 18px",
                borderTop: i > 0 ? `1px solid ${app.border}` : undefined,
                opacity: shown,
                transform: `translateY(${(1 - shown) * 14}px)`
              }}
            >
              <Icon size={18} color={color} strokeWidth={2} style={{ flex: "none" }} />
              <span style={{ display: "grid", flex: 1, lineHeight: 1.3 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
                <span style={{ fontSize: 13.5, color: app.muted }}>{detail}</span>
              </span>
              <Button variant="ghost" size="sm" iconEnd={ChevronRight} style={{ color: app.muted }}>
                {action}
              </Button>
            </div>
          )
        })}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 16 }}>
        {tiles.map(({ label, value, format, change, note, loss }, i) => (
          <Card key={label} style={{ display: "grid", gap: 10, padding: 18 }}>
            <span style={{ display: "grid", gap: 4 }}>
              <span
                style={{
                  overflow: "hidden",
                  fontSize: 15,
                  color: app.muted,
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 27,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: loss ? app.danger : app.foreground,
                  whiteSpace: "nowrap"
                }}
              >
                {format(value * counted)}
              </span>
            </span>
            <span style={{ display: "flex", alignItems: "center", height: 23, fontSize: 13.5, color: app.muted }}>
              {change === undefined ? (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</span>
              ) : (
                <Delta value={change} />
              )}
            </span>
            {/* Figures without a daily series keep the trend's space, so the tiles line up. */}
            {change === undefined ? <span style={{ height: 46 }} /> : <Sparkline seed={i} rising={change > 0} />}
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Sales</span>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {["Sales by channel", "Gross profit"].map((title, i) => (
            <Card key={title} style={{ display: "flex", alignItems: "flex-start", gap: 7, height: 140, padding: 18 }}>
              <span style={{ fontSize: 17, fontWeight: 500 }}>{title}</span>
              {i === 0 ? (
                <>
                  <Info size={15} color={app.muted} style={{ marginTop: 3 }} />
                  <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", color: app.muted }}>
                    Orders
                    <ChevronRight size={16} />
                  </span>
                </>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// Where the reveal lights the stage, and where its window rests at the end, for the forecast to carry on from.
export const revealGlow = { x: 50, y: 64 }
export const revealWindow = { x: 960, y: 590, width: 1440, height: 730 }

// 0:10 to 0:17, the reveal: on the drop the mess snaps into a grid and the grid flies into Copacker, which opens on the
// Overview under its name.
export const Reveal = ({ t }: { t: number }) => {
  const flash = 1 - ramp(t, 0, 0.35)
  const ring = ramp(t, 0, 1, Easing.out(Easing.cubic))
  const opened = settle(t, reveal.assemble, 17, 110)
  const named = settle(t, reveal.logo, 15, 150)
  const leaving = ramp(t, reveal.out, reveal.out + 0.4, Easing.in(Easing.cubic))
  return (
    <Stage glow={{ ...revealGlow, strength: 0.4 + 0.8 * opened }}>
      <Chaos t={hook.freeze + 0.5} snap={t} />
      <div
        style={{
          position: "absolute",
          left: 960,
          top: 560,
          width: 2600 * ring,
          height: 2600 * ring,
          borderRadius: "50%",
          border: `3px solid rgba(255, 138, 61, ${0.8 * (1 - ring)})`,
          transform: "translate(-50%, -50%)"
        }}
      />
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.22 }} />
      <div
        style={{
          position: "absolute",
          top: 64,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          opacity: named * (1 - leaving),
          transform: `translateY(${(1 - named) * -24}px) scale(${0.92 + 0.08 * named})`
        }}
      >
        <Mark size={64} />
        <span style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.045em" }}>Copacker</span>
      </div>
      <div style={{ position: "absolute", inset: 0, perspective: 2400 }}>
        <div
          style={{
            position: "absolute",
            left: revealWindow.x,
            top: revealWindow.y,
            opacity: Math.min(1, opened * 1.6),
            transform: `translate(-50%, -50%) rotateX(${mixed(16, 3, opened) - 3 * ramp(t, 1.5, 6.5)}deg) scale(${mixed(0.8, 1, opened)})`
          }}
        >
          <AppWindow width={revealWindow.width} height={revealWindow.height} workspace={buyer} page="Overview">
            <Overview t={t} />
          </AppWindow>
        </div>
      </div>
    </Stage>
  )
}
