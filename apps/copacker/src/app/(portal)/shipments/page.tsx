import { amazonNetworkNames } from "@repo/aisle"
import { and, desc, eq, inArray } from "drizzle-orm"
import { AlertTriangle, ExternalLink } from "lucide-react"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid, Status } from "@/components/common"
import { TabLinks } from "@/components/tab-links"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { connections, shipments } from "@/db/schema"
import { shortDate } from "@/lib/format"
import { visibleOrders } from "@/server/access"
import { type AmazonShipment, listAmazonShipments } from "@/server/amazon-shipments"
import { session } from "@/server/auth"
import { amazonFor } from "@/server/connections"
import { shipmentDestinations } from "./destination"

export const metadata: Metadata = { title: "Shipments" }

// The workspace's shipments in its connected Amazon account, read from Amazon at most every two minutes. Null when no
// Amazon account is connected.
const amazonShipments = unstable_cache(
  async (orgId: string) => {
    const [account] = await db()
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
    return account ? listAmazonShipments(await amazonFor(orgId)) : null
  },
  ["amazon-shipments"],
  { revalidate: 120 }
)

// A row opens its shipment: the link is stretched over the whole row.
const rowLink =
  "font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
// On a phone each row stacks to its shipment and status; wider tables add the destination, the supplier, then the
// ready date. Cartons stay beside the status from a phone's width up.
const columns = {
  row: "relative @max-md:flex @max-md:items-start @max-md:gap-x-3 @max-md:px-4 @max-md:py-3",
  shipment: "@max-md:min-w-0 @max-md:flex-1 @max-md:p-0",
  detail: "text-xs whitespace-normal text-muted-foreground",
  destination: "hidden @2xl:table-cell",
  supplier: "hidden @3xl:table-cell",
  cartons: "text-right tabular-nums @max-md:hidden",
  ready: "hidden pl-6 tabular-nums @4xl:table-cell",
  status: "@max-md:p-0"
}

// The list's tabs, kept in the URL: active shipments by default. Amazon calls a received shipment closed.
const views = [
  { view: undefined, label: "Active", empty: "No active shipments" },
  { view: "received", label: "Received", empty: "No received shipments" },
  { view: "cancelled", label: "Cancelled", empty: "No cancelled shipments" },
  { view: "all", label: "All", empty: "No shipments" }
] as const
function stage(status: string) {
  if (["received", "CLOSED"].includes(status)) {
    return "received"
  }
  return ["cancelled", "CANCELLED"].includes(status) ? "cancelled" : undefined
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requested = (await searchParams).view
  const current = views.find((tab) => tab.view === requested) ?? views[0]
  const inView = (status: string) => current.view === "all" || stage(status) === current.view
  const s = await session()
  const isBuyer = s.org.kind === "buyer"
  const rows = await visibleOrders(s)
  const ids = rows.map((r) => r.order.id)
  const list = ids.length
    ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.createdAt))
    : []
  const destination = await shipmentDestinations(rows.map((row) => row.order.data))
  const shown = list.flatMap((shipment) => {
    const row = rows.find((candidate) => candidate.order.id === shipment.orderId)
    if (!row) {
      return []
    }
    // A PO's shipments are numbered oldest first.
    const number =
      list
        .filter((other) => other.orderId === shipment.orderId)
        .toReversed()
        .indexOf(shipment) + 1
    return inView(shipment.status) ? [{ shipment, order: row.order, supplier: row.supplier, number }] : []
  })
  const count = (...states: string[]) => list.filter((shipment) => states.includes(shipment.status)).length
  // Every shipment in the buyer's Amazon account follows the purchase order shipments, except those a purchase order
  // shipment already shows. The supplier can't see the buyer's Amazon account.
  let amazon: AmazonShipment[] = []
  // Every Amazon shipment the tabs choose from.
  let amazonAll = 0
  let amazonFailed = false
  if (isBuyer) {
    try {
      const linked = new Set(list.flatMap((shipment) => shipment.amazonShipmentId?.split(", ") ?? []))
      const unlinked = ((await amazonShipments(s.org.id)) ?? []).filter((row) => !linked.has(row.shipmentId))
      amazonAll = unlinked.length
      amazon = unlinked.filter((row) => inView(row.status))
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "amazon_shipments_failed",
          orgId: s.org.id,
          error: error instanceof Error ? error.message : "unknown error"
        })
      )
      amazonFailed = true
    }
  }

  return (
    <>
      <PageHeader title="Shipments" />

      {/* Counts only help once there is something to count. */}
      {list.length > 0 && (
        <StatGrid>
          <StatCard label="Packing" value={count("packing")} />
          <StatCard
            label={isBuyer ? "Action needed" : "Waiting on buyer"}
            value={count("approval", "waiting_labels")}
          />
          <StatCard label="Ready for pickup" value={count("ready")} />
        </StatGrid>
      )}

      {amazonFailed && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Amazon shipments didn’t load</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      )}

      {list.length > 0 || amazonAll > 0 ? (
        <div className="flex flex-col gap-3">
          <TabLinks
            label="Shipment status"
            tabs={views.map((tab) => ({
              label: tab.label,
              href: tab.view ? `/shipments?view=${tab.view}` : "/shipments",
              current: tab === current
            }))}
          />
          {shown.length || amazon.length ? (
            <div className="@container">
              <Table className="@max-md:block">
                <TableHeader className="@max-md:hidden">
                  <TableRow>
                    <TableHead>Shipment</TableHead>
                    {isBuyer && <TableHead className={columns.supplier}>Supplier</TableHead>}
                    <TableHead className={columns.destination}>Destination</TableHead>
                    <TableHead className={columns.cartons}>Cartons</TableHead>
                    <TableHead className={columns.ready}>Ready date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="@max-md:block">
                  {shown.map(({ shipment, order, supplier, number }) => {
                    const cartons = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
                    const ready = shipment.packingDraft?.readyDate || shipment.packing?.readyDate
                    return (
                      <TableRow key={shipment.id} className={columns.row}>
                        <TableCell className={columns.shipment}>
                          <Link href={`/shipments/${shipment.id}`} className={rowLink}>
                            {order.data.reference}
                          </Link>
                          <p className={columns.detail}>
                            {[`Shipment ${number}`, shipment.amazonShipmentId].filter(Boolean).join(", ")}
                          </p>
                        </TableCell>
                        {isBuyer && <TableCell className={columns.supplier}>{supplier.name}</TableCell>}
                        <TableCell className={columns.destination}>
                          {destination(order.data, shipment.amazonNetwork)}
                        </TableCell>
                        <TableCell className={columns.cartons}>{cartons || "—"}</TableCell>
                        <TableCell className={columns.ready}>{ready ? shortDate(ready) : "—"}</TableCell>
                        <TableCell className={columns.status}>
                          <Status status={shipment.status} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {amazon.map((row) => (
                    <TableRow key={row.shipmentId} className={columns.row}>
                      <TableCell className={columns.shipment}>
                        {/* Made in Seller Central or elsewhere, so it opens there. */}
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`${rowLink} inline-flex items-center gap-1`}
                        >
                          {row.shipmentId}
                          <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                          <span className="sr-only"> (opens in Seller Central)</span>
                        </a>
                        {row.name && <p className={columns.detail}>{row.name}</p>}
                      </TableCell>
                      <TableCell className={columns.supplier}>—</TableCell>
                      <TableCell className={columns.destination}>Amazon {amazonNetworkNames[row.network]}</TableCell>
                      <TableCell className={columns.cartons}>—</TableCell>
                      <TableCell className={columns.ready}>—</TableCell>
                      <TableCell className={columns.status}>
                        <Status status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{current.empty}</p>
          )}
        </div>
      ) : (
        <EmptyState title="No shipments yet" description="Start one from a sent purchase order">
          <Button variant="outline" nativeButton={false} render={<Link href="/orders" />}>
            View purchase orders
          </Button>
        </EmptyState>
      )}
    </>
  )
}
