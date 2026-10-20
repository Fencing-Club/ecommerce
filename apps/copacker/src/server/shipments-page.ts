import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { connections, organizations, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { visibleOrders } from "@/server/access"
import { type AmazonShipment, listAmazonShipments } from "@/server/amazon-shipments"
import { requirePage, session } from "@/server/auth"
import { amazonFor } from "@/server/connections"
import { amazonShipmentCache } from "./amazon-shipment-cache"
import { shipmentListRows } from "./logistics-rows"
import { hash } from "./security"

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

// Every shipment the workspace sees, for the list to sort into its views. The supplier can't see the buyer's Amazon
// account.
export async function shipmentsPage(input: { query: Record<string, string | string[]> }) {
  const s = await session()
  requirePage(s, "shipments")
  const isBuyer = s.org.kind === "buyer"
  const rows = await visibleOrders(s)
  const ids = rows.map((r) => r.order.id)
  const list = ids.length
    ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.createdAt))
    : []
  // A supplier ships to several customers: each purchase order's buyer.
  const buyerIds = isBuyer ? [] : [...new Set(rows.map((row) => row.order.buyerOrgId))]
  const customers = buyerIds.length
    ? await db()
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, buyerIds))
    : []
  let amazon: AmazonShipment[] = []
  let amazonFailed = false
  if (isBuyer) {
    try {
      amazon = (await amazonShipments(s.org.id)) ?? []
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
  return {
    viewer: s.org.kind,
    seesOrders: can(s, "orders"),
    amazonFailed,
    view: typeof input.query.view === "string" ? input.query.view : undefined,
    rows: await shipmentListRows({ isBuyer, rows, list, customers, amazon })
  }
}
