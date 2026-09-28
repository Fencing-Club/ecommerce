import {
  Bell,
  BookOpen,
  Box,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  PackagePlus,
  PanelLeft,
  Receipt,
  Search,
  Settings,
  Tag as PriceTag,
  Truck,
  Users,
  Warehouse
} from "lucide-react"
import { type CSSProperties, Fragment, type ReactNode } from "react"
import type { Workspace } from "./data"
import { app, font } from "./theme"

// Copacker's interface, rebuilt for the ad at a little over the app's own sizes so it reads on screen: the app header
// across the top, the workspace's sidebar under it, and the shadcn components the pages are made of
// (apps/copacker/src/components).

type Item = readonly [label: string, icon: LucideIcon]

// Each workspace's sidebar, as apps/copacker/src/lib/navigation.ts lays it out: Overview on its own, then the named
// groups. Settings sits on its own at the bottom.
const navigation: Record<Workspace["kind"], { top: readonly Item[]; groups: readonly [string, readonly Item[]][] }> = {
  Buyer: {
    top: [["Overview", LayoutDashboard]],
    groups: [
      [
        "Store",
        [
          ["Orders", Receipt],
          ["Products", Box],
          ["Restock", PackagePlus]
        ]
      ],
      [
        "Purchasing",
        [
          ["Purchase orders", ClipboardList],
          ["Shipments", Truck],
          ["Partners", Users]
        ]
      ]
    ]
  },
  Supplier: {
    top: [["Overview", LayoutDashboard]],
    groups: [
      [
        "Sales",
        [
          ["Orders", ClipboardList],
          ["Shipments", Truck],
          ["Customers", Building2]
        ]
      ],
      [
        "Products",
        [
          ["Products", PriceTag],
          ["Inventory", Warehouse],
          ["Catalogs", BookOpen]
        ]
      ]
    ]
  },
  Forwarder: { top: [], groups: [["Purchasing", [["Purchase orders", ClipboardList]]]] }
}

// "RG" for Ridgeline Goods, as the app's avatars show a name.
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()

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

const Kbd = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      display: "inline-grid",
      placeItems: "center",
      minWidth: 23,
      height: 23,
      padding: "0 6px",
      borderRadius: 5,
      background: app.surface,
      color: app.muted,
      fontSize: 13.5,
      fontWeight: 500
    }}
  >
    {children}
  </span>
)

// The app header across the top of every page: the logo, search in the middle, and notifications.
const Header = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr minmax(0, 470px) 1fr",
      alignItems: "center",
      gap: 18,
      flex: "none",
      height: 56,
      padding: "0 18px",
      borderBottom: `1px solid ${app.border}`
    }}
  >
    <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600 }}>
      <Mark size={34} />
      Copacker
    </span>
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 38,
        padding: "0 10px",
        borderRadius: 10,
        border: `1px solid ${app.border}`,
        background: "oklch(0.97 0 0 / 0.5)",
        color: app.muted,
        fontSize: 16
      }}
    >
      <Search size={17} strokeWidth={2} />
      Search
      <span style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </span>
    <Bell size={19} strokeWidth={2} style={{ justifySelf: "end", marginRight: 9 }} />
  </div>
)

const NavItem = ({ item: [label, Icon], active }: { item: Item; active: boolean }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      height: 37,
      padding: "0 10px",
      borderRadius: 8,
      background: active ? app.surface : "transparent",
      color: active ? app.secondaryForeground : app.foreground,
      fontSize: 16,
      fontWeight: active ? 500 : 400
    }}
  >
    <Icon size={18} strokeWidth={1.9} />
    {label}
  </div>
)

// A square avatar with someone's initials: a workspace's, or a person's with a larger radius.
const Avatar = ({ name, person = false }: { name: string; person?: boolean }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: 36,
      height: 36,
      borderRadius: person ? 10 : 8,
      border: `1px solid ${app.border}`,
      background: app.surface,
      color: person ? app.muted : app.foreground,
      fontSize: person ? 15 : 12.5,
      fontWeight: person ? 400 : 500
    }}
  >
    {initials(name)}
  </span>
)

// A name over a line of detail, cut short to fit, beside an avatar in the sidebar.
const Identity = ({ name, detail, person = false }: { name: string; detail: string; person?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, height: 54, padding: "0 9px" }}>
    <Avatar name={name} person={person} />
    <div style={{ display: "grid", flex: 1, minWidth: 0, lineHeight: 1.3 }}>
      <span
        style={{ overflow: "hidden", fontSize: 16, fontWeight: 500, textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {name}
      </span>
      <span
        style={{ overflow: "hidden", fontSize: 13.5, color: app.muted, textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {detail}
      </span>
    </div>
    <ChevronsUpDown size={17} color={app.muted} style={{ flex: "none" }} />
  </div>
)

const Sidebar = ({ workspace, active }: { workspace: Workspace; active: string }) => {
  const { top, groups } = navigation[workspace.kind]
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "none",
        width: 250,
        padding: 9,
        background: app.sidebar,
        borderRight: `1px solid ${app.border}`
      }}
    >
      <Identity name={workspace.name} detail={`${workspace.kind} workspace`} />
      {top.length ? (
        <div style={{ padding: "9px 0 0" }}>
          {top.map((item) => (
            <NavItem key={item[0]} item={item} active={item[0] === active} />
          ))}
        </div>
      ) : null}
      {groups.map(([label, items]) => (
        <div key={label} style={{ display: "grid", gap: 4, paddingTop: 9 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              height: 32,
              padding: "0 10px",
              color: "oklch(0.145 0 0 / 0.7)",
              fontSize: 13.5,
              fontWeight: 500
            }}
          >
            {label}
          </span>
          {items.map((item) => (
            <NavItem key={item[0]} item={item} active={item[0] === active} />
          ))}
        </div>
      ))}
      <div style={{ marginTop: "auto", paddingBottom: 9 }}>
        <NavItem item={["Settings", Settings]} active={active === "Settings"} />
      </div>
      <Identity name={workspace.person.name} detail={workspace.person.email} person />
    </div>
  )
}

type WindowProps = {
  width: number
  height: number
  workspace: Workspace
  // The page's item in the sidebar, which is lit.
  page: string
  children: ReactNode
  style?: CSSProperties
}

// The app's window: the header across the top, the workspace's sidebar under it, and the page beside the sidebar,
// 250 pixels in from the window's left and 56 down from its top.
export const AppWindow = ({ width, height, workspace, page, children, style }: WindowProps) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
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
    <Header />
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Sidebar workspace={workspace} active={page} />
      <div style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden", padding: "26px 30px" }}>
        {children}
      </div>
    </div>
  </div>
)

type HeaderProps = {
  title: ReactNode
  // The pages a record's page belongs to, leading its title: Purchase orders › PO-1042.
  parents?: readonly string[]
  badge?: ReactNode
  // A line under the title.
  description?: ReactNode
  actions?: ReactNode
}

// A page's first row: the sidebar's collapse button, the title after its parents, a status badge and the page's
// actions on the right.
export const PageHeader = ({ title, parents = [], badge, description, actions }: HeaderProps) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
      <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, marginLeft: -7 }}>
        <PanelLeft size={18} strokeWidth={1.9} />
      </span>
      {parents.map((parent) => (
        <Fragment key={parent}>
          <span style={{ fontSize: 16, color: app.muted, whiteSpace: "nowrap" }}>{parent}</span>
          <ChevronRight size={18} color={app.muted} style={{ flex: "none" }} />
        </Fragment>
      ))}
      <span
        style={{ fontSize: parents.length ? 23 : 28, fontWeight: 600, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
      >
        {title}
      </span>
      {badge}
      {actions ? <span style={{ display: "flex", gap: 9, marginLeft: "auto" }}>{actions}</span> : null}
    </div>
    {description ? <span style={{ paddingLeft: 35, fontSize: 16, color: app.muted }}>{description}</span> : null}
  </div>
)

export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      padding: 20,
      borderRadius: 16,
      background: app.background,
      color: app.foreground,
      boxShadow: `0 0 0 1px ${app.ring}`,
      ...style
    }}
  >
    {children}
  </div>
)

export const CardTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
    <span style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>{children}</span>
    {aside}
  </div>
)

// Every status reads in one of five tones, as the app's Status badge (apps/copacker/src/components/common.tsx) keys
// them: neutral when not started or closed, info while in progress, success when done, warning when someone needs to
// act, and destructive when stock runs out.
const tones = {
  neutral: app.muted,
  info: app.info,
  success: app.success,
  warning: app.warning,
  destructive: app.danger
}

const statuses = {
  draft: ["Draft", "neutral"],
  submitted: ["With supplier", "info"],
  closed: ["Closed", "neutral"],
  packing: ["Packing", "info"],
  creating: ["Creating shipment", "info"],
  ready: ["Ready for pickup", "success"],
  shipped: ["Shipped", "info"],
  forwarded: ["Shipped by forwarder", "info"],
  in_stock: ["In stock", "success"],
  reorder_soon: ["Reorder soon", "warning"],
  reorder_now: ["Reorder now", "destructive"],
  out_of_stock: ["Out of stock", "destructive"]
} as const satisfies Record<string, readonly [string, keyof typeof tones]>

export type StatusKey = keyof typeof statuses

// A status badge: a pill tinted in its tone, with a dot in front.
export const Status = ({ status }: { status: StatusKey }) => {
  const [label, tone] = statuses[status]
  const color = tones[tone]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 25,
        padding: "0 10px",
        borderRadius: 999,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 20%, transparent)`,
        color: `color-mix(in oklab, ${color} 60%, ${app.foreground})`,
        fontSize: 14,
        fontWeight: 500,
        whiteSpace: "nowrap"
      }}
    >
      <span style={{ flex: "none", width: 7, height: 7, borderRadius: 4, background: color }} />
      {label}
    </span>
  )
}

const badges = {
  default: { background: app.primary, color: app.primaryForeground },
  secondary: { background: app.surface, color: app.secondaryForeground },
  destructive: { background: "oklch(0.577 0.245 27.325 / 0.1)", color: app.danger },
  outline: { background: "transparent", color: app.foreground, boxShadow: `inset 0 0 0 1px ${app.border}` }
}

// shadcn's Badge, for a count or a state that isn't a status, such as Connected.
export const Badge = ({ variant = "secondary", children }: { variant?: keyof typeof badges; children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      height: 25,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 14,
      fontWeight: 500,
      whiteSpace: "nowrap",
      ...badges[variant]
    }}
  >
    {children}
  </span>
)

type ButtonProps = {
  children?: ReactNode
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm"
  // How far into a click the button is, 0 to 1: it dips while pressed.
  press?: number
  // A ring of light around it, 0 to 1, drawing the eye just before it's clicked.
  ring?: number
  icon?: LucideIcon
  // An icon after the label, such as a menu's chevron.
  iconEnd?: LucideIcon
  style?: CSSProperties
}

// The ring before a click at `at`: it grows in over half a second, then fades as the click lands.
export const ringFor = (t: number, at: number) =>
  Math.min(Math.max((t - (at - 0.7)) / 0.5, 0), 1) * (1 - Math.min(Math.max((t - at) / 0.3, 0), 1))

const buttonVariants = {
  default: { background: app.primary, color: app.primaryForeground },
  outline: { background: app.background, color: app.foreground, boxShadow: `inset 0 0 0 1px ${app.border}` },
  ghost: { background: "transparent", color: app.foreground }
}

export const Button = ({
  children,
  variant = "default",
  size = "default",
  press = 0,
  ring = 0,
  icon: Icon,
  iconEnd: IconEnd,
  style
}: ButtonProps) => {
  const small = size === "sm"
  const height = small ? 35 : 40
  const rings = [
    ring > 0 ? `0 0 0 ${6 * ring}px oklch(0.646 0.222 41.116 / ${0.28 * ring})` : null,
    variant === "outline" ? buttonVariants.outline.boxShadow : null
  ].filter(Boolean)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height,
        // A button with only an icon is square.
        padding: children ? `0 ${small ? 11 : 12}px` : 0,
        width: children ? undefined : height,
        borderRadius: small ? 9 : 10,
        fontSize: small ? 15 : 16,
        fontWeight: 500,
        whiteSpace: "nowrap",
        transform: `scale(${1 - 0.06 * Math.sin(Math.PI * press)})`,
        ...buttonVariants[variant],
        boxShadow: rings.length ? rings.join(", ") : undefined,
        ...style
      }}
    >
      {Icon ? <Icon size={small ? 16 : 18} strokeWidth={2} /> : null}
      {children}
      {IconEnd ? <IconEnd size={small ? 16 : 18} strokeWidth={2} /> : null}
    </span>
  )
}

export const Checkbox = ({ checked }: { checked: number }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: 20,
      height: 20,
      borderRadius: 5,
      border: `1px solid ${checked > 0.5 ? app.primary : "oklch(0.87 0 0)"}`,
      background: checked > 0.5 ? app.primary : app.background
    }}
  >
    {checked > 0.5 ? (
      <Check size={16} color={app.primaryForeground} strokeWidth={2.6} style={{ transform: `scale(${checked})` }} />
    ) : null}
  </span>
)

// A select's closed trigger, as the toolbars show one: an icon, its value, and a chevron.
export const Select = ({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: 40,
      padding: "0 10px 0 12px",
      borderRadius: 10,
      boxShadow: `inset 0 0 0 1px ${app.border}`,
      fontSize: 16,
      whiteSpace: "nowrap"
    }}
  >
    {Icon ? <Icon size={18} color={app.muted} strokeWidth={1.9} /> : null}
    {children}
    <ChevronDown size={17} color={app.muted} style={{ marginLeft: 6 }} />
  </span>
)

// A number field with its label before it and its unit after, as Restock's toolbar shows the days.
export const NumberField = ({ label, value, unit }: { label: string; value: ReactNode; unit: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      height: 40,
      padding: "0 12px",
      borderRadius: 10,
      boxShadow: `inset 0 0 0 1px ${app.border}`,
      fontSize: 16,
      whiteSpace: "nowrap"
    }}
  >
    <span style={{ color: app.muted, fontWeight: 500 }}>{label}</span>
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    <span style={{ color: app.muted }}>{unit}</span>
  </span>
)

// A product's picture, drawn as its kind for the demo's products.
export const Thumb = ({ icon: Icon }: { icon: LucideIcon }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: 42,
      height: 42,
      borderRadius: 9,
      border: `1px solid ${app.border}`,
      background: "oklch(0.97 0 0 / 0.6)",
      color: app.muted
    }}
  >
    <Icon size={19} strokeWidth={1.8} />
  </span>
)

// A stop on a purchase order's route: a grey pill with its icon.
export const RoutePill = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 34,
      padding: "0 14px",
      borderRadius: 999,
      background: app.surface,
      fontSize: 16,
      fontWeight: 500,
      whiteSpace: "nowrap"
    }}
  >
    <Icon size={18} strokeWidth={1.9} />
    {children}
  </span>
)

type AlertProps = {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  destructive?: boolean
  // The icon's color, when it keeps its own, like the primary icon of a ready packet.
  iconColor?: string
  action?: ReactNode
  style?: CSSProperties
}

// shadcn's Alert: an icon, a title and an optional description, and an action on the right.
export const Alert = ({
  icon: Icon,
  title,
  description,
  destructive = false,
  iconColor,
  action,
  style
}: AlertProps) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      columnGap: 10,
      rowGap: 2,
      padding: "11px 14px",
      borderRadius: 10,
      boxShadow: `inset 0 0 0 1px ${app.border}`,
      background: app.background,
      color: destructive ? app.danger : app.foreground,
      fontSize: 16,
      ...style
    }}
  >
    <Icon
      size={18}
      strokeWidth={2}
      color={iconColor ?? "currentColor"}
      style={{ gridRow: description ? "span 2" : undefined, alignSelf: "start", marginTop: 2 }}
    />
    <span style={{ fontWeight: 500 }}>{title}</span>
    {action ? <span style={{ gridRow: description ? "span 2" : undefined }}>{action}</span> : <span />}
    {description ? (
      <span style={{ gridColumn: 2, color: destructive ? "oklch(0.577 0.245 27.325 / 0.9)" : app.muted }}>
        {description}
      </span>
    ) : null}
  </div>
)

// A column's share of the width, or a fixed width such as "48px". A hidden label is for a column of checkboxes or
// buttons, which the app names only for screen readers.
type Column = { label: string; width: number | string; align?: "left" | "right"; hidden?: boolean }

// A table in the app's style: a shaded header, ruled rows, and the first and last columns in line with the card's
// content when it runs edge to edge. `rows` may carry their own style for entrances and highlights.
export const Table = ({
  columns,
  rows,
  header = true,
  small = false,
  inset = 12,
  fontSize = 16
}: {
  columns: readonly Column[]
  rows: readonly { key: string; cells: readonly ReactNode[]; style?: CSSProperties }[]
  // Off for a table continued below something inserted between its rows.
  header?: boolean
  // A quieter header in small grey type, as the purchase order's products have.
  small?: boolean
  // The first and last columns' padding.
  inset?: number
  // A little smaller for a table with many columns.
  fontSize?: number
}) => {
  const template = columns.map(({ width }) => (typeof width === "number" ? `${width}fr` : width)).join(" ")
  const padding = (i: number) => `0 ${i === columns.length - 1 ? inset : 10}px 0 ${i === 0 ? inset : 10}px`
  return (
    <div style={{ display: "grid", fontSize }}>
      {header ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: template,
            alignItems: "center",
            height: small ? 38 : 46,
            background: small ? "oklch(0.97 0 0 / 0.5)" : app.surface,
            borderBottom: `1px solid ${app.border}`,
            color: small ? app.muted : app.foreground,
            fontSize: small ? 13.5 : fontSize,
            fontWeight: 500
          }}
        >
          {columns.map(({ label, align, hidden }, i) => (
            <span key={label} style={{ padding: padding(i), textAlign: align ?? "left", whiteSpace: "nowrap" }}>
              {hidden ? null : label}
            </span>
          ))}
        </div>
      ) : null}
      {rows.map(({ key, cells, style }, row) => (
        <div
          key={key}
          style={{
            display: "grid",
            gridTemplateColumns: template,
            alignItems: "center",
            minHeight: 54,
            borderBottom: row < rows.length - 1 ? `1px solid ${app.border}` : undefined,
            ...style
          }}
        >
          {cells.map((cell, i) => (
            <span
              key={columns[i].label}
              style={{
                padding: padding(i),
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

// A store's mark in its brand colors on a white tile, as Settings shows each store (apps/copacker/src/components/
// store-logos.tsx).
export const StoreLogo = ({ store }: { store: "shopify" | "amazon" | "ebay" }) => (
  <span
    style={{
      display: "grid",
      placeItems: "center",
      flex: "none",
      width: 46,
      height: 46,
      borderRadius: 10,
      border: `1px solid ${app.border}`,
      background: "#fff",
      boxShadow: "0 1px 2px 0 oklch(0 0 0 / 0.05)"
    }}
  >
    {store === "shopify" ? (
      <svg viewBox="0 0 39 43" width={27} height={30}>
        <path
          fill="#95BF47"
          d="M33.3 8.9s0-.2-.1-.3-.2-.1-.2-.1l-3.4-.2-2.1-2.1c-.1-.1-.2-.1-.3-.1l-1.8 36.1L38 39.5zm-7.5-3-.9.3c-.6-1.6-1.3-2.8-2.3-3.5-.7-.5-1.5-.7-2.3-.6l-.6-.6c-.9-.7-2.1-.9-3.6-.3C11.8 2.7 10 8.3 9.3 11l-3.8 1.1s-.9.2-1.1.5-.3 1-.3 1L.9 37.9l23.6 4.4L26.3 6c-.2-.2-.4-.1-.5-.1m-5.7 1.7L16 8.9c.5-2.1 1.6-4.3 3.6-5.1.4 1 .5 2.5.5 3.8m-3.5-5.2q1.35-.45 2.1 0c-2.7 1.2-3.9 4.3-4.4 6.9l-3.3 1c.7-2.5 2.3-6.7 5.6-7.9m2.3 17.9c-.2-.1-.4-.2-.7-.3s-.5-.2-.8-.3-.6-.1-1-.2h-1.1c-.3 0-.6.1-.9.2s-.5.2-.7.4-.3.4-.4.6-.2.5-.2.7 0 .4.1.6l.3.6.6.6c.2.2.5.4.8.6.5.3.9.6 1.4 1s.9.8 1.2 1.3c.4.5.7 1 .9 1.7q.3.9.3 2.1c-.1 1.2-.3 2.3-.8 3.2-.4.9-1.1 1.6-1.8 2.1s-1.6.8-2.5.9-1.9.1-2.8-.2c-.5-.1-.9-.3-1.3-.4l-1.2-.6c-.3-.2-.7-.4-.9-.6-.3-.2-.5-.4-.7-.7L7.8 30c.2.2.4.3.7.5s.6.4.9.5c.3.2.7.3 1 .5.4.1.7.2 1.1.3h.8c.2-.1.5-.2.6-.3.2-.1.3-.3.4-.5s.1-.4.2-.7c0-.2 0-.5-.1-.7s-.2-.4-.3-.7c-.1-.2-.3-.4-.6-.7-.2-.2-.5-.5-.9-.7-.4-.3-.8-.6-1.2-1-.3-.4-.7-.7-.9-1.2-.2-.4-.4-.9-.6-1.4-.1-.5-.2-1-.2-1.6 0-1 .2-1.8.6-2.6.3-.8.8-1.5 1.4-2.2.6-.6 1.3-1.2 2.2-1.6s1.8-.7 2.9-.9c.5-.1 1-.1 1.4-.1.5 0 .9 0 1.3.1s.8.1 1.1.2l.9.3zm2.6-13.1v-.5c0-1.3-.2-2.4-.5-3.2q.45 0 .9.3c.8.5 1.3 1.6 1.7 2.8z"
        />
      </svg>
    ) : null}
    {store === "amazon" ? (
      <svg viewBox="0 0 24 24" width={32} height={32}>
        <text
          x="12"
          y="14.5"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="15"
          fontWeight="700"
          fill="#232F3E"
        >
          a
        </text>
        <path d="M4.6 17c4.5 3 10.2 3.1 14.8.3" fill="none" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M17.2 16.1l2.6 1.1-.9 2.6"
          fill="none"
          stroke="#FF9900"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : null}
    {store === "ebay" ? (
      <svg viewBox="0 0 40 18" width={37} height={17}>
        <text
          x="20"
          y="14"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="16"
          fontWeight="700"
          letterSpacing="-1.2"
        >
          <tspan fill="#E53238">e</tspan>
          <tspan fill="#0064D2">b</tspan>
          <tspan fill="#F5AF02">a</tspan>
          <tspan fill="#86B817">y</tspan>
        </text>
      </svg>
    ) : null}
  </span>
)

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

const toastTones = {
  success: { background: `color-mix(in oklab, ${app.success} 12%, transparent)`, color: app.success },
  primary: { background: "oklch(0.646 0.222 41.116 / 0.12)", color: app.primary }
}

type ToastProps = {
  icon: LucideIcon
  title: string
  detail?: string
  tone?: keyof typeof toastTones
  style?: CSSProperties
}

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
      boxShadow: `0 0 0 1px ${app.ring}, 0 18px 40px -12px rgba(0, 0, 0, 0.3)`,
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
        ...toastTones[tone]
      }}
    >
      <Icon size={19} strokeWidth={2.2} />
    </span>
    <span style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
      {detail ? <span style={{ fontSize: 14.5, color: app.muted }}>{detail}</span> : null}
    </span>
  </div>
)
