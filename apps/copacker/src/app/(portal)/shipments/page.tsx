import { desc, inArray } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid, Status } from "@/components/common"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { shipments } from "@/db/schema"
import { visibleOrders } from "@/server/access"
import { session } from "@/server/auth"
import { rowLink } from "../portal.css"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Shipments" }

export default async function ShipmentsPage() {
  const s = await session()
  const rows = await visibleOrders(s)
  const ids = rows.map((r) => r.order.id)
  const list = ids.length
    ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.createdAt))
    : []

  return (
    <>
      <PageHeader title="Shipments" description="Track carton preparation, approvals, and labels in one place." />

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

      <Card>
        <CardHeader>
          <CardTitle>All shipments</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length ? (
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
