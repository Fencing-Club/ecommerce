import { amazonNetworkNames } from "@repo/aisle"
import { and, desc, eq, inArray } from "drizzle-orm"
import { AlertTriangle, ExternalLink } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { unstable_cache } from "next/cache"
import Link from "next/link"
import { EmptyState, PageHeader, Status } from "@/components/common"
import { StatCard, StatGrid } from "@/components/stat-card"
import { TabLinks } from "@/components/tab-links"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { connections, organizations, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { visibleOrders } from "@/server/access"
import { type AmazonShipment, listAmazonShipments } from "@/server/amazon-shipments"
import { requirePage, session, titleFor } from "@/server/auth"
import { amazonFor } from "@/server/connections"
import { readyDateFormat, shipmentDestinations } from "./destination"

export const generateMetadata = titleFor("shipments.list.title", "shipments")

// The workspace's shipments in its connected Amazon account, read from Amazon at most every two minutes. Null when no
// Amazon account is connected.
const amazonShipments = unstable_cache(
  async (orgId: string) => {
    const [account] = await db()
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
    return account ? listAmazonShipments(await amazonFor(orgId)) : null
  },
  ["amazon-shipments"],
  { revalidate: 120 }
)

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

// The list's tabs, kept in the URL: active shipments by default. Amazon calls a received shipment closed.
const views = [
  { view: undefined, key: "active" },
  { view: "received", key: "received" },
  { view: "cancelled", key: "cancelled" },
  { view: "all", key: "all" }
] as const
function stage(status: string) {
  if (["received", "CLOSED"].includes(status)) {
    return "received"
  }
  return ["cancelled", "CANCELLED"].includes(status) ? "cancelled" : undefined
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requested = (await searchParams).view
  const current = views.find((tab) => tab.view === requested) ?? views[0]
  const inView = (status: string) => current.view === "all" || stage(status) === current.view
  const s = await session()
  requirePage(s, "shipments")
  const [t, format] = await Promise.all([getTranslations("shipments.list"), getFormatter()])
  const isBuyer = s.org.kind === "buyer"
  // A supplier's navigation calls purchase orders orders.
  const supplierView = s.org.kind === "supplier"
  const rows = await visibleOrders(s)
  const ids = rows.map((r) => r.order.id)
  const list = ids.length
    ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.createdAt))
    : []
  const destination = await shipmentDestinations(rows.map((row) => row.order.data))
  // A supplier ships to several customers: each purchase order's buyer.
  const buyerIds = isBuyer ? [] : [...new Set(rows.map((row) => row.order.buyerOrgId))]
  const customers = buyerIds.length
    ? await db()
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, buyerIds))
    : []
  const shown = list.flatMap((shipment) => {
    const row = rows.find((candidate) => candidate.order.id === shipment.orderId)
    if (!row) {
      return []
    }
    // A purchase order's shipments are numbered oldest first.
    const number =
      list
        .filter((other) => other.orderId === shipment.orderId)
        .toReversed()
        .indexOf(shipment) + 1
    // Who is on the other side: the supplier for a buyer, the customer for a supplier.
    const partner = isBuyer
      ? row.supplier.name
      : (customers.find((customer) => customer.id === row.order.buyerOrgId)?.name ?? "—")
    return inView(shipment.status) ? [{ shipment, order: row.order, partner, number }] : []
  })
  const count = (...states: string[]) => list.filter((shipment) => states.includes(shipment.status)).length
  // Every shipment in the buyer's Amazon account follows the purchase order shipments, except those a purchase order
  // shipment already shows. The supplier can't see the buyer's Amazon account.
  let amazon: AmazonShipment[] = []
  // Every Amazon shipment the tabs choose from.
  let amazonAll: AmazonShipment[] = []
  let amazonFailed = false
  if (isBuyer) {
    try {
      const linked = new Set(list.flatMap((shipment) => shipment.amazonShipmentId?.split(", ") ?? []))
      amazonAll = ((await amazonShipments(s.org.id)) ?? []).filter((row) => !linked.has(row.shipmentId))
      amazon = amazonAll.filter((row) => inView(row.status))
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "amazon_shipments_failed",
          orgId: s.org.id,
          error: error instanceof Error ? error.message : "unknown error"
        })
      )
      amazonFailed = true
    }
  }
  // Each tab's count, over purchase order and Amazon shipments alike.
  const statuses = [...list.map((shipment) => shipment.status), ...amazonAll.map((row) => row.status)]
  const tabCount = (view: (typeof views)[number]["view"]) =>
    statuses.filter((status) => view === "all" || stage(status) === view).length

  return (
    <>
      <PageHeader title={t("title")} />

      {/* Counts only help once there is something to count. */}
      {list.length > 0 && (
        <StatGrid>
          <StatCard label={t("stats.packing")} value={count("packing")} />
          <StatCard
            label={isBuyer ? t("stats.actionNeeded") : t("stats.waitingOnBuyer")}
            value={count("approval", "waiting_labels")}
          />
          <StatCard label={t("stats.readyForPickup")} value={count("ready")} />
        </StatGrid>
      )}

      {amazonFailed && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t("amazonFailed.title")}</AlertTitle>
          <AlertDescription>{t("amazonFailed.description")}</AlertDescription>
        </Alert>
      )}

      {list.length > 0 || amazonAll.length > 0 ? (
        <div className="flex flex-col gap-3">
          <TabLinks
            label={t("tabsLabel")}
            tabs={views.map((tab) => ({
              label: t(`tabs.${tab.key}`),
              href: tab.view ? `/shipments?view=${tab.view}` : "/shipments",
              current: tab === current,
              count: tabCount(tab.view)
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
                {shown.map(({ shipment, order, partner, number }) => {
                  const cartons = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
                  const ready = shipment.packingDraft?.readyDate || shipment.packing?.readyDate
                  return (
                    <TableRow key={shipment.id} className={columns.row}>
                      <TableCell className={columns.shipment}>
                        <Link href={`/shipments/${shipment.id}`} className={rowLink}>
                          {order.data.reference}
                        </Link>
                        <p className={columns.detail}>
                          <span className={columns.partnerInline}>{partner}, </span>
                          {[t("shipmentNumber", { number }), shipment.amazonShipmentId].filter(Boolean).join(", ")}
                        </p>
                      </TableCell>
                      <TableCell className={columns.partner}>{partner}</TableCell>
                      <TableCell className={columns.destination}>
                        {destination(order.data, shipment.amazonNetwork)}
                      </TableCell>
                      <TableCell className={columns.cartons}>{cartons || "—"}</TableCell>
                      <TableCell className={columns.ready}>
                        {ready ? format.dateTime(new Date(`${ready}T00:00:00Z`), readyDateFormat) : "—"}
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
                      {t(`empty.${current.key}`)}
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
          {can(s, "orders") && (
            <Button variant="outline" nativeButton={false} render={<Link href="/orders" />}>
              {supplierView ? t("none.viewOrders") : t("none.viewPurchaseOrders")}
            </Button>
          )}
        </EmptyState>
      )}
    </>
  )
}
