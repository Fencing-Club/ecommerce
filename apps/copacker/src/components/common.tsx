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
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"

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
  collected: { label: "Collected", tone: "done" },
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
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
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
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-xs text-muted-foreground">{caption}</CardFooter>
    </Card>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-3">{children}</div>
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

export function formatDestination(destination: string) {
  return destination.replaceAll("_", " ").toUpperCase()
}

export function DocumentList({ documents }: { documents: Array<{ id: string; name: string }> }) {
  return (
    <ItemGroup className="gap-2">
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
            <ItemTitle>{d.name}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Download className="size-4 text-muted-foreground" />
            <span className="sr-only">Download PDF</span>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
