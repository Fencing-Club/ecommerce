import { AbsoluteFill, Easing } from "remotion"
import { buyer, count, money, restock } from "../data"
import { mixed, ramp, settle } from "../motion"
import { Stage } from "../stage"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Badge, Button, Card, CardTitle, Mark, PageTitle, Table, type Tone } from "../ui"
import { Chaos } from "./chaos"

const { reveal, hook } = moments

const tiles = [
  { label: "Sales", value: 184920, format: money, change: "+12%", good: true },
  { label: "Gross profit", value: 71340, format: money, change: "+9%", good: true },
  { label: "Units sold", value: 6112, format: count, change: "+14%", good: true },
  { label: "Average order value", value: 38.4, format: (v: number) => `$${v.toFixed(2)}`, change: "−1%", good: false },
  { label: "Orders", value: 4815, format: count, change: "+13%", good: true },
  { label: "Stockout losses", value: 3210, format: money, change: "−38%", good: true }
]

// A tile's trend line, the same shape every render.
const Sparkline = ({ seed, good }: { seed: number; good: boolean }) => {
  const points = Array.from({ length: 12 }, (_, i) => {
    const rise = good ? i * 2.2 : -i * 0.8
    return `${i * 10},${34 - rise - Math.sin(i * 1.3 + seed) * 5 - 6}`
  })
  return (
    <svg width={112} height={44} viewBox="0 0 112 44">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={good ? app.success : app.muted}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

const attention = [
  { text: `${restock[0].name} runs out before it arrives`, action: "Plan restock" },
  { text: `${restock[1].name} runs out before it arrives`, action: "Plan restock" },
  { text: "Shipment 2 to Amazon FBA is waiting on labels", action: "View shipments" }
]

const sellers: readonly { name: string; sold: number; onHand: number; cover: number; status: string; tone: Tone }[] = [
  { name: restock[0].name, sold: 1830, onHand: 1140, cover: 18, status: "Reorder now", tone: "danger" },
  { name: restock[1].name, sold: 1020, onHand: 1380, cover: 40, status: "Reorder soon", tone: "warning" },
  { name: restock[2].name, sold: 540, onHand: 2400, cover: 133, status: "In stock", tone: "success" },
  { name: "Insulated Lid", sold: 410, onHand: 1260, cover: 92, status: "In stock", tone: "success" }
]

// Copacker's Overview, filling in: the numbers count up, then the lists arrive.
export const Overview = ({ t }: { t: number }) => {
  const counted = ramp(t, reveal.tiles, reveal.tiles + 1.1, Easing.out(Easing.cubic))
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageTitle aside={<Button variant="outline">Last 30 days</Button>}>Overview</PageTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {tiles.map(({ label, value, format, change, good }, i) => (
          <Card key={label} style={{ display: "flex", alignItems: "center", padding: "16px 18px" }}>
            <div style={{ display: "grid", gap: 4, flex: 1 }}>
              <span style={{ fontSize: 14.5, color: app.muted }}>{label}</span>
              <span
                style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
              >
                {format(value * counted)}
              </span>
              <span style={{ fontSize: 13.5, color: good ? app.success : app.muted }}>{change} vs previous period</span>
            </div>
            <Sparkline seed={i} good={good} />
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 14 }}>
        <Card>
          <CardTitle aside={<Badge tone="danger">3 items</Badge>}>Needs attention</CardTitle>
          {attention.map(({ text, action }, i) => {
            const shown = settle(t, reveal.rows + i * 0.12, 20, 170)
            return (
              <div
                key={text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderTop: `1px solid ${app.border}`,
                  opacity: shown,
                  transform: `translateY(${(1 - shown) * 14}px)`
                }}
              >
                <span style={{ flex: 1, fontSize: 15.5 }}>{text}</span>
                <Button variant="outline" style={{ height: 34, fontSize: 14 }}>
                  {action}
                </Button>
              </div>
            )
          })}
        </Card>
        <Card style={{ paddingBottom: 6 }}>
          <CardTitle>Best sellers</CardTitle>
          <Table
            columns={[
              { label: "Product", width: 2.2 },
              { label: "Sold", width: 1, align: "right" },
              { label: "On hand", width: 1.1, align: "right" },
              { label: "Days of cover", width: 1.4, align: "right" },
              { label: "Status", width: 1.5 }
            ]}
            rows={sellers.map(({ name, sold, onHand, cover, status, tone }, i) => {
              const shown = settle(t, reveal.rows + 0.2 + i * 0.12, 20, 170)
              return {
                key: name,
                cells: [
                  name,
                  count(sold),
                  count(onHand),
                  cover,
                  <Badge key="status" tone={tone}>
                    {status}
                  </Badge>
                ],
                style: { opacity: shown, transform: `translateY(${(1 - shown) * 14}px)` }
              }
            })}
          />
        </Card>
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
          <AppWindow width={revealWindow.width} height={revealWindow.height} workspace={buyer.name} page="Overview">
            <Overview t={t} />
          </AppWindow>
        </div>
      </div>
    </Stage>
  )
}
