import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { session } from "@/server/auth"
import { bundleSales } from "@/server/bundle-sales"
import { ReconnectRequiredError } from "@/server/errors"
import { inventoryContext } from "@/server/inventory-context"
import { inventoryLocations } from "@/server/inventory-products"
import { readProductDefaults } from "@/server/product-defaults"
import { restockPoolReport, type RestockTarget } from "@/server/restock-pool-report"
import { dayRange } from "@/server/restock-report"
import { DemandAccessError, readSalesDemand } from "@/server/sales"
import { summarizeDemandGaps, type DemandGap, type DemandRow } from "@/server/sales-attribution"
import { appUrl } from "@/server/security"
import { describeError } from "@/server/stock"

const inputSchema = z.strictObject({
  days: z.number().int().min(dayRange.min).max(dayRange.max),
  leadTimeDays: z.number().int().min(dayRange.min).max(dayRange.max).default(56),
  target: z
    .discriminatedUnion("pool", [
      z.strictObject({ pool: z.literal("shopify"), locationId: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/) }),
      z.strictObject({ pool: z.literal("fba") }),
      z.strictObject({ pool: z.literal("awd") })
    ])
    .optional()
})

export const maxDuration = 300

// Sales per variant for the Inventory page: sold alone, sold in bundles, and bundles sold, from every connected store.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return Response.json(
      { error: `Enter a sales period and lead time of ${dayRange.min} to ${dayRange.max} days` },
      { status: 400, headers }
    )
  }
  // Orders need a couple of minutes to settle, so the window ends on a whole minute a few minutes ago.
  const to = new Date(Math.floor((Date.now() - 180000) / 60000) * 60000)
  const window = { from: new Date(to.getTime() - input.data.days * 86400000).toISOString(), to: to.toISOString() }
  const connected = await db()
    .select({ provider: connections.provider, externalId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  const rows: DemandRow[] = []
  type SourceSales = { rows: DemandRow[]; gaps: DemandGap[] }
  let shopifySales: SourceSales | null = null
  let amazonSales: SourceSales | null = null
  const sources = []
  for (const source of ["shopify", "amazon"] as const) {
    if (!connected.some((account) => account.provider === source)) {
      continue
    }
    try {
      const result = await readSalesDemand(s, { source, window }, async () => request.signal.throwIfAborted())
      rows.push(...result.rows)
      if (source === "shopify") {
        shopifySales = result
      } else {
        amazonSales = result
      }
      sources.push({
        source,
        error: null,
        // Units the source reported but couldn't place, such as unfulfilled orders or unmapped sales channels.
        gapUnits: result.gaps.reduce((sum, gap) => sum + (gap.units ?? 0), 0),
        gapReasons: summarizeDemandGaps(result.gaps)
      })
    } catch (error) {
      console.error(
        JSON.stringify({ event: "sales_read_failed", source, orgId: s.org.id, error: describeError(error) })
      )
      sources.push({
        source,
        // Access problems say what to do; anything else is logged and summarized.
        error:
          error instanceof DemandAccessError || error instanceof ReconnectRequiredError
            ? error.message
            : "Sales couldn't be read. Check the connection and try again.",
        gapUnits: 0,
        gapReasons: {}
      })
    }
  }
  const { domain, rows: catalog, classifications, onOrder } = await inventoryContext(s.org.id)
  const { variants, unmatchedUnits } = bundleSales(catalog, rows)
  const target = input.data.target as RestockTarget | undefined
  if (
    target?.pool === "shopify" &&
    !inventoryLocations(catalog, classifications).some(
      (location) => location.id === target.locationId && location.classification === "merchant"
    )
  ) {
    return Response.json({ error: "Choose a connected merchant location" }, { status: 400, headers })
  }
  const amazonAccount = connected.find((account) => account.provider === "amazon")
  const amazonStock =
    target && target.pool !== "shopify" && amazonAccount
      ? await db()
          .select({ data: stockSnapshots.data })
          .from(stockSnapshots)
          .where(
            and(
              eq(stockSnapshots.orgId, s.org.id),
              eq(stockSnapshots.externalAccountId, amazonAccount.externalId),
              eq(stockSnapshots.source, target.pool),
              eq(stockSnapshots.scopeKey, target.pool === "fba" ? "ATVPDKIKX0DER" : "us")
            )
          )
      : []
  const stock = amazonStock[0]?.data
  if (target && target.pool !== "shopify" && stock?.source !== target.pool) {
    return Response.json(
      { error: "Sync this Amazon inventory pool before requesting restocks" },
      { status: 409, headers }
    )
  }
  const poolReport = target
    ? restockPoolReport({
        target,
        catalog,
        classifications,
        onOrder,
        shopifySales,
        amazonSales,
        fbaStock: stock?.source === "fba" ? stock : null,
        awdStock: stock?.source === "awd" ? stock : null,
        salesDays: input.data.days,
        leadTimeDays: input.data.leadTimeDays,
        productDefaults: domain ? await readProductDefaults(s.org.id, domain) : new Map()
      })
    : null
  return Response.json(
    {
      window,
      days: input.data.days,
      leadTimeDays: input.data.leadTimeDays,
      target: target ?? null,
      sources,
      unmatchedUnits,
      variants: Object.fromEntries(variants),
      restock: Object.fromEntries(poolReport?.suggestions ?? []),
      blockedCount: poolReport?.blockedCount ?? 0,
      unmatchedStockSkus: poolReport?.unmatchedStockSkus ?? 0,
      reorder: poolReport?.reorder ?? [],
      multipacks: []
    },
    { headers }
  )
}
