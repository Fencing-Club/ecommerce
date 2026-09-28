import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Download, FileText, PackageOpen } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/utils"
import * as styles from "./common.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type Tone = "neutral" | "progress" | "action" | "done" | "problem"

const statuses: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "With supplier", tone: "progress" },
  packing: { label: "Packing", tone: "progress" },
  approval: { label: "Approval needed", tone: "action" },
  queued: { label: "Creating shipment", tone: "progress" },
  creating: { label: "Creating shipment", tone: "progress" },
  waiting_labels: { label: "Waiting for buyer labels", tone: "action" },
  ready: { label: "Ready for pickup", tone: "done" },
  shipped: { label: "Shipped", tone: "progress" },
  forwarded: { label: "Shipped by forwarder", tone: "progress" },
  received: { label: "Received", tone: "done" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  // Amazon inbound shipments, in Seller Central's words (shipped, closed and cancelled read as above)
  working: { label: "Working", tone: "progress" },
  created: { label: "Created", tone: "progress" },
  ready_to_ship: { label: "Ready to ship", tone: "progress" },
  in_transit: { label: "In transit", tone: "progress" },
  delivered: { label: "Delivered", tone: "progress" },
  checked_in: { label: "Checked in", tone: "progress" },
  receiving: { label: "Receiving", tone: "progress" },
  error: { label: "Error", tone: "problem" },
  needs_attention: { label: "Needs attention", tone: "problem" },
  correction: { label: "Correction requested", tone: "action" },
  closed: { label: "Closed", tone: "neutral" }
}

const tones = {
  neutral: { variant: "outline", icon: CircleDashed },
  progress: { variant: "secondary", icon: Clock },
  action: { variant: "default", icon: AlertTriangle },
  done: { variant: "outline", icon: CheckCircle2 },
  problem: { variant: "destructive", icon: AlertTriangle }
} as const

export function Status({ status }: { status: string }) {
  const { label, tone } = statuses[status] ?? { label: status, tone: "neutral" }
  const { variant, icon: Icon } = tones[tone]
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" />
      {label}
    </Badge>
  )
}

export function PageHeader({
  title,
  description,
  children
}: {
  title: React.ReactNode
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={sx({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 4
      })}
    >
      <div className={cn(styles.pageTitle, sx({ display: "flex", flexDirection: "column", gap: 1 }))}>
        <h1 className={sx({ text: "2xl", fontWeight: "semibold", letterSpacing: "tight" })}>{title}</h1>
        {description && <p className={sx({ maxWidth: "2xl", text: "sm", color: "muted" })}>{description}</p>}
      </div>
      {children && (
        <div className={sx({ display: "flex", flexShrink: 0, flexWrap: "wrap", alignItems: "center", gap: 2 })}>
          {children}
        </div>
      )}
    </div>
  )
}

export function PageBreadcrumb({
  parents,
  current
}: {
  parents: Array<{ label: string; href: string }>
  current: string
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {parents.map((parent) => (
          <Fragment key={parent.href}>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={parent.href} />}>{parent.label}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function StatCard({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={styles.statValue}>{value}</CardTitle>
      </CardHeader>
      {/* Grows with the tallest card in its row, so every footer reaches the bottom. */}
      <CardFooter className="flex-1 items-start text-xs text-muted-foreground">{caption}</CardFooter>
    </Card>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "3" } })}>{children}</div>
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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
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
  forwarder: "your freight forwarder",
  warehouse: "your location"
}

// A short warning next to what it's about, such as a variation without a barcode.
export function WarningNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(styles.warningNote, className)}>
      <AlertTriangle aria-hidden="true" />
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

// Each document by its type, such as Packing list, with its file name beneath.
export function DocumentList({
  documents
}: {
  documents: Array<{ id: string; name: string; kind?: string; cartonId?: string | null }>
}) {
  return (
    <ItemGroup className={styles.documentList}>
      {documents.map((d) => (
        <Item
          key={d.id}
          size="sm"
          variant="outline"
          render={<a href={`/api/documents/${d.id}`} aria-label={`Download ${d.name}`} />}
        >
          <ItemMedia variant="icon">
            <FileText />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {(d.kind && documentKinds[d.kind]) ?? d.name}
              {d.cartonId && ` ${d.cartonId}`}
            </ItemTitle>
            {d.kind && documentKinds[d.kind] && <ItemDescription>{d.name}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            <Download className={sx({ size: 4, color: "muted" })} />
            <span className={srOnly}>Download PDF</span>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
