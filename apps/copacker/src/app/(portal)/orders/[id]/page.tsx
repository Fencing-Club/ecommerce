import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
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
} from "@buildkitgg/shadcn"
import { itemTotal, orderCharges, orderTotal, orderUnits, lineName, shipmentGroups } from "@repo/copacker-orders"
import { isAmazonNetwork, orderDestination } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { packingInstructions } from "@repo/copacker-shipments/requirements"
import { Link } from "@tanstack/react-router"
import { Building2, ChevronRight, Info as InfoIcon, MapPin, Warehouse } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import { ActionButton } from "@/components/actions"
import { DocumentList, PageHeader, Status, formatDestination } from "@/components/common"
import { CostSummaryCard } from "@/components/cost-summary-card"
import { FlushCard } from "@/components/flush-card"
import { ForwardShipment } from "@/components/forward-shipment"
import { LandedCosts } from "@/components/landed-costs"
import { Markdown } from "@/components/markdown"
import { NoValue } from "@/components/no-value"
import { LineMenu, OrderMenu } from "@/components/order-actions"
import { PoTimeline } from "@/components/po-timeline"
import { ProductIdentity } from "@/components/product-identity"
import { QuantityDisplay } from "@/components/quantity-display"
import { RoutePill } from "@/components/route-pill"
import { RouteStops } from "@/components/route-stops"
import { ShipmentGroupCard } from "@/components/shipment-group-card"
import { SupplierSkuCell } from "@/components/supplier-sku-cell"
import { ProposalPanel } from "@/components/supplier/proposal-panel"
import { useMoney } from "@/hooks/use-money"
import { knownName, paymentTermKeys } from "@/lib/order-lines"
import type { orderPage } from "@/server/order-page"
import { ForwarderView } from "./forwarder-view"
export default function OrderPage({ page }: { page: Awaited<ReturnType<typeof orderPage>> }) {
  const t = useTranslations("orders"),
    common = useTranslations("common"),
    format = useFormatter(),
    money = useMoney()
  if (page.view === "forwarder") {
    return <ForwarderView page={page.data} />
  }
  const {
    s,
    id,
    editsOrder,
    seesShipments,
    editsShipments,
    prices,
    order,
    supplier,
    status,
    changeable,
    proposal,
    remainingItems,
    editable,
    remaining,
    currency,
    landedTotal,
    markup,
    buyer,
    labels,
    timeline,
    documentGroups,
    instructions,
    units,
    subtotal,
    places,
    stop,
    noteLabel,
    timeZone,
    instructionsByItem,
    shipmentRows,
    freight,
    landed
  } = page.data
  const remainingFor = (id: string) => remainingItems.find((row) => row.itemId === id)?.remainingPieces
  const labelFor = (id: string) => labels.find((row) => row.itemId === id)
  const place = (id: string | undefined) => places.find((row) => row.id === id)?.name
  const destination = place(order.data.deliveryId) ?? formatDestination(orderDestination(order.data), common)
  const day = (value: string) =>
    format.dateTime(new Date(value + "T00:00:00Z"), {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    })
  return (
    <div className="@container flex flex-col gap-4">
      <PageHeader
        parents={[{ label: s.org.kind === "supplier" ? t("index.supplierTitle") : t("index.title"), href: "/orders" }]}
        title={order.data.reference}
        badge={<Status status={status} />}
      >
        {order.status === "draft" && buyer && editsOrder && (
          <ActionButton action="order.submit" data={{ id, revision: order.revision }}>
            {supplier.supplierOrgId ? t("detail.submitToSupplier") : t("detail.send")}
          </ActionButton>
        )}
        {s.org.kind === "supplier" &&
          editsOrder &&
          order.status === "submitted" &&
          changeable &&
          proposal?.status !== "pending" && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/orders/$id/revise" params={{ id: id }} />}
            >
              {t("revise.title")}
            </Button>
          )}
        {order.status === "submitted" &&
          editsShipments &&
          (editable || remaining) &&
          proposal?.status !== "pending" && (
            <ActionButton action="shipment.create" data={{ id }}>
              {editable ? t("detail.continuePacking") : t("detail.prepareNextShipment")}
            </ActionButton>
          )}
        <OrderMenu
          id={id}
          reference={order.data.reference}
          draft={order.status === "draft" && buyer && editsOrder}
          closable={order.status === "submitted" && buyer && editsOrder}
          labels={
            labels.some((label) => label.state === "uploaded" || label.state === "standard") ||
            order.data.items.some((item) => item.suffocationWarning)
          }
        />
      </PageHeader>

      {s.org.kind === "buyer" && !supplier.supplierOrgId && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{t("detail.offCopacker.title", { supplier: supplier.name })}</AlertTitle>
          <AlertDescription>{t("detail.offCopacker.description")}</AlertDescription>
        </Alert>
      )}

      {proposal && (proposal.status === "pending" || proposal.status === "declined") && (
        <ProposalPanel
          proposal={{ id: proposal.id, status: proposal.status, note: proposal.note, reason: proposal.reason }}
          changes={proposal.changes}
          currency={order.data.currency}
          viewer={s.org.kind === "buyer" ? "buyer" : "supplier"}
          supplierName={supplier.name}
          orderId={id}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 @min-[72rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <FlushCard>
            <RouteStops
              supplier={<RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>}
              stop={stop && <RoutePill icon={<Warehouse />}>{stop}</RoutePill>}
              destination={<RoutePill icon={<MapPin />}>{destination}</RoutePill>}
            >
              {order.status === "draft" && buyer && editsOrder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  render={<Link to="/orders/$id/edit" params={{ id: id }} />}
                  nativeButton={false}
                >
                  {t("builder.edit")}
                </Button>
              )}
            </RouteStops>
          </FlushCard>
          {shipmentGroups(order.data.items).map((group) => (
            <ShipmentGroupCard
              key={group.receiver}
              title={isAmazonNetwork(group.receiver) ? amazonNetworkNames[group.receiver] : destination}
              lines={group.lines.length}
              pieces={orderUnits(group.lines)}
              total={prices ? orderTotal({ items: group.lines }) : undefined}
              currency={currency}
            >
              <Table className="@max-2xl:block">
                <TableHeader className="@max-2xl:hidden">
                  <TableRow>
                    <TableHead className="ps-3">{t("detail.columns.products")}</TableHead>
                    <TableHead className="w-36">{t("detail.columns.supplierSku")}</TableHead>
                    <TableHead className="w-24 text-end">{t("detail.columns.quantity")}</TableHead>
                    {prices && <TableHead className="w-28 text-end">{t("detail.columns.cost")}</TableHead>}
                    {prices && <TableHead className="w-28 text-end">{t("detail.columns.total")}</TableHead>}
                    <TableHead className="w-12 pe-3">
                      <span className="sr-only">{t("detail.columns.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="@max-2xl:block">
                  {group.lines.map((item) => (
                    <TableRow
                      key={item.id}
                      className="align-top @max-2xl:relative @max-2xl:flex @max-2xl:flex-wrap @max-2xl:items-baseline @max-2xl:gap-x-1 @max-2xl:px-3 @max-2xl:py-2.5"
                    >
                      <TableCell className="py-2.5 ps-3 align-top whitespace-normal @max-2xl:basis-full @max-2xl:p-0 @max-2xl:pe-16">
                        <ProductIdentity item={item} />
                        {packingInstructions(item) && (
                          <Markdown className="text-xs text-muted-foreground">{packingInstructions(item)}</Markdown>
                        )}
                        {(instructionsByItem[item.id] ?? []).map((line) => (
                          <p key={line} className="text-xs text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="py-2.5 align-top whitespace-normal @max-2xl:me-auto @max-2xl:pt-2 @max-2xl:pb-0 @max-2xl:ps-0 @max-2xl:pe-4">
                        <SupplierSkuCell item={item} />
                      </TableCell>
                      <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:p-0">
                        <QuantityDisplay pieces={item.pieces} packSize={item.piecesPerSet}>
                          {item.pieces}
                        </QuantityDisplay>
                        {remainingFor(item.id) !== item.pieces && (
                          <p className="text-xs text-muted-foreground">
                            {t("detail.toShip", { count: remainingFor(item.id) ?? 0 })}
                          </p>
                        )}
                      </TableCell>
                      {prices && (
                        <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:p-0 @max-2xl:before:content-['×_']">
                          {money(item.unitPrice, currency)}
                        </TableCell>
                      )}
                      {prices && (
                        <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:min-w-20 @max-2xl:p-0 @max-2xl:font-medium">
                          {money(itemTotal(item), currency)}
                        </TableCell>
                      )}
                      <TableCell className="py-1.5 pe-3 text-end align-top @max-2xl:absolute @max-2xl:end-2 @max-2xl:top-1.5 @max-2xl:p-0">
                        <LineMenu
                          orderId={id}
                          itemId={item.id}
                          name={lineName(item.name, item.variant)}
                          label={labelFor(item.id)}
                          warning={item.suffocationWarning}
                          editable={order.status === "draft" && buyer && editsOrder}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ShipmentGroupCard>
          ))}

          {instructions.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.instructions")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 ps-5 leading-relaxed">
                  {instructions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <FlushCard size="sm">
            <CardHeader>
              <CardTitle>{t("detail.shipments")}</CardTitle>
            </CardHeader>
            {shipmentRows.length ? (
              <ul className="divide-y">
                {shipmentRows.map((shipment, index) => {
                  const summary = (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">
                          {shipment.amazonNetwork
                            ? t("detail.shipmentToAmazon", {
                                number: index + 1,
                                network: amazonNetworkNames[shipment.amazonNetwork]
                              })
                            : t("detail.shipment", { number: index + 1 })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("detail.shipmentCartons", {
                            reference: shipment.amazonShipmentId ?? t("detail.cartonsInPreparation"),
                            count: shipment.cartonCount
                          })}
                        </span>
                      </span>
                      <Status status={shipment.status} />
                    </>
                  )
                  return (
                    <li key={shipment.id} className="flex items-center gap-3 pe-3">
                      {seesShipments ? (
                        <Link
                          to="/shipments/$id"
                          params={{ id: shipment.id }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                        >
                          {summary}
                          <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">{summary}</div>
                      )}
                      {/* Shipping it on records the forwarder's freight cost, so it needs prices too. */}
                      {buyer && editsShipments && prices && shipment.status === "shipped" && shipment.buyerForwards && (
                        <ForwardShipment shipmentId={shipment.id} currency={currency} />
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="p-3 text-muted-foreground">
                {order.status === "draft" ? t("detail.shipmentsStartOnSend") : t("detail.noShipments")}
              </p>
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
                    <DocumentList
                      documents={group.documents.map((doc) => ({ ...doc, shipmentId: group.shipmentId }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <PoTimeline
            orderId={id}
            viewerOrg={s.org.name}
            timeZone={timeZone}
            entries={timeline}
            prices={prices}
            commentable={order.status !== "closed"}
            counterparty={buyer ? "supplier" : "customer"}
          />
        </div>

        <aside className="flex flex-col gap-4">
          {prices && (
            <CostSummaryCard
              lines={order.data.items.length}
              units={units}
              subtotal={subtotal}
              charges={orderCharges(order.data)}
              total={orderTotal(order.data)}
              currency={currency}
            />
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("detail.purchaseOrderDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                {order.data.dueDate && <Detail label={t("detail.requiredBy")} value={day(order.data.dueDate)} />}
                <Detail
                  label={t("detail.paymentTerms")}
                  value={
                    order.data.paymentTerms ? knownName(paymentTermKeys, order.data.paymentTerms, t) : t("detail.none")
                  }
                />
                {order.data.readyDate && <Detail label={t("detail.ready")} value={day(order.data.readyDate)} />}
                <Detail label={t("detail.currency")} value={currency} />
                <Detail
                  label={noteLabel}
                  value={order.data.notes ? <Markdown>{order.data.notes}</Markdown> : <NoValue />}
                />
              </dl>
            </CardContent>
          </Card>

          {s.org.kind === "buyer" && prices && (
            <LandedCosts
              orderId={id}
              currency={currency}
              supplierTotal={orderTotal(order.data)}
              landedTotal={landedTotal}
              markup={markup}
              freight={freight}
              costs={landed}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  )
}
