import { collectAmazonSales, collectShopifySales, salesWindowSchema } from "@repo/aisle/sales"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { requireBuyer, type Session } from "./auth"
import { amazonFor, connection, shopifyFor } from "./connections"
import { effectiveLocationClassifications } from "./inventory-location-settings"
import { attributeAmazonSales, attributeShopifySales } from "./sales-attribution"

export const demandInputSchema = z.strictObject({ source: z.enum(["shopify", "amazon"]), window: salesWindowSchema })
export class DemandAccessError extends Error {}
export async function readSalesDemand(s: Session, raw: unknown, assertActive?: () => Promise<void>) {
  requireBuyer(s)
  const { source, window } = demandInputSchema.parse(raw)
  const now = Date.now()
  if (Date.parse(window.to) > now - 120000) {
    throw new DemandAccessError("End the sales window at least two minutes before now")
  }
  if (source === "amazon" && Date.parse(window.from) < now - 730 * 86400000) {
    throw new DemandAccessError("Amazon US sales history supports the last two years")
  }
  const account = await connection(s.org.id, source)
  if (source === "shopify") {
    const scopes = new Set(account.scopes.split(/[,\s]+/))
    if (!scopes.has("read_orders") && !scopes.has("write_orders")) {
      throw new DemandAccessError("Reconnect Shopify to grant order history access")
    }
    if (Date.parse(window.from) < now - 60 * 86400000 && !scopes.has("read_all_orders")) {
      throw new DemandAccessError("This Shopify connection only permits the last 60 days of orders")
    }
  }
  const check = async () => {
    await assertActive?.()
    const [current] = await db()
      .select({ externalId: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, source)))
    if (current?.externalId !== account.externalId) {
      throw new DemandAccessError("The connected account changed. Restart the sales refresh")
    }
  }
  await check()
  let result
  if (source === "shopify") {
    const orders = await collectShopifySales(
      await shopifyFor(s.org.id, account.externalId),
      account.externalId,
      window,
      check
    )
    result = attributeShopifySales(orders, await effectiveLocationClassifications(s.org.id, account.externalId))
  } else {
    result = attributeAmazonSales(
      await collectAmazonSales(await amazonFor(s.org.id, account.externalId), window, check)
    )
  }
  await check()
  return {
    source,
    externalAccountId: account.externalId,
    window,
    observedAt: new Date().toISOString(),
    basis: "gross_fulfilled_units_for_orders_created_in_window" as const,
    quantityUnit: "sellable_unit" as const,
    collectionComplete: true as const,
    ...result
  }
}
