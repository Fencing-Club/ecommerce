import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { stockSource, stockScopes, stockSelection } from "@/server/stock"

const cursorSchema = z.strictObject({
  snapshotId: z.uuid(),
  locationId: z.string().nullable(),
  offset: z.number().int().min(0).max(20000)
})
const querySchema = z.strictObject({
  source: stockSource,
  locationId: z
    .string()
    .regex(/^gid:\/\/shopify\/Location\/\d+$/)
    .optional(),
  marketplaceId: z.literal("ATVPDKIKX0DER").optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d{0,2}$/)
    .transform(Number)
    .pipe(z.number().max(200))
    .default(100),
  cursor: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
})

// A Shopify variation's cost and price, which the stock rows carry for the Overview and Restock.
const moneyFields = new Set(["unitCostMinor", "costCurrency", "priceMinor", "priceCurrency"])

export const GET = withRequest(async function GET(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "products")
  const search = new URL(request.url).searchParams
  const query = querySchema.safeParse(Object.fromEntries(search))
  let cursor: z.infer<typeof cursorSchema> | undefined
  try {
    if (!query.success || [...search.keys()].some((key) => search.getAll(key).length !== 1)) {
      throw new Error("Invalid query")
    }
    stockSelection.parse({ source: query.data.source, marketplaceId: query.data.marketplaceId })
    if (query.data.locationId && query.data.source !== "shopify") {
      throw new Error("Location filter requires Shopify")
    }
    if (query.data.cursor) {
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.data.cursor, "base64url").toString("utf8")))
    }
  } catch {
    return errorResponse("invalidStockQuery", 400, headers)
  }
  const source = query.data.source
  const { provider, scopeKey } = stockScopes[source]
  const [current] = await db()
    .select({ accountId: connections.externalId, stock: stockSnapshots })
    .from(connections)
    .leftJoin(
      stockSnapshots,
      and(
        eq(stockSnapshots.orgId, connections.orgId),
        eq(stockSnapshots.externalAccountId, connections.externalId),
        eq(stockSnapshots.source, source),
        eq(stockSnapshots.scopeKey, scopeKey)
      )
    )
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, provider)))
  const stock = current?.stock
  const locationId = query.data.locationId ?? null
  const locations = new Map<string, string>()
  if (stock?.data?.source === "shopify") {
    for (const row of stock.data.rows) {
      for (const level of row.levels) {
        locations.set(level.locationId, level.locationName)
      }
    }
  }
  if (locationId && stock?.data && !locations.has(locationId)) {
    return errorResponse("locationNotInSnapshot", 400, headers)
  }
  let allRows = stock?.data?.rows ?? []
  if (locationId && stock?.data?.source === "shopify") {
    allRows = stock.data.rows
      .map((row) => ({ ...row, levels: row.levels.filter((level) => level.locationId === locationId) }))
      .filter((row) => row.levels.length > 0)
  }
  if (
    cursor &&
    (cursor.snapshotId !== stock?.snapshotId ||
      cursor.locationId !== locationId ||
      !stock.data ||
      cursor.offset > allRows.length)
  ) {
    return errorResponse("stockSnapshotChanged", 409, headers)
  }
  const offset = cursor?.offset ?? 0
  // Someone who doesn't see prices gets each variation without what it costs and sells for.
  const prices = can(s, "prices")
  const rows = allRows
    .slice(offset, offset + query.data.limit)
    .map((row) => (prices ? row : Object.fromEntries(Object.entries(row).filter(([key]) => !moneyFields.has(key)))))
  const nextOffset = offset + rows.length
  return Response.json(
    {
      source,
      scopeKey,
      externalAccountId: current?.accountId ?? null,
      snapshotId: stock?.snapshotId ?? null,
      startedAt: stock?.data?.startedAt ?? null,
      observedAt: stock?.data?.observedAt ?? null,
      refresh: {
        status: stock?.status ?? "idle",
        revision: stock?.revision ?? 0,
        requestedAt: stock?.requestedAt ?? null,
        errorCode: current ? (stock?.errorCode ?? null) : "not_connected"
      },
      locations: [...locations].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id)),
      rows,
      nextCursor:
        stock?.data && nextOffset < allRows.length
          ? Buffer.from(JSON.stringify({ snapshotId: stock.snapshotId, locationId, offset: nextOffset })).toString(
              "base64url"
            )
          : null
    },
    { headers }
  )
})
