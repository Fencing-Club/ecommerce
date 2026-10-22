import { and, eq } from "drizzle-orm"
import { db, type Transaction } from "@/db"
import { salesSyncs } from "@/db/schema"
import { connectedAccount, type Provider } from "./provider-accounts"

// The sales sync a background copy belongs to: one revision of one source's sync. With an account, also that account's
// connection, so a copy for a replaced or disconnected account can't publish.
export type SyncScope = { orgId: string; source: Provider; revision: number; externalAccountId?: string }
type Period = { from: Date; to: Date }

export function salesSyncScope({ orgId, source, revision, externalAccountId }: SyncScope) {
  return and(
    eq(salesSyncs.orgId, orgId),
    eq(salesSyncs.source, source),
    eq(salesSyncs.revision, revision),
    externalAccountId === undefined ? undefined : eq(salesSyncs.externalAccountId, externalAccountId)
  )
}

export class SyncSupersededError extends Error {
  constructor() {
    super("Sync superseded: its account was disconnected or a newer sync started")
  }
}

// Locks the sync, after its account's connection when the scope names one, for the rest of the transaction. A
// disconnect or a newer sync then waits for this write, or this write sees it and throws SyncSupersededError.
export async function lockSyncScope(tx: Transaction, scope: SyncScope, mode: "update" | "share" = "update") {
  if (scope.externalAccountId !== undefined) {
    const account = await connectedAccount(scope.orgId, scope.source, {
      executor: tx,
      externalId: scope.externalAccountId,
      lock: mode
    })
    if (!account) {
      throw new SyncSupersededError()
    }
  }
  const [sync] = await tx
    .select({ revision: salesSyncs.revision })
    .from(salesSyncs)
    .where(salesSyncScope(scope))
    .for(mode)
  if (!sync) {
    throw new SyncSupersededError()
  }
}

// The unbroken period stored so far, grown by a newly stored period.
export function extendCoverage(covered: Period | null, period: Period): Period {
  return covered
    ? {
        from: period.from < covered.from ? period.from : covered.from,
        to: period.to > covered.to ? period.to : covered.to
      }
    : period
}

type SalesSync = typeof salesSyncs.$inferSelect
// The sync's covered ranges besides its orders: the platform's money movements, and Amazon's daily FBA stock.
const coverages = {
  fees: {
    of: (sync: SalesSync) => ({ from: sync.feesCoveredFrom, to: sync.feesCoveredTo }),
    covered: (range: Period) => ({ feesCoveredFrom: range.from, feesCoveredTo: range.to, feesErrorCode: null }),
    failed: (errorCode: string) => ({ feesErrorCode: errorCode })
  },
  stock: {
    of: (sync: SalesSync) => ({ from: sync.stockCoveredFrom, to: sync.stockCoveredTo }),
    covered: (range: Period) => ({ stockCoveredFrom: range.from, stockCoveredTo: range.to, stockErrorCode: null }),
    failed: (errorCode: string) => ({ stockErrorCode: errorCode })
  }
}

// Copies a provider's history after the orders, period by period, into one of the sync's covered ranges. Each period
// replaces what's stored for it and extends the range in one transaction, so the range stays unbroken. A failure is
// logged and recorded on the sync without failing the order sync.
export async function syncCoveredPeriods<Row>(
  scope: SyncScope,
  assertOwned: () => Promise<void>,
  copy: {
    coverage: keyof typeof coverages
    // The periods to read, in order, and whether they start over instead of extending the stored range.
    plan: (stored: { from: Date | null; to: Date | null }) => { chunks: Period[]; fresh: boolean }
    read: (period: Period) => Promise<Row[]>
    replace: (tx: Transaction, period: Period, rows: Row[]) => Promise<void>
    failure: { event: string; errorCode: string }
  }
) {
  const coverage = coverages[copy.coverage]
  const [sync] = await db().select().from(salesSyncs).where(salesSyncScope(scope))
  if (!sync) {
    return
  }
  const stored = coverage.of(sync)
  const { chunks, fresh } = copy.plan(stored)
  let covered = fresh || !stored.from || !stored.to ? null : { from: stored.from, to: stored.to }
  try {
    for (const chunk of chunks) {
      const rows = await copy.read(chunk)
      await assertOwned()
      covered = extendCoverage(covered, chunk)
      const range = covered
      await db().transaction(async (tx) => {
        await lockSyncScope(tx, scope)
        await copy.replace(tx, chunk, rows)
        await tx.update(salesSyncs).set(coverage.covered(range)).where(salesSyncScope(scope))
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(JSON.stringify({ event: copy.failure.event, orgId: scope.orgId, error: message }))
    await db().update(salesSyncs).set(coverage.failed(copy.failure.errorCode)).where(salesSyncScope(scope))
  }
}
