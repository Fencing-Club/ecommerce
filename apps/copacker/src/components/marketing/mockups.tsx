import {
  Bell,
  Box,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Coffee,
  Ellipsis,
  Factory,
  FileText,
  GlassWater,
  PanelLeft,
  RefreshCw,
  Search,
  TrendingDown,
  Warehouse
} from "lucide-react"
import { StatCard, StatGrid, Status, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { navigationFor, navigationGroups } from "@/lib/navigation"
import { cn } from "@/lib/utils"

// The product as the marketing page shows it: the app's own components, in its light theme, holding a demo buyer's
// data, the same brand and suppliers as the ad (docs/video.md). The shots are pictures: nothing in them can be focused or
// clicked, and screen readers get the figure's caption instead.

const nav = navigationFor("buyer")

// The app's window: the header with search, the sidebar with the buyer's pages, and the page itself.
function AppFrame({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div
      inert
      className="light flex size-full flex-col overflow-hidden rounded-xl bg-background text-sm text-foreground select-none"
    >
      <header className="grid h-12 shrink-0 grid-cols-[1fr_minmax(0,26rem)_1fr] items-center gap-2 border-b px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-3.5" />
          </span>
          Copacker
        </span>
        <span className="flex h-8 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-muted-foreground">
          <Search className="size-3.5" />
          Search
          <span className="ml-auto flex gap-1">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </span>
        <Bell className="size-4 justify-self-end text-muted-foreground" />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col gap-4 border-r bg-sidebar p-2 text-sidebar-foreground">
          <div className="flex items-center gap-2 rounded-lg p-2">
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-xs font-semibold">
              RG
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-medium">Ridgeline Goods</span>
              <span className="text-xs text-muted-foreground">Buyer workspace</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </div>
          {navigationGroups
            .filter((group) => group.key === "store" || group.key === "purchasing")
            .map((group) => (
              <div key={group.key} className="flex flex-col gap-0.5">
                <span className="px-2 pb-1 text-xs text-muted-foreground">{group.label}</span>
                {nav
                  .filter((item) => item.group === group.key)
                  .map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-md px-2",
                        label === active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </span>
                  ))}
              </div>
            ))}
          <div className="mt-auto flex items-center gap-2 p-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              AR
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">Alex Rivera</span>
              <span className="truncate text-xs text-muted-foreground">alex@ridgelinegoods.com</span>
            </span>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden px-6 py-5">{children}</main>
      </div>
    </div>
  )
}

function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <PanelLeft className="size-4 text-muted-foreground" />
      <span className="text-xl font-semibold tracking-tight">{children}</span>
      {actions && <span className="ml-auto flex gap-2">{actions}</span>}
    </div>
  )
}

// A filter as Restock's toolbar shows one: a bordered chip with an icon and a value.
function Chip({ icon: Icon, children }: { icon?: typeof Box; children: React.ReactNode }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5">
      {Icon && <Icon className="size-3.5 text-muted-foreground" />}
      {children}
    </span>
  )
}

function Thumb({ icon: Icon }: { icon: typeof Box }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground">
      <Icon className="size-4" />
    </span>
  )
}

const bottles = { name: "Steel Bottle 32 oz", sku: "SM-3201", icon: GlassWater }
const mugs = { name: "Trail Mug 12 oz", sku: "SM-1204", icon: Coffee }

// Restock: what runs out before a reorder could arrive, what it costs to order, and the sales at risk.
export function RestockShot() {
  const rows = [
    {
      ...bottles,
      status: "reorder_now",
      left: "18 days",
      sold: "1,830",
      available: "1,140",
      order: "2,520",
      cost: "$11,340.00"
    },
    {
      ...mugs,
      status: "reorder_soon",
      left: "40 days",
      sold: "1,020",
      available: "1,380",
      order: "660",
      cost: "$2,310.00"
    }
  ]
  return (
    <AppFrame active="Restock">
      <PageTitle>Restock</PageTitle>
      <div className="flex items-center gap-2">
        <Chip icon={Building2}>Ridgeline Goods</Chip>
        <Chip icon={Factory}>All suppliers</Chip>
        <Chip>
          <span className="text-muted-foreground">Sales period</span> 60{" "}
          <span className="text-muted-foreground">days</span>
        </Chip>
        <Chip>
          <span className="text-muted-foreground">Lead time</span> 60{" "}
          <span className="text-muted-foreground">days</span>
        </Chip>
        <Button variant="outline" className="ml-auto">
          <RefreshCw />
          Recalculate
        </Button>
      </div>
      <Card className="gap-4">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Estimated cost</span>
              <span className="text-3xl font-semibold tracking-tight">$15,090.00</span>
            </div>
            <dl className="grid grid-cols-5 gap-x-8 gap-y-1 text-right">
              {[
                ["Lines", "3"],
                ["Units", "3,660"],
                ["Cases", "180"],
                ["Volume", "6.12 m³"],
                ["Weight", "1,820 kg"]
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{term}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
            <TrendingDown className="size-4" />
            About $18,340 in lost sales before reorders arrive
          </div>
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <ChevronDown className="size-4 text-muted-foreground" />
          <span className="flex flex-col">
            <span>
              <span className="font-semibold">Shenzhen Metalworks</span>
              <span className="text-muted-foreground"> 2 products</span>
            </span>
            <span className="text-xs text-muted-foreground">Lead time 60 days, 2 lines, 3,180 units</span>
          </span>
          <span className="ml-auto flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Estimated cost</span>
            <span className="font-semibold">$13,650.00</span>
          </span>
          <Button>Reorder</Button>
        </div>
        <Table framed={false}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Stock left</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sku}>
                <TableCell>
                  <Checkbox checked />
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <Thumb icon={row.icon} />
                    <span className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.sku}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Status status={row.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.left}</TableCell>
                <TableCell className="text-right tabular-nums">{row.sold}</TableCell>
                <TableCell className="text-right tabular-nums">{row.available}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{row.order}</TableCell>
                <TableCell className="text-right tabular-nums">{row.cost}</TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="py-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="flex flex-col">
            <span>
              <span className="font-semibold">Saigon Packaging Co.</span>
              <span className="text-muted-foreground"> 1 product</span>
            </span>
            <span className="text-xs text-muted-foreground">Lead time 45 days, 1 line, 480 units</span>
          </span>
          <span className="ml-auto flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Estimated cost</span>
            <span className="font-semibold">$1,440.00</span>
          </span>
          <Button variant="outline">Reorder</Button>
        </div>
      </Card>
    </AppFrame>
  )
}

// A purchase order made from Restock, with the supplier: its route, products and totals.
export function PurchaseOrderShot() {
  const lines = [
    { ...bottles, quantity: "2,520", cost: "$4.50", total: "$11,340.00" },
    { ...mugs, quantity: "660", cost: "$3.50", total: "$2,310.00" }
  ]
  return (
    <AppFrame active="Purchase orders">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-muted-foreground">
          <PanelLeft className="size-4" />
          Purchase orders
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">PO 1043</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold tracking-tight">PO 1043</span>
          <Status status="submitted" />
          <span className="ml-auto flex gap-2">
            <Button variant="outline">
              <FileText />
              Download PO
            </Button>
            <Button variant="outline" size="icon">
              <Ellipsis />
            </Button>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Factory className="size-3.5 text-muted-foreground" />
              Shenzhen Metalworks
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Warehouse className="size-3.5 text-muted-foreground" />
              Amazon AWD
            </span>
          </div>
          <Table framed={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Products</TableHead>
                <TableHead>Supplier SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.sku}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <Thumb icon={line.icon} />
                      <span className="font-medium">{line.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.cost}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-muted-foreground">
            <span>Cartons planned</span>
            <span className="font-medium text-foreground tabular-nums">160</span>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Cost summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <span className="flex justify-between text-muted-foreground">
                2 variants (3,180 items)
                <span className="text-foreground tabular-nums">$13,650.00</span>
              </span>
              <span className="flex justify-between border-t pt-2 font-semibold">
                Total
                <span className="tabular-nums">$13,650.00</span>
              </span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Purchase order details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[
                ["Required by", "Nov 20, 2026"],
                ["Payment terms", "30% deposit, 70% before shipping"],
                ["Currency", "USD"]
              ].map(([term, value]) => (
                <span key={term} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{term}</span>
                  {value}
                </span>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppFrame>
  )
}

// Shipments: the Amazon inbound shipments Copacker created, to FBA and to AWD in the US and offshore.
export function ShipmentsShot() {
  const shipments = [
    {
      id: "FBA17K3Q2XD5",
      name: "Shipment 2",
      supplier: "Shenzhen Metalworks",
      destination: "Amazon FBA",
      cartons: 45,
      ready: "Oct 3",
      status: "ready"
    },
    {
      id: "STAR-8QX2LMV4",
      name: "Shipment 3",
      supplier: "Shenzhen Metalworks",
      destination: "Amazon AWD US",
      cartons: 40,
      ready: "Oct 3",
      status: "creating"
    },
    {
      id: "STAR-2HVN7KQ9",
      name: "Shipment 4",
      supplier: "Shenzhen Metalworks",
      destination: "Amazon AWD China",
      cartons: 75,
      ready: "Oct 3",
      status: "packing"
    },
    {
      id: "FBA16W9PL2MC",
      name: "Shipment 1",
      supplier: "Saigon Packaging Co.",
      destination: "Amazon FBA",
      cartons: 20,
      ready: "Sep 12",
      status: "received"
    }
  ]
  return (
    <AppFrame active="Shipments">
      <PageTitle>Shipments</PageTitle>
      <StatGrid>
        <StatCard label="Packing" value={1} />
        <StatCard label="Action needed" value={0} />
        <StatCard label="Ready for pickup" value={1} />
      </StatGrid>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Shipment</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead className="text-right">Cartons</TableHead>
            <TableHead>Ready date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.map((shipment) => (
            <TableRow key={shipment.id}>
              <TableCell>
                <span className="flex flex-col">
                  <span className="font-medium">{shipment.id}</span>
                  <span className="text-xs text-muted-foreground">{shipment.name}</span>
                </span>
              </TableCell>
              <TableCell>{shipment.supplier}</TableCell>
              <TableCell>{shipment.destination}</TableCell>
              <TableCell className="text-right tabular-nums">{shipment.cartons}</TableCell>
              <TableCell>{shipment.ready}</TableCell>
              <TableCell>
                <Status status={shipment.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AppFrame>
  )
}

// A purchase order's timeline and documents, as the buyer sees them: every partner's update lands on the one order.
export function HandoffShot() {
  const events = [
    { text: "Shipped by Pacific Link Logistics", time: "4:12 PM" },
    { text: "Packing checklist completed by Shenzhen Metalworks", time: "11:05 AM" },
    { text: "Carton labels downloaded by Shenzhen Metalworks", time: "10:48 AM" }
  ]
  const documents = [
    ["Purchase order", "PO-1042.pdf"],
    ["Commercial invoice", "PO-1042-invoice.pdf"],
    ["Packing list", "PO-1042-packing-list.pdf"],
    ["Packing checklist", "PO-1042-checklist.pdf"],
    ["Carton label", "PO-1042-carton-labels.pdf"],
    ["Shipping label", "FBA17K3Q2XD5-labels.pdf"]
  ]
  return (
    <div
      inert
      className="light grid size-full grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 rounded-xl bg-muted p-5 text-sm text-foreground select-none"
    >
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>PO 1042</CardTitle>
          <StatusBadge tone="info">Shipped by forwarder</StatusBadge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              WC
            </span>
            <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
              <p className="flex justify-between gap-3 font-medium">
                <span>
                  Wei Chen<span className="font-normal text-muted-foreground"> at Shenzhen Metalworks</span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">9:30 AM</span>
              </p>
              <p className="mt-0.5">All 160 cartons sealed. Pickup is booked for Friday.</p>
            </div>
          </div>
          <div className="relative flex flex-col gap-3 pl-10">
            <span aria-hidden className="absolute top-1 bottom-1 left-[0.8125rem] w-0.5 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">Monday, October 6, 2026</span>
            {events.map((event) => (
              <span key={event.text} className="relative flex items-start justify-between gap-3">
                <span className="absolute top-1.5 -left-[1.9375rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
                {event.text}
                <span className="shrink-0 text-xs text-muted-foreground">{event.time}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {documents.map(([kind, file]) => (
            <span key={kind} className="flex items-center gap-3 rounded-md py-1.5">
              <FileText className="size-4 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{kind}</span>
                <span className="truncate text-xs text-muted-foreground">{file}</span>
              </span>
              <Check className="ml-auto size-4 text-success" />
            </span>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
