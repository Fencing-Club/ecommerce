import { AlertTriangle, ChevronRight, Download, FileText, PackageOpen } from "lucide-react"
import Link from "next/link"
import { Children } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import { InfoTip } from "./info-tip"

// Every status reads in one of five tones: neutral when not started, closed or cancelled; info while in progress or
// waiting on someone else; success when done or healthy; warning when someone needs to act; destructive when it failed
// or stock ran out.
export type StatusTone = "neutral" | "info" | "success" | "warning" | "destructive"

// Keyed by the status as the app stores it, or by the words a store reports in lowercase with underscores, such as
// partially_fulfilled for Shopify's "Partially fulfilled".
const statuses: Record<string, { label: string; tone: StatusTone }> = {
  // Purchase orders
  draft: { label: "Draft", tone: "neutral" },
  // Supplier products.
  active: { label: "Active", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
  submitted: { label: "With supplier", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
  // Shipments
  packing: { label: "Packing", tone: "info" },
  approval: { label: "Approval needed", tone: "warning" },
  queued: { label: "Creating shipment", tone: "info" },
  creating: { label: "Creating shipment", tone: "info" },
  waiting_labels: { label: "Needs shipping labels", tone: "warning" },
  ready: { label: "Ready for pickup", tone: "success" },
  shipped: { label: "Shipped", tone: "info" },
  forwarded: { label: "Shipped by forwarder", tone: "info" },
  received: { label: "Received", tone: "success" },
  correction: { label: "Correction requested", tone: "warning" },
  needs_attention: { label: "Needs attention", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  // Amazon inbound shipments, in Seller Central's words (shipped, closed and cancelled read as above)
  working: { label: "Working", tone: "info" },
  created: { label: "Created", tone: "info" },
  ready_to_ship: { label: "Ready to ship", tone: "info" },
  in_transit: { label: "In transit", tone: "info" },
  delivered: { label: "Delivered", tone: "info" },
  checked_in: { label: "Checked in", tone: "info" },
  receiving: { label: "Receiving", tone: "info" },
  error: { label: "Error", tone: "destructive" },
  // Sales orders, in Shopify's and Amazon's words
  pending: { label: "Pending", tone: "info" },
  unshipped: { label: "Unshipped", tone: "info" },
  unfulfilled: { label: "Unfulfilled", tone: "info" },
  partially_shipped: { label: "Partially shipped", tone: "info" },
  partially_fulfilled: { label: "Partially fulfilled", tone: "info" },
  fulfilled: { label: "Fulfilled", tone: "success" },
  canceled: { label: "Cancelled", tone: "neutral" },
  unfulfillable: { label: "Unfulfillable", tone: "destructive" },
  // Stock
  in_stock: { label: "In stock", tone: "success" },
  reorder_soon: { label: "Reorder soon", tone: "warning" },
  reorder_now: { label: "Reorder now", tone: "destructive" },
  out_of_stock: { label: "Out of stock", tone: "destructive" },
  // Partners
  on_copacker: { label: "On Copacker", tone: "success" },
  invited: { label: "Invited", tone: "info" },
  invitation_expired: { label: "Invitation expired", tone: "warning" },
  not_invited: { label: "Not invited", tone: "neutral" }
}

// The tone's color, which tints the badge, colors its dot and, mixed with the text color, its label.
const toneColors: Record<StatusTone, string> = {
  neutral: "[--tone:var(--muted-foreground)]",
  info: "[--tone:var(--chart-1)]",
  success: "[--tone:var(--success)]",
  warning: "[--tone:var(--warning)]",
  destructive: "[--tone:var(--destructive)]"
}

// A status badge in one of the five tones. `icon` replaces the dot, such as a Repeat icon for a replacement order.
export function StatusBadge({
  tone,
  icon,
  children
}: {
  tone: StatusTone
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span
      data-slot="status"
      data-tone={tone}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-full bg-(--tone)/12 px-2 text-xs font-medium tracking-normal whitespace-nowrap text-(--tone-text) ring-1 ring-(--tone)/20 ring-inset [--tone-text:color-mix(in_oklab,var(--tone)_60%,var(--foreground))] [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:text-(--tone)",
        toneColors[tone]
      )}
    >
      {icon ?? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--tone)" />}
      {children}
    </span>
  )
}

// A status as `statuses` keys it, so "Partially fulfilled" and PARTIALLY_SHIPPED both find their entries.
function statusKey(status: string) {
  return status
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_")
}

// A status the app doesn't know reads as words, so needs_review shows as "Needs review".
function words(status: string) {
  const text = status.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function Status({ status }: { status: string }) {
  const known = statuses[statusKey(status)]
  return <StatusBadge tone={known?.tone ?? "neutral"}>{known?.label ?? words(status)}</StatusBadge>
}

// The page title with its actions on the right. A record's page passes its parents, which lead the title on the same
// line (Customers › Fencing Club), and a status badge after it. When the actions don't fit beside the title, they wrap
// below it. It must be the page's first element, so the sidebar's collapse button sits beside it.
export function PageHeader({
  title,
  parents,
  badge,
  description,
  children
}: {
  title: React.ReactNode
  // Each links to its page, unless the person can't open it.
  parents?: Array<{ label: string; href?: string }>
  badge?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {parents?.length ? (
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-sm text-muted-foreground">
                {parents.map((parent) => (
                  <li key={parent.label} className="flex items-center gap-2">
                    {parent.href ? (
                      <Link href={parent.href} className="rounded-sm hover:text-foreground">
                        {parent.label}
                      </Link>
                    ) : (
                      parent.label
                    )}
                    <ChevronRight aria-hidden className="size-4 shrink-0" />
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <h1 className={cn("min-w-0 font-semibold tracking-tight", parents?.length ? "text-xl" : "text-2xl")}>
            {title}
          </h1>
          {badge}
        </div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

// A KPI: its label on one line, the figure, and an optional caption, such as a change from the previous period.
export function StatCard({
  label,
  value,
  caption,
  info,
  children
}: {
  label: string
  value: string | number
  caption?: React.ReactNode
  // What the figure means, behind an info icon after the label.
  info?: React.ReactNode
  // Anything under the figure, such as a sparkline.
  children?: React.ReactNode
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardDescription className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
          {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
        </CardDescription>
        {/* Proportional figures: a hero number reads on its own, and Geist's tabular 1 has a slab foot. */}
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
        {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  )
}

// Columns by how many cards there are, so a row never leaves a single card behind.
const statColumns: Record<number, string> = {
  2: "@xs:grid-cols-2",
  3: "@lg:grid-cols-3",
  4: "@xs:grid-cols-2 @3xl:grid-cols-4"
}

// Stat cards side by side, as wide as the space allows. Cards in a row share its height.
export function StatGrid({ children }: { children: React.ReactNode }) {
  const count = Children.toArray(children).length
  return (
    <div className="@container">
      <div className={cn("grid gap-4", statColumns[count] ?? "@xs:grid-cols-2 @3xl:grid-cols-3")}>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  children
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <Empty className="gap-4 py-10">
      <EmptyHeader className="gap-1">
        <EmptyMedia className="text-muted-foreground">
          <PackageOpen aria-hidden className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}

const destinationNames: Record<string, string> = {
  amazon: "Amazon",
  warehouse: "your location"
}

// A short warning next to what it's about, such as a variation without a barcode. The warning color is too light for
// text, so only the icon uses it, and the icon keeps to the first line when the text wraps.
export function WarningNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-start gap-1 text-xs font-medium text-foreground", className)}>
      <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0 text-warning" />
      <span>{children}</span>
    </span>
  )
}

export function formatDestination(destination: string) {
  return destinationNames[destination] ?? destination
}

const documentKinds: Record<string, string> = {
  purchase_order: "Purchase order",
  invoice: "Commercial invoice",
  packing_list: "Packing list",
  checklist: "Packing checklist",
  carton_label: "Carton label",
  shipping_label: "Shipping label",
  product_label: "Product label"
}

// Documents as flat rows, for a card: each by its type, such as Packing list, with its file name beneath. The whole row
// downloads the file.
export function DocumentList({
  documents
}: {
  documents: Array<{ id: string; name: string; kind?: string; cartonId?: string | null }>
}) {
  return (
    <ul className="divide-y">
      {documents.map((d) => {
        const kind = d.kind ? documentKinds[d.kind] : undefined
        return (
          <li key={d.id}>
            {/* The row bleeds into the card's padding on hover, so its content lines up with the card's. */}
            <a
              href={`/api/documents/${d.id}`}
              className="group/document -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  <span className="sr-only">Download </span>
                  {kind ?? d.name}
                  {d.cartonId && ` ${d.cartonId}`}
                </span>
                {kind && <span className="truncate text-xs text-muted-foreground">{d.name}</span>}
              </span>
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover/document:bg-muted group-hover/document:text-foreground"
              >
                <Download className="size-4" />
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
