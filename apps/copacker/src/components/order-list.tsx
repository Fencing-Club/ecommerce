import { money, type OrderInput, orderTotal } from "@repo/aisle"
import { orderNetworks } from "@repo/aisle/requirements"
import { inArray } from "drizzle-orm"
import { getLocale, getTranslations } from "next-intl/server"
import Link from "next/link"
import { Status } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { contacts, type orders } from "@/db/schema"
import { requirementTranslator } from "@/server/requirements"
import { LinkRow } from "./link-row"
import { TabLinks } from "./tab-links"

type Order = Pick<typeof orders.$inferSelect, "id" | "status" | "data" | "createdAt">

// The list's tabs, each a PO status kept in the URL, with their label and empty text under orders.list.tabs.
const tabs = [
  { status: null, key: "all" },
  { status: "draft", key: "draft" },
  { status: "submitted", key: "submitted" },
  { status: "closed", key: "closed" }
] as const

// Where each PO ends up, by name, as its page's route shows it: Amazon's networks, such as Amazon FBA, or the delivery
// address.
async function destinations(list: OrderInput[]) {
  const addressIds = [
    ...new Set(list.flatMap((data) => (data.destination !== "amazon" && data.deliveryId ? [data.deliveryId] : [])))
  ]
  const text = await requirementTranslator()
  const addresses = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  return (data: OrderInput) =>
    data.destination === "amazon"
      ? text.amazon(orderNetworks(data))
      : (addresses.find((row) => row.id === data.deliveryId)?.name ?? "—")
}

// "Sep 27", with the year when it isn't this year, in the workspace's time zone.
function dayFormat(locale: string, timeZone: string | undefined) {
  const year = (at: Date) => at.toLocaleDateString(locale, { timeZone, year: "numeric" })
  const thisYear = year(new Date())
  return (at: Date) =>
    at.toLocaleDateString(locale, {
      timeZone,
      month: "short",
      day: "numeric",
      ...(year(at) !== thisYear && { year: "numeric" })
    })
}

// The purchase order list: status tabs, then a row per PO that opens it from anywhere on the row.
export async function OrderList({
  rows,
  status,
  showValue,
  drafts,
  timeZone
}: {
  rows: Array<{ order: Order; supplier: { name: string } }>
  // The status asked for in the URL, if any.
  status: string | undefined
  // Forwarders don't see what POs cost.
  showValue: boolean
  // Only buyers have drafts.
  drafts: boolean
  timeZone: string | undefined
}) {
  const shownTabs = tabs.filter((tab) => drafts || tab.status !== "draft")
  const current = shownTabs.find((tab) => tab.status === status) ?? tabs[0]
  const shown = current.status ? rows.filter((row) => row.order.status === current.status) : rows
  const [destination, locale, t] = await Promise.all([
    destinations(shown.map((row) => row.order.data)),
    getLocale(),
    getTranslations("orders.list")
  ])
  const day = dayFormat(locale, timeZone)

  return (
    <div className="flex flex-col gap-3">
      <TabLinks
        label={t("statusTabs")}
        tabs={shownTabs.map((tab) => ({
          label: t(`tabs.${tab.key}.label`),
          href: tab.status ? `/orders?status=${tab.status}` : "/orders",
          current: tab === current
        }))}
      />
      <div className="@container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.purchaseOrder")}</TableHead>
              <TableHead>{t("columns.supplier")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("columns.destination")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("columns.created")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              {showValue && <TableHead className="text-end">{t("columns.value")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? (
              shown.map(({ order, supplier }) => {
                const lines = order.data.items.length
                return (
                  <LinkRow key={order.id} href={`/orders/${order.id}`}>
                    <TableCell>
                      <Link href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                        {order.data.reference}
                      </Link>
                      <p className="text-xs text-muted-foreground">{t("products", { count: lines })}</p>
                    </TableCell>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell className="hidden @2xl:table-cell">{destination(order.data)}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums @2xl:table-cell">
                      <time dateTime={order.createdAt.toISOString()}>{day(order.createdAt)}</time>
                    </TableCell>
                    <TableCell>
                      <Status status={order.status} />
                    </TableCell>
                    {showValue && (
                      <TableCell className="text-end tabular-nums">
                        {money(orderTotal(order.data), order.data.currency, locale)}
                      </TableCell>
                    )}
                  </LinkRow>
                )
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={showValue ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  {t(`tabs.${current.key}.empty`)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
