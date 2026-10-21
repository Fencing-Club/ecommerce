import { Shopify, type ShopifyVariant } from "@repo/copacker-marketplaces/shopify"
import { and, eq } from "drizzle-orm"
import invariant from "tiny-invariant"
import { db, type Transaction } from "@/db"
import { stockSnapshots } from "@/db/schema"

export const demoShopDomain = "copacker-demo.myshopify.com"

export function demoShopConnection(domain: string, token: string) {
  if (domain !== demoShopDomain && token !== "demo") {
    return false
  }
  const environment = process.env.DEPLOYMENT_ENV
  const local =
    process.env.NODE_ENV !== "production" &&
    URL.canParse(process.env.DATABASE_URL || "") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname)
  if (
    domain !== demoShopDomain ||
    token !== "demo" ||
    (!local && !["local", "staging", "preview"].includes(environment || ""))
  ) {
    throw new Error("Demo Shopify connections are only available in local, staging and preview environments")
  }
  return true
}

// Demo data is an explicit isolated provider, never a fallback for merchant API failures.
export class DemoShopify extends Shopify {
  constructor(private orgId: string) {
    super(demoShopDomain, "demo", async () => {
      throw new Error("This Shopify operation is not supported by the demo store")
    })
  }
  private async snapshot(transaction?: Transaction) {
    const query = (transaction ?? db())
      .select()
      .from(stockSnapshots)
      .where(
        and(
          eq(stockSnapshots.orgId, this.orgId),
          eq(stockSnapshots.source, "shopify"),
          eq(stockSnapshots.externalAccountId, demoShopDomain),
          eq(stockSnapshots.scopeKey, "store")
        )
      )
    const [row] = await (transaction ? query.for("update") : query)
    if (!row?.data || row.data.source !== "shopify") {
      throw new Error("Seed the demo Shopify catalogue first")
    }
    return { ...row, data: row.data }
  }
  private async catalog(): Promise<ShopifyVariant[]> {
    return (await this.snapshot()).data.rows.map((row) => {
      invariant(row.productId, "Demo variant is missing its product")
      invariant(!row.bundle || row.bundle.components, "Demo bundle is missing its components")
      return {
        id: row.variantId,
        title: row.variantTitle || "Default Title",
        sku: row.buyerSku,
        product: { id: row.productId, title: row.productTitle || "Demo product" },
        inventoryItem: {
          id: row.inventoryItemId,
          unitCost:
            typeof row.unitCostMinor === "number" && row.costCurrency
              ? { amount: (row.unitCostMinor / 100).toFixed(2), currencyCode: row.costCurrency }
              : null
        },
        requiresComponents: Boolean(row.bundle),
        productVariantComponents: {
          nodes:
            row.bundle?.components?.map((component) => ({
              quantity: component.quantity,
              productVariant: { id: component.variantId }
            })) || [],
          pageInfo: { hasNextPage: false }
        }
      }
    })
  }
  override async variants(ids: string[]) {
    const variants = await this.catalog()
    return ids.map((id) => variants.find((variant) => variant.id === id) || null)
  }
  override async search(query: string) {
    const term = query.toLowerCase()
    return (await this.catalog())
      .filter((variant) => `${variant.sku} ${variant.title} ${variant.product.title}`.toLowerCase().includes(term))
      .slice(0, 30)
  }
  override async catalogPage(after: string | null = null) {
    return { nodes: after ? [] : await this.catalog(), pageInfo: { hasNextPage: false, endCursor: null } }
  }
  override async stock(assertActive?: () => Promise<void>) {
    await assertActive?.()
    const { data } = await this.snapshot()
    return { ...data, startedAt: new Date().toISOString(), observedAt: new Date().toISOString() }
  }
  override async metafieldValues() {
    return []
  }
  override async unitCost(inventoryItemId: string, cost: number) {
    await db().transaction(async (tx) => {
      const { id, data } = await this.snapshot(tx)
      if (
        !Number.isSafeInteger(cost) ||
        cost < 0 ||
        !data.rows.some((row) => row.inventoryItemId === inventoryItemId)
      ) {
        throw new Error("Invalid demo inventory cost")
      }
      await tx
        .update(stockSnapshots)
        .set({
          data: {
            ...data,
            rows: data.rows.map((row) =>
              row.inventoryItemId === inventoryItemId ? { ...row, unitCostMinor: cost, costCurrency: "USD" } : row
            )
          }
        })
        .where(eq(stockSnapshots.id, id))
    })
  }
}
