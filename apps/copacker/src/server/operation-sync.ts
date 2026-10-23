import { connectionOperations, datasetStatusSchema } from "@repo/copacker-contract"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { and, desc, eq, inArray } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { amazonAdsConnections, connections, connectionSyncRuns, jobs, salesSyncs } from "@/db/schema"
import { can, isAdmin } from "@/lib/access"
import { queueAdsSync } from "./amazon-ads"
import { CliError } from "./cli-auth"
import { operationConnections } from "./operation-connections"
import { requestSalesSync } from "./sales-orders"
import { refreshStock } from "./stock"
import type { Session } from "./workspace-session"

type Dataset = z.infer<typeof datasetStatusSchema>["name"]
const groups = {
  shopify: [
    ["products", "inventory"],
    ["orders", "financial_transactions"]
  ],
  amazon: [["inventory"], ["orders", "financial_transactions", "stock_history"]],
  ebay: [["orders"]],
  amazon_ads: [["ad_spend"]]
} satisfies Record<string, Dataset[][]>
function requireDatasets(s: Session, datasets: string[]) {
  if (isAdmin(s)) {
    return
  }
  for (const dataset of datasets) {
    let allowed = can(s, "products")
    if (dataset === "orders") {
      allowed = can(s, "sales")
    }
    if (["financial_transactions", "ad_spend"].includes(dataset)) {
      allowed = can(s, "overview") && can(s, "prices")
    }
    if (!allowed) {
      throw new CliError("forbidden", "Access to every dataset collected by this worker is required.", 403)
    }
  }
}
export async function startConnectionSync(
  s: Session,
  input: z.infer<(typeof connectionOperations)["connection.sync"]["input"]>
) {
  // Lock the exact account before invoking shared producers, which select their provider's current connection.
  const accounts = await db()
    .select({ id: connections.id, provider: connections.provider, accountId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.id, input.id)))
    .for("update")
  const account = accounts.at(0)
  const adsRows = account
    ? []
    : await db()
        .select({ id: amazonAdsConnections.id, accountId: amazonAdsConnections.sellerId })
        .from(amazonAdsConnections)
        .where(and(eq(amazonAdsConnections.orgId, s.org.id), eq(amazonAdsConnections.id, input.id)))
        .for("update")
  const ads = adsRows.at(0)
  const provider = account?.provider ?? (ads ? "amazon_ads" : null)
  const accountId = account?.accountId ?? ads?.accountId
  if (!provider || !accountId) {
    throw new CliError("not_found", "Connection not found.", 404)
  }
  const selected = groups[provider].filter(
    (group) => input.dataset === "all" || group.some((name) => name === input.dataset)
  )
  if (!selected.length) {
    throw new CliError("unsupported_dataset", "This connection cannot sync that dataset.", 409)
  }
  const datasets = selected.flat()
  requireDatasets(s, datasets)
  const jobIds: string[] = []
  if (provider === "amazon_ads") {
    jobIds.push(...(await queueAdsSync(s.org.id)))
  } else {
    if (datasets.includes("orders")) {
      await requestSalesSync(s.org, provider)
      const [sync] = await db()
        .select()
        .from(salesSyncs)
        .where(and(eq(salesSyncs.orgId, s.org.id), eq(salesSyncs.source, provider)))
      if (!sync) {
        throw new Error("Queued sync is missing")
      }
      const [job] = await db()
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.key, `sales:${s.org.id}:${provider}:${sync.revision}`))
      if (!job) {
        throw new Error("Queued sales job is missing")
      }
      jobIds.push(job.id)
    }
    if (datasets.includes("inventory")) {
      const selections =
        provider === "shopify"
          ? [{ source: "shopify" as const }]
          : [{ source: "fba" as const, marketplaceId: usMarketplaceId } as const, { source: "awd" as const }]
      for (const selection of selections) {
        const result = await refreshStock(s.org, selection)
        if (!result) {
          throw new CliError("connection_changed", "The connection changed. Read it again.", 409)
        }
        const [job] = await db()
          .select({ id: jobs.id })
          .from(jobs)
          .where(eq(jobs.key, `stock:${result.id}:${result.revision}`))
        if (!job) {
          throw new Error("Queued stock job is missing")
        }
        jobIds.push(job.id)
      }
    }
  }
  if (!jobIds.length) {
    throw new CliError("sync_unavailable", "No eligible ingestion work is available for this connection.", 409)
  }
  const [run] = await db()
    .insert(connectionSyncRuns)
    .values({ orgId: s.org.id, connectionId: input.id, accountId, requestedDatasets: datasets, jobIds })
    .returning()
  return readConnectionSync(s, { id: input.id, runId: run!.id })
}
export async function readConnectionSync(
  s: Session,
  input: z.infer<(typeof connectionOperations)["connection.sync.show"]["input"]>
) {
  if (input.runId && input.operationId && input.runId !== input.operationId) {
    throw new CliError("invalid_input", "Select one sync run.")
  }
  const id = input.runId ?? input.operationId
  const [run] = await db()
    .select()
    .from(connectionSyncRuns)
    .where(
      and(
        eq(connectionSyncRuns.orgId, s.org.id),
        eq(connectionSyncRuns.connectionId, input.id),
        id ? eq(connectionSyncRuns.id, id) : undefined
      )
    )
    .orderBy(desc(connectionSyncRuns.createdAt), desc(connectionSyncRuns.id))
    .limit(1)
  if (!run) {
    throw new CliError("not_found", "Sync run not found.", 404)
  }
  requireDatasets(s, run.requestedDatasets)
  const account = (await operationConnections(s)).find((row) => row.id === input.id && row.accountId === run.accountId)
  if (!account) {
    throw new CliError("connection_changed", "This run belongs to a disconnected or replaced account.", 409)
  }
  const work = await db().select({ id: jobs.id, status: jobs.status }).from(jobs).where(inArray(jobs.id, run.jobIds))
  const missing = work.length !== run.jobIds.length
  const failed = work.some((job) => job.status === "failed" || job.status === "cancelled")
  const running = work.some((job) => job.status === "running")
  const pending = work.some((job) => job.status === "pending")
  let status = "succeeded"
  if (failed) {
    status = "failed"
  }
  if (pending) {
    status = "queued"
  }
  if (running) {
    status = "running"
  }
  if (missing) {
    status = "needs_attention"
  }
  return {
    connectionId: input.id,
    runId: run.id,
    requestedDatasets: run.requestedDatasets,
    // Coverage is the current stored dataset, not a fabricated snapshot of an older run.
    datasets: account.datasets.filter((dataset) => run.requestedDatasets.includes(dataset.name)),
    operation: {
      id: run.id,
      name: "connection.sync",
      status,
      stage: "ingestion",
      startedAt: run.createdAt.toISOString(),
      completedAt: null,
      error:
        missing || failed
          ? {
              code: missing ? "sync_evidence_missing" : "sync_failed",
              message: missing
                ? "Some run records are no longer available; completion cannot be verified."
                : "An ingestion worker failed. Inspect current coverage before starting another sync.",
              retryable: false,
              issues: [],
              recovery: null,
              details: {}
            }
          : null,
      recovery: null
    },
    statusQuery: { operation: "connection.sync.show", input: { id: input.id, runId: run.id } }
  }
}
export async function workspaceSyncStatus(s: Session) {
  const accounts = await operationConnections(s)
  return {
    connections: accounts,
    attention: accounts.flatMap((account) =>
      account.datasets
        .filter((dataset) => dataset.state === "failed" || dataset.state === "not_started")
        .map((dataset) => ({
          connectionId: account.id,
          dataset: dataset.name,
          issues: dataset.issues.length
            ? dataset.issues
            : [{ code: "not_started", message: "This dataset has not been collected.", path: [] }]
        }))
    )
  }
}
