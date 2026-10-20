import { money } from "@repo/aisle"
import { canConfigureTransport, shipmentLabelRequirements } from "@repo/aisle/transport"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  Ellipsis,
  ExternalLink,
  Loader2,
  PackageCheck
} from "lucide-react"
import { Fragment } from "react"
import { useTranslations, useLocale } from "use-intl"
import { ActionButton } from "@/components/actions"
import { Attachment } from "@/components/attachment"
import { DocumentList, PageHeader, Status } from "@/components/common"
import { PackingForm } from "@/components/packing-form"
import { type ProductDownload, ProductDownloadsMenu } from "@/components/product-downloads-menu"
import { ApproveInvoice, CorrectionForm, ReleaseLabels, ReconcileShipment } from "@/components/shipment-actions"
import { ShipmentDestination } from "@/components/shipment-destination"
import { ShipmentDetails } from "@/components/shipment-details"
import { ShipmentTransportLegs } from "@/components/shipment-packing-details"
import { ShipmentProgress } from "@/components/shipment-progress"
import { ShipmentTransportSettings } from "@/components/shipment-transport"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Upload } from "@/components/upload"
import { usePackingListDownload } from "@/hooks/use-packing-list-download"
import { printableLabelTypes } from "@/lib/printable-labels"
import { finishedStates, packedStates } from "@/server/readiness"
import type { shipmentPage } from "@/server/shipment-page"

export default function ShipmentPage({ page }: { page: Awaited<ReturnType<typeof shipmentPage>> }) {
  const {
    id,
    editsShipments,
    seesOrder,
    prices,
    editsPartners,
    order,
    packingOrder,
    supplier,
    shipment,
    step,
    reserved,
    snapshot,
    addresses,
    awaitingChanges,
    editable,
    canReopenPacking: canReopen,
    isBuyer,
    amazonLinks,
    visibleDocs,
    changes,
    fba,
    enteringFor,
    amazon,
    title,
    amazonIds,
    nextStep,
    delivery,
    destinationName,
    lineLabels
  } = page
  const t = useTranslations("shipments.detail"),
    locale = useLocale()
  const columnsText = useTranslations("orders.detail.columns")
  const labelsText = useTranslations("shipments.labels")
  const labelsHref = (query: Record<string, string>) =>
    `/api/shipments/${id}/labels${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""}`
  // The label types one line's packing details, or the whole shipment's, ask for, each from its own file. A type
  // prints when any line can make it; choking hazard labels come from the buyer.
  const productDownloads = (itemId?: string): ProductDownload[] => {
    const labels = lineLabels.filter((line) => !itemId || line.itemId === itemId).flatMap((line) => line.labels)
    const item: Record<string, string> = itemId ? { item: itemId } : {}
    return printableLabelTypes.flatMap((type) => {
      const found = labels.filter((label) => label.type === type)
      if (!found.length) {
        return []
      }
      const printable = type !== "choking" && found.some((label) => !label.problem)
      return [
        {
          id: type,
          label: labelsText(type),
          href: labelsHref({ ...item, kind: type }),
          unavailable: printable
            ? undefined
            : (found.find((label) => label.problem)?.problem ?? labelsText("notProvided"))
        }
      ]
    })
  }
  const forwarder = snapshot.via ? delivery.addresses[0]?.name : undefined
  // How the cartons travel: to the forwarder first, then from the handoff location by the booked transport.
  const handoff = shipment.transport?.handoff === "forwarder" && forwarder ? forwarder : supplier.name
  const legs = [
    forwarder && t("legs.shipsTo", { place: forwarder }),
    !forwarder && !shipment.transport && t("legs.shipsTo", { place: destinationName }),
    shipment.transport?.collection === "dropoff" && t("legs.dropoff", { place: handoff }),
    shipment.transport?.collection === "pickup" &&
      t(shipment.transport.service === "agl" ? "legs.amazonPickup" : "legs.carrierPickup", { place: handoff })
  ].filter((leg) => typeof leg === "string")
  const nextAction: Record<string, React.ReactNode> = {
    prepareAmazon: isBuyer && (
      <ActionButton action="shipment.prepareAmazon" data={{ id, revision: shipment.revision }}>
        {t(shipment.linkedAmazonShipmentId ? "actions.getAmazonLabels" : "actions.createAmazonShipment")}
      </ActionButton>
    ),
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

  const route = [supplier.name, ...(forwarder ? [forwarder] : []), destinationName]
  const productActions = (item: (typeof packingOrder.items)[number]) =>
    productDownloads(item.id).length > 0 && (
      <ProductDownloadsMenu
        productName={item.supplierSku || item.buyerSku}
        items={productDownloads(item.id)}
        allHref={labelsHref({ item: item.id })}
      />
    )
  const availablePieces = Object.fromEntries(
    order.data.items.map((item) => [item.id, Math.max(0, item.pieces - (reserved[item.id] ?? 0))])
  )
  const parents = [
    {
      label: isBuyer ? t("parents.purchaseOrders") : t("parents.orders"),
      href: seesOrder ? "/orders" : undefined
    },
    { label: order.data.reference, href: seesOrder ? `/orders/${order.id}` : undefined }
  ]
  const notices = (
    <>
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
        </Alert>
      )}
    </>
  )

  if (editable) {
    // Packing: the route and its legs head the form, and the documents and running totals sit beside the cartons.
    // The buyer's transport settings follow the header, outside the packing form's fieldset, so saving the packing
    // doesn't disable them.
    return (
      <>
        <PackingForm
          shipmentName={title}
          renderHeader={(actions) => (
            <>
              <PageHeader
                parents={[...parents, { label: title }]}
                title={title}
                badge={<Status status={shipment.status} />}
              >
                {actions}
              </PageHeader>
              {notices}
              {isBuyer &&
                editsShipments &&
                canConfigureTransport(shipment.status, shipment.operation, shipment.transport) && (
                  <ShipmentTransportSettings
                    key={JSON.stringify(shipment.transport)}
                    id={id}
                    revision={shipment.revision}
                    initial={shipment.transport}
                    hasForwarder={!!snapshot.via}
                  />
                )}
            </>
          )}
          renderProductActions={productActions}
          renderSidebar={(totals) => (
            <div className="flex flex-col gap-6">
              {(productDownloads().some((download) => !download.unavailable) || visibleDocs.length > 0) && (
                // A gap, not space-y: the open menu adds hidden focus guards beside its trigger, which would change its margin.
                <section aria-label={t("documents.title")} className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">{t("documents.title")}</h2>
                  <ProductDownloadsMenu attachment items={productDownloads()} allHref={labelsHref({})} />
                  {visibleDocs.length > 0 && (
                    <DocumentList documents={visibleDocs.map((doc) => ({ ...doc, shipmentId: id }))} />
                  )}
                </section>
              )}
              <ShipmentDetails {...totals} />
            </div>
          )}
          shippingDetails={{
            route,
            shipTo: <ShipmentDestination {...delivery} compact />,
            transport: legs.length > 0 && <ShipmentTransportLegs legs={legs} />
          }}
          shipmentId={id}
          linkedAmazonShipmentId={
            isBuyer && shipment.amazonNetwork === "awd_us" ? shipment.linkedAmazonShipmentId : undefined
          }
          key={`${id}:${order.revision}`}
          revision={shipment.revision}
          orderRevision={order.revision}
          availablePieces={availablePieces}
          order={packingOrder}
          initial={shipment.packingDraft ?? shipment.packing}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          addAddressTo={enteringFor && editsPartners ? { id: supplier.id, name: enteringFor } : undefined}
        />
      </>
    )
  }

  const transportEditable =
    isBuyer && editsShipments && canConfigureTransport(shipment.status, shipment.operation, shipment.transport)
  // Amazon's shipment IDs follow the title, each a Seller Central link where the viewer can open it.
  const amazonReferences = [
    ...amazonIds.map((amazonId) => <span key={amazonId}>{amazonId}</span>),
    ...amazonLinks.map((link) => (
      <a
        key={link.id}
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {link.id}
        <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
        <span className="sr-only"> {t("opensInSellerCentral")}</span>
      </a>
    ))
  ]
  const viewOrder = isBuyer ? t("changesWaiting.viewPurchaseOrder") : t("changesWaiting.viewOrder")
  // Finished packing prints its packing list, before Amazon's labels or the supplier packet exist.
  const packed = !!shipment.packing && packedStates.includes(shipment.status)

  // After packing, the same layout without the form: the state's alerts and next step lead the column beside the
  // documents and totals, and the cartons follow as packed.
  return (
    <PackingForm
      readOnly
      shipmentName={title}
      renderHeader={() => (
        <PageHeader
          parents={[...parents, { label: title }]}
          title={title}
          badge={<Status status={shipment.status} />}
          description={
            amazonReferences.length > 0 && (
              <span className="flex flex-wrap gap-x-1">
                {amazonReferences.map((reference, index) => (
                  <Fragment key={reference.key}>
                    {reference}
                    {index < amazonReferences.length - 1 && ","}
                  </Fragment>
                ))}
              </span>
            )
          }
        >
          {/* While the changes wait, opening the order is the next step; otherwise it's under the actions menu. */}
          {seesOrder && awaitingChanges && (
            <Button variant="outline" nativeButton={false} render={<Link to="/orders/$id" params={{ id: order.id }} />}>
              <ArrowLeft aria-hidden="true" />
              {viewOrder}
            </Button>
          )}
          {seesOrder && !awaitingChanges && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon" aria-label={columnsText("actions")} />}
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link to="/orders/$id" params={{ id: order.id }} />}>
                  {viewOrder}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canReopen && (
            <ActionButton action="shipment.reopenPacking" data={{ id, revision: shipment.revision }} variant="outline">
              {t("actions.editPacking")}
            </ActionButton>
          )}
          {editsShipments ? nextAction[step.next.step] || null : null}
        </PageHeader>
      )}
      notices={
        <>
          {notices}
          {!shipment.transport && (
            <ShipmentTransportSettings
              key={JSON.stringify(shipment.transport)}
              id={id}
              revision={shipment.revision}
              initial={shipment.transport}
              hasForwarder={!!snapshot.via}
              editable={transportEditable}
            />
          )}
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
              </CardHeader>
              {isBuyer && editsShipments && (
                <CardContent className="flex flex-col gap-6">
                  {shipmentLabelRequirements(snapshot.destination, shipment.transport).carrierLabels && (
                    <Upload
                      orderId={order.id}
                      shipmentId={id}
                      kind="shipping_label"
                      label={null}
                      cartons={shipment.packing?.cartons}
                    />
                  )}
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
              <AlertAction className="static col-span-full mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={step.packetUrl} aria-label={t("packet.downloadLabel")} />}
                >
                  <Download data-icon="inline-start" />
                  {t("packet.download")}
                </Button>
                {amazon && (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={
                      <a
                        download
                        href={`/api/shipments/${id}/packet?section=carton_labels`}
                        aria-label={t("packet.cartonLabels")}
                      />
                    }
                  >
                    {t("packet.cartonLabels")}
                  </Button>
                )}
                {page.hasProductLabels && (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={
                      <a
                        download
                        href={`/api/shipments/${id}/packet?section=product_labels`}
                        aria-label={t("packet.unitLabels")}
                      />
                    }
                  >
                    {t("packet.unitLabels")}
                  </Button>
                )}
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
        </>
      }
      footer={
        <>
          {isBuyer && editsShipments && step.next.step === "reconcile" && <ReconcileShipment id={id} fba={fba} />}
          {/* A supplier changes finished packing with Edit packing instead. */}
          {editsShipments &&
            !finishedStates.includes(shipment.status) &&
            shipment.status !== "creating" &&
            step.next.step !== "reconcile" &&
            !(canReopen && !isBuyer) && <CorrectionForm id={id} />}
        </>
      }
      renderCartonNote={
        amazon && shipment.labels.length > 0
          ? (cartonIds) => (
              <p className="text-sm text-muted-foreground">
                {t("cartons.amazonLabel")}:{" "}
                <span className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
                  {cartonIds.map((cartonId) => (
                    <span key={cartonId} className="whitespace-nowrap">
                      {cartonId}: {shipment.labels.find((label) => label.cartonId === cartonId)?.labelNumber ?? "—"}
                    </span>
                  ))}
                </span>
              </p>
            )
          : undefined
      }
      renderProductActions={productActions}
      renderSidebar={(totals) => (
        <div className="flex flex-col gap-6">
          <section aria-label={t("documents.title")} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t("documents.title")}</h2>
            <div className="flex flex-col gap-2 empty:hidden">
              {productDownloads().length > 0 && (
                <ProductDownloadsMenu attachment items={productDownloads()} allHref={labelsHref({})} />
              )}
              {packed && <PackingListDownload id={id} />}
              {visibleDocs.length > 0 && (
                <DocumentList documents={visibleDocs.map((doc) => ({ ...doc, shipmentId: id }))} />
              )}
            </div>
            {productDownloads().length === 0 && !packed && visibleDocs.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
            )}
          </section>
          <ShipmentDetails {...totals} />
        </div>
      )}
      shippingDetails={{
        route,
        shipTo: <ShipmentDestination {...delivery} compact readOnly />,
        transport: (legs.length > 0 || (shipment.transport && transportEditable)) && (
          <div className="flex flex-col gap-3">
            {legs.length > 0 && <ShipmentTransportLegs legs={legs} />}
            {shipment.transport && transportEditable && (
              <ShipmentTransportSettings
                compact
                key={JSON.stringify(shipment.transport)}
                id={id}
                revision={shipment.revision}
                initial={shipment.transport}
                hasForwarder={!!snapshot.via}
                editable
              />
            )}
          </div>
        )
      }}
      shipmentId={id}
      key={`${id}:${order.revision}:${shipment.revision}`}
      revision={shipment.revision}
      orderRevision={order.revision}
      availablePieces={availablePieces}
      order={packingOrder}
      initial={shipment.packing ?? shipment.packingDraft}
      addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
    />
  )
}

function PackingListDownload({ id }: { id: string }) {
  const t = useTranslations("shipments.detail.documents")
  const { download, busy } = usePackingListDownload(id)
  return (
    <Attachment label={t("packingList")} downloadLabel={t("downloadPackingList")} busy={busy} onDownload={download} />
  )
}
