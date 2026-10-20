import { sql } from "drizzle-orm"
import type { db } from "@/db"

// Historical purchase evidence remains usable after a variant leaves the current catalog.
export async function hasInventoryProduct(
  tx: Pick<ReturnType<typeof db>, "execute">,
  orgId: string,
  shopifyDomain: string,
  variantId: string
) {
  const result = await tx.execute(sql`
    select 1 from variant_fields where "orgId"=${orgId} and "shopifyDomain"=${shopifyDomain} and "variantId"=${variantId}
    union all select 1 from inventory_basis_records where "orgId"=${orgId} and "shopifyDomain"=${shopifyDomain}
      and "variantId"=${variantId} and "retiredAt" is null and kind='purchase'
    union all select 1 from stock_snapshots s where s."orgId"=${orgId} and s.source='shopify'
      and s."externalAccountId"=${shopifyDomain} and exists(
        select 1 from jsonb_array_elements(case when jsonb_typeof(s.data->'rows')='array'
          then s.data->'rows' else '[]'::jsonb end) r where r->>'variantId'=${variantId}) limit 1
  `)
  return result.rows.length > 0
}
