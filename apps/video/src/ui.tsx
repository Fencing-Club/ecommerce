import {
  BookOpen,
  Box,
  Check,
  ChevronsUpDown,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  PackagePlus,
  PanelLeft,
  Receipt,
  Settings,
  Ship,
  Truck,
  Users
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { app, font } from "./theme"

// Copacker's interface, rebuilt for the ad at about 1.25 times the app's own sizes so it reads on screen.

type Kind = "Buyer" | "Supplier" | "Forwarder"

const navigation: Record<Kind, readonly (readonly [string, LucideIcon])[]> = {
  Buyer: [
    ["Overview", LayoutDashboard],
    ["Purchase orders", ClipboardList],
    ["Orders", Receipt],
    ["Products", Box],
    ["Restock", PackagePlus],
    ["Shipments", Truck],
    ["Suppliers", Users],
    ["Forwarders", Ship],
    ["Settings", Settings]
  ],
  Supplier: [
    ["Purchase orders", ClipboardList],
    ["Shipments", Truck],
    ["Catalog", BookOpen],
    ["Settings", Settings]
  ],
  Forwarder: [
    ["Purchase orders", ClipboardList],
    ["Settings", Settings]
  ]
}

// Copacker's mark: the orange tile with the box icon.
export const Mark = ({ size, style }: { size: number; style?: CSSProperties }) => (
  <div
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: size,
      height: size,
      borderRadius: size * 0.3125,
      background: app.primary,
      ...style
    }}
  >
    <Box size={size * 0.5} color={app.primaryForeground} strokeWidth={2} />
  </div>
)

const Sidebar = ({ workspace, kind, active }: { workspace: string; kind: Kind; active: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 18,
      flex: "none",
      width: 250,
      padding: "18px 14px",
      background: app.sidebar,
      borderRight: `1px solid ${app.border}`
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px" }}>
      <Mark size={38} />
      <div style={{ display: "grid", flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <span
          style={{ overflow: "hidden", fontSize: 16, fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {workspace}
        </span>
        <span style={{ fontSize: 13.5, color: app.muted }}>{kind} workspace</span>
      </div>
      <ChevronsUpDown size={16} color={app.muted} />
    </div>
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ padding: "4px 10px", fontSize: 13, fontWeight: 500, color: app.muted }}>Workspace</span>
      {navigation[kind].map(([label, Icon]) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "9px 10px",
            borderRadius: 9,
            background: label === active ? app.surface : "transparent",
            fontSize: 15.5,
            fontWeight: label === active ? 600 : 450
          }}
        >
          <Icon size={18} strokeWidth={1.8} color={label === active ? app.foreground : app.muted} />
          {label}
        </div>
      ))}
    </div>
  </div>
)

type WindowProps = {
  width: number
  height: number
  workspace: string
  kind?: Kind
  // The page's name in the top bar and the sidebar item that's lit.
  page: string
  children: ReactNode
  style?: CSSProperties
}

// The app's window: the sidebar for the workspace's role, the top bar, and the page.
export const AppWindow = ({ width, height, workspace, kind = "Buyer", page, children, style }: WindowProps) => (
  <div
    style={{
      display: "flex",
      width,
      height,
      overflow: "hidden",
      borderRadius: 20,
      background: app.background,
      color: app.foreground,
      fontFamily: font.sans,
      boxShadow:
        "0 0 0 1px rgba(255, 255, 255, 0.14), 0 60px 120px -30px rgba(0, 0, 0, 0.75), 0 30px 60px -30px rgba(0, 0, 0, 0.6)",
      ...style
    }}
  >
    <Sidebar workspace={workspace} kind={kind} active={page} />
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flex: "none",
          height: 56,
          padding: "0 22px",
          borderBottom: `1px solid ${app.border}`,
          fontSize: 15.5,
          fontWeight: 500
        }}
      >
        <PanelLeft size={18} strokeWidth={1.8} color={app.muted} />
        <div style={{ width: 1, height: 18, background: app.border }} />
        {page}
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", padding: "26px 30px" }}>{children}</div>
    </div>
  </div>
)

export const PageTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
    <span style={{ flex: 1, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{children}</span>
    {aside}
  </div>
)

export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      padding: 22,
      borderRadius: 14,
      border: `1px solid ${app.border}`,
      background: app.background,
      color: app.foreground,
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      ...style
    }}
  >
    {children}
  </div>
)

export const CardTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
    <span style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>{children}</span>
    {aside}
  </div>
)

const tones = {
  neutral: { background: app.surface, color: app.foreground },
  success: { background: app.successSoft, color: app.success },
  warning: { background: app.warningSoft, color: app.warning },
  danger: { background: app.dangerSoft, color: app.danger },
  primary: { background: app.primarySoft, color: app.primary }
}

export type Tone = keyof typeof tones

export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      whiteSpace: "nowrap",
      ...tones[tone]
    }}
  >
    {children}
  </span>
)

type ButtonProps = {
  children: ReactNode
  variant?: "primary" | "outline"
  // How far into a click the button is, 0 to 1: it dips while pressed.
  press?: number
  // A ring of light around it, 0 to 1, drawing the eye just before it's clicked.
  ring?: number
  icon?: LucideIcon
  style?: CSSProperties
}

// The ring before a click at `at`: it grows in over half a second, then fades as the click lands.
export const ringFor = (t: number, at: number) =>
  Math.min(Math.max((t - (at - 0.7)) / 0.5, 0), 1) * (1 - Math.min(Math.max((t - at) / 0.3, 0), 1))

export const Button = ({ children, variant = "primary", press = 0, ring = 0, icon: Icon, style }: ButtonProps) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 42,
      padding: "0 18px",
      borderRadius: 10,
      fontSize: 16,
      fontWeight: 600,
      whiteSpace: "nowrap",
      transform: `scale(${1 - 0.06 * Math.sin(Math.PI * press)})`,
      boxShadow: ring > 0 ? `0 0 0 ${6 * ring}px oklch(0.646 0.222 41.116 / ${0.28 * ring})` : undefined,
      ...(variant === "primary"
        ? { background: app.primary, color: "#fff" }
        : { background: app.background, color: app.foreground, border: `1px solid ${app.border}` }),
      ...style
    }}
  >
    {Icon ? <Icon size={18} strokeWidth={2} /> : null}
    {children}
  </span>
)

export const Checkbox = ({ checked }: { checked: number }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      width: 20,
      height: 20,
      borderRadius: 6,
      border: `1.5px solid ${checked > 0.5 ? app.primary : "oklch(0.8 0 0)"}`,
      background: checked > 0.5 ? app.primary : app.background
    }}
  >
    {checked > 0.5 ? <Check size={14} color="#fff" strokeWidth={3} style={{ transform: `scale(${checked})` }} /> : null}
  </span>
)

type Column = { label: string; width: number; align?: "left" | "right" }

// A table in the app's style: quiet headers, ruled rows. `rows` may carry their own style for entrances and highlights.
export const Table = ({
  columns,
  rows,
  header = true
}: {
  columns: readonly Column[]
  rows: readonly { key: string; cells: readonly ReactNode[]; style?: CSSProperties }[]
  // Off for a table continued below something inserted between its rows.
  header?: boolean
}) => {
  const template = columns.map(({ width }) => `${width}fr`).join(" ")
  return (
    <div style={{ display: "grid", fontSize: 16 }}>
      {header ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: template,
            alignItems: "center",
            height: 42,
            borderBottom: `1px solid ${app.border}`,
            color: app.muted,
            fontSize: 14.5,
            fontWeight: 500
          }}
        >
          {columns.map(({ label, align }) => (
            <span key={label} style={{ padding: "0 12px", textAlign: align ?? "left" }}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {rows.map(({ key, cells, style }) => (
        <div
          key={key}
          style={{
            display: "grid",
            gridTemplateColumns: template,
            alignItems: "center",
            minHeight: 54,
            borderBottom: `1px solid ${app.border}`,
            ...style
          }}
        >
          {cells.map((cell, i) => (
            <span
              key={columns[i].label}
              style={{
                padding: "0 12px",
                textAlign: columns[i].align ?? "left",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

type CursorProps = {
  x: number
  y: number
  // Seconds since the last click, or null when it hasn't clicked: a ring spreads out from the tip.
  clicked?: number | null
  // The arrow's fill, for other people's and agents' cursors.
  fill?: string
}

// A pointer, with a ring that spreads from its tip on a click.
export const Cursor = ({ x, y, clicked = null, fill = app.foreground }: CursorProps) => {
  const ring = clicked !== null && clicked >= 0 && clicked < 0.5 ? clicked / 0.5 : null
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {ring === null ? null : (
        <div
          style={{
            position: "absolute",
            left: -22 * (0.4 + ring),
            top: -22 * (0.4 + ring),
            width: 44 * (0.4 + ring),
            height: 44 * (0.4 + ring),
            borderRadius: "50%",
            border: `3px solid ${app.primary}`,
            opacity: 1 - ring
          }}
        />
      )}
      <svg
        width={30}
        height={38}
        viewBox="0 0 30 38"
        style={{
          overflow: "visible",
          filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35))",
          transform: `scale(${ring !== null && ring < 0.3 ? 0.88 : 1})`,
          transformOrigin: "3px 2px"
        }}
      >
        <path
          d="M3 2 L3 29 L10 22.5 L14.5 33 L19.5 31 L15 20.5 L24.5 20.5 Z"
          fill={fill}
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// A label floating on the stage above a window, saying whose view it is.
export const Tag = ({
  icon: Icon,
  children,
  style
}: {
  icon: LucideIcon
  children: ReactNode
  style?: CSSProperties
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 18px",
      borderRadius: 999,
      background: "rgba(24, 24, 27, 0.88)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      color: "#fafafa",
      fontFamily: font.sans,
      fontSize: 19,
      fontWeight: 500,
      whiteSpace: "nowrap",
      ...style
    }}
  >
    <Icon size={20} strokeWidth={1.9} color="#ff8a3d" />
    {children}
  </div>
)

type ToastProps = { icon: LucideIcon; title: string; detail?: string; tone?: Tone; style?: CSSProperties }

// A notification in the corner of the app.
export const Toast = ({ icon: Icon, title, detail, tone = "success", style }: ToastProps) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 18px",
      borderRadius: 14,
      background: app.background,
      border: `1px solid ${app.border}`,
      boxShadow: "0 18px 40px -12px rgba(0, 0, 0, 0.3)",
      whiteSpace: "nowrap",
      ...style
    }}
  >
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 34,
        height: 34,
        borderRadius: 10,
        ...tones[tone]
      }}
    >
      <Icon size={19} strokeWidth={2.2} />
    </span>
    <span style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      {detail ? <span style={{ fontSize: 14, color: app.muted }}>{detail}</span> : null}
    </span>
  </div>
)
