import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { session } from "@/server/auth"
import { inventoryContext } from "@/server/inventory-context"
import { inventoryLocations } from "@/server/inventory-products"
import { stockScopes } from "@/server/stock"

export async function GET() {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const { rows, classifications, data } = await inventoryContext(s.org.id)
  const targets: {
    key: string
    pool: "shopify" | "fba" | "awd"
    locationId: string
    label: string
    observedAt: string | null
  }[] = inventoryLocations(rows, classifications)
    .filter((location) => location.classification === "merchant")
    .map((location) => ({
      key: `shopify:${location.id}`,
      pool: "shopify" as const,
      locationId: location.id,
      label: location.name,
      observedAt: data?.observedAt ?? null
    }))
  const [amazon] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "amazon")))
  if (amazon) {
    const snapshots = await db()
      .select({ source: stockSnapshots.source, data: stockSnapshots.data })
      .from(stockSnapshots)
      .where(and(eq(stockSnapshots.orgId, s.org.id), eq(stockSnapshots.externalAccountId, amazon.externalId)))
    for (const source of ["fba", "awd"] as const) {
      const snapshot = snapshots.find(
        (row) =>
          row.source === source && row.data?.source === source && row.data.scopeKey === stockScopes[source].scopeKey
      )
      if (snapshot?.data) {
        targets.push({
          key: source,
          pool: source,
          locationId: "",
          label: source === "fba" ? "Amazon FBA" : "Amazon AWD",
          observedAt: snapshot.data.observedAt
        })
      }
    }
  }
  return Response.json(targets, { headers })
}
