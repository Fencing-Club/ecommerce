import { randomUUID } from "node:crypto"
import { ProviderError } from "@repo/aisle/amazon"
import { ShopifyPermissionError, ShopifyRequestError } from "@repo/aisle/shopify"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, stockSnapshots } from "@/db/schema"
import type { Session } from "./auth"
import { amazonFor, shopifyFor } from "./connections"
import { ReconnectRequiredError } from "./errors"
import { isCollective } from "./inventory-products"
import { PollAgain } from "./job-handlers"
import { copyShopifyFields, fillStockRows } from "./product-fields"
import { recordStockDays } from "./stock-days"

export const stockSource = z.enum(["awd", "shopify", "fba"])
export const stockScopes = {
  fba: { provider: "amazon", scopeKey: "ATVPDKIKX0DER" },
  awd: { provider: "amazon", scopeKey: "us" },
  shopify: { provider: "shopify", scopeKey: "store" }
} as const

export type StockErrorCode = "shopify_permissions" | "reconnect" | "provider_unavailable" | "refresh_failed"

// What the person can do about a failed refresh: grant access, reconnect, wait, or retry.
export function stockErrorCode(error: unknown): StockErrorCode {
  if (error instanceof ShopifyPermissionError) {
    return "shopify_permissions"
  }
  const status = error instanceof ShopifyRequestError || error instanceof ProviderError ? error.status : null
  if (error instanceof ReconnectRequiredError || status === 401 || status === 403) {
    return "reconnect"
  }
  if (
    status === 429 ||
    (status !== null && status >= 500) ||
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
  ) {
    return "provider_unavailable"
  }
  return "refresh_failed"
}

// A loggable account of an error and its causes. Messages never carry tokens; response bodies are not included.
export function describeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { value: String(error).slice(0, 200) }
  }
  return {
    name: error.name,
    message: error.message.slice(0, 1000),
    ...(error instanceof ShopifyRequestError || error instanceof ProviderError ? { status: error.status } : {}),
    ...(error.cause !== undefined && depth < 3 ? { cause: describeError(error.cause, depth + 1) } : {})
  }
}

export const stockSelection = z
  .strictObject({
    source: stockSource,
    marketplaceId: z.literal("ATVPDKIKX0DER").optional()
  })
  .refine((input) => (input.source === "fba" ? input.marketplaceId !== undefined : input.marketplaceId === undefined), {
    message: "Select the US marketplace for FBA only"
  })

// Starts a stock refresh for one scope unless one is already waiting or running.
export async function refreshStock(
  org: Pick<Session["org"], "id" | "kind">,
  selection: z.infer<typeof stockSelection>
) {
  const { source } = stockSelection.parse(selection)
  const { provider, scopeKey } = stockScopes[source]
  if (org.kind !== "buyer") {
    throw new Error("A buyer workspace is required")
  }
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, org.id), eq(connections.provider, provider)))
      .for("update")
    if (!account) {
      return null
    }
    const scope = and(
      eq(stockSnapshots.orgId, org.id),
      eq(stockSnapshots.source, source),
      eq(stockSnapshots.externalAccountId, account.externalId),
      eq(stockSnapshots.scopeKey, scopeKey)
    )
    await tx
      .insert(stockSnapshots)
      .values({ orgId: org.id, source, externalAccountId: account.externalId, scopeKey })
      .onConflictDoNothing()
    const [current] = await tx.select().from(stockSnapshots).where(scope).for("update")
    if (!current) {
      throw new Error("Stock scope could not be created")
    }
    if (["queued", "running"].includes(current.status)) {
      return { id: current.id, revision: current.revision, status: current.status }
    }
    const revision = current.revision + 1
    await tx
      .update(stockSnapshots)
      .set({
        revision,
        status: "queued",
        requestedAt: new Date(),
        attemptStartedAt: null,
        attemptFinishedAt: null,
        workerToken: null,
        errorCode: null
      })
      .where(eq(stockSnapshots.id, current.id))
    await tx
      .insert(jobs)
      .values({ key: `stock:${current.id}:${revision}`, kind: "stock", payload: { id: current.id, revision } })
    return { id: current.id, revision, status: "queued" }
  })
}

const retryDelayMs = 5 * 60000
const retryAttempts = 12

export async function stockJob(
  payload: Record<string, unknown>,
  assertOwned: () => Promise<void>,
  attempt: { id: string; attempts: number }
) {
  const { id, revision } = z.object({ id: z.uuid(), revision: z.number().int().positive() }).parse(payload)
  await assertOwned()
  const workerToken = randomUUID()
  const jobOwned = and(eq(jobs.id, attempt.id), eq(jobs.attempts, attempt.attempts), eq(jobs.status, "running"))
  const claimed = await db().transaction(async (tx) => {
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(jobOwned).for("update")
    if (!job) {
      return null
    }
    const [row] = await tx
      .update(stockSnapshots)
      .set({ status: "running", attemptStartedAt: new Date(), workerToken })
      .where(
        and(
          eq(stockSnapshots.id, id),
          eq(stockSnapshots.revision, revision),
          inArray(stockSnapshots.status, ["queued", "running"])
        )
      )
      .returning()
    return row
  })
  if (!claimed) {
    return
  }
  const owned = and(
    eq(stockSnapshots.id, id),
    eq(stockSnapshots.revision, revision),
    eq(stockSnapshots.workerToken, workerToken),
    eq(stockSnapshots.status, "running")
  )
  try {
    const collect = async () => {
      if (claimed.source === "shopify") {
        const shopify = await shopifyFor(claimed.orgId, claimed.externalAccountId)
        const stock = await shopify.stock(assertOwned)
        // The supplier SKUs, stock targets, case quantities and suppliers Copacker keeps start as the store's
        // metafields, copied once. Shopify Collective items are a partner's, so their Supplier isn't one of the buyer's.
        await copyShopifyFields(claimed.orgId, claimed.externalAccountId, shopify, {
          assertActive: assertOwned,
          partnerVariants: new Set(stock.rows.filter(isCollective).map((row) => row.variantId))
        })
        return { ...stock, rows: await fillStockRows(claimed.orgId, claimed.externalAccountId, stock.rows) }
      }
      const amazon = await amazonFor(claimed.orgId, claimed.externalAccountId)
      return claimed.source === "fba" ? amazon.fbaStock(claimed.scopeKey, assertOwned) : amazon.awdStock(assertOwned)
    }
    const data = await collect()
    if (
      data.source !== claimed.source ||
      data.scopeKey !== claimed.scopeKey ||
      (data.source === "shopify" && data.shopifyDomain !== claimed.externalAccountId)
    ) {
      throw new Error("Stock response does not match the requested account")
    }
    await assertOwned()
    await db().transaction(async (tx) => {
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(jobOwned).for("update")
      if (!job) {
        return
      }
      const [account] = await tx
        .select()
        .from(connections)
        .where(
          and(eq(connections.orgId, claimed.orgId), eq(connections.provider, stockScopes[claimed.source].provider))
        )
        .for("update")
      if (!account || account.externalId !== claimed.externalAccountId) {
        throw new Error("Stock account changed")
      }
      await tx
        .update(stockSnapshots)
        .set({
          data,
          snapshotId: randomUUID(),
          status: "idle",
          attemptFinishedAt: new Date(),
          workerToken: null,
          errorCode: null
        })
        .where(owned)
    })
    // Daily history for restock's stockout days; the snapshot above is already saved, so a failure here is only logged.
    try {
      await recordStockDays(claimed.orgId, claimed.externalAccountId, data)
    } catch (error) {
      console.error(JSON.stringify({ event: "stock_days_failed", orgId: claimed.orgId, error: describeError(error) }))
    }
  } catch (error) {
    const errorCode = stockErrorCode(error)
    // A busy or briefly unavailable provider (such as Shopify throttling while orders sync) is tried again in a few
    // minutes, for up to an hour, rather than marking the refresh failed.
    if (errorCode === "provider_unavailable" && attempt.attempts < retryAttempts) {
      await db().update(stockSnapshots).set({ status: "queued", workerToken: null }).where(owned)
      throw new PollAgain(`${claimed.source} is busy; retrying the stock refresh in 5 minutes`, {
        delayMs: retryDelayMs
      })
    }
    console.error(
      JSON.stringify({
        event: "stock_refresh_failed",
        source: claimed.source,
        orgId: claimed.orgId,
        snapshotId: id,
        errorCode,
        error: describeError(error)
      })
    )
    await db().transaction(async (tx) => {
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(jobOwned).for("update")
      if (job) {
        await tx
          .update(stockSnapshots)
          .set({
            status: "failed",
            attemptFinishedAt: new Date(),
            workerToken: null,
            errorCode
          })
          .where(owned)
      }
    })
    const reason = error instanceof Error ? error.message.slice(0, 500) : "unknown error"
    throw new Error(`Stock refresh failed (${errorCode}): ${reason}. The previous complete snapshot was preserved`, {
      cause: error
    })
  }
}
