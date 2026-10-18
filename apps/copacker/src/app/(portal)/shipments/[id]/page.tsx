import { money } from "@repo/aisle"
import { canConfigureTransport, shipmentLabelRequirements } from "@repo/aisle/transport"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  ExternalLink,
  Factory,
  MapPin,
  Loader2,
  PackageCheck
} from "lucide-react"
import { Fragment } from "react"
import { useTranslations, useFormatter, useLocale } from "use-intl"
import { ActionButton } from "@/components/actions"
import { CartonEditor } from "@/components/carton-editor"
import { DocumentList, PageHeader, Status } from "@/components/common"
import { PackingForm } from "@/components/packing-form"
import { ApproveInvoice, CorrectionForm, ReleaseLabels, ReconcileShipment } from "@/components/shipment-actions"
import { ShipmentDestination } from "@/components/shipment-destination"
import { ShipmentProgress } from "@/components/shipment-progress"
import { ShipmentTransportSettings } from "@/components/shipment-transport"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Upload } from "@/components/upload"
import { groupCartons } from "@/lib/carton-groups"
import { formatPhone, phoneHref } from "@/lib/phone"
import { finishedStates } from "@/server/readiness"
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
    isBuyer,
    amazonLinks,
    visibleDocs,
    changes,
    origin,
    fba,
    enteringFor,
    amazon,
    title,
    summary,
    nextStep,
    delivery,
    destinationName
  } = page
  const t = useTranslations("shipments.detail"),
    format = useFormatter(),
    locale = useLocale()
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

  return (
    <>
      <PageHeader
        parents={[
          {
            label: isBuyer ? t("parents.purchaseOrders") : t("parents.orders"),
            href: seesOrder ? "/orders" : undefined
          },
          { label: order.data.reference, href: seesOrder ? `/orders/${order.id}` : undefined },
          { label: `${title} (${destinationName})` }
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
        {seesOrder && (
          <Button variant="outline" nativeButton={false} render={<Link to="/orders/$id" params={{ id: order.id }} />}>
            <ArrowLeft aria-hidden="true" />
            {isBuyer ? t("changesWaiting.viewPurchaseOrder") : t("changesWaiting.viewOrder")}
          </Button>
        )}
        {editsShipments ? nextAction[step.next.step] || null : null}
      </PageHeader>

      {!editable && (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <Factory className="size-4" aria-hidden />
              {supplier.name}
            </span>
            <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            {snapshot.via && delivery.addresses[0] && (
              <>
                <span>{delivery.addresses[0].name}</span>
                <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
              </>
            )}
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4" aria-hidden />
              {destinationName}
            </span>
          </div>
          <div className="grid gap-6 p-4 sm:grid-cols-2">
            <section className="min-w-0">
              <div className="mb-2 flex flex-col gap-1">
                <CardTitle>{t("pickup.title")}</CardTitle>
                {shipment.packing && (
                  <CardDescription>
                    {t("pickup.ready", {
                      date: format.dateTime(new Date(`${shipment.packing.readyDate}T00:00:00Z`), {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC"
                      })
                    })}
                  </CardDescription>
                )}
              </div>
              <div>
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
              </div>
            </section>

            <ShipmentDestination {...delivery} compact />
          </div>
          {shipment.transport && (
            <ShipmentTransportSettings
              compact
              key={JSON.stringify(shipment.transport)}
              id={id}
              revision={shipment.revision}
              initial={shipment.transport}
              hasForwarder={!!snapshot.via}
              editable={
                isBuyer &&
                editsShipments &&
                canConfigureTransport(shipment.status, shipment.operation, shipment.transport)
              }
            />
          )}
        </div>
      )}
      {(editable || !shipment.transport) && (
        <ShipmentTransportSettings
          key={JSON.stringify(shipment.transport)}
          id={id}
          revision={shipment.revision}
          initial={shipment.transport}
          hasForwarder={!!snapshot.via}
          editable={
            isBuyer && editsShipments && canConfigureTransport(shipment.status, shipment.operation, shipment.transport)
          }
        />
      )}
      <ShipmentProgress processing={["queued", "creating"].includes(shipment.status)} message={nextStep} />
      {shipment.status === "packed" && <p className="text-sm text-muted-foreground">{step.next.message}</p>}
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

      {editable ? (
        <PackingForm
          shipmentName={title}
          destination={<ShipmentDestination {...delivery} />}
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
          order={packingOrder}
          initial={shipment.packingDraft ?? shipment.packing}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          addAddressTo={enteringFor && editsPartners ? { id: supplier.id, name: enteringFor } : undefined}
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

          <section className="flex flex-col gap-5" aria-label={t("cartons.title")}>
            <h2 className="font-semibold">{t("cartons.title")}</h2>
            {groupCartons(shipment.packing?.cartons).map((carton) => (
              <div key={carton.cartonId} className="flex flex-col gap-2">
                <CartonEditor value={carton} products={snapshot.items} readOnly />
                {amazon && shipment.labels.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("cartons.amazonLabel")}:{" "}
                    <span className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
                      {(carton.cartonIds ?? [carton.cartonId]).map((id) => (
                        <span key={id} className="whitespace-nowrap">
                          {id}: {shipment.labels.find((label) => label.cartonId === id)?.labelNumber ?? "—"}
                        </span>
                      ))}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t("documents.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {visibleDocs.length ? (
                <DocumentList documents={visibleDocs.map((doc) => ({ ...doc, shipmentId: id }))} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
              )}
            </CardContent>
          </Card>

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
