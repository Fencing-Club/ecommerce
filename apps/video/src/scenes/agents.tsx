import { Bot, CircleCheck, FileUp, Plug, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Easing } from "remotion"
import { agentReference, buyer, cents, forwarder, orderTotal, otherSupplier, reference, supplier } from "../data"
import { mixed, ramp, settle } from "../motion"
import { app, font, stage } from "../theme"
import { moments, sections } from "../timeline"
import { AppWindow, Button, Card, PageHeader, Status, type StatusKey, Table, Toast } from "../ui"
import { Feature, Shot } from "./feature"
import { BuyerView, handoffsEnd } from "./handoffs"

const m = moments.agents

const prompt = "Reorder anything that runs out before it arrives, and send it to AWD."

const steps = [
  "Checked restock: 2 products run out before they arrive",
  `Created purchase order 1043 for ${supplier.name}`,
  "Sent purchase order 1043 to the supplier",
  "Planned the Amazon AWD shipment"
]

// A step's mark in the agent's reply: turning while it works, checked once done.
const Working = ({ t, at }: { t: number; at: number }) =>
  t >= at ? (
    <CircleCheck
      size={22}
      color="#0a0a0a"
      fill="#4ade80"
      style={{ flex: "none", transform: `scale(${0.6 + 0.4 * settle(t, at, 12, 220)})` }}
    />
  ) : (
    <svg width={22} height={22} viewBox="0 0 22 22" style={{ flex: "none", transform: `rotate(${t * 540}deg)` }}>
      <circle cx={11} cy={11} r={8} fill="none" stroke="rgba(250, 250, 250, 0.15)" strokeWidth={2.5} />
      <circle cx={11} cy={11} r={8} fill="none" stroke="#ff8a3d" strokeWidth={2.5} strokeDasharray="14 40" />
    </svg>
  )

// Your agent, working in Copacker over MCP: the request you type, and each thing it does, as it does it.
export const AgentPanel = ({ t, compact = false }: { t: number; compact?: boolean }) => {
  const typed = Math.round(prompt.length * ramp(t, m.typing[0], m.typing[1], Easing.linear))
  const caret = t < m.send && Math.floor(t * 2.5) % 2 === 0
  return (
    <div
      style={{
        display: "grid",
        alignContent: "start",
        gap: 18,
        width: 680,
        padding: 26,
        borderRadius: 24,
        background: "rgba(24, 24, 27, 0.92)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 40px 80px -30px rgba(0, 0, 0, 0.8)",
        color: stage.text,
        fontFamily: font.sans
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "rgba(255, 138, 61, 0.16)"
          }}
        >
          <Bot size={22} color="#ff8a3d" />
        </span>
        <span style={{ flex: 1, fontSize: 20, fontWeight: 600 }}>Your agent</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(74, 222, 128, 0.4)",
            color: "#86efac",
            fontSize: 14.5,
            fontWeight: 500
          }}
        >
          <Plug size={15} />
          Connected to Copacker over MCP
        </span>
      </div>
      {compact ? null : (
        <div
          style={{
            justifySelf: "end",
            maxWidth: 520,
            padding: "14px 18px",
            borderRadius: "18px 18px 6px 18px",
            background: "rgba(255, 138, 61, 0.14)",
            border: "1px solid rgba(255, 138, 61, 0.3)",
            fontSize: 18,
            lineHeight: 1.45,
            opacity: t >= m.typing[0] ? 1 : 0
          }}
        >
          {prompt.slice(0, typed)}
          <span style={{ opacity: caret ? 1 : 0 }}>|</span>
        </div>
      )}
      <div style={{ display: "grid", gap: 14 }}>
        {steps.map((step, i) => {
          const start = m.steps[i] - 0.8
          const shown = settle(t, start, 20, 180)
          return t >= start ? (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 17.5,
                color: t >= m.steps[i] ? stage.text : stage.muted,
                opacity: shown,
                transform: `translateY(${(1 - shown) * 10}px)`
              }}
            >
              <Working t={t} at={m.steps[i]} />
              {step}
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

// A purchase order in the list: its reference over how many products it has.
const Reference = ({ children, products }: { children: ReactNode; products: number }) => (
  <span style={{ display: "grid", lineHeight: 1.35 }}>
    <span style={{ fontWeight: 500 }}>{children}</span>
    <span style={{ fontSize: 13.5, color: app.muted }}>
      {products} {products === 1 ? "product" : "products"}
    </span>
  </span>
)

const orders: readonly { reference: string; products: number; supplier: string; status: StatusKey; value: string }[] = [
  { reference, products: 2, supplier: supplier.name, status: "submitted", value: cents(orderTotal) },
  { reference: "PO-1039", products: 1, supplier: otherSupplier.name, status: "submitted", value: cents(6420) },
  { reference: "PO-1036", products: 3, supplier: supplier.name, status: "closed", value: cents(9860) }
]

const columns = [
  { label: "Purchase order", width: 1.3 },
  { label: "Supplier", width: 1.9 },
  { label: "Status", width: 1.35 },
  { label: "Value", width: 1.15, align: "right" }
] as const

// The purchase order list's status tabs, with All chosen.
const Tabs = () => (
  <span
    style={{
      display: "inline-flex",
      justifySelf: "start",
      alignItems: "center",
      height: 38,
      padding: 3,
      borderRadius: 10,
      background: app.surface
    }}
  >
    {["All", "Draft", "With supplier", "Closed"].map((tab, i) => (
      <span
        key={tab}
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          padding: "0 12px",
          borderRadius: 8,
          background: i === 0 ? app.background : "transparent",
          boxShadow: i === 0 ? "0 1px 3px 0 oklch(0 0 0 / 0.1), 0 1px 2px -1px oklch(0 0 0 / 0.1)" : undefined,
          color: i === 0 ? app.foreground : "oklch(0.145 0 0 / 0.6)",
          fontSize: 16,
          fontWeight: 500
        }}
      >
        {tab}
      </span>
    ))}
  </span>
)

// The buyer's purchase orders, updating as the agent works: its new order arrives, then goes to the supplier.
const Orders = ({ t }: { t: number }) => {
  const created = t >= m.steps[1]
  const sent = t >= m.steps[2]
  const arrival = settle(t, m.steps[1], 18, 170)
  const highlight = 1 - ramp(t, m.steps[1] + 1.2, m.steps[1] + 3)
  const stats = [
    { label: "Open orders", value: created ? 7 : 6 },
    { label: "With suppliers", value: sent ? 4 : 3 },
    { label: "Drafts", value: created && !sent ? 2 : 1 }
  ]
  const fresh = {
    key: agentReference,
    cells: [
      <Reference key="reference" products={2}>
        {agentReference}
      </Reference>,
      supplier.name,
      <Status key="status" status={sent ? "submitted" : "draft"} />,
      cents(orderTotal)
    ],
    style: {
      minHeight: 62,
      background: `oklch(0.646 0.222 41.116 / ${0.1 * highlight})`,
      opacity: arrival,
      transform: `translateY(${(1 - arrival) * -16}px)`
    }
  }
  return (
    <div style={{ display: "grid", gap: 24, fontSize: 16 }}>
      <PageHeader
        title="Purchase orders"
        actions={
          <>
            <Button variant="outline" icon={FileUp}>
              Import
            </Button>
            <Button icon={Plus}>Create purchase order</Button>
          </>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {stats.map(({ label, value }) => (
          <Card key={label} style={{ display: "grid", gap: 4, padding: 18 }}>
            <span style={{ fontWeight: 500, color: app.muted }}>{label}</span>
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</span>
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <Tabs />
        <div style={{ overflow: "hidden", borderRadius: 10, boxShadow: `inset 0 0 0 1px ${app.border}` }}>
          <Table
            columns={columns}
            rows={[
              ...(created ? [fresh] : []),
              ...orders.map(({ reference: po, products, supplier: from, status, value }) => ({
                key: po,
                cells: [
                  <Reference key="reference" products={products}>
                    {po}
                  </Reference>,
                  from,
                  <Status key="status" status={status} />,
                  value
                ],
                style: { minHeight: 62 }
              }))
            ]}
          />
        </div>
      </div>
    </div>
  )
}

// 1:18 to 1:30, agents: the buyer's window carries over from the handoffs and turns to the purchase orders, where your
// agent's work lands as it runs the restock over MCP, and your partners' agents post their updates too.
export const Agents = ({ t }: { t: number }) => {
  const panel = settle(t, m.panels, 17, 110)
  const partner = (at: number) => settle(t, at, 16, 170)
  const carried = settle(t, 0, 17, 105)
  const ordersShown = ramp(t, 0.35, 0.8)
  // The camera pushes in on the agent's new order as it lands, and eases back once it's with the supplier.
  const onOrder = ramp(t, m.steps[1] - 0.5, m.steps[1] + 0.1) * (1 - ramp(t, m.steps[2] + 0.8, m.steps[2] + 1.4))
  return (
    <Feature
      t={t}
      number="05"
      name="Agents"
      lines={["Built for", "AI agents."]}
      accented={["AI", "agents."]}
      headlineAt={0.4}
      out={m.out}
      glow={{ x: 40, y: 70 }}
      glowFrom={{ x: 64, y: 60 }}
    >
      <Shot
        t={t}
        at={0}
        from={handoffsEnd}
        x={1370}
        y={560}
        turn={-8}
        zoom={0.22 * onOrder}
        focus={{ x: 55, y: 48 }}
        shift={{ x: -110 * onOrder, y: 0 }}
      >
        <AppWindow
          width={mixed(1060, 1000, carried)}
          height={mixed(700, 760, carried)}
          workspace={buyer}
          page="Purchase orders"
        >
          <div style={{ position: "absolute", inset: "26px 30px", opacity: 1 - ordersShown }}>
            {ordersShown < 1 ? <BuyerView t={sections.handoffs.to - sections.handoffs.from} /> : null}
          </div>
          <div
            style={{
              position: "absolute",
              inset: "26px 30px",
              opacity: ordersShown,
              transform: `translateX(${(1 - ordersShown) * 40}px)`
            }}
          >
            {ordersShown > 0 ? <Orders t={t} /> : null}
          </div>
        </AppWindow>
      </Shot>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 390,
          zIndex: 2,
          opacity: panel,
          transform: `translateY(${(1 - panel) * 60}px)`
        }}
      >
        <AgentPanel t={t} />
      </div>
      {m.partners.map((at, i) => {
        const shown = partner(at)
        return shown > 0 ? (
          <Toast
            key={at}
            icon={Bot}
            tone="primary"
            title={i === 0 ? `${supplier.name}’s agent` : `${forwarder.short}’s agent`}
            detail={i === 0 ? "Packing list submitted for purchase order 1043" : "Pickup booked for Dec 2"}
            style={{
              position: "absolute",
              right: 90,
              top: 150 + i * 96,
              zIndex: 3,
              opacity: shown,
              transform: `translateX(${(1 - shown) * 60}px)`
            }}
          />
        ) : null
      })}
    </Feature>
  )
}
