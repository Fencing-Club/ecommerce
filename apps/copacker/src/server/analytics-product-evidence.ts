import { and, eq } from "drizzle-orm"
import { z } from "zod"
import type { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"

const catalog = z.object({
  observedAt: z.string(),
  rows: z.array(z.object({ variantId: z.string(), buyerSku: z.string().nullable() }))
})
export async function importedProductCatalog(tx: Pick<ReturnType<typeof db>, "select">, orgId: string) {
  const rows = await tx
    .select({ stock: stockSnapshots })
    .from(stockSnapshots)
    .innerJoin(
      connections,
      and(
        eq(connections.orgId, stockSnapshots.orgId),
        eq(connections.provider, "shopify"),
        eq(connections.externalId, stockSnapshots.externalAccountId)
      )
    )
    .where(and(eq(stockSnapshots.orgId, orgId), eq(stockSnapshots.source, "shopify")))
  return rows.map(({ stock }) => ({
    shopifyDomain: stock.externalAccountId,
    status: stock.status,
    snapshot: catalog.safeParse(stock.data).data ?? null
  }))
}
export function importedProductMatch(sku: string | null, catalogs: Awaited<ReturnType<typeof importedProductCatalog>>) {
  const matches = catalogs.flatMap(
    (c) =>
      c.snapshot?.rows
        .filter((r) => sku && r.buyerSku === sku)
        .map((r) => ({
          shopifyDomain: c.shopifyDomain,
          variantId: r.variantId,
          observedAt: c.snapshot?.observedAt ?? null,
          snapshotStatus: c.status
        })) ?? []
  )
  const unique = [...new Map(matches.map((r) => [JSON.stringify([r.shopifyDomain, r.variantId]), r])).values()]
  let status = "unmatched"
  if (!sku) {
    status = "missing_sku"
  } else if (unique.length > 1) {
    status = "ambiguous"
  } else if (unique.length) {
    status = "current_sku_candidate"
  }
  return {
    status,
    candidates: unique.slice(0, 20),
    candidateCount: unique.length,
    historicalMappingConfirmed: false,
    costBasis: "unknown"
  }
}
