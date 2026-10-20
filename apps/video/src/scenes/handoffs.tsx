import { Download, Factory, FileText, PackageCheck, Ship, User } from "lucide-react"
import { type CSSProperties, Fragment, type ReactNode, useContext } from "react"
import { Easing } from "remotion"
import { buyer, forwarder, ordered, reference, split, supplier } from "../data"
import { glide, mixed, pressed, ramp, settle, since } from "../motion"
import { Clock } from "../stage"
import { app } from "../theme"
import { moments } from "../timeline"
import {
  Alert,
  AppWindow,
  Button,
  Card,
  CardTitle,
  Checkbox,
  Cursor,
  PageHeader,
  ringFor,
  Status,
  Table,
  Tag
} from "../ui"
import { Feature } from "./feature"
import { Route } from "./reorder"

const m = moments.handoffs

// Amazon's rules the cartons follow, as the packing checklist in the supplier's packet lists them.
const requirements = [
  "One SKU per AWD US carton",
  "FNSKU label on every unit",
  "Suffocation warning on polybags",
  "Cartons at most 22.67 kg (50 lb)"
]

// The supplier's side: the shipment's packet ready to download, and the checklist to work through.
const SupplierView = ({ t }: { t: number }) => {
  const cursor = glide(t, [
    { at: m.supplier, x: 820, y: 640 },
    { at: m.download - 0.15, x: 928, y: 178 },
    { at: m.download + 0.4, x: 928, y: 178 },
    { at: m.checklist[0] - 0.1, x: 312, y: 316 },
    { at: m.checklist[3], x: 312, y: 448 },
    { at: m.forwarder, x: 700, y: 640 }
  ])
  const tick = (i: number) => (t >= m.checklist[i] ? settle(t, m.checklist[i], 12, 240) : 0)
  return (
    <>
      <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
        <PageHeader parents={["Orders", reference]} title="Shipment 2" badge={<Status status="ready" />} />
        <Alert
          icon={PackageCheck}
          iconColor={app.primary}
          title="Supplier packet ready"
          description="Print labels at actual size"
          style={{ boxShadow: "inset 0 0 0 1px oklch(0.646 0.222 41.116 / 0.4)" }}
          action={
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              press={pressed(t, m.download)}
              ring={ringFor(t, m.download)}
            >
              Download packet
            </Button>
          }
        />
        <Card style={{ padding: 18 }}>
          <CardTitle>Packing checklist</CardTitle>
          {requirements.map((requirement, i) => (
            <div
              key={requirement}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                height: 44,
                borderTop: i > 0 ? `1px solid ${app.border}` : undefined
              }}
            >
              <Checkbox checked={tick(i)} />
              <span style={{ color: tick(i) > 0.5 ? app.foreground : app.muted }}>{requirement}</span>
            </div>
          ))}
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

// A document to download, as the app lists them: its kind, the file's name under it, and the download button.
const DocumentRow = ({ kind, file, style }: { kind: string; file: string; style?: CSSProperties }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 54, ...style }}>
    <FileText size={18} color={app.muted} style={{ flex: "none" }} />
    <span style={{ display: "grid", flex: 1, minWidth: 0, lineHeight: 1.35 }}>
      <span style={{ fontWeight: 500 }}>{kind}</span>
      <span
        style={{ overflow: "hidden", fontSize: 13.5, color: app.muted, textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {file}
      </span>
    </span>
    <Download size={18} color={app.muted} style={{ flex: "none" }} />
  </div>
)

// The forwarder's side: the order without prices, its shipment to move on, and the documents it ships with.
const ForwarderView = ({ t }: { t: number }) => {
  const shipped = t >= m.shipped + 0.25
  const cursor = glide(t, [
    { at: m.forwarder, x: 800, y: 640 },
    { at: m.shipped - 0.1, x: 953, y: 470 },
    { at: m.buyer, x: 953, y: 470 },
    { at: m.buyer + 0.6, x: 800, y: 640 }
  ])
  return (
    <>
      <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
        <PageHeader parents={["Purchase orders"]} title={reference} badge={<Status status="submitted" />} />
        <div style={{ display: "grid", gap: 18 }}>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${app.border}` }}>
              <Route />
            </div>
            <Table
              small
              inset={14}
              columns={[
                { label: "Products", width: 3 },
                { label: "Qty", width: 1, align: "right" }
              ]}
              rows={ordered.map((line, i) => ({
                key: line.sku,
                cells: [
                  <span key="name" style={{ display: "grid", lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 500 }}>{line.name}</span>
                    <span style={{ fontSize: 13.5, color: app.muted }}>
                      {line.sku}, to Amazon {i === 0 ? "FBA" : "AWD US"}
                    </span>
                  </span>,
                  line.order.toLocaleString("en-US")
                ],
                style: { minHeight: 62 }
              }))}
            />
          </Card>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 12px", fontSize: 17, fontWeight: 500 }}>Shipments</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                height: 66,
                padding: "0 16px",
                borderTop: `1px solid ${app.border}`
              }}
            >
              <span style={{ display: "grid", flex: 1, lineHeight: 1.35 }}>
                <span style={{ fontWeight: 500 }}>Shipment 2 to Amazon FBA</span>
                <span style={{ fontSize: 13.5, color: app.muted }}>
                  {split.fba.cartons} cartons{shipped ? ", Ocean freight PLL-240917" : ""}
                </span>
              </span>
              <Status status={shipped ? "forwarded" : "shipped"} />
              {shipped ? null : (
                <Button size="sm" press={pressed(t, m.shipped)} ring={ringFor(t, m.shipped)}>
                  Mark shipped
                </Button>
              )}
            </div>
          </Card>
          <Card style={{ padding: "16px 16px 4px" }}>
            <CardTitle>Documents</CardTitle>
            <DocumentRow kind="Commercial invoice" file="CI-1042.pdf" />
            <DocumentRow kind="Packing list" file="Packing list.pdf" style={{ borderTop: `1px solid ${app.border}` }} />
          </Card>
        </div>
      </div>
      {t >= m.forwarder && t < m.buyer + 0.8 ? (
        <Cursor x={cursor.x - 250} y={cursor.y - 56} clicked={since(t, m.shipped)} fill="#047857" />
      ) : null}
    </>
  )
}

// A person's initials on the timeline, in Copacker's orange.
const Initials = ({ name }: { name: string }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: 32,
      height: 32,
      borderRadius: 16,
      background: "oklch(0.646 0.222 41.116 / 0.15)",
      color: app.primary,
      fontSize: 13,
      fontWeight: 600
    }}
  >
    {name
      .split(" ")
      .map((part) => part[0])
      .join("")}
  </span>
)

type Entry = { at: number; time: string; text: string; author?: string }

// What happens on the order, newest first, as it lands: the supplier's update in its own words, then each shipment
// event. The purchase order went to the supplier on an earlier day.
const entries: readonly Entry[] = [
  {
    at: m.shipped + 0.4,
    time: "4:12 PM",
    text: `${forwarder.name} shipped the goods: Ocean freight PLL-240917`
  },
  { at: m.checklist[3] + 0.3, time: "2:05 PM", text: "Supplier shipped the goods" },
  {
    at: m.download + 0.3,
    time: "11:40 AM",
    text: "Packet printed. Labels go on this afternoon.",
    author: supplier.person.name
  }
]

// Every document on the order, in the order they're made: the purchase order's own, then the shipment's.
const documents = [
  { kind: "Purchase order", file: `${reference}.pdf` },
  { kind: "Commercial invoice", file: "CI-1042.pdf" },
  { kind: "Packing list", file: "Packing list.pdf" },
  { kind: "Packing checklist", file: "Packing checklist.pdf" },
  { kind: "Carton label 1", file: "FBA17K3Q2XD5U000001.pdf" },
  { kind: "Shipping label", file: "Shipping labels.pdf" }
]

// The buyer's side: every update landing on the order's timeline, and every document in one place.
export const BuyerView = ({ t }: { t: number }) => {
  const landed = entries.filter(({ at }) => t >= at)
  return (
    <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
      <PageHeader parents={["Purchase orders"]} title={reference} badge={<Status status="submitted" />} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          alignItems: "start",
          gap: 22
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Timeline</span>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Initials name={buyer.person.name} />
            <span
              style={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                boxShadow: `inset 0 0 0 1px ${app.border}`,
                color: app.muted
              }}
            >
              Leave a comment…
            </span>
          </span>
          <div style={{ position: "relative", display: "grid", gap: 20, paddingLeft: 44 }}>
            <span style={{ position: "absolute", top: 4, bottom: 4, left: 15, width: 2, background: app.border }} />
            {[
              { day: "Tuesday, November 10, 2026", items: landed },
              {
                day: "Monday, September 14, 2026",
                items: [{ at: -1, time: "9:12 AM", text: "Purchase order submitted to supplier" }]
              }
            ].map(({ day, items }) =>
              items.length ? (
                <div key={day} style={{ display: "grid", gap: 12 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: app.muted }}>{day}</span>
                  {items.map(({ at, time, text, author }) => {
                    const shown = at < 0 ? 1 : settle(t, at, 18, 180)
                    const arrival: CSSProperties = { opacity: shown, transform: `translateY(${(1 - shown) * -12}px)` }
                    return author ? (
                      <div key={text} style={{ display: "flex", gap: 12, marginLeft: -44, ...arrival }}>
                        <Initials name={author} />
                        <span
                          style={{
                            display: "grid",
                            flex: 1,
                            gap: 3,
                            padding: "9px 13px",
                            borderRadius: 10,
                            background: "oklch(0.97 0 0 / 0.6)"
                          }}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <span style={{ fontWeight: 500 }}>
                              {author}
                              <span style={{ fontWeight: 400, color: app.muted }}> at {supplier.name}</span>
                            </span>
                            <span style={{ fontSize: 13.5, color: app.muted, whiteSpace: "nowrap" }}>{time}</span>
                          </span>
                          {text}
                        </span>
                      </div>
                    ) : (
                      <span key={text} style={{ position: "relative", display: "flex", gap: 12, ...arrival }}>
                        <span
                          style={{
                            position: "absolute",
                            top: 6,
                            left: -35,
                            width: 12,
                            height: 12,
                            borderRadius: 6,
                            border: `2px solid ${app.background}`,
                            background: "oklch(0.556 0 0 / 0.5)"
                          }}
                        />
                        <span style={{ flex: 1 }}>{text}</span>
                        <span style={{ paddingTop: 2, fontSize: 13.5, color: app.muted, whiteSpace: "nowrap" }}>
                          {time}
                        </span>
                      </span>
                    )
                  })}
                </div>
              ) : null
            )}
          </div>
        </div>
        <Card style={{ padding: "16px 16px 4px" }}>
          <CardTitle>Documents</CardTitle>
          {documents.map(({ kind, file }, i) => {
            const pop = t >= m.documents[i] ? settle(t, m.documents[i], 14, 220) : 0
            return (
              <Fragment key={kind}>
                {i === 1 ? (
                  <span
                    style={{
                      display: "block",
                      padding: "10px 0 2px",
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: app.muted,
                      opacity: pop
                    }}
                  >
                    Shipment 2
                  </span>
                ) : null}
                <DocumentRow
                  kind={kind}
                  file={file}
                  style={{
                    borderTop: i > 1 ? `1px solid ${app.border}` : undefined,
                    opacity: pop,
                    transform: `translateX(${(1 - pop) * 16}px)`
                  }}
                />
              </Fragment>
            )
          })}
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
// supplier downloads its packet and checks off Amazon's requirements, the forwarder marks it shipped, and the buyer sees
// it all, with every document in one place. The buyer's window stays for the agents chapter as the others fade.
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
          <AppWindow {...windowSize} workspace={buyer} page="Purchase orders">
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
          <AppWindow {...windowSize} workspace={forwarder} page="Purchase orders">
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
          <AppWindow {...windowSize} workspace={supplier} page="Shipments">
            <SupplierView t={t} />
          </AppWindow>
        </Party>
      </div>
    </Feature>
  )
}
