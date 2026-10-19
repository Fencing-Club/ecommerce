import { createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import type { db } from "@/db"
import { AnalyticsProblem } from "./analytics-contract"
// Fingerprint row versions in the same repeatable-read transaction as the page. A change invalidates continuation;
// it does not pretend to preserve a historical PostgreSQL snapshot across HTTP requests.
export async function analyticsSnapshot(
  tx: Pick<ReturnType<typeof db>, "execute">,
  orgId: string,
  input: { page: number; snapshot?: string },
  scope: string
) {
  if (input.page > 0 && !input.snapshot) {
    throw new AnalyticsProblem(400, "snapshot_required", "Continue with the snapshot returned by the first page.")
  }
  const tables = [
    "connections",
    "analytics_evidence",
    "analytics_feeds",
    "operating_costs",
    "analytics_cost_imports",
    "inventory_basis_records",
    "inventory_unit_mappings",
    "inventory_import_results",
    "inventory_import_cursors",
    "inventory_landed_charges",
    "amazon_product_mappings",
    "amazon_transactions",
    "shopify_balance_transactions",
    "stock_snapshots",
    "sales_syncs",
    "sales_orders",
    "amazon_fulfillment_shipments",
    "amazon_shipment_reports",
    "inventory_location_mappings",
    "amazon_returns",
    "amazon_reimbursements",
    "amazon_inventory_movements",
    "amazon_storage_fees",
    "amazon_removals",
    "amazon_return_reports",
    "amazon_reimbursement_reports",
    "amazon_movement_reports",
    "amazon_storage_fee_reports",
    "amazon_removal_reports"
  ]
  const parts = tables.map(
    (table) =>
      sql`select ${table} as name, coalesce(string_agg(version || ':' || count, ',' order by version), '') as versions from (select xmin::text as version, count(*)::text as count from ${sql.identifier(table)} where "orgId"=${orgId} group by xmin) versions`
  )
  parts.push(sql`select 'organization' as name, xmin::text as versions from organizations where id=${orgId}`)
  const result = await tx.execute(sql.join(parts, sql` union all `))
  const rows = z.array(z.object({ name: z.string(), versions: z.string() })).parse(result.rows)
  const snapshot = createHash("sha256")
    .update(JSON.stringify([orgId, scope, rows.sort((a, b) => a.name.localeCompare(b.name))]))
    .digest("hex")
  if (input.snapshot && input.snapshot !== snapshot) {
    throw new AnalyticsProblem(409, "snapshot_changed", "Data changed. Restart from the first page.")
  }
  return snapshot
}
