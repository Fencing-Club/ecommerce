import { variantName } from "@repo/copacker-marketplaces/shopify"
import { orderDestination, receivers } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { ArrowRight, Building2, MapPin, Warehouse } from "lucide-react"
import { useTranslations } from "use-intl"
import { DocumentList, PageHeader, Status, formatDestination } from "@/components/common"
import { ForwardShipment } from "@/components/forward-shipment"
import { AddressSummary } from "@/components/partner-address"
import { RoutePill } from "@/components/route-pill"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { forwarderPage } from "@/server/forwarder-page"

// The products table runs edge to edge in its card, its first and last columns in line with the route above it and
// with the other cards' content.
const edgeTable = "[&_td:first-child]:ps-3 [&_td:last-child]:pe-3 [&_th:first-child]:ps-3 [&_th:last-child]:pe-3"

// The shipping documents a forwarder gets, in the order they're made, as the purchase order page lists them.

// What a freight forwarder sees of a PO whose goods pass through it: the route, with the address to ship on to when
// that's the buyer's own location, what's coming and in how many cartons, and the shipping documents. No prices; the
// commercial invoice carries what customs needs. The cards are the buyer's purchase order page's, less its costs and
// history.

export function ForwarderView({ page }: { page: Awaited<ReturnType<typeof forwarderPage>> }) {
  const { editable, order, supplier, forwarder, places, onward, shipmentRows, documentGroups } = page
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
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-1.5 border-b p-3">
            <RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>
            <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            {order.data.via && (
              <>
                <RoutePill icon={<Warehouse />}>
                  {[forwarder.name, place(order.data.via.addressId)].filter(Boolean).join(", ")}
                </RoutePill>
                <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
              </>
            )}
            <RoutePill icon={<MapPin />}>
              {place(order.data.deliveryId) ?? formatDestination(orderDestination(order.data), common)}
            </RoutePill>
          </div>
          {onward && <AddressSummary address={onward.address} className="border-b p-3" />}
          <Table framed={false} className={edgeTable}>
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
                    <p className="leading-snug font-medium">{item.name}</p>
                    {variantName(item.variant) && (
                      <Badge variant="secondary" className="mt-1">
                        {item.variant}
                      </Badge>
                    )}
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
        </Card>

        <Card size="sm" className="gap-0 pb-0">
          <CardHeader className="pb-3">
            <CardTitle>{t("detail.shipments")}</CardTitle>
          </CardHeader>
          {shipmentRows.length ? (
            <ul>
              {shipmentRows.map((shipment, index) => (
                <li key={shipment.id} className="flex items-center gap-3 border-t px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {shipment.amazonNetwork
                        ? t("detail.shipmentToAmazon", {
                            number: index + 1,
                            network: amazonNetworkNames[shipment.amazonNetwork]
                          })
                        : t("detail.shipment", { number: index + 1 })}
                    </span>
                    <ShipmentDetails
                      shipment={shipment}
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
            <p className="px-3 pb-3 text-muted-foreground">{t("detail.noShipmentsYet")}</p>
          )}
        </Card>

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

// Under a shipment's name: its cartons once they're packed, and the carrier and tracking number once it's shipped on.
function ShipmentDetails({
  shipment,
  cartons
}: {
  shipment: Awaited<ReturnType<typeof forwarderPage>>["shipmentRows"][number]
  cartons?: string
}) {
  const details = [
    cartons,
    shipment.forwarderCarrier && [shipment.forwarderCarrier, shipment.forwarderReference].filter(Boolean).join(" ")
  ].filter(Boolean)
  return details.length ? <span className="text-xs text-muted-foreground">{details.join(", ")}</span> : null
}
