import { createHash } from "node:crypto"
import { getTableName, sql } from "drizzle-orm"
import { z } from "zod"
import { db, type Executor, type Transaction } from "@/db"
import {
  amazonInboundShipments,
  amazonFulfillmentShipments,
  amazonInventoryMovements,
  amazonMovementReports,
  amazonProductMappings,
  amazonReimbursementReports,
  amazonReimbursements,
  amazonRemovalReports,
  amazonRemovals,
  amazonReturnReports,
  amazonReturns,
  amazonShipmentReports,
  amazonStorageFeeReports,
  amazonStorageFees,
  amazonTransactions,
  analyticsCostImports,
  analyticsEvidence,
  analyticsFeeds,
  connections,
  inventoryBasisRecords,
  inventoryImportCursors,
  inventoryImportResults,
  inventoryLandedCharges,
  inventoryLocationMappings,
  inventoryUnitMappings,
  operatingCosts,
  salesOrders,
  salesSyncs,
  shopifyBalanceTransactions,
  stockSnapshots
} from "@/db/schema"
import { AnalyticsProblem } from "./analytics-contract"

// Every table an analytics page reads from, so a change to any of them invalidates its snapshot.
const versioned = [
  connections,
  analyticsEvidence,
  analyticsFeeds,
  operatingCosts,
  analyticsCostImports,
  inventoryBasisRecords,
  inventoryUnitMappings,
  inventoryImportResults,
  inventoryImportCursors,
  inventoryLandedCharges,
  amazonProductMappings,
  amazonTransactions,
  shopifyBalanceTransactions,
  stockSnapshots,
  salesSyncs,
  salesOrders,
  amazonInboundShipments,
  amazonFulfillmentShipments,
  amazonShipmentReports,
  inventoryLocationMappings,
  amazonReturns,
  amazonReimbursements,
  amazonInventoryMovements,
  amazonStorageFees,
  amazonRemovals,
  amazonReturnReports,
  amazonReimbursementReports,
  amazonMovementReports,
  amazonStorageFeeReports,
  amazonRemovalReports
]

// Fingerprint row versions in the same repeatable-read transaction as the page. A change invalidates continuation;
// it does not pretend to preserve a historical PostgreSQL snapshot across HTTP requests.
export async function analyticsSnapshot(
  tx: Executor,
  orgId: string,
  input: { page: number; snapshot?: string },
  scope: string
) {
  if (input.page > 0 && !input.snapshot) {
    throw new AnalyticsProblem(400, "snapshot_required", "Continue with the snapshot returned by the first page.")
  }
  const parts = versioned.map(
    (table) =>
      sql`select ${getTableName(table)} as name, coalesce(string_agg(version || ':' || count, ',' order by version), '') as versions from (select xmin::text as version, count(*)::text as count from ${table} where ${table.orgId}=${orgId} group by xmin) versions`
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

// One page of an analytics list: a read-only, repeatable-read transaction whose snapshot comes first, so every read
// in `read` sees the data the snapshot fingerprints.
export function analyticsPage<T>(
  orgId: string,
  input: { page: number; snapshot?: string },
  scope: string,
  read: (tx: Transaction, snapshot: string) => Promise<T>
) {
  return db().transaction(async (tx) => read(tx, await analyticsSnapshot(tx, orgId, input, scope)), {
    isolationLevel: "repeatable read",
    accessMode: "read only"
  })
}
