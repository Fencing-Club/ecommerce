import { AlertTriangle, ChevronLeft, ChevronRight, Eye, PackageOpen } from "lucide-react"
import { useTranslations } from "use-intl"
import type { StatusTone } from "@/components/ui/badge"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Messages } from "@/i18n/messages"
import { cn } from "@/lib/utils"
import messages from "../../messages/en/common.json"
import { Attachment } from "./attachment"

type StatusKey = keyof typeof messages.status

// Keyed by the status as the app stores it, or by the words a store reports in lowercase with underscores, such as
// partially_fulfilled for Shopify's "Partially fulfilled". The label is its key under the "common" messages' `status`.
// One label always takes one tone (see StatusTone).
const statuses: Record<string, { label: StatusKey; tone: StatusTone }> = {
  // Purchase orders, and supplier products and catalogs
  draft: { label: "draft", tone: "neutral" },
  active: { label: "active", tone: "success" },
  archived: { label: "archived", tone: "neutral" },
  submitted: { label: "submitted", tone: "info" },
  accepted: { label: "accepted", tone: "info" },
  declined: { label: "declined", tone: "warning" },
  changes_proposed: { label: "changesProposed", tone: "warning" },
  closed: { label: "closed", tone: "neutral" },
  // Shipments
  packing: { label: "packing", tone: "info" },
  packed: { label: "packed", tone: "success" },
  approval: { label: "approval", tone: "warning" },
  queued: { label: "creatingShipment", tone: "info" },
  creating: { label: "creatingShipment", tone: "info" },
  waiting_labels: { label: "waitingLabels", tone: "warning" },
  ready: { label: "ready", tone: "success" },
  shipped: { label: "shipped", tone: "info" },
  at_forwarder: { label: "atForwarder", tone: "info" },
  forwarded: { label: "forwarded", tone: "info" },
  received: { label: "received", tone: "neutral" },
  correction: { label: "correction", tone: "warning" },
  needs_attention: { label: "needsAttention", tone: "destructive" },
  cancelled: { label: "cancelled", tone: "destructive" },
  // Amazon inbound shipments, in Seller Central's words (shipped, closed and cancelled read as above)
  working: { label: "working", tone: "info" },
  created: { label: "created", tone: "info" },
  ready_to_ship: { label: "readyToShip", tone: "info" },
  in_transit: { label: "inTransit", tone: "info" },
  delivered: { label: "delivered", tone: "success" },
  checked_in: { label: "checkedIn", tone: "info" },
  receiving: { label: "receiving", tone: "info" },
  error: { label: "error", tone: "destructive" },
  // Sales orders, in Shopify's, Amazon's and eBay's words (shipped and cancelled read as above)
  pending: { label: "pending", tone: "neutral" },
  unshipped: { label: "unshipped", tone: "info" },
  unfulfilled: { label: "unfulfilled", tone: "info" },
  partially_shipped: { label: "partiallyShipped", tone: "info" },
  partially_fulfilled: { label: "partiallyFulfilled", tone: "info" },
  fulfilled: { label: "fulfilled", tone: "success" },
  canceled: { label: "cancelled", tone: "destructive" },
  unfulfillable: { label: "unfulfillable", tone: "destructive" },
  unknown: { label: "unknown", tone: "neutral" },
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

// Each tone's dot, in the tone's own color.
const toneDots: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive"
}

// A status pill: a Badge in one of the five tones, with a dot before its label. `icon` replaces the dot, such as a
// Repeat icon for a replacement order.
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
    <Badge tone={tone} data-slot="status" className="gap-1.5 tracking-normal [&>svg]:shrink-0">
      {icon ?? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDots[tone])} />}
      {children}
    </Badge>
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

// Whose words a status takes. Every status shares one tone, but its words agree with what it's the status of: a sales
// order's are under `sales.status` (in French, "Expédiée", for une commande) and a supplier's product's or catalog's
// under `supplier.shared.status`. Anything else reads in the app's own words, `common.status`.
export type StatusLabels = "app" | "sales" | "supplier"

// The statuses each domain words itself, by the same keys as `common.status`.
const salesLabels: Record<keyof Messages["sales"]["status"], true> = {
  fulfilled: true,
  unfulfilled: true,
  partiallyFulfilled: true,
  pending: true,
  shipped: true,
  unshipped: true,
  partiallyShipped: true,
  cancelled: true,
  unfulfillable: true,
  unknown: true
}
const supplierLabels: Record<keyof Messages["supplier"]["shared"]["status"], true> = {
  active: true,
  draft: true,
  archived: true
}
const isSalesLabel = (key: string): key is keyof typeof salesLabels => Object.hasOwn(salesLabels, key)
const isSupplierLabel = (key: string): key is keyof typeof supplierLabels => Object.hasOwn(supplierLabels, key)

export function Status({ status, labels = "app" }: { status: string; labels?: StatusLabels }) {
  const label = useStatusLabel(labels)
  return <StatusBadge tone={statuses[statusKey(status)]?.tone ?? "neutral"}>{label(status)}</StatusBadge>
}

// A status's words without its pill, for filters and exports.
export function useStatusLabel(labels: StatusLabels = "app") {
  const app = useTranslations("common.status")
  const sales = useTranslations("sales.status")
  const supplier = useTranslations("supplier.shared.status")
  return (status: string) => {
    const known = statuses[statusKey(status)]
    if (!known) {
      return words(status)
    }
    if (labels === "sales" && isSalesLabel(known.label)) {
      return sales(known.label)
    }
    if (labels === "supplier" && isSupplierLabel(known.label)) {
      return supplier(known.label)
    }
    return app(known.label)
  }
}

// The page's header, the same on every page. A deeper page's breadcrumb sits on its own row above the title (on a phone,
// a back link to the page it's under); a sidebar page has none. Then the title, a record's status and a View only badge
// when the person can't change the page, with the page's actions on the right: at most one primary, a couple of
// secondary, and ⋯ last. When the actions don't fit beside the title they wrap below it. A description only where it
// says something the page doesn't; a record's meta row, each fact a label and its value, never joined by a dot; and the
// page's tabs.
export function PageHeader({
  title,
  parents,
  badge,
  viewOnly,
  description,
  meta,
  tabs,
  children
}: {
  title: React.ReactNode
  // Each links to its page, unless the person can't open it.
  parents?: Array<{ label: string; href?: string }>
  badge?: React.ReactNode
  viewOnly?: boolean
  description?: React.ReactNode
  meta?: ReadonlyArray<{ label: string; value: React.ReactNode }>
  tabs?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = useTranslations("common")
  const back = parents?.findLast((parent) => parent.href)
  return (
    <div data-slot="page-header" className="flex flex-col gap-2.5">
      {parents?.length ? (
        <nav aria-label={t("breadcrumb")}>
          <ol className="flex flex-wrap items-center gap-1.5 text-meta font-medium text-muted-foreground max-md:hidden">
            {parents.map((parent, index) => (
              <li key={parent.label} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 rtl:rotate-180" />}
                {parent.href ? (
                  <a href={parent.href} className="focus-ring rounded-sm hover:text-foreground">
                    {parent.label}
                  </a>
                ) : (
                  parent.label
                )}
              </li>
            ))}
          </ol>
          {back?.href && (
            <a
              href={back.href}
              className="focus-ring flex w-fit items-center gap-1 rounded-sm text-meta font-medium text-muted-foreground hover:text-foreground md:hidden"
            >
              <ChevronLeft aria-hidden className="size-4 shrink-0 rtl:rotate-180" />
              {back.label}
            </a>
          )}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 max-md:gap-x-2">
          <h1 className="min-w-0 text-[22px] leading-8 font-semibold tracking-[-0.3px] md:text-2xl">{title}</h1>
          {badge}
          {viewOnly && (
            <StatusBadge tone="neutral" icon={<Eye aria-hidden />}>
              {t("viewOnly")}
            </StatusBadge>
          )}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {description && <div className="max-w-prose text-sm text-muted-foreground">{description}</div>}
      {meta?.length ? (
        <dl
          data-slot="page-meta"
          className="flex flex-wrap items-center gap-x-6 gap-y-1 text-meta max-md:flex-col max-md:items-stretch max-md:gap-y-[3px] max-md:pt-1"
        >
          {meta.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 max-md:items-start">
              <dt className="text-muted-foreground max-md:w-[92px] max-md:shrink-0">{item.label}</dt>
              <dd className="min-w-0 font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {tabs}
    </div>
  )
}

// An empty list, a page that failed or a menu with nothing in it: an icon, a title, a line on what to do, and the
// actions that do it. A page whose header already says what happened leaves the title out. `titleAs` makes the title a
// heading, such as the h1 of a page outside the shell. `className` frames it, such as a packing list's box.
export function EmptyState({
  title,
  titleAs: Heading,
  description,
  icon = <PackageOpen aria-hidden />,
  className,
  children
}: {
  title?: string
  titleAs?: "h1" | "h2" | "h3"
  description?: React.ReactNode
  // In place of the empty box, such as a spinner while the first sync runs.
  icon?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        {title && <EmptyTitle>{Heading ? <Heading>{title}</Heading> : title}</EmptyTitle>}
        {description && <EmptyDescription>{description}</EmptyDescription>}
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
  pallet_label: "palletLabels",
  shipping_label: "shippingLabel",
  product_label: "productLabel"
}

// Shared attachment cards; provider label files are grouped by shipment and document kind.
export function DocumentList({
  documents
}: {
  documents: Array<{ id: string; name: string; kind?: string; cartonId?: string | null; shipmentId?: string | null }>
}) {
  const t = useTranslations("common.documents")
  const seen = new Set<string>()
  const rows = documents.filter((doc) => {
    if (!doc.shipmentId || (doc.kind !== "carton_label" && doc.kind !== "shipping_label")) {
      return true
    }
    const key = `${doc.shipmentId}:${doc.kind}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  return (
    <ul className="space-y-2">
      {rows.map((d) => {
        const bundle = !!d.shipmentId && (d.kind === "carton_label" || d.kind === "shipping_label")
        const kindKey = d.kind ? documentKinds[d.kind] : undefined
        const kind = kindKey && t(kindKey)
        return (
          <li key={d.id}>
            <Attachment
              label={
                <>
                  {bundle
                    ? t(d.kind === "carton_label" ? "cartonLabels" : "shippingLabels")
                    : (kind ?? fileName(d.name))}
                  {!bundle && d.cartonId && ` ${d.cartonId}`}
                </>
              }
              fileName={kind && !bundle ? d.name : undefined}
              // The link's name replaces its text, so it names the file too: two documents of one kind stay apart.
              downloadLabel={[
                t("download"),
                bundle ? t(d.kind === "carton_label" ? "cartonLabels" : "shippingLabels") : (kind ?? d.name),
                !bundle && d.cartonId,
                kind && !bundle && d.name
              ]
                .filter(Boolean)
                .join(" ")}
              href={`/api/documents/${d.id}${bundle ? "?bundle=true" : ""}`}
            />
          </li>
        )
      })}
    </ul>
  )
}
