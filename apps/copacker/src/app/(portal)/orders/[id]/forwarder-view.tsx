import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@buildkitgg/shadcn-baseui-kit"
import { orderDestination, receivers } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { Building2, MapPin, Warehouse } from "lucide-react"
import { useTranslations } from "use-intl"
import { DocumentList, PageHeader, Status, formatDestination } from "@/components/common"
import { FlushCard } from "@/components/flush-card"
import { ForwardShipment } from "@/components/forward-shipment"
import { AddressSummary } from "@/components/partner-address"
import { ProductIdentity } from "@/components/product-identity"
import { RoutePill } from "@/components/route-pill"
import { RouteStops } from "@/components/route-stops"
import { insetTable } from "@/lib/controls"
import type { forwarderPage } from "@/server/forwarder-page"

// What a freight forwarder sees of a PO whose goods pass through it: the route, with the address to ship on to when
// that's the buyer's own location, what's coming and in how many cartons, and the shipping documents. No prices; the
// commercial invoice carries what customs needs. The cards are the buyer's purchase order page's, less its costs and
// history.
export function ForwarderView({ page }: { page: Awaited<ReturnType<typeof forwarderPage>> }) {
  const { editable, order, supplier, forwarder, places, onward, stopAddressId, shipmentRows, documentGroups } = page
  const t = useTranslations("orders"),
    common = useTranslations("common")
  const place = (id: string | undefined) => places.find((row) => row.id === id)?.name
  return (
    <>
      <PageHeader
        parents={[{ label: t("index.title"), href: "/orders" }]}
        title={order.data.reference}
        badge={<Status status={order.status} />}
      />

      <div className="flex max-w-4xl flex-col gap-4">
        {/* A small card, so the products table's first and last columns line up with the route above it and with the
            other cards' content. */}
        <FlushCard size="sm">
          <RouteStops
            className="border-b"
            supplier={<RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>}
            stop={
              <RoutePill icon={<Warehouse />}>
                {[forwarder.name, place(stopAddressId)].filter(Boolean).join(", ")}
              </RoutePill>
            }
            destination={
              <RoutePill icon={<MapPin />}>
                {place(order.data.deliveryId) ?? formatDestination(orderDestination(order.data), common)}
              </RoutePill>
            }
          />
          {onward && <AddressSummary address={onward.address} className="border-b p-3" />}
          <Table className={insetTable}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("detail.columns.products")}</TableHead>
                <TableHead className="w-24 text-end">{t("detail.columns.quantity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="py-2.5 align-top whitespace-normal">
                    <ProductIdentity item={item} showSku={false} showPackSize={false} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {orderDestination(order.data) === "amazon"
                        ? t("detail.skuToAmazon", {
                            sku: item.buyerSku,
                            network: receivers[item.receiver].name
                          })
                        : item.buyerSku}
                    </p>
                  </TableCell>
                  <TableCell className="py-2.5 text-end align-top tabular-nums">{item.pieces}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </FlushCard>

        <FlushCard size="sm">
          <CardHeader>
            <CardTitle>{t("detail.shipments")}</CardTitle>
          </CardHeader>
          {shipmentRows.length ? (
            <ul className="divide-y">
              {shipmentRows.map((shipment) => (
                <li key={shipment.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {shipment.amazonNetwork
                        ? t("detail.shipmentToAmazon", {
                            number: shipment.number,
                            network: amazonNetworkNames[shipment.amazonNetwork]
                          })
                        : t("detail.shipment", { number: shipment.number })}
                    </span>
                    <CartonsAndTracking
                      shipment={shipment}
                      stop={place(shipment.stopAddressId)}
                      cartons={shipment.cartonCount ? t("detail.cartons", { count: shipment.cartonCount }) : undefined}
                    />
                  </span>
                  <Status status={shipment.status} />
                  {editable && shipment.status === "shipped" && (
                    <ForwardShipment shipmentId={shipment.id} currency={order.data.currency} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-muted-foreground">{t("detail.noShipmentsYet")}</p>
          )}
        </FlushCard>

        {documentGroups.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("detail.documents")}</CardTitle>
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

// Under a shipment's name: the forwarder's address it stops at, when the shipments stop at more than one, its cartons
// once they're packed, and the carrier and tracking number once it's shipped on.
function CartonsAndTracking({
  shipment,
  stop,
  cartons
}: {
  shipment: Awaited<ReturnType<typeof forwarderPage>>["shipmentRows"][number]
  stop?: string
  cartons?: string
}) {
  const details = [
    stop,
    cartons,
    shipment.forwarderCarrier && [shipment.forwarderCarrier, shipment.forwarderReference].filter(Boolean).join(" ")
  ].filter(Boolean)
  return details.length ? <span className="text-xs text-muted-foreground">{details.join(", ")}</span> : null
}
