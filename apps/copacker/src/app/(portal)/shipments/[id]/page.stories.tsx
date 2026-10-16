import { money, type OrderInput } from "@repo/aisle"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowRight, Clock, Download, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import { Fragment } from "react"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { formatStory, localeStory, translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { ActionButton } from "@/components/actions"
import { DocumentList, PageHeader, Status } from "@/components/common"
import { PackingForm } from "@/components/packing-form"
import type { PartnerAddress } from "@/components/partner-address"
import { ApproveInvoice, CorrectionForm, ReleaseLabels, ReconcileShipment } from "@/components/shipment-actions"
import { ShipmentProgress } from "@/components/shipment-progress"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload } from "@/components/upload"
import { can, type Permissions } from "@/lib/access"
import { formatPhone, phoneHref } from "@/lib/phone"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import { finishedStates, releasedStates } from "@/server/readiness"
import {
  type ActionRequest,
  buyerContacts,
  documentRow,
  type DocumentRow,
  orderRecords,
  packingFor,
  partnerAddresses,
  recordActions,
  shipmentId,
  shipmentRow,
  type ShipmentRow,
  supplierRecordId
} from "@/stories/fixtures/logistics"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner } from "@/stories/workspace"
import { readyDateFormat, shipmentDestinations } from "../destination"

// The shipment's step as orderWorkflow reports it: what happens next, what its packet lacks, and whether its labels
// can be released.
type Step = {
  next: { step: string; message: string }
  issues: Array<{ message: string }>
  canRelease: boolean
  packetUrl: string | null
}

type Args = {
  kind: "buyer" | "supplier"
  permissions: Permissions
  shipment: ShipmentRow
  order: { id: string; data: OrderInput; revision: number }
  // The supplier, and its workspace once it has joined Copacker.
  supplier: { id: string; name: string; supplierOrgId: string | null }
  step: Step
  // Its place among the purchase order's shipments, oldest first.
  number: number
  // Pieces of each line other shipments already hold.
  reserved: Record<string, number>
  docs: DocumentRow[]
  // The supplier's pickup addresses.
  addresses: PartnerAddress[]
  // Whether the supplier's changes to the purchase order are waiting on the buyer.
  awaitingChanges: boolean
}

// A shipment's page (page.tsx) with what the database and the workflow would return.
async function ShipmentPage({
  kind,
  permissions: s,
  shipment,
  order,
  supplier,
  step,
  number,
  reserved,
  docs,
  addresses,
  awaitingChanges
}: Args) {
  const [t, format, locale] = await Promise.all([translateStory("shipments.detail"), formatStory(), localeStory()])
  const editsShipments = can(s, "shipments", "edit")
  const seesOrder = can(s, "orders")
  const prices = can(s, "prices")
  const id = shipment.id
  const snapshot = shipment.snapshot ?? order.data
  const editable =
    editsShipments &&
    ["packing", "correction"].includes(shipment.status) &&
    !shipment.amazonOrderId &&
    shipment.operation === "none" &&
    !awaitingChanges
  const isBuyer = kind === "buyer"
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)) &&
      (prices || d.kind !== "invoice")
  )
  const invoice = docs.find((d) => d.kind === "invoice")
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const origin = shipment.packing?.origin
  const fba = shipment.amazonNetwork === "fba"
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = order.data.destination === "amazon"
  const title = t("title", { number })
  const cartonCount = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
  const destination = await shipmentDestinations([order.data])
  const summary = [
    destination(order.data, shipment.amazonNetwork),
    cartonCount && t("cartonCount", { count: cartonCount }),
    ...amazonIds
  ]
    .filter(Boolean)
    .join(", ")
  const nextStep =
    step.next.step === "forward" || (isBuyer && step.next.step === "cancellation") ? step.next.message : undefined
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
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link to="/orders/$id" params={{ id: order.id }} />}
              >
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
          key={`${id}:${order.revision}`}
          revision={shipment.revision}
          orderRevision={order.revision}
          availablePieces={Object.fromEntries(
            order.data.items.map((item) => [item.id, Math.max(0, item.pieces - (reserved[item.id] ?? 0))])
          )}
          order={prices ? order.data : unpricedOrder(order.data)}
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
              <PackageCheck className="text-primary!" />
              <AlertTitle>{t("packet.title")}</AlertTitle>
              <AlertDescription>{t("packet.description")}</AlertDescription>
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

// What the workflow says comes next, in its English words.
function step(next: string, message: string, changes: Partial<Step> = {}): Step {
  return { next: { step: next, message }, issues: [], canRelease: false, packetUrl: null, ...changes }
}

const warehouse = orderRecords.warehouse
const amazonOrder = orderRecords.amazon
const [firstLine, secondLine] = warehouse.data.items
const packet = `/api/shipments/${shipmentId}/packet`
const invoice = documentRow("invoice", "Lotus invoice 2291.pdf")
const packingList = documentRow("packing_list", "Packing list.pdf")
const shippingLabel = documentRow("shipping_label", "AGL labels.pdf")
const cartonLabel = documentRow("carton_label", "Carton label.pdf", { cartonId: "C1" })
const labels = [
  { cartonId: "C1", labelNumber: "FBA18ABCD123U000001", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" },
  { cartonId: "C2", labelNumber: "FBA18ABCD123U000002", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" }
]

const sent: ActionRequest[] = []
const buyer = portalPage("/shipments")
const supplier = portalPage("/shipments", "supplier")
// Someone who packs and follows shipments without prices, and can't open purchase orders.
const packer: Permissions = { role: "member", access: { shipments: "edit" } }

const meta = preview.meta({
  title: "Pages/Shared/Shipments/Detail",
  ...serverStory(ShipmentPage),
  args: {
    kind: "buyer",
    permissions: owner,
    shipment: shipmentRow({ status: "ready", packing: packingFor(warehouse.data) }),
    order: warehouse,
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: "org_supplier" },
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", { packetUrl: packet }),
    number: 2,
    reserved: {},
    docs: [invoice, packingList, cartonLabel],
    addresses: [partnerAddresses.factory],
    awaitingChanges: false
  } satisfies Args,
  parameters: { db: { contacts: buyerContacts.map(({ id, name }) => ({ id, name })) } },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

// The supplier packs: the packing form, since nothing is packed yet.
export const PackingSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list and upload the commercial invoice"),
    number: 1,
    docs: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Shipment 1/ })).toBeVisible()
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByText("Portland warehouse")).toBeVisible()
    await expect(canvas.getAllByText("Packing").length).toBeGreaterThan(0)
    // The packing form replaces the cartons and documents.
    await expect(canvas.queryByText("No documents yet")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

// A supplier that isn't on Copacker sends its details by email, and the buyer packs for it.
export const PackingForSupplier = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "packing" }),
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: null },
    step: step("packing", "Complete the packing list and upload the commercial invoice"),
    number: 1,
    docs: []
  },
  play: async ({ canvas }) => {
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByRole("link", { name: "Purchase orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toHaveAttribute(
      "href",
      `/orders/${orderRecords.warehouse.id}`
    )
    await expect(canvas.getAllByText(/Lotus Manufacturing/).length).toBeGreaterThan(0)
    await expect(canvas.queryByRole("heading", { name: "Cartons" })).toBeNull()
  }
})

// Packing waits while the supplier's changes to the purchase order are with the buyer.
export const ChangesWaiting = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list and upload the commercial invoice"),
    number: 1,
    docs: [],
    awaitingChanges: true
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Changes waiting for approval")).toBeVisible()
    await expect(
      canvas.getByText("Packing opens once you answer the proposed changes on the purchase order.")
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View purchase order" })).toHaveAttribute(
      "href",
      `/orders/${orderRecords.warehouse.id}`
    )
    await expect(canvas.getByText("No documents yet")).toBeVisible()
  }
})

export const ChangesWaitingSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list and upload the commercial invoice"),
    docs: [],
    awaitingChanges: true
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Packing opens once the customer answers the proposed changes on the order.")
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View order" })).toBeVisible()
  }
})

const approval = shipmentRow({
  status: "approval",
  packing: packingFor(warehouse.data, {
    changes: [
      { itemId: firstLine!.id, supplierSku: firstLine!.supplierSku, unitPrice: 450 },
      { itemId: secondLine!.id, supplierSku: "LM-APRON-CH", unitPrice: secondLine!.unitPrice }
    ]
  })
})

// The supplier's invoice changed prices and SKUs, which the buyer approves.
export const Approval = meta.story({
  ...buyer,
  args: {
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invoice changes")).toBeVisible()
    await expect(canvas.getByText("Canvas tote bag / Natural")).toBeVisible()
    // A carton's SKUs wrap between each other, never at their own hyphens.
    await expect(canvas.getByRole("cell", { name: "TOTE-016, TOTE-017" }).querySelector("span")).toHaveClass(
      "whitespace-nowrap"
    )
    await expect(canvas.getByText(/Price per unit \$4\.25/)).toHaveTextContent("$4.50")
    await expect(canvas.getByText(/Supplier SKU LM-TOTE/)).toHaveTextContent("LM-APRON-CH")
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "shipment.approve", data: { id: shipmentId, revision: 3, updateCost: false } }])
    )
  }
})

export const ApprovalSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for the buyer’s approval")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Approve changes" })).toBeNull()
  }
})

// Without prices, only SKU changes show, nothing is approved, and the invoice isn't listed.
export const ApprovalWithoutPrices = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: packer },
  args: {
    permissions: packer,
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Price per unit/)).toBeNull()
    await expect(canvas.getByText(/Supplier SKU/)).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Approve changes" })).toBeNull()
    await expect(canvas.queryByText("Lotus invoice 2291.pdf")).toBeNull()
    // Purchase orders aren't linked for someone who can't open them.
    await expect(canvas.queryByRole("link", { name: "PO-1045" })).toBeNull()
  }
})

// Amazon is creating the shipment; the page refreshes until it's done.
export const Creating = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({ status: "creating", packing: packingFor(amazonOrder.data), amazonNetwork: "fba" }),
    step: step("processing", "Amazon is processing the shipment and carton labels")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Creating the Amazon shipment")).toBeVisible()
    await expect(canvas.getByText("Amazon FBA, 2 cartons")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "Amazon label" })).toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

const waitingLabels = shipmentRow({
  status: "waiting_labels",
  packing: packingFor(amazonOrder.data),
  amazonNetwork: "awd_us",
  amazonOrderId: "STAR-8KQ2M7",
  amazonShipmentId: "STAR-8KQ2M7-1"
})

// The buyer books AGL transport and uploads its labels; what's missing is listed.
export const WaitingForLabels = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below", {
      issues: [{ message: "Upload the shipping label for carton C2" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipping labels")).toBeVisible()
    await expect(canvas.getByText("Book AGL transport in Amazon, then upload the shipping labels.")).toBeVisible()
    await expect(canvas.getByText("Upload the shipping label for carton C2")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Release labels to supplier" })).toBeNull()
    // The buyer's Amazon shipment opens in Seller Central.
    await expect(canvas.getByRole("link", { name: /STAR-8KQ2M7-1/ })).toHaveAttribute(
      "href",
      "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-8KQ2M7-1"
    )
  }
})

export const Release = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: { ...waitingLabels, amazonNetwork: "fba" },
    step: step("release", "Enter the booking reference and release the supplier packet", { canRelease: true })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Book transport to Amazon, then upload the shipping labels.")).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Amazon transport booking reference" }), "AGL-778812")
    await userEvent.click(canvas.getByRole("button", { name: "Release labels to supplier" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "shipment.release", data: { id: shipmentId, revision: 3, bookingReference: "AGL-778812" } }
      ])
    )
  }
})

// The supplier waits for the labels, and reads Amazon's shipment ID rather than a link to Seller Central.
export const WaitingForLabelsSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: amazonOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below"),
    docs: [invoice, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for shipping labels")).toBeVisible()
    await expect(canvas.getByText("Amazon AWD US, 2 cartons, STAR-8KQ2M7-1")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /STAR-8KQ2M7-1/ })).toBeNull()
    // Labels reach the supplier once they're released.
    await expect(canvas.queryByText("AGL labels.pdf")).toBeNull()
    await expect(canvas.getByText("Lotus invoice 2291.pdf")).toBeVisible()
  }
})

// Ready for pickup: the supplier downloads the packet and marks the cartons shipped.
export const ReadySupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: amazonOrder,
    shipment: shipmentRow({
      status: "ready",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "fba",
      amazonShipmentId: "FBA18ABCD123",
      labels
    }),
    docs: [invoice, cartonLabel, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier packet ready")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Download supplier packet" })).toHaveAttribute("href", packet)
    await expect(canvas.getByText("FBA18ABCD123U000002")).toBeVisible()
    await expect(canvas.getByText("AGL labels.pdf")).toBeVisible()
    await expect(canvas.getByText("Mei Chen")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /\+86/ })).toHaveAttribute("href", "tel:+8657985551234")
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.ship", data: { id: shipmentId } }]))
    // Until it ships, a correction can still be asked for.
    await expect(canvas.getByRole("button", { name: "Request a correction" })).toBeVisible()
  }
})

// The buyer doesn't mark a joined supplier's cartons shipped; the packet waits for a product label.
export const ReadyIncomplete = meta.story({
  ...buyer,
  args: {
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", {
      issues: [{ message: "Add a product label for Linen apron / Charcoal" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier packet incomplete")).toBeVisible()
    await expect(canvas.getByText("Add a product label for Linen apron / Charcoal")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark shipped" })).toBeNull()
    // A warehouse shipment has no Amazon labels.
    await expect(canvas.queryByRole("columnheader", { name: "Amazon label" })).toBeNull()
    await expect(canvas.getByText("Portland warehouse, 2 cartons")).toBeVisible()
  }
})

export const ReadyIncompleteSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", {
      issues: [{ message: "Add a product label for Linen apron / Charcoal" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for the buyer’s labels")).toBeVisible()
    await expect(canvas.queryByText("Add a product label for Linen apron / Charcoal")).toBeNull()
  }
})

// A buyer entering for a supplier that isn't on Copacker marks its cartons shipped.
export const ReadyForSupplierNotOnCopacker = meta.story({
  ...buyer,
  args: {
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: null }
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.ship", data: { id: shipmentId } }]))
  }
})

// Shipped through a forwarder, whose leg comes next.
export const ShippedToForwarder = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("forward", "The forwarder ships the goods on and adds the freight cost, carrier, and tracking", {
      packetUrl: packet
    })
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("The forwarder ships the goods on and adds the freight cost, carrier, and tracking")
    ).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

export const Shipped = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("receive", "Mark the goods received when they arrive", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark received" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.received", data: { id: shipmentId } }]))
  }
})

export const Received = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "received", packing: packingFor(warehouse.data) }),
    step: step("complete", "The goods have arrived", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Received").length).toBeGreaterThan(0)
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

// Amazon refused the shipment: the buyer sees why and retries.
export const NeedsAttention = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "awd_us",
      issue: "Amazon rejected carton C2: it's over 22.68 kg."
    }),
    step: step("retry", "Resolve the reported problem, then retry the shipment")
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert")
    await expect(alert).toHaveTextContent("Needs attention")
    await expect(alert).toHaveTextContent("Amazon rejected carton C2: it's over 22.68 kg.")
    await userEvent.click(canvas.getByRole("button", { name: "Retry shipment" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.retry", data: { id: shipmentId, revision: 3 } }]))
    await expect(canvas.getByRole("button", { name: "Request a correction" })).toBeVisible()
  }
})

// Copacker lost Amazon's reply: the buyer links the order Amazon made instead of correcting.
export const Reconcile = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "awd_us",
      operation: "sending",
      issue: "Amazon didn't answer in time."
    }),
    step: step("reconcile", "Find and link the Amazon order before continuing")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Existing Amazon AWD order ID" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Retry shipment" })).toBeNull()
  }
})

// A correction of a shipment Amazon already has starts with cancelling it there.
export const Correction = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "correction",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "fba",
      amazonOrderId: "wf0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
      amazonShipmentId: "FBA18ABCD123"
    }),
    step: step("cancellation", "Cancel the existing Amazon shipment before creating a replacement")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Cancel the existing Amazon shipment before creating a replacement")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Cancel in Amazon" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.cancelAmazon", data: { id: shipmentId } }]))
  }
})

// Someone who only views shipments follows each step without its buttons.
export const ViewOnly = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: member },
  args: {
    permissions: member,
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("receive", "Mark the goods received when they arrive", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toBeVisible()
    await expect(within(canvas.getByRole("table")).getAllByRole("row")).toHaveLength(3)
    await expect(screen.queryByRole("dialog")).toBeNull()
  }
})
