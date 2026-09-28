import { amazonNetworkNames } from "@repo/aisle"
import { and, asc, eq, inArray } from "drizzle-orm"
import { ArrowRight, Building2, MapPin, Warehouse } from "lucide-react"
import { DocumentList, PageHeader, Status, formatDestination } from "@/components/common"
import { ForwardShipment } from "@/components/forward-shipment"
import { AddressSummary } from "@/components/partner-address"
import { RoutePill } from "@/components/route-pill"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { contacts, documents, shipments } from "@/db/schema"
import type { forwarderOrders } from "@/server/access"
import { releasedStates } from "@/server/readiness"

// The products table runs edge to edge in its card, its first and last columns in line with the route above it and
// with the other cards' content.
const edgeTable = "[&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3"

// The shipping documents a forwarder gets, in the order they're made, as the purchase order page lists them.
const documentOrder: Array<(typeof documents.$inferSelect)["kind"]> = [
  "invoice",
  "packing_list",
  "carton_label",
  "shipping_label"
]

// What a freight forwarder sees of a PO whose goods pass through it: the route, with the address to ship on to when
// that's the buyer's own location, what's coming and in how many cartons, and the shipping documents. No prices; the
// commercial invoice carries what customs needs. The cards are the buyer's purchase order page's, less its costs and
// history.
export async function ForwarderView({
  row,
  editable
}: {
  row: Awaited<ReturnType<typeof forwarderOrders>>[number]
  // Whether the person can move shipments on, with Edit access to purchase orders.
  editable: boolean
}) {
  const { order, supplier, forwarder } = row
  const [shipmentRows, docs] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(asc(shipments.createdAt)),
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.orderId, order.id), eq(documents.outdated, 0), inArray(documents.kind, documentOrder)))
  ])
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db()
        .select({ id: contacts.id, name: contacts.name, address: contacts.address })
        .from(contacts)
        .where(inArray(contacts.id, addressIds))
    : []
  const place = (addressId: string | undefined) => places.find((candidate) => candidate.id === addressId)?.name
  // The buyer's location the forwarder ships the goods on to, when they don't go on to Amazon.
  const onward =
    order.data.destination === "warehouse"
      ? places.find((candidate) => candidate.id === order.data.deliveryId)
      : undefined
  // Carton and shipping labels come once the buyer releases the shipment, as for the supplier.
  const visible = docs.filter((doc) => {
    if (doc.kind !== "carton_label" && doc.kind !== "shipping_label") {
      return true
    }
    const shipment = shipmentRows.find((candidate) => candidate.id === doc.shipmentId)
    return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
  })
  // The purchase order's own documents, then each shipment's under its name, as the purchase order page groups them.
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    ...shipmentRows.map((shipment, index) => ({
      key: shipment.id,
      title: `Shipment ${index + 1}`,
      shipmentId: shipment.id
    }))
  ].flatMap((group) => {
    const grouped = visible
      .filter((doc) => doc.shipmentId === group.shipmentId)
      .toSorted(
        (a, b) =>
          documentOrder.indexOf(a.kind) - documentOrder.indexOf(b.kind) ||
          (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
      )
    return grouped.length ? [{ ...group, documents: grouped }] : []
  })

  return (
    <>
      <PageHeader
        parents={[{ label: "Purchase orders", href: "/orders" }]}
        title={order.data.reference}
        badge={<Status status={order.status} />}
      />

      <div className="flex max-w-4xl flex-col gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-1.5 border-b p-3">
            <RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
            {order.data.via && (
              <>
                <RoutePill icon={<Warehouse />}>
                  {[forwarder.name, place(order.data.via.addressId)].filter(Boolean).join(", ")}
                </RoutePill>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </>
            )}
            <RoutePill icon={<MapPin />}>
              {place(order.data.deliveryId) ?? formatDestination(order.data.destination)}
            </RoutePill>
          </div>
          {onward && <AddressSummary address={onward.address} className="border-b p-3" />}
          <Table framed={false} className={edgeTable}>
            <TableHeader>
              <TableRow>
                <TableHead>Products</TableHead>
                <TableHead className="w-24 text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="py-2.5 align-top whitespace-normal">
                    <p className="leading-snug font-medium">{item.name}</p>
                    {item.variant && item.variant !== "Default Title" && (
                      <Badge variant="secondary" className="mt-1">
                        {item.variant}
                      </Badge>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.buyerSku}
                      {order.data.destination === "amazon" && `, to Amazon ${amazonNetworkNames[item.amazonNetwork]}`}
                    </p>
                  </TableCell>
                  <TableCell className="py-2.5 text-right align-top tabular-nums">{item.pieces}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card size="sm" className="gap-0 pb-0">
          <CardHeader className="pb-3">
            <CardTitle>Shipments</CardTitle>
          </CardHeader>
          {shipmentRows.length ? (
            <ul>
              {shipmentRows.map((shipment, index) => (
                <li key={shipment.id} className="flex items-center gap-3 border-t px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      Shipment {index + 1}
                      {shipment.amazonNetwork && ` to Amazon ${amazonNetworkNames[shipment.amazonNetwork]}`}
                    </span>
                    <ShipmentDetails shipment={shipment} />
                  </span>
                  <Status status={shipment.status} />
                  {editable && shipment.status === "shipped" && (
                    <ForwardShipment shipmentId={shipment.id} currency={order.data.currency} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 pb-3 text-muted-foreground">No shipments yet</p>
          )}
        </Card>

        {documentGroups.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {documentGroups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                  {group.title && <h3 className="text-xs font-medium text-muted-foreground">{group.title}</h3>}
                  <DocumentList documents={group.documents} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

// Under a shipment's name: its cartons once they're packed, and the carrier and tracking number once it's shipped on.
function ShipmentDetails({ shipment }: { shipment: typeof shipments.$inferSelect }) {
  const cartons = shipment.packing?.cartons.length
  const details = [
    cartons !== undefined && `${cartons} ${cartons === 1 ? "carton" : "cartons"}`,
    shipment.forwarderCarrier && [shipment.forwarderCarrier, shipment.forwarderReference].filter(Boolean).join(" ")
  ].filter(Boolean)
  return details.length ? <span className="text-xs text-muted-foreground">{details.join(", ")}</span> : null
}
