import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Coffee,
  CupSoda,
  Factory,
  GlassWater,
  Info,
  type LucideIcon,
  TrendingDown,
  Warehouse
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { Easing } from "remotion"
import {
  buyer,
  cents,
  count,
  leadTime,
  money,
  otherSupplier,
  restock,
  restockTotals,
  supplier,
  supplierTotals
} from "../data"
import { glide, mixed, pressed, ramp, settle, sinceLast } from "../motion"
import { app } from "../theme"
import { moments } from "../timeline"
import {
  Alert,
  AppWindow,
  Badge,
  Button,
  Card,
  Checkbox,
  Cursor,
  NumberField,
  PageHeader,
  ringFor,
  Select,
  Status,
  StoreLogo,
  Table,
  Thumb,
  Toast
} from "../ui"
import { Feature, Shot } from "./feature"
import { Season } from "./holiday"
import { Overview, revealGlow, revealWindow } from "./reveal"

const m = moments.forecast

// Each demo product's picture.
const thumbs: Record<string, LucideIcon> = { "SM-3201": GlassWater, "SM-1204": Coffee, "SM-2002": CupSoda }

type StoreProps = {
  t: number
  store: "shopify" | "amazon"
  name: string
  description: string
  account: string
  // When the card is clicked to connect the store.
  click: number
}

// A store's card in Settings: its logo, name and what it brings, and Connect until the card is clicked, then
// Connected and the account. The whole card is the button.
const StoreTile = ({ t, store, name, description, account, click }: StoreProps) => {
  const done = t >= click + 0.22
  const ring = ringFor(t, click)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 16,
        minWidth: 0,
        padding: 18,
        borderRadius: 16,
        background: !done && t >= click - 0.55 ? "oklch(0.97 0 0 / 0.5)" : app.background,
        boxShadow: [
          `inset 0 0 0 1px ${app.border}`,
          "0 1px 2px 0 oklch(0 0 0 / 0.05)",
          ring > 0 ? `0 0 0 ${6 * ring}px oklch(0.646 0.222 41.116 / ${0.28 * ring})` : null
        ]
          .filter(Boolean)
          .join(", "),
        transform: `scale(${1 - 0.02 * Math.sin(Math.PI * pressed(t, click))})`
      }}
    >
      <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
        <StoreLogo store={store} />
        {done ? (
          <Badge variant="outline">
            <CircleCheck size={14} color={app.success} strokeWidth={2.2} />
            Connected
          </Badge>
        ) : null}
      </span>
      <span style={{ display: "grid", gap: 3 }}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>{name}</span>
        <span style={{ fontSize: 15.5, lineHeight: 1.4, color: app.muted }}>{description}</span>
      </span>
      <span style={{ display: "flex", width: "100%", minWidth: 0, marginTop: "auto", fontSize: 16 }}>
        {done ? (
          <span style={{ overflow: "hidden", color: app.muted, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {account}
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
            Connect
            <ArrowRight size={17} strokeWidth={2} />
          </span>
        )}
      </span>
    </div>
  )
}

// A Settings section: its title and description on the left, its cards on the right.
const Section = ({
  title,
  description,
  children,
  style
}: {
  title: string
  description: string
  children: ReactNode
  style?: CSSProperties
}) => (
  <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", gap: 40, ...style }}>
    <span style={{ display: "grid", alignContent: "start", gap: 4 }}>
      <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 15.5, color: app.muted }}>{description}</span>
    </span>
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>{children}</div>
  </div>
)

// A settings form's number field, filled in: its label, with the red star of a required field, the box and a hint.
const Field = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <span style={{ display: "grid", alignContent: "start", gap: 8 }}>
    <span style={{ fontSize: 16, fontWeight: 500 }}>
      {label}
      <span style={{ color: app.danger }}> *</span>
    </span>
    <span
      style={{
        display: "flex",
        alignItems: "center",
        height: 40,
        padding: "0 12px",
        borderRadius: 10,
        boxShadow: `inset 0 0 0 1px ${app.border}`,
        fontSize: 16
      }}
    >
      {value}
    </span>
    {hint ? <span style={{ fontSize: 15.5, color: app.muted }}>{hint}</span> : null}
  </span>
)

// Settings, scrolled to its stores, as the Overview's Connect stores opens it: Shopify and Amazon to connect, eBay to
// come, then the restock settings.
const SettingsPage = ({ t }: { t: number }) => (
  <div style={{ display: "grid" }}>
    <Section title="Integrations" description="Stores Copacker syncs with" style={{ paddingBottom: 34 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        <StoreTile
          t={t}
          store="shopify"
          name="Shopify"
          description="Products, inventory, orders, expenses"
          account={`${buyer.name}, ridgeline-goods.myshopify.com`}
          click={m.connectShopify}
        />
        <StoreTile
          t={t}
          store="amazon"
          name="Amazon"
          description="Orders, inventory, expenses, shipments"
          account={`${buyer.name}, A3KX9RMBQ4T2VD`}
          click={m.connectAmazon}
        />
        <div
          style={{
            display: "grid",
            gap: 16,
            padding: 18,
            borderRadius: 16,
            boxShadow: `inset 0 0 0 1px ${app.border}, 0 1px 2px 0 oklch(0 0 0 / 0.05)`
          }}
        >
          <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <StoreLogo store="ebay" />
            <Badge>Coming soon</Badge>
          </span>
          <span style={{ display: "grid", gap: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 500 }}>eBay</span>
            <span style={{ fontSize: 15.5, color: app.muted }}>Orders, inventory</span>
          </span>
        </div>
      </div>
    </Section>
    <Section
      title="Restock"
      description="Used by Restock and the Overview"
      style={{ paddingTop: 34, borderTop: `1px solid ${app.border}` }}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 20 }}>
          <Field label="Sales period (days)" value="30" />
          <Field label="Lead time (days)" value={String(leadTime)} hint="For suppliers without their own" />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "14px 20px",
            borderTop: `1px solid ${app.border}`,
            background: "oklch(0.97 0 0 / 0.5)"
          }}
        >
          <Button variant="outline" style={{ opacity: 0.5 }}>
            Save
          </Button>
        </div>
      </Card>
    </Section>
  </div>
)

// The restock table's columns, with the Order checkbox and the calculation button named only for screen readers. The
// figures get fixed widths and the product the rest.
const columns = [
  { label: "Selected", width: "50px", hidden: true },
  { label: "Product", width: 1 },
  { label: "Status", width: "144px" },
  { label: "Stock left", width: "90px", align: "right" },
  { label: "Sold", width: "62px", align: "right" },
  { label: "Available", width: "86px", align: "right" },
  { label: "Order", width: "64px", align: "right" },
  { label: "Cost", width: "102px", align: "right" },
  { label: "Calculation", width: "52px", hidden: true }
] as const

// A product as Restock lists it: its picture, its name and its SKU.
export const Product = ({ name, sku }: { name: string; sku: string }) => (
  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Thumb icon={thumbs[sku] ?? GlassWater} />
    <span style={{ display: "grid", lineHeight: 1.3 }}>
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span style={{ fontSize: 13.5, color: app.muted }}>{sku}</span>
    </span>
  </span>
)

const rowOf = (line: (typeof restock)[number], open: boolean) => [
  <Checkbox key="check" checked={1} />,
  <Product key="name" name={line.name} sku={line.sku} />,
  <Status key="status" status={line.status} />,
  `${line.daysLeft} days`,
  count(line.sold),
  count(line.available),
  <span key="order" style={{ fontWeight: 500 }}>
    {count(line.order)}
  </span>,
  cents(line.order * line.cost),
  <span key="toggle" style={{ display: "grid", placeItems: "center", color: app.muted }}>
    {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
  </span>
]

// The expanded row's working, as the app sets it out under the row: the sales rate, then the sum to the quantity to
// order, each step arriving in turn and the answer counting up.
const Maths = ({ t, open }: { t: number; open: number }) => {
  const [bottle] = restock
  const steps: readonly { label: string; value: string; sign?: string }[] = [
    { label: "Sold in 30 days", value: count(bottle.sold) },
    { label: "Sales rate", value: `${(bottle.sold / 30).toFixed(1)} a day` },
    { label: `Needed for the ${leadTime}-day lead time`, value: count((bottle.sold * leadTime) / 30) },
    { label: "Available", value: count(bottle.available), sign: "−" },
    { label: "Incoming and on order", value: count(bottle.incoming), sign: "−" }
  ]
  const answer = settle(t, m.answer, 12, 180)
  // The answer counts up once, easing out, blurred while it's moving fast.
  const counting = ramp(t, m.answer, m.answer + 0.7, Easing.linear)
  const counted = Easing.out(Easing.cubic)(counting)
  const row: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 14px auto",
    alignItems: "baseline",
    columnGap: 14,
    height: 29
  }
  return (
    <div
      style={{
        height: 214 * open,
        overflow: "hidden",
        background: "oklch(0.97 0 0 / 0.35)",
        borderBottom: `1px solid ${app.border}`
      }}
    >
      <div style={{ width: 60 + 440, padding: "15px 0 15px 60px", fontSize: 16 }}>
        {steps.map(({ label, value, sign }, i) => {
          const shown = settle(t, m.maths[i], 20, 180)
          return (
            <div key={label} style={{ ...row, opacity: shown, transform: `translateX(${(1 - shown) * -18}px)` }}>
              <span style={{ color: app.muted }}>{label}</span>
              <span style={{ textAlign: "center", color: app.muted }}>{sign}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
            </div>
          )
        })}
        <div
          style={{
            ...row,
            position: "relative",
            height: 38,
            alignItems: "center",
            marginTop: 5,
            borderTop: `1px solid ${app.border}`,
            fontWeight: 600,
            opacity: Math.min(1, answer * 1.5)
          }}
        >
          {/* The answer lit up, drawing the eye, as it lands. */}
          <span
            style={{
              position: "absolute",
              inset: "3px -12px -3px",
              borderRadius: 10,
              boxShadow: `inset 0 0 0 1.5px ${app.primary}, 0 0 0 ${6 * answer}px oklch(0.646 0.222 41.116 / ${0.14 * answer})`,
              background: "oklch(0.646 0.222 41.116 / 0.06)",
              transform: `scale(${0.96 + 0.04 * answer})`
            }}
          />
          <span style={{ position: "relative" }}>
            To order ({count(bottle.order / bottle.caseOf)} cases of {bottle.caseOf})
          </span>
          <span style={{ position: "relative", textAlign: "center", color: app.muted }}>=</span>
          <span
            style={{
              position: "relative",
              textAlign: "right",
              color: app.primary,
              fontVariantNumeric: "tabular-nums",
              filter: counting < 1 ? `blur(${2 * (1 - counting) ** 2}px)` : undefined
            }}
          >
            {count(Math.round(bottle.order * counted))}
          </span>
        </div>
      </div>
    </div>
  )
}

// A supplier's group on Restock: its name and totals, its estimated cost and Reorder, then its table when open.
const GroupHeader = ({
  name,
  products,
  details,
  lost,
  cost,
  open,
  reorder
}: {
  name: string
  products: string
  details: string
  lost?: string
  cost: string
  open: boolean
  reorder: ReactNode
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 24,
      padding: "17px 18px",
      borderBottom: open ? `1px solid ${app.border}` : undefined
    }}
  >
    <span style={{ display: "grid", flex: 1, gap: 3, minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {open ? <ChevronDown size={18} color={app.muted} /> : <ChevronRight size={18} color={app.muted} />}
        <span style={{ fontSize: 17, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 13.5, color: app.muted }}>{products}</span>
      </span>
      <span style={{ paddingLeft: 26, fontSize: 13.5, color: app.muted, whiteSpace: "nowrap" }}>
        {details}
        {lost ? (
          <>
            , <span style={{ color: app.danger }}>{lost} lost sales</span>
          </>
        ) : null}
      </span>
    </span>
    <span style={{ display: "grid", justifyItems: "end", lineHeight: 1.3 }}>
      <span style={{ fontSize: 13.5, color: app.muted }}>Estimated cost</span>
      <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{cost}</span>
    </span>
    {reorder}
  </div>
)

type RestockProps = {
  t: number
  // When the summary, the two rows and the other supplier's group arrive, how far the first row's working is open, the
  // Reorder button's click and its ring, and how far the page has scrolled down.
  rows: readonly number[]
  open?: number
  reorder?: number
  ring?: number
  scroll?: number
}

// The Restock page: the controls, what the selected lines add up to, and each supplier's group with its Reorder button.
export const RestockPage = ({ t, rows, open = 0, reorder = 0, ring = 0, scroll = 0 }: RestockProps): ReactNode => {
  const [first, second] = restock
  const arrive = (i: number) => {
    const shown = settle(t, rows[i], 20, 180)
    return { opacity: shown, transform: `translateY(${(1 - shown) * 16}px)` }
  }
  return (
    <div style={{ display: "grid", gap: 24, transform: `translateY(${-scroll}px)` }}>
      <PageHeader title="Restock" />
      <div style={{ display: "grid", gap: 9 }}>
        <div style={{ display: "flex", gap: 9 }}>
          <Select icon={Warehouse}>Amazon</Select>
          <Select icon={Factory}>All suppliers</Select>
          <NumberField label="Sales period" value={30} unit="days" />
          <NumberField label="Lead time" value={leadTime} unit="days" />
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, color: app.muted }}>
          3 to reorder, 1 has enough stock
          <Info size={16} />
        </span>
      </div>
      <Card style={{ display: "grid", gap: 16, padding: 18, ...arrive(0) }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
          <span style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 16, color: app.muted }}>Estimated cost</span>
            <span
              style={{ fontSize: 35, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
            >
              {cents(restockTotals.cost)}
            </span>
          </span>
          <span style={{ display: "flex", gap: 32 }}>
            {[
              ["Lines", count(restockTotals.lines)],
              ["Units", count(restockTotals.units)],
              ["Cases", count(restockTotals.cases)],
              ["Volume", restockTotals.volume],
              ["Weight", restockTotals.weight]
            ].map(([label, value]) => (
              <span key={label} style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 13.5, color: app.muted }}>{label}</span>
                <span style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
              </span>
            ))}
          </span>
        </div>
        <Alert
          destructive
          icon={TrendingDown}
          title={`About ${money(restockTotals.lost)} in lost sales before reorders arrive`}
        />
      </Card>
      <div style={{ display: "grid", gap: 18 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <GroupHeader
            name={supplier.name}
            products="2 products"
            details={`Lead time ${leadTime} days, 2 lines, ${count(first.order + second.order)} units, ${supplierTotals.cases} cases, ${supplierTotals.volume}, ${supplierTotals.weight}`}
            lost={money(restockTotals.lost)}
            cost={cents(first.order * first.cost + second.order * second.cost)}
            open
            reorder={
              <Button variant="outline" size="sm" press={reorder} ring={ring}>
                Reorder
              </Button>
            }
          />
          <Table
            inset={18}
            fontSize={15}
            columns={columns}
            rows={[{ key: first.name, cells: rowOf(first, open > 0), style: arrive(1) }]}
          />
          <Maths t={t} open={open} />
          <Table
            inset={18}
            fontSize={15}
            header={false}
            columns={columns}
            rows={[{ key: second.name, cells: rowOf(second, false), style: arrive(2) }]}
          />
        </Card>
        <Card style={{ padding: 0, overflow: "hidden", ...arrive(3) }}>
          <GroupHeader
            name={otherSupplier.name}
            products="1 product"
            details={`Lead time ${otherSupplier.leadTime} days, 1 line, ${count(otherSupplier.units)} units`}
            cost={cents(otherSupplier.cost)}
            open={false}
            reorder={
              <Button variant="outline" size="sm">
                Reorder
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  )
}

const pageAt = (t: number) => {
  if (t < 0.3) {
    return "Overview"
  }
  return t < m.restock ? "Settings" : "Restock"
}

// 0:17 to 0:36, forecast: connect Shopify and Amazon, and the Restock page says what to order and exactly how much.
export const Forecast = ({ t }: { t: number }) => {
  const settingsGone = ramp(t, m.restock - 0.2, m.restock + 0.15)
  const restockShown = settle(t, m.restock, 20, 150)
  const zoom = ramp(t, m.zoom, m.zoom + 1, Easing.inOut(Easing.cubic))
  const open = ramp(t, m.zoom + 0.35, m.zoom + 0.95, Easing.out(Easing.cubic))
  const cursor = glide(t, [
    { at: 0.6, x: 1080, y: 640 },
    { at: 1.45, x: 596, y: 258 },
    { at: 2, x: 596, y: 258 },
    { at: 2.45, x: 904, y: 258 },
    { at: 3.1, x: 904, y: 258 },
    { at: 3.8, x: 1060, y: 560 }
  ])
  const synced = settle(t, m.synced, 18, 170) * (1 - ramp(t, m.restock - 0.3, m.restock))
  const away = ramp(t, m.season - 0.35, m.season + 0.25, Easing.in(Easing.cubic))
  // The reveal hands over its window: it glides here from the middle of the stage, resizing as the Overview gives way
  // to Settings.
  const carried = settle(t, 0, 17, 105)
  const overviewGone = ramp(t, 0, 0.35)
  return (
    <Feature
      t={t}
      number="01"
      name="Forecast"
      lines={["Know exactly", "when to", "restock."]}
      accented={["restock."]}
      out={m.out}
      headlineAt={0.5}
      headlineOut={m.zoom - 0.2}
      exit="whip"
      glowFrom={revealGlow}
    >
      <Shot
        t={t}
        at={0}
        from={{ x: revealWindow.x, y: revealWindow.y, turn: 0, scale: 1, tilt: 0 }}
        x={1262}
        y={580}
        zoom={0.42 * zoom}
        focus={{ x: 52, y: 60 }}
        shift={{ x: -240 * zoom - 1100 * away, y: -190 * zoom }}
        style={away > 0 ? { opacity: 1 - away, filter: `blur(${away * 10}px)` } : undefined}
      >
        <AppWindow
          width={mixed(revealWindow.width, 1180, carried)}
          height={mixed(revealWindow.height, 790, carried)}
          workspace={buyer}
          page={pageAt(t)}
        >
          {overviewGone < 1 ? (
            <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - overviewGone }}>
              <Overview t={7} />
            </div>
          ) : null}
          <div style={{ position: "absolute", inset: "26px 30px", opacity: ramp(t, 0.2, 0.55) * (1 - settingsGone) }}>
            {settingsGone < 1 ? <SettingsPage t={t} /> : null}
          </div>
          <div
            style={{
              position: "absolute",
              inset: "26px 30px",
              opacity: restockShown,
              transform: `translateX(${(1 - restockShown) * 40}px)`
            }}
          >
            {t >= m.restock ? <RestockPage t={t} rows={m.rows} open={open} scroll={122 * zoom} /> : null}
          </div>
          {synced > 0 ? (
            <Toast
              icon={CircleCheck}
              title="Stock and sales synced"
              detail="Amazon and Shopify"
              style={{
                position: "absolute",
                right: 26,
                bottom: 24,
                opacity: synced,
                transform: `translateY(${(1 - synced) * 20}px)`
              }}
            />
          ) : null}
          {t < 3.9 ? (
            <Cursor x={cursor.x - 250} y={cursor.y - 56} clicked={sinceLast(t, [m.connectShopify, m.connectAmazon])} />
          ) : null}
        </AppWindow>
      </Shot>
      {t >= m.season - 0.1 ? <Season t={t} /> : null}
    </Feature>
  )
}
