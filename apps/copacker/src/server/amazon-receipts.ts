import { type Amazon, ProviderError } from "@repo/aisle/amazon"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { analyticsEvidence, analyticsFeeds } from "@/db/schema"
import { amazonFailureDetails } from "./amazon-diagnostics"
import { publishAnalyticsFeed } from "./analytics-feed-store"
export async function syncAmazonReceipts(
  input: {
    orgId: string
    externalAccountId: string
    revision: number
    amazon: Pick<Amazon, "fbaShipments" | "awdShipments" | "fbaReceiptItems" | "awdReceiptItems">
  },
  assertOwned: () => Promise<void>
) {
  for (const network of ["fba", "awd"] as const) {
    const dataset = `${network}_inbound_receipts`
    let stage = "list"
    try {
      await assertOwned()
      const shipments = network === "fba" ? await input.amazon.fbaShipments() : await input.amazon.awdShipments()
      const stored = await db()
        .select({ id: analyticsEvidence.sourceId, at: analyticsEvidence.observedAt })
        .from(analyticsEvidence)
        .where(
          and(
            eq(analyticsEvidence.orgId, input.orgId),
            eq(analyticsEvidence.externalAccountId, input.externalAccountId),
            eq(analyticsEvidence.source, "amazon"),
            eq(analyticsEvidence.dataset, dataset)
          )
        )
      const checked = new Map(stored.map((r) => [r.id, r.at.getTime()]))
      const wanted = shipments
        .toSorted((a, b) => (checked.get(a.shipmentId) ?? 0) - (checked.get(b.shipmentId) ?? 0))
        .slice(0, 40)
      let failed = false
      stage = "items"
      for (const shipment of wanted) {
        await assertOwned()
        const rows = []
        try {
          if (network === "fba") {
            const items = await input.amazon.fbaReceiptItems(shipment.shipmentId)
            rows.push({
              id: shipment.shipmentId,
              data: {
                ...shipment,
                network,
                items: items.map((r) => ({
                  ...r,
                  difference: r.sent === null || r.received === null ? null : r.sent - r.received
                })),
                gap: items.length ? null : "missing_items",
                candidateOnly: true
              }
            })
          } else {
            const details = await input.amazon.awdReceiptItems(shipment.shipmentId)
            rows.push({
              id: shipment.shipmentId,
              data: {
                ...shipment,
                network,
                ...details,
                gap: details.shipmentSkuQuantities ? null : "missing_sku_quantities",
                candidateOnly: true
              }
            })
          }
        } catch (error) {
          await assertOwned()
          failed = true
          console.warn("Amazon receipt collection failed", { network, stage, ...amazonFailureDetails(error) })
          // Account and rate failures affect every remaining shipment; individual bad documents do not.
          if (error instanceof ProviderError && [401, 403, 429, 503].includes(error.status)) {
            break
          }
          continue
        }
        // Persistence failures stop this network; they are not malformed provider documents.
        await publishAnalyticsFeed(input, dataset, rows, { error: failed ? "collection_failed" : null }, assertOwned)
      }
      await publishAnalyticsFeed(input, dataset, [], { error: failed ? "collection_failed" : null }, assertOwned)
    } catch (error) {
      console.warn("Amazon receipt collection failed", { network, stage, ...amazonFailureDetails(error) })
      const [prior] = await db()
        .select()
        .from(analyticsFeeds)
        .where(
          and(
            eq(analyticsFeeds.orgId, input.orgId),
            eq(analyticsFeeds.externalAccountId, input.externalAccountId),
            eq(analyticsFeeds.source, "amazon"),
            eq(analyticsFeeds.dataset, dataset)
          )
        )
      await publishAnalyticsFeed(input, dataset, [], { ...prior?.state, error: "collection_failed" }, assertOwned)
    }
  }
}
