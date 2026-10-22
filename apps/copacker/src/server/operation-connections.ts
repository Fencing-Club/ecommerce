import {
  connectionSchema,
  connectionInventoryInput,
  inventoryLocationKey,
  type datasetStatusSchema
} from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import type { z } from "zod"
import { db, type Executor } from "@/db"
import { amazonAdsConnections, connections, organizations, salesSyncs, stockSnapshots } from "@/db/schema"
import { can, isAdmin } from "@/lib/access"
import { CliError } from "./cli-auth"
import { inventoryLocationEnabled } from "./inventory-connectors"
import { stockTargetContext } from "./stock-targets"
import type { Session } from "./workspace-session"
import { setExcludedShopifyTags } from "./workspace-settings"

type Dataset = z.infer<typeof datasetStatusSchema>

export async function connectionInventory(s: Session, id: string, executor: Executor = db()) {
  if (s.org.kind !== "buyer" || !isAdmin(s)) {
    throw new CliError("forbidden", "Only workspace owners and admins can configure connections.", 403)
  }
  const [account] = await executor
    .select({
      id: connections.id,
      provider: connections.provider,
      externalId: connections.externalId,
      revision: connections.revision,
      selected: connections.inventoryLocations
    })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.orgId, s.org.id)))
  if (!account) {
    throw new CliError("not_found", "Connection not found.", 404)
  }
  const context = await stockTargetContext(s.org.id, executor, true)
  return {
    connectionId: id,
    revision: account.revision,
    selected: account.selected,
    locations: context.locations
      .filter((location) => location.ref.provider === account.provider && location.ref.accountId === account.externalId)
      .map((location) => ({ ...location, enabled: inventoryLocationEnabled(account.selected, location.ref) }))
  }
}

export async function updateConnectionInventory(s: Session, raw: unknown, executor: Executor = db()) {
  const input = connectionInventoryInput.parse(raw)
  return executor.transaction(async (tx) => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
    await tx
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.id, input.id), eq(connections.orgId, s.org.id)))
      .for("update")
    const current = await connectionInventory(s, input.id, tx)
    if (current.revision !== input.expectedRevision) {
      throw new CliError("revision_conflict", "Read the connection again before changing its locations.", 409)
    }
    const keys = input.locations?.map(inventoryLocationKey) ?? []
    const supported = new Set(
      current.locations
        .filter((location) => location.role === "authoritative")
        .map((location) => inventoryLocationKey(location.ref))
    )
    if (new Set(keys).size !== keys.length || keys.some((key) => !supported.has(key))) {
      throw new CliError("invalid_location", "Select distinct inventory locations supported by this connection.", 409)
    }
    await tx
      .update(connections)
      .set({ inventoryLocations: input.locations })
      .where(and(eq(connections.id, input.id), eq(connections.orgId, s.org.id)))
    return connectionInventory(s, input.id, tx)
  })
}
const issue = (code: string, message: string) => ({ code, message, path: [] })
const iso = (date?: Date | null) => date?.toISOString() ?? null
function datasetState(
  status: "idle" | "queued" | "running" | "failed" | undefined,
  hasData: boolean
): Dataset["state"] {
  if (status && status !== "idle") {
    return status
  }
  return hasData ? "complete" : "not_started"
}
export async function operationConnections(s: Session) {
  const [accounts, ads, copies, stock] = await Promise.all([
    db()
      .select({
        id: connections.id,
        revision: connections.revision,
        provider: connections.provider,
        accountId: connections.externalId,
        scopes: connections.scopes
      })
      .from(connections)
      .where(eq(connections.orgId, s.org.id)),
    db()
      .select({
        id: amazonAdsConnections.id,
        revision: amazonAdsConnections.revision,
        accountId: amazonAdsConnections.sellerId
      })
      .from(amazonAdsConnections)
      .where(eq(amazonAdsConnections.orgId, s.org.id)),
    db().select().from(salesSyncs).where(eq(salesSyncs.orgId, s.org.id)),
    // Never load provider credentials or the large product snapshots to report their status.
    db()
      .select({
        source: stockSnapshots.source,
        accountId: stockSnapshots.externalAccountId,
        status: stockSnapshots.status,
        observed: stockSnapshots.attemptFinishedAt,
        snapshotId: stockSnapshots.snapshotId
      })
      .from(stockSnapshots)
      .where(eq(stockSnapshots.orgId, s.org.id))
  ])
  return [...accounts, ...ads.map((a) => ({ ...a, provider: "amazon_ads" as const, scopes: "" }))]
    .map((account) => {
      const datasets: Dataset[] = []
      const copy = copies.find((row) => row.source === account.provider && row.externalAccountId === account.accountId)
      if (can(s, "sales") && account.provider !== "amazon_ads") {
        datasets.push({
          name: "orders",
          state: datasetState(copy?.status, Boolean(copy?.coveredTo)),
          collectedWith: [],
          observedAt: iso(copy?.finishedAt),
          coveredFrom: iso(copy?.coveredFrom),
          coveredTo: iso(copy?.coveredTo),
          issues: copy?.errorCode ? [issue("sync_failed", "The last order sync did not complete.")] : []
        })
      }
      if (can(s, "products") && ["shopify", "amazon"].includes(account.provider)) {
        const rows = stock.filter(
          (row) =>
            row.accountId === account.accountId &&
            (account.provider === "shopify" ? row.source === "shopify" : row.source !== "shopify")
        )
        const active = (["failed", "running", "queued"] as const).find((status) =>
          rows.some((row) => row.status === status)
        )
        const state = datasetState(active, rows.length > 0 && rows.every((row) => Boolean(row.snapshotId)))
        const times = rows.flatMap((row) =>
          row.snapshotId && row.status === "idle" && row.observed ? [row.observed.getTime()] : []
        )
        const names = account.provider === "shopify" ? (["products", "inventory"] as const) : (["inventory"] as const)
        for (const name of names) {
          datasets.push({
            name,
            state,
            collectedWith: names.filter((other) => other !== name),
            observedAt:
              times.length === rows.length && times.length ? new Date(Math.min(...times)).toISOString() : null,
            coveredFrom: null,
            coveredTo: null,
            issues: state === "failed" ? [issue("sync_failed", "The last stock sync did not complete.")] : []
          })
        }
      }
      if (can(s, "overview") && can(s, "prices") && copy && account.provider !== "ebay") {
        datasets.push({
          name: "financial_transactions",
          state: datasetState(copy.feesErrorCode ? "failed" : copy.status, Boolean(copy.feesCoveredTo)),
          collectedWith: ["orders"],
          observedAt: iso(copy.finishedAt),
          coveredFrom: iso(copy.feesCoveredFrom),
          coveredTo: iso(copy.feesCoveredTo),
          issues: copy.feesErrorCode ? [issue("sync_failed", "The last financial sync did not complete.")] : []
        })
      }
      return connectionSchema.parse({
        id: account.id,
        revision: account.revision,
        provider: account.provider,
        accountId: account.accountId,
        name: account.accountId,
        state: "connected",
        grantedScopes: account.scopes.split(/[\s,]+/).filter(Boolean),
        capabilities: [
          "connection.show",
          ...(isAdmin(s)
            ? ["connection.settings.show", ...(account.provider === "shopify" ? ["connection.settings.update"] : [])]
            : [])
        ].map((operation) => ({ operation, available: true, reason: null })),
        datasets,
        issues: [
          issue(
            "authorization_unchecked",
            "A saved connection exists; this read does not check current provider authorization."
          )
        ]
      })
    })
    .sort((a, b) => `${a.provider}:${a.accountId}:${a.id}`.localeCompare(`${b.provider}:${b.accountId}:${b.id}`))
}
export async function connectionSettings(s: Session, id: string, executor: Executor = db()) {
  const [account] = await executor
    .select({ provider: connections.provider })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.orgId, s.org.id)))
  if (!account) {
    const [ads] = await executor
      .select({ id: amazonAdsConnections.id, revision: amazonAdsConnections.revision })
      .from(amazonAdsConnections)
      .where(and(eq(amazonAdsConnections.id, id), eq(amazonAdsConnections.orgId, s.org.id)))
    if (!ads) {
      throw new CliError("not_found", "Connection not found.", 404)
    }
    return { connectionId: id, revision: ads.revision, settings: { provider: "amazon_ads", editableFields: [] } }
  }
  const [org] = await executor.select().from(organizations).where(eq(organizations.id, s.org.id))
  if (!org) {
    throw new CliError("forbidden", "Workspace is unavailable.", 403)
  }
  return {
    connectionId: id,
    revision: org.settingsRevision,
    settings:
      account.provider === "shopify"
        ? { provider: "shopify", excludedOrderTags: org.excludedShopifyTags }
        : { provider: account.provider, editableFields: [] }
  }
}
export async function updateConnectionSettings(
  s: Session,
  input: { id: string; expectedRevision: number; settings: { excludedOrderTags: string[] } },
  executor: Executor
) {
  const [org] = await executor.select().from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  const [account] = await executor
    .select({ id: connections.id, provider: connections.provider })
    .from(connections)
    .where(and(eq(connections.id, input.id), eq(connections.orgId, s.org.id)))
    .for("share")
  if (!org || !account) {
    throw new CliError("not_found", "Connection not found.", 404)
  }
  if (account.provider !== "shopify") {
    throw new CliError("unsupported_field", "This connection has no editable settings.")
  }
  if (org.settingsRevision !== input.expectedRevision) {
    throw new CliError("revision_conflict", "Read the settings again before changing them.", 409)
  }
  await setExcludedShopifyTags(s.org.id, input.settings.excludedOrderTags, executor)
  return connectionSettings(s, input.id, executor)
}
