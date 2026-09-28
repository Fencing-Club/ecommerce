import { and, desc, eq, inArray } from "drizzle-orm"
import { AlertTriangle, ExternalLink } from "lucide-react"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid, Status } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { connections, shipments } from "@/db/schema"
import { visibleOrders } from "@/server/access"
import { type AmazonShipment, listAmazonShipments } from "@/server/amazon-shipments"
import { session } from "@/server/auth"
import { amazonFor } from "@/server/connections"
import { rowLink } from "../portal.css"
import { sx } from "@/styles/sprinkles.css"

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

export default async function ShipmentsPage() {
  const s = await session()
  const rows = await visibleOrders(s)
  const ids = rows.map((r) => r.order.id)
  const list = ids.length
    ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.createdAt))
    : []

  // Every shipment in the buyer's Amazon account follows the purchase order shipments, except those a purchase order
  // shipment already shows. The supplier can't see the buyer's Amazon account.
  let amazon: AmazonShipment[] = []
  let amazonFailed = false
  if (s.org.kind === "buyer") {
    try {
      const linked = new Set(list.flatMap((shipment) => shipment.amazonShipmentId?.split(", ") ?? []))
      amazon = ((await amazonShipments(s.org.id)) ?? []).filter((row) => !linked.has(row.shipmentId))
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
          <StatCard
            label="In preparation"
            value={list.filter((x) => x.status === "packing").length}
            caption="Supplier is preparing cartons"
          />
          <StatCard
            label="Waiting on buyer"
            value={list.filter((x) => ["approval", "waiting_labels"].includes(x.status)).length}
            caption="Approvals or shipping labels needed"
          />
          <StatCard
            label="Ready for pickup"
            value={list.filter((x) => x.status === "ready").length}
            caption="Documents released to supplier"
          />
        </StatGrid>
      )}

      {amazonFailed && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Amazon shipments didn’t load</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All shipments</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length || amazon.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead className={sx({ textAlign: "right" })}>Cartons</TableHead>
                  <TableHead>Ready date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell>
                      <Link className={rowLink} href={`/shipments/${shipment.id}`}>
                        {shipment.amazonShipmentId ??
                          rows.find((r) => r.order.id === shipment.orderId)?.order.data.reference}
                      </Link>
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {shipment.packing?.cartons.length ?? 0}
                    </TableCell>
                    <TableCell className={sx({ color: "muted" })}>{shipment.packing?.readyDate ?? "Pending"}</TableCell>
                    <TableCell>
                      <Status status={shipment.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {amazon.map((row) => (
                  <TableRow key={row.shipmentId}>
                    <TableCell>
                      {/* Made in Seller Central or elsewhere, so it opens there. */}
                      <a className={rowLink} href={row.url} target="_blank" rel="noreferrer">
                        {row.shipmentId}
                        <ExternalLink aria-hidden="true" className={sx({ size: 3 })} />
                        <span className="sr-only"> (opens in Seller Central)</span>
                      </a>
                      {row.name && <p className={sx({ text: "xs", color: "muted" })}>{row.name}</p>}
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right" })}>—</TableCell>
                    <TableCell className={sx({ color: "muted" })}>—</TableCell>
                    <TableCell>
                      <Status status={row.status.toLowerCase()} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No shipments yet"
              description="Open a submitted purchase order to prepare the first shipment."
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
