import type { OrderItem } from "@repo/aisle"
import { amazonNetworkNames, itemTotal, money, orderCharges, orderTotal } from "@repo/aisle"
import { Link } from "@tanstack/react-router"
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Info as InfoIcon,
  MapPin,
  Package,
  Warehouse
} from "lucide-react"
import { useTranslations, useFormatter, useLocale } from "use-intl"
import { ActionButton } from "@/components/actions"
import { DocumentList, PageHeader, Status, WarningNote, formatDestination } from "@/components/common"
import { ForwardShipment } from "@/components/forward-shipment"
import { LandedCosts } from "@/components/landed-costs"
import { LineMenu, OrderMenu } from "@/components/order-actions"
import { PoTimeline } from "@/components/po-timeline"
import { RoutePill } from "@/components/route-pill"
import { ProposalPanel } from "@/components/supplier/proposal-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adjustmentKeys, knownName, paymentTermKeys } from "@/lib/order-lines"
import type { orderPage } from "@/server/order-page"
import { ForwarderView } from "./forwarder-view"
export default function OrderPage({ page }: { page: Awaited<ReturnType<typeof orderPage>> }) {
  const t = useTranslations("orders"),
    common = useTranslations("common"),
    format = useFormatter(),
    locale = useLocale()
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
    leg,
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
  const itemGroups =
    order.data.destination === "amazon"
      ? (["awd_us", "fba"] as const)
          .map((network) => ({
            key: network,
            label: amazonNetworkNames[network],
            items: order.data.items.filter((item) => item.amazonNetwork === network)
          }))
          .filter((group) => group.items.length > 0)
      : [
          {
            key: "warehouse",
            label: place(order.data.deliveryId) ?? formatDestination(order.data.destination, common),
            items: order.data.items
          }
        ]
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
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-1.5 p-3">
              <RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>
              <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
              {stop && (
                <>
                  <RoutePill icon={<Warehouse />}>{stop}</RoutePill>
                  <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                </>
              )}
              <RoutePill icon={<MapPin />}>
                {place(order.data.deliveryId) ?? formatDestination(order.data.destination, common)}
              </RoutePill>
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
            </div>
          </Card>
          {itemGroups.map((group) => (
            <Collapsible key={group.key} defaultOpen render={<Card className="gap-0 overflow-hidden py-0" />}>
              <CollapsibleTrigger className="group flex min-h-14 items-center gap-2 px-3 py-2 text-start focus-visible:outline-ring">
                <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <h2 className="font-semibold">{t("builder.shipmentTo", { destination: group.label })}</h2>
                <span className="ms-auto flex flex-col items-end gap-1 text-end text-sm sm:flex-row sm:items-center sm:gap-4">
                  <span className="text-muted-foreground">
                    {t("builder.shipmentCounts", {
                      count: group.items.length,
                      pieces: group.items.reduce((sum, item) => sum + item.pieces, 0)
                    })}
                  </span>
                  {prices && (
                    <span className="font-semibold whitespace-nowrap tabular-nums">
                      <span className="sr-only">{t("builder.shipmentTotal")} </span>
                      {money(
                        group.items.reduce((sum, item) => sum + itemTotal(item), 0),
                        currency,
                        locale
                      )}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent keepMounted>
                <div className="@container border-t">
                  <Table framed={false} className="@max-2xl:block">
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
                      {group.items.map((item) => (
                        <TableRow
                          key={item.id}
                          className="align-top @max-2xl:relative @max-2xl:flex @max-2xl:flex-wrap @max-2xl:items-baseline @max-2xl:gap-x-1 @max-2xl:px-3 @max-2xl:py-2.5"
                        >
                          <TableCell className="py-2.5 ps-3 align-top whitespace-normal @max-2xl:basis-full @max-2xl:p-0 @max-2xl:pe-16">
                            <p className="leading-snug font-medium">{item.name}</p>
                            {item.variant && item.variant !== "Default Title" && (
                              <Badge variant="secondary" className="mt-1">
                                {item.variant}
                              </Badge>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">{item.buyerSku}</p>
                            {item.piecesPerSet > 1 && (
                              <p className="text-xs text-muted-foreground">
                                {t("detail.perPack", { count: item.piecesPerSet })}
                              </p>
                            )}
                            {(instructionsByItem[item.id] ?? []).map((line) => (
                              <p key={line} className="text-xs text-muted-foreground">
                                {line}
                              </p>
                            ))}
                          </TableCell>
                          <TableCell className="py-2.5 align-top whitespace-normal @max-2xl:me-auto @max-2xl:pt-2 @max-2xl:pb-0 @max-2xl:ps-0 @max-2xl:pe-4">
                            <SupplierSku item={item} notSet={t("detail.notSet")} />
                          </TableCell>
                          <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:p-0">
                            {item.pieces}
                            {remainingFor(item.id) !== item.pieces && (
                              <p className="text-xs text-muted-foreground">
                                {t("detail.toShip", { count: remainingFor(item.id) ?? 0 })}
                              </p>
                            )}
                          </TableCell>
                          {prices && (
                            <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:p-0 @max-2xl:before:content-['×_']">
                              {money(item.unitPrice, currency, locale)}
                            </TableCell>
                          )}
                          {prices && (
                            <TableCell className="py-2.5 text-end align-top tabular-nums @max-2xl:min-w-20 @max-2xl:p-0 @max-2xl:font-medium">
                              {money(itemTotal(item), currency, locale)}
                            </TableCell>
                          )}
                          <TableCell className="py-1.5 pe-3 text-end align-top @max-2xl:absolute @max-2xl:end-2 @max-2xl:top-1.5 @max-2xl:p-0">
                            <LineMenu
                              orderId={id}
                              itemId={item.id}
                              name={[item.name, item.variant === "Default Title" ? "" : item.variant]
                                .filter(Boolean)
                                .join(" / ")}
                              label={labelFor(item.id)}
                              warning={item.suffocationWarning}
                              editable={order.status === "draft" && buyer && editsOrder}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {instructions.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.instructions")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {instructions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card size="sm" className="gap-0 pb-0">
            <CardHeader className="pb-3">
              <CardTitle>{t("detail.shipments")}</CardTitle>
            </CardHeader>
            {shipmentRows.length ? (
              <ul>
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
                    <li key={shipment.id} className="flex items-center gap-3 border-t pe-3">
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
                      {buyer &&
                        editsShipments &&
                        prices &&
                        shipment.status === "shipped" &&
                        leg &&
                        !leg.forwarderOrgId && <ForwardShipment shipmentId={shipment.id} currency={currency} />}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-3 pb-3 text-muted-foreground">
                {order.status === "draft" ? t("detail.shipmentsStartOnSend") : t("detail.noShipments")}
              </p>
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
          <PoTimeline
            orderId={id}
            viewer={s.user.name ?? s.user.email}
            viewerOrg={s.org.name}
            timeZone={timeZone}
            entries={timeline}
            prices={prices}
          />
        </div>

        <aside className="flex flex-col gap-4">
          {prices && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.costSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="font-medium">{t("detail.orderDetails")}</p>
                <div className="flex justify-between gap-3">
                  <span>{t("detail.variantsAndItems", { variants: order.data.items.length, items: units })}</span>
                  <span className="tabular-nums">{money(subtotal, currency, locale)}</span>
                </div>
                {orderCharges(order.data).map((adjustment, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <span>{knownName(adjustmentKeys, adjustment.description, t)}</span>
                    <span className="tabular-nums">{money(adjustment.amount, currency, locale)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{t("detail.columns.total")}</span>
                  <span className="tabular-nums">{money(orderTotal(order.data), currency, locale)}</span>
                </div>
              </CardContent>
            </Card>
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
                <Detail label={noteLabel} value={order.data.notes || "—"} />
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

// A line's supplier SKU, or each component's for a bundle, so the supplier knows what to make.
function SupplierSku({ item, notSet }: { item: OrderItem; notSet: string }) {
  if (item.components?.length) {
    return item.components.map((component) => (
      <p key={component.variantId}>
        {component.quantity} × {component.supplierSku || component.buyerSku || notSet}
      </p>
    ))
  }
  return item.supplierSku || <WarningNote>{notSet}</WarningNote>
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  )
}
