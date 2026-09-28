import { AlertTriangle, FileSpreadsheet, Mail, MessageCircle } from "lucide-react"
import type { ReactNode } from "react"
import { Easing } from "remotion"
import { supplier } from "../data"
import { mixed, ramp, settle } from "../motion"
import { font, stage } from "../theme"
import { moments } from "../timeline"
import { Badge } from "../ui"

// The mess a restock makes without Copacker: the pieces that pile up through the hook, then snap into order on the
// drop. Positions are the centers of each piece, on the 1920 by 1080 frame; `z` pushes a piece back into the distance.

type Piece = { x: number; y: number; z: number; rotate: number; at: number; width: number; height: number }

const { hook } = moments

const emails = [
  { from: supplier.name, subject: "Re: Re: Fwd: carton labels??", preview: "Can you resend them as PDF?" },
  { from: "Pacific Link Logistics", subject: "Where's the BOL?", preview: "Our warehouse is asking again" },
  { from: supplier.name, subject: "Packing list v3 FINAL (2)", preview: "Updated quantities attached" },
  { from: "Marketplace alerts", subject: "Action needed on a shipment", preview: "Boxes over the weight limit" },
  { from: "Saigon Packaging Co.", subject: "Proforma invoice attached", preview: "Please confirm by Friday" },
  { from: supplier.name, subject: "New ready date", preview: "Production slipped a week" },
  { from: "Pacific Link Logistics", subject: "Delivery window missed", preview: "Rebook the appointment?" },
  { from: "Marketplace alerts", subject: "Re: FNSKU labels", preview: "Which ones go on which box?" }
]
const emailPlaces = [
  [1450, 190, 40, 3],
  [430, 170, -120, -4],
  [1580, 420, -60, 5],
  [330, 760, 20, -3],
  [1380, 880, -200, 4],
  [620, 930, -80, -2],
  [1660, 660, -250, 6],
  [270, 420, -300, -6]
]
const sheets = ["Restock_plan_v7.xlsx", "Inventory_Oct.xlsx", "Shipping_tracker.xlsx", "Cartons_FINAL.xlsx"]
const sheetPlaces = [
  [560, 300, -180, -8],
  [1330, 330, -140, 7],
  [1180, 800, -40, -5],
  [470, 640, -260, 9]
]
const stamps = ["One SKU per carton", "Max 50 lb per box", "Suffocation warning", "FNSKU on every unit"]
const stampPlaces = [
  [820, 330, 30, -12],
  [1150, 560, 60, 9],
  [700, 790, 40, 7],
  [1330, 200, 10, -6]
]
const errors = [
  "Labels missing FNSKU",
  "Carton over 50 lb",
  "Delivery window missed",
  "Packing list doesn't match the PO",
  "Invoice total doesn't match",
  "Shipment stuck in Working"
]
const errorPlaces = [
  [360, 560, 100, -2],
  [1500, 740, 90, 3],
  [980, 250, 110, 2],
  [560, 460, 120, -4],
  [1250, 680, 130, 1],
  [860, 880, 140, -3]
]

const pose = ([x, y, z, rotate]: readonly number[]) => ({ x, y, z, rotate })

type Item = Piece & { key: string; slam?: boolean; render: (t: number) => ReactNode }

const glass = {
  borderRadius: 18,
  background: "rgba(38, 38, 42, 0.9)",
  border: "1px solid rgba(255, 255, 255, 0.09)",
  boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.7)",
  color: stage.text
} as const

const EmailCard = ({ from, subject, preview }: (typeof emails)[number]) => (
  <div style={{ ...glass, display: "flex", gap: 14, width: 400, padding: "14px 16px", fontFamily: font.sans }}>
    <span
      style={{
        display: "grid",
        placeItems: "center",
        flex: "none",
        width: 42,
        height: 42,
        borderRadius: 11,
        background: "linear-gradient(180deg, #4d95ff, #1f6fe8)"
      }}
    >
      <Mail size={22} color="#fff" />
    </span>
    <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: stage.muted }}>
        <span>{from}</span>
        <span>now</span>
      </span>
      <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap" }}>{subject}</span>
      <span style={{ fontSize: 14.5, color: stage.muted, whiteSpace: "nowrap" }}>{preview}</span>
    </span>
  </div>
)

// The header row is shaded, and one cell is flagged red: someone's mistake.
const cellColor = (index: number) => {
  if (index === 13) {
    return "#fde2e1"
  }
  return index < 5 ? "#f1f3f4" : "#fff"
}

const SheetCard = ({ name }: { name: string }) => (
  <div style={{ width: 360, overflow: "hidden", borderRadius: 12, background: "#fff", boxShadow: glass.boxShadow }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 36,
        padding: "0 12px",
        background: "#1d7a46",
        color: "#fff",
        fontFamily: font.sans,
        fontSize: 14,
        fontWeight: 500
      }}
    >
      <FileSpreadsheet size={16} />
      {name}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr)" }}>
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          style={{
            height: 30,
            borderRight: "1px solid #e3e5e8",
            borderBottom: "1px solid #e3e5e8",
            background: cellColor(i),
            display: "flex",
            alignItems: "center",
            padding: "0 6px"
          }}
        >
          {i % 5 === 0 || i < 5 ? null : (
            <div style={{ width: `${40 + ((i * 37) % 50)}%`, height: 6, borderRadius: 3, background: "#d7dade" }} />
          )}
        </div>
      ))}
    </div>
  </div>
)

const PdfCard = ({ name }: { name: string }) => (
  <div
    style={{
      display: "grid",
      alignContent: "start",
      gap: 10,
      width: 200,
      height: 250,
      padding: 16,
      borderRadius: 10,
      background: "#fff",
      boxShadow: glass.boxShadow,
      fontFamily: font.sans
    }}
  >
    <span
      style={{
        justifySelf: "start",
        padding: "3px 8px",
        borderRadius: 5,
        background: "#d93025",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700
      }}
    >
      PDF
    </span>
    {[82, 94, 70, 88, 60, 90, 76].map((width) => (
      <div key={width} style={{ width: `${width}%`, height: 7, borderRadius: 4, background: "#e3e5e8" }} />
    ))}
    <span style={{ marginTop: 6, fontFamily: font.mono, fontSize: 12.5, color: "#6b7280" }}>{name}</span>
  </div>
)

const ChatBubble = () => (
  <div style={{ display: "grid", gap: 6, width: 330, fontFamily: font.sans }}>
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: stage.muted }}>
      <MessageCircle size={16} />
      {supplier.name}
    </span>
    <span
      style={{
        ...glass,
        padding: "14px 18px",
        borderRadius: "18px 18px 18px 6px",
        background: "rgba(56, 56, 62, 0.95)",
        fontSize: 17
      }}
    >
      Can you resend the labels? The FBA ones don’t match our cartons.
    </span>
  </div>
)

const StampMark = ({ text }: { text: string }) => (
  <div
    style={{
      padding: "14px 26px",
      border: `4px solid ${stage.danger}`,
      outline: `2px solid ${stage.danger}`,
      outlineOffset: -11,
      borderRadius: 12,
      color: stage.danger,
      fontFamily: font.mono,
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      background: "rgba(9, 9, 11, 0.35)"
    }}
  >
    {text}
  </div>
)

const ErrorToast = ({ text }: { text: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "15px 20px",
      borderRadius: 14,
      background: "rgba(64, 16, 16, 0.94)",
      border: "1px solid rgba(255, 90, 79, 0.55)",
      boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.7)",
      color: stage.text,
      fontFamily: font.sans,
      fontSize: 17,
      fontWeight: 600,
      whiteSpace: "nowrap"
    }}
  >
    <AlertTriangle size={20} color={stage.danger} />
    {text}
  </div>
)

// A water bottle, drawn simply for the product card.
const Bottle = () => (
  <svg width={70} height={150} viewBox="0 0 70 150">
    <rect x={24} y={4} width={22} height={14} rx={4} fill="#3f3f46" />
    <path d="M22 18 H48 L52 34 Q60 42 60 56 V136 Q60 146 50 146 H20 Q10 146 10 136 V56 Q10 42 18 34 Z" fill="#a1a1aa" />
    <path d="M18 60 H52 V110 H18 Z" fill="#71717a" opacity={0.35} />
    <path d="M16 44 Q14 90 18 136" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.35} fill="none" />
  </svg>
)

// The best-seller, in stock until the hook's last line takes it out.
const ProductCard = ({ out }: { out: number }) => (
  <div
    style={{
      display: "grid",
      gap: 12,
      width: 300,
      padding: 18,
      borderRadius: 16,
      background: "#fff",
      boxShadow:
        out > 0 ? "0 0 0 3px rgba(255, 90, 79, 0.9), 0 30px 60px -12px rgba(255, 60, 40, 0.45)" : glass.boxShadow,
      fontFamily: font.sans,
      color: "#18181b"
    }}
  >
    <div style={{ display: "grid", placeItems: "center", height: 170, borderRadius: 10, background: "#f4f4f5" }}>
      <div style={{ opacity: 1 - out * 0.5 }}>
        <Bottle />
      </div>
    </div>
    <span style={{ fontSize: 19, fontWeight: 600 }}>Steel Bottle 32 oz</span>
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {out > 0 ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="success">In stock</Badge>}
      <span style={{ fontSize: 15, color: "#71717a" }}>{out > 0 ? "0 available" : "1,140 available"}</span>
    </span>
  </div>
)

const items: readonly Item[] = [
  {
    key: "product",
    ...pose([1600, 790, 80, 3]),
    at: 0.5,
    width: 300,
    height: 290,
    render: (t) => <ProductCard out={t >= hook.stockout ? 1 : 0} />
  },
  {
    key: "pdf-po",
    ...pose([760, 160, -350, -10]),
    at: hook.open[0],
    width: 200,
    height: 250,
    render: () => <PdfCard name="PO_4471.pdf" />
  },
  {
    key: "chat",
    ...pose([250, 260, -60, -3]),
    at: hook.open[1],
    width: 330,
    height: 120,
    render: () => <ChatBubble />
  },
  {
    key: "pdf-bol",
    ...pose([1700, 900, -320, 8]),
    at: hook.open[2],
    width: 200,
    height: 250,
    render: () => <PdfCard name="BOL_scan.pdf" />
  },
  ...emails.map((email, i) => ({
    key: `email-${i}`,
    ...pose(emailPlaces[i]),
    at: hook.emails[i],
    width: 400,
    height: 92,
    render: () => <EmailCard {...email} />
  })),
  ...sheets.map((name, i) => ({
    key: `sheet-${i}`,
    ...pose(sheetPlaces[i]),
    at: hook.sheets[i],
    width: 360,
    height: 216,
    render: () => <SheetCard name={name} />
  })),
  ...stamps.map((text, i) => ({
    key: `stamp-${i}`,
    ...pose(stampPlaces[i]),
    at: hook.stamps[i],
    width: 400,
    height: 76,
    slam: true,
    render: () => <StampMark text={text} />
  })),
  ...errors.map((text, i) => ({
    key: `error-${i}`,
    ...pose(errorPlaces[i]),
    at: hook.errors[i],
    width: 400,
    height: 62,
    render: () => <ErrorToast text={text} />
  }))
]

// Where a piece floats at `t` seconds into the hook: drifting, shaking harder toward the drop, still once it freezes.
const drifting = (item: Item, index: number, t: number) => {
  const moving = Math.min(t, hook.freeze)
  const seed = index * 1.7
  const shake = ramp(moving, 7, 9.4, Easing.in(Easing.quad)) * 10
  return {
    x: item.x + Math.sin(moving * 0.6 + seed) * 9 + Math.sin(moving * 41 + seed * 7) * shake,
    y: item.y + Math.cos(moving * 0.5 + seed * 1.3) * 9 + Math.cos(moving * 37 + seed * 5) * shake,
    rotate: item.rotate + Math.sin(moving * 0.4 + seed) * 2
  }
}

// The grid the pieces snap into on the drop: seven columns, four rows, every piece the same size.
const slot = (index: number) => {
  const width = 200
  const height = 124
  const gap = 18
  const columns = 7
  const left = 960 - (columns * width + (columns - 1) * gap) / 2
  const top = 540 - (4 * height + 3 * gap) / 2
  return {
    x: left + (index % columns) * (width + gap) + width / 2,
    y: top + Math.floor(index / columns) * (height + gap) + height / 2,
    scale: 0.92 * Math.min(width / items[index].width, height / items[index].height)
  }
}

type FieldProps = {
  // Seconds into the hook, for the pile-up; the reveal passes the hook's end.
  t: number
  // Seconds into the reveal, for the snap, or null during the hook.
  snap?: number | null
}

// Every piece of the mess, floating in depth. On the drop each snaps into the grid, then the grid flies into the app.
export const Chaos = ({ t, snap = null }: FieldProps) => {
  const frozen = ramp(t, hook.freeze, hook.freeze + 0.2)
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1600, perspectiveOrigin: "50% 50%" }}>
      {items.map((item, index) => {
        const arrive = settle(t, item.at, item.slam ? 12 : 15, item.slam ? 260 : 180)
        if (arrive <= 0) {
          return null
        }
        const float = drifting(item, index, t)
        const place = slot(index)
        const snapped = snap === null ? 0 : settle(snap, 0, 22, 260)
        const distance = Math.hypot(place.x - 960, place.y - 540) / 800
        const absorbed =
          snap === null ? 0 : ramp(snap, 0.32 + distance * 0.22, 0.72 + distance * 0.22, Easing.in(Easing.cubic))
        const x = mixed(mixed(float.x, place.x, snapped), 960, absorbed)
        const y = mixed(mixed(float.y, place.y, snapped), 600, absorbed)
        const z = mixed(item.z - (1 - arrive) * 220, 0, snapped)
        const rotate = mixed(float.rotate, 0, snapped)
        const landing = item.slam ? 1 + (1 - arrive) * 0.8 : 0.6 + 0.4 * arrive
        const scale = mixed(landing, place.scale, snapped) * (1 - 0.85 * absorbed)
        const blur = Math.max(0, -z - 150) / 90
        const gray = frozen * (1 - snapped)
        return (
          <div
            key={item.key}
            style={{
              position: "absolute",
              left: x,
              top: y,
              opacity: Math.min(1, arrive * 2) * (1 + Math.min(z, 0) / 1100) * (1 - absorbed),
              transform: `translate(-50%, -50%) translateZ(${z}px) rotate(${rotate}deg) scale(${scale})`,
              filter: `${blur > 0.2 ? `blur(${blur}px) ` : ""}grayscale(${gray}) brightness(${1 - 0.4 * gray})`
            }}
          >
            {item.render(t)}
          </div>
        )
      })}
    </div>
  )
}
