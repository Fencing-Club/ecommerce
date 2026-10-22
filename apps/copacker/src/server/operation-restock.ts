import { randomUUID } from "node:crypto"
import { jsonObject, metaSchema, restockOperations, type restockSelectionSchema } from "@repo/copacker-contract"
import { and, eq, lt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, restockReports } from "@/db/schema"
import { can } from "@/lib/access"
import { casePackSchema } from "@/lib/case-packs"
import { CliError } from "./cli-auth"
import { restockAllChannels, restockChannels, type RestockChannelOption } from "./restock-page"
import { restockPriceFields, restockWithoutPrices } from "./restock-plan"
import { restockSettings } from "./restock-report"
import type { Session } from "./workspace-session"

export const restockDefinitions = restockOperations(casePackSchema)
type Account = { id: string; provider: string }
function channel(option: RestockChannelOption, accounts: Account[]) {
  return {
    id: option.key,
    name: option.label,
    kind: option.channel.kind === "amazon" ? "amazon" : "warehouse",
    connectionId: accounts.find((account) => account.provider === option.channel.kind)?.id ?? null,
    locationId: option.channel.kind === "shopify" ? option.channel.locationId : null,
    eligible: true,
    issues: []
  }
}
export async function operationRestockChannels(s: Session) {
  const [options, accounts] = await Promise.all([
    restockChannels(s.org.id),
    db()
      .select({ id: connections.id, provider: connections.provider })
      .from(connections)
      .where(eq(connections.orgId, s.org.id))
  ])
  return { items: options.map((option) => channel(option, accounts)) }
}

const reportMeta = metaSchema.pick({ completeness: true, sources: true, warnings: true, redactedFields: true })
const issue = (code: string, message: string) => ({ code, message, path: [] })
function sourceAvailability(source: Awaited<ReturnType<typeof restockAllChannels>>["sources"][number]) {
  if (source.error) {
    return "unavailable"
  }
  return Object.keys(source.gapReasons).length ? "partial" : "available"
}

export async function operationRestockReport(s: Session, input: z.infer<typeof restockSelectionSchema>) {
  const defaults = restockSettings(s.org)
  const settings = { days: input.days ?? defaults.days, leadTimeDays: input.leadTimeDays ?? defaults.leadTimeDays }
  const result = await restockAllChannels(s.org.id, settings.days, settings.leadTimeDays)
  const evidence = result.evidence
  const catalogAccount = evidence.connections.find((account) => account.provider === "shopify")
  if (!evidence.catalogAvailable || !catalogAccount) {
    throw new CliError(
      "source_unavailable",
      "Sync the Shopify product and inventory catalog before requesting restock.",
      409
    )
  }
  if (input.channelIds?.some((id) => !result.channels.some((option) => option.key === id))) {
    throw new CliError("invalid_input", "A selected channel is not eligible in this workspace.")
  }
  if (input.supplierId && !evidence.suppliers.some((supplier) => supplier.id === input.supplierId)) {
    throw new CliError("not_found", "Supplier not found in this workspace.", 404)
  }
  const selected = result.channels.filter((option) => !input.channelIds || input.channelIds.includes(option.key))
  if (!selected.length) {
    throw new CliError(
      "source_unavailable",
      "No eligible restock channels. Sync stock and classify warehouse locations first.",
      409
    )
  }
  const amazon = selected.some((option) => option.channel.kind === "amazon")
  const warehouse = selected.some((option) => option.channel.kind === "shopify")
  const ebay = selected.some(
    (option) => option.channel.kind === "shopify" && option.channel.locationId === result.ebayLocationId
  )
  const sources = result.sources.filter((source) => {
    if (source.source === "amazon") {
      return amazon
    }
    if (source.source === "shopify") {
      return warehouse
    }
    return ebay || (warehouse && !result.ebayLocationId)
  })
  const snapshots = evidence.snapshots.filter((snapshot) => snapshot.source === "shopify" || amazon)
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.accountId !==
        evidence.connections.find(
          (account) => account.provider === (snapshot.source === "shopify" ? "shopify" : "amazon")
        )?.accountId
    )
  ) {
    throw new CliError(
      "source_changed",
      "A provider connection changed while reading stock. Request a new report.",
      409
    )
  }
  const missingPools = amazon
    ? ["fba", "awd"].filter((pool) => !snapshots.some((snapshot) => snapshot.source === pool && snapshot.available))
    : []
  const prices = can(s, "prices")
  const defaultLeadTimeOrigin = input.leadTimeDays === undefined ? "workspace" : "request"
  const rows = selected.flatMap((option) =>
    option.lines
      .filter(
        (line) =>
          (!input.supplierId || line.supplier?.id === input.supplierId) &&
          (!input.status || line.status === input.status) &&
          (input.sku === undefined || line.sku === input.sku)
      )
      .map((line) => ({
        ...(prices ? line : restockWithoutPrices(line)),
        rowId: randomUUID(),
        channelId: option.key,
        source: {
          provider: "shopify",
          connectionId: catalogAccount.id,
          accountId: catalogAccount.accountId,
          variantId: line.variantId,
          productId: line.productId
        },
        explanation: {
          rawNeed: line.need,
          leadTimeOrigin:
            (evidence.suppliers.find((supplier) => supplier.id === line.supplier?.id)?.leadTimeDays ?? null) !== null
              ? "supplier"
              : defaultLeadTimeOrigin,
          inventorySnapshotIds: snapshots
            .filter((snapshot) => option.channel.kind === "amazon" || snapshot.source === "shopify")
            .flatMap((snapshot) => (snapshot.snapshotId ? [snapshot.snapshotId] : [])),
          openPoIds: (evidence.onOrder.get(line.variantId) ?? [])
            .filter((order) =>
              option.channel.kind === "amazon"
                ? order.destination === "amazon"
                : order.locationIds.includes(option.channel.locationId)
            )
            .map((order) => order.id),
          issues: [
            ...line.blocked.map((code) => issue(code, "The shared restock planner could not verify this input.")),
            ...(!line.supplier
              ? [
                  issue(
                    line.externalSupplier ? "external_supplier" : "supplier_missing",
                    "Assign a Copacker supplier before creating a purchase order."
                  )
                ]
              : [])
          ]
        }
      }))
  )
  // Never silently truncate a report; callers can narrow the selection instead.
  if (rows.length > 10000) {
    throw new CliError(
      "result_too_large",
      "Select fewer channels, a supplier, or an exact SKU (maximum 10,000 rows).",
      413
    )
  }
  const now = new Date()
  const data = restockDefinitions["report.restock"].output.parse({
    reportId: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 86400_000).toISOString(),
    settings,
    identityBasis: "provider",
    targetBasis: "pooled",
    channels: selected.map((option) => channel(option, evidence.connections)),
    rows,
    dependencies: snapshots.map((snapshot) => ({
      kind: "inventory_snapshot",
      id: snapshot.id,
      revision: snapshot.revision
    })),
    coverage: sources.map((source) => ({
      provider: source.source,
      coveredFrom: source.window?.from ?? null,
      coveredTo: source.window?.to ?? null,
      available: source.error === null,
      gapUnits: source.gapUnits,
      gapReasons: source.gapReasons
    }))
  })
  const warnings = [
    issue(
      "provider_identities",
      "Product, variant, and location IDs are provider identifiers scoped to the returned connection."
    ),
    ...(amazon
      ? [
          issue(
            "pooled_target",
            "Amazon uses the existing pooled stock target; separate FBA/AWD targets are not yet available."
          )
        ]
      : []),
    ...missingPools.map((pool) =>
      issue("inventory_unavailable", `${pool} inventory has not been synced; pooled coverage is incomplete.`)
    ),
    ...sources.flatMap((source) =>
      source.error || Object.keys(source.gapReasons).length
        ? [
            issue(
              source.error ? "source_unavailable" : "demand_gaps",
              `${source.source} demand is unavailable or has attribution gaps; inspect coverage.`
            )
          ]
        : []
    ),
    ...(warehouse && !result.ebayLocationId && sources.some((source) => source.source === "ebay")
      ? [issue("ebay_location_unassigned", "eBay demand could not be assigned to a warehouse.")]
      : [])
  ]
  const metadata = reportMeta.parse({
    completeness:
      sources.some((source) => source.error || Object.keys(source.gapReasons).length) ||
      rows.some((row) => row.blocked.length) ||
      snapshots.some((snapshot) => !snapshot.available || snapshot.status === "failed") ||
      missingPools.length > 0 ||
      warnings.some((warning) => warning.code === "ebay_location_unassigned")
        ? "partial"
        : "complete",
    sources: [
      ...missingPools
        .filter((pool) => !snapshots.some((snapshot) => snapshot.source === pool))
        .map((pool) => ({
          provider: "amazon",
          accountId: evidence.connections.find((account) => account.provider === "amazon")?.accountId ?? null,
          dataset: `${pool}_inventory`,
          observedAt: null,
          freshness: "unknown",
          availability: "unavailable",
          staleAfter: null,
          snapshotId: null
        })),
      ...snapshots.map((snapshot) => ({
        provider: snapshot.source === "shopify" ? "shopify" : "amazon",
        accountId: snapshot.accountId,
        dataset: `${snapshot.source}_inventory`,
        observedAt: snapshot.observedAt,
        freshness: snapshot.status === "failed" ? "stale" : "unknown",
        availability: snapshot.available ? "available" : "unavailable",
        staleAfter: null,
        snapshotId: snapshot.snapshotId
      })),
      ...sources.map((source) => ({
        provider: source.source,
        accountId: evidence.connections.find((account) => account.provider === source.source)?.accountId ?? null,
        dataset: "orders",
        observedAt: null,
        freshness: "unknown",
        availability: sourceAvailability(source),
        staleAfter: null,
        coveredFrom: source.window?.from ?? null,
        coveredTo: source.window?.to ?? null
      }))
    ],
    warnings,
    redactedFields: prices ? [] : restockPriceFields.map((field) => `rows.*.${field}`)
  })
  if (Buffer.byteLength(JSON.stringify({ data, metadata }), "utf8") > 24 * 1024 * 1024) {
    throw new CliError("result_too_large", "Narrow the report selection (maximum report size is 24 MiB).", 413)
  }
  await db().transaction(async (tx) => {
    await tx.delete(restockReports).where(and(eq(restockReports.orgId, s.org.id), lt(restockReports.expiresAt, now)))
    await tx.insert(restockReports).values({
      id: data.reportId,
      orgId: s.org.id,
      userId: s.user.id,
      createdAt: now,
      expiresAt: new Date(data.expiresAt),
      data: jsonObject.parse(data),
      metadata: jsonObject.parse(metadata)
    })
  })
  return { data, metadata }
}
