import { amazonNetworkNames, money, type OrderItem, orderTotal } from "@repo/aisle"
import { destinationRequirements, itemRequirements, sharedPrep } from "@repo/aisle/requirements"
import { desc, eq, inArray } from "drizzle-orm"
import { ArrowRight, Building2, ChevronRight, Info as InfoIcon, MapPin, Warehouse } from "lucide-react"
import type { Metadata } from "next"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import Link from "next/link"
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
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { contacts, events, forwarders, orderRevisions, organizations, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { adjustmentKeys, knownName, paymentTermKeys } from "@/lib/order-lines"
import { storedEvent } from "@/lib/timeline-events"
import { accessibleOrder, forwarderOrder } from "@/server/access"
import { amazonFreightByOrder } from "@/server/amazon-shipments"
import { noAccessTitle, requirePage, session } from "@/server/auth"
import { landedCostKinds, landedMarkup, orderLandedCosts } from "@/server/landed-costs"
import { withRequest } from "@/server/next-request"
import { proposalChanges, proposalState, unpricedChanges } from "@/server/order-proposals"
import { lineLabels } from "@/server/product-barcodes"
import { requirementTranslator } from "@/server/requirements"
import { forwarderLeg } from "@/server/shipment-legs"
import { storeTimeZone } from "@/server/store-time-zone"
import { orderWorkflow } from "@/server/workflow"
import { ForwarderView } from "./forwarder-view"

type Props = { params: Promise<{ id: string }> }

// The PO's reference names the tab. Looking the PO up here too gives a malformed or unknown id the not-found page's
// title.
export const generateMetadata = withRequest(async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [s, { id }] = await Promise.all([session(), params])
  if (!can(s, "orders")) {
    return noAccessTitle()
  }
  const { order } = s.org.kind === "forwarder" ? await forwarderOrder(s, id) : await accessibleOrder(s, id)
  return { title: order.data.reference }
})

export default withRequest(async function OrderPage({ params }: Props) {
  const [s, t, common, format, locale] = await Promise.all([
    session(),
    getTranslations("orders"),
    getTranslations("common"),
    getFormatter(),
    getLocale()
  ])
  requirePage(s, "orders")
  // A malformed or unknown id is a not-found, from forwarderOrder or accessibleOrder.
  const { id } = await params
  if (s.org.kind === "forwarder") {
    return <ForwarderView row={await forwarderOrder(s, id)} editable={can(s, "orders", "edit")} />
  }
  // Someone who can only view purchase orders sees the PO without its buttons; shipments are their own page.
  const editsOrder = can(s, "orders", "edit")
  const seesShipments = can(s, "shipments")
  const editsShipments = can(s, "shipments", "edit")
  // Someone who doesn't see prices gets the PO without its costs, totals, landed costs and priced documents.
  const prices = can(s, "prices")
  const { order, supplier } = await accessibleOrder(s, id)
  const [shipmentRows, history, revisions, buyerName] = await Promise.all([
    // Oldest first, so "Shipment 2" here is Shipment 2 on the shipments list and the shipment's page.
    db().select().from(shipments).where(eq(shipments.orderId, id)).orderBy(shipments.createdAt),
    db().select().from(events).where(eq(events.orderId, id)).orderBy(desc(events.createdAt)),
    db().select().from(orderRevisions).where(eq(orderRevisions.orderId, id)).orderBy(desc(orderRevisions.revision)),
    // The supplier reads the buyer's note as from the buyer, by its workspace's name.
    s.org.kind === "supplier"
      ? db()
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, order.buyerOrgId))
          .then((rows) => rows[0]?.name)
      : undefined
  ])
  // Suppliers see where the PO stands on their side, in their order list's words: its latest shipment's status until
  // it's closed. Buyers see the PO's own.
  const status =
    s.org.kind === "supplier" && order.status !== "closed"
      ? (shipmentRows.at(-1)?.status ?? order.status)
      : order.status
  const [workflow, proposals] = await Promise.all([orderWorkflow(s, id), proposalState(id)])
  // The supplier's latest changes: pending for both sides, or declined for the supplier to see why.
  const proposal =
    proposals.latest &&
    (proposals.latest.status === "pending" || (proposals.latest.status === "declined" && s.org.kind === "supplier"))
      ? proposals.latest
      : null
  const remainingFor = (itemId: string) => workflow.items.find((row) => row.itemId === itemId)?.remainingPieces
  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const [landed, freight] =
    s.org.kind === "buyer"
      ? await Promise.all([
          orderLandedCosts(id),
          amazonFreightByOrder(s.org.id).then((rows) =>
            rows.filter((row) => row.orderId === id && row.currency === currency)
          )
        ])
      : [[], []]
  // Amazon's freight for this PO's shipments counts with the costs recorded here.
  const landedTotal =
    landed.reduce((sum, cost) => sum + cost.amountMinor, 0) + freight.reduce((sum, row) => sum + row.freightMinor, 0)
  const markup = landedMarkup(order.data, landedTotal)
  const buyer = s.org.kind === "buyer"
  // Each line's label, from its product's current barcode and label setting.
  const labels = await lineLabels(order)
  const labelFor = (itemId: string) => labels.find((label) => label.itemId === itemId)
  // What happened to the PO, newest first: its events, and each revision, which opens to show its lines.
  const timeline = [
    ...history.map((event) => ({
      key: event.id,
      at: event.createdAt,
      content: (event.kind === "event" && storedEvent(event)) || (event.message ?? ""),
      comment: event.kind === "comment",
      author: event.author,
      authorOrg: event.authorOrg,
      revision: null,
      revisionNumber: null
    })),
    ...revisions.map((r) => ({
      key: r.id,
      at: r.createdAt,
      content: storedEvent({ messageKey: r.reason, messageValues: null }) ?? r.reason,
      comment: false,
      author: null,
      authorOrg: null,
      revision: r.data,
      revisionNumber: r.revision
    }))
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
  // The documents kept with the PO that this workspace can download: the PO's own, then each shipment's, in the order
  // they're made. Product labels are made from each product instead, in the Products table.
  const documentOrder = ["purchase_order", "invoice", "packing_list", "checklist", "carton_label", "shipping_label"]
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    // Shipments' documents are for those who can open shipments.
    ...(seesShipments ? shipmentRows : []).map((shipment, index) => ({
      key: shipment.id,
      title: t("detail.shipment", { number: index + 1 }),
      shipmentId: shipment.id
    }))
  ].flatMap((group) => {
    const documents = workflow.documents
      .filter((doc) => doc.downloadUrl && doc.shipmentId === group.shipmentId && documentOrder.includes(doc.kind))
      .toSorted(
        (a, b) =>
          documentOrder.indexOf(a.kind) - documentOrder.indexOf(b.kind) ||
          (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
      )
      // The purchase order and the commercial invoice are priced.
      .filter((doc) => prices || !["purchase_order", "invoice"].includes(doc.kind))
    return documents.length ? [{ ...group, documents }] : []
  })
  const prep = sharedPrep(order.data)
  // The forwarder the goods pass through, if any. The buyer ships its leg on for one that isn't on Copacker.
  const legId = forwarderLeg(order.data)
  const leg = legId
    ? await db()
        .select({ name: forwarders.name, forwarderOrgId: forwarders.forwarderOrgId })
        .from(forwarders)
        .where(eq(forwarders.id, legId))
        .then((rows) => rows[0])
    : undefined
  const text = await requirementTranslator()
  const instructions = [...(prep ? [{ code: "prep" as const, prep }] : []), ...destinationRequirements(order.data)].map(
    text.requirement
  )

  const units = order.data.items.reduce((n, item) => n + item.pieces, 0)
  const subtotal = order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
  // The route's names: the forwarder stop and the delivery address.
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  const place = (addressId: string | undefined) => places.find((candidate) => candidate.id === addressId)?.name
  // The stop goes by the PO's forwarder and its address there, such as "Yiwu Logistics, Yiwu warehouse": an address the
  // buyer saved for the forwarder, or the forwarder's own once it has joined.
  const stop = order.data.via && [leg?.name, place(order.data.via.addressId)].filter(Boolean).join(", ")
  // A calendar day, such as the date the PO is required by, the same wherever it's read.
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    })
  // The buyer's note, labeled from the viewer's side: to the supplier for the buyer, from the buyer for the supplier.
  let noteLabel = t("detail.noteToSupplier")
  if (s.org.kind === "supplier") {
    noteLabel = buyerName ? t("detail.noteFrom", { buyer: buyerName }) : t("detail.buyersNote")
  }

  return (
    <>
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
          proposals.changeable &&
          proposal?.status !== "pending" && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${id}/revise`} />}>
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
          proposal={{ id: proposal.id, status: proposal.status, note: proposal.data.note, reason: proposal.reason }}
          changes={
            prices
              ? proposalChanges(order.data, proposal.data)
              : unpricedChanges(proposalChanges(order.data, proposal.data))
          }
          currency={order.data.currency}
          viewer={s.org.kind === "buyer" ? "buyer" : "supplier"}
          supplierName={supplier.name}
          orderId={id}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
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
                  render={<Link href={`/orders/${id}/edit`} />}
                  nativeButton={false}
                >
                  {t("builder.edit")}
                </Button>
              )}
            </div>
            {/* Too narrow for its columns, as on a phone, each line stacks: the product with its menu, then the supplier
                SKU, the quantity at its cost and the total. */}
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
                  {order.data.items.map((item) => (
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
                        {itemRequirements(item, order.data.destination, prep)
                          .map(text.requirement)
                          .map((line) => (
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
                        {item.piecesPerSet > 1 && (
                          <p className="text-xs text-muted-foreground">
                            {t("detail.perPack", { count: item.piecesPerSet })}
                          </p>
                        )}
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
                          {money(item.pieces * item.unitPrice, currency, locale)}
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
          </Card>

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
                            count: shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
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
                          href={`/shipments/${shipment.id}`}
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
            timeZone={await storeTimeZone(s.org)}
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
                {order.data.adjustments?.map((adjustment, index) => (
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
              freight={freight.map((row) => ({ reference: row.reference, amount: row.freightMinor }))}
              costs={landed.map((cost) => ({
                id: cost.id,
                kind: landedCostKinds[cost.kind],
                description: cost.description,
                amount: cost.amountMinor
              }))}
            />
          )}
        </aside>
      </div>
    </>
  )
})

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
