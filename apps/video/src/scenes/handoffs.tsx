import { CircleCheck, Download, Factory, FileText, Ship, Truck, User } from "lucide-react"
import { type CSSProperties, type ReactNode, useContext } from "react"
import { Easing } from "remotion"
import { buyer, count, forwarder, ordered, supplier } from "../data"
import { glide, mixed, pressed, ramp, settle, since } from "../motion"
import { Clock } from "../stage"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Badge, Button, Card, CardTitle, Checkbox, Cursor, ringFor, Table, Tag } from "../ui"
import { Feature } from "./feature"
import { Route } from "./reorder"

const m = moments.handoffs

const requirements = [
  "One SKU per carton for AWD",
  "Suffocation warning on poly bags",
  "FNSKU label on every unit",
  "Cartons under 22.7 kg (50 lb)"
]

const documents = [
  "Purchase order",
  "Commercial invoice",
  "Packing list",
  "Packing checklist",
  "Carton label",
  "Shipping label"
]

// The supplier's side: Amazon's requirements to check off, and the labels to download.
const SupplierView = ({ t }: { t: number }) => {
  const downloaded = t >= m.download + 0.25
  const cursor = glide(t, [
    { at: m.supplier, x: 820, y: 700 },
    { at: m.download - 0.15, x: 1000, y: 616 },
    { at: m.download + 0.4, x: 1000, y: 616 },
    { at: m.checklist[0] - 0.1, x: 322, y: 262 },
    { at: m.checklist[3], x: 322, y: 424 },
    { at: m.forwarder, x: 700, y: 700 }
  ])
  const tick = (i: number) => (t >= m.checklist[i] ? settle(t, m.checklist[i], 12, 240) : 0)
  return (
    <>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
          <span style={{ fontSize: 16, color: app.muted }}>from {buyer.name}</span>
          <Badge tone="primary">Packing</Badge>
        </div>
        <Card>
          <CardTitle>Packing checklist</CardTitle>
          <div style={{ display: "grid", gap: 4 }}>
            {requirements.map((requirement, i) => (
              <div
                key={requirement}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 0",
                  borderTop: i > 0 ? `1px solid ${app.border}` : undefined,
                  fontSize: 17
                }}
              >
                <Checkbox checked={tick(i)} />
                <span style={{ color: tick(i) > 0.5 ? app.foreground : app.muted }}>{requirement}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
          <FileText size={22} strokeWidth={1.8} color={app.muted} />
          <span style={{ flex: 1, fontSize: 17, fontWeight: 500 }}>Carton labels</span>
          {downloaded ? (
            <>
              <span style={{ fontSize: 15, color: app.muted }}>PO-1042-carton-labels.pdf</span>
              <Badge tone="success">Downloaded</Badge>
            </>
          ) : (
            <Button icon={Download} press={pressed(t, m.download)} ring={ringFor(t, m.download)}>
              Download labels
            </Button>
          )}
        </Card>
      </div>
      {t >= m.supplier && t < m.forwarder + 0.3 ? (
        <Cursor
          x={cursor.x - 250}
          y={cursor.y - 56}
          clicked={since(t, m.checklist.find((at) => t >= at && t < at + 0.5) ?? m.download)}
          fill="#1d4ed8"
        />
      ) : null}
    </>
  )
}

// The forwarder's side: the order without prices, and the form that marks it shipped.
const ForwarderView = ({ t }: { t: number }) => {
  const shipped = t >= m.shipped + 0.25
  const cursor = glide(t, [
    { at: m.forwarder, x: 800, y: 720 },
    { at: m.shipped - 0.1, x: 1030, y: 560 },
    { at: m.buyer, x: 1030, y: 560 },
    { at: m.buyer + 0.6, x: 800, y: 720 }
  ])
  return (
    <>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
          {shipped ? (
            <Badge tone="success">Shipped by forwarder</Badge>
          ) : (
            <Badge tone="primary">Ready for pickup</Badge>
          )}
        </div>
        <Route />
        <Card style={{ paddingBottom: 8 }}>
          <Table
            columns={[
              { label: "Products", width: 2.4 },
              { label: "Qty", width: 1, align: "right" }
            ]}
            rows={ordered.map((line) => ({ key: line.sku, cells: [line.name, count(line.order)] }))}
          />
        </Card>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", alignItems: "end", gap: 16 }}>
          {[
            ["Carrier", "Ocean freight"],
            ["Tracking or booking number", "PLL-240917"]
          ].map(([label, value]) => (
            <span key={label} style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 14, color: app.muted }}>{label}</span>
              <span style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${app.border}`, fontSize: 16 }}>
                {value}
              </span>
            </span>
          ))}
          <Button icon={Truck} press={pressed(t, m.shipped)} ring={ringFor(t, m.shipped)}>
            Mark shipped
          </Button>
        </Card>
      </div>
      {t >= m.forwarder && t < m.buyer + 0.8 ? (
        <Cursor x={cursor.x - 250} y={cursor.y - 56} clicked={since(t, m.shipped)} fill="#047857" />
      ) : null}
    </>
  )
}

// The buyer's side: every update landing on the order's timeline, and every document in one place.
export const BuyerView = ({ t }: { t: number }) => {
  const shipped = t >= m.shipped + 0.4
  const events = [
    { at: -1, text: `Packing list submitted by ${supplier.name}` },
    { at: m.download + 0.3, text: `Carton labels downloaded by ${supplier.name}` },
    { at: m.checklist[3] + 0.3, text: `Packing checklist completed by ${supplier.name}` },
    { at: m.shipped + 0.4, text: `Shipped by ${forwarder.name}` }
  ]
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
        {shipped ? <Badge tone="success">Shipped by forwarder</Badge> : <Badge tone="primary">Packing</Badge>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <Card>
          <CardTitle>Timeline</CardTitle>
          <div style={{ display: "grid", gap: 12 }}>
            {events
              .filter(({ at }) => t >= at)
              .map(({ at, text }) => {
                const shown = settle(t, at, 18, 180)
                return (
                  <div
                    key={text}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      fontSize: 16,
                      opacity: at < 0 ? 1 : shown,
                      transform: `translateY(${at < 0 ? 0 : (1 - shown) * 14}px)`
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: app.primary, flex: "none" }} />
                    {text}
                  </div>
                )
              })}
          </div>
        </Card>
        <Card>
          <CardTitle>Documents</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            {documents.map((document, i) => {
              const ready = t >= m.documents[i]
              const pop = ready ? settle(t, m.documents[i], 12, 240) : 0
              return (
                <div key={document} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
                  {ready ? (
                    <CircleCheck
                      size={20}
                      color="#fff"
                      fill={app.success}
                      style={{ transform: `scale(${0.6 + 0.4 * pop})` }}
                    />
                  ) : (
                    <FileText size={20} color={app.muted} strokeWidth={1.8} />
                  )}
                  <span style={{ color: ready ? app.foreground : app.muted }}>{document}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

type Pose = { x: number; y: number; turn: number; scale: number }

// Where a party's window sits when it's in focus. The buyer's ends the chapter there, for the agents chapter to carry on
// from.
export const handoffsEnd = { x: 960, y: 590, turn: 0, scale: 0.94, tilt: 0 }

// One party's window: its pose on the arc, drawn toward the middle when it's in focus and pushed back when another is.
const Party = ({
  t,
  at,
  rest,
  focus,
  dim,
  gone = 0,
  tag,
  children
}: {
  t: number
  at: number
  rest: Pose
  focus: number
  dim: number
  // How far it has faded out at the end of the chapter.
  gone?: number
  tag: ReactNode
  children: ReactNode
}) => {
  const arrived = settle(t, at, 17, 110)
  const sway = Math.sin(useContext(Clock) * 0.55) * 1.2
  const pose = {
    x: mixed(rest.x, handoffsEnd.x, focus),
    y: mixed(rest.y, handoffsEnd.y, focus),
    turn: mixed(rest.turn, handoffsEnd.turn, focus),
    scale: mixed(rest.scale, handoffsEnd.scale, focus) * (1 - 0.12 * dim)
  }
  const style: CSSProperties = {
    position: "absolute",
    left: pose.x,
    top: pose.y + (1 - arrived) * 120,
    zIndex: focus > 0.5 ? 2 : 1,
    opacity: Math.min(1, arrived * 1.8) * (1 - 0.55 * dim) * (1 - gone),
    filter: dim > 0.05 ? `blur(${dim * 3}px)` : undefined,
    perspective: 2600
  }
  return (
    <div style={style}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -(windowSize.height * pose.scale) / 2 - 66,
          transform: "translateX(-50%)"
        }}
      >
        {tag}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(-50%, -50%) rotateY(${pose.turn + sway}deg) scale(${pose.scale})`
        }}
      >
        {children}
      </div>
    </div>
  )
}

const windowSize = { width: 1060, height: 700 }

// 1:04 to 1:18, handoffs: buyer, supplier and forwarder each in their own workspace, all on the same order. The
// supplier downloads labels and checks off Amazon's requirements, the forwarder marks it shipped, and the buyer sees it
// all, with every document in one place. The buyer's window stays for the agents chapter as the others fade.
export const Handoffs = ({ t }: { t: number }) => {
  const toSupplier = settle(t, m.supplier, 18, 120)
  const toForwarder = settle(t, m.forwarder, 18, 120)
  const toBuyer = settle(t, m.buyer, 18, 120)
  const supplierFocus = toSupplier * (1 - toForwarder)
  const forwarderFocus = toForwarder * (1 - toBuyer)
  const buyerFocus = toBuyer
  const links = ramp(t, m.links, m.links + 0.8, Easing.out(Easing.cubic)) * (1 - toSupplier)
  const gone = ramp(t, m.out, m.out + 0.4)
  return (
    <Feature
      t={t}
      number="04"
      name="Handoffs"
      lines={["Every handoff,", "in one place."]}
      accented={["one", "place."]}
      out={m.out}
      headlineOut={m.supplier - 0.3}
      exit="none"
    >
      <svg width={1920} height={1080} style={{ position: "absolute", opacity: links }}>
        {["M 640 620 C 720 560, 800 560, 860 600", "M 1060 600 C 1120 560, 1200 560, 1280 620"].map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#ff8a3d"
            strokeWidth={4}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="5 9"
            strokeDashoffset={-t * 60}
          />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0 }}>
        <Party
          t={t}
          at={m.windows[0]}
          rest={{ x: 450, y: 640, turn: 24, scale: 0.55 }}
          focus={buyerFocus}
          dim={supplierFocus + forwarderFocus}
          tag={
            <Tag icon={User} style={{ opacity: 1 - gone }}>
              You
            </Tag>
          }
        >
          <AppWindow {...windowSize} workspace={buyer.name} page="Purchase orders">
            <BuyerView t={t} />
          </AppWindow>
        </Party>
        <Party
          t={t}
          at={m.windows[2]}
          rest={{ x: 1470, y: 640, turn: -24, scale: 0.55 }}
          focus={forwarderFocus}
          dim={supplierFocus + buyerFocus}
          gone={gone}
          tag={<Tag icon={Ship}>{forwarder.short}</Tag>}
        >
          <AppWindow {...windowSize} workspace={forwarder.name} kind="Forwarder" page="Purchase orders">
            <ForwarderView t={t} />
          </AppWindow>
        </Party>
        <Party
          t={t}
          at={m.windows[1]}
          rest={{ x: 960, y: 640, turn: 0, scale: 0.61 }}
          focus={supplierFocus}
          dim={forwarderFocus + buyerFocus}
          gone={gone}
          tag={<Tag icon={Factory}>{supplier.name}</Tag>}
        >
          <AppWindow {...windowSize} workspace={supplier.name} kind="Supplier" page="Purchase orders">
            <SupplierView t={t} />
          </AppWindow>
        </Party>
      </div>
    </Feature>
  )
}
