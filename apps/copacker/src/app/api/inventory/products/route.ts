import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, orders, stockSnapshots } from "@/db/schema"
import { session } from "@/server/auth"
import { groupInventory, inventoryLocations, onOrderByVariant, pageSizes } from "@/server/inventory-products"
import { stockScopes } from "@/server/stock"

const querySchema = z.strictObject({
  locationId: z
    .string()
    .regex(/^gid:\/\/shopify\/Location\/\d+$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
  includeCollective: z.enum(["true", "false"]).default("false"),
  page: z
    .string()
    .regex(/^[1-9]\d{0,4}$/)
    .transform(Number)
    .default(1),
  pageSize: z.enum(pageSizes.map(String)).transform(Number).default(25)
})

// Shopify inventory grouped by product, one page at a time, for the Inventory page.
export async function GET(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) {
    return Response.json({ error: "Invalid inventory query" }, { status: 400, headers })
  }
  const { scopeKey, provider } = stockScopes.shopify
  const [current] = await db()
    .select({ stock: stockSnapshots })
    .from(connections)
    .leftJoin(
      stockSnapshots,
      and(
        eq(stockSnapshots.orgId, connections.orgId),
        eq(stockSnapshots.externalAccountId, connections.externalId),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.scopeKey, scopeKey)
      )
    )
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, provider)))
  const data = current?.stock?.data?.source === "shopify" ? current.stock.data : null
  const rows = data?.rows ?? []
  const { page, pageSize, locationId, q } = query.data
  // Sent POs only: drafts haven't been ordered, and closed POs have arrived or been cancelled.
  const sent = await db()
    .select({ id: orders.id, data: orders.data })
    .from(orders)
    .where(and(eq(orders.buyerOrgId, s.org.id), eq(orders.status, "submitted")))
  const products = groupInventory(rows, {
    locationId,
    query: q,
    includeCollective: query.data.includeCollective === "true",
    onOrder: onOrderByVariant(sent)
  })
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const pageNumber = Math.min(page, totalPages)
  const levels = rows.flatMap((row) => row.levels)
  return Response.json(
    {
      observedAt: data?.observedAt ?? null,
      // Snapshots saved before product details and location kinds were collected need one more sync.
      needsResync: rows.some((row) => row.productId === undefined) || levels.some((level) => !level.locationKind),
      locations: inventoryLocations(rows),
      page: pageNumber,
      pageSize,
      totalPages,
      totalProducts: products.length,
      totalVariants: products.reduce((sum, product) => sum + product.variants.length, 0),
      products: products.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
    },
    { headers }
  )
}
