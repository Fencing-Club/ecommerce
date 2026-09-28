import { amazonNetworkNames, money, type OrderItem, orderTotal } from "@repo/aisle"
import { destinationRequirements, itemRequirements, sharedPrep } from "@repo/aisle/requirements"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { ArrowRight, Building2, ChevronRight, Info as InfoIcon, MapPin, Warehouse } from "lucide-react"
import { http, HttpResponse } from "msw"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
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
import type { events, orderProposals, orderRevisions, orders, shipments, suppliers } from "@/db/schema"
import { can, type Permissions } from "@/lib/access"
import { adjustmentKeys, knownName, paymentTermKeys } from "@/lib/order-lines"
import { storedEvent } from "@/lib/timeline-events"
import { landedCostKinds, landedMarkup, type orderLandedCosts } from "@/server/landed-costs"
import type { proposalChanges } from "@/server/order-proposals"
import type { LineLabel } from "@/server/product-barcodes"
import { requirementTranslator } from "@/server/requirements"
import { forwarderLeg } from "@/server/shipment-legs"
import type { orderWorkflow } from "@/server/workflow"
import { deliveryId } from "@/stories/fixtures/orders"
import {
  actionHandler,
  documentRecord,
  forwarderId,
  forwarderWarehouse,
  history,
  landedCosts,
  order as orderData,
  orderId,
  orderRecord,
  packed,
  revisions,
  shipmentRecord,
  stopId,
  supplierRecord,
  warehouse
} from "@/stories/fixtures/purchase-orders"
import { pageStory } from "@/stories/server"
import { member, owner, person, workspaces } from "@/stories/workspace"
import { ForwarderView } from "./forwarder-view"

type Workflow = Awaited<ReturnType<typeof orderWorkflow>>

type Args = {
  kind: "buyer" | "supplier" | "forwarder"
  permissions: Permissions
  // What the page's queries return: the purchase order and its supplier, its shipments oldest first, its events and
  // revisions newest first, and the buyer's name for a supplier.
  order: typeof orders.$inferSelect
  supplier: typeof suppliers.$inferSelect
  shipments: Array<typeof shipments.$inferSelect>
  history: Array<typeof events.$inferSelect>
  revisions: Array<typeof orderRevisions.$inferSelect>
  buyerName?: string
  // orderWorkflow's lines, shipments and documents, and proposalState.
  workflow: {
    items: Array<Pick<Workflow["items"][number], "itemId" | "remainingPieces">>
    shipments: Array<Pick<Workflow["shipments"][number], "editable">>
    documents: Workflow["documents"]
  }
  proposals: { latest: typeof orderProposals.$inferSelect | null; changeable: boolean }
  // What proposalChanges makes of the latest proposal, as this person may see it.
  changes: ReturnType<typeof proposalChanges> | null
  landed: Awaited<ReturnType<typeof orderLandedCosts>>
  freight: Array<{ reference: string; freightMinor: number }>
  labels: LineLabel[]
  // The forwarder on the way, and the route's addresses.
  leg?: { name: string; forwarderOrgId: string | null }
  places: Array<{ id: string; name: string; forwarder: string | null }>
}

// The purchase order page (page.tsx) with what its queries would return.
async function OrderPage(args: Args) {
  const { kind, permissions: s } = args
  const [t, common, format, locale] = await Promise.all([
    getTranslations("orders"),
    getTranslations("common"),
    getFormatter(),
    getLocale()
  ])
  const id = args.order.id
  if (kind === "forwarder") {
    const forwarder = { id: forwarderId, name: args.leg?.name ?? "", buyerOrgId: args.order.buyerOrgId }
    return (
      <ForwarderView
        row={{ order: args.order, supplier: args.supplier, forwarder }}
        editable={can(s, "orders", "edit")}
      />
    )
  }
  const editsOrder = can(s, "orders", "edit")
  const seesShipments = can(s, "shipments")
  const editsShipments = can(s, "shipments", "edit")
  const prices = can(s, "prices")
  const { order, supplier, shipments: shipmentRows, workflow, proposals, landed, labels, leg } = args
  const status =
    kind === "supplier" && order.status !== "closed" ? (shipmentRows.at(-1)?.status ?? order.status) : order.status
  const proposal =
    proposals.latest &&
    (proposals.latest.status === "pending" || (proposals.latest.status === "declined" && kind === "supplier"))
      ? proposals.latest
      : null
  const remainingFor = (itemId: string) => workflow.items.find((row) => row.itemId === itemId)?.remainingPieces
  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const buyer = kind === "buyer"
  const freight = buyer ? args.freight : []
  const landedTotal =
    landed.reduce((sum, cost) => sum + cost.amountMinor, 0) + freight.reduce((sum, row) => sum + row.freightMinor, 0)
  const markup = landedMarkup(order.data, landedTotal)
  const labelFor = (itemId: string) => labels.find((label) => label.itemId === itemId)
  const timeline = [
    ...args.history.map((event) => ({
      key: event.id,
      at: event.createdAt,
      content: (event.kind === "event" && storedEvent(event)) || (event.message ?? ""),
      comment: event.kind === "comment",
      author: event.author,
      authorOrg: event.authorOrg,
      revision: null,
      revisionNumber: null
    })),
    ...args.revisions.map((r) => ({
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
  const documentOrder = ["purchase_order", "invoice", "packing_list", "checklist", "carton_label", "shipping_label"]
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
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
      .filter((doc) => prices || !["purchase_order", "invoice"].includes(doc.kind))
    return documents.length ? [{ ...group, documents }] : []
  })
  const prep = sharedPrep(order.data)
  const via = forwarderLeg(order.data) && order.data.via && leg?.name
  const text = await requirementTranslator()
  const instructions = [...(prep ? [{ code: "prep" as const, prep }] : []), ...destinationRequirements(order.data)].map(
    text.requirement
  )
  const units = order.data.items.reduce((n, item) => n + item.pieces, 0)
  const subtotal = order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
  const place = (addressId: string | undefined) => {
    const row = args.places.find((candidate) => candidate.id === addressId)
    return row && [row.forwarder, row.name].filter(Boolean).join(", ")
  }
  const stop = order.data.via && (place(order.data.via.addressId) ?? via)
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    })
  let noteLabel = t("detail.noteToSupplier")
  if (kind === "supplier") {
    noteLabel = args.buyerName ? t("detail.noteFrom", { buyer: args.buyerName }) : t("detail.buyersNote")
  }

  return (
    <>
      <PageHeader
        parents={[{ label: kind === "supplier" ? t("index.supplierTitle") : t("index.title"), href: "/orders" }]}
        title={order.data.reference}
        badge={<Status status={status} />}
      >
        {order.status === "draft" && buyer && editsOrder && (
          <ActionButton action="order.submit" data={{ id, revision: order.revision }}>
            {supplier.supplierOrgId ? t("detail.submitToSupplier") : t("detail.send")}
          </ActionButton>
        )}
        {kind === "supplier" &&
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

      {kind === "buyer" && !supplier.supplierOrgId && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{t("detail.offCopacker.title", { supplier: supplier.name })}</AlertTitle>
          <AlertDescription>{t("detail.offCopacker.description")}</AlertDescription>
        </Alert>
      )}

      {proposal && args.changes && (proposal.status === "pending" || proposal.status === "declined") && (
        <ProposalPanel
          proposal={{ id: proposal.id, status: proposal.status, note: proposal.data.note, reason: proposal.reason }}
          changes={args.changes}
          currency={order.data.currency}
          viewer={kind === "buyer" ? "buyer" : "supplier"}
          supplierName={supplier.name}
          orderId={id}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
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
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("detail.columns.products")}</th>
                    <th className="w-36 px-2 py-2 text-start font-medium">{t("detail.columns.supplierSku")}</th>
                    <th className="w-24 px-2 py-2 text-end font-medium">{t("detail.columns.quantity")}</th>
                    {prices && <th className="w-28 px-2 py-2 text-end font-medium">{t("detail.columns.cost")}</th>}
                    {prices && <th className="w-28 px-2 py-2 text-end font-medium">{t("detail.columns.total")}</th>}
                    <th className="w-12">
                      <span className="sr-only">{t("detail.columns.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.data.items.map((item) => (
                    <tr key={item.id} className="border-t align-top">
                      <td className="px-3 py-2.5">
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
                      </td>
                      <td className="px-2 py-2.5">
                        <SupplierSku item={item} notSet={t("detail.notSet")} />
                      </td>
                      <td className="px-2 py-2.5 text-end tabular-nums">
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
                      </td>
                      {prices && (
                        <td className="px-2 py-2.5 text-end tabular-nums">{money(item.unitPrice, currency, locale)}</td>
                      )}
                      {prices && (
                        <td className="px-2 py-2.5 text-end tabular-nums">
                          {money(item.pieces * item.unitPrice, currency, locale)}
                        </td>
                      )}
                      <td className="py-1.5 pe-2 text-end">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            viewer={person.name}
            viewerOrg={workspaces[kind].name}
            timeZone={undefined}
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

          {kind === "buyer" && prices && (
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
}

// A line's supplier SKU, or each component's for a bundle, as the page shows it.
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

// PO-1042, sent: a note, a due date, a basket without a supplier SKU, and shipment 1 being packed with 80 totes.
const [tote, apron, basket] = orderData.items
const sent = orderRecord({
  data: {
    ...orderData,
    notes: "Please use the recycled polybags.",
    dueDate: "2026-11-15",
    items: [tote!, apron!, { ...basket!, supplierSku: "" }]
  }
})
const packing = shipmentRecord({ status: "packing", packingDraft: packed(2) })
const shipped = shipmentRecord({ status: "shipped", packing: packed(3), amazonShipmentId: "FBA17XK2" })
const remainingAll = orderData.items.map((item) => ({ itemId: item.id, remainingPieces: item.pieces }))
const purchaseOrderDocument = documentRecord({ kind: "purchase_order", name: "PO-1042.pdf" })
const packingList = documentRecord({ kind: "packing_list", name: "Packing list.pdf", shipmentId: packing.id })
const invoice = documentRecord({ kind: "invoice", name: "Lotus invoice 118.pdf", shipmentId: packing.id })
const workflowDocument = (doc: typeof purchaseOrderDocument) => ({
  id: doc.id,
  name: doc.name,
  kind: doc.kind,
  shipmentId: doc.shipmentId,
  cartonId: doc.cartonId,
  itemId: doc.itemId,
  downloadUrl: `/api/documents/${doc.id}`
})

// The supplier's pending changes: more totes at a lower price, the basket dropped, a jute tote added, and new terms.
const proposal: typeof orderProposals.$inferSelect = {
  id: "7a8b9c0d-1e2f-4a3b-8c4d-000000000001",
  orderId,
  baseRevision: 1,
  status: "pending",
  data: {
    lines: [
      { itemId: tote!.id, supplierSku: tote!.supplierSku, title: "Canvas tote bag", pieces: 300, unitPrice: 410 },
      { itemId: apron!.id, supplierSku: apron!.supplierSku, title: "Linen apron", pieces: 120, unitPrice: 890 },
      { supplierSku: "LM-JUTE", title: "Jute tote", pieces: 100, unitPrice: 500 }
    ],
    paymentTerms: "Net 45",
    readyDate: null,
    note: "The basket is discontinued; the jute tote replaces it."
  },
  proposedBy: "user_supplier",
  decidedBy: null,
  decidedAt: null,
  reason: null,
  createdAt: new Date()
}
const changes: ReturnType<typeof proposalChanges> = {
  lines: [
    {
      key: tote!.id,
      name: "Canvas tote bag / Natural",
      supplierSku: tote!.supplierSku,
      change: "changed",
      before: { pieces: 240, unitPrice: 425 },
      after: { pieces: 300, unitPrice: 410 }
    },
    {
      key: apron!.id,
      name: "Linen apron / Charcoal",
      supplierSku: apron!.supplierSku,
      change: "same",
      before: { pieces: 120, unitPrice: 890 },
      after: { pieces: 120, unitPrice: 890 }
    },
    {
      key: "LM-JUTE",
      name: "Jute tote",
      supplierSku: "LM-JUTE",
      change: "added",
      before: null,
      after: { pieces: 100, unitPrice: 500 }
    },
    {
      key: basket!.id,
      name: "Market basket / Large",
      supplierSku: basket!.supplierSku,
      change: "removed",
      before: { pieces: 60, unitPrice: 1450 },
      after: null
    }
  ],
  paymentTerms: { before: "Net 30", after: "Net 45" },
  readyDate: null,
  total: { before: 295_800, after: 279_800 }
}

// The landed costs recorded on it, as the database keeps them.
const landed: Args["landed"] = [
  { id: landedCosts[0]!.id, kind: "freight", description: landedCosts[0]!.description, amountMinor: 42_000 },
  { id: landedCosts[1]!.id, kind: "duty", description: "", amountMinor: 18_550 }
]

// The page for a workspace of `kind`, for someone with `permissions`.
function page(kind: Args["kind"], permissions: Permissions = owner) {
  const story = pageStory(`/orders/${orderId}`, OrderPage, kind)
  return { loaders: story.loaders, decorators: story.decorators, parameters: { ...story.parameters, permissions } }
}

const actions = fn()
const answered = fn()

const meta = preview.meta({
  title: "Pages/Purchase orders/Detail",
  // Each story shows it in its workspace's portal; the render is the same for all.
  render: pageStory(`/orders/${orderId}`, OrderPage).render,
  args: {
    kind: "buyer",
    permissions: owner,
    order: sent,
    supplier: supplierRecord(),
    shipments: [packing],
    history,
    revisions,
    workflow: {
      items: remainingAll.map((row) => (row.itemId === tote!.id ? { ...row, remainingPieces: 160 } : row)),
      shipments: [{ editable: true }],
      documents: [purchaseOrderDocument, packingList, invoice].map(workflowDocument)
    },
    proposals: { latest: null, changeable: true },
    changes: null,
    landed,
    freight: [{ reference: "FBA17XK2", freightMinor: 31_000 }],
    labels: [
      { itemId: tote!.id, state: "uploaded", name: "tote.pdf", objectKey: "labels/tote.pdf" },
      {
        itemId: apron!.id,
        state: "missing",
        problem: "Its FNSKU is looked up when the purchase order is sent",
        problemKey: "fnskuLookedUpOnSend"
      },
      { itemId: basket!.id, state: "none" }
    ],
    places: [{ id: deliveryId, name: "Oakland warehouse", forwarder: null }]
  } satisfies Args,
  beforeEach: ({ msw }) => {
    msw.use(
      actionHandler(actions),
      http.post("/api/proposals/:id", async ({ params, request }) => {
        answered(params.id, await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

// A sent purchase order being packed, as the buyer's owner sees it.
export const Sent = meta.story({
  ...page("buyer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "PO-1042" })).toBeVisible()
    await expect(canvas.getByText("With supplier", { selector: "[data-slot=badge], span" })).toBeVisible()
    await expect(canvas.getByText("Oakland warehouse")).toBeVisible()
    await expect(canvas.getByText("160 to ship")).toBeVisible()
    // A line without a supplier SKU says so.
    await expect(canvas.getByText("Not set")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "Cost" })).toBeVisible()
    await expect(canvas.getAllByText("$2,958.00").length).toBeGreaterThan(0)
    await expect(canvas.getByText("Nov 15, 2026")).toBeVisible()
    await expect(canvas.getByText("Please use the recycled polybags.", { selector: "dd" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "About landed costs" })).toBeVisible()
    await expect(canvas.getByRole("heading", { name: "Timeline" })).toBeVisible()
    await expect(canvas.getByText("Purchase order submitted to supplier")).toBeVisible()
    // Shipment 1 opens its page.
    await expect(canvas.getByRole("link", { name: /Shipment 1/ })).toHaveAttribute("href", `/shipments/${packing.id}`)
    await expect(canvas.getByText("Cartons in preparation, 2 cartons")).toBeVisible()
    const documents = within(canvas.getByText("Documents").closest("[data-slot=card]")!)
    await expect(documents.getAllByRole("link")).toHaveLength(3)
    // The apron's label can't be made yet.
    await expect(
      canvas.getByLabelText(
        "No label for Linen apron / Charcoal: Its FNSKU is looked up when the purchase order is sent"
      )
    ).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Continue packing" }))
    await waitFor(() => expect(actions).toHaveBeenCalledWith({ action: "shipment.create", data: { id: orderId } }))
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

// A draft: Submit to supplier sends it, and it can be edited or deleted.
export const Draft = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "draft" }),
    shipments: [],
    workflow: { items: remainingAll, shipments: [], documents: [] },
    landed: [],
    freight: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipments start once the purchase order is sent.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit" })).toHaveAttribute("href", `/orders/${orderId}/edit`)
    await expect(canvas.queryByText("Documents")).toBeNull()
    await expect(canvas.getByText("No costs yet")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await expect(await screen.findByRole("menuitem", { name: "Delete draft" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await userEvent.click(canvas.getByRole("button", { name: "Submit to supplier" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({ action: "order.submit", data: { id: orderId, revision: 1 } })
    )
  }
})

// A draft to a supplier that isn't on Copacker: the buyer sends it and enters the supplier's side.
export const DraftOffCopacker = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "draft" }),
    supplier: supplierRecord({ supplierOrgId: null }),
    shipments: [],
    workflow: { items: remainingAll, shipments: [], documents: [] }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing isn’t on Copacker")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send purchase order" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Submit to supplier" })).toBeNull()
  }
})

// The supplier proposed changes: the buyer reviews them before any more packing.
export const ChangesProposed = meta.story({
  ...page("buyer"),
  args: { proposals: { latest: proposal, changeable: true }, changes },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing proposed changes")).toBeVisible()
    await expect(canvas.getByText("The basket is discontinued; the jute tote replaces it.")).toBeVisible()
    await expect(canvas.getByText("Jute tote")).toBeVisible()
    await expect(canvas.getByText("1 unchanged")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Continue packing" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() => expect(answered).toHaveBeenCalledWith(proposal.id, expect.anything()))
  }
})

// Shipped through a forwarder that isn't on Copacker: the buyer ships its leg on.
export const ShipOnFromForwarder = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ data: { ...orderData, via: { forwarderId, addressId: stopId } } }),
    shipments: [shipped],
    workflow: {
      items: orderData.items.map((item) => ({ itemId: item.id, remainingPieces: 0 })),
      shipments: [{ editable: false }],
      documents: []
    },
    leg: { name: "Bayline Freight", forwarderOrgId: null },
    places: [
      { id: deliveryId, name: "Oakland warehouse", forwarder: null },
      { id: stopId, name: "Ningbo warehouse", forwarder: "Bayline Freight" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.getByText("FBA17XK2, 3 cartons")).toBeVisible()
    // Everything is assigned, so there's no next shipment to prepare.
    await expect(canvas.queryByRole("button", { name: "Prepare next shipment" })).toBeNull()
    await expect(canvas.getAllByText("0 to ship")).toHaveLength(3)
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await expect(await screen.findByRole("dialog", { name: "Mark shipped" })).toBeInTheDocument()
  }
})

export const Closed = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "closed" }),
    shipments: [{ ...shipped, status: "received" }],
    workflow: {
      items: orderData.items.map((item) => ({ itemId: item.id, remainingPieces: 0 })),
      shipments: [{ editable: false }],
      documents: []
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Closed").length).toBeGreaterThan(0)
    await expect(canvas.getByText("Received")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Continue packing|Prepare next shipment/ })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await expect(screen.queryByRole("menuitem", { name: "Close purchase order" })).toBeNull()
  }
})

// A member who views purchase orders and shipments without prices: no costs, no buttons, no priced documents.
export const MemberWithoutPrices = meta.story({
  ...page("buyer", member),
  args: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Cost" })).toBeNull()
    await expect(canvas.queryByText("Cost summary")).toBeNull()
    await expect(canvas.queryByText("Landed costs")).toBeNull()
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Continue packing" })).toBeNull()
    const documents = within(canvas.getByText("Documents").closest("[data-slot=card]")!)
    await expect(documents.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Download Packing listPacking list.pdf"
    ])
  }
})

// A member without Shipments sees each shipment without its link or documents.
export const MemberWithoutShipments = meta.story({
  ...page("buyer", { role: "member", access: { orders: "view" } }),
  args: { permissions: { role: "member", access: { orders: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipment 1")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /Shipment 1/ })).toBeNull()
    await expect(canvas.queryByText("Documents")).toBeNull()
  }
})

// The supplier's side: where its shipment stands, the buyer's note, and changes it can propose.
export const Supplier = meta.story({
  ...page("supplier"),
  args: { kind: "supplier", buyerName: "Harbor Goods" },
  play: async ({ canvas }) => {
    const breadcrumb = within(canvas.getByRole("navigation", { name: "Breadcrumb" }))
    await expect(breadcrumb.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders")
    // The header shows its latest shipment's status, as the supplier's list does.
    await expect(canvas.getAllByText("Packing")).toHaveLength(2)
    await expect(canvas.getByText("Note from Harbor Goods")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit order" })).toHaveAttribute(
      "href",
      `/orders/${orderId}/revise`
    )
    await expect(canvas.getByRole("button", { name: "Continue packing" })).toBeVisible()
    await expect(canvas.queryByText("Landed costs")).toBeNull()
    await expect(canvas.queryByText(/isn’t on Copacker/)).toBeNull()
  }
})

// The buyer declined the supplier's changes: the supplier sees why, and can propose again.
export const SupplierChangesDeclined = meta.story({
  ...page("supplier"),
  args: {
    kind: "supplier",
    proposals: {
      latest: { ...proposal, status: "declined", reason: "We still need the baskets." },
      changeable: true
    },
    changes
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your proposed changes")).toBeVisible()
    await expect(canvas.getByText("Declined")).toBeVisible()
    await expect(canvas.getByText("Reason: We still need the baskets.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit order" })).toBeVisible()
    // The note is the buyer's, unnamed without its workspace.
    await expect(canvas.getByText("Buyer’s note")).toBeVisible()
  }
})

// A forwarder opens the purchase order its goods pass through.
export const Forwarder = meta.story({
  ...page("forwarder"),
  args: {
    kind: "forwarder",
    order: orderRecord({ data: { ...orderData, via: { forwarderId, addressId: stopId } } }),
    leg: { name: "Bayline Freight", forwarderOrgId: workspaces.forwarder.id }
  },
  parameters: { db: { contacts: [warehouse, forwarderWarehouse], shipments: [shipped], documents: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "PO-1042" })).toBeVisible()
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await expect(canvas.queryByRole("heading", { name: "Timeline" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Mark shipped" })).toBeVisible()
  }
})
