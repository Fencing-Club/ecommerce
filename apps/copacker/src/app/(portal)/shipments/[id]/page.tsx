import { money } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { AlertTriangle, ArrowRight, Clock, Download, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Fragment } from "react"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { DocumentList, PageHeader, Status } from "@/components/common"
import { PackingForm } from "@/components/packing-form"
import { ApproveInvoice, CorrectionForm, ReleaseLabels, ReconcileShipment } from "@/components/shipment-actions"
import { ShipmentProgress } from "@/components/shipment-progress"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload } from "@/components/upload"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { shortDate } from "@/lib/format"
import { formatPhone, phoneHref } from "@/lib/phone"
import { accessibleOrder } from "@/server/access"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { session } from "@/server/auth"
import { proposalState } from "@/server/order-proposals"
import { finishedStates, releasedStates, reservedPieces } from "@/server/readiness"
import { supplierPickupAddresses } from "@/server/supplier-addresses"
import { orderWorkflow } from "@/server/workflow"
import { shipmentDestinations } from "../destination"

export const metadata: Metadata = { title: "Shipment" }

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  // A malformed link is a shipment that doesn't exist.
  const parsed = z.uuid().safeParse((await params).id)
  if (!parsed.success) {
    notFound()
  }
  const id = parsed.data
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    notFound()
  }
  const { order, supplier } = await accessibleOrder(s, shipment.orderId)
  const workflow = await orderWorkflow(s, order.id)
  const step = workflow.shipments.find((row) => row.id === id)!
  const reserved = reservedPieces(await db().select().from(shipments).where(eq(shipments.orderId, order.id)), id)
  const snapshot = shipment.snapshot ?? order.data
  const [docs, addresses] = await Promise.all([
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.shipmentId, id), eq(documents.outdated, 0))),
    // Cartons leave from the supplier's pickup addresses: its own once it has joined Copacker, and until then the ones
    // the buyer saved for it.
    supplierPickupAddresses(supplier)
  ])
  // Packing waits while the supplier's changes to the purchase order are with the buyer.
  const { latest } = await proposalState(order.id)
  const awaitingChanges = latest?.status === "pending"
  const editable =
    ["packing", "correction"].includes(shipment.status) &&
    !shipment.amazonOrderId &&
    shipment.operation === "none" &&
    !awaitingChanges
  const isBuyer = s.org.kind === "buyer"
  // Each side's words for the purchase order: the supplier's navigation calls them orders.
  const orderNoun = isBuyer ? "purchase order" : "order"
  // The Amazon shipments are in the buyer's Seller Central, which the supplier can't open, so it reads their IDs.
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) => isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)
  )
  // The shipment's commercial invoice. There's one at most: each upload replaces the last.
  const invoice = docs.find((d) => d.kind === "invoice")
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const origin = shipment.packing?.origin
  const fba = shipment.amazonNetwork === "fba"
  // A supplier that isn't on Copacker sends its details by email, and the buyer enters them here.
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = order.data.destination === "amazon"
  // A purchase order's shipments are numbered oldest first, as on the shipments list.
  const title = `Shipment ${workflow.shipments.findIndex((row) => row.id === id) + 1}`
  const cartonCount = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
  const destination = await shipmentDestinations([order.data])
  // Where it goes and in how many cartons, then Amazon's shipment IDs. The purchase order leads the title.
  const summary = [
    destination(order.data, shipment.amazonNetwork),
    cartonCount && `${cartonCount} ${cartonCount === 1 ? "carton" : "cartons"}`,
    ...amazonIds
  ]
    .filter(Boolean)
    .join(", ")
  // What happens next, where nothing below shows it: the forwarder's leg, or cancelling in Amazon first.
  const nextStep =
    step.next.step === "forward" || (isBuyer && step.next.step === "cancellation") ? step.next.message : undefined
  // The viewer's next step when it's a single click, beside the title.
  const nextAction: Record<string, React.ReactNode> = {
    ship: (!isBuyer || enteringFor) && (
      <ActionButton action="shipment.ship" data={{ id }}>
        Mark shipped
      </ActionButton>
    ),
    receive: isBuyer && (
      <ActionButton action="shipment.received" data={{ id }} variant="outline">
        Mark received
      </ActionButton>
    ),
    retry: isBuyer && (
      <ActionButton action="shipment.retry" data={{ id, revision: shipment.revision }}>
        Retry shipment
      </ActionButton>
    ),
    cancellation: isBuyer && (
      <ActionButton action="shipment.cancelAmazon" data={{ id }}>
        Cancel in Amazon
      </ActionButton>
    )
  }

  return (
    <>
      <PageHeader
        parents={[
          { label: isBuyer ? "Purchase orders" : "Orders", href: "/orders" },
          { label: order.data.reference, href: `/orders/${order.id}` }
        ]}
        title={title}
        badge={<Status status={shipment.status} />}
        description={
          <>
            {summary}
            {amazonLinks.map((link) => (
              <Fragment key={link.id}>
                ,{" "}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {link.id}
                  <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                  <span className="sr-only"> (opens in Seller Central)</span>
                </a>
              </Fragment>
            ))}
          </>
        }
      >
        {nextAction[step.next.step] || null}
      </PageHeader>

      <ShipmentProgress processing={["queued", "creating"].includes(shipment.status)} message={nextStep} />
      {shipment.issue && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{shipment.issue}</AlertDescription>
        </Alert>
      )}

      {awaitingChanges && (
        <Alert>
          <Clock />
          <AlertTitle>Changes waiting for approval</AlertTitle>
          <AlertDescription>
            Packing opens once {isBuyer ? "you answer" : "the customer answers"} the proposed changes on the {orderNoun}
            .
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/orders/${order.id}`} />}>
              View {orderNoun}
            </Button>
          </AlertAction>
        </Alert>
      )}

      {editable ? (
        <PackingForm
          orderId={order.id}
          shipmentId={id}
          key={`${id}:${order.revision}`}
          revision={shipment.revision}
          orderRevision={order.revision}
          availablePieces={Object.fromEntries(
            order.data.items.map((item) => [item.id, Math.max(0, item.pieces - (reserved[item.id] ?? 0))])
          )}
          order={order.data}
          initial={shipment.packingDraft ?? shipment.packing}
          invoice={invoice && { id: invoice.id, name: invoice.name, bytes: invoice.bytes }}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          enteringFor={isBuyer ? supplier.name : undefined}
          addAddressTo={enteringFor && s.role === "owner" ? { id: supplier.id, name: enteringFor } : undefined}
        />
      ) : (
        <>
          {shipment.status === "approval" && (
            <Card>
              <CardHeader>
                <CardTitle>Invoice changes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <ItemGroup className="gap-2">
                  {changes.map(({ item, change }) => (
                    <Item key={change.itemId} variant="muted">
                      <ItemContent>
                        <ItemTitle>
                          {[item.name, item.variant === "Default Title" ? "" : item.variant]
                            .filter(Boolean)
                            .join(" / ")}
                        </ItemTitle>
                        {change.unitPrice !== item.unitPrice && (
                          <ItemDescription className="flex flex-wrap items-center gap-1">
                            Price per piece {money(item.unitPrice, snapshot.currency)}
                            <ArrowRight className="size-3" aria-label="changed to" />
                            {money(change.unitPrice, snapshot.currency)}
                          </ItemDescription>
                        )}
                        {change.supplierSku !== item.supplierSku && (
                          <ItemDescription className="flex flex-wrap items-center gap-1">
                            Supplier SKU {item.supplierSku || "—"}
                            <ArrowRight className="size-3" aria-label="changed to" />
                            {change.supplierSku || "—"}
                          </ItemDescription>
                        )}
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
                {isBuyer ? (
                  <ApproveInvoice id={id} revision={shipment.revision} />
                ) : (
                  <p className="text-sm text-muted-foreground">Waiting for the buyer’s approval</p>
                )}
              </CardContent>
            </Card>
          )}

          {shipment.status === "waiting_labels" && (
            <Card>
              <CardHeader>
                <CardTitle>{isBuyer ? "Shipping labels" : "Waiting for shipping labels"}</CardTitle>
                {isBuyer && (
                  <CardDescription>
                    {fba
                      ? "Book transport to Amazon, then upload the shipping labels"
                      : "Book AGL transport in Amazon, then upload the shipping labels"}
                  </CardDescription>
                )}
              </CardHeader>
              {isBuyer && (
                <CardContent className="flex flex-col gap-6">
                  <Upload
                    orderId={order.id}
                    shipmentId={id}
                    kind="shipping_label"
                    label={null}
                    cartons={shipment.packing?.cartons}
                  />
                  {step.issues.length > 0 && (
                    <ul className="list-disc pl-5 text-sm">
                      {step.issues.map((issue, index) => (
                        <li key={index}>{issue.message}</li>
                      ))}
                    </ul>
                  )}
                  {step.canRelease && <ReleaseLabels id={id} revision={shipment.revision} />}
                </CardContent>
              )}
            </Card>
          )}

          {["queued", "creating"].includes(shipment.status) && (
            <Alert role="note">
              <Loader2 className="animate-spin" />
              <AlertTitle>Creating the Amazon shipment</AlertTitle>
              <AlertDescription>Usually a few minutes</AlertDescription>
            </Alert>
          )}

          {releasedStates.includes(shipment.status) && (
            <Alert role="note" className="border-primary/40">
              {/* The alert colors its icon like its text; this one stays primary. */}
              <PackageCheck className="text-primary!" />
              <AlertTitle>Supplier packet ready</AlertTitle>
              <AlertDescription>Print labels at actual size</AlertDescription>
              {/* Under the text on a phone, top right from sm up. */}
              <AlertAction className="static col-span-full mt-2 sm:absolute sm:mt-0">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={`/api/shipments/${id}/packet`} aria-label="Download supplier packet" />}
                >
                  <Download data-icon="inline-start" />
                  Download packet
                </Button>
              </AlertAction>
            </Alert>
          )}

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b p-4">
              <CardTitle>Cartons</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table
                framed={false}
                className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Carton</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Pieces</TableHead>
                    <TableHead>Dimensions (cm)</TableHead>
                    <TableHead className="text-right">Weight (kg)</TableHead>
                    {amazon && <TableHead>Amazon label</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipment.packing?.cartons.map((c) => (
                    <TableRow key={c.cartonId}>
                      <TableCell className="font-medium">{c.cartonId}</TableCell>
                      <TableCell className="whitespace-normal">
                        {c.items.map((i) => snapshot.items.find((p) => p.id === i.itemId)?.buyerSku).join(", ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.items.reduce((n, i) => n + i.pieces, 0)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {c.length} × {c.width} × {c.height}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.weight}</TableCell>
                      {amazon && (
                        <TableCell className="font-mono text-xs">
                          {shipment.labels.find((l) => l.cartonId === c.cartonId)?.labelNumber ?? "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pickup</CardTitle>
                {shipment.packing && <CardDescription>Ready {shortDate(shipment.packing.readyDate)}</CardDescription>}
              </CardHeader>
              <CardContent>
                {origin && (
                  <address className="flex flex-col gap-0.5 text-sm text-muted-foreground not-italic">
                    <span className="font-medium text-foreground">{origin.name}</span>
                    <span>{[origin.addressLine1, origin.addressLine2].filter(Boolean).join(", ")}</span>
                    <span>
                      {origin.city}, {origin.stateOrRegion} {origin.postalCode}, {origin.countryCode}
                    </span>
                    {origin.phoneNumber && (
                      <a className="tabular-nums" href={phoneHref(origin.phoneNumber)}>
                        {formatPhone(origin.phoneNumber)}
                      </a>
                    )}
                    {origin.email && <span>{origin.email}</span>}
                  </address>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {visibleDocs.length ? (
                  <DocumentList documents={visibleDocs} />
                ) : (
                  <p className="text-sm text-muted-foreground">No documents yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {isBuyer && step.next.step === "reconcile" && <ReconcileShipment id={id} fba={fba} />}
          {!finishedStates.includes(shipment.status) &&
            shipment.status !== "creating" &&
            step.next.step !== "reconcile" && <CorrectionForm id={id} />}
        </>
      )}
    </>
  )
}
