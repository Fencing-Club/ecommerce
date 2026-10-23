import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { grantedScopes } from "@repo/copacker-marketplaces/shopify-auth"
import { collectShopifyEconomics } from "@repo/copacker-marketplaces/shopify-economics"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  analyticsEvidence,
  analyticsFeeds,
  amazonInventoryMovements,
  amazonMovementReports,
  amazonReimbursements,
  amazonReimbursementReports,
  jobs,
  shopifyBalanceTransactions
} from "@/db/schema"
import { amazonMonthlyReports } from "./amazon-monthly-reports"
import { reimbursementFamily } from "./amazon-reconciliation-data"
import { reimbursementAccounting } from "./amazon-reimbursement-accounting"
import { amazonFor, shopifyFor } from "./connections"
import { recoveryDue, recoveryWindows, type RecoveryState } from "./evidence-recovery-plan"
import { withJobWake } from "./job-delivery"
import { jobRow, type JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { connectedAccount } from "./provider-accounts"
import { reconcileReceiptMovements } from "./receipt-movement-reconciliation"
import { receiptQuantities } from "./receipt-quantities"
import { lockSyncScope } from "./sales-sync-coverage"
import { reconcileShopifyPayments } from "./shopify-payment-reconciliation"

type Input = JobInput<"evidence-recovery">
type Target = { id: string; kind: "order" | "original" | "receipt"; reference: string; anchor: string | null }
const day = 86400000
const dataset = (id: string) => `recovery:${id}`
function feedScope(input: Input, name: string) {
  return and(
    eq(analyticsFeeds.orgId, input.orgId),
    eq(analyticsFeeds.source, input.source),
    eq(analyticsFeeds.externalAccountId, input.externalAccountId),
    eq(analyticsFeeds.dataset, name)
  )
}
function evidenceScope(input: Input, name: string) {
  return and(
    eq(analyticsEvidence.orgId, input.orgId),
    eq(analyticsEvidence.source, input.source),
    eq(analyticsEvidence.externalAccountId, input.externalAccountId),
    eq(analyticsEvidence.dataset, name)
  )
}

function savedTarget(name: string, anchor: string | null): Target | null {
  for (const kind of ["order", "original", "receipt"] as const) {
    const prefix = `recovery:${kind}:`
    if (name.startsWith(prefix)) {
      const reference = name.slice(prefix.length)
      return { id: `${kind}:${reference}`, kind, reference, anchor }
    }
  }
  return null
}

async function resolved(input: Input, target: Target) {
  if (target.kind === "original") {
    const [row] = await db()
      .select({ id: amazonReimbursements.id })
      .from(amazonReimbursements)
      .where(
        and(
          eq(amazonReimbursements.orgId, input.orgId),
          eq(amazonReimbursements.externalAccountId, input.externalAccountId),
          eq(amazonReimbursements.marketplaceId, usMarketplaceId),
          eq(amazonReimbursements.reimbursementId, target.reference)
        )
      )
      .limit(1)
    return Boolean(row)
  }
  const [row] = await db()
    .select()
    .from(analyticsEvidence)
    .where(
      and(
        evidenceScope(input, target.kind === "order" ? "order_economics" : "fba_inbound_receipts"),
        eq(analyticsEvidence.sourceId, target.reference)
      )
    )
  if (!row) {
    return false
  }
  if (target.kind === "order") {
    const comparison = reconcileShopifyPayments(row.data)
    return (
      !comparison.blockers.includes("missing_order_transactions") &&
      !comparison.blockers.includes("missing_refunds") &&
      !comparison.transactions.some((payment) => payment.parentAvailable === false)
    )
  }
  const quantities = receiptQuantities("fba_inbound_receipts", row.data, [])
  if (
    !quantities?.rows.length ||
    quantities.rows.some((item) => item.received === null || item.status === "duplicate_sku")
  ) {
    return false
  }
  return !(await targets(input, target)).length
}

export async function queueEvidenceRecovery(input: Input) {
  await withJobWake(
    db()
      .insert(jobs)
      .values(jobRow("evidence-recovery", `evidence-recovery:${input.source}:${input.orgId}:${input.revision}`, input))
      .onConflictDoNothing()
  )
}

// Re-evaluate the saved evidence, including after each import. These are reference/quantity
// checks, not permission to recognize income, inventory cost or a loss.
async function targets(input: Input, only?: Target): Promise<Target[]> {
  if (input.source === "shopify") {
    const ids = new Set<string>()
    const balances = await db()
      .selectDistinct({ id: shopifyBalanceTransactions.orderId })
      .from(shopifyBalanceTransactions)
      .where(
        and(
          eq(shopifyBalanceTransactions.orgId, input.orgId),
          eq(shopifyBalanceTransactions.externalAccountId, input.externalAccountId),
          isNotNull(shopifyBalanceTransactions.orderId),
          only ? eq(shopifyBalanceTransactions.orderId, only.reference) : undefined,
          sql`not exists (select 1 from ${analyticsEvidence} where ${analyticsEvidence.orgId}=${input.orgId} and ${analyticsEvidence.source}='shopify' and ${analyticsEvidence.externalAccountId}=${input.externalAccountId} and ${analyticsEvidence.dataset}='order_economics' and ${analyticsEvidence.sourceId}=${shopifyBalanceTransactions.orderId})`
        )
      )
    for (const row of balances) {
      if (row.id) {
        ids.add(row.id)
      }
    }
    // Page source documents to keep memory bounded for larger stores.
    for (let offset = 0; ; offset += 100) {
      const evidence = await db()
        .select()
        .from(analyticsEvidence)
        .where(
          and(
            evidenceScope(input, "order_economics"),
            only ? eq(analyticsEvidence.sourceId, only.reference) : undefined
          )
        )
        .orderBy(analyticsEvidence.sourceId)
        .limit(100)
        .offset(offset)
      for (const row of evidence) {
        if (reconcileShopifyPayments(row.data).transactions.some((payment) => payment.parentAvailable === false)) {
          ids.add(row.sourceId)
        }
      }
      if (evidence.length < 100) {
        break
      }
    }
    return [...ids].sort().map((reference) => ({ id: `order:${reference}`, kind: "order", reference, anchor: null }))
  }
  const account = { orgId: input.orgId, externalAccountId: input.externalAccountId, marketplaceId: usMarketplaceId }
  const reimbursements =
    only?.kind === "receipt"
      ? []
      : await db()
          .select()
          .from(amazonReimbursements)
          .where(
            and(
              eq(amazonReimbursements.orgId, account.orgId),
              eq(amazonReimbursements.externalAccountId, account.externalAccountId),
              eq(amazonReimbursements.marketplaceId, account.marketplaceId)
            )
          )
  const ids = new Set(reimbursements.map((row) => row.reimbursementId))
  const missing = new Map<string, Target>()
  for (const row of reimbursements) {
    if (row.originalReimbursementId && !ids.has(row.originalReimbursementId)) {
      const id = `original:${row.originalReimbursementId}`
      const anchor = row.approvedAt.toISOString()
      const prior = missing.get(id)
      if (!prior?.anchor || anchor < prior.anchor) {
        missing.set(id, { id, kind: "original", reference: row.originalReimbursementId, anchor })
      }
    }
  }
  if (only?.kind === "original") {
    return [...missing.values()].filter((row) => row.id === only.id)
  }
  const receipts = await db()
    .select()
    .from(analyticsEvidence)
    .where(
      and(
        evidenceScope(input, "fba_inbound_receipts"),
        only ? eq(analyticsEvidence.sourceId, only.reference) : undefined
      )
    )
  for (const receipt of receipts) {
    const quantities = receiptQuantities(receipt.dataset, receipt.data, [])
    if (quantities?.reviewState !== "closed_quantity_review") {
      continue
    }
    const movements = await db()
      .select()
      .from(amazonInventoryMovements)
      .where(
        and(
          eq(amazonInventoryMovements.orgId, input.orgId),
          eq(amazonInventoryMovements.externalAccountId, input.externalAccountId),
          eq(amazonInventoryMovements.marketplaceId, usMarketplaceId),
          eq(amazonInventoryMovements.referenceId, receipt.sourceId),
          eq(amazonInventoryMovements.eventType, "Receipts")
        )
      )
      .orderBy(amazonInventoryMovements.eventDay)
      .limit(5001)
    const comparison = reconcileReceiptMovements(
      receipt.dataset,
      receipt.sourceId,
      quantities,
      movements.slice(0, 5000),
      movements.length > 5000
    )
    if (
      comparison?.rows.some(
        (row) => row.received !== null && row.received > 0 && row.observationStatus !== "quantity_agrees"
      )
    ) {
      const id = `receipt:${receipt.sourceId}`
      missing.set(id, { id, kind: "receipt", reference: receipt.sourceId, anchor: movements[0]?.eventDay ?? null })
    }
  }
  return [...missing.values()].filter((row) => !only || row.id === only.id).sort((a, b) => a.id.localeCompare(b.id))
}

// Claim before network access. The sync lock serializes concurrent claims, while the
// per-account daily budget also applies to manual syncs/new revisions.
async function claim(input: Input, target: Target, now: Date) {
  return db().transaction(async (tx) => {
    await lockSyncScope(tx, input)
    const [row] = await tx
      .select()
      .from(analyticsFeeds)
      .where(feedScope(input, dataset(target.id)))
    const prior = row?.state.recovery
    const limit = input.source === "amazon" ? 6 : 3
    if (!recoveryDue(prior, now, limit)) {
      return { kind: "not_due" as const }
    }
    const [budget] = await tx.select().from(analyticsFeeds).where(feedScope(input, "recovery:budget"))
    const used =
      budget?.checkedAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
        ? (budget.state.recovery?.attempts ?? 0)
        : 0
    if (used >= (input.source === "amazon" ? 1 : 5)) {
      return { kind: "budget" as const }
    }
    const state: RecoveryState = {
      attempts: prior?.attempts ?? 0,
      status: "pending",
      nextAttemptAt: new Date(now.getTime() + day).toISOString(),
      anchor: prior?.anchor ?? target.anchor,
      searched: prior?.searched ?? [],
      outcome: "claimed"
    }
    let window: { from: Date; to: Date } | undefined
    if (target.kind !== "order") {
      if (!state.anchor) {
        state.status = "exhausted"
        state.outcome = "dated_reference_required"
      } else {
        const reports = target.kind === "receipt" ? amazonMovementReports : amazonReimbursementReports
        const coverage = await tx
          .select()
          .from(reports)
          .where(
            and(
              eq(reports.orgId, input.orgId),
              eq(reports.externalAccountId, input.externalAccountId),
              eq(reports.marketplaceId, usMarketplaceId)
            )
          )
        window = recoveryWindows(state.anchor, now, target.kind === "receipt").find(
          (candidate) =>
            !state.searched.includes(candidate.from.toISOString()) &&
            !coverage.some(
              (row) =>
                row.from.getTime() === candidate.from.getTime() &&
                ((row.coveredTo && row.coveredTo >= candidate.to) ||
                  (row.status === "unavailable" && row.checkedAt.getTime() > now.getTime() - 30 * day))
            )
        )
        if (!window) {
          state.status = "exhausted"
          state.outcome = "bounded_search_exhausted"
        }
      }
    }
    const writes: [string, RecoveryState][] = [[dataset(target.id), state]]
    if (state.status !== "exhausted") {
      state.attempts++
      writes.push(["recovery:budget", { ...state, attempts: used + 1 }])
    }
    for (const [name, recovery] of writes) {
      await tx
        .insert(analyticsFeeds)
        .values({
          orgId: input.orgId,
          source: input.source,
          externalAccountId: input.externalAccountId,
          dataset: name,
          state: { recovery },
          checkedAt: now
        })
        .onConflictDoUpdate({
          target: [
            analyticsFeeds.orgId,
            analyticsFeeds.source,
            analyticsFeeds.externalAccountId,
            analyticsFeeds.dataset
          ],
          set: { state: { recovery }, checkedAt: now }
        })
    }
    return state.status === "exhausted" ? { kind: "blocked" as const } : { kind: "claimed" as const, state, window }
  })
}

export async function evidenceRecoveryJob(input: Input, { assertOwned }: Pick<JobContext, "assertOwned">) {
  await assertOwned()
  const account = await connectedAccount(input.orgId, input.source, { externalId: input.externalAccountId })
  if (!account) {
    return
  }
  const now = new Date()
  const pending = await targets(input)
  // Keep the original reference even if a later report no longer contains the reversal
  // that first named it. Disappearance of the trigger is not proof of recovery.
  const saved = await db()
    .select()
    .from(analyticsFeeds)
    .where(
      and(
        eq(analyticsFeeds.orgId, input.orgId),
        eq(analyticsFeeds.source, input.source),
        eq(analyticsFeeds.externalAccountId, input.externalAccountId),
        sql`${analyticsFeeds.dataset} like 'recovery:%'`
      )
    )
  for (const row of saved) {
    const recovery = row.state.recovery
    const target = savedTarget(row.dataset, recovery?.anchor ?? null)
    if (!recovery || !target) {
      continue
    }
    const found = await resolved(input, target)
    if (!found && !pending.some((candidate) => candidate.id === target.id)) {
      pending.push(target)
    }
    let status = recovery.status
    if (found) {
      status = "resolved"
    } else if (recovery.attempts >= (input.source === "amazon" ? 6 : 3)) {
      status = "exhausted"
    } else if (recovery.status === "resolved") {
      status = "unresolved"
    }
    const newlyDated =
      recovery.outcome === "dated_reference_required" && !recovery.anchor
        ? pending.find((candidate) => candidate.id === target.id)?.anchor
        : null
    if (newlyDated && !found) {
      status = "unresolved"
    }
    if (status === recovery.status && !newlyDated) {
      continue
    }
    await db().transaction(async (tx) => {
      await lockSyncScope(tx, input)
      await tx
        .update(analyticsFeeds)
        .set({
          state: {
            recovery: {
              ...recovery,
              anchor: newlyDated ?? recovery.anchor,
              status,
              outcome: found ? "saved_reference_check_passed" : recovery.outcome
            }
          },
          checkedAt: now
        })
        .where(feedScope(input, row.dataset))
    })
  }
  for (const target of pending) {
    await assertOwned()
    const claimed = await claim(input, target, now)
    if (claimed.kind === "budget") {
      break
    }
    if (claimed.kind !== "claimed") {
      continue
    }
    const { state, window } = claimed
    let data: Record<string, unknown> | undefined
    try {
      if (target.kind === "order") {
        const scopes = grantedScopes(account.scopes)
        data = await collectShopifyEconomics(
          await shopifyFor(input.orgId, input.externalAccountId),
          target.reference,
          scopes.has("read_returns") || scopes.has("write_returns"),
          assertOwned,
          { recoverParents: true }
        )
        state.outcome = "order_refreshed"
      } else if (window) {
        const report =
          target.kind === "receipt" ? amazonMonthlyReports.inventoryMovements : amazonMonthlyReports.reimbursements
        const result = await report.recover(
          { ...input, amazon: await amazonFor(input.orgId, input.externalAccountId) },
          assertOwned,
          window
        )
        state.outcome = result?.errorCode ?? result?.status ?? "request_not_completed"
        if (result?.status === "imported" || result?.status === "unavailable") {
          state.searched.push(window.from.toISOString())
        }
      }
    } catch {
      state.outcome = "lookup_failed"
    }
    // Publishing a point lookup must not advance the normal order discovery cursor.
    await assertOwned()
    await db().transaction(async (tx) => {
      await lockSyncScope(tx, input)
      if (data) {
        await tx
          .insert(analyticsEvidence)
          .values({
            orgId: input.orgId,
            source: input.source,
            externalAccountId: input.externalAccountId,
            dataset: "order_economics",
            sourceId: target.reference,
            data,
            observedAt: new Date()
          })
          .onConflictDoUpdate({
            target: [
              analyticsEvidence.orgId,
              analyticsEvidence.source,
              analyticsEvidence.externalAccountId,
              analyticsEvidence.dataset,
              analyticsEvidence.sourceId
            ],
            set: { data, observedAt: new Date() }
          })
      }
    })
    if (await resolved(input, target)) {
      state.status = "resolved"
      state.outcome = "saved_reference_check_passed"
    } else if (state.status !== "exhausted") {
      state.status = state.attempts >= (input.source === "amazon" ? 6 : 3) ? "exhausted" : "unresolved"
    }
    if (target.kind === "original") {
      const family = await reimbursementFamily(
        db(),
        input.orgId,
        input.externalAccountId,
        usMarketplaceId,
        [target.reference],
        []
      )
      const blockers = new Set(
        family.rows.flatMap((row) => reimbursementAccounting(row, family.rows, family.truncated).blockers)
      )
      if (!family.rows.some((row) => row.id === target.reference)) {
        blockers.add("missing_original")
      }
      state.reconciliation = { checkedAt: new Date().toISOString(), blockers: [...blockers].sort() }
    }
    await db().transaction(async (tx) => {
      await lockSyncScope(tx, input)
      await tx
        .update(analyticsFeeds)
        .set({ state: { recovery: state }, checkedAt: new Date() })
        .where(feedScope(input, dataset(target.id)))
    })
  }
}
