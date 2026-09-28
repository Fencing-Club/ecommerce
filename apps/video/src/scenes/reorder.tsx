import { ChevronRight, CircleCheck, Factory, FileText, Send, Ship, User, Warehouse } from "lucide-react"
import type { ReactNode } from "react"
import { buyer, cartonTotal, count, forwarder, money, orderTotal, orderUnits, ordered, supplier } from "../data"
import { glide, mixed, pressed, ramp, settle, since } from "../motion"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Badge, Button, Card, CardTitle, Cursor, ringFor, Table, Tag, Toast, type Tone } from "../ui"
import { Feature, Shot } from "./feature"
import { RestockPage } from "./forecast"

const m = moments.reorder

const Pill = ({ icon: Icon, children }: { icon: typeof Factory; children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 14px",
      borderRadius: 999,
      border: `1px solid ${app.border}`,
      fontSize: 15.5,
      fontWeight: 500,
      whiteSpace: "nowrap"
    }}
  >
    <Icon size={17} strokeWidth={1.8} color={app.muted} />
    {children}
  </span>
)

// Supplier, forwarder stop, destination: the route every purchase order shows.
export const Route = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Pill icon={Factory}>{supplier.name}</Pill>
    <ChevronRight size={18} color={app.muted} />
    <Pill icon={Ship}>{forwarder.name}</Pill>
    <ChevronRight size={18} color={app.muted} />
    <Pill icon={Warehouse}>Amazon FBA and AWD</Pill>
  </div>
)

type PoProps = {
  t: number
  // The status badge, and the moments its lines arrive and Submit is clicked (or never, for a finished order).
  status: { label: string; tone: Tone }
  lines?: readonly number[]
  submit?: number
  action?: string
}

// A purchase order's page: its header and route, its products and totals, and its details.
export const PoPage = ({ t, status, lines = [-1, -1], submit, action = "Submit to supplier" }: PoProps) => (
  <div style={{ display: "grid", gap: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
      <Badge tone={status.tone}>{status.label}</Badge>
      <span style={{ flex: 1 }} />
      <Button variant="outline" icon={FileText}>
        Download PO
      </Button>
      <Button
        icon={Send}
        press={submit === undefined ? 0 : pressed(t, submit)}
        ring={submit === undefined ? 0 : ringFor(t, submit)}
      >
        {action}
      </Button>
    </div>
    <Route />
    <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16 }}>
      <Card style={{ paddingBottom: 8 }}>
        <CardTitle>Products</CardTitle>
        <Table
          columns={[
            { label: "Products", width: 2 },
            { label: "Supplier SKU", width: 1.3 },
            { label: "Qty", width: 0.9, align: "right" },
            { label: "Cost", width: 0.9, align: "right" },
            { label: "Total", width: 1.1, align: "right" }
          ]}
          rows={[
            ...ordered.map((line, i) => {
              const shown = settle(t, lines[i], 20, 180)
              return {
                key: line.sku,
                cells: [
                  line.name,
                  line.sku,
                  count(line.order),
                  `$${line.cost.toFixed(2)}`,
                  money(line.order * line.cost)
                ],
                style: { opacity: shown, transform: `translateY(${(1 - shown) * 14}px)` }
              }
            }),
            {
              key: "total",
              cells: [
                <span key="label" style={{ fontWeight: 600 }}>
                  Total
                </span>,
                "",
                <span key="units" style={{ fontWeight: 600 }}>
                  {count(orderUnits)}
                </span>,
                "",
                <span key="value" style={{ fontWeight: 600 }}>
                  {money(orderTotal)}
                </span>
              ],
              style: { borderBottom: "none", opacity: settle(t, lines[lines.length - 1] + 0.15, 20, 180) }
            }
          ]}
        />
      </Card>
      <Card style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <CardTitle>Purchase order details</CardTitle>
        {[
          ["Required by", "Dec 1"],
          ["Payment terms", "30% deposit, 70% before shipping"],
          ["Currency", "USD"],
          ["Cartons", `${count(cartonTotal)} planned`]
        ].map(([label, value]) => (
          <div key={label} style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 14, color: app.muted }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </Card>
    </div>
  </div>
)

const cartons = [
  { range: "1 to 20", product: ordered[0], size: "42 × 32 × 28", weight: "11.6" },
  { range: "21 to 105", product: ordered[0], size: "42 × 32 × 28", weight: "11.6" },
  { range: "106 to 130", product: ordered[1], size: "38 × 28 × 26", weight: "7.9" },
  { range: "131 to 160", product: ordered[1], size: "38 × 28 × 26", weight: "7.9" }
]

// The supplier's side of the same order: the invoice they've uploaded and the cartons they're packing.
const PackingPage = ({ t }: { t: number }) => (
  <div style={{ display: "grid", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
      <span style={{ fontSize: 16, color: app.muted }}>from {buyer.name}</span>
      <Badge tone="primary">Packing</Badge>
      <span style={{ flex: 1 }} />
      <Button icon={CircleCheck} press={pressed(t, m.packed)} ring={ringFor(t, m.packed)}>
        Submit packing list
      </Button>
    </div>
    <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
      <FileText size={22} strokeWidth={1.8} color={app.muted} />
      <span style={{ flex: 1, fontSize: 16.5, fontWeight: 500 }}>Official commercial invoice</span>
      <span style={{ fontSize: 15.5, color: app.muted }}>CI-1042.pdf</span>
      <Badge tone="success">Uploaded</Badge>
    </Card>
    <Card style={{ paddingBottom: 8 }}>
      <CardTitle aside={<span style={{ fontSize: 15, color: app.muted }}>160 cartons, {count(orderUnits)} units</span>}>
        Cartons
      </CardTitle>
      <Table
        columns={[
          { label: "Cartons", width: 1.2 },
          { label: "Product", width: 2 },
          { label: "Units", width: 1, align: "right" },
          { label: "Dimensions (cm)", width: 1.6, align: "right" },
          { label: "Weight (kg)", width: 1.1, align: "right" }
        ]}
        rows={cartons.map(({ range, product, size, weight }, i) => {
          const shown = settle(t, m.cartons[i], 20, 180)
          return {
            key: range,
            cells: [range, product.name, `${product.caseOf} each`, size, weight],
            style: { opacity: shown, transform: `translateX(${(1 - shown) * -20}px)` }
          }
        })}
      />
    </Card>
  </div>
)

/// Where the buyer's window rests when the chapter ends, pushed back behind the supplier's, for the Amazon chapter to
// carry on from.
export const reorderEnd = { x: 1262 - 390, y: 580 - 30, turn: -9, scale: 1, dim: 1 }

// 0:36 to 0:46, reorder: one click turns the restock into a purchase order, one more sends it to the supplier, and the
// supplier packs it in their own workspace. The camera pushes in on each button as it's clicked.
export const Reorder = ({ t }: { t: number }) => {
  const checked = settle(t, 0.7, 14, 220)
  const poShown = settle(t, m.reorder + 0.3, 20, 150)
  const restockGone = ramp(t, m.reorder + 0.15, m.reorder + 0.45)
  const sent = t >= m.submit + 0.25
  const partner = settle(t, m.supplier, 16, 100)
  // The camera leans in on Reorder while the headline is up, pushes closer once it's gone, and pans up to Submit.
  const buyerIn = ramp(t, m.reorder - 0.8, m.reorder - 0.2) * (1 - ramp(t, m.supplier - 0.6, m.supplier))
  const closer = ramp(t, m.lines[0] + 0.3, m.lines[0] + 0.9)
  const buyerZoom = buyerIn * mixed(0.1, 0.3, closer)
  const toSubmit = ramp(t, m.reorder + 0.4, m.lines[0] + 0.6)
  // On the supplier's side it pushes in on the cartons as they fill, then pans up to Submit packing list.
  const supplierZoom =
    0.26 * ramp(t, m.cartons[0] - 0.2, m.cartons[0] + 0.3) * (1 - ramp(t, m.packed + 0.6, m.packed + 1.1))
  const toPacked = ramp(t, m.cartons[3] + 0.2, m.packed - 0.3)
  const buyerCursor = glide(t, [
    { at: 0.5, x: 900, y: 700 },
    { at: 1.3, x: 1075, y: 292 },
    { at: 1.9, x: 1075, y: 292 },
    { at: 3.4, x: 1050, y: 110 },
    { at: 4.2, x: 1050, y: 110 },
    { at: 4.8, x: 820, y: 520 }
  ])
  const supplierCursor = glide(t, [
    { at: 5.4, x: 900, y: 640 },
    { at: 7.6, x: 950, y: 108 },
    { at: 8.6, x: 950, y: 108 },
    { at: 9.2, x: 760, y: 420 }
  ])
  const toast = settle(t, m.submit + 0.3, 18, 170) * (1 - ramp(t, m.supplier - 0.4, m.supplier))
  const packedToast = settle(t, m.packed + 0.3, 18, 170)
  const tagsGone = ramp(t, m.out, m.out + 0.3)
  return (
    <Feature
      t={t}
      number="02"
      name="Purchase orders"
      lines={["Reorder in", "one click."]}
      accented={["one", "click."]}
      out={m.out}
      headlineOut={m.lines[0] + 0.2}
      exit="none"
    >
      <Shot
        t={t}
        at={0.05}
        whipIn
        x={1262}
        y={580}
        zoom={buyerZoom}
        focus={{ x: mixed(91, 89, toSubmit), y: mixed(37, 14, toSubmit) }}
        shift={{ x: (reorderEnd.x - 1262) * partner - 80 * closer * buyerIn, y: (reorderEnd.y - 580) * partner }}
        dim={partner}
      >
        <AppWindow
          width={1180}
          height={790}
          workspace={buyer.name}
          page={t < m.reorder + 0.3 ? "Restock" : "Purchase orders"}
        >
          <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - restockGone }}>
            {restockGone < 1 ? (
              <RestockPage
                t={t}
                rows={[-1, -1, -1]}
                checked={checked}
                reorder={pressed(t, m.reorder)}
                ring={ringFor(t, m.reorder)}
              />
            ) : null}
          </div>
          <div
            style={{
              position: "absolute",
              inset: "26px 30px",
              opacity: poShown,
              transform: `translateX(${(1 - poShown) * 40}px)`
            }}
          >
            {t >= m.reorder + 0.3 ? (
              <PoPage
                t={t}
                status={sent ? { label: "With supplier", tone: "primary" } : { label: "Draft", tone: "neutral" }}
                lines={m.lines}
                submit={m.submit}
              />
            ) : null}
          </div>
          {toast > 0 ? (
            <Toast
              icon={Send}
              title={`Sent to ${supplier.name}`}
              detail="It's in their workspace now"
              style={{
                position: "absolute",
                right: 26,
                bottom: 24,
                opacity: toast,
                transform: `translateY(${(1 - toast) * 20}px)`
              }}
            />
          ) : null}
          {t < m.supplier ? (
            <Cursor
              x={buyerCursor.x - 250}
              y={buyerCursor.y - 56}
              clicked={since(t, m.submit) ?? since(t, m.reorder)}
            />
          ) : null}
        </AppWindow>
      </Shot>
      {partner > 0 ? (
        <>
          <Shot
            t={t}
            at={m.supplier}
            x={1250}
            y={600}
            turn={-6}
            zoom={supplierZoom}
            focus={{ x: mixed(50, 86, toPacked), y: mixed(64, 14, toPacked) }}
            shift={{ x: -200 * supplierZoom, y: 0 }}
            whipOut={{ at: m.out, to: "right" }}
          >
            <AppWindow width={1080} height={740} workspace={supplier.name} kind="Supplier" page="Purchase orders">
              <PackingPage t={t} />
              {packedToast > 0 ? (
                <Toast
                  icon={CircleCheck}
                  title="Packing list submitted"
                  detail={`${buyer.name} can see it now`}
                  style={{
                    position: "absolute",
                    right: 26,
                    bottom: 24,
                    opacity: packedToast,
                    transform: `translateY(${(1 - packedToast) * 20}px)`
                  }}
                />
              ) : null}
              <Cursor
                x={supplierCursor.x - 250}
                y={supplierCursor.y - 56}
                clicked={since(t, m.packed)}
                fill="#1d4ed8"
              />
            </AppWindow>
          </Shot>
          <Tag
            icon={Factory}
            style={{
              position: "absolute",
              left: 1100,
              top: 150,
              opacity: partner * (1 - tagsGone),
              transform: `translateY(${(1 - partner) * 16}px)`
            }}
          >
            Your supplier’s view
          </Tag>
          <Tag
            icon={User}
            style={{ position: "absolute", left: 300, top: 118, opacity: partner * 0.9 * (1 - tagsGone) }}
          >
            Your view
          </Tag>
        </>
      ) : null}
    </Feature>
  )
}
