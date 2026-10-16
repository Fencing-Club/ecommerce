import { money } from "@repo/aisle"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowRight, Clock, Download, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import { Fragment } from "react"
import { useTranslations, useFormatter, useLocale } from "use-intl"
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
    invoice,
    changes,
    origin,
    fba,
    enteringFor,
    amazon,
    title,
    summary,
    nextStep
  } = page
  const t = useTranslations("shipments.detail"),
    format = useFormatter(),
    locale = useLocale()
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
          order={order.data}
          initial={shipment.packingDraft ?? shipment.packing}
          invoice={invoice && { id: invoice.id, name: invoice.name, bytes: invoice.bytes }}
          addresses={addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address }))}
          enteringFor={isBuyer ? supplier.name : undefined}
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
                      date: format.dateTime(new Date(`${shipment.packing.readyDate}T00:00:00Z`), {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC"
                      })
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
