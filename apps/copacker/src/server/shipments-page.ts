import { and, desc, eq, inArray } from "drizzle-orm"
import { shipmentDestinations } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { connections, organizations, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { visibleOrders } from "@/server/access"
import type { AmazonShipment } from "@/server/amazon-shipments"
import { listAmazonShipments } from "@/server/amazon-shipments"
import { requirePage, session } from "@/server/auth"
import { amazonFor } from "@/server/connections"
import { amazonShipmentCache } from "./amazon-shipment-cache"
import { hash } from "./security"
// A row opens its shipment: the link is stretched over the whole row.

// On a phone each row stacks to its shipment and status; wider tables add the destination, the supplier (a supplier
// sees the customer), then the ready date. Until the supplier or customer has its own column, it leads the line under
// the shipment. Cartons stay beside the status from a phone's width up.

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

const cachedAmazonShipments = amazonShipmentCache()
async function amazonShipments(orgId: string) {
  const [account] = await db()
    .select({ id: connections.id, externalId: connections.externalId, encryptedToken: connections.encryptedToken })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
  return account
    ? cachedAmazonShipments(`${orgId}:${account.id}:${account.externalId}:${hash(account.encryptedToken)}`, async () =>
        listAmazonShipments(await amazonFor(orgId))
      )
    : null
}
export async function shipmentsPage(input: { query: Record<string, string | string[]> }) {
  const requested = input.query.view
  const current = views.find((tab) => tab.view === requested) ?? views[0]
  const inView = (status: string) => current.view === "all" || stage(status) === current.view
  const s = await session()
  requirePage(s, "shipments")
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

  return {
    isBuyer,
    supplierView,
    seesOrders: can(s, "orders"),
    listCount: list.length,
    amazonAllCount: amazonAll.length,
    amazon,
    amazonFailed,
    current: current.key,
    stats: { packing: count("packing"), actionNeeded: count("approval", "waiting_labels"), ready: count("ready") },
    tabs: views.map((tab) => ({ ...tab, count: tabCount(tab.view) })),
    shown: shown.map(({ shipment, order, partner, number }) => ({
      shipment: { id: shipment.id, status: shipment.status, amazonShipmentId: shipment.amazonShipmentId },
      reference: order.data.reference,
      partner,
      number,
      cartons: shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0,
      ready: shipment.packingDraft?.readyDate || shipment.packing?.readyDate,
      destination: destination(order.data, shipment.amazonNetwork)
    }))
  }
}
