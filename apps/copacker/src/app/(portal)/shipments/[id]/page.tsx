import { money } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { AlertTriangle, ArrowRight, Download, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { DocumentList, PageBreadcrumb, PageHeader, Status, formatDestination } from "@/components/common"
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
import { contacts, documents, shipments } from "@/db/schema"
import { formatPhone, phoneHref } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { reservedPieces } from "@/server/readiness"
import { finishedStates, releasedStates } from "@/server/readiness"
import { orderWorkflow } from "@/server/workflow"
import { issueList, packetAction, readyAlert, spinning } from "./page.css"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Shipment" }

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  const id = z.uuid().parse((await params).id)
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
    // Cartons leave from the supplier's pickup addresses, which the supplier keeps in its own workspace. A supplier
    // that hasn't joined Copacker yet has none, so the address is typed in.
    supplier.supplierOrgId
      ? db()
          .select()
          .from(contacts)
          .where(and(eq(contacts.orgId, supplier.supplierOrgId), eq(contacts.kind, "pickup")))
      : []
  ])
  const editable =
    ["packing", "correction"].includes(shipment.status) && !shipment.amazonOrderId && shipment.operation === "none"
  const isBuyer = s.org.kind === "buyer"
  const visibleDocs = docs.filter(
    (d) => isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)
  )
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const origin = shipment.packing?.origin

  return (
    <>
      <PageBreadcrumb
        parents={[
          { label: "Purchase orders", href: "/orders" },
          { label: order.data.reference, href: `/orders/${order.id}` }
        ]}
        current={shipment.amazonShipmentId ?? "Shipment"}
      />
      <PageHeader
        title={shipment.amazonShipmentId ?? "Prepare your shipment"}
        description={`${order.data.reference} to ${order.data.destination === "amazon" ? "Amazon AWD USA" : formatDestination(order.data.destination)}, ${shipment.packing?.cartons.length ?? 0} cartons`}
      >
        <Status status={shipment.status} />
      </PageHeader>

      <ShipmentProgress processing={["queued", "creating"].includes(shipment.status)} message={step.next.message} />
      {shipment.issue && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{shipment.issue}</AlertDescription>
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
          invoices={docs.filter((d) => d.kind === "invoice")}
          addresses={addresses}
        />
      ) : (
        <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
          {shipment.status === "approval" && (
            <Card>
              <CardHeader>
                <CardTitle>Invoice changes need buyer approval</CardTitle>
                <CardDescription>The supplier’s invoice differs from the purchase order.</CardDescription>
              </CardHeader>
              <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
                <ItemGroup className={sx({ gap: 2 })}>
                  {changes.map(({ item, change }) => (
                    <Item key={change.itemId} variant="muted">
                      <ItemContent>
                        <ItemTitle>
                          {item.name} / {item.variant}
                        </ItemTitle>
                        <ItemDescription
                          className={sx({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 })}
                        >
                          Price per piece {money(item.unitPrice, snapshot.currency)}
                          <ArrowRight className={sx({ size: 3 })} aria-label="changed to" />
                          {money(change.unitPrice, snapshot.currency)}
                        </ItemDescription>
                        <ItemDescription
                          className={sx({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 })}
                        >
                          Supplier SKU {item.supplierSku || "not provided"}
                          <ArrowRight className={sx({ size: 3 })} aria-label="changed to" />
                          {change.supplierSku || "not provided"}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
                {isBuyer ? (
                  <ApproveInvoice id={id} revision={shipment.revision} />
                ) : (
                  <p className={sx({ text: "sm", color: "muted" })}>
                    The buyer will review these changes. Your carton quantities are reserved against this PO.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {shipment.status === "waiting_labels" && (
            <Card>
              <CardHeader>
                <CardTitle>Waiting for the buyer’s shipping labels</CardTitle>
                <CardDescription>
                  Ready for pickup on {shipment.packing?.readyDate}. The buyer books AGL transportation in Amazon, then
                  uploads and assigns the shipping labels here.
                </CardDescription>
              </CardHeader>
              {isBuyer && (
                <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
                  <div>
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={
                        <a
                          href="https://sellercentral.amazon.com/awd"
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open Amazon Seller Central in a new tab"
                        />
                      }
                    >
                      Open Amazon Seller Central
                      <ExternalLink data-icon="inline-end" />
                    </Button>
                  </div>
                  <Upload
                    orderId={order.id}
                    shipmentId={id}
                    kind="shipping_label"
                    cartons={shipment.packing?.cartons}
                  />
                  {step.issues.length > 0 && (
                    <ul className={cn(issueList, sx({ text: "sm" }))}>
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
              <Loader2 className={spinning} />
              <AlertTitle>Creating the Amazon shipment</AlertTitle>
              <AlertDescription>
                This can take a few minutes. Refresh the page to see the latest status.
              </AlertDescription>
            </Alert>
          )}

          {releasedStates.includes(shipment.status) && (
            <Alert role="note" className={readyAlert}>
              <PackageCheck className={sx({ color: "primary" })} />
              <AlertTitle>Your supplier packet is ready</AlertTitle>
              <AlertDescription>
                Print labels at actual size. The packet includes product labels, carton labels, shipping labels, and the
                checklist.
              </AlertDescription>
              <AlertAction className={packetAction}>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<a href={`/api/shipments/${id}/packet`} aria-label="Download supplier packet" />}
                >
                  <Download data-icon="inline-start" />
                  Download packet
                </Button>
              </AlertAction>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Carton overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier carton</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Pieces</TableHead>
                    <TableHead>Dimensions (cm)</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Weight (kg)</TableHead>
                    <TableHead>Amazon label number</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipment.packing?.cartons.map((c) => (
                    <TableRow key={c.cartonId}>
                      <TableCell className={sx({ fontWeight: "medium" })}>{c.cartonId}</TableCell>
                      <TableCell>
                        {c.items.map((i) => snapshot.items.find((p) => p.id === i.itemId)?.buyerSku).join(", ")}
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {c.items.reduce((n, i) => n + i.pieces, 0)}
                      </TableCell>
                      <TableCell className={sx({ fontVariantNumeric: "tabular" })}>
                        {c.length} × {c.width} × {c.height}
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {c.weight}
                      </TableCell>
                      <TableCell className={sx({ fontFamily: "mono", text: "xs" })}>
                        {shipment.labels.find((l) => l.cartonId === c.cartonId)?.sscc ?? "Pending"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className={sx({ display: "grid", gap: 6, gridTemplateColumns: { lg: "2" } })}>
            <Card>
              <CardHeader>
                <CardTitle>Pickup contact</CardTitle>
              </CardHeader>
              <CardContent>
                {origin && (
                  <address
                    className={sx({
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                      text: "sm",
                      fontStyle: "normal",
                      color: "muted"
                    })}
                  >
                    <span className={sx({ fontWeight: "medium", color: "foreground" })}>{origin.name}</span>
                    <span>{[origin.addressLine1, origin.addressLine2].filter(Boolean).join(", ")}</span>
                    <span>
                      {origin.city}, {origin.stateOrRegion} {origin.postalCode}, {origin.countryCode}
                    </span>
                    {origin.phoneNumber && (
                      <a className={sx({ fontVariantNumeric: "tabular" })} href={phoneHref(origin.phoneNumber)}>
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
                <CardTitle>Shipment documents</CardTitle>
              </CardHeader>
              <CardContent>
                {visibleDocs.length ? (
                  <DocumentList documents={visibleDocs} />
                ) : (
                  <p className={sx({ text: "sm", color: "muted" })}>No documents yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {shipment.status === "ready" && (
            <ActionButton action="shipment.collected" data={{ id }}>
              Mark collected
            </ActionButton>
          )}
          {isBuyer && ["ready", "collected"].includes(shipment.status) && (
            <ActionButton action="shipment.received" data={{ id }} variant="outline">
              Mark received
            </ActionButton>
          )}
          {isBuyer && step.next.step === "reconcile" && <ReconcileShipment id={id} />}
          {isBuyer && step.next.step === "retry" && (
            <ActionButton action="shipment.retry" data={{ id, revision: shipment.revision }}>
              Retry shipment
            </ActionButton>
          )}
          {isBuyer && step.next.step === "cancellation" && (
            <ActionButton action="shipment.cancelled" data={{ id }}>
              Verify Amazon cancellation
            </ActionButton>
          )}
          {!finishedStates.includes(shipment.status) &&
            shipment.status !== "creating" &&
            step.next.step !== "reconcile" && <CorrectionForm id={id} />}
        </div>
      )}
    </>
  )
}
