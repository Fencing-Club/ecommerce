import { amazonNetworkNames, money, type OrderItem, orderTotal } from "@repo/aisle"
import { destinationRequirements, itemRequirements, prepInstructions, sharedPrep } from "@repo/aisle/requirements"
import { desc, eq, inArray } from "drizzle-orm"
import { ArrowRight, Building2, ChevronRight, Info as InfoIcon, MapPin, Warehouse } from "lucide-react"
import type { Metadata } from "next"
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
import { db } from "@/db"
import { contacts, events, forwarders, orderRevisions, organizations, shipments } from "@/db/schema"
import { shortDate } from "@/lib/format"
import { accessibleOrder, forwarderOrder } from "@/server/access"
import { amazonFreightByOrder } from "@/server/amazon-shipments"
import { session } from "@/server/auth"
import { landedCostKinds, landedMarkup, orderLandedCosts } from "@/server/landed-costs"
import { proposalChanges, proposalState } from "@/server/order-proposals"
import { lineLabels } from "@/server/product-barcodes"
import { forwarderLeg } from "@/server/shipment-legs"
import { orderWorkflow } from "@/server/workflow"
import { ForwarderView } from "./forwarder-view"

type Props = { params: Promise<{ id: string }> }

// The PO's reference names the tab. Looking the PO up here too gives a malformed or unknown id the not-found page's
// title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [s, { id }] = await Promise.all([session(), params])
  const { order } = s.org.kind === "forwarder" ? await forwarderOrder(s, id) : await accessibleOrder(s, id)
  return { title: order.data.reference }
}

export default async function OrderPage({ params }: Props) {
  const s = await session()
  // A malformed or unknown id is a not-found, from forwarderOrder or accessibleOrder.
  const { id } = await params
  if (s.org.kind === "forwarder") {
    return <ForwarderView row={await forwarderOrder(s, id)} />
  }
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
      message: event.message,
      comment: event.kind === "comment",
      author: event.author,
      authorOrg: event.authorOrg,
      revision: null
    })),
    ...revisions.map((r) => ({
      key: r.id,
      at: r.createdAt,
      message: r.revision === 1 ? r.reason : `Revision ${r.revision}: ${r.reason}`,
      comment: false,
      author: null,
      authorOrg: null,
      revision: r.data
    }))
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
  // The documents kept with the PO that this workspace can download: the PO's own, then each shipment's, in the order
  // they're made. Product labels are made from each product instead, in the Products table.
  const documentOrder = ["purchase_order", "invoice", "packing_list", "checklist", "carton_label", "shipping_label"]
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    ...shipmentRows.map((shipment, index) => ({
      key: shipment.id,
      title: `Shipment ${index + 1}`,
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
  const via = order.data.via && leg?.name
  const instructions = [...(prep ? [`${prepInstructions[prep]}.`] : []), ...destinationRequirements(order.data)]

  const units = order.data.items.reduce((n, item) => n + item.pieces, 0)
  const subtotal = order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
  // The route's names: the forwarder stop and the delivery address, each with its forwarder when it has one.
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db()
        .select({ id: contacts.id, name: contacts.name, forwarder: forwarders.name })
        .from(contacts)
        .leftJoin(forwarders, eq(forwarders.id, contacts.forwarderId))
        .where(inArray(contacts.id, addressIds))
    : []
  const place = (addressId: string | undefined) => {
    const row = places.find((candidate) => candidate.id === addressId)
    return row && [row.forwarder, row.name].filter(Boolean).join(", ")
  }
  const stop = order.data.via && (place(order.data.via.addressId) ?? via)

  return (
    <>
      <PageHeader
        parents={[{ label: s.org.kind === "supplier" ? "Orders" : "Purchase orders", href: "/orders" }]}
        title={order.data.reference}
        badge={<Status status={status} />}
      >
        {order.status === "draft" && buyer && (
          <ActionButton action="order.submit" data={{ id, revision: order.revision }}>
            {supplier.supplierOrgId ? "Submit to supplier" : "Send purchase order"}
          </ActionButton>
        )}
        {s.org.kind === "supplier" &&
          order.status === "submitted" &&
          proposals.changeable &&
          proposal?.status !== "pending" && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${id}/revise`} />}>
              Edit order
            </Button>
          )}
        {order.status === "submitted" && (editable || remaining) && proposal?.status !== "pending" && (
          <ActionButton action="shipment.create" data={{ id }}>
            {editable ? "Continue packing" : "Prepare next shipment"}
          </ActionButton>
        )}
        <OrderMenu
          id={id}
          reference={order.data.reference}
          draft={order.status === "draft" && buyer}
          closable={order.status === "submitted" && buyer}
          labels={
            labels.some((label) => label.state === "uploaded" || label.state === "standard") ||
            order.data.items.some((item) => item.suffocationWarning)
          }
        />
      </PageHeader>

      {s.org.kind === "buyer" && !supplier.supplierOrgId && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{supplier.name} isn’t on Copacker</AlertTitle>
          <AlertDescription>
            Email them the purchase order yourself, then enter their cartons and invoice on the shipment.
          </AlertDescription>
        </Alert>
      )}

      {proposal && (proposal.status === "pending" || proposal.status === "declined") && (
        <ProposalPanel
          proposal={{ id: proposal.id, status: proposal.status, note: proposal.data.note, reason: proposal.reason }}
          changes={proposalChanges(order.data, proposal.data)}
          currency={order.data.currency}
          viewer={s.org.kind === "buyer" ? "buyer" : "supplier"}
          supplierName={supplier.name}
          orderId={id}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-1.5 p-3">
              <RoutePill icon={<Building2 />}>{supplier.name}</RoutePill>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              {stop && (
                <>
                  <RoutePill icon={<Warehouse />}>{stop}</RoutePill>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </>
              )}
              <RoutePill icon={<MapPin />}>
                {place(order.data.deliveryId) ?? formatDestination(order.data.destination)}
              </RoutePill>
              {order.status === "draft" && buyer && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  render={<Link href={`/orders/${id}/edit`} />}
                  nativeButton={false}
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Products</th>
                    <th className="w-36 px-2 py-2 text-left font-medium">Supplier SKU</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">Qty</th>
                    <th className="w-28 px-2 py-2 text-right font-medium">Cost</th>
                    <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                    <th className="w-12">
                      <span className="sr-only">Actions</span>
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
                        {itemRequirements(item, order.data.destination, prep).map((line) => (
                          <p key={line} className="text-xs text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </td>
                      <td className="px-2 py-2.5">
                        <SupplierSku item={item} />
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {item.pieces}
                        {item.piecesPerSet > 1 && (
                          <p className="text-xs text-muted-foreground">{item.piecesPerSet} per pack</p>
                        )}
                        {remainingFor(item.id) !== item.pieces && (
                          <p className="text-xs text-muted-foreground">{remainingFor(item.id)} to ship</p>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{money(item.unitPrice, currency)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {money(item.pieces * item.unitPrice, currency)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <LineMenu
                          orderId={id}
                          itemId={item.id}
                          name={[item.name, item.variant === "Default Title" ? "" : item.variant]
                            .filter(Boolean)
                            .join(" / ")}
                          label={labelFor(item.id)}
                          warning={item.suffocationWarning}
                          editable={order.status === "draft" && buyer}
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
                <CardTitle>Instructions</CardTitle>
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
              <CardTitle>Shipments</CardTitle>
            </CardHeader>
            {shipmentRows.length ? (
              <ul>
                {shipmentRows.map((shipment, index) => (
                  <li key={shipment.id} className="flex items-center gap-3 border-t pr-3">
                    <Link
                      href={`/shipments/${shipment.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">
                          Shipment {index + 1}
                          {shipment.amazonNetwork && ` to Amazon ${amazonNetworkNames[shipment.amazonNetwork]}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shipment.amazonShipmentId ?? "Cartons in preparation"},{" "}
                          {shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0} cartons
                        </span>
                      </span>
                      <Status status={shipment.status} />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                    {buyer && shipment.status === "shipped" && leg && !leg.forwarderOrgId && (
                      <ForwardShipment shipmentId={shipment.id} currency={currency} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 pb-3 text-muted-foreground">
                {order.status === "draft" ? "Shipments start once the purchase order is sent." : "No shipments yet."}
              </p>
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
          <PoTimeline
            orderId={id}
            viewer={s.user.name ?? s.user.email}
            viewerOrg={s.org.name}
            timeZone={s.org.timeZone ?? undefined}
            entries={timeline}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Cost summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="font-medium">Order details</p>
              <div className="flex justify-between gap-3">
                <span>
                  {order.data.items.length} {order.data.items.length === 1 ? "variant" : "variants"} ({units}{" "}
                  {units === 1 ? "item" : "items"})
                </span>
                <span className="tabular-nums">{money(subtotal, currency)}</span>
              </div>
              {order.data.adjustments?.map((adjustment, index) => (
                <div key={index} className="flex justify-between gap-3">
                  <span>{adjustment.description}</span>
                  <span className="tabular-nums">{money(adjustment.amount, currency)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(orderTotal(order.data), currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Purchase order details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                {order.data.dueDate && <Detail label="Required by" value={shortDate(order.data.dueDate)} />}
                <Detail label="Payment terms" value={order.data.paymentTerms || "None"} />
                {order.data.readyDate && <Detail label="Ready" value={shortDate(order.data.readyDate)} />}
                <Detail label="Currency" value={currency} />
                <Detail label={noteLabel(s.org.kind, buyerName)} value={order.data.notes || "—"} />
              </dl>
            </CardContent>
          </Card>

          {s.org.kind === "buyer" && (
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

// A line's supplier SKU, or each component's for a bundle, so the supplier knows what to make.
function SupplierSku({ item }: { item: OrderItem }) {
  if (item.components?.length) {
    return item.components.map((component) => (
      <p key={component.variantId}>
        {component.quantity} × {component.supplierSku || component.buyerSku || "Not set"}
      </p>
    ))
  }
  return item.supplierSku || <WarningNote>Not set</WarningNote>
}

// The buyer's note, labeled from the viewer's side: to the supplier for the buyer, from the buyer for the supplier.
function noteLabel(viewer: string, buyerName: string | undefined) {
  if (viewer !== "supplier") {
    return "Note to supplier"
  }
  return buyerName ? `Note from ${buyerName}` : "Buyer’s note"
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  )
}
