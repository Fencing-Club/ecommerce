import { amazonNetworkNames } from "@repo/aisle"
import { and, asc, eq, inArray } from "drizzle-orm"
import { ArrowRight, Building2, MapPin, Warehouse } from "lucide-react"
import { DocumentList, PageBreadcrumb, Status, formatDestination } from "@/components/common"
import { ForwardShipment } from "@/components/forward-shipment"
import { RoutePill } from "@/components/route-pill"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import { contacts, documents, shipments } from "@/db/schema"
import type { forwarderOrders } from "@/server/access"
import { releasedStates } from "@/server/readiness"

// What a freight forwarder sees of a PO whose goods pass through it: the route, what's coming and in how many cartons,
// and the shipping documents. No prices; the commercial invoice carries what customs needs.
export async function ForwarderView({ row }: { row: Awaited<ReturnType<typeof forwarderOrders>>[number] }) {
  const { order, supplier, forwarder } = row
  const [shipmentRows, docs] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(asc(shipments.createdAt)),
    db()
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.orderId, order.id),
          eq(documents.outdated, 0),
          inArray(documents.kind, ["invoice", "packing_list", "carton_label", "shipping_label"])
        )
      )
  ])
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  const place = (addressId: string | undefined) => places.find((candidate) => candidate.id === addressId)?.name
  // Carton and shipping labels come once the buyer releases the shipment, as for the supplier.
  const visible = docs.filter((doc) => {
    if (doc.kind !== "carton_label" && doc.kind !== "shipping_label") {
      return true
    }
    const shipment = shipmentRows.find((candidate) => candidate.id === doc.shipmentId)
    return !!shipment && releasedStates.includes(shipment.status) && shipment.revision === doc.shipmentRevision
  })

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current={order.data.reference} />
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{order.data.reference}</h1>
        <Status status={order.status} />
      </div>

      <div className="flex max-w-4xl flex-col gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-1.5 p-3">
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
          <table className="w-full border-t text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Products</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.data.items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{item.name}</p>
                    {item.variant && item.variant !== "Default Title" && (
                      <Badge variant="secondary" className="mt-1">
                        {item.variant}
                      </Badge>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.buyerSku}
                      {order.data.destination === "amazon" && `, to Amazon ${amazonNetworkNames[item.amazonNetwork]}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.pieces}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    <span className="text-xs text-muted-foreground">
                      {shipment.packing?.cartons.length ?? 0} cartons
                      {shipment.forwarderCarrier && `, ${shipment.forwarderCarrier} ${shipment.forwarderReference}`}
                    </span>
                  </span>
                  <Status status={shipment.status} />
                  {shipment.status === "shipped" && (
                    <ForwardShipment shipmentId={shipment.id} currency={order.data.currency} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 pb-3 text-muted-foreground">No shipments yet.</p>
          )}
        </Card>

        {visible.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentList documents={visible} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
