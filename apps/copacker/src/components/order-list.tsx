import { money, type OrderInput, orderTotal } from "@repo/aisle"
import { destinationName } from "@repo/aisle/requirements"
import { inArray } from "drizzle-orm"
import Link from "next/link"
import { Status } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { contacts, forwarders, type orders } from "@/db/schema"
import { LinkRow } from "./link-row"
import { TabLinks } from "./tab-links"

type Order = Pick<typeof orders.$inferSelect, "id" | "status" | "data" | "createdAt">

// The list's tabs, each a PO status kept in the URL.
const tabs = [
  { status: null, label: "All", empty: "No purchase orders" },
  { status: "draft", label: "Draft", empty: "No drafts" },
  { status: "submitted", label: "With supplier", empty: "No purchase orders with suppliers" },
  { status: "closed", label: "Closed", empty: "No closed purchase orders" }
] as const

// Where each PO ships, by name, as its page's route shows it: Amazon's networks, such as Amazon FBA, the delivery
// address, or the forwarder and its address.
async function destinations(list: OrderInput[]) {
  const addressIds = [
    ...new Set(list.flatMap((data) => (data.destination !== "amazon" && data.deliveryId ? [data.deliveryId] : [])))
  ]
  const forwarderIds = [
    ...new Set(list.flatMap((data) => (data.destination === "forwarder" && data.forwarderId ? [data.forwarderId] : [])))
  ]
  const [addresses, forwarderNames] = await Promise.all([
    addressIds.length
      ? db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
      : [],
    forwarderIds.length
      ? db()
          .select({ id: forwarders.id, name: forwarders.name })
          .from(forwarders)
          .where(inArray(forwarders.id, forwarderIds))
      : []
  ])
  return (data: OrderInput) => {
    if (data.destination === "amazon") {
      return destinationName(data)
    }
    const forwarder =
      data.destination === "forwarder" && forwarderNames.find((row) => row.id === data.forwarderId)?.name
    const address = addresses.find((row) => row.id === data.deliveryId)?.name
    return [forwarder, address].filter(Boolean).join(", ") || "—"
  }
}

// "Sep 27", with the year when it isn't this year, in the workspace's time zone.
function dayFormat(timeZone: string | undefined) {
  const year = (at: Date) => at.toLocaleDateString("en-US", { timeZone, year: "numeric" })
  const thisYear = year(new Date())
  return (at: Date) =>
    at.toLocaleDateString("en-US", {
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
  const destination = await destinations(shown.map((row) => row.order.data))
  const day = dayFormat(timeZone)

  return (
    <div className="flex flex-col gap-3">
      <TabLinks
        label="Purchase order status"
        tabs={shownTabs.map((tab) => ({
          label: tab.label,
          href: tab.status ? `/orders?status=${tab.status}` : "/orders",
          current: tab === current
        }))}
      />
      <div className="@container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Purchase order</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="hidden @2xl:table-cell">Destination</TableHead>
              <TableHead className="hidden @2xl:table-cell">Created</TableHead>
              <TableHead>Status</TableHead>
              {showValue && <TableHead className="text-right">Value</TableHead>}
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
                      <p className="text-xs text-muted-foreground">
                        {lines} {lines === 1 ? "product" : "products"}
                      </p>
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
                      <TableCell className="text-right tabular-nums">
                        {money(orderTotal(order.data), order.data.currency)}
                      </TableCell>
                    )}
                  </LinkRow>
                )
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={showValue ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  {current.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
