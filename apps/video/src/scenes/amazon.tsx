import { CircleCheck, Download, Globe, Package, TrendingDown, Warehouse } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { Easing } from "remotion"
import { buyer, count, orderUnits, ordered, split } from "../data"
import { mixed, ramp, settle } from "../motion"
import { app, font, stage } from "../theme"
import { moments, sections } from "../timeline"
import { lit } from "../type"
import { AppWindow, Badge, Button, Card, CardTitle, Table } from "../ui"
import { Feature, Shot } from "./feature"
import { PoPage, reorderEnd } from "./reorder"

const m = moments.amazon
const shipment = "FBA17K3Q2XD5"

const steps = [
  "Inbound plan created",
  "Packing confirmed",
  "Box contents sent",
  "Placement confirmed: 2 fulfillment centers",
  "Carrier booked",
  "Box labels ready"
]

// A step's mark: a turning ring while Amazon works on it, a check once it's done.
const StepMark = ({ t, at }: { t: number; at: number }) => {
  if (t >= at) {
    const done = settle(t, at, 12, 220)
    return <CircleCheck size={22} color="#fff" fill={app.success} style={{ transform: `scale(${0.6 + 0.4 * done})` }} />
  }
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" style={{ transform: `rotate(${t * 540}deg)` }}>
      <circle cx={11} cy={11} r={8} fill="none" stroke={app.border} strokeWidth={2.5} />
      <circle cx={11} cy={11} r={8} fill="none" stroke={app.primary} strokeWidth={2.5} strokeDasharray="14 40" />
    </svg>
  )
}

// A barcode that's the same every render, from a seed.
const Barcode = ({ seed, width, height }: { seed: number; width: number; height: number }) => {
  const bars = Array.from({ length: 34 }, (_, i) => 1 + ((i * 7 + seed * 13) % 4))
  const total = bars.reduce((sum, bar) => sum + bar * 2, 0)
  let x = 0
  return (
    <svg width={width} height={height} viewBox={`0 0 ${total} 10`} preserveAspectRatio="none">
      {bars.map((bar, i) => {
        const rect = <rect key={`${i}-${x}`} x={x} y={0} width={bar} height={10} fill="#111" />
        x += bar * 2
        return rect
      })}
    </svg>
  )
}

// An Amazon box label as it prints: the shipment's barcode, the box number, the destination.
export const BoxLabel = ({ box, style }: { box: number; style?: CSSProperties }) => (
  <div
    style={{
      display: "grid",
      gap: 7,
      width: 170,
      padding: 12,
      borderRadius: 8,
      background: "#fff",
      border: "1px solid #e4e4e7",
      boxShadow: "0 12px 30px -10px rgba(0, 0, 0, 0.35)",
      fontFamily: font.mono,
      color: "#111",
      ...style
    }}
  >
    <span style={{ fontSize: 10.5, fontWeight: 600 }}>FBA BOX LABEL</span>
    <Barcode seed={box} width={146} height={46} />
    <span style={{ fontSize: 10.5 }}>
      {shipment}U{String(box).padStart(6, "0")}
    </span>
    <span style={{ fontSize: 12, fontWeight: 600 }}>
      Box {box} of {split.fba.cartons}
    </span>
    <span style={{ display: "grid", gap: 3 }}>
      {[92, 70, 80].map((width) => (
        <span key={width} style={{ width: `${width}%`, height: 5, borderRadius: 2, background: "#d4d4d8" }} />
      ))}
    </span>
  </div>
)

const labelled = (t: number, i: number) => t >= m.labels[Math.min(i, m.labels.length - 1)]

// The shipment's page while Copacker creates it in Amazon: the steps, the labels, and the cartons they go on.
const ShipmentPage = ({ t }: { t: number }) => {
  const ready = t >= m.steps[m.steps.length - 1] + 0.2
  const rows = [
    { carton: 1, product: ordered[0], pieces: 24, size: "42 × 32 × 28", weight: "11.6" },
    { carton: 2, product: ordered[0], pieces: 24, size: "42 × 32 × 28", weight: "11.6" },
    { carton: 21, product: ordered[1], pieces: 12, size: "38 × 28 × 26", weight: "7.9" }
  ]
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Shipment 2 to Amazon FBA</span>
          {ready ? <Badge tone="success">Ready for pickup</Badge> : <Badge tone="primary">Creating shipment</Badge>}
        </div>
        <span style={{ fontSize: 16, color: app.muted }}>PO 1042 to Amazon FBA, {split.fba.cartons} cartons</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16 }}>
        <Card>
          <CardTitle>Creating the Amazon shipment</CardTitle>
          <div style={{ display: "grid", gap: 12 }}>
            {steps.map((step, i) => (
              <div
                key={step}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 16,
                  color: t >= m.steps[i] - 0.6 ? app.foreground : app.muted,
                  opacity: t >= m.steps[i] - 0.6 ? 1 : 0.45
                }}
              >
                <StepMark t={t} at={m.steps[i]} />
                {step}
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ position: "relative", overflow: "hidden" }}>
          <CardTitle
            aside={
              <Button variant="outline" icon={Download} style={{ height: 36, fontSize: 14.5 }}>
                Download labels
              </Button>
            }
          >
            Box labels
          </CardTitle>
          <div style={{ position: "relative", height: 230 }}>
            {m.labels.map((at, i) => {
              const printed = settle(t, at, 15, 190)
              return printed > 0 ? (
                <BoxLabel
                  key={at}
                  box={i + 1}
                  style={{
                    position: "absolute",
                    left: 40 + i * 30,
                    top: 8 + i * 5,
                    opacity: Math.min(1, printed * 2),
                    transform: `translateY(${(1 - printed) * -60}px) rotate(${(i - 2.5) * 3}deg)`
                  }}
                />
              ) : null
            })}
          </div>
        </Card>
      </div>
      <Card style={{ paddingBottom: 8 }}>
        <CardTitle>Carton overview</CardTitle>
        <Table
          columns={[
            { label: "Supplier carton", width: 1.2 },
            { label: "Product", width: 1.9 },
            { label: "Pieces", width: 0.8, align: "right" },
            { label: "Dimensions (cm)", width: 1.5, align: "right" },
            { label: "Weight (kg)", width: 1.1, align: "right" },
            { label: "Amazon label number", width: 2.4 }
          ]}
          rows={rows.map(({ carton, product, pieces, size, weight }, i) => ({
            key: String(carton),
            cells: [
              carton,
              product.name,
              pieces,
              size,
              weight,
              labelled(t, i * 2) ? (
                <span key="label" style={{ fontFamily: font.mono, fontSize: 15 }}>
                  {shipment}U{String(carton).padStart(6, "0")}
                </span>
              ) : (
                <span key="pending" style={{ color: app.muted }}>
                  Pending
                </span>
              )
            ]
          }))}
        />
      </Card>
    </div>
  )
}

type NodeProps = {
  icon: typeof Package
  title: string
  value: string
  detail: string
  shown: number
  style?: CSSProperties
}

// A stop in the split, as a glass card on the stage.
const SplitNode = ({ icon: Icon, title, value, detail, shown, style }: NodeProps) => (
  <div
    style={{
      position: "absolute",
      display: "grid",
      gap: 8,
      width: 360,
      padding: "22px 26px",
      borderRadius: 20,
      background: "rgba(24, 24, 27, 0.86)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      boxShadow: "0 30px 60px -20px rgba(0, 0, 0, 0.7)",
      color: stage.text,
      fontFamily: font.sans,
      opacity: Math.min(1, shown * 1.6),
      transform: `translate(-50%, -50%) scale(${0.85 + 0.15 * shown})`,
      ...style
    }}
  >
    <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 600 }}>
      <Icon size={22} color="#ff8a3d" strokeWidth={1.9} />
      {title}
    </span>
    <span style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-0.03em", ...lit }}>{value}</span>
    <span style={{ fontSize: 17, color: stage.muted }}>{detail}</span>
  </div>
)

// A branch of the split: a curve from the order down to a network, with light flowing along it.
const Branch = ({ t, d, drawn }: { t: number; d: string; drawn: number }) => (
  <>
    <path
      d={d}
      fill="none"
      stroke="rgba(255, 138, 61, 0.25)"
      strokeWidth={3}
      pathLength={1}
      strokeDasharray={`${drawn} 1`}
    />
    <path
      d={d}
      fill="none"
      stroke="#ff8a3d"
      strokeWidth={3}
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray="4 12"
      strokeDashoffset={-t * 40}
      opacity={drawn}
    />
  </>
)

// How the order splits between Amazon's networks, in step with the voice: each branch shoots out as its network is
// named, FBA and AWD in the US slide aside to make room as the voice turns to the offshore warehouses, and AWD in China
// and Vietnam lands on "China". Then what the split does to storage fees.
const Split = ({ t }: { t: number }) => {
  const order = settle(t, m.split, 16, 150)
  const fba = settle(t, m.fba, 16, 150)
  const awd = settle(t, m.awd, 16, 150)
  const offshore = settle(t, m.offshore, 14, 150)
  const fees = settle(t, m.fees, 18, 120)
  const spread = ramp(t, m.reflow, m.reflow + 0.9, Easing.inOut(Easing.cubic))
  const fbaX = mixed(640, 440, spread)
  const awdX = mixed(1280, 960, spread)
  const branch = (to: number) => `M 960 310 C 960 400, ${to} 400, ${to} 470`
  const reach = (at: number, time = 0.55) => ramp(t, at - time, at, Easing.out(Easing.cubic))
  const counted = (at: number, units: number) =>
    `${count(Math.round(units * ramp(t, at, at + 0.8, Easing.out(Easing.cubic))))} units`
  const shrink = (delay: number) => ramp(t, m.fees + delay, m.fees + delay + 1.1, Easing.inOut(Easing.cubic))
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <Branch t={t} d={branch(fbaX)} drawn={reach(m.fba)} />
        <Branch t={t} d={branch(awdX)} drawn={reach(m.awd)} />
        <Branch t={t} d={branch(1480)} drawn={reach(m.offshore, 0.7)} />
      </svg>
      <SplitNode
        icon={Package}
        title="PO 1042"
        value={`${count(orderUnits)} units`}
        detail="From Shenzhen Metalworks"
        shown={order}
        style={{ left: 960, top: 230 }}
      />
      <SplitNode
        icon={Warehouse}
        title="Amazon FBA"
        value={counted(m.fba, split.fba.units)}
        detail="Ready to sell"
        shown={fba}
        style={{ left: fbaX, top: 570 }}
      />
      <SplitNode
        icon={Warehouse}
        title="AWD in the US"
        value={counted(m.awd, split.awd.units)}
        detail="Refills FBA as it sells"
        shown={awd}
        style={{ left: awdX, top: 570 }}
      />
      <SplitNode
        icon={Globe}
        title="AWD in China and Vietnam"
        value={counted(m.offshore, split.offshore.units)}
        detail="Stored offshore, for less"
        shown={offshore}
        style={{
          left: 1480,
          top: 570,
          border: "1px solid rgba(255, 138, 61, 0.6)",
          boxShadow: `0 0 ${50 * offshore}px -10px rgba(245, 74, 0, 0.55), 0 30px 60px -20px rgba(0, 0, 0, 0.7)`
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 960,
          top: 845,
          display: "grid",
          gap: 12,
          width: 820,
          opacity: fees,
          transform: `translate(-50%, -50%) translateY(${(1 - fees) * 24}px)`,
          fontFamily: font.sans
        }}
      >
        <span
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 19, fontWeight: 600, color: stage.text }}
        >
          Monthly storage fees
          <TrendingDown size={22} color="#4ade80" />
        </span>
        {[
          { label: "Everything in FBA", width: 1, color: "rgba(250, 250, 250, 0.3)" },
          { label: "FBA and AWD", width: mixed(1, 0.56, shrink(0.3)), color: "rgba(255, 122, 46, 0.6)" },
          { label: "With AWD offshore", width: mixed(1, 0.3, shrink(0.9)), color: "#ff7a2e" }
        ].map(({ label, width, color }) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 16.5, color: stage.muted }}>{label}</span>
            <span style={{ height: 14, borderRadius: 7, background: "rgba(250, 250, 250, 0.08)" }}>
              <span
                style={{
                  display: "block",
                  width: `${width * 100}%`,
                  height: "100%",
                  borderRadius: 7,
                  background: color
                }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/// 0:46 to 1:04, Amazon: the purchase order carries over from the last chapter and turns into its Amazon shipment, which
// Copacker creates and labels. Then the shipment folds back into the order, which splits between FBA, AWD in the US and
// AWD in China and Vietnam to cut storage fees.
export const Amazon = ({ t }: { t: number }): ReactNode => {
  const carried = settle(t, 0, 17, 105)
  const shipmentShown = ramp(t, m.window, m.window + 0.45)
  // The camera leans in on the steps while the headline is up, then pushes in on the labels as they print.
  const onSteps = ramp(t, m.steps[0] - 0.6, m.steps[0])
  const toLabels = ramp(t, m.labels[0] - 0.8, m.labels[0] - 0.2)
  // Then the window folds away into the order's card at the top of the split.
  const folding = ramp(t, m.split - 0.55, m.split + 0.15)
  const faded = ramp(t, m.split - 0.25, m.split + 0.15)
  return (
    <Feature
      t={t}
      number="03"
      name="Amazon"
      lines={["Amazon", "shipments,", "automated."]}
      accented={["automated."]}
      headlineAt={0.5}
      out={m.out}
      headlineOut={m.labels[0] - 0.9}
      exit="zoom"
    >
      {faded < 1 ? (
        <Shot
          t={t}
          at={0}
          from={reorderEnd}
          x={1262}
          y={570}
          zoom={mixed(mixed(0.12 * onSteps, 0.32, toLabels), -0.7, folding)}
          focus={{ x: mixed(mixed(28, 76, toLabels), 50, folding), y: mixed(40, 50, folding) }}
          shift={{ x: mixed(-250 * toLabels, 960 - 1262, folding), y: mixed(0, 230 - 570, folding) }}
          style={folding > 0 ? { opacity: 1 - faded, filter: `blur(${Math.sin(Math.PI * folding) * 6}px)` } : undefined}
        >
          <AppWindow
            width={1180}
            height={mixed(790, 800, carried)}
            workspace={buyer.name}
            page={shipmentShown < 0.5 ? "Purchase orders" : "Shipments"}
          >
            <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - shipmentShown }}>
              {shipmentShown < 1 ? (
                <PoPage
                  t={sections.reorder.to - sections.reorder.from}
                  status={{ label: "With supplier", tone: "primary" }}
                  lines={moments.reorder.lines}
                  submit={moments.reorder.submit}
                />
              ) : null}
            </div>
            <div
              style={{
                position: "absolute",
                inset: "26px 30px",
                opacity: shipmentShown,
                transform: `translateX(${(1 - shipmentShown) * 40}px)`
              }}
            >
              {shipmentShown > 0 ? <ShipmentPage t={t} /> : null}
            </div>
          </AppWindow>
        </Shot>
      ) : null}
      {t >= m.split - 0.1 ? <Split t={t} /> : null}
    </Feature>
  )
}
