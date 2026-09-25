import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { session } from "@/server/auth"
import { bundleSales, salesPeriods } from "@/server/bundle-sales"
import { ReconnectRequiredError } from "@/server/errors"
import { inventoryContext } from "@/server/inventory-context"
import { groupInventory } from "@/server/inventory-products"
import { leadTimes, multipackSales, reorderList, restockReport } from "@/server/restock-report"
import { DemandAccessError, readSalesDemand } from "@/server/sales"
import { summarizeDemandGaps, type DemandRow } from "@/server/sales-attribution"
import { appUrl } from "@/server/security"
import { describeError } from "@/server/stock"

const inputSchema = z.strictObject({
  days: z.literal([...salesPeriods]),
  leadTimeDays: z.literal([...leadTimes]).default(56)
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
    return Response.json({ error: "Choose a sales period" }, { status: 400, headers })
  }
  // Orders need a couple of minutes to settle, so the window ends on a whole minute a few minutes ago.
  const to = new Date(Math.floor((Date.now() - 180000) / 60000) * 60000)
  const window = { from: new Date(to.getTime() - input.data.days * 86400000).toISOString(), to: to.toISOString() }
  const connected = await db()
    .select({ provider: connections.provider, externalId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  const rows: DemandRow[] = []
  const sources = []
  for (const source of ["shopify", "amazon"] as const) {
    if (!connected.some((account) => account.provider === source)) {
      continue
    }
    try {
      const result = await readSalesDemand(s, { source, window }, async () => request.signal.throwIfAborted())
      rows.push(...result.rows)
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
  const { rows: catalog, classifications, onOrder } = await inventoryContext(s.org.id)
  const { variants, unmatchedUnits } = bundleSales(catalog, rows)
  // Restock needs every source's sales; with one missing, demand is unknown rather than low.
  const complete = sources.length > 0 && sources.every((source) => source.error === null)
  const products = groupInventory(catalog, { classifications, onOrder })
  const restock = restockReport(products, complete ? variants : null, {
    salesDays: input.data.days,
    leadTimeDays: input.data.leadTimeDays
  })
  return Response.json(
    {
      window,
      days: input.data.days,
      leadTimeDays: input.data.leadTimeDays,
      sources,
      unmatchedUnits,
      variants: Object.fromEntries(variants),
      restock: Object.fromEntries(restock),
      reorder: reorderList(products, restock, variants),
      multipacks: multipackSales(products, variants)
    },
    { headers }
  )
}
