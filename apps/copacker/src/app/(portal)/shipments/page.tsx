import { amazonNetworkNames } from "@repo/aisle"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ExternalLink } from "lucide-react"
import { useTranslations, useFormatter } from "use-intl"
import { EmptyState, PageHeader, Status } from "@/components/common"
import { StatCard, StatGrid } from "@/components/stat-card"
import { TabLinks } from "@/components/tab-links"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { shipmentsPage } from "@/server/shipments-page"

// A row opens its shipment: the link is stretched over the whole row.
const rowLink =
  "font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
// On a phone each row stacks to its shipment and status; wider tables add the destination, the supplier (a supplier
// sees the customer), then the ready date. Until the supplier or customer has its own column, it leads the line under
// the shipment. Cartons stay beside the status from a phone's width up.
const columns = {
  row: "relative @max-md:flex @max-md:items-start @max-md:gap-x-3 @max-md:px-4 @max-md:py-3",
  shipment: "@max-md:min-w-0 @max-md:flex-1 @max-md:p-0",
  detail: "text-xs whitespace-normal text-muted-foreground",
  destination: "hidden @2xl:table-cell",
  partner: "hidden @3xl:table-cell",
  partnerInline: "@3xl:hidden",
  cartons: "text-end tabular-nums @max-md:hidden",
  ready: "hidden ps-6 tabular-nums @4xl:table-cell",
  status: "@max-md:p-0"
}

export default function ShipmentsPage({ page }: { page: Awaited<ReturnType<typeof shipmentsPage>> }) {
  const {
    isBuyer,
    supplierView,
    seesOrders,
    listCount,
    amazonAllCount,
    amazon,
    amazonFailed,
    current,
    stats,
    tabs,
    shown
  } = page
  const t = useTranslations("shipments.list"),
    format = useFormatter()
  return (
    <>
      <PageHeader title={t("title")} />

      {/* Counts only help once there is something to count. */}
      {listCount > 0 && (
        <StatGrid>
          <StatCard label={t("stats.packing")} value={stats.packing} />
          <StatCard label={isBuyer ? t("stats.actionNeeded") : t("stats.waitingOnBuyer")} value={stats.actionNeeded} />
          <StatCard label={t("stats.readyForPickup")} value={stats.ready} />
        </StatGrid>
      )}

      {amazonFailed && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t("amazonFailed.title")}</AlertTitle>
          <AlertDescription>{t("amazonFailed.description")}</AlertDescription>
        </Alert>
      )}

      {listCount > 0 || amazonAllCount > 0 ? (
        <div className="flex flex-col gap-3">
          <TabLinks
            label={t("tabsLabel")}
            tabs={tabs.map((tab) => ({
              label: t(`tabs.${tab.key}`),
              href: tab.view ? `/shipments?view=${tab.view}` : "/shipments",
              current: tab.key === current,
              count: tab.count
            }))}
          />
          <div className="@container">
            <Table className="@max-md:block">
              <TableHeader className="@max-md:hidden">
                <TableRow>
                  <TableHead>{t("columns.shipment")}</TableHead>
                  <TableHead className={columns.partner}>
                    {isBuyer ? t("columns.supplier") : t("columns.customer")}
                  </TableHead>
                  <TableHead className={columns.destination}>{t("columns.destination")}</TableHead>
                  <TableHead className={columns.cartons}>{t("columns.cartons")}</TableHead>
                  <TableHead className={columns.ready}>{t("columns.readyDate")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="@max-md:block">
                {shown.map(({ shipment, reference, partner, number, cartons, ready, destination }) => {
                  return (
                    <TableRow key={shipment.id} className={columns.row}>
                      <TableCell className={columns.shipment}>
                        <Link to="/shipments/$id" params={{ id: shipment.id }} className={rowLink}>
                          {reference}
                        </Link>
                        <p className={columns.detail}>
                          <span className={columns.partnerInline}>{partner}, </span>
                          {[t("shipmentNumber", { number }), shipment.amazonShipmentId].filter(Boolean).join(", ")}
                        </p>
                      </TableCell>
                      <TableCell className={columns.partner}>{partner}</TableCell>
                      <TableCell className={columns.destination}>{destination}</TableCell>
                      <TableCell className={columns.cartons}>{cartons || "—"}</TableCell>
                      <TableCell className={columns.ready}>
                        {ready
                          ? format.dateTime(new Date(`${ready}T00:00:00Z`), {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC"
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className={columns.status}>
                        <Status status={shipment.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
                {amazon.map((row) => (
                  <TableRow key={row.shipmentId} className={columns.row}>
                    <TableCell className={columns.shipment}>
                      {/* Made in Seller Central or elsewhere, so it opens there. */}
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`${rowLink} inline-flex items-center gap-1`}
                      >
                        {row.shipmentId}
                        <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                        <span className="sr-only"> {t("opensInSellerCentral")}</span>
                      </a>
                      {row.name && <p className={columns.detail}>{row.name}</p>}
                    </TableCell>
                    <TableCell className={columns.partner}>—</TableCell>
                    <TableCell className={columns.destination}>Amazon {amazonNetworkNames[row.network]}</TableCell>
                    <TableCell className={columns.cartons}>—</TableCell>
                    <TableCell className={columns.ready}>—</TableCell>
                    <TableCell className={columns.status}>
                      <Status status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!shown.length && !amazon.length && (
                  <TableRow className="hover:bg-transparent @max-md:block">
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground @max-md:flex @max-md:items-center @max-md:justify-center"
                    >
                      {t(`empty.${current}`)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <EmptyState
          title={t("none.title")}
          description={supplierView ? t("none.supplierDescription") : t("none.buyerDescription")}
        >
          {seesOrders && (
            <Button variant="outline" nativeButton={false} render={<Link to="/orders" />}>
              {supplierView ? t("none.viewOrders") : t("none.viewPurchaseOrders")}
            </Button>
          )}
        </EmptyState>
      )}
    </>
  )
}
