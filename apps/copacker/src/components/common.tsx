import { AlertTriangle, ChevronRight, Download, FileText, PackageOpen } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import messages from "../../messages/en/common.json"

// Every status reads in one of five tones: neutral when not started, closed or cancelled; info while in progress or
// waiting on someone else; success when done or healthy; warning when someone needs to act; destructive when it failed
// or stock ran out.
export type StatusTone = "neutral" | "info" | "success" | "warning" | "destructive"

type StatusKey = keyof typeof messages.status

// Keyed by the status as the app stores it, or by the words a store reports in lowercase with underscores, such as
// partially_fulfilled for Shopify's "Partially fulfilled". The label is its key under the "common" messages' `status`.
const statuses: Record<string, { label: StatusKey; tone: StatusTone }> = {
  // Purchase orders
  draft: { label: "draft", tone: "neutral" },
  // Supplier products.
  active: { label: "active", tone: "success" },
  archived: { label: "archived", tone: "neutral" },
  submitted: { label: "submitted", tone: "info" },
  closed: { label: "closed", tone: "neutral" },
  // Shipments
  packing: { label: "packing", tone: "info" },
  approval: { label: "approval", tone: "warning" },
  queued: { label: "creatingShipment", tone: "info" },
  creating: { label: "creatingShipment", tone: "info" },
  waiting_labels: { label: "waitingLabels", tone: "warning" },
  ready: { label: "ready", tone: "success" },
  shipped: { label: "shipped", tone: "info" },
  forwarded: { label: "forwarded", tone: "info" },
  received: { label: "received", tone: "success" },
  correction: { label: "correction", tone: "warning" },
  needs_attention: { label: "needsAttention", tone: "destructive" },
  cancelled: { label: "cancelled", tone: "neutral" },
  // Amazon inbound shipments, in Seller Central's words (shipped, closed and cancelled read as above)
  working: { label: "working", tone: "info" },
  created: { label: "created", tone: "info" },
  ready_to_ship: { label: "readyToShip", tone: "info" },
  in_transit: { label: "inTransit", tone: "info" },
  delivered: { label: "delivered", tone: "info" },
  checked_in: { label: "checkedIn", tone: "info" },
  receiving: { label: "receiving", tone: "info" },
  error: { label: "error", tone: "destructive" },
  // Sales orders, in Shopify's and Amazon's words
  pending: { label: "pending", tone: "info" },
  unshipped: { label: "unshipped", tone: "info" },
  unfulfilled: { label: "unfulfilled", tone: "info" },
  partially_shipped: { label: "partiallyShipped", tone: "info" },
  partially_fulfilled: { label: "partiallyFulfilled", tone: "info" },
  fulfilled: { label: "fulfilled", tone: "success" },
  canceled: { label: "cancelled", tone: "neutral" },
  unfulfillable: { label: "unfulfillable", tone: "destructive" },
  // Stock
  in_stock: { label: "inStock", tone: "success" },
  reorder_soon: { label: "reorderSoon", tone: "warning" },
  reorder_now: { label: "reorderNow", tone: "destructive" },
  out_of_stock: { label: "outOfStock", tone: "destructive" },
  // Partners
  on_copacker: { label: "onCopacker", tone: "success" },
  invited: { label: "invited", tone: "info" },
  invitation_expired: { label: "invitationExpired", tone: "warning" },
  not_invited: { label: "notInvited", tone: "neutral" }
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
  const t = useTranslations("common.status")
  const known = statuses[statusKey(status)]
  return <StatusBadge tone={known?.tone ?? "neutral"}>{known ? t(known.label) : words(status)}</StatusBadge>
}

// The page title with its actions on the right. A record's page passes its parents, which lead the title on the same
// line (Customers › Fencing Club), and a status badge after it. When the actions don't fit beside the title, they wrap
// below it, across the page's full width. It must be the page's first element, so the sidebar's collapse button sits
// beside the title. The title's line is 36px tall with or without actions beside it, so titles line up across pages.
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
  const t = useTranslations("common")
  return (
    <div data-slot="page-header" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
        <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {parents?.length ? (
            <nav aria-label={t("breadcrumb")}>
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
                    <ChevronRight aria-hidden className="size-4 shrink-0 rtl:rotate-180" />
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

export function EmptyState({
  title,
  description,
  media,
  children
}: {
  title: string
  description: string
  // In place of the empty box, such as a spinner while the first sync runs.
  media?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Empty className="gap-4 py-10">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
          {media ?? <PackageOpen aria-hidden className="size-5" />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
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

type DestinationKey = keyof typeof messages.destinations

function isDestination(destination: string): destination is DestinationKey {
  return Object.hasOwn(messages.destinations, destination)
}

// Where a purchase order goes, such as "your location", or the destination as stored when it isn't one of
// these. Pass the "common" messages' translator (useTranslations("common") or getTranslations("common")) to name it
// in the person's language; without one it's in English.
export function formatDestination(destination: string, t?: (key: `destinations.${DestinationKey}`) => string) {
  if (!isDestination(destination)) {
    return destination
  }
  return t ? t(`destinations.${destination}`) : messages.destinations[destination]
}

// A file name, which runs left to right in every language: in Urdu, 1043.pdf would read pdf.1043. It's inline, so the
// name keeps its line's alignment beside its icon or label. A line that truncates the name passes it as `title`, to show
// it whole on hover. The title goes on this span rather than the line, since browsers set a tooltip in the direction of
// the element that has it. fileName is also the `file` tag of a message that names a file, such as
// "Uploaded, <file>{name}</file>": t.rich("uploadedSource", { name, file: fileName }).
export function fileName(name: React.ReactNode, { title }: { title?: string } = {}) {
  return (
    <span dir="ltr" title={title}>
      {name}
    </span>
  )
}

// Each document kind's name, as its key under the "common" messages' `documents`.
const documentKinds: Record<string, keyof typeof messages.documents> = {
  purchase_order: "purchaseOrder",
  invoice: "invoice",
  packing_list: "packingList",
  checklist: "checklist",
  carton_label: "cartonLabel",
  shipping_label: "shippingLabel",
  product_label: "productLabel"
}

// Documents as flat rows, for a card: each by its type, such as Packing list, with its file name beneath. The whole row
// downloads the file.
export function DocumentList({
  documents
}: {
  documents: Array<{ id: string; name: string; kind?: string; cartonId?: string | null }>
}) {
  const t = useTranslations("common.documents")
  return (
    <ul className="divide-y">
      {documents.map((d) => {
        const kindKey = d.kind ? documentKinds[d.kind] : undefined
        const kind = kindKey && t(kindKey)
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
                  <span className="sr-only">{t("download")} </span>
                  {kind ?? fileName(d.name)}
                  {d.cartonId && ` ${d.cartonId}`}
                </span>
                {kind && <span className="truncate text-xs text-muted-foreground">{fileName(d.name)}</span>}
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
