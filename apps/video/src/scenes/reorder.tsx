import {
  ArrowRight,
  Building2,
  ChevronRight,
  CircleCheck,
  Copy,
  Ellipsis,
  Factory,
  FileText,
  MapPin,
  Send,
  Trash2,
  User,
  Warehouse
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import {
  buyer,
  cartonTotal,
  cents,
  count,
  forwarder,
  orderTotal,
  orderUnits,
  ordered,
  reference,
  supplier
} from "../data"
import { glide, mixed, pressed, ramp, settle, since } from "../motion"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Button, Card, Cursor, PageHeader, ringFor, RoutePill, Status, Table, Tag, Toast } from "../ui"
import { Feature, Shot } from "./feature"
import { RestockPage } from "./forecast"

const m = moments.reorder

// Supplier, forwarder stop, destination: the route every purchase order shows.
export const Route = () => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
    <RoutePill icon={Building2}>{supplier.name}</RoutePill>
    <ArrowRight size={18} color={app.muted} />
    <RoutePill icon={Warehouse}>{forwarder.name}</RoutePill>
    <ArrowRight size={18} color={app.muted} />
    <RoutePill icon={MapPin}>Amazon</RoutePill>
  </div>
)

// A value under its label, as the purchase order's details list them.
const Detail = ({ label, value }: { label: string; value: string }) => (
  <span style={{ display: "grid", gap: 2 }}>
    <span style={{ color: app.muted }}>{label}</span>
    <span>{value}</span>
  </span>
)

type PoProps = {
  t: number
  // Whether it's still a draft or with the supplier, and when its lines arrive and Submit is clicked, if it is.
  status: "draft" | "submitted"
  lines?: readonly number[]
  submit?: number
}

// A purchase order's page: its route and products and its shipments, with its costs and details beside them.
export const PoPage = ({ t, status, lines = [-1, -1, -1], submit }: PoProps) => {
  const arrive = (i: number): CSSProperties => {
    const shown = settle(t, lines[i], 20, 180)
    return { opacity: shown, transform: `translateY(${(1 - shown) * 14}px)` }
  }
  const sent = status === "submitted"
  // Submit goes once the purchase order is sent, a moment after the click.
  const submitting = !sent || (submit !== undefined && t < submit + 0.25)
  return (
    <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
      <PageHeader
        parents={["Purchase orders"]}
        title={reference}
        badge={<Status status={status} />}
        actions={
          <>
            {submitting ? (
              <Button
                press={submit === undefined ? 0 : pressed(t, submit)}
                ring={submit === undefined ? 0 : ringFor(t, submit)}
              >
                Submit to supplier
              </Button>
            ) : null}
            <Button variant="outline" icon={Ellipsis} />
          </>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 296px", alignItems: "start", gap: 18 }}>
        <div style={{ display: "grid", gap: 18 }}>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${app.border}` }}>
              <Route />
            </div>
            <Table
              small
              fontSize={15}
              columns={[
                { label: "Products", width: 2.05 },
                { label: "Supplier SKU", width: 1.25 },
                { label: "Qty", width: 0.75, align: "right" },
                { label: "Cost", width: 0.75, align: "right" },
                { label: "Total", width: 1.3, align: "right" },
                { label: "Actions", width: "44px", hidden: true }
              ]}
              rows={ordered.map((line, i) => ({
                key: line.sku,
                cells: [
                  <span key="name" style={{ display: "grid", lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 500 }}>{line.name}</span>
                    <span style={{ fontSize: 13.5, color: app.muted }}>{line.sku}</span>
                  </span>,
                  line.sku,
                  count(line.order),
                  cents(line.cost),
                  cents(line.order * line.cost),
                  <Ellipsis key="menu" size={17} color={app.muted} />
                ],
                style: { minHeight: 62, ...arrive(i) }
              }))}
            />
          </Card>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 12px", fontSize: 17, fontWeight: 500 }}>Shipments</div>
            {sent ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  borderTop: `1px solid ${app.border}`,
                  opacity: submit === undefined ? 1 : settle(t, submit + 0.3, 20, 170)
                }}
              >
                <span style={{ display: "grid", flex: 1, lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 500 }}>Shipment 1</span>
                  <span style={{ fontSize: 13.5, color: app.muted }}>Cartons in preparation, 0 cartons</span>
                </span>
                <Status status="packing" />
                <ChevronRight size={18} color={app.muted} />
              </div>
            ) : (
              <div style={{ padding: "0 16px 16px", color: app.muted }}>
                Shipments start once the purchase order is sent.
              </div>
            )}
          </Card>
        </div>
        <div style={{ display: "grid", gap: 18, fontSize: 15 }}>
          <Card style={{ display: "grid", gap: 10, padding: 16, ...arrive(2) }}>
            <span style={{ fontSize: 17, fontWeight: 500 }}>Cost summary</span>
            <span style={{ fontWeight: 500 }}>Order details</span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 12, whiteSpace: "nowrap" }}>
              <span>
                {ordered.length} variants ({count(orderUnits)} units)
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{cents(orderTotal)}</span>
            </span>
            <span style={{ height: 1, background: app.border }} />
            <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{cents(orderTotal)}</span>
            </span>
          </Card>
          <Card style={{ display: "grid", gap: 14, padding: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 500 }}>Purchase order details</span>
            <Detail label="Required by" value="Dec 1, 2026" />
            <Detail label="Payment terms" value="30% deposit, 70% before shipping" />
            <Detail label="Currency" value="USD" />
            <Detail label="Note to supplier" value="—" />
          </Card>
        </div>
      </div>
    </div>
  )
}

// The supplier's first few cartons of the order's 160, each a row of fields as they fill them in.
const cartons = [
  { id: "1", product: ordered[0], length: 42, width: 32, height: 28, weight: "11.6" },
  { id: "2", product: ordered[0], length: 42, width: 32, height: 28, weight: "11.6" },
  { id: "3", product: ordered[0], length: 42, width: 32, height: 28, weight: "11.6" },
  { id: "106", product: ordered[1], length: 38, width: 28, height: 26, weight: "7.9" }
]
const cartonColumns = "1.25fr repeat(4, minmax(0, 1fr)) 2.1fr 0.85fr 52px"

// One of a carton's fields, filled in.
const Box = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      height: 40,
      padding: "0 11px",
      overflow: "hidden",
      borderRadius: 10,
      boxShadow: `inset 0 0 0 1px ${app.border}`,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums"
    }}
  >
    {children}
  </span>
)

// The supplier's side of the same order: the shipment they're packing, with their invoice uploaded, their cartons,
// and the bar that submits the packing list.
const PackingPage = ({ t }: { t: number }) => (
  <>
    <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
      <PageHeader parents={["Orders", reference]} title="Shipment 1" badge={<Status status="packing" />} />
      <Card style={{ display: "grid", gap: 14, padding: 18 }}>
        <span style={{ display: "grid", gap: 3 }}>
          <span style={{ fontSize: 17, fontWeight: 500 }}>Commercial invoice</span>
          <span style={{ color: app.muted }}>Your invoice for these cartons</span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 9px 8px 13px",
            borderRadius: 10,
            boxShadow: `inset 0 0 0 1px ${app.border}`
          }}
        >
          <FileText size={18} color={app.muted} />
          <span style={{ display: "grid", flex: 1, lineHeight: 1.35 }}>
            <span style={{ fontWeight: 500 }}>CI-1042.pdf</span>
            <span style={{ fontSize: 13.5, color: app.muted }}>184 KB</span>
          </span>
          <Button variant="outline" size="sm">
            Replace
          </Button>
        </span>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${app.border}`, fontSize: 17, fontWeight: 500 }}>
          Cartons
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cartonColumns,
            gap: 10,
            padding: "9px 18px",
            borderBottom: `1px solid ${app.border}`,
            background: "oklch(0.97 0 0 / 0.5)",
            color: app.muted,
            fontSize: 12.5,
            fontWeight: 500,
            whiteSpace: "nowrap"
          }}
        >
          <span>Carton number</span>
          <span>Length (cm)</span>
          <span>Width (cm)</span>
          <span>Height (cm)</span>
          <span>Weight (kg)</span>
          <span>Product</span>
          <span>Units</span>
          <span />
        </div>
        {cartons.map(({ id, product, length, width, height, weight }, i) => {
          const shown = settle(t, m.cartons[i], 20, 180)
          return (
            <div
              key={id}
              style={{
                display: "grid",
                gridTemplateColumns: cartonColumns,
                alignItems: "center",
                gap: 10,
                padding: "12px 18px",
                borderBottom: `1px solid ${app.border}`,
                opacity: shown,
                transform: `translateX(${(1 - shown) * -20}px)`
              }}
            >
              <Box>{id}</Box>
              <Box>{length}</Box>
              <Box>{width}</Box>
              <Box>{height}</Box>
              <Box>{weight}</Box>
              <Box>
                {product.name} / {product.sku}
              </Box>
              <Box>{product.caseOf}</Box>
              <span style={{ display: "flex", justifyContent: "flex-end", gap: 12, color: app.muted }}>
                <Copy size={17} />
                <Trash2 size={17} />
              </span>
            </div>
          )
        })}
      </Card>
    </div>
    {/* The action bar stays in view at the bottom of the window, over the cartons. */}
    <div
      style={{
        position: "absolute",
        left: 30,
        right: 30,
        bottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: 13,
        borderRadius: 16,
        background: app.background,
        boxShadow: `0 0 0 1px ${app.ring}, 0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1)`,
        fontSize: 16
      }}
    >
      <span style={{ display: "grid", paddingLeft: 4, lineHeight: 1.35 }}>
        <span style={{ fontWeight: 500 }}>
          {count(cartonTotal)} cartons, {count(orderUnits)} units
        </span>
        <span style={{ fontSize: 13.5, color: app.muted }}>Draft saved</span>
      </span>
      <span style={{ display: "flex", gap: 9 }}>
        <Button variant="ghost">Save draft</Button>
        <Button variant="outline">Check packing</Button>
        <Button press={pressed(t, m.packed)} ring={ringFor(t, m.packed)}>
          Submit packing list
        </Button>
      </span>
    </div>
  </>
)

// Where the buyer's window rests when the chapter ends, pushed back behind the supplier's, for the Amazon chapter to
// carry on from.
export const reorderEnd = { x: 1262 - 390, y: 580 - 30, turn: -9, scale: 1, dim: 1 }

// 0:36 to 0:46, reorder: one click turns the restock into a purchase order, one more sends it to the supplier, and the
// supplier packs it in their own workspace. The camera pushes in on each button as it's clicked.
export const Reorder = ({ t }: { t: number }) => {
  const poShown = settle(t, m.reorder + 0.3, 20, 150)
  const restockGone = ramp(t, m.reorder + 0.15, m.reorder + 0.45)
  const sent = t >= m.submit + 0.25
  const partner = settle(t, m.supplier, 16, 100)
  // The camera leans in on Reorder while the headline is up, pushes closer once it's gone, and pans up to Submit.
  const buyerIn = ramp(t, m.reorder - 0.8, m.reorder - 0.2) * (1 - ramp(t, m.supplier - 0.6, m.supplier))
  const closer = ramp(t, m.lines[0] + 0.3, m.lines[0] + 0.9)
  const buyerZoom = buyerIn * mixed(0.1, 0.3, closer)
  const toSubmit = ramp(t, m.reorder + 0.4, m.lines[0] + 0.6)
  // On the supplier's side it pushes in on the cartons as they fill, then pans down to Submit packing list.
  const supplierZoom =
    0.26 * ramp(t, m.cartons[0] - 0.2, m.cartons[0] + 0.3) * (1 - ramp(t, m.packed + 0.6, m.packed + 1.1))
  const toPacked = ramp(t, m.cartons[3] + 0.2, m.packed - 0.3)
  const buyerCursor = glide(t, [
    { at: 0.5, x: 900, y: 700 },
    { at: 1.3, x: 1082, y: 466 },
    { at: 1.9, x: 1082, y: 466 },
    { at: 3.4, x: 1005, y: 102 },
    { at: 4.2, x: 1005, y: 102 },
    { at: 4.8, x: 820, y: 520 }
  ])
  const supplierCursor = glide(t, [
    { at: 5.4, x: 900, y: 560 },
    { at: 7.6, x: 948, y: 690 },
    { at: 8.6, x: 948, y: 690 },
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
        focus={{ x: mixed(92, 86, toSubmit), y: mixed(59, 13, toSubmit) }}
        shift={{ x: (reorderEnd.x - 1262) * partner - 80 * closer * buyerIn, y: (reorderEnd.y - 580) * partner }}
        dim={partner}
      >
        <AppWindow
          width={1180}
          height={790}
          workspace={buyer}
          page={t < m.reorder + 0.3 ? "Restock" : "Purchase orders"}
        >
          <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - restockGone }}>
            {restockGone < 1 ? (
              <RestockPage t={t} rows={[-1, -1, -1, -1]} reorder={pressed(t, m.reorder)} ring={ringFor(t, m.reorder)} />
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
              <PoPage t={t} status={sent ? "submitted" : "draft"} lines={m.lines} submit={m.submit} />
            ) : null}
          </div>
          {toast > 0 ? (
            <Toast
              icon={Send}
              title={`Sent to ${supplier.name}`}
              detail="It’s in their workspace now"
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
            focus={{ x: mixed(50, 88, toPacked), y: mixed(66, 93, toPacked) }}
            shift={{ x: -200 * supplierZoom, y: 0 }}
            whipOut={{ at: m.out, to: "right" }}
          >
            <AppWindow width={1080} height={740} workspace={supplier} page="Shipments">
              <PackingPage t={t} />
              {packedToast > 0 ? (
                <Toast
                  icon={CircleCheck}
                  title="Packing list submitted"
                  detail={`${buyer.name} can see it now`}
                  style={{
                    position: "absolute",
                    right: 26,
                    top: 24,
                    opacity: packedToast,
                    transform: `translateY(${(1 - packedToast) * -20}px)`
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
              // It steps aside while the camera is pushed in on the supplier's window, which rises past it.
              opacity: partner * (1 - tagsGone) * (1 - supplierZoom / 0.26),
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
