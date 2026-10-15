import { money } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { AlertTriangle, ArrowRight, Clock, Download, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
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
import { can } from "@/lib/access"
import { formatPhone, phoneHref } from "@/lib/phone"
import { accessibleOrder } from "@/server/access"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { requirePage, session, titleFor } from "@/server/auth"
import { proposalState } from "@/server/order-proposals"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import { finishedStates, releasedStates, reservedPieces } from "@/server/readiness"
import { supplierPickupAddresses } from "@/server/supplier-addresses"
import { orderWorkflow } from "@/server/workflow"
import { readyDateFormat, shipmentDestinations } from "../destination"

export const generateMetadata = titleFor("shipments.detail.metaTitle", "shipments")

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requirePage(s, "shipments")
  const [t, format, locale] = await Promise.all([getTranslations("shipments.detail"), getFormatter(), getLocale()])
  // Someone who can only view shipments sees each step without its buttons; its purchase order is linked for those who
  // can open it.
  const editsShipments = can(s, "shipments", "edit")
  const seesOrder = can(s, "orders")
  // Someone who doesn't see prices packs and follows the shipment without its invoice's prices.
  const prices = can(s, "prices")
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
  const packingOrder = shipment.amazonNetwork
    ? { ...order.data, items: order.data.items.filter((item) => item.amazonNetwork === shipment.amazonNetwork) }
    : order.data
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
    editsShipments &&
    ["packing", "correction"].includes(shipment.status) &&
    !shipment.amazonOrderId &&
    shipment.operation === "none" &&
    !awaitingChanges
  const isBuyer = s.org.kind === "buyer"
  // The Amazon shipments are in the buyer's Seller Central, which the supplier can't open, so it reads their IDs.
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)) &&
      (prices || d.kind !== "invoice")
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
  const title = t("title", { number: workflow.shipments.findIndex((row) => row.id === id) + 1 })
  const cartonCount = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
  const destination = await shipmentDestinations([order.data])
  // Where it goes and in how many cartons, then Amazon's shipment IDs. The purchase order leads the title.
  const summary = [
    destination(order.data, shipment.amazonNetwork),
    cartonCount && t("cartonCount", { count: cartonCount }),
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
        {t("actions.markShipped")}
      </ActionButton>
    ),
    receive: isBuyer && (
      <ActionButton action="shipment.received" data={{ id }} variant="outline">
        {t("actions.markReceived")}
      </ActionButton>
    ),
    retry: isBuyer && (
      <ActionButton action="shipment.retry" data={{ id, revision: shipment.revision }}>
        {t("actions.retry")}
      </ActionButton>
    ),
    cancellation: isBuyer && (
      <ActionButton action="shipment.cancelAmazon" data={{ id }}>
        {t("actions.cancelInAmazon")}
      </ActionButton>
    )
  }

  return (
    <>
      <PageHeader
        parents={[
          {
            label: isBuyer ? t("parents.purchaseOrders") : t("parents.orders"),
            href: seesOrder ? "/orders" : undefined
          },
          { label: order.data.reference, href: seesOrder ? `/orders/${order.id}` : undefined }
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
                  <span className="sr-only"> {t("opensInSellerCentral")}</span>
                </a>
              </Fragment>
            ))}
          </>
        }
      >
        {editsShipments ? nextAction[step.next.step] || null : null}
      </PageHeader>

      <ShipmentProgress processing={["queued", "creating"].includes(shipment.status)} message={nextStep} />
      {shipment.issue && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("needsAttention")}</AlertTitle>
          <AlertDescription>{shipment.issue}</AlertDescription>
        </Alert>
      )}

      {awaitingChanges && (
        <Alert>
          <Clock />
          <AlertTitle>{t("changesWaiting.title")}</AlertTitle>
          <AlertDescription>{isBuyer ? t("changesWaiting.buyer") : t("changesWaiting.supplier")}</AlertDescription>
          {seesOrder && (
            <AlertAction>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/orders/${order.id}`} />}>
                {isBuyer ? t("changesWaiting.viewPurchaseOrder") : t("changesWaiting.viewOrder")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}

      {editable ? (
        <PackingForm
          orderId={order.id}
          shipmentId={id}
          linkedAmazonShipmentId={
            isBuyer && shipment.amazonNetwork === "awd_us" ? shipment.linkedAmazonShipmentId : undefined
          }
          key={`${id}:${order.revision}`}
          revision={shipment.revision}
          orderRevision={order.revision}
          availablePieces={Object.fromEntries(
            order.data.items.map((item) => [item.id, Math.max(0, item.pieces - (reserved[item.id] ?? 0))])
          )}
          order={prices ? packingOrder : unpricedOrder(packingOrder)}
          initial={
            prices
              ? (shipment.packingDraft ?? shipment.packing)
              : unpricedDraft(shipment.packingDraft ?? shipment.packing)
          }
          invoice={invoice && { id: invoice.id, name: invoice.name, bytes: invoice.bytes }}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          enteringFor={isBuyer ? supplier.name : undefined}
          addAddressTo={enteringFor && can(s, "partners", "edit") ? { id: supplier.id, name: enteringFor } : undefined}
        />
      ) : (
        <>
          {shipment.status === "approval" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("invoiceChanges.title")}</CardTitle>
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
                        {prices && change.unitPrice !== item.unitPrice && (
                          <ItemDescription className="flex flex-wrap items-center gap-1">
                            {t("invoiceChanges.pricePerUnit")} {money(item.unitPrice, snapshot.currency, locale)}
                            <ArrowRight className="size-3 rtl:rotate-180" aria-label={t("invoiceChanges.changedTo")} />
                            {money(change.unitPrice, snapshot.currency, locale)}
                          </ItemDescription>
                        )}
                        {change.supplierSku !== item.supplierSku && (
                          <ItemDescription className="flex flex-wrap items-center gap-1">
                            {t("invoiceChanges.supplierSku")} {item.supplierSku || "—"}
                            <ArrowRight className="size-3 rtl:rotate-180" aria-label={t("invoiceChanges.changedTo")} />
                            {change.supplierSku || "—"}
                          </ItemDescription>
                        )}
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
                {/* Approving accepts the invoice's prices. */}
                {isBuyer && editsShipments && prices && <ApproveInvoice id={id} revision={shipment.revision} />}
                {!isBuyer && <p className="text-sm text-muted-foreground">{t("invoiceChanges.waitingForBuyer")}</p>}
              </CardContent>
            </Card>
          )}

          {shipment.status === "waiting_labels" && (
            <Card>
              <CardHeader>
                <CardTitle>{isBuyer && editsShipments ? t("labels.title") : t("labels.waiting")}</CardTitle>
                {isBuyer && editsShipments && (
                  <CardDescription>{fba ? t("labels.fba") : t("labels.agl")}</CardDescription>
                )}
              </CardHeader>
              {isBuyer && editsShipments && (
                <CardContent className="flex flex-col gap-6">
                  <Upload
                    orderId={order.id}
                    shipmentId={id}
                    kind="shipping_label"
                    label={null}
                    cartons={shipment.packing?.cartons}
                  />
                  {step.issues.length > 0 && (
                    <ul className="list-disc ps-5 text-sm">
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
              <AlertTitle>{t("creating.title")}</AlertTitle>
              <AlertDescription>{t("creating.description")}</AlertDescription>
            </Alert>
          )}

          {step.packetUrl && (
            <Alert role="note" className="border-primary/40">
              {/* The alert colors its icon like its text; this one stays primary. */}
              <PackageCheck className="text-primary!" />
              <AlertTitle>{t("packet.title")}</AlertTitle>
              <AlertDescription>{t("packet.description")}</AlertDescription>
              {/* Under the text on a phone, top right from sm up. */}
              <AlertAction className="static col-span-full mt-2 sm:absolute sm:mt-0">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={step.packetUrl} aria-label={t("packet.downloadLabel")} />}
                >
                  <Download data-icon="inline-start" />
                  {t("packet.download")}
                </Button>
              </AlertAction>
            </Alert>
          )}

          {/* A shipment ready for pickup whose packet lacks something, such as a product label the buyer hasn't added. */}
          {shipment.status === "ready" && !step.packetUrl && (
            <Alert role="note">
              <Clock />
              <AlertTitle>{t("packet.incompleteTitle")}</AlertTitle>
              <AlertDescription>
                {isBuyer ? (
                  <ul className="list-disc ps-5">
                    {step.issues.map((issue, index) => (
                      <li key={index}>{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  t("packet.waitingForLabels")
                )}
              </AlertDescription>
            </Alert>
          )}

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b p-4">
              <CardTitle>{t("cartons.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table
                framed={false}
                className="[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cartons.carton")}</TableHead>
                    <TableHead>{t("cartons.product")}</TableHead>
                    <TableHead className="text-end">{t("cartons.units")}</TableHead>
                    <TableHead className="ps-6">{t("cartons.dimensions")}</TableHead>
                    <TableHead className="text-end">{t("cartons.weight")}</TableHead>
                    {amazon && <TableHead>{t("cartons.amazonLabel")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipment.packing?.cartons.map((c) => (
                    <TableRow key={c.cartonId}>
                      <TableCell className="font-medium">{c.cartonId}</TableCell>
                      {/* SKUs wrap between each other, never at their own hyphens. */}
                      <TableCell className="whitespace-normal">
                        {c.items.map((i, index) => (
                          <Fragment key={i.itemId}>
                            {index > 0 && ", "}
                            <span className="whitespace-nowrap">
                              {snapshot.items.find((p) => p.id === i.itemId)?.buyerSku}
                            </span>
                          </Fragment>
                        ))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {c.items.reduce((n, i) => n + i.pieces, 0)}
                      </TableCell>
                      <TableCell className="ps-6 tabular-nums">
                        {c.length} × {c.width} × {c.height}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{c.weight}</TableCell>
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
                <CardTitle>{t("pickup.title")}</CardTitle>
                {shipment.packing && (
                  <CardDescription>
                    {t("pickup.ready", {
                      date: format.dateTime(new Date(`${shipment.packing.readyDate}T00:00:00Z`), readyDateFormat)
                    })}
                  </CardDescription>
                )}
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
                <CardTitle>{t("documents.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                {visibleDocs.length ? (
                  <DocumentList documents={visibleDocs} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {isBuyer && editsShipments && step.next.step === "reconcile" && <ReconcileShipment id={id} fba={fba} />}
          {editsShipments &&
            !finishedStates.includes(shipment.status) &&
            shipment.status !== "creating" &&
            step.next.step !== "reconcile" && <CorrectionForm id={id} />}
        </>
      )}
    </>
  )
}
