import { CircleCheck, type LucideIcon, RefreshCw, ShoppingBag, Store } from "lucide-react"
import type { ReactNode } from "react"
import { Easing } from "remotion"
import { buyer, count, leadTime, money, orderTotal, restock } from "../data"
import { glide, mixed, pressed, ramp, settle, sinceLast } from "../motion"
import { app } from "../theme"
import { moments } from "../timeline"
import { AppWindow, Badge, Button, Card, Checkbox, Cursor, PageTitle, ringFor, Table, Toast } from "../ui"
import { Feature, Shot } from "./feature"
import { Season } from "./holiday"
import { Overview, revealGlow, revealWindow } from "./reveal"

const m = moments.forecast

type IntegrationProps = {
  t: number
  icon: LucideIcon
  name: string
  description: string
  action: string
  // When its Connect button is clicked.
  click: number
  connected: string
}

// A Settings card for a store connection, before and after its Connect button is clicked.
const Integration = ({ t, icon: Icon, name, description, action, click, connected }: IntegrationProps) => {
  const done = t >= click + 0.22
  return (
    <Card style={{ display: "grid", gap: 14, minHeight: 208 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 40,
            height: 40,
            borderRadius: 11,
            background: app.surface
          }}
        >
          <Icon size={21} strokeWidth={1.8} />
        </span>
        <span style={{ flex: 1, fontSize: 19, fontWeight: 600 }}>{name}</span>
        {done ? (
          <Badge tone="success">
            <CircleCheck size={15} strokeWidth={2.4} />
            Connected
          </Badge>
        ) : null}
      </div>
      <span style={{ fontSize: 15.5, lineHeight: 1.45, color: app.muted }}>{description}</span>
      {done ? (
        <span style={{ fontSize: 15.5, fontWeight: 500 }}>{connected}</span>
      ) : (
        <Button press={pressed(t, click)} ring={ringFor(t, click)} style={{ justifySelf: "start" }}>
          {action}
        </Button>
      )}
    </Card>
  )
}

const Settings = ({ t }: { t: number }) => (
  <div style={{ display: "grid", gap: 18 }}>
    <PageTitle>Workspace settings</PageTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Integration
        t={t}
        icon={Store}
        name="Shopify"
        description="Connect your catalog, supplier SKUs, and product costs."
        action="Connect Shopify"
        click={m.connectShopify}
        connected="Catalog, costs, and orders syncing"
      />
      <Integration
        t={t}
        icon={ShoppingBag}
        name="Amazon"
        description="Connect the seller account used to create US AWD shipments."
        action="Connect Amazon"
        click={m.connectAmazon}
        connected="Marketplaces: United States"
      />
    </div>
    {[
      ["Restock", `Sales period 30 days, lead time ${leadTime} days`],
      ["Store time zone", "Pacific Time"],
      ["Monthly costs", "Software, storage, and staff"]
    ].map(([title, detail]) => (
      <Card key={title} style={{ display: "grid", gap: 8, padding: "18px 22px", opacity: 0.65 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 15.5, color: app.muted }}>{detail}</span>
      </Card>
    ))}
  </div>
)

const statusBadge = (status: string) =>
  status === "stockout" ? (
    <Badge key="status" tone="danger">
      Runs out before it arrives
    </Badge>
  ) : (
    <Badge key="status" tone="success">
      Enough stock
    </Badge>
  )

const columns = [
  { label: "", width: 0.4 },
  { label: "Product", width: 2.1 },
  { label: "Status", width: 2.4 },
  { label: "Stock left", width: 1.35 },
  { label: "Sold", width: 0.85, align: "right" },
  { label: "Available", width: 1.1, align: "right" },
  { label: "Order", width: 1, align: "right" }
] as const

const rowOf = (line: (typeof restock)[number], checked: number) => [
  <Checkbox key="check" checked={line.order > 0 ? checked : 0} />,
  <span key="name" style={{ fontWeight: 500 }}>
    {line.name}
  </span>,
  statusBadge(line.status),
  `${line.daysLeft} days left`,
  count(line.sold),
  count(line.available),
  line.order > 0 ? (
    <span key="order" style={{ fontWeight: 600 }}>
      {count(line.order)}
    </span>
  ) : (
    "0"
  )
]

// The expanded row's working: the same steps the app shows, arriving one at a time.
const Maths = ({ t, open }: { t: number; open: number }) => {
  const [bottle] = restock
  const rate = Math.round(bottle.sold / 30)
  const steps: readonly [string, string][] = [
    ["Sold in 30 days", count(bottle.sold)],
    ["Sales rate", `${rate} a day`],
    [`Needed for the ${leadTime}-day lead time`, count(rate * leadTime)],
    ["Available", `− ${count(bottle.available)}`],
    ["Incoming and on order", `− ${count(bottle.incoming)}`]
  ]
  const answer = settle(t, m.answer, 12, 180)
  // The answer counts up once, easing out, blurred while it's moving fast.
  const counting = ramp(t, m.answer, m.answer + 0.7, Easing.linear)
  const counted = Easing.out(Easing.cubic)(counting)
  return (
    <div
      style={{
        height: 330 * open,
        overflow: "hidden",
        background: app.surface,
        borderBottom: `1px solid ${app.border}`
      }}
    >
      <div style={{ display: "grid", gap: 4, padding: "18px 26px 18px 64px" }}>
        {steps.map(([label, value], i) => {
          const shown = settle(t, m.maths[i], 20, 180)
          return (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 0",
                fontSize: 17,
                opacity: shown,
                transform: `translateX(${(1 - shown) * -18}px)`
              }}
            >
              <span style={{ color: app.muted }}>{label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
            </div>
          )
        })}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
            padding: "12px 16px",
            borderRadius: 12,
            background: app.background,
            border: `1.5px solid ${app.primary}`,
            boxShadow: `0 0 0 ${6 * answer}px oklch(0.646 0.222 41.116 / ${0.14 * answer})`,
            opacity: Math.min(1, answer * 1.5),
            transform: `scale(${0.96 + 0.04 * answer})`
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 600 }}>= To order</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 15.5, color: app.muted }}>
              {count(bottle.order / bottle.caseOf)} cases of {bottle.caseOf}
            </span>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: app.primary,
                fontVariantNumeric: "tabular-nums",
                filter: counting < 1 ? `blur(${3 * (1 - counting) ** 2}px)` : undefined
              }}
            >
              {count(Math.round(bottle.order * counted))}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

type RestockProps = {
  t: number
  // When the rows arrive, which are ticked, how far the first row's working is open, and the Reorder button's click.
  rows: readonly number[]
  checked?: number
  open?: number
  reorder?: number
  ring?: number
}

// The Restock page: the controls, the summary, and the supplier's group with its Reorder button.
export const RestockPage = ({ t, rows, checked = 0, open = 0, reorder = 0, ring = 0 }: RestockProps): ReactNode => {
  const [first, ...rest] = restock
  const arrive = (i: number) => {
    const shown = settle(t, rows[i], 20, 180)
    return { opacity: shown, transform: `translateY(${(1 - shown) * 16}px)` }
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageTitle
        aside={
          <Button variant="outline" icon={RefreshCw}>
            Recalculate
          </Button>
        }
      >
        Restock
      </PageTitle>
      <div style={{ display: "flex", gap: 10 }}>
        {[
          ["Restock", "Amazon"],
          ["Supplier", "All suppliers"],
          ["Sales period", "30 days"],
          ["Lead time", `${leadTime} days`]
        ].map(([label, value]) => (
          <span
            key={label}
            style={{
              display: "grid",
              gap: 2,
              padding: "8px 14px",
              borderRadius: 10,
              border: `1px solid ${app.border}`,
              fontSize: 15.5
            }}
          >
            <span style={{ fontSize: 13, color: app.muted }}>{label}</span>
            {value}
          </span>
        ))}
      </div>
      <span style={{ fontSize: 15.5, color: app.muted }}>2 to reorder, 1 has enough stock.</span>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Shenzhen Metalworks</span>
          <span style={{ flex: 1, fontSize: 15, color: app.muted }}>Lead time {leadTime} days.</span>
          <span style={{ fontSize: 15, color: app.muted }}>
            Estimated cost <span style={{ color: app.foreground, fontWeight: 600 }}>{money(orderTotal)}</span>
          </span>
          <Button press={reorder} ring={ring}>
            Reorder
          </Button>
        </div>
        <Table columns={columns} rows={[{ key: first.name, cells: rowOf(first, checked), style: arrive(0) }]} />
        <Maths t={t} open={open} />
        <Table
          header={false}
          columns={columns}
          rows={rest.map((line, i) => ({ key: line.name, cells: rowOf(line, checked), style: arrive(i + 1) }))}
        />
      </Card>
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
    { at: 1.45, x: 386, y: 318 },
    { at: 2, x: 386, y: 318 },
    { at: 2.45, x: 830, y: 318 },
    { at: 3.1, x: 830, y: 318 },
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
          workspace={buyer.name}
          page={pageAt(t)}
        >
          {overviewGone < 1 ? (
            <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - overviewGone }}>
              <Overview t={7} />
            </div>
          ) : null}
          <div style={{ position: "absolute", inset: "26px 30px", opacity: ramp(t, 0.2, 0.55) * (1 - settingsGone) }}>
            {settingsGone < 1 ? <Settings t={t} /> : null}
          </div>
          <div
            style={{
              position: "absolute",
              inset: "26px 30px",
              opacity: restockShown,
              transform: `translateX(${(1 - restockShown) * 40}px)`
            }}
          >
            {t >= m.restock ? <RestockPage t={t} rows={m.rows} open={open} /> : null}
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
