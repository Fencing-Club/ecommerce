import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Spinner
} from "@buildkitgg/shadcn-baseui-kit"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import { money } from "@repo/copacker-orders"
import { orderDestination, type Route } from "@repo/copacker-packing-rules"
import { amazonRequestStates, packedStates } from "@repo/copacker-shipments/states"
import { shipmentLabelRequirements } from "@repo/copacker-shipments/transport"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Ellipsis, ExternalLink } from "lucide-react"
import { Fragment } from "react"
import { useTranslations, useLocale } from "use-intl"
import { ActionButton } from "@/components/actions"
import { Attachment } from "@/components/attachment"
import { UploadCarrierLabels } from "@/components/carrier-labels-dialog"
import { CartonList } from "@/components/carton-list"
import { DocumentList, PageHeader, Status } from "@/components/common"
import { PackedProductsTable } from "@/components/packed-products-table"
import { PackingForm } from "@/components/packing-form"
import { PalletList } from "@/components/pallet-list"
import { type ProductDownload, ProductDownloadsMenu } from "@/components/product-downloads-menu"
import type { RouteStop } from "@/components/route-editor"
import { RouteSection } from "@/components/route-section"
import { ApproveInvoice, ReconcileShipment } from "@/components/shipment-actions"
import { ShipmentDetails } from "@/components/shipment-details"
import { ShipmentLayout } from "@/components/shipment-layout"
import { ShipmentProgress } from "@/components/shipment-progress"
import { useAction } from "@/hooks/use-action"
import { usePackingListDownload } from "@/hooks/use-packing-list-download"
import { useShipmentRoute } from "@/hooks/use-shipment-route"
import { cartonMeasures, editorPallets, groupCartons } from "@/lib/carton-groups"
import { printableLabelTypes } from "@/lib/printable-labels"
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
    packingGroups,
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
    title,
    amazonIds,
    nextStep,
    route: places,
    editsRoute,
    buyer,
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
  const carrierLabels = shipmentLabelRequirements(orderDestination(snapshot), shipment.transport).carrierLabels
  // What still holds the labels back from the supplier, besides what the page asks for elsewhere.
  const heldBack = step.issues.filter(
    (issue) => !["missing_shipping_label", "missing_tracking_number"].includes(issue.code)
  )
  const reconciling = isBuyer && editsShipments && step.next.step === "reconcile"
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
    // While a carton lacks its carrier label. Saving the last one sends the labels to the supplier.
    labels: isBuyer && carrierLabels && shipment.packing && (
      <UploadCarrierLabels
        shipmentId={id}
        revision={shipment.revision}
        reference={order.data.reference}
        shipmentName={title}
        cartons={shipment.packing.cartons}
        saved={page.carrierLabels}
      />
    ),
    cancellation: isBuyer && (
      <ActionButton action="shipment.cancelAmazon" data={{ id }}>
        {t("actions.cancelInAmazon")}
      </ActionButton>
    )
  }

  const { route, choices, saved } = useShipmentRoute(places)
  // The buyer changes the route in its own section, which sends the route it started from.
  const saveRoute = useAction("shipment.route")
  const routeEditing = editsRoute
    ? {
        choices,
        saving: saveRoute.pending,
        error: saveRoute.error,
        onCancel: saveRoute.reset,
        onSave: async (edited: Route<RouteStop>) =>
          Boolean(
            await saveRoute.run({ id, revision: shipment.revision, route: saved(edited), expected: places.route })
          )
      }
    : {}
  const productActions = (item: (typeof packingOrder.items)[number]) =>
    productDownloads(item.id).length > 0 && (
      <ProductDownloadsMenu
        productName={item.supplierSku || item.buyerSku}
        items={productDownloads(item.id)}
        allHref={labelsHref({ item: item.id })}
      />
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
      <ShipmentProgress processing={amazonRequestStates.includes(shipment.status)} message={nextStep} />
      {(shipment.issue || reconciling) && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("needsAttention")}</AlertTitle>
          {shipment.issue && <AlertDescription>{shipment.issue}</AlertDescription>}
          {/* The Amazon order Copacker didn't hear back about: linking it resumes the shipment. */}
          {reconciling && (
            <div className="col-start-2 pt-2 text-foreground">
              <ReconcileShipment id={id} fba={fba} />
            </div>
          )}
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
    // Packing: the route heads the form, and the documents and running totals sit beside the cartons.
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
          route={{ route, buyer, ...routeEditing }}
          shipmentId={id}
          linkedAmazonShipmentId={
            isBuyer && shipment.amazonNetwork === "awd_us" ? shipment.linkedAmazonShipmentId : undefined
          }
          key={`${id}:${order.revision}`}
          revision={shipment.revision}
          orderRevision={order.revision}
          reserved={reserved}
          order={packingOrder}
          packingGroups={packingGroups}
          initial={shipment.packingDraft ?? shipment.packing}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          addAddressTo={enteringFor && editsPartners ? { id: supplier.id, name: enteringFor } : undefined}
        />
      </>
    )
  }

  // Amazon's shipment IDs follow the title, each a Seller Central link where the viewer can open it.
  const amazonReferences = [
    ...amazonIds.map((amazonId) => <span key={amazonId}>{amazonId}</span>),
    ...amazonLinks.map((link) => (
      <a
        key={link.id}
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
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
  const packing = shipment.packing ?? shipment.packingDraft
  const cartons = groupCartons(packing?.cartons)
  const pallets = packing?.palletized ? editorPallets(packing.pallets) : undefined

  // After packing, the same layout without the form: the state's alerts and next step lead the column beside the
  // documents and totals, and the cartons follow as packed.
  return (
    <ShipmentLayout
      key={`${id}:${order.revision}:${shipment.revision}`}
      header={
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
              <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
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
      }
      notices={
        <>
          {notices}
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
                        <ItemTitle>{[item.name, variantName(item.variant)].filter(Boolean).join(" / ")}</ItemTitle>
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

          {/* The labels go to the supplier by themselves once nothing holds them back. Carrier labels come from the header's
              Upload labels, so this lists anything else, such as who moves a leg of the route or a product's label. */}
          {shipment.status === "waiting_labels" && isBuyer && heldBack.length > 0 && (
            <Alert role="note">
              <Clock />
              <AlertTitle>{t("labels.heldBack")}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-5">
                  {heldBack.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {amazonRequestStates.includes(shipment.status) && (
            <Alert role="note">
              <Spinner aria-hidden />
              <AlertTitle>{t("creating.title")}</AlertTitle>
              <AlertDescription>{t("creating.description")}</AlertDescription>
            </Alert>
          )}
        </>
      }
      details={
        <RouteSection
          route={route}
          buyer={buyer}
          readyDate={packing?.readyDate}
          // Open while the buyer still has to choose who moves a leg.
          defaultOpen={editsRoute && !shipment.transport}
          {...routeEditing}
        />
      }
      products={
        <PackedProductsTable
          order={packingOrder}
          cartons={cartons}
          reserved={reserved}
          renderActions={productActions}
        />
      }
      sidebar={
        <div className="flex flex-col gap-6">
          <section aria-label={t("documents.title")} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t("documents.title")}</h2>
            <div className="flex flex-col gap-2 empty:hidden">
              {/* Once the labels are with the supplier, the packet holds every document. */}
              {step.packetUrl && (
                <Attachment
                  kind="packet"
                  label={t("packet.document")}
                  description={t("packet.documentDescription")}
                  downloadLabel={t("packet.downloadLabel")}
                  href={step.packetUrl}
                />
              )}
              {productDownloads().length > 0 && (
                <ProductDownloadsMenu attachment items={productDownloads()} allHref={labelsHref({})} />
              )}
              {packed && <PackingListDownload id={id} />}
              {visibleDocs.length > 0 && (
                <DocumentList documents={visibleDocs.map((doc) => ({ ...doc, shipmentId: id }))} />
              )}
            </div>
            {!step.packetUrl && productDownloads().length === 0 && !packed && visibleDocs.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
            )}
          </section>
          <ShipmentDetails readyDate={packing?.readyDate ?? ""} {...cartonMeasures(cartons, pallets)} />
        </div>
      }
    >
      <CartonList
        readOnly
        order={packingOrder}
        cartons={cartons}
        reserved={reserved}
        // A saved draft's cartons show what they still lack, as they do while packing.
        showErrors
      />
      {pallets && <PalletList readOnly order={packingOrder} cartons={cartons} pallets={pallets} />}
    </ShipmentLayout>
  )
}

function PackingListDownload({ id }: { id: string }) {
  const t = useTranslations("shipments.detail.documents")
  const { download, busy } = usePackingListDownload(id)
  return (
    <Attachment label={t("packingList")} downloadLabel={t("downloadPackingList")} busy={busy} onDownload={download} />
  )
}
