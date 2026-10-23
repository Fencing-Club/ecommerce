import { inventoryReadOperations, productReadOperations, type metaSchema } from "@repo/copacker-contract"
import { eq } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { can } from "@/lib/access"
import { stockScopes } from "./inventory-connectors"
import { noDefaults, readProductDefaults } from "./product-defaults"
import { productList } from "./supplier-products"
import { committedStock } from "./supplier-stock"
import type { Session } from "./workspace-session"

// Provider identifiers remain visibly scoped until the durable product-link work lands.
export const scopedReadId = (connectionId: string, accountId: string, externalId: string) =>
  [connectionId, accountId, externalId].map(encodeURIComponent).join(":")

export async function currentStock(orgId: string) {
  const accounts = await db()
    .select({ id: connections.id, provider: connections.provider, accountId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const snapshots = await db().select().from(stockSnapshots).where(eq(stockSnapshots.orgId, orgId))
  return accounts.flatMap((account) =>
    Object.entries(stockScopes).flatMap(([source, scope]) =>
      scope.provider === account.provider
        ? [
            {
              account,
              source,
              snapshot:
                snapshots.find(
                  (row) =>
                    row.source === source &&
                    row.scopeKey === scope.scopeKey &&
                    row.externalAccountId === account.accountId
                ) ?? null
            }
          ]
        : []
    )
  )
}

export function stockReadMeta(rows: Awaited<ReturnType<typeof currentStock>>): Partial<z.infer<typeof metaSchema>> {
  const missing = rows.some(({ snapshot }) => !snapshot?.data || snapshot.status === "failed")
  let completeness: "complete" | "partial" | "unavailable" = missing ? "partial" : "complete"
  if (!rows.length) {
    completeness = "unavailable"
  }
  return {
    completeness,
    sources: rows.map(({ account, source, snapshot }) => ({
      provider: account.provider,
      accountId: account.accountId,
      dataset: source,
      observedAt: snapshot?.data?.observedAt ?? null,
      freshness: "unknown",
      availability: snapshot?.data ? "available" : "unavailable",
      staleAfter: null,
      snapshotId: snapshot?.snapshotId ?? null
    })),
    warnings:
      missing || !rows.length
        ? [
            {
              code: "stock_unavailable",
              message: "Some connected inventory has no successful current snapshot.",
              path: []
            }
          ]
        : []
  }
}

export async function readProducts(s: Session) {
  type Product = z.infer<(typeof productReadOperations)["product.show"]["output"]>
  const prices = can(s, "prices")
  const items: Product[] = []
  let metadata: Partial<z.infer<typeof metaSchema>> = {}
  if (s.org.kind === "supplier") {
    for (const row of await productList(s.org.id)) {
      items.push({
        id: row.id,
        revision: row.revision,
        kind: "supplier",
        identityBasis: "copacker",
        title: row.title,
        status: row.status,
        supplierId: null,
        source: null,
        observedAt: row.updatedAt.toISOString(),
        allowedActions: ["product.show"],
        variants: row.variants.map((v) => ({
          id: v.id,
          revision: v.revision,
          productId: row.id,
          sku: v.supplierSku,
          supplierSku: v.supplierSku,
          title: v.title,
          options: v.options,
          source: null,
          price: prices && v.priceMinor !== null ? { amountMinor: v.priceMinor, currency: v.currency } : null,
          cost: null,
          priceBasis: v.priceBasis,
          piecesPerSellablePack: v.piecesPerSellablePack,
          sellablePacksPerCase: v.sellablePacksPerCase
        }))
      })
    }
  } else {
    const stocks = (await currentStock(s.org.id)).filter((row) => row.source === "shopify")
    metadata = stockReadMeta(stocks)
    for (const { account, snapshot } of stocks) {
      if (snapshot?.data?.source !== "shopify") {
        continue
      }
      const defaults = await readProductDefaults(s.org.id, account.accountId)
      for (const [productId, variants] of Map.groupBy(snapshot.data.rows, (row) => row.productId)) {
        const first = variants[0]!
        const key = scopedReadId(account.id, account.accountId, productId)
        const source = {
          connectionId: account.id,
          provider: "shopify",
          accountId: account.accountId,
          externalId: productId
        }
        items.push({
          id: key,
          revision: null,
          kind: "buyer",
          identityBasis: "provider",
          title: first.productTitle,
          status: "unknown",
          supplierId: (defaults.get(productId) ?? noDefaults).supplierId,
          source,
          observedAt: snapshot.data.observedAt,
          allowedActions: ["product.show"],
          variants: variants.map((v) => ({
            id: scopedReadId(account.id, account.accountId, v.variantId),
            revision: null,
            productId: key,
            sku: v.buyerSku,
            supplierSku: v.supplierSku ?? null,
            title: v.variantTitle,
            options: {},
            source: { ...source, externalId: v.variantId },
            price:
              prices && typeof v.priceMinor === "number" && v.priceCurrency
                ? { amountMinor: v.priceMinor, currency: v.priceCurrency }
                : null,
            cost:
              prices && typeof v.unitCostMinor === "number" && v.costCurrency
                ? { amountMinor: v.unitCostMinor, currency: v.costCurrency }
                : null,
            priceBasis: "shopify_inventory_unit",
            piecesPerSellablePack: null,
            sellablePacksPerCase: null
          }))
        })
      }
    }
  }
  if (!prices) {
    metadata.redactedFields = ["variants.price", "variants.cost"]
  }
  return { items, metadata }
}

export async function readInventory(s: Session) {
  type Balance = z.infer<(typeof inventoryReadOperations)["inventory.list"]["output"]>["items"][number]
  type Location = z.infer<(typeof inventoryReadOperations)["location.list"]["output"]>["items"][number]
  const items: Balance[] = [],
    locations = new Map<string, Location>()
  let metadata: Partial<z.infer<typeof metaSchema>> = {}
  if (s.org.kind === "supplier") {
    const locationId = `supplier:${s.org.id}`
    locations.set(locationId, {
      id: locationId,
      name: s.org.name,
      kind: "supplier",
      source: null,
      snapshotId: null,
      observedAt: null,
      quantityStates: ["on_hand", "committed", "available"],
      writable: false
    })
    const [products, commitments] = await Promise.all([productList(s.org.id), committedStock(s.org.id)])
    for (const product of products) {
      for (const v of product.variants) {
        const committed = commitments.get(v.id) ?? 0
        for (const [quantityState, value] of Object.entries({
          on_hand: v.onHand,
          committed,
          available: v.onHand - committed
        })) {
          items.push({
            variantId: v.id,
            locationId,
            sku: v.supplierSku,
            source: null,
            kind: "physical",
            quantityState,
            quantity: v.trackInventory ? value : null,
            unit: "piece",
            revision: null,
            snapshotId: null,
            observedAt: null,
            tracking: v.trackInventory,
            writable: false
          })
        }
      }
    }
  } else {
    const stocks = await currentStock(s.org.id)
    metadata = stockReadMeta(stocks)
    for (const { account, snapshot, source: stockSource } of stocks) {
      if (!snapshot?.data) {
        continue
      }
      const evidence = { snapshotId: snapshot.snapshotId, observedAt: snapshot.data.observedAt }
      const source = {
        connectionId: account.id,
        accountId: account.accountId,
        provider: account.provider,
        externalId: ""
      }
      const add = (
        externalId: string,
        sku: string | null,
        location: string,
        name: string,
        values: Record<string, number | null>,
        unit: string,
        tracking: boolean | null,
        kind: Balance["kind"]
      ) => {
        const locationId = scopedReadId(account.id, account.accountId, location)
        locations.set(locationId, {
          id: locationId,
          name,
          kind: account.provider === "amazon" ? "amazon_reported" : "merchant",
          source: { ...source, externalId: location },
          ...evidence,
          quantityStates: Object.keys(values),
          writable: false
        })
        for (const [quantityState, quantity] of Object.entries(values)) {
          items.push({
            variantId: scopedReadId(account.id, account.accountId, externalId),
            locationId,
            sku,
            source: { ...source, externalId },
            kind,
            quantityState,
            quantity,
            unit,
            revision: null,
            ...evidence,
            tracking,
            writable: false
          })
        }
      }
      if (snapshot.data.source === "shopify") {
        for (const row of snapshot.data.rows) {
          for (const level of row.levels) {
            add(
              row.variantId,
              row.buyerSku,
              level.locationId,
              level.locationName,
              {
                available: row.tracked ? level.available : null,
                on_hand: row.tracked ? level.onHand : null,
                incoming: row.tracked ? level.incoming : null,
                committed: row.tracked ? level.committed : null
              },
              row.unit,
              row.tracked,
              row.bundle ? "channel_availability" : "reported"
            )
          }
        }
      }
      if (snapshot.data.source === "awd") {
        for (const row of snapshot.data.rows) {
          add(
            row.sellerSku,
            row.sellerSku,
            stockSource,
            "Amazon AWD",
            {
              on_hand: row.onHand,
              inbound: row.inbound,
              available_distributable: row.availableDistributable,
              reserved_distributable: row.reservedDistributable,
              replenishment: row.replenishment
            },
            row.unit,
            null,
            "reported"
          )
        }
      }
      if (snapshot.data.source === "fba") {
        for (const row of snapshot.data.rows) {
          add(
            JSON.stringify([row.sellerSku, row.fnSku ?? null, row.condition ?? null]),
            row.sellerSku,
            stockSource,
            "Amazon FBA",
            {
              total: row.totalQuantity,
              fulfillable: row.inventoryDetails?.fulfillableQuantity ?? null,
              inbound_working: row.inventoryDetails?.inboundWorkingQuantity ?? null,
              inbound_shipped: row.inventoryDetails?.inboundShippedQuantity ?? null,
              inbound_receiving: row.inventoryDetails?.inboundReceivingQuantity ?? null
            },
            row.unit,
            null,
            "reported"
          )
        }
      }
    }
  }
  return { items, locations: [...locations.values()], metadata }
}
